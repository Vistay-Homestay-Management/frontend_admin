import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowClockwise,
  CheckCircle,
  EnvelopeSimple,
  Key,
  LinkSimple,
  LockKey,
  MagnifyingGlass,
  PaperPlaneTilt,
  Plus,
  ShieldCheck,
  SpinnerGap,
  UserCircle,
  WarningCircle,
  X,
  XCircle,
} from '@phosphor-icons/react'
import {
  createProfileAccount,
  fetchIdentityPolicies,
  fetchProfileLinkReviews,
  fetchUserDirectory,
  reviewProfileLink,
  updateIdentityPolicy,
  type BackofficeViewer,
  type IdentityPolicy,
  type ProfileLinkReview,
  type UserDirectoryAccountType,
  type UserDirectoryEntry,
} from '@vistay/admin-api-client'

export type IdentityAccountSection = 'customers' | 'hosts' | 'admins'
type IdentityAccountView = 'unlinked' | 'linked' | 'reviews'

const sectionType: Record<IdentityAccountSection, UserDirectoryAccountType> = {
  customers: 'CUSTOMER', hosts: 'HOST', admins: 'ADMIN',
}

const sectionCopy: Record<IdentityAccountSection, { title: string; permission: string }> = {
  customers: { title: 'Khách hàng', permission: 'customer-account:provision' },
  hosts: { title: 'Chủ nhà', permission: 'host-account:provision' },
  admins: { title: 'Nhân viên', permission: 'admin-account:provision' },
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase()
}

export function IdentityAccountWorkspace({ graphqlUrl, authApiUrl, accessToken, viewer, section }: {
  graphqlUrl: string
  authApiUrl: string
  accessToken: string
  viewer: BackofficeViewer
  section: IdentityAccountSection
}) {
  const accountType = sectionType[section]
  const copy = sectionCopy[section]
  const [nodes, setNodes] = useState<UserDirectoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reviews, setReviews] = useState<ProfileLinkReview[]>([])
  const [policy, setPolicy] = useState<IdentityPolicy>()
  const [activeView, setActiveView] = useState<IdentityAccountView>('unlinked')
  const [policyOpen, setPolicyOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [previewed, setPreviewed] = useState<UserDirectoryEntry>()
  const [selected, setSelected] = useState<UserDirectoryEntry>()
  const [mode, setMode] = useState<'DIRECT' | 'INVITATION'>('INVITATION')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [reason, setReason] = useState('')
  const [attemptKey, setAttemptKey] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [reviewing, setReviewing] = useState<{ item: ProfileLinkReview; decision: 'APPROVE' | 'REJECT' }>()
  const [reviewReason, setReviewReason] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [policyDraft, setPolicyDraft] = useState<{ registrationEnabled: boolean; linkMode: IdentityPolicy['linkMode'] }>()
  const [policyReason, setPolicyReason] = useState('')
  const [policyAttemptKey, setPolicyAttemptKey] = useState<string>()
  const [policySaving, setPolicySaving] = useState(false)
  const [policyMessage, setPolicyMessage] = useState('')
  const canReadUsers = viewer.permissions.includes('user:read')
  const canProvision = viewer.permissions.includes(copy.permission)
  const canReadReviews = viewer.permissions.includes('identity-link:read')
  const canApprove = viewer.permissions.includes('identity-link:approve')
  const canReject = viewer.permissions.includes('identity-link:reject')
  const canReadPolicy = viewer.permissions.includes('identity-policy:read')
  const canUpdatePolicy = viewer.permissions.includes('identity-policy:update')
  const unavailableCapabilities = [
    !canProvision ? copy.permission : undefined,
    !canReadReviews ? 'identity-link:read' : undefined,
    !canReadPolicy ? 'identity-policy:read' : undefined,
  ].filter((permission): permission is string => Boolean(permission))

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!canReadUsers) return
    setLoading(true)
    setError('')
    setPreviewed(undefined)
    try {
      const requests = [
        fetchUserDirectory(graphqlUrl, accessToken, { accountType, first: 100 }, signal),
        canReadReviews
          ? fetchProfileLinkReviews(graphqlUrl, accessToken, { profileType: accountType, status: 'APPROVAL_PENDING', first: 100 }, signal)
          : Promise.resolve([]),
        canReadPolicy ? fetchIdentityPolicies(graphqlUrl, accessToken, signal) : Promise.resolve([]),
      ] as const
      const [directory, pendingReviews, policies] = await Promise.all(requests)
      setNodes(directory.nodes)
      setReviews(pendingReviews)
      const currentPolicy = policies.find((item) => item.accountType === accountType)
      setPolicy(currentPolicy)
      if (currentPolicy) setPolicyDraft({ registrationEnabled: currentPolicy.registrationEnabled, linkMode: currentPolicy.linkMode })
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : 'Không thể tải workspace tài khoản')
    } finally {
      setLoading(false)
    }
  }, [accessToken, accountType, canReadPolicy, canReadReviews, canReadUsers, graphqlUrl])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const unlinked = useMemo(() => nodes.filter((entry) => !entry.accountId), [nodes])
  const linked = useMemo(() => nodes.filter((entry) => entry.accountId), [nodes])
  const visibleAccounts = useMemo(() => {
    const source = activeView === 'linked' ? linked : unlinked
    const query = search.trim().toLocaleLowerCase('vi')
    if (!query) return source
    return source.filter((entry) => `${entry.displayName} ${entry.email ?? ''} ${entry.contactPhone ?? ''} ${entry.profileId} ${entry.accountId ?? ''}`.toLocaleLowerCase('vi').includes(query))
  }, [activeView, linked, search, unlinked])

  function changeView(view: IdentityAccountView) {
    setActiveView(view)
    setPreviewed(undefined)
    setSearch('')
  }

  function openAccount(entry: UserDirectoryEntry, nextMode: 'DIRECT' | 'INVITATION') {
    setSelected(entry)
    setMode(nextMode)
    setTemporaryPassword('')
    setReason('')
    setAttemptKey(undefined)
    setActionError('')
  }

  async function submitAccount(event: FormEvent) {
    event.preventDefault()
    if (!selected || !selected.email || !canProvision || reason.trim().length < 8 || (mode === 'DIRECT' && temporaryPassword.length < 12)) return
    setSaving(true)
    setActionError('')
    const idempotencyKey = attemptKey ?? crypto.randomUUID()
    setAttemptKey(idempotencyKey)
    try {
      await createProfileAccount(authApiUrl, accessToken, idempotencyKey, {
        profileId: selected.profileId,
        accountType,
        email: selected.email,
        displayName: selected.displayName,
        mode,
        temporaryPassword: mode === 'DIRECT' ? temporaryPassword : undefined,
        reason: reason.trim(),
      })
      setSelected(undefined)
      setAttemptKey(undefined)
      await load()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Không thể tạo tài khoản')
    } finally {
      setSaving(false)
    }
  }

  async function submitReview() {
    if (!reviewing || reviewReason.trim().length < 8) return
    setReviewSaving(true)
    try {
      await reviewProfileLink(graphqlUrl, accessToken, {
        linkId: reviewing.item.linkId,
        decision: reviewing.decision,
        reason: reviewReason.trim(),
      })
      setReviewing(undefined)
      setReviewReason('')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xử lý yêu cầu liên kết')
    } finally {
      setReviewSaving(false)
    }
  }

  async function savePolicy() {
    if (!policy || !policyDraft || !canUpdatePolicy || policyReason.trim().length < 8) return
    setPolicySaving(true)
    setPolicyMessage('')
    const idempotencyKey = policyAttemptKey ?? crypto.randomUUID()
    setPolicyAttemptKey(idempotencyKey)
    try {
      const updated = await updateIdentityPolicy(graphqlUrl, accessToken, {
        ...policyDraft,
        accountType,
        policyVersion: policy.policyVersion,
        reason: policyReason,
        idempotencyKey,
      })
      setPolicy(updated)
      setPolicyDraft({ registrationEnabled: updated.registrationEnabled, linkMode: updated.linkMode })
      setPolicyReason('')
      setPolicyAttemptKey(undefined)
      setPolicyMessage('Đã lưu. Authentication sẽ đồng bộ cấu hình sang realm tương ứng qua event.')
    } catch (cause) {
      setPolicyMessage(cause instanceof Error ? cause.message : 'Không thể cập nhật policy')
    } finally {
      setPolicySaving(false)
    }
  }

  if (!canReadUsers) return <section className="identity-account-denied"><LockKey /><div><h2>Chưa có quyền xem tài khoản</h2><p>Cần <code>user:read</code>; các hành động tạo tài khoản vẫn được kiểm tra riêng theo từng loại.</p></div></section>

  return (
    <section className="identity-account-workspace">
      <header className="identity-account-commandbar">
        <nav aria-label={`Danh sách tài khoản ${copy.title.toLowerCase()}`}>
          <button type="button" className={activeView === 'unlinked' ? 'active' : ''} onClick={() => changeView('unlinked')}><span>Chưa có tài khoản</span><strong>{unlinked.length}</strong></button>
          <button type="button" className={activeView === 'linked' ? 'active' : ''} onClick={() => changeView('linked')}><span>Đã liên kết</span><strong>{linked.length}</strong></button>
          {canReadReviews && <button type="button" className={activeView === 'reviews' ? 'active' : ''} onClick={() => changeView('reviews')}><span>Chờ duyệt</span><strong>{reviews.length}</strong></button>}
        </nav>
        <div className="identity-account-tools">
          {canReadPolicy && policy && <button type="button" className={`identity-policy-trigger${policyOpen ? ' active' : ''}`} onClick={() => setPolicyOpen((open) => !open)}><Key /><span>Đăng ký {policy.registrationEnabled ? 'bật' : 'tắt'} · {policy.linkMode === 'AUTO_LINK' ? 'Tự liên kết' : 'Cần duyệt'}</span></button>}
          {activeView !== 'reviews' && <label className="identity-account-search"><MagnifyingGlass /><span className="sr-only">Tìm hồ sơ tài khoản</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên, email, điện thoại hoặc mã" /></label>}
        </div>
      </header>

      {unavailableCapabilities.length > 0 && (
        <aside className="identity-capability-notice">
          <LockKey />
          <div><strong>Một số thao tác đang ở chế độ chỉ xem</strong><span>Role hiện tại chưa có {unavailableCapabilities.map((permission) => <code key={permission}>{permission}</code>)}.</span></div>
        </aside>
      )}

      {policyOpen && policy && policyDraft && (
        <section className="identity-policy-strip">
          <header><div><strong>Cấu hình đăng ký và liên kết</strong><span>Phiên bản {policy.policyVersion}</span></div><button type="button" onClick={() => setPolicyOpen(false)} aria-label="Đóng cấu hình"><X /></button></header>
          <div className="identity-policy-options">
            <label><input type="checkbox" checked={policyDraft.registrationEnabled} disabled={!canUpdatePolicy} onChange={(event) => { setPolicyDraft({ ...policyDraft, registrationEnabled: event.target.checked }); setPolicyAttemptKey(undefined) }} /><span><strong>Cho phép đăng ký trên web</strong><small>Tắt để chặn self sign-up ở portal {copy.title.toLowerCase()}.</small></span></label>
            <label><span>Luồng sau OTP</span><select value={policyDraft.linkMode} disabled={!canUpdatePolicy} onChange={(event) => { setPolicyDraft({ ...policyDraft, linkMode: event.target.value as IdentityPolicy['linkMode'] }); setPolicyAttemptKey(undefined) }}><option value="AUTO_LINK">Tự động liên kết</option><option value="REQUIRE_APPROVAL">Chờ Admin duyệt</option></select></label>
            {canUpdatePolicy && <label className="reason"><span>Lý do thay đổi</span><textarea value={policyReason} onChange={(event) => { setPolicyReason(event.target.value); setPolicyAttemptKey(undefined) }} minLength={8} maxLength={500} /></label>}
          </div>
          {policyMessage && <p className="identity-policy-message">{policyMessage}</p>}
          {canUpdatePolicy && <button className="identity-policy-save" disabled={policySaving || policyReason.trim().length < 8} onClick={() => void savePolicy()}>{policySaving ? <SpinnerGap className="spinner" /> : <CheckCircle />}Lưu policy</button>}
        </section>
      )}

      {loading && <div className="inline-state"><SpinnerGap className="spinner" />Đang tải tài khoản…</div>}
      {error && <div className="inline-state error"><WarningCircle /><span>{error}</span><button onClick={() => void load()}><ArrowClockwise />Thử lại</button></div>}

      {!loading && !error && (
        <section className={`identity-account-board${activeView === 'reviews' ? ' review-mode' : ''}`}>
          <div className="identity-account-results">
            <header className="identity-account-table-head">
              <span>Hồ sơ</span><span>Liên hệ</span><span>Trạng thái</span><span>Thao tác</span>
            </header>
          {activeView === 'unlinked' && <>
            <div className="identity-account-list">
              {visibleAccounts.map((entry) => (
                <article key={entry.profileId} onMouseEnter={() => setPreviewed(entry)}>
                  <span className="identity-mini-avatar">{initials(entry.displayName) || <UserCircle />}</span>
                  <div><strong>{entry.displayName}</strong><small>{entry.profileId}</small></div>
                  <span className="identity-account-contact">{entry.email ?? 'Chưa có email'}</span>
                  <span className="identity-pending-state"><LockKey />Chưa liên kết</span>
                  <div className="identity-row-actions">
                    {canProvision && entry.email
                      ? <><button onClick={() => openAccount(entry, 'DIRECT')}><Plus />Tạo tài khoản</button><button onClick={() => openAccount(entry, 'INVITATION')}><PaperPlaneTilt />Gửi link</button></>
                      : <span className="identity-action-locked" title={entry.email ? `Cần quyền ${copy.permission}` : 'Hồ sơ cần email trước khi cấp tài khoản'}><LockKey />{entry.email ? 'Chỉ xem' : 'Thiếu email'}</span>}
                  </div>
                </article>
              ))}
              {!visibleAccounts.length && <p className="identity-account-empty">Không có hồ sơ chưa liên kết phù hợp.</p>}
            </div>
          </>}

          {activeView === 'linked' && <>
            <div className="identity-account-list">
              {visibleAccounts.map((entry) => (
                <article key={entry.profileId} onMouseEnter={() => setPreviewed(entry)}><span className="identity-mini-avatar linked"><CheckCircle /></span><div><strong>{entry.displayName}</strong><small>{entry.profileId}</small></div><span className="identity-account-contact">{entry.email ?? entry.accountId}</span><span className="identity-linked-state"><LinkSimple />Đã liên kết</span><span className="identity-account-id">{entry.accountId}</span></article>
              ))}
              {!visibleAccounts.length && <p className="identity-account-empty">Không có tài khoản liên kết phù hợp.</p>}
            </div>
          </>}

          {activeView === 'reviews' && canReadReviews && <div className="identity-account-list identity-review-list">
            {reviews.map((item) => (
              <article key={item.linkId}><span className="identity-mini-avatar"><ShieldCheck /></span><div><strong>{item.displayName ?? 'Hồ sơ chưa đặt tên'}</strong><small>{item.profileId}</small></div><span className="identity-account-contact">{item.maskedRecipient ?? 'Email được bảo vệ'}</span><span className="identity-pending-state">{new Date(item.requestedAt).toLocaleString('vi-VN')}</span><div className="identity-row-actions">{canApprove && <button onClick={() => { setReviewing({ item, decision: 'APPROVE' }); setReviewReason('') }}><CheckCircle />Duyệt</button>}{canReject && <button className="danger" onClick={() => { setReviewing({ item, decision: 'REJECT' }); setReviewReason('') }}><XCircle />Từ chối</button>}</div></article>
            ))}
            {!reviews.length && <p className="identity-account-empty">Không có yêu cầu liên kết đang chờ.</p>}
          </div>}
          </div>
          {activeView !== 'reviews' && <aside className={`identity-account-inspector${previewed ? ' populated' : ''}`} aria-live="polite">
            {previewed ? <>
              <header><span className="identity-mini-avatar">{initials(previewed.displayName) || <UserCircle />}</span><div><small>Xem nhanh hồ sơ</small><strong>{previewed.displayName}</strong></div></header>
              <dl>
                <div><dt>Email</dt><dd>{previewed.email ?? 'Chưa cập nhật'}</dd></div>
                <div><dt>Điện thoại</dt><dd>{previewed.contactPhone ?? 'Chưa cập nhật'}</dd></div>
                <div><dt>Tài khoản</dt><dd>{previewed.accountId ? 'Đã liên kết' : 'Chưa liên kết'}</dd></div>
                <div><dt>Mã hồ sơ</dt><dd>{previewed.profileId}</dd></div>
              </dl>
            </> : <div className="identity-account-inspector-empty"><UserCircle /><strong>Xem nhanh hồ sơ</strong><span>Di chuột vào một bản ghi để xem thông tin.</span></div>}
          </aside>}
        </section>
      )}

      {selected && (
        <div className="user-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(undefined) }}>
          <section className="user-create-dialog identity-account-dialog" role="dialog" aria-modal="true">
            <header><div><span>{mode === 'DIRECT' ? 'TẠO TRỰC TIẾP' : 'EMAIL INVITATION'}</span><h3>{selected.displayName}</h3></div><button onClick={() => setSelected(undefined)} aria-label="Đóng"><X /></button></header>
            <form onSubmit={(event) => void submitAccount(event)}>
              <div className="identity-account-mode"><button type="button" className={mode === 'DIRECT' ? 'active' : ''} onClick={() => { setMode('DIRECT'); setAttemptKey(undefined) }}>Tạo tài khoản</button><button type="button" className={mode === 'INVITATION' ? 'active' : ''} onClick={() => { setMode('INVITATION'); setAttemptKey(undefined) }}>Gửi link</button></div>
              <p className="identity-dialog-note">Tài khoản mới vẫn phải hoàn tất CCCD và OTP email để liên kết hồ sơ. Lệnh này không tự nhận quyền sở hữu hồ sơ.</p>
              {mode === 'DIRECT' && <label>Mật khẩu tạm<input type="password" minLength={12} maxLength={128} value={temporaryPassword} onChange={(event) => { setTemporaryPassword(event.target.value); setAttemptKey(undefined) }} /></label>}
              <label>Lý do<textarea minLength={8} maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); setAttemptKey(undefined) }} /></label>
              {actionError && <p className="form-message error">{actionError}</p>}
              <footer><button type="button" onClick={() => setSelected(undefined)}>Hủy</button><button className="primary" disabled={saving || reason.trim().length < 8 || (mode === 'DIRECT' && temporaryPassword.length < 12)}>{saving ? <SpinnerGap className="spinner" /> : mode === 'DIRECT' ? <Plus /> : <EnvelopeSimple />}{mode === 'DIRECT' ? 'Tạo tài khoản' : 'Gửi link tạo tài khoản'}</button></footer>
            </form>
          </section>
        </div>
      )}

      {reviewing && (
        <div className="user-create-backdrop"><section className="user-create-dialog identity-review-dialog" role="dialog" aria-modal="true"><header><div><span>MAKER-CHECKER</span><h3>{reviewing.decision === 'APPROVE' ? 'Duyệt liên kết' : 'Từ chối liên kết'}</h3></div><button onClick={() => setReviewing(undefined)}><X /></button></header><form onSubmit={(event) => { event.preventDefault(); void submitReview() }}><p className="identity-dialog-note">{reviewing.item.displayName ?? reviewing.item.profileId}</p><label>Lý do<textarea autoFocus minLength={8} maxLength={500} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></label><footer><button type="button" onClick={() => setReviewing(undefined)}>Hủy</button><button className="primary" disabled={reviewSaving || reviewReason.trim().length < 8}>{reviewSaving ? <SpinnerGap className="spinner" /> : reviewing.decision === 'APPROVE' ? <CheckCircle /> : <XCircle />}Xác nhận</button></footer></form></section></div>
      )}
    </section>
  )
}
