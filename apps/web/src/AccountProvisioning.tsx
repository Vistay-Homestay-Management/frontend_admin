import { useState, type FormEvent } from 'react'
import {
  provisionBackofficeAccount,
  type BackofficeViewer,
  type ProvisionedBackofficeAccount,
} from '@vistay/admin-api-client'

interface AccountProvisioningProps {
  authApiUrl: string
  accessToken: string
  viewer: BackofficeViewer
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Không thể tạo tài khoản Backoffice.'
  if (error.message === 'BACKOFFICE_ACCOUNT_ALREADY_EXISTS') {
    return 'Email này đã thuộc một tài khoản Backoffice.'
  }
  return error.message
}

export function AccountProvisioning({ authApiUrl, accessToken, viewer }: AccountProvisioningProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string>()
  const [account, setAccount] = useState<ProvisionedBackofficeAccount>()
  const canProvision = viewer.permissions.includes('account:provision')
  const valid = email.trim().length > 3
    && fullName.trim().length > 0
    && temporaryPassword.length >= 12
    && reason.trim().length >= 8

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canProvision || !valid || status === 'saving') return
    setStatus('saving')
    setMessage(undefined)
    setAccount(undefined)
    try {
      const created = await provisionBackofficeAccount(
        authApiUrl,
        accessToken,
        crypto.randomUUID(),
        {
          email: email.trim(),
          fullName: fullName.trim(),
          temporaryPassword,
          reason: reason.trim(),
        },
      )
      setAccount(created)
      setTemporaryPassword('')
      setStatus('success')
      setMessage('Tài khoản đã hoạt động. Người dùng phải đổi mật khẩu ở lần đăng nhập đầu tiên.')
    } catch (error) {
      setStatus('error')
      setMessage(errorMessage(error))
    }
  }

  return (
    <section className="provisioning-console" id="accounts">
      <div className="provisioning-copy">
        <p className="eyebrow">CONTROLLED ONBOARDING</p>
        <h2>Cấp tài khoản.<br />Không mở đăng ký công khai.</h2>
        <p>Mỗi yêu cầu lưu người thực hiện, lý do, correlation ID và idempotency key. Mật khẩu tạm thời chỉ đi tới Keycloak, không lưu trong database dịch vụ.</p>
        <div className="provisioning-facts">
          <span><strong>ACTIVE</strong> Kích hoạt ngay</span>
          <span><strong>UPDATE_PASSWORD</strong> Đổi mật khẩu lần đầu</span>
          <span><strong>Kafka</strong> Đồng bộ hồ sơ bất đồng bộ</span>
        </div>
      </div>

      <form className="provisioning-form" onSubmit={(event) => void submit(event)}>
        <div><p className="eyebrow">NEW BACKOFFICE ACCOUNT</p><h3>Thông tin khởi tạo</h3></div>
        {!canProvision && <p className="form-message error" role="alert">Bạn thiếu quyền account:provision@ALL.</p>}
        <label>Họ và tên<input autoComplete="name" maxLength={180} onChange={(event) => setFullName(event.target.value)} value={fullName} /></label>
        <label>Email<input autoComplete="email" inputMode="email" type="email" onChange={(event) => setEmail(event.target.value)} value={email} /></label>
        <label>Mật khẩu tạm thời<input autoComplete="new-password" minLength={12} maxLength={128} type="password" onChange={(event) => setTemporaryPassword(event.target.value)} value={temporaryPassword} /></label>
        <label>Lý do cấp tài khoản<textarea minLength={8} maxLength={500} onChange={(event) => setReason(event.target.value)} value={reason} /></label>
        {message && <p className={`form-message ${status}`} role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
        {account && <p className="created-account"><strong>{account.email}</strong><span>Account ID · {account.id}</span></p>}
        <button className="primary-button" disabled={!canProvision || !valid || status === 'saving'} type="submit">
          {status === 'saving' ? 'Đang tạo tài khoản…' : 'Tạo và kích hoạt'}
        </button>
      </form>
    </section>
  )
}
