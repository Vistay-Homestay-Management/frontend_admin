import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  Check,
  ClockCounterClockwise,
  MagnifyingGlass,
  ShieldCheck,
  SpinnerGap,
  UserFocus,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  approveAuthorizationChange,
  fetchAuthorizationWorkspace,
  fetchAuthorizationSubject,
  reduceAuthorizationScopes,
  rejectAuthorizationChange,
  requestAuthorizationChange,
  revokeRoleAssignment,
  type AccountType,
  type AuthorizationChangeRequest,
  type AuthorizationAssignment,
  type AuthorizationRole,
  type AuthorizationWorkspace,
  type BackofficeViewer,
  type DataScope,
} from '@vistay/admin-api-client'
import heroImage from './assets/hero.png'

gsap.registerPlugin(ScrollTrigger, useGSAP)

interface AuthorizationConsoleProps {
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type MutationState = 'idle' | 'saving' | 'success' | 'error'

const accountTypes: Array<{ value: AccountType; label: string }> = [
  { value: 'ADMIN', label: 'Backoffice' },
  { value: 'HOST', label: 'Chủ nhà' },
  { value: 'CUSTOMER', label: 'Khách hàng' },
]

const scopeLabels: Record<DataScope, string> = {
  SELF: 'Bản thân',
  OWN: 'Sở hữu',
  ASSIGNED: 'Được giao',
  ALL: 'Toàn hệ thống',
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Đã có lỗi không xác định'
}

function hasPermission(viewer: BackofficeViewer, permission: string): boolean {
  return viewer.permissions.includes(permission)
}

function formatDate(value: string | null): string {
  if (!value) return 'Không giới hạn'
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function makeIdempotencyKey(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function AuthorizationConsole({ graphqlUrl, accessToken, viewer }: AuthorizationConsoleProps) {
  const root = useRef<HTMLElement>(null)
  const auditViewport = useRef<HTMLDivElement>(null)
  const [accountType, setAccountType] = useState<AccountType>('ADMIN')
  const [accountId, setAccountId] = useState(viewer.accountId)
  const [workspace, setWorkspace] = useState<AuthorizationWorkspace>()
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [loadError, setLoadError] = useState<string>()
  const [selectedRoleCode, setSelectedRoleCode] = useState<string>()
  const [reason, setReason] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [scopeOverrides, setScopeOverrides] = useState<Record<string, DataScope[]>>({})
  const [mutationState, setMutationState] = useState<MutationState>('idle')
  const [mutationMessage, setMutationMessage] = useState<string>()
  const [reviewing, setReviewing] = useState<AuthorizationChangeRequest>()
  const [reviewReason, setReviewReason] = useState('')
  const [editingAssignment, setEditingAssignment] = useState<AuthorizationAssignment>()
  const [retainedScopes, setRetainedScopes] = useState<Record<string, DataScope[]>>({})
  const [reductionReason, setReductionReason] = useState('')

  const canRead = hasPermission(viewer, 'authorization:read')
  const canGrant = hasPermission(viewer, 'authorization:grant')
  const canApprove = hasPermission(viewer, 'authorization:approve')
  const canRevoke = hasPermission(viewer, 'authorization:revoke')

  const selectedRole = useMemo(
    () => workspace?.catalog.find((role) => role.code === selectedRoleCode),
    [selectedRoleCode, workspace?.catalog],
  )

  useGSAP(() => {
    if (!root.current || !workspace) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return

    const context = gsap.context(() => {
      gsap.from('.authorization-console .authorization-card', {
        y: 34,
        opacity: 0,
        duration: 0.65,
        stagger: 0.07,
        ease: 'power3.out',
      })
      ScrollTrigger.matchMedia({
        '(min-width: 1100px)': () => ScrollTrigger.create({
          trigger: '.authorization-workflow',
          start: 'top 112px',
          end: 'bottom bottom-=120',
          pin: '.workflow-heading',
          pinSpacing: false,
        }),
      })
      gsap.utils.toArray<HTMLElement>('.request-card').forEach((card, index) => {
        gsap.fromTo(card, { y: 18 + index * 6 }, {
          y: 0,
          scrollTrigger: { trigger: card, start: 'top 88%', end: 'top 58%', scrub: 0.5 },
        })
      })
    }, root)
    return () => context.revert()
  }, { scope: root, dependencies: [workspace] })

  async function loadWorkspace(type = accountType, id = accountId) {
    if (!canRead || !id.trim()) return
    setLoadState('loading')
    setLoadError(undefined)
    try {
      const data = await fetchAuthorizationWorkspace(graphqlUrl, accessToken, type, id.trim())
      setWorkspace(data)
      setSelectedRoleCode(data.catalog[0]?.code)
      setScopeOverrides({})
      setLoadState('ready')
    } catch (error) {
      setWorkspace(undefined)
      setLoadError(messageOf(error))
      setLoadState('error')
    }
  }

  useEffect(() => {
    if (canRead) void loadWorkspace('ADMIN', viewer.accountId)
    // The signed-in account is the deliberate initial lookup target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, viewer.accountId])

  function submitLookup(event: FormEvent) {
    event.preventDefault()
    void loadWorkspace()
  }

  function selectRole(role: AuthorizationRole) {
    setSelectedRoleCode(role.code)
    setScopeOverrides(Object.fromEntries(role.policies.map((policy) => [policy.permissionCode, policy.defaultScopes])))
    setMutationState('idle')
    setMutationMessage(undefined)
  }

  function toggleScope(permissionCode: string, scope: DataScope) {
    setScopeOverrides((current) => {
      const scopes = current[permissionCode] ?? []
      if (scopes.length === 1 && scopes[0] === scope) return current
      return {
        ...current,
        [permissionCode]: scopes.includes(scope)
          ? scopes.filter((item) => item !== scope)
          : [...scopes, scope],
      }
    })
  }

  async function submitChange(event: FormEvent) {
    event.preventDefault()
    if (!workspace || !selectedRole || reason.trim().length < 8) return
    setMutationState('saving')
    setMutationMessage(undefined)
    try {
      await requestAuthorizationChange(graphqlUrl, accessToken, {
        targetSubjectId: workspace.subject.id,
        roleCode: selectedRole.code,
        scopeOverrides: selectedRole.policies.map((policy) => ({
          permissionCode: policy.permissionCode,
          scopes: scopeOverrides[policy.permissionCode] ?? policy.defaultScopes,
        })),
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        reason: reason.trim(),
        expectedAuthorizationVersion: workspace.subject.authorizationVersion,
        idempotencyKey: makeIdempotencyKey(),
      })
      setMutationState('success')
      setMutationMessage('Đã tạo yêu cầu. Một quản trị viên khác phải phê duyệt.')
      setReason('')
      setValidUntil('')
      await loadWorkspace()
    } catch (error) {
      setMutationState('error')
      setMutationMessage(messageOf(error))
    }
  }

  async function review(decision: 'approve' | 'reject') {
    if (!reviewing || !workspace || reviewReason.trim().length < 8) return
    setMutationState('saving')
    setMutationMessage(undefined)
    try {
      if (decision === 'approve') {
        const target = reviewing.targetSubjectId === workspace.subject.id
          ? workspace.subject
          : await fetchAuthorizationSubject(graphqlUrl, accessToken, reviewing.targetSubjectId)
        await approveAuthorizationChange(
          graphqlUrl,
          accessToken,
          reviewing.id,
          reviewReason.trim(),
          target.authorizationVersion,
        )
      } else {
        await rejectAuthorizationChange(graphqlUrl, accessToken, reviewing.id, reviewReason.trim())
      }
      setReviewing(undefined)
      setReviewReason('')
      setMutationState('success')
      setMutationMessage(decision === 'approve' ? 'Yêu cầu đã được phê duyệt.' : 'Yêu cầu đã bị từ chối.')
      await loadWorkspace()
    } catch (error) {
      setMutationState('error')
      setMutationMessage(messageOf(error))
    }
  }

  function editAssignment(assignment: AuthorizationAssignment) {
    setEditingAssignment(assignment)
    setRetainedScopes(Object.fromEntries(assignment.grants.map((grant) => [grant.permissionCode, grant.scopes])))
    setReductionReason('')
    setMutationMessage(undefined)
  }

  function toggleRetainedScope(permissionCode: string, scope: DataScope) {
    setRetainedScopes((current) => {
      const scopes = current[permissionCode] ?? []
      return {
        ...current,
        [permissionCode]: scopes.includes(scope)
          ? scopes.filter((item) => item !== scope)
          : [...scopes, scope],
      }
    })
  }

  async function saveReduction(action: 'reduce' | 'revoke') {
    if (!workspace || !editingAssignment || reductionReason.trim().length < 8) return
    setMutationState('saving')
    setMutationMessage(undefined)
    try {
      if (action === 'revoke') {
        await revokeRoleAssignment(
          graphqlUrl,
          accessToken,
          editingAssignment.id,
          reductionReason.trim(),
          workspace.subject.authorizationVersion,
        )
      } else {
        await reduceAuthorizationScopes(graphqlUrl, accessToken, {
          assignmentId: editingAssignment.id,
          retainedScopes: Object.entries(retainedScopes).map(([permissionCode, scopes]) => ({ permissionCode, scopes })),
          reason: reductionReason.trim(),
          expectedAuthorizationVersion: workspace.subject.authorizationVersion,
        })
      }
      setEditingAssignment(undefined)
      setMutationState('success')
      setMutationMessage(action === 'revoke' ? 'Vai trò đã được thu hồi.' : 'Phạm vi quyền đã được thu hẹp.')
      await loadWorkspace()
    } catch (error) {
      setMutationState('error')
      setMutationMessage(messageOf(error))
    }
  }

  function moveAudit(direction: -1 | 1) {
    auditViewport.current?.scrollBy({ left: direction * 360, behavior: 'smooth' })
  }

  if (!canRead) {
    return (
      <section className="authorization-console authorization-locked" id="authorization">
        <ShieldCheck weight="duotone" />
        <div>
          <p className="eyebrow">KIỂM SOÁT TRUY CẬP</p>
          <h2>Bạn chưa có quyền xem phân quyền.</h2>
          <p>Cần quyền <code>authorization:read</code>. Giao diện không gửi truy vấn quản trị khi quyền này không có trong viewer.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="authorization-console" id="authorization" ref={root}>
      <header className="authorization-hero">
        <div>
          <p className="eyebrow">MAKER–CHECKER AUTHORIZATION</p>
          <h2>
            Phân quyền rõ đến từng
            <span className="inline-title-image" style={{ backgroundImage: `url(${heroImage})` }} aria-hidden />
            phạm vi dữ liệu.
          </h2>
          <p>Tra cứu subject, tạo yêu cầu tăng quyền và phê duyệt bằng đúng phiên bản authorization đang hiệu lực.</p>
        </div>
        <form className="subject-search" onSubmit={submitLookup}>
          <label>
            Loại tài khoản
            <select value={accountType} onChange={(event) => setAccountType(event.target.value as AccountType)}>
              {accountTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label>
            Account ID
            <input value={accountId} onChange={(event) => setAccountId(event.target.value)} required />
          </label>
          <button className="primary-button" disabled={loadState === 'loading'}>
            {loadState === 'loading' ? <SpinnerGap className="spinner" /> : <MagnifyingGlass />}
            Tra cứu
          </button>
        </form>
      </header>

      {loadState === 'error' && (
        <div className="authorization-alert error" role="alert">
          <WarningCircle /><span>{loadError}</span>
          <button onClick={() => void loadWorkspace()}><ArrowClockwise /> Thử lại</button>
        </div>
      )}

      {loadState === 'loading' && !workspace && (
        <div className="authorization-loading" aria-live="polite"><SpinnerGap className="spinner" /> Đang tải dữ liệu phân quyền…</div>
      )}

      {workspace && (
        <>
          <div className="authorization-bento">
            <article className="authorization-card subject-card">
              <div className="card-heading"><UserFocus /><span>{workspace.subject.active ? 'Đang hoạt động' : 'Đã khóa'}</span></div>
              <h3>{workspace.subject.accountType}</h3>
              <p>{workspace.subject.accountId}</p>
              <dl>
                <div><dt>Phiên bản</dt><dd>{workspace.subject.authorizationVersion}</dd></div>
                <div><dt>Vai trò</dt><dd>{workspace.subject.assignments.length}</dd></div>
                <div><dt>Quyền hiệu lực</dt><dd>{workspace.subject.effectiveGrants.length}</dd></div>
              </dl>
            </article>

            <article className="authorization-card effective-card">
              <p className="eyebrow">QUYỀN HIỆU LỰC</p>
              <div className="grant-cloud">
                {workspace.subject.effectiveGrants.map((grant) => (
                  <span key={grant.permissionCode} title={grant.scopes.map((scope) => scopeLabels[scope]).join(', ')}>
                    {grant.permissionCode}<small>{grant.scopes.join(' · ')}</small>
                  </span>
                ))}
                {workspace.subject.effectiveGrants.length === 0 && <p>Subject chưa có quyền nghiệp vụ.</p>}
              </div>
            </article>

            <article className="authorization-card assignment-card">
              <p className="eyebrow">VAI TRÒ ĐANG GÁN</p>
              {workspace.subject.assignments.map((assignment) => (
                <div className="assignment-row" key={assignment.id}>
                  <div><strong>{assignment.roleCode}</strong><span>{formatDate(assignment.validUntil)}</span></div>
                  {canRevoke && <button type="button" onClick={() => editAssignment(assignment)}>Điều chỉnh</button>}
                </div>
              ))}
              {workspace.subject.assignments.length === 0 && <p>Chưa có vai trò.</p>}
            </article>
          </div>

          <section className="authorization-workflow">
            <div className="workflow-heading">
              <p className="eyebrow">LUỒNG THAY ĐỔI</p>
              <h3>Một người tạo.<br />Một người duyệt.</h3>
              <p>Mọi lần mở rộng quyền đều để lại lý do, version và audit trail.</p>
            </div>

            <div className="workflow-content">
              <article className="authorization-card role-builder">
                <div className="section-heading">
                  <div><p className="eyebrow">ROLE CATALOG</p><h3>Tạo yêu cầu cấp quyền</h3></div>
                  <span>{workspace.catalog.length} mẫu vai trò</span>
                </div>
                <div className="role-accordion" aria-label="Danh mục vai trò">
                  {workspace.catalog.map((role) => (
                    <button
                      type="button"
                      key={role.code}
                      className={selectedRoleCode === role.code ? 'active' : ''}
                      onClick={() => selectRole(role)}
                    >
                      <strong>{role.displayName}</strong>
                      <small>{role.code}</small>
                    </button>
                  ))}
                </div>

                {selectedRole && (
                  <form className="change-form" onSubmit={submitChange}>
                    <div className="policy-list">
                      {selectedRole.policies.map((policy) => (
                        <div className="policy-row" key={policy.permissionCode}>
                          <strong>{policy.permissionCode}</strong>
                          <div>
                            {policy.allowedScopes.map((scope) => (
                              <button
                                type="button"
                                key={scope}
                                className={(scopeOverrides[policy.permissionCode] ?? policy.defaultScopes).includes(scope) ? 'selected' : ''}
                                onClick={() => toggleScope(policy.permissionCode, scope)}
                              >
                                {scopeLabels[scope]}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="form-grid">
                      <label>Lý do thay đổi<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} required placeholder="Ít nhất 8 ký tự" /></label>
                      <label>Hiệu lực đến<input type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></label>
                    </div>
                    <button className="primary-button" disabled={!canGrant || mutationState === 'saving'}>
                      {mutationState === 'saving' ? <SpinnerGap className="spinner" /> : <ShieldCheck />}
                      {canGrant ? 'Gửi yêu cầu phê duyệt' : 'Thiếu quyền authorization:grant'}
                    </button>
                  </form>
                )}
              </article>

              <article className="authorization-card review-queue">
                <div className="section-heading">
                  <div><p className="eyebrow">PENDING QUEUE</p><h3>Chờ phê duyệt</h3></div>
                  <span>{workspace.pendingRequests.length}</span>
                </div>
                <div className="request-stack">
                  {workspace.pendingRequests.map((request) => (
                    <button className="request-card" type="button" key={request.id} onClick={() => { setReviewing(request); setReviewReason('') }}>
                      <span>{request.changeType}</span>
                      <strong>{request.roleCode}</strong>
                      <p>{request.reason}</p>
                      <small>Hết hạn {formatDate(request.expiresAt)}</small>
                    </button>
                  ))}
                  {workspace.pendingRequests.length === 0 && <div className="queue-empty"><Check /> Không có yêu cầu đang chờ.</div>}
                </div>
              </article>
            </div>
          </section>

          <section className="authorization-audit">
            <div className="section-heading">
              <div><p className="eyebrow">AUDIT TRAIL</p><h3>Lịch sử thay đổi</h3></div>
              <div className="carousel-controls">
                <button onClick={() => moveAudit(-1)} aria-label="Xem sự kiện trước"><ArrowLeft /></button>
                <button onClick={() => moveAudit(1)} aria-label="Xem sự kiện tiếp theo"><ArrowRight /></button>
              </div>
            </div>
            <div className="audit-carousel" ref={auditViewport}>
              {workspace.auditError && (
                <div className="audit-forbidden"><WarningCircle />{workspace.auditError}</div>
              )}
              {workspace.audit.map((event) => (
                <article key={event.id}>
                  <ClockCounterClockwise />
                  <span>{formatDate(event.createdAt)}</span>
                  <h4>{event.action}</h4>
                  <p>{event.reason}</p>
                  <small>{event.correlationId ?? 'Không có correlation ID'}</small>
                </article>
              ))}
              {!workspace.auditError && workspace.audit.length === 0 && <p>Chưa có sự kiện audit cho subject này.</p>}
            </div>
          </section>
        </>
      )}

      {mutationMessage && <div className={`authorization-toast ${mutationState}`} role="status">{mutationMessage}</div>}

      {reviewing && (
        <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="review-title">
          <form className="review-dialog" onSubmit={(event) => event.preventDefault()}>
            <button className="dialog-close" type="button" onClick={() => setReviewing(undefined)} aria-label="Đóng"><X /></button>
            <p className="eyebrow">MAKER–CHECKER REVIEW</p>
            <h3 id="review-title">{reviewing.roleCode}</h3>
            <p>{reviewing.reason}</p>
            <label>Lý do duyệt hoặc từ chối<textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} minLength={8} required /></label>
            {!canApprove && <div className="authorization-alert error"><WarningCircle /> Thiếu quyền authorization:approve</div>}
            <div className="dialog-actions">
              <button type="button" className="reject-button" disabled={!canApprove || mutationState === 'saving'} onClick={() => void review('reject')}><X /> Từ chối</button>
              <button type="button" className="approve-button" disabled={!canApprove || mutationState === 'saving'} onClick={() => void review('approve')}><Check /> Phê duyệt</button>
            </div>
          </form>
        </div>
      )}

      {editingAssignment && (
        <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="reduction-title">
          <form className="review-dialog reduction-dialog" onSubmit={(event) => event.preventDefault()}>
            <button className="dialog-close" type="button" onClick={() => setEditingAssignment(undefined)} aria-label="Đóng"><X /></button>
            <p className="eyebrow">LEAST PRIVILEGE</p>
            <h3 id="reduction-title">{editingAssignment.roleCode}</h3>
            <p>Chỉ có thể bỏ quyền hoặc phạm vi đang có. Việc thêm quyền phải đi qua maker–checker.</p>
            <div className="retained-list">
              {editingAssignment.grants.map((grant) => (
                <div key={grant.permissionCode}>
                  <strong>{grant.permissionCode}</strong>
                  <span>
                    {grant.scopes.map((scope) => (
                      <button
                        type="button"
                        key={scope}
                        className={(retainedScopes[grant.permissionCode] ?? []).includes(scope) ? 'selected' : ''}
                        onClick={() => toggleRetainedScope(grant.permissionCode, scope)}
                      >
                        {scopeLabels[scope]}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <label>Lý do thu hẹp quyền<textarea value={reductionReason} onChange={(event) => setReductionReason(event.target.value)} minLength={8} required /></label>
            <div className="dialog-actions">
              <button type="button" className="reject-button" disabled={mutationState === 'saving'} onClick={() => void saveReduction('revoke')}><X /> Thu hồi vai trò</button>
              <button type="button" className="approve-button" disabled={mutationState === 'saving'} onClick={() => void saveReduction('reduce')}><Check /> Lưu phạm vi</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
