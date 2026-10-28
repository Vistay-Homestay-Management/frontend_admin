import { useState, type FormEvent } from 'react'
import { CheckCircle, FloppyDisk, ShieldCheck, WarningCircle } from '@phosphor-icons/react'
import {
  updateMyProfile,
  type BackofficeViewer,
} from '@vistay/admin-api-client'

interface PersonalProfileEditorProps {
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
  onUpdated: () => void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Đã có lỗi không xác định'
}

export function PersonalProfileEditor({
  graphqlUrl,
  accessToken,
  viewer,
  onUpdated,
}: PersonalProfileEditorProps) {
  const [displayName, setDisplayName] = useState(viewer.displayName)
  const [contactPhone, setContactPhone] = useState(viewer.contactPhone ?? '')
  const [avatarMediaId, setAvatarMediaId] = useState(viewer.avatarMediaId ?? '')
  const [reason, setReason] = useState('Cập nhật hồ sơ cá nhân')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const canUpdate = viewer.permissions.includes('profile:update')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canUpdate || saving) return
    setSaving(true)
    setError(undefined)
    setSuccess(undefined)
    try {
      const result = await updateMyProfile(graphqlUrl, accessToken, {
        displayName: displayName.trim(),
        contactPhone: contactPhone.trim() || null,
        avatarMediaId: avatarMediaId.trim() || null,
        expectedVersion: viewer.profileVersion,
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      })
      setSuccess(`Đã lưu phiên bản ${result.version}.`)
      onUpdated()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="profile-card profile-editor" id="profile">
      <div className="section-heading">
        <div><p className="eyebrow">PERSONAL PROFILE</p><h2>Hồ sơ đang hoạt động</h2></div>
        <ShieldCheck weight="duotone" />
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <div className="profile-form-grid">
          <label>Họ và tên
            <input required minLength={2} maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} disabled={!canUpdate || saving} />
          </label>
          <label>Email xác thực
            <input value={viewer.email} readOnly aria-readonly="true" />
          </label>
          <label>Số điện thoại E.164
            <input inputMode="tel" placeholder="+84901234567" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} disabled={!canUpdate || saving} />
          </label>
          <label>Avatar media ID
            <input placeholder="UUID tham chiếu, không tải binary" value={avatarMediaId} onChange={(event) => setAvatarMediaId(event.target.value)} disabled={!canUpdate || saving} />
          </label>
        </div>
        <label className="profile-reason">Lý do thay đổi
          <textarea required minLength={8} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={!canUpdate || saving} />
        </label>
        <div className="profile-meta">
          <span>Profile {viewer.profileId}</span>
          <span>Phiên bản {viewer.profileVersion}</span>
        </div>
        {error && <p className="profile-message error" role="alert"><WarningCircle />{error}</p>}
        {success && <p className="profile-message success" role="status"><CheckCircle />{success}</p>}
        {canUpdate ? (
          <button className="primary-button profile-submit" type="submit" disabled={saving || displayName.trim().length < 2 || reason.trim().length < 8}>
            <FloppyDisk /> {saving ? 'Đang lưu…' : 'Lưu hồ sơ'}
          </button>
        ) : <p className="profile-readonly">Tài khoản chưa có quyền <code>profile:update@SELF</code>.</p>}
      </form>
      <div className="permission-list">
        {viewer.permissions.map((permission) => <span key={permission}>{permission}</span>)}
        {viewer.permissions.length === 0 && <span className="muted-chip">Chưa có quyền nghiệp vụ</span>}
      </div>
    </article>
  )
}
