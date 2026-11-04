import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationChannel,
  type NotificationPreference,
  type NotificationPreferenceUpdateInput,
} from '@vistay/admin-api-client'

interface NotificationPreferencesProps {
  graphqlUrl: string
  accessToken: string
  pushEnabled?: boolean
}

interface PreferenceDraft {
  enabled: boolean
  quietHours: { start: string; end: string } | null
  timeZoneId: string
}

type LoadStatus = 'loading' | 'ready' | 'error'

const channelLabels: Record<NotificationChannel, string> = {
  IN_APP: 'Trong ung dung',
  EMAIL: 'Email',
  PUSH: 'Push',
}

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `preference-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function validTimeZone(value: string): boolean {
  if (value === 'UTC') return true
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return value.includes('/')
  } catch {
    return false
  }
}

function draftFromPreference(preference: NotificationPreference): PreferenceDraft {
  return {
    enabled: preference.enabled,
    quietHours: preference.quietHours ? { ...preference.quietHours } : null,
    timeZoneId: preference.timeZoneId,
  }
}

function PreferenceRow({
  preference,
  draft,
  pushEnabled,
  onChange,
}: {
  preference: NotificationPreference
  draft: PreferenceDraft
  pushEnabled: boolean
  onChange: (patch: Partial<PreferenceDraft>) => void
}) {
  const locked = preference.required || (preference.channel === 'PUSH' && !pushEnabled)
  const toggleQuietHours = () => onChange({ quietHours: draft.quietHours ? null : { start: '22:00', end: '07:00' } })
  return (
    <article className="preference-row">
      <div className="preference-channel">
        <span className="preference-icon">{preference.channel === 'EMAIL' ? '@' : preference.channel === 'PUSH' ? '↗' : '•'}</span>
        <div><strong>{channelLabels[preference.channel]}</strong><span>{preference.notificationType}</span></div>
      </div>
      <div className="preference-control">
        <label className="preference-toggle"><input checked={preference.required ? true : draft.enabled} disabled={locked} onChange={(event) => onChange({ enabled: event.target.checked })} type="checkbox" /><span>{preference.required ? 'Bat buoc' : draft.enabled ? 'Dang bat' : 'Dang tat'}</span></label>
        {preference.required && <small className="preference-lock">Kenh bat buoc, khong the tat</small>}
        {preference.channel === 'PUSH' && !pushEnabled && <small className="preference-lock">Push dang cho feature flag</small>}
      </div>
      <div className="quiet-hours">
        <label className="preference-toggle"><input checked={Boolean(draft.quietHours)} disabled={preference.required} onChange={toggleQuietHours} type="checkbox" /><span>Gio yen lang</span></label>
        <div className="quiet-inputs">
          <input aria-label={`${channelLabels[preference.channel]} bat dau gio yen lang`} disabled={!draft.quietHours || preference.required} onChange={(event) => onChange({ quietHours: draft.quietHours ? { ...draft.quietHours, start: event.target.value } : null })} placeholder="22:00" type="time" value={draft.quietHours?.start ?? ''} />
          <span>→</span>
          <input aria-label={`${channelLabels[preference.channel]} ket thuc gio yen lang`} disabled={!draft.quietHours || preference.required} onChange={(event) => onChange({ quietHours: draft.quietHours ? { ...draft.quietHours, end: event.target.value } : null })} placeholder="07:00" type="time" value={draft.quietHours?.end ?? ''} />
        </div>
      </div>
      <label className="preference-timezone">Mui gio<input aria-label={`${channelLabels[preference.channel]} mui gio`} disabled={preference.required} onChange={(event) => onChange({ timeZoneId: event.target.value })} value={draft.timeZoneId} /></label>
    </article>
  )
}

export function NotificationPreferences({ graphqlUrl, accessToken, pushEnabled = import.meta.env.VITE_NOTIFICATION_PUSH_ENABLED === 'true' }: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [drafts, setDrafts] = useState<Record<string, PreferenceDraft>>({})
  const [revision, setRevision] = useState(0)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    const controller = new AbortController()
    void fetchNotificationPreferences(graphqlUrl, accessToken, controller.signal)
      .then((connection) => {
        setPreferences(connection.nodes)
        setRevision(connection.revision)
        setDrafts(Object.fromEntries(connection.nodes.map((preference) => [preference.id, draftFromPreference(preference)])))
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : 'Khong the tai cai dat thong bao')
        setStatus('error')
    })
    return () => controller.abort()
  }, [accessToken, graphqlUrl])

  useEffect(() => load(), [load])

  const retry = () => {
    setStatus('loading')
    setError(undefined)
    load()
  }

  const changed = useMemo(() => preferences.some((preference) => {
    const draft = drafts[preference.id]
    return draft && JSON.stringify(draft) !== JSON.stringify(draftFromPreference(preference))
  }), [drafts, preferences])

  const updateDraft = (id: string, patch: Partial<PreferenceDraft>) => {
    setSaved(false)
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  const save = async () => {
    setSaved(false)
    setError(undefined)
    const updates: NotificationPreferenceUpdateInput[] = []
    for (const preference of preferences) {
      const draft = drafts[preference.id]
      if (!draft) continue
      if (!validTimeZone(draft.timeZoneId.trim())) {
        setError(`Mui gio khong hop le: ${draft.timeZoneId}`)
        return
      }
      if (draft.quietHours && (!validTime(draft.quietHours.start) || !validTime(draft.quietHours.end) || draft.quietHours.start === draft.quietHours.end)) {
        setError(`Khoang gio yen lang cua ${channelLabels[preference.channel]} khong hop le`)
        return
      }
      updates.push({
        notificationType: preference.notificationType,
        channel: preference.channel,
        enabled: preference.required ? true : draft.enabled,
        quietHours: draft.quietHours,
        timeZoneId: draft.timeZoneId.trim(),
        expectedVersion: preference.revision,
      })
    }
    if (!updates.length) return
    setSaving(true)
    try {
      const connection = await updateNotificationPreferences(graphqlUrl, accessToken, { updates, idempotencyKey: idempotencyKey() })
      setPreferences(connection.nodes)
      setRevision(connection.revision)
      setDrafts(Object.fromEntries(connection.nodes.map((preference) => [preference.id, draftFromPreference(preference)])))
      setSaved(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Khong the luu cai dat thong bao')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="notification-preferences-title" className="notification-preferences">
      <header className="preferences-heading">
        <div><p className="eyebrow">CHANNEL POLICY</p><h2 id="notification-preferences-title">Kenh nhan thong bao</h2><p>Revision {revision} · Cau hinh chi ap dung cho tai khoan cua ban.</p></div>
        <button className="primary-button" disabled={saving || !changed || status !== 'ready'} onClick={() => void save()} type="button">{saving ? 'Dang luu...' : 'Luu cai dat'}</button>
      </header>
      {saved && <div className="success-banner" role="status">Da luu revision {revision}. Khong co thay doi trung lap.</div>}
      {error && <div className="stream-error" role="alert"><span>{error}</span><button onClick={retry} type="button">Thu lai</button></div>}
      {status === 'loading' && <div className="empty-state">Dang tai chinh sach kenh...</div>}
      {status === 'ready' && preferences.length === 0 && <div className="empty-state"><h3>Chua co cau hinh kenh</h3><p>Service chua tra ve preference cho tai khoan nay.</p></div>}
      {status === 'ready' && preferences.length > 0 && <div className="preference-list">{preferences.map((preference) => <PreferenceRow key={preference.id} preference={preference} draft={drafts[preference.id] ?? draftFromPreference(preference)} onChange={(patch) => updateDraft(preference.id, patch)} pushEnabled={pushEnabled} />)}</div>}
    </section>
  )
}
