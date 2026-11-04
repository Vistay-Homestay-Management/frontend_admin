import { useCallback, useEffect, useState } from 'react'
import { fetch as expoFetch } from 'expo/fetch'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationChannel,
  type NotificationPreference,
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
const mobileFetch = expoFetch as typeof globalThis.fetch
const channelLabels: Record<NotificationChannel, string> = { IN_APP: 'Trong ung dung', EMAIL: 'Email', PUSH: 'Push' }

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `mobile-preference-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function draftFromPreference(preference: NotificationPreference): PreferenceDraft {
  return { enabled: preference.enabled, quietHours: preference.quietHours ? { ...preference.quietHours } : null, timeZoneId: preference.timeZoneId }
}

function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function validTimeZone(value: string): boolean {
  return value === 'UTC' || /^[A-Za-z]+(?:[_-][A-Za-z]+)*\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(value)
}

export function NotificationPreferences({ graphqlUrl, accessToken, pushEnabled = process.env.EXPO_PUBLIC_NOTIFICATION_PUSH_ENABLED === 'true' }: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([])
  const [drafts, setDrafts] = useState<Record<string, PreferenceDraft>>({})
  const [revision, setRevision] = useState(0)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    const controller = new AbortController()
    void fetchNotificationPreferences(graphqlUrl, accessToken, controller.signal, mobileFetch)
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

  const updateDraft = (id: string, patch: Partial<PreferenceDraft>) => {
    setSaved(false)
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  const save = async () => {
    setError(undefined)
    const updates = []
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
      updates.push({ notificationType: preference.notificationType, channel: preference.channel, enabled: preference.required ? true : draft.enabled, quietHours: draft.quietHours, timeZoneId: draft.timeZoneId.trim(), expectedVersion: preference.revision })
    }
    if (!updates.length) return
    setSaving(true)
    try {
      const connection = await updateNotificationPreferences(graphqlUrl, accessToken, { updates, idempotencyKey: idempotencyKey() }, undefined, mobileFetch)
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
    <View accessibilityLabel="Cai dat thong bao" style={styles.container}>
      <View style={styles.heading}><View style={styles.headingCopy}><Text style={styles.eyebrow}>CHANNEL POLICY</Text><Text style={styles.title}>Kenh nhan thong bao</Text><Text style={styles.summary}>Revision {revision} · Chi ap dung cho tai khoan cua ban.</Text></View><Pressable accessibilityRole="button" disabled={saving || status !== 'ready'} onPress={() => void save()} style={styles.save}><Text style={styles.saveText}>{saving ? 'Dang luu...' : 'Luu cai dat'}</Text></Pressable></View>
      {saved && <Text accessibilityRole="status" style={styles.success}>Da luu revision {revision}.</Text>}
      {error && <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={retry}><Text style={styles.retry}>Thu lai</Text></Pressable></View>}
      {status === 'loading' && <Text style={styles.empty}>Dang tai chinh sach kenh...</Text>}
      {status === 'ready' && preferences.length === 0 && <Text style={styles.empty}>Chua co cau hinh kenh.</Text>}
      {status === 'ready' && preferences.map((preference) => {
        const draft = drafts[preference.id] ?? draftFromPreference(preference)
        const locked = preference.required || (preference.channel === 'PUSH' && !pushEnabled)
        return (
          <View key={preference.id} style={styles.row}>
            <View style={styles.rowHeading}><Text style={styles.channel}>{channelLabels[preference.channel]}</Text><Text style={styles.type}>{preference.notificationType}</Text><Text style={styles.revision}>v{preference.revision}</Text></View>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: preference.required ? true : draft.enabled, disabled: locked }} disabled={locked} onPress={() => updateDraft(preference.id, { enabled: !draft.enabled })} style={[styles.toggle, (preference.required || draft.enabled) && styles.toggleActive]}><Text style={[styles.toggleText, (preference.required || draft.enabled) && styles.toggleTextActive]}>{preference.required ? 'Bat buoc' : draft.enabled ? 'Dang bat' : 'Dang tat'}</Text></Pressable>
            {preference.required && <Text style={styles.lock}>Kenh bat buoc, khong the tat</Text>}
            {preference.channel === 'PUSH' && !pushEnabled && <Text style={styles.lock}>Push dang cho feature flag</Text>}
            <View style={styles.quietRow}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(draft.quietHours), disabled: preference.required }} disabled={preference.required} onPress={() => updateDraft(preference.id, { quietHours: draft.quietHours ? null : { start: '22:00', end: '07:00' } })} style={styles.quietToggle}><Text style={styles.quietLabel}>Gio yen lang</Text></Pressable><TextInput accessibilityLabel={`${channelLabels[preference.channel]} bat dau`} editable={Boolean(draft.quietHours) && !preference.required} onChangeText={(start) => updateDraft(preference.id, { quietHours: draft.quietHours ? { ...draft.quietHours, start } : null })} placeholder="22:00" placeholderTextColor="#8c968f" style={styles.timeInput} value={draft.quietHours?.start ?? ''} /><Text style={styles.arrow}>→</Text><TextInput accessibilityLabel={`${channelLabels[preference.channel]} ket thuc`} editable={Boolean(draft.quietHours) && !preference.required} onChangeText={(end) => updateDraft(preference.id, { quietHours: draft.quietHours ? { ...draft.quietHours, end } : null })} placeholder="07:00" placeholderTextColor="#8c968f" style={styles.timeInput} value={draft.quietHours?.end ?? ''} /></View>
            <TextInput accessibilityLabel={`${channelLabels[preference.channel]} mui gio`} editable={!preference.required} onChangeText={(timeZoneId) => updateDraft(preference.id, { timeZoneId })} style={styles.zoneInput} value={draft.timeZoneId} />
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginTop: 30, paddingBottom: 28 },
  heading: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  headingCopy: { flex: 1 },
  eyebrow: { color: '#68756e', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  title: { marginTop: 7, color: '#17231d', fontSize: 27, lineHeight: 30, fontWeight: '700', letterSpacing: -1.1 },
  summary: { marginTop: 7, color: '#68756e', fontSize: 10 },
  save: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10, backgroundColor: '#17231d' },
  saveText: { color: 'white', fontSize: 10, fontWeight: '700' },
  success: { marginTop: 12, padding: 11, borderRadius: 9, backgroundColor: '#e4f1d8', color: '#426d3d', fontSize: 11 },
  error: { marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: '#fff0ec', flexDirection: 'row', gap: 10 },
  errorText: { flex: 1, color: '#a74235', fontSize: 11, lineHeight: 16 },
  retry: { color: '#a74235', fontSize: 10, fontWeight: '700' },
  empty: { marginTop: 14, padding: 24, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 16, backgroundColor: '#fffef9', color: '#68756e', fontSize: 12, textAlign: 'center' },
  row: { marginTop: 12, padding: 16, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 16, backgroundColor: '#fffef9' },
  rowHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  channel: { color: '#17231d', fontSize: 13, fontWeight: '700' },
  type: { flex: 1, color: '#68756e', fontSize: 10 },
  revision: { color: '#6c8b48', fontSize: 10, fontWeight: '700' },
  toggle: { alignSelf: 'flex-start', marginTop: 13, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: '#e6e5dd' },
  toggleActive: { backgroundColor: '#d9ff63' },
  toggleText: { color: '#52645a', fontSize: 10, fontWeight: '700' },
  toggleTextActive: { color: '#17231d' },
  lock: { marginTop: 7, color: '#876024', fontSize: 10 },
  quietRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  quietToggle: { flex: 1 },
  quietLabel: { color: '#68756e', fontSize: 10, fontWeight: '700' },
  timeInput: { width: 58, paddingHorizontal: 6, paddingVertical: 7, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 7, color: '#17231d', fontSize: 10, textAlign: 'center' },
  arrow: { color: '#879189', fontSize: 11 },
  zoneInput: { marginTop: 10, paddingHorizontal: 8, paddingVertical: 8, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 7, color: '#17231d', fontSize: 10 },
})
