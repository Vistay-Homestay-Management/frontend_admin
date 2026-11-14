import { useState, type FormEvent } from 'react'
import {
  inviteBackofficeAccount,
  provisionBackofficeAccount,
  type BackofficeViewer,
  type InvitedBackofficeAccount,
  type ProvisionedBackofficeAccount,
} from '@vistay/admin-api-client'

interface AccountProvisioningProps {
  authApiUrl: string
  accessToken: string
  viewer: BackofficeViewer
}

type OnboardingMode = 'DIRECT' | 'INVITATION'

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Không thể tạo tài khoản nhân viên.'
  if (error.message.includes('BACKOFFICE_ACCOUNT_ALREADY_EXISTS')) {
    return 'Email này đã thuộc một tài khoản Backoffice.'
  }
  if (error.message.includes('BACKOFFICE_INVITATION_DISPATCH_UNAVAILABLE')) {
    return 'Đã tạo hồ sơ nhưng chưa gửi được email. Gửi lại với cùng yêu cầu khi dịch vụ mail hoạt động.'
  }
  return error.message
}

export function AccountProvisioning({ authApiUrl, accessToken, viewer }: AccountProvisioningProps) {
  const [mode, setMode] = useState<OnboardingMode>('DIRECT')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [reason, setReason] = useState('')
  const [attemptKey, setAttemptKey] = useState<string>()
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string>()
  const [account, setAccount] = useState<ProvisionedBackofficeAccount>()
  const [invitation, setInvitation] = useState<InvitedBackofficeAccount>()
  const canProvision = viewer.permissions.includes('account:provision')
  const valid = email.trim().length > 3
    && fullName.trim().length > 0
    && reason.trim().length >= 8
    && (mode === 'INVITATION' || temporaryPassword.length >= 12)

  function changeMode(nextMode: OnboardingMode) {
    setMode(nextMode)
    setStatus('idle')
    setMessage(undefined)
    setAccount(undefined)
    setInvitation(undefined)
    setAttemptKey(undefined)
  }

  function updateField(setter: (value: string) => void, value: string) {
    setter(value)
    setAttemptKey(undefined)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canProvision || !valid || status === 'saving') return
    setStatus('saving')
    setMessage(undefined)
    setAccount(undefined)
    setInvitation(undefined)
    const idempotencyKey = attemptKey ?? crypto.randomUUID()
    setAttemptKey(idempotencyKey)
    try {
      if (mode === 'DIRECT') {
        const created = await provisionBackofficeAccount(
          authApiUrl,
          accessToken,
          idempotencyKey,
          {
            email: email.trim(),
            fullName: fullName.trim(),
            temporaryPassword,
            reason: reason.trim(),
          },
        )
        setAccount(created)
        setTemporaryPassword('')
        setMessage('Đã tạo hồ sơ nhân viên và tài khoản. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu tiên.')
      } else {
        const created = await inviteBackofficeAccount(
          authApiUrl,
          accessToken,
          idempotencyKey,
          { email: email.trim(), fullName: fullName.trim(), reason: reason.trim() },
        )
        setInvitation(created)
        setMessage('Đã tạo hồ sơ nhân viên và gửi email để nhân viên xác thực, đặt mật khẩu.')
      }
      setStatus('success')
      setAttemptKey(undefined)
    } catch (error) {
      setStatus('error')
      setMessage(errorMessage(error))
    }
  }

  return (
    <section className="provisioning-console" id="accounts">
      <div className="provisioning-copy">
        <p className="eyebrow">EMPLOYEE ONBOARDING</p>
        <h2>Tài khoản nhân viên.<br />Không đăng ký công khai.</h2>
        <p>Admin có thể tạo tài khoản ngay bằng mật khẩu tạm hoặc gửi lời mời để nhân viên tự xác thực email và đặt mật khẩu. Cả hai cách đều yêu cầu quyền cấp tài khoản và được lưu dấu vết.</p>
        <div className="provisioning-facts">
          <span><strong>DIRECT</strong> Admin tạo tài khoản ngay</span>
          <span><strong>INVITATION</strong> Nhân viên đặt mật khẩu qua email</span>
          <span><strong>NO SIGN-UP</strong> Backoffice không có đăng ký công khai</span>
        </div>
      </div>

      <form className="provisioning-form" onSubmit={(event) => void submit(event)}>
        <div><p className="eyebrow">NEW EMPLOYEE</p><h3>Tạo hồ sơ và tài khoản</h3></div>
        <div className="provisioning-mode" aria-label="Phương thức cấp tài khoản" role="tablist">
          <button aria-selected={mode === 'DIRECT'} className={mode === 'DIRECT' ? 'active' : ''} onClick={() => changeMode('DIRECT')} role="tab" type="button">Tạo ngay</button>
          <button aria-selected={mode === 'INVITATION'} className={mode === 'INVITATION' ? 'active' : ''} onClick={() => changeMode('INVITATION')} role="tab" type="button">Gửi email mời</button>
        </div>
        {!canProvision && <p className="form-message error" role="alert">Bạn thiếu quyền account:provision.</p>}
        <label>Họ và tên<input autoComplete="name" maxLength={180} onChange={(event) => updateField(setFullName, event.target.value)} value={fullName} /></label>
        <label>Email<input autoComplete="email" inputMode="email" type="email" onChange={(event) => updateField(setEmail, event.target.value)} value={email} /></label>
        {mode === 'DIRECT' && (
          <label>Mật khẩu tạm thời<input autoComplete="new-password" minLength={12} maxLength={128} type="password" onChange={(event) => updateField(setTemporaryPassword, event.target.value)} value={temporaryPassword} /></label>
        )}
        <label>Lý do tạo nhân viên<textarea minLength={8} maxLength={500} onChange={(event) => updateField(setReason, event.target.value)} value={reason} /></label>
        {message && <p className={`form-message ${status}`} role={status === 'error' ? 'alert' : 'status'}>{message}</p>}
        {account && <p className="created-account"><strong>{account.email}</strong><span>Account ID · {account.id}</span></p>}
        {invitation && <p className="created-account"><strong>{invitation.email}</strong><span>Lời mời · {invitation.deliveryStatus} · hết hạn {new Date(invitation.expiresAt).toLocaleString('vi-VN')}</span></p>}
        <button className="primary-button" disabled={!canProvision || !valid || status === 'saving'} type="submit">
          {status === 'saving' ? 'Đang xử lý…' : mode === 'DIRECT' ? 'Tạo nhân viên và tài khoản' : 'Tạo nhân viên và gửi email'}
        </button>
      </form>
    </section>
  )
}
