import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  ArrowClockwise,
  ArrowLeft,
  CalendarBlank,
  CheckCircle,
  EnvelopeSimple,
  IdentificationCard,
  LinkSimple,
  MagnifyingGlass,
  MapPin,
  Phone,
  Plus,
  SpinnerGap,
  UserCircle,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import {
  createUserProfile,
  fetchUserDirectory,
  fetchUserProfile,
  type BackofficeViewer,
  type CreateUserProfileInput,
  type UserDirectoryAccountType,
  type UserDirectoryEntry,
  type UserProfileDetails,
} from '@vistay/admin-api-client'

export type UserDirectorySection = 'customers' | 'staff' | 'hosts'

const sectionType: Record<UserDirectorySection, UserDirectoryAccountType> = {
  customers: 'CUSTOMER',
  staff: 'ADMIN',
  hosts: 'HOST',
}

const sectionCopy: Record<UserDirectorySection, {
  title: string
  description: string
  empty: string
  createPermission: string
  createLabel: string
}> = {
  customers: {
    title: 'Khách hàng',
    description: 'Hồ sơ lưu trú và thông tin liên hệ, độc lập với trạng thái tài khoản.',
    empty: 'Chưa có hồ sơ khách hàng phù hợp.',
    createPermission: 'customer-profile:create',
    createLabel: 'Thêm khách hàng',
  },
  staff: {
    title: 'Nhân viên',
    description: 'Danh bạ nhân sự, mã nhân viên và thông tin làm việc.',
    empty: 'Chưa có hồ sơ nhân viên phù hợp.',
    createPermission: 'admin-profile:create',
    createLabel: 'Thêm nhân viên',
  },
  hosts: {
    title: 'Chủ nhà',
    description: 'Hồ sơ đối tác chủ nhà, liên hệ và trạng thái xác minh.',
    empty: 'Chưa có hồ sơ chủ nhà phù hợp.',
    createPermission: 'host-profile:create',
    createLabel: 'Thêm chủ nhà',
  },
}

const emptyDraft = {
  fullName: '', email: '', contactPhone: '', referenceCode: '', subtype: 'STAFF',
  relevantDate: '', address: '', taxCode: '', reason: '',
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase()
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Đang hoạt động', INACTIVE: 'Ngừng hoạt động', SUSPENDED: 'Tạm khóa',
    ANONYMIZED: 'Đã ẩn danh',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function detail(entry: UserDirectoryEntry): string {
  if (entry.accountType === 'ADMIN') return entry.subtype?.replaceAll('_', ' ') ?? 'Nhân viên'
  if (entry.accountType === 'HOST') return entry.verificationStatus?.replaceAll('_', ' ') ?? 'Chưa xác minh'
  return entry.accountId ? 'Đã liên kết tài khoản' : 'Chưa có tài khoản'
}

export function UserDirectoryWorkspace({ graphqlUrl, accessToken, viewer, section }: {
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
  section: UserDirectorySection
}) {
  const root = useRef<HTMLElement>(null)
  const [search, setSearch] = useState('')
  const [nodes, setNodes] = useState<UserDirectoryEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<UserDirectoryEntry | null>(null)
  const [profile, setProfile] = useState<UserProfileDetails | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [createState, setCreateState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [createError, setCreateError] = useState('')
  const [attemptKey, setAttemptKey] = useState<string>()
  const allowed = viewer.permissions.includes('user:read')
  const copy = sectionCopy[section]
  const canCreate = viewer.permissions.includes(copy.createPermission)

  const load = useCallback(async (cursor: string | null = null, signal?: AbortSignal) => {
    if (!allowed) return
    if (cursor) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const page = await fetchUserDirectory(
        graphqlUrl, accessToken,
        { accountType: sectionType[section], search, first: 25, after: cursor }, signal,
      )
      setNodes((current) => cursor ? [...current, ...page.nodes] : page.nodes)
      setTotalCount(page.totalCount)
      setNextCursor(page.nextCursor)
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'Không thể tải danh bạ người dùng')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [accessToken, allowed, graphqlUrl, search, section])

  useEffect(() => {
    setSelected(null)
    setProfile(null)
    setCreating(false)
    if (!allowed) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => void load(null, controller.signal), 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [allowed, load, section])

  useEffect(() => {
    if (!selected) return
    const controller = new AbortController()
    setProfileLoading(true)
    setProfileError('')
    void fetchUserProfile(graphqlUrl, accessToken, selected.accountType, selected.profileId, controller.signal)
      .then(setProfile)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setProfileError(reason instanceof Error ? reason.message : 'Không thể tải hồ sơ')
      })
      .finally(() => setProfileLoading(false))
    return () => controller.abort()
  }, [accessToken, graphqlUrl, selected])

  useGSAP(() => {
    if (loading || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('.user-directory-row', { opacity: 0, y: 9 }, {
      opacity: 1, y: 0, duration: 0.32, stagger: 0.025, ease: 'power2.out',
    })
  }, { scope: root, dependencies: [section, nodes.length, loading], revertOnUpdate: true })

  function updateDraft(field: keyof typeof emptyDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setAttemptKey(undefined)
    setCreateError('')
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault()
    if (!canCreate || createState === 'saving' || draft.fullName.trim().length === 0 || draft.reason.trim().length < 8) return
    setCreateState('saving')
    setCreateError('')
    const idempotencyKey = attemptKey ?? crypto.randomUUID()
    setAttemptKey(idempotencyKey)
    const input: CreateUserProfileInput = {
      accountType: sectionType[section],
      ...draft,
      idempotencyKey,
    }
    try {
      const created = await createUserProfile(graphqlUrl, accessToken, input)
      setCreating(false)
      setDraft(emptyDraft)
      setAttemptKey(undefined)
      setCreateState('idle')
      await load()
      setSelected({ ...created, joinedOn: created.relevantDate })
    } catch (reason) {
      setCreateState('error')
      setCreateError(reason instanceof Error ? reason.message : 'Không thể tạo hồ sơ')
    }
  }

  if (!allowed) {
    return <section className="user-directory-denied"><WarningCircle /><div><h2>Chưa có quyền xem người dùng</h2><p>Role cần grant <code>user:read</code>.</p></div></section>
  }

  if (selected) {
    return (
      <section ref={root} className="user-profile-page" aria-labelledby="user-profile-title">
        <button className="user-profile-back" type="button" onClick={() => { setSelected(null); setProfile(null) }}><ArrowLeft />Danh sách {copy.title.toLowerCase()}</button>
        {profileLoading && <div className="inline-state"><SpinnerGap className="spinner" />Đang tải hồ sơ…</div>}
        {profileError && <div className="inline-state error"><WarningCircle />{profileError}</div>}
        {profile && (
          <>
            <header className="user-profile-hero">
              <span className="user-profile-avatar">{initials(profile.displayName) || <UserCircle />}</span>
              <div><p>{copy.title}</p><h2 id="user-profile-title">{profile.displayName}</h2><span>{profile.referenceCode ?? profile.profileId}</span></div>
              <span className={`user-directory-status ${profile.status.toLowerCase()}`}><CheckCircle />{statusLabel(profile.status)}</span>
            </header>
            <div className="user-profile-grid">
              <article><EnvelopeSimple /><span>Email</span><strong>{profile.email ?? 'Chưa cập nhật'}</strong></article>
              <article><Phone /><span>Điện thoại</span><strong>{profile.contactPhone ?? 'Chưa cập nhật'}</strong></article>
              <article><IdentificationCard /><span>Tài khoản</span><strong>{profile.accountId ? 'Đã liên kết' : 'Chưa có tài khoản'}</strong><small>{profile.accountId ?? 'Thao tác tài khoản nằm ở tab Phân quyền'}</small></article>
              <article><CalendarBlank /><span>Ngày liên quan</span><strong>{profile.relevantDate ? new Date(profile.relevantDate).toLocaleDateString('vi-VN') : 'Chưa cập nhật'}</strong></article>
              <article className="wide"><MapPin /><span>Địa chỉ</span><strong>{profile.address ?? 'Chưa cập nhật'}</strong></article>
              <article><LinkSimple /><span>Cập nhật</span><strong>{new Date(profile.updatedAt).toLocaleString('vi-VN')}</strong><small>Phiên bản {profile.version}</small></article>
            </div>
          </>
        )}
      </section>
    )
  }

  return (
    <section ref={root} className="user-directory" aria-labelledby="user-directory-title">
      <header className="user-directory-heading">
        <div><h2 id="user-directory-title">{copy.title}</h2><p>{copy.description}</p></div>
        <div className="user-directory-tools">
          <label className="user-directory-search"><MagnifyingGlass /><span className="sr-only">Tìm người dùng</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên, email, số điện thoại hoặc mã" /></label>
          {canCreate && <button className="user-directory-create" type="button" onClick={() => setCreating(true)}><Plus />{copy.createLabel}</button>}
        </div>
      </header>

      <div className="user-directory-summary">
        <article><span>Tổng hồ sơ</span><strong>{totalCount.toLocaleString('vi-VN')}</strong></article>
        <article><span>Đang hiển thị</span><strong>{nodes.length.toLocaleString('vi-VN')}</strong></article>
        <article><span>Chưa có tài khoản</span><strong>{nodes.filter((node) => !node.accountId).length.toLocaleString('vi-VN')}</strong></article>
      </div>

      {loading && <div className="inline-state"><SpinnerGap className="spinner" />Đang tải danh bạ…</div>}
      {error && <div className="inline-state error"><WarningCircle /><div><strong>Không tải được danh bạ</strong><span>{error}</span></div><button onClick={() => void load()}><ArrowClockwise />Thử lại</button></div>}

      {!loading && !error && (
        <div className="user-directory-board">
          <div className="user-directory-table-head" aria-hidden="true"><span>Người dùng</span><span>Liên hệ</span><span>Thông tin</span><span>Trạng thái</span></div>
          <div className="user-directory-list">
            {nodes.map((entry) => (
              <button className="user-directory-row" type="button" key={entry.profileId} onClick={() => setSelected(entry)}>
                <div className="user-directory-person"><span className="user-directory-avatar">{initials(entry.displayName) || <UserCircle />}</span><div><strong>{entry.displayName}</strong><small>{entry.referenceCode ?? entry.profileId.slice(0, 8)}</small></div></div>
                <div className="user-directory-contact"><span><EnvelopeSimple />{entry.email ?? 'Chưa có email'}</span><span><Phone />{entry.contactPhone ?? 'Chưa có số điện thoại'}</span></div>
                <div className="user-directory-meta"><span><IdentificationCard />{detail(entry)}</span><small>{entry.joinedOn ? `Bắt đầu ${new Date(entry.joinedOn).toLocaleDateString('vi-VN')}` : `Cập nhật ${new Date(entry.updatedAt).toLocaleDateString('vi-VN')}`}</small></div>
                <span className={`user-directory-status ${entry.status.toLowerCase()}`}><CheckCircle />{statusLabel(entry.status)}</span>
                <aside className="user-directory-preview" aria-hidden="true">
                  <div><span className="user-directory-avatar">{initials(entry.displayName)}</span><strong>{entry.displayName}</strong></div>
                  <p>{entry.email ?? 'Chưa có email'}</p><p>{entry.contactPhone ?? 'Chưa có điện thoại'}</p>
                  <small>{entry.accountId ? 'Đã liên kết tài khoản' : 'Chưa có tài khoản'} · Nhấn để xem hồ sơ</small>
                </aside>
              </button>
            ))}
            {!nodes.length && <div className="user-directory-empty"><UserCircle /><strong>{copy.empty}</strong><span>Thử thay đổi từ khóa tìm kiếm.</span></div>}
          </div>
          {nextCursor && <button className="user-directory-more" type="button" disabled={loadingMore} onClick={() => void load(nextCursor)}>{loadingMore ? <><SpinnerGap className="spinner" />Đang tải…</> : `Xem thêm ${Math.max(totalCount - nodes.length, 0)} hồ sơ`}</button>}
        </div>
      )}

      {creating && (
        <div className="user-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false) }}>
          <section className="user-create-dialog" role="dialog" aria-modal="true" aria-labelledby="user-create-title">
            <header><div><span>HỒ SƠ MỚI</span><h3 id="user-create-title">{copy.createLabel}</h3></div><button type="button" aria-label="Đóng" onClick={() => setCreating(false)}><X /></button></header>
            <form onSubmit={(event) => void submitCreate(event)}>
              <div className="user-create-fields">
                <label className="wide">Họ và tên<input autoFocus value={draft.fullName} onChange={(event) => updateDraft('fullName', event.target.value)} maxLength={180} required /></label>
                <label>Email<input type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} /></label>
                <label>Điện thoại<input value={draft.contactPhone} onChange={(event) => updateDraft('contactPhone', event.target.value)} /></label>
                {section !== 'customers' && <label>{section === 'staff' ? 'Mã nhân viên' : 'Mã chủ nhà'}<input value={draft.referenceCode} onChange={(event) => updateDraft('referenceCode', event.target.value)} /></label>}
                {section === 'staff' && <label>Loại nhân viên<select value={draft.subtype} onChange={(event) => updateDraft('subtype', event.target.value)}><option value="STAFF">Nhân viên</option><option value="RECEPTIONIST">Lễ tân</option><option value="CTV">Cộng tác viên</option><option value="MANAGER">Quản lý</option><option value="ADMIN">Quản trị</option></select></label>}
                {section !== 'hosts' && <label>{section === 'staff' ? 'Ngày bắt đầu' : 'Ngày sinh'}<input type="date" value={draft.relevantDate} onChange={(event) => updateDraft('relevantDate', event.target.value)} /></label>}
                {section !== 'staff' && <label className="wide">Địa chỉ<input value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} maxLength={500} /></label>}
                {section === 'hosts' && <label>Mã số thuế<input value={draft.taxCode} onChange={(event) => updateDraft('taxCode', event.target.value)} maxLength={40} /></label>}
                <label className="wide">Lý do tạo hồ sơ<textarea value={draft.reason} onChange={(event) => updateDraft('reason', event.target.value)} minLength={8} maxLength={500} required /></label>
              </div>
              {createError && <p className="form-message error" role="alert">{createError}</p>}
              <footer><button type="button" onClick={() => setCreating(false)}>Hủy</button><button className="primary" type="submit" disabled={createState === 'saving' || draft.fullName.trim().length === 0 || draft.reason.trim().length < 8}>{createState === 'saving' ? <><SpinnerGap className="spinner" />Đang tạo</> : <><Plus />Tạo hồ sơ</>}</button></footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
