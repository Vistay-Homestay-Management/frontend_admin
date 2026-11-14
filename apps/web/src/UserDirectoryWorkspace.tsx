import { useCallback, useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  ArrowClockwise,
  CheckCircle,
  EnvelopeSimple,
  IdentificationCard,
  MagnifyingGlass,
  Phone,
  SpinnerGap,
  UserCircle,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react'
import {
  fetchProfileLinkReviews,
  fetchUserDirectory,
  reviewProfileLink,
  type BackofficeViewer,
  type ProfileLinkReview,
  type UserDirectoryAccountType,
  type UserDirectoryEntry,
} from '@vistay/admin-api-client'

export type UserDirectorySection = 'customers' | 'staff' | 'hosts'

const sectionType: Record<UserDirectorySection, UserDirectoryAccountType> = {
  customers: 'CUSTOMER',
  staff: 'ADMIN',
  hosts: 'HOST',
}

const sectionCopy: Record<UserDirectorySection, { title: string; description: string; empty: string }> = {
  customers: {
    title: 'Khách hàng',
    description: 'Thông tin liên hệ và trạng thái hồ sơ khách lưu trú.',
    empty: 'Chưa có hồ sơ khách hàng phù hợp.',
  },
  staff: {
    title: 'Nhân viên',
    description: 'Danh bạ nhân sự vận hành, mã nhân viên và ngày bắt đầu.',
    empty: 'Chưa có hồ sơ nhân viên phù hợp.',
  },
  hosts: {
    title: 'Chủ nhà',
    description: 'Thông tin đối tác chủ nhà và trạng thái xác minh hồ sơ.',
    empty: 'Chưa có hồ sơ chủ nhà phù hợp.',
  },
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase()
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Đang hoạt động',
    INACTIVE: 'Ngừng hoạt động',
    SUSPENDED: 'Tạm khóa',
    ANONYMIZED: 'Đã ẩn danh',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function detail(entry: UserDirectoryEntry): string {
  if (entry.accountType === 'ADMIN') return entry.subtype?.replaceAll('_', ' ') ?? 'Nhân viên'
  if (entry.accountType === 'HOST') return entry.verificationStatus?.replaceAll('_', ' ') ?? 'Chưa xác minh'
  return entry.accountId ? 'Đã liên kết tài khoản' : 'Hồ sơ chưa liên kết'
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
  const [reviews, setReviews] = useState<ProfileLinkReview[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewing, setReviewing] = useState<{ linkId: string; decision: 'APPROVE' | 'REJECT' } | null>(null)
  const [reviewReason, setReviewReason] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const allowed = viewer.permissions.includes('user:read')
  const canReadReviews = viewer.permissions.includes('identity-link:read')
  const canApprove = viewer.permissions.includes('identity-link:approve')
  const canReject = viewer.permissions.includes('identity-link:reject')
  const copy = sectionCopy[section]

  const load = useCallback(async (cursor: string | null = null, signal?: AbortSignal) => {
    if (!allowed) return
    if (cursor) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const page = await fetchUserDirectory(
        graphqlUrl,
        accessToken,
        { accountType: sectionType[section], search, first: 25, after: cursor },
        signal,
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

  const loadReviews = useCallback(async (signal?: AbortSignal) => {
    if (!canReadReviews || section === 'customers') return
    setReviewLoading(true)
    setReviewError('')
    try {
      setReviews(await fetchProfileLinkReviews(
        graphqlUrl,
        accessToken,
        { profileType: sectionType[section], status: 'APPROVAL_PENDING', first: 100 },
        signal,
      ))
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setReviewError(reason instanceof Error ? reason.message : 'Không thể tải yêu cầu liên kết')
    } finally {
      setReviewLoading(false)
    }
  }, [accessToken, canReadReviews, graphqlUrl, section])

  useEffect(() => {
    if (!allowed) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => void load(null, controller.signal), 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [allowed, load])

  useEffect(() => {
    const controller = new AbortController()
    void loadReviews(controller.signal)
    return () => controller.abort()
  }, [loadReviews])

  const submitReview = useCallback(async () => {
    if (!reviewing || reviewReason.trim().length < 8) {
      setReviewError('Lý do duyệt hoặc từ chối cần ít nhất 8 ký tự.')
      return
    }
    setSubmittingReview(true)
    setReviewError('')
    try {
      await reviewProfileLink(graphqlUrl, accessToken, {
        linkId: reviewing.linkId,
        reason: reviewReason,
        decision: reviewing.decision,
      })
      setReviews((current) => current.filter((item) => item.linkId !== reviewing.linkId))
      setReviewing(null)
      setReviewReason('')
      await load()
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : 'Không thể xử lý yêu cầu liên kết')
    } finally {
      setSubmittingReview(false)
    }
  }, [accessToken, graphqlUrl, load, reviewReason, reviewing])

  useGSAP(() => {
    if (loading || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('.user-directory-row', { opacity: 0, y: 10 }, {
      opacity: 1, y: 0, duration: 0.35, stagger: 0.035, ease: 'power2.out',
    })
  }, { scope: root, dependencies: [section, nodes.length, loading], revertOnUpdate: true })

  if (!allowed) {
    return <section className="user-directory-denied"><WarningCircle /><div><h2>Chưa có quyền xem người dùng</h2><p>Role cần grant <code>user:read</code> với scope <code>ALL</code>.</p></div></section>
  }

  return (
    <section ref={root} className="user-directory" aria-labelledby="user-directory-title">
      <header className="user-directory-heading">
        <div>
          <p className="eyebrow">DANH BẠ NGƯỜI DÙNG</p>
          <h2 id="user-directory-title">{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <label className="user-directory-search">
          <MagnifyingGlass aria-hidden="true" />
          <span className="sr-only">Tìm người dùng</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên, email, số điện thoại hoặc mã" />
        </label>
      </header>

      {canReadReviews && section !== 'customers' && (
        <section className="profile-link-review" aria-labelledby="profile-link-review-title">
          <header>
            <div><span>LIÊN KẾT TÀI KHOẢN</span><h3 id="profile-link-review-title">Chờ duyệt</h3></div>
            <strong>{reviews.length}</strong>
          </header>
          {reviewLoading && <div className="inline-state"><SpinnerGap className="spinner" />Đang tải yêu cầu…</div>}
          {reviewError && <div className="profile-link-review-error"><WarningCircle />{reviewError}</div>}
          {!reviewLoading && !reviews.length && !reviewError && <p className="profile-link-review-empty">Không có yêu cầu liên kết đang chờ.</p>}
          {reviews.map((item) => (
            <article key={item.linkId} className="profile-link-review-row">
              <div>
                <strong>{item.displayName ?? 'Hồ sơ chưa đặt tên'}</strong>
                <span>{item.maskedRecipient ?? 'Email đã được bảo vệ'} · {new Date(item.requestedAt).toLocaleString('vi-VN')}</span>
              </div>
              <div className="profile-link-review-actions">
                {canApprove && <button type="button" onClick={() => { setReviewing({ linkId: item.linkId, decision: 'APPROVE' }); setReviewReason('') }}><CheckCircle />Duyệt</button>}
                {canReject && <button type="button" className="danger" onClick={() => { setReviewing({ linkId: item.linkId, decision: 'REJECT' }); setReviewReason('') }}><XCircle />Từ chối</button>}
              </div>
              {reviewing?.linkId === item.linkId && (
                <div className="profile-link-review-form">
                  <label><span>Lý do</span><textarea autoFocus value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="Ghi rõ căn cứ xử lý (tối thiểu 8 ký tự)" /></label>
                  <button type="button" disabled={submittingReview} onClick={() => void submitReview()}>{submittingReview ? <SpinnerGap className="spinner" /> : reviewing.decision === 'APPROVE' ? <CheckCircle /> : <XCircle />}{reviewing.decision === 'APPROVE' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}</button>
                  <button type="button" className="quiet" onClick={() => { setReviewing(null); setReviewReason('') }}>Hủy</button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      <div className="user-directory-summary">
        <article><span>Tổng hồ sơ</span><strong>{totalCount.toLocaleString('vi-VN')}</strong></article>
        <article><span>Đang hiển thị</span><strong>{nodes.length.toLocaleString('vi-VN')}</strong></article>
        <article><span>Loại hồ sơ</span><strong>{copy.title}</strong></article>
      </div>

      {loading && <div className="inline-state"><SpinnerGap className="spinner" />Đang tải danh bạ…</div>}
      {error && <div className="inline-state error"><WarningCircle /><div><strong>Không tải được danh bạ</strong><span>{error}</span></div><button onClick={() => void load()}><ArrowClockwise />Thử lại</button></div>}

      {!loading && !error && (
        <div className="user-directory-board">
          <div className="user-directory-table-head" aria-hidden="true">
            <span>Người dùng</span><span>Liên hệ</span><span>Thông tin</span><span>Trạng thái</span>
          </div>
          <div className="user-directory-list">
            {nodes.map((entry) => (
              <article className="user-directory-row" key={entry.profileId}>
                <div className="user-directory-person">
                  <span className="user-directory-avatar">{initials(entry.displayName) || <UserCircle />}</span>
                  <div><strong>{entry.displayName}</strong><small>{entry.referenceCode ?? entry.profileId.slice(0, 8)}</small></div>
                </div>
                <div className="user-directory-contact">
                  <span><EnvelopeSimple />{entry.email ?? 'Chưa có email'}</span>
                  <span><Phone />{entry.contactPhone ?? 'Chưa có số điện thoại'}</span>
                </div>
                <div className="user-directory-meta">
                  <span><IdentificationCard />{detail(entry)}</span>
                  <small>{entry.joinedOn ? `Bắt đầu ${new Date(entry.joinedOn).toLocaleDateString('vi-VN')}` : `Cập nhật ${new Date(entry.updatedAt).toLocaleDateString('vi-VN')}`}</small>
                </div>
                <span className={`user-directory-status ${entry.status.toLowerCase()}`}><CheckCircle />{statusLabel(entry.status)}</span>
              </article>
            ))}
            {!nodes.length && <div className="user-directory-empty"><UserCircle /><strong>{copy.empty}</strong><span>Thử thay đổi từ khóa tìm kiếm.</span></div>}
          </div>
          {nextCursor && <button className="user-directory-more" type="button" disabled={loadingMore} onClick={() => void load(nextCursor)}>{loadingMore ? <><SpinnerGap className="spinner" />Đang tải…</> : `Xem thêm ${Math.max(totalCount - nodes.length, 0)} hồ sơ`}</button>}
        </div>
      )}
    </section>
  )
}
