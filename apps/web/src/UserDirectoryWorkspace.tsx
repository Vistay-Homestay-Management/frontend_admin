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
  LockKey,
  MagnifyingGlass,
  MapPin,
  Phone,
  SpinnerGap,
  UserCircle,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import {
  checkCustomerContactAvailability,
  checkCustomerIdentityDocumentAvailability,
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
  relevantDate: '', nationalityCode: 'VN', documentType: 'CCCD' as 'CCCD' | 'PASSPORT',
  documentNumber: '', address: '', taxCode: '', reason: '',
}

type AvailabilityState = 'idle' | 'checking' | 'available' | 'duplicate' | 'error'

const isoCountryCodes = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

const regionNames = new Intl.DisplayNames(['vi'], { type: 'region' })
const countryOptions = isoCountryCodes
  .map((code) => ({ code, label: regionNames.of(code) ?? code }))
  .sort((left, right) => left.label.localeCompare(right.label, 'vi'))

export function formatVietnameseDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export function isoDateFromVietnamese(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (year < 1900 || candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null
  return `${match[3]}-${match[2]}-${match[1]}`
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
  const [previewed, setPreviewed] = useState<UserDirectoryEntry | null>(null)
  const [profile, setProfile] = useState<UserProfileDetails | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(emptyDraft)
  const [createState, setCreateState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [createError, setCreateError] = useState('')
  const [emailCheck, setEmailCheck] = useState<AvailabilityState>('idle')
  const [phoneCheck, setPhoneCheck] = useState<AvailabilityState>('idle')
  const [documentCheck, setDocumentCheck] = useState<AvailabilityState>('idle')
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
    setPreviewed(null)
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

  useEffect(() => {
    const documentNumber = draft.documentNumber.trim().toUpperCase()
    const valid = draft.documentType === 'CCCD'
      ? /^[0-9]{12}$/.test(documentNumber)
      : /^[A-Z0-9]{6,20}$/.test(documentNumber)
    if (!creating || section !== 'customers' || !valid) {
      setDocumentCheck('idle')
      return
    }

    const controller = new AbortController()
    setDocumentCheck('checking')
    const timer = window.setTimeout(() => {
      void checkCustomerIdentityDocumentAvailability(
        graphqlUrl,
        accessToken,
        {
          nationalityCode: draft.nationalityCode,
          documentType: draft.documentType,
          documentNumber,
        },
        controller.signal,
      )
        .then((available) => setDocumentCheck(available ? 'available' : 'duplicate'))
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === 'AbortError') return
          setDocumentCheck('error')
        })
    }, 350)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [accessToken, creating, draft.documentNumber, draft.documentType, draft.nationalityCode, graphqlUrl, section])

  useEffect(() => {
    const email = draft.email.trim()
    const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 320
    if (!creating || section !== 'customers' || !valid) {
      setEmailCheck('idle')
      return
    }
    const controller = new AbortController()
    setEmailCheck('checking')
    const timer = window.setTimeout(() => {
      void checkCustomerContactAvailability(
        graphqlUrl, accessToken, { email }, controller.signal,
      )
        .then(({ emailAvailable }) => setEmailCheck(emailAvailable === false ? 'duplicate' : 'available'))
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === 'AbortError') return
          setEmailCheck('error')
        })
    }, 350)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [accessToken, creating, draft.email, graphqlUrl, section])

  useEffect(() => {
    const contactPhone = draft.contactPhone.trim()
    const normalized = contactPhone.replace(/[\s().-]/g, '')
    const valid = /^\+?[0-9]{8,15}$/.test(normalized)
    if (!creating || section !== 'customers' || !valid) {
      setPhoneCheck('idle')
      return
    }
    const controller = new AbortController()
    setPhoneCheck('checking')
    const timer = window.setTimeout(() => {
      void checkCustomerContactAvailability(
        graphqlUrl, accessToken, { contactPhone }, controller.signal,
      )
        .then(({ phoneAvailable }) => setPhoneCheck(phoneAvailable === false ? 'duplicate' : 'available'))
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === 'AbortError') return
          setPhoneCheck('error')
        })
    }, 350)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [accessToken, creating, draft.contactPhone, graphqlUrl, section])

  useEffect(() => {
    const directory = root.current
    const alertControl = document.querySelector<HTMLElement>('.topbar-actions [aria-label="Cảnh báo"]')
    if (!directory || !alertControl) return

    const alignSideColumn = () => {
      const width = Math.max(300, directory.getBoundingClientRect().right - alertControl.getBoundingClientRect().left)
      directory.style.setProperty('--customer-side-width', `${Math.round(width)}px`)
    }
    const observer = new ResizeObserver(alignSideColumn)
    observer.observe(directory)
    observer.observe(alertControl)
    window.addEventListener('resize', alignSideColumn)
    alignSideColumn()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', alignSideColumn)
    }
  }, [section])

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
    if (!canCreate || createState === 'saving') return
    if (!draft.fullName.trim()) {
      setCreateState('error')
      setCreateError('Vui lòng nhập họ và tên.')
      return
    }
    const relevantDate = draft.relevantDate.trim() ? isoDateFromVietnamese(draft.relevantDate) : ''
    if (draft.relevantDate.trim() && !relevantDate) {
      setCreateState('error')
      setCreateError(`${section === 'staff' ? 'Ngày bắt đầu' : 'Ngày sinh'} phải theo định dạng dd/mm/yyyy và là ngày hợp lệ.`)
      return
    }
    if (section === 'customers' && !draft.email.trim() && !draft.contactPhone.trim()) {
      setCreateState('error')
      setCreateError('Khách hàng phải có ít nhất email hoặc số điện thoại.')
      return
    }
    if (section === 'customers' && !draft.documentNumber.trim()) {
      setCreateState('error')
      setCreateError(`Vui lòng nhập số ${draft.documentType === 'CCCD' ? 'CCCD' : 'hộ chiếu'}.`)
      return
    }
    if (section === 'customers' && documentCheck === 'duplicate') {
      setCreateState('error')
      setCreateError(`${draft.documentType === 'CCCD' ? 'CCCD' : 'Hộ chiếu'} đã được dùng bởi một khách hàng khác.`)
      return
    }
    if (section === 'customers' && emailCheck === 'duplicate') {
      setCreateState('error')
      setCreateError('Email đã được dùng bởi một khách hàng khác.')
      return
    }
    if (section === 'customers' && phoneCheck === 'duplicate') {
      setCreateState('error')
      setCreateError('Số điện thoại đã được dùng bởi một khách hàng khác.')
      return
    }
    setCreateState('saving')
    setCreateError('')
    const idempotencyKey = attemptKey ?? crypto.randomUUID()
    setAttemptKey(idempotencyKey)
    const input: CreateUserProfileInput = {
      accountType: sectionType[section],
      ...draft,
      relevantDate: relevantDate ?? '',
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
              {profile.accountType === 'CUSTOMER' && <article><MapPin /><span>Quốc tịch</span><strong>{profile.nationalityCode === 'VNM' ? 'Việt Nam' : profile.nationalityCode ?? 'Chưa cập nhật'}</strong><small>{profile.documentType === 'CCCD' ? 'Giấy tờ: CCCD' : profile.documentType === 'PASSPORT' ? 'Giấy tờ: Hộ chiếu' : 'Chưa có giấy tờ'}</small></article>}
              <article className="wide"><MapPin /><span>Địa chỉ</span><strong>{profile.address ?? 'Chưa cập nhật'}</strong></article>
              <article><LinkSimple /><span>Cập nhật</span><strong>{new Date(profile.updatedAt).toLocaleString('vi-VN')}</strong><small>Phiên bản {profile.version}</small></article>
            </div>
          </>
        )}
      </section>
    )
  }

  return (
    <section ref={root} className={`user-directory user-directory-customers user-directory-${section}`} aria-label={`Quản lý ${copy.title.toLowerCase()}`}>
      <div className="user-directory-commandbar">
        <div className="user-directory-summary">
          <article><span>Tổng hồ sơ</span><strong>{totalCount.toLocaleString('vi-VN')}</strong></article>
          <article><span>Đang hiển thị</span><strong>{nodes.length.toLocaleString('vi-VN')}</strong></article>
          <article><span>Chưa có tài khoản</span><strong>{nodes.filter((node) => !node.accountId).length.toLocaleString('vi-VN')}</strong></article>
        </div>
        <div className="user-directory-tools">
          {canCreate
            ? <button className="user-directory-create" type="button" onClick={() => setCreating(true)}>{copy.createLabel}</button>
            : <button className="user-directory-create locked" type="button" disabled title={`Cần quyền ${copy.createPermission}`}><LockKey />{copy.createLabel}</button>}
          <label className="user-directory-search"><MagnifyingGlass /><span className="sr-only">Tìm người dùng</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên, email, số điện thoại hoặc mã" /></label>
        </div>
      </div>

      {loading && <div className="inline-state"><SpinnerGap className="spinner" />Đang tải danh bạ…</div>}
      {error && <div className="inline-state error"><WarningCircle /><div><strong>Không tải được danh bạ</strong><span>{error}</span></div><button onClick={() => void load()}><ArrowClockwise />Thử lại</button></div>}

      {!loading && !error && (
        <div className="user-directory-board">
          <div className="user-directory-table">
            <div className="user-directory-table-head" aria-hidden="true"><span>Người dùng</span><span>Liên hệ</span><span>Thông tin</span><span>Trạng thái</span></div>
            <div className="user-directory-list">
              {nodes.map((entry) => (
                <button
                  className="user-directory-row"
                  type="button"
                  key={entry.profileId}
                  onMouseEnter={() => setPreviewed(entry)}
                  onFocus={() => setPreviewed(entry)}
                  onClick={() => setSelected(entry)}
                >
                  <div className="user-directory-person"><span className="user-directory-avatar">{initials(entry.displayName) || <UserCircle />}</span><div><strong>{entry.displayName}</strong><small>{entry.referenceCode ?? entry.profileId.slice(0, 8)}</small></div></div>
                  <div className="user-directory-contact"><span><EnvelopeSimple />{entry.email ?? 'Chưa có email'}</span><span><Phone />{entry.contactPhone ?? 'Chưa có số điện thoại'}</span></div>
                  <div className="user-directory-meta"><span><IdentificationCard />{detail(entry)}</span><small>{entry.joinedOn ? `Bắt đầu ${new Date(entry.joinedOn).toLocaleDateString('vi-VN')}` : `Cập nhật ${new Date(entry.updatedAt).toLocaleDateString('vi-VN')}`}</small></div>
                  <span className={`user-directory-status ${entry.status.toLowerCase()}`}><CheckCircle />{statusLabel(entry.status)}</span>
                </button>
              ))}
              {!nodes.length && <div className="user-directory-empty"><UserCircle /><strong>{copy.empty}</strong><span>Thử thay đổi từ khóa tìm kiếm.</span></div>}
            </div>
            {nextCursor && <button className="user-directory-more" type="button" disabled={loadingMore} onClick={() => void load(nextCursor)}>{loadingMore ? <><SpinnerGap className="spinner" />Đang tải…</> : `Xem thêm ${Math.max(totalCount - nodes.length, 0)} hồ sơ`}</button>}
          </div>
          <aside className={`user-directory-inspector${previewed ? ' populated' : ''}`} aria-live="polite">
            {previewed ? (
              <>
                <header><span className="user-directory-avatar">{initials(previewed.displayName)}</span><div><small>Xem nhanh</small><strong>{previewed.displayName}</strong></div></header>
                <dl>
                  <div><dt>Email</dt><dd>{previewed.email ?? 'Chưa cập nhật'}</dd></div>
                  <div><dt>Điện thoại</dt><dd>{previewed.contactPhone ?? 'Chưa cập nhật'}</dd></div>
                  <div><dt>Tài khoản</dt><dd>{previewed.accountId ? 'Đã liên kết' : 'Chưa liên kết'}</dd></div>
                  <div><dt>Thông tin</dt><dd>{detail(previewed)}</dd></div>
                </dl>
                <p><IdentificationCard /> Nhấn vào bản ghi để mở hồ sơ đầy đủ.</p>
              </>
            ) : (
              <div className="user-directory-inspector-empty"><UserCircle /><strong>Xem nhanh hồ sơ</strong><span>Di chuột hoặc dùng bàn phím chọn một bản ghi.</span></div>
            )}
          </aside>
        </div>
      )}

      {creating && (
        <div className="user-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false) }}>
          <section className="user-create-dialog" role="dialog" aria-modal="true" aria-labelledby="user-create-title">
            <header>
              <svg className="user-create-header-art" viewBox="0 0 240 84" aria-hidden="true" focusable="false">
                <path d="M5 54C16 39 32 42 38 24C46 3 71 19 88 8C105-4 121 17 139 14C158 11 167 2 185 9C202 16 202 31 219 37C238 45 232 68 213 72C190 77 177 65 158 73C137 82 121 69 101 78C80 86 64 70 43 74C25 77 13 68 5 54Z" />
                <path d="M34 51C42 44 42 32 54 27C67 22 78 28 88 20C101 10 114 28 128 22C145 14 158 20 166 31C174 42 190 40 195 52C201 65 184 68 170 64C153 59 145 72 128 67C112 62 102 72 87 66C71 59 57 68 45 62C38 59 35 55 34 51Z" />
                <path d="M66 52C72 45 68 36 80 32C92 28 98 37 107 30C117 23 126 33 136 29C147 25 157 31 158 40C159 49 173 51 169 59C164 67 151 60 142 62C130 66 124 57 113 62C102 68 95 59 85 61C76 63 68 59 66 52Z" />
                <path d="M99 48C101 41 109 42 114 36C120 29 127 39 134 36C143 32 149 39 146 46C144 52 153 55 147 59C140 64 134 56 127 60C120 64 116 56 108 58C102 59 98 54 99 48Z" />
              </svg>
              <h3 id="user-create-title">{copy.createLabel}</h3>
              <button type="button" aria-label="Đóng" onClick={() => setCreating(false)}><X /></button>
            </header>
            <form onSubmit={(event) => void submitCreate(event)}>
              <div className="user-create-body">
                <div className="user-create-fields">
                <label className="wide">Họ và tên *<input autoFocus value={draft.fullName} onChange={(event) => updateDraft('fullName', event.target.value)} maxLength={180} required /></label>
                <label>Email<div className="user-create-input-shell"><input type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} />
                  {emailCheck !== 'idle' && <span className={`input-check ${emailCheck}`} aria-live="polite" title={emailCheck === 'error' ? 'Chưa thể kiểm tra trước; hệ thống sẽ kiểm tra khi tạo.' : undefined}>
                    {emailCheck === 'checking' ? <><SpinnerGap className="spinner" />Kiểm tra</> : emailCheck === 'available' ? <><CheckCircle />Dùng được</> : emailCheck === 'duplicate' ? <><WarningCircle />Đã tồn tại</> : <WarningCircle />}
                  </span>}
                </div></label>
                <label>Điện thoại<div className="user-create-input-shell"><input type="tel" value={draft.contactPhone} onChange={(event) => updateDraft('contactPhone', event.target.value)} />
                  {phoneCheck !== 'idle' && <span className={`input-check ${phoneCheck}`} aria-live="polite" title={phoneCheck === 'error' ? 'Chưa thể kiểm tra trước; hệ thống sẽ kiểm tra khi tạo.' : undefined}>
                    {phoneCheck === 'checking' ? <><SpinnerGap className="spinner" />Kiểm tra</> : phoneCheck === 'available' ? <><CheckCircle />Dùng được</> : phoneCheck === 'duplicate' ? <><WarningCircle />Đã tồn tại</> : <WarningCircle />}
                  </span>}
                </div></label>
                {section === 'customers' && <>
                  <label>Quốc tịch<select value={draft.nationalityCode} onChange={(event) => {
                    const nationalityCode = event.target.value
                    setDraft((current) => ({
                      ...current,
                      nationalityCode,
                      documentType: nationalityCode === 'VN' ? 'CCCD' : 'PASSPORT',
                      documentNumber: '',
                    }))
                    setAttemptKey(undefined)
                    setCreateError('')
                  }}>{countryOptions.map((country) => <option key={country.code} value={country.code}>{country.label}</option>)}</select></label>
                  <label>Loại giấy tờ<select value={draft.documentType} onChange={(event) => updateDraft('documentType', event.target.value as 'CCCD' | 'PASSPORT')}>
                    {draft.nationalityCode === 'VN' && <option value="CCCD">CCCD</option>}
                    <option value="PASSPORT">Hộ chiếu</option>
                  </select></label>
                  <label className="wide user-create-document">{draft.documentType === 'CCCD' ? 'Số CCCD *' : 'Số hộ chiếu *'}<div className="user-create-input-shell"><input
                    value={draft.documentNumber}
                    onChange={(event) => updateDraft('documentNumber', event.target.value.toUpperCase())}
                    inputMode={draft.documentType === 'CCCD' ? 'numeric' : 'text'}
                    pattern={draft.documentType === 'CCCD' ? '[0-9]{12}' : '[A-Za-z0-9]{6,20}'}
                    minLength={draft.documentType === 'CCCD' ? 12 : 6}
                    maxLength={draft.documentType === 'CCCD' ? 12 : 20}
                    autoComplete="off"
                    required
                  />
                    {documentCheck !== 'idle' && <span className={`input-check ${documentCheck}`} aria-live="polite" title={documentCheck === 'error' ? 'Chưa thể kiểm tra trước; hệ thống sẽ kiểm tra khi tạo.' : undefined}>
                      {documentCheck === 'checking' ? <><SpinnerGap className="spinner" />Kiểm tra</> : documentCheck === 'available' ? <><CheckCircle />Dùng được</> : documentCheck === 'duplicate' ? <><WarningCircle />Đã tồn tại</> : <WarningCircle />}
                    </span>}
                  </div>
                  </label>
                </>}
                {section !== 'customers' && <label>{section === 'staff' ? 'Mã nhân viên' : 'Mã chủ nhà'}<input value={draft.referenceCode} onChange={(event) => updateDraft('referenceCode', event.target.value)} /></label>}
                {section === 'staff' && <label>Loại nhân viên<select value={draft.subtype} onChange={(event) => updateDraft('subtype', event.target.value)}><option value="STAFF">Nhân viên</option><option value="RECEPTIONIST">Lễ tân</option><option value="CTV">Cộng tác viên</option><option value="MANAGER">Quản lý</option><option value="ADMIN">Quản trị</option></select></label>}
                {section !== 'hosts' && <label className="user-create-date">{section === 'staff' ? 'Ngày bắt đầu' : 'Ngày sinh'}<input
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/yyyy"
                  pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
                  maxLength={10}
                  value={draft.relevantDate}
                  onChange={(event) => updateDraft('relevantDate', formatVietnameseDateInput(event.target.value))}
                /></label>}
                {section !== 'staff' && <label className="wide user-create-address">Địa chỉ<input value={draft.address} onChange={(event) => updateDraft('address', event.target.value)} maxLength={500} /></label>}
                {section === 'hosts' && <label>Mã số thuế<input value={draft.taxCode} onChange={(event) => updateDraft('taxCode', event.target.value)} maxLength={40} /></label>}
                  <label className="wide user-create-reason">Lý do tạo hồ sơ (tùy chọn)<textarea value={draft.reason} onChange={(event) => updateDraft('reason', event.target.value)} maxLength={500} /></label>
                </div>
                {createError && <p className="form-message error" role="alert">{createError}</p>}
              </div>
              <footer><button type="button" onClick={() => setCreating(false)}>Hủy</button><button className="primary" type="submit" disabled={createState === 'saving'}>{createState === 'saving' ? <><SpinnerGap className="spinner" />Đang tạo</> : 'Tạo hồ sơ'}</button></footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
