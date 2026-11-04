import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchNotificationTemplates,
  previewNotificationTemplate,
  publishNotificationTemplate,
  retireNotificationTemplate,
  saveNotificationTemplateDraft,
  type NotificationChannel,
  type NotificationTemplate,
  type NotificationTemplateStatus,
} from '@vistay/admin-api-client'

interface NotificationTemplateWorkspaceProps {
  graphqlUrl: string
  accessToken: string
}

interface TemplateDraft {
  templateKey: string
  channel: NotificationChannel
  locale: string
  subject: string
  body: string
  requiredVariables: string
  policyRevision: string
  expectedVersion: number | null
}

const channels: NotificationChannel[] = ['IN_APP', 'EMAIL', 'PUSH']
const statuses: Array<NotificationTemplateStatus | 'ALL'> = ['ALL', 'DRAFT', 'PUBLISHED', 'RETIRED']

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `template-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function draftFromTemplate(template: NotificationTemplate): TemplateDraft {
  return {
    templateKey: template.templateKey,
    channel: template.channel,
    locale: template.locale,
    subject: template.subject ?? '',
    body: template.body ?? '',
    requiredVariables: template.requiredVariables.join(', '),
    policyRevision: String(template.policyRevision ?? 1),
    expectedVersion: template.revision,
  }
}

function variablesFromDraft(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))]
}

function validateDraft(draft: TemplateDraft): string | undefined {
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i.test(draft.templateKey.trim())) return 'Template key chi duoc dung chu, so, dau cham, gach ngang hoac gach duoi.'
  if (!draft.locale.trim()) return 'Locale khong duoc de trong.'
  if (!draft.body.trim()) return 'Body template khong duoc de trong.'
  const variables = variablesFromDraft(draft.requiredVariables)
  if (variables.some((variable) => !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(variable))) return 'Ten bien khong hop le.'
  const policyRevision = Number(draft.policyRevision)
  if (!Number.isInteger(policyRevision) || policyRevision < 1) return 'Policy revision phai la so nguyen duong.'
}

function syntheticVariables(draft: TemplateDraft) {
  return variablesFromDraft(draft.requiredVariables).map((name) => ({ name, value: `sample-${name}` }))
}

function mergeTemplate(templates: NotificationTemplate[], incoming: NotificationTemplate): NotificationTemplate[] {
  const index = templates.findIndex((template) => template.id === incoming.id)
  if (index < 0) return [incoming, ...templates]
  const next = [...templates]
  next[index] = incoming
  return next
}

export function NotificationTemplateWorkspace({ graphqlUrl, accessToken }: NotificationTemplateWorkspaceProps) {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [channelFilter, setChannelFilter] = useState<NotificationChannel | 'ALL'>('ALL')
  const [statusFilter, setStatusFilter] = useState<NotificationTemplateStatus | 'ALL'>('ALL')
  const [draft, setDraft] = useState<TemplateDraft>({ templateKey: 'security.alert', channel: 'EMAIL', locale: 'vi-VN', subject: '', body: '', requiredVariables: '', policyRevision: '1', expectedVersion: null })
  const [preview, setPreview] = useState<{ subject?: string | null; body: string; revision: number }>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string>()
  const [action, setAction] = useState<'idle' | 'saving' | 'previewing' | 'publishing' | 'retiring'>('idle')
  const [publishConfirmed, setPublishConfirmed] = useState(false)
  const [retireReason, setRetireReason] = useState('')

  const selected = templates.find((template) => template.id === selectedId)
  const load = useCallback(() => {
    const controller = new AbortController()
    void fetchNotificationTemplates(graphqlUrl, accessToken, {
      limit: 50,
      channel: channelFilter === 'ALL' ? undefined : channelFilter,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
    }, controller.signal)
      .then((page) => {
        setTemplates(page.nodes)
        const first = page.nodes[0]
        setSelectedId(first?.id)
        if (first) setDraft(draftFromTemplate(first))
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : 'Khong the tai template')
        setStatus('error')
    })
    return () => controller.abort()
  }, [accessToken, channelFilter, graphqlUrl, statusFilter])

  useEffect(() => load(), [load])

  const retry = () => {
    setStatus('loading')
    setError(undefined)
    load()
  }

  const changeChannelFilter = (value: NotificationChannel | 'ALL') => {
    setStatus('loading')
    setError(undefined)
    setChannelFilter(value)
  }

  const changeStatusFilter = (value: NotificationTemplateStatus | 'ALL') => {
    setStatus('loading')
    setError(undefined)
    setStatusFilter(value)
  }

  const updateDraft = (patch: Partial<TemplateDraft>) => {
    setPublishConfirmed(false)
    setPreview(undefined)
    setDraft((current) => ({ ...current, ...patch }))
  }

  const selectTemplate = (template: NotificationTemplate) => {
    setSelectedId(template.id)
    setDraft(draftFromTemplate(template))
    setPreview(undefined)
    setPublishConfirmed(false)
    setError(undefined)
  }

  const runAction = async (kind: 'draft' | 'preview' | 'publish' | 'retire') => {
    setError(undefined)
    const validation = validateDraft(draft)
    if (kind !== 'retire' && validation) {
      setError(validation)
      return
    }
    if (kind === 'retire' && (!selected || retireReason.trim().length < 10)) {
      setError('Can ly do retire phai co it nhat 10 ky tu.')
      return
    }
    if (kind === 'publish' && !publishConfirmed) {
      setError('Hay xac nhan publication revision truoc khi publish.')
      return
    }
    setAction(kind === 'draft' ? 'saving' : kind === 'preview' ? 'previewing' : kind === 'publish' ? 'publishing' : 'retiring')
    try {
      if (kind === 'preview') {
        const result = await previewNotificationTemplate(graphqlUrl, accessToken, {
          templateKey: draft.templateKey.trim(), channel: draft.channel, locale: draft.locale.trim(), variables: syntheticVariables(draft),
        })
        setPreview(result)
      } else if (kind === 'retire' && selected) {
        const result = await retireNotificationTemplate(graphqlUrl, accessToken, {
          templateId: selected.id, expectedVersion: selected.revision, reason: retireReason.trim(), idempotencyKey: idempotencyKey(),
        })
        setTemplates((current) => mergeTemplate(current, result))
        setSelectedId(result.id)
        setRetireReason('')
      } else {
        const input = {
          templateKey: draft.templateKey.trim(), channel: draft.channel, locale: draft.locale.trim(),
          subject: draft.subject.trim() || null, body: draft.body, requiredVariables: variablesFromDraft(draft.requiredVariables),
          policyRevision: Number(draft.policyRevision), expectedVersion: draft.expectedVersion, idempotencyKey: idempotencyKey(),
        }
        const result = kind === 'draft'
          ? await saveNotificationTemplateDraft(graphqlUrl, accessToken, input)
          : await publishNotificationTemplate(graphqlUrl, accessToken, input)
        setTemplates((current) => mergeTemplate(current, result))
        setSelectedId(result.id)
        setDraft(draftFromTemplate(result))
        setPublishConfirmed(false)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Thao tac template that bai')
    } finally {
      setAction('idle')
    }
  }

  const variableNames = useMemo(() => variablesFromDraft(draft.requiredVariables), [draft.requiredVariables])
  const diff = selected ? [
    ['Subject', selected.subject ?? '', draft.subject],
    ['Body', selected.body ?? '', draft.body],
    ['Variables', selected.requiredVariables.join(', '), variableNames.join(', ')],
    ['Policy revision', String(selected.policyRevision), draft.policyRevision],
  ].filter(([, before, after]) => before !== after) : []

  return (
    <section aria-labelledby="notification-template-title" className="notification-template-workspace">
      <header className="template-heading">
        <div><p className="eyebrow">TEMPLATE CONTROL PLANE</p><h2 id="notification-template-title">Template thong bao</h2><p>Moi revision la mot artifact doc lap; preview chi dung du lieu tong hop.</p></div>
        <span className="template-safety">No production recipient data</span>
      </header>
      <div className="template-toolbar">
        <label>Channel<select value={channelFilter} onChange={(event) => changeChannelFilter(event.target.value as NotificationChannel | 'ALL')}><option value="ALL">Tat ca channel</option>{channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select></label>
        <label>Status<select value={statusFilter} onChange={(event) => changeStatusFilter(event.target.value as NotificationTemplateStatus | 'ALL')}><option value="ALL">Tat ca status</option>{statuses.slice(1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <button className="secondary-button" onClick={retry} type="button">Tai lai</button>
      </div>
      {error && <div className="stream-error" role="alert"><span>{error}</span><button onClick={retry} type="button">Thu lai</button></div>}
      {status === 'loading' && <div className="empty-state">Dang tai revision template...</div>}
      {status === 'ready' && <div className="template-grid">
        <aside className="template-list" aria-label="Danh sach template">
          {templates.length === 0 && <div className="empty-state"><h3>Chua co template</h3><p>Tao draft dau tien tu form ben phai.</p></div>}
          {templates.map((template) => <button className={`template-list-item ${template.id === selectedId ? 'selected' : ''}`} key={template.id} onClick={() => selectTemplate(template)} type="button"><span><strong>{template.templateKey}</strong><small>{template.channel} · {template.locale}</small></span><em>{template.status} v{template.revision}</em></button>)}
          <button className="new-template-button" onClick={() => { setSelectedId(undefined); setDraft({ templateKey: '', channel: 'EMAIL', locale: 'vi-VN', subject: '', body: '', requiredVariables: '', policyRevision: '1', expectedVersion: null }); setPreview(undefined) }} type="button">+ Tao draft moi</button>
        </aside>
        <div className="template-editor">
          <div className="template-editor-heading"><div><span className="eyebrow">{selected ? `${selected.status} / REVISION ${selected.revision}` : 'DRAFT CHUA LUU'}</span><h3>{draft.templateKey || 'Template moi'}</h3></div><span className="policy-badge">Policy v{draft.policyRevision}</span></div>
          <div className="template-form-grid">
            <label>Template key<input value={draft.templateKey} onChange={(event) => updateDraft({ templateKey: event.target.value })} /></label>
            <label>Channel<select value={draft.channel} onChange={(event) => updateDraft({ channel: event.target.value as NotificationChannel })}>{channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select></label>
            <label>Locale<input value={draft.locale} onChange={(event) => updateDraft({ locale: event.target.value })} /></label>
            <label>Policy revision<input min="1" onChange={(event) => updateDraft({ policyRevision: event.target.value })} type="number" value={draft.policyRevision} /></label>
            <label>Required variables<input placeholder="name, bookingId" value={draft.requiredVariables} onChange={(event) => updateDraft({ requiredVariables: event.target.value })} /></label>
            <label>Subject<input value={draft.subject} onChange={(event) => updateDraft({ subject: event.target.value })} /></label>
            <label className="template-wide">Body<textarea rows={8} value={draft.body} onChange={(event) => updateDraft({ body: event.target.value })} /></label>
          </div>
          <div className="template-actions"><button className="secondary-button" disabled={action !== 'idle'} onClick={() => void runAction('draft')} type="button">{action === 'saving' ? 'Dang luu...' : 'Luu draft'}</button><button className="secondary-button" disabled={action !== 'idle'} onClick={() => void runAction('preview')} type="button">{action === 'previewing' ? 'Dang preview...' : 'Preview tong hop'}</button><label className="publish-confirm"><input checked={publishConfirmed} onChange={(event) => setPublishConfirmed(event.target.checked)} type="checkbox" /> Xac nhan publication revision</label><button className="primary-button" disabled={action !== 'idle'} onClick={() => void runAction('publish')} type="button">{action === 'publishing' ? 'Dang publish...' : 'Publish revision'}</button></div>
          {selected && <div className="template-retire"><input aria-label="Ly do retire" onChange={(event) => setRetireReason(event.target.value)} placeholder="Ly do retire (toi thieu 10 ky tu)" value={retireReason} /><button className="danger-button" disabled={action !== 'idle' || selected.status === 'RETIRED'} onClick={() => void runAction('retire')} type="button">Retire</button></div>}
          {preview && <section aria-label="Template preview" className="template-preview"><span>PREVIEW v{preview.revision} · synthetic variables only</span><h4>{preview.subject || '(Khong co subject)'}</h4><p>{preview.body}</p></section>}
          <section aria-label="Template version diff" className="template-diff"><div><span className="eyebrow">VERSION DIFF</span><h4>{diff.length ? `${diff.length} thay doi chua luu` : 'Khong co thay doi so voi revision da chon'}</h4></div>{diff.map(([field, before, after]) => <div className="diff-row" key={field}><strong>{field}</strong><del>{before || '(trong)'}</del><ins>{after || '(trong)'}</ins></div>)}</section>
          <div className="policy-view"><strong>Channel policy</strong><span>{draft.channel} · Policy revision {draft.policyRevision}</span><small>Publication va preference deu gui expectedVersion/idempotencyKey; stale revision se hien loi va khong optimistic update.</small></div>
        </div>
      </div>}
    </section>
  )
}
