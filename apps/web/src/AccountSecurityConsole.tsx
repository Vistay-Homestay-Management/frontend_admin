import { useState, type FormEvent } from 'react'
import {
  changeAccountLifecycle,
  fetchAccountSecurity,
  fetchAccountSecurityEvents,
  type AccountLifecycleAction,
  type AccountLifecycleEvent,
  type AccountSecurityView,
  type BackofficeViewer,
} from '@vistay/admin-api-client'

interface Props { authApiUrl: string; accessToken: string; viewer: BackofficeViewer }

export function AccountSecurityConsole({ authApiUrl, accessToken, viewer }: Props) {
  const [accountId, setAccountId] = useState('')
  const [reason, setReason] = useState('Điều tra và xử lý sự kiện bảo mật')
  const [account, setAccount] = useState<AccountSecurityView>()
  const [events, setEvents] = useState<AccountLifecycleEvent[]>([])
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const canRead = viewer.permissions.includes('account:read')

  async function load(event?: FormEvent) {
    event?.preventDefault()
    if (!accountId.trim()) return
    setBusy(true); setError(undefined)
    try {
      const [state, audit] = await Promise.all([
        fetchAccountSecurity(authApiUrl, accessToken, accountId.trim()),
        viewer.permissions.includes('audit:read')
          ? fetchAccountSecurityEvents(authApiUrl, accessToken, accountId.trim()) : Promise.resolve([]),
      ])
      setAccount(state); setEvents(audit)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu') }
    finally { setBusy(false) }
  }

  async function change(action: AccountLifecycleAction) {
    if (!account || busy) return
    setBusy(true); setError(undefined)
    try {
      await changeAccountLifecycle(authApiUrl, accessToken, account.account.id, action,
        account.account.version, reason.trim(), crypto.randomUUID())
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể cập nhật tài khoản') }
    finally { setBusy(false) }
  }

  if (!canRead) return null
  return (
    <section className="account-security-console" id="account-security">
      <div><p className="eyebrow">IDENTITY SECURITY</p><h2>Khóa, phục hồi & điều tra</h2><p>Trạng thái nghiệp vụ được audit tại Authentication; Keycloak vẫn sở hữu credential, brute-force lock và phiên đăng nhập.</p></div>
      <form onSubmit={(event) => void load(event)}>
        <label>Target account ID<input required value={accountId} onChange={(event) => setAccountId(event.target.value)} /></label>
        <button className="primary-button" disabled={busy}>{busy ? 'Đang xử lý…' : 'Tải trạng thái'}</button>
        {error && <p className="form-message error" role="alert">{error}</p>}
        {account && <>
          <div className="security-state"><strong>{account.account.status}</strong><span>v{account.account.version}</span><span>{account.account.email}</span></div>
          <div className="security-state"><strong>{account.bruteForce.failureCount} lỗi đăng nhập</strong><span>{account.bruteForce.temporarilyLocked ? 'Keycloak đang tạm khóa' : 'Không bị brute-force lock'}</span><span>{account.bruteForce.lastFailureIp ?? 'Không có IP'}</span></div>
          <label>Lý do<textarea minLength={8} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <div className="lifecycle-actions">
            {viewer.permissions.includes('account:suspend') && <><button type="button" onClick={() => void change('LOCK')} disabled={busy || account.account.status !== 'ACTIVE'}>Khóa</button><button type="button" onClick={() => void change('DISABLE')} disabled={busy || account.account.status === 'DISABLED'}>Vô hiệu hóa</button></>}
            {viewer.permissions.includes('account:unlock') && <button type="button" onClick={() => void change('RECOVER')} disabled={busy || !['LOCKED', 'DISABLED'].includes(account.account.status)}>Phục hồi</button>}
          </div>
          <div className="security-events">{events.map((item) => <article key={item.idempotencyKey}><strong>{item.action}: {item.previousStatus} → {item.resultingStatus}</strong><span>{item.reason}</span><small>{new Date(item.completedAt).toLocaleString('vi-VN')} · {item.correlationId}</small></article>)}</div>
        </>}
      </form>
    </section>
  )
}
