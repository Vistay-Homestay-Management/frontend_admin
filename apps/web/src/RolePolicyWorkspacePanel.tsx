import { useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { Check, MagnifyingGlass, Plus, ShieldCheck, SpinnerGap, X } from '@phosphor-icons/react'
import {
  fetchRolePolicyWorkspace,
  requestCreateRole,
  requestDeactivateRole,
  requestRolePermissionChange,
  reviewRolePolicyChange,
  type AccountType,
  type BackofficeViewer,
  type PermissionCatalogEntry,
  type RolePolicyRole,
} from '@vistay/admin-api-client'

type PermissionView = 'all' | 'selected' | 'changed'

const accountTypeOptions: Array<{ value: AccountType; label: string }> = [
  { value: 'ADMIN', label: 'Backoffice' },
  { value: 'HOST', label: 'Chủ nhà' },
  { value: 'CUSTOMER', label: 'Khách hàng' },
]

const resourceLabels: Record<string, string> = {
  account: 'Tài khoản',
  admin: 'Quản trị viên',
  'admin-account': 'Tài khoản nhân viên',
  'admin-profile': 'Hồ sơ nhân viên',
  analytics: 'Thống kê',
  audit: 'Nhật ký kiểm toán',
  authorization: 'Phân quyền',
  booking: 'Đặt phòng',
  'booking-policy': 'Chính sách đặt phòng',
  'booking-sensitive': 'Dữ liệu thương mại',
  customer: 'Khách hàng',
  'customer-account': 'Tài khoản khách hàng',
  'customer-profile': 'Hồ sơ khách hàng',
  finance: 'Tài chính',
  host: 'Chủ nhà',
  'host-account': 'Tài khoản chủ nhà',
  'host-profile': 'Hồ sơ chủ nhà',
  'identity-document': 'Giấy tờ định danh',
  'identity-link': 'Liên kết danh tính',
  'identity-policy': 'Chính sách danh tính',
  inventory: 'Tồn phòng',
  loyalty: 'Hạng thành viên',
  media: 'Tài nguyên',
  notification: 'Thông báo',
  'notification-template': 'Mẫu thông báo',
  operations: 'Vận hành',
  payment: 'Thanh toán',
  pricing: 'Giá bán',
  profile: 'Hồ sơ',
  property: 'Căn hộ',
  report: 'Báo cáo',
  role: 'Role và quyền',
  settlement: 'Đối soát',
  user: 'Người dùng',
}

function resourceLabel(resource: string): string {
  return resourceLabels[resource] ?? resource.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    read: 'Xem', create: 'Tạo', update: 'Cập nhật', manage: 'Quản lý', publish: 'Xuất bản',
    delete: 'Xóa', approve: 'Phê duyệt', retry: 'Thử lại', cancel: 'Hủy', block: 'Khóa',
    'change-request': 'Đề xuất thay đổi', 'change-approve': 'Duyệt thay đổi',
  }
  return labels[action] ?? action.replaceAll('-', ' ')
}

export function RolePolicyWorkspacePanel({ graphqlUrl, accessToken, viewer, accountType, onAccountTypeChange }: {
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
  accountType: AccountType
  onAccountTypeChange?: (accountType: AccountType) => void
}) {
  const root = useRef<HTMLElement>(null)
  const [roles, setRoles] = useState<RolePolicyRole[]>([])
  const [permissions, setPermissions] = useState<PermissionCatalogEntry[]>([])
  const [pending, setPending] = useState<Awaited<ReturnType<typeof fetchRolePolicyWorkspace>>['pendingRequests']>([])
  const [selectedCode, setSelectedCode] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())
  const [roleSearch, setRoleSearch] = useState('')
  const [permissionSearch, setPermissionSearch] = useState('')
  const [permissionView, setPermissionView] = useState<PermissionView>('all')
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [reason, setReason] = useState('')
  const [creatingRole, setCreatingRole] = useState(false)
  const [approvalsOpen, setApprovalsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const canRead = viewer.permissions.includes('role:read')
  const canRequest = viewer.permissions.includes('role:change-request')
  const canApprove = viewer.permissions.includes('role:change-approve')
  const selected = useMemo(() => roles.find((role) => role.code === selectedCode), [roles, selectedCode])
  const activeCodes = useMemo(
    () => new Set(creatingRole ? [] : selected?.grants.map((grant) => grant.permissionCode) ?? []),
    [creatingRole, selected],
  )
  const additions = useMemo(() => [...selectedPermissions].filter((code) => !activeCodes.has(code)), [activeCodes, selectedPermissions])
  const removals = useMemo(() => [...activeCodes].filter((code) => !selectedPermissions.has(code)), [activeCodes, selectedPermissions])
  const visibleRoles = useMemo(() => {
    const query = roleSearch.trim().toLocaleLowerCase('vi')
    if (!query) return roles
    return roles.filter((role) => `${role.displayName} ${role.code} ${role.description ?? ''}`.toLocaleLowerCase('vi').includes(query))
  }, [roleSearch, roles])

  const groupedPermissions = useMemo(() => {
    const query = permissionSearch.trim().toLocaleLowerCase('vi')
    const visible = permissions.filter((permission) => {
      const selectedNow = selectedPermissions.has(permission.code)
      const changed = selectedNow !== activeCodes.has(permission.code)
      if (permissionView === 'selected' && !selectedNow) return false
      if (permissionView === 'changed' && !changed) return false
      return !query || `${permission.code} ${permission.description} ${resourceLabel(permission.resource)}`.toLocaleLowerCase('vi').includes(query)
    })
    const groups = new Map<string, PermissionCatalogEntry[]>()
    visible.forEach((permission) => groups.set(permission.resource, [...(groups.get(permission.resource) ?? []), permission]))
    return [...groups.entries()].sort(([a], [b]) => resourceLabel(a).localeCompare(resourceLabel(b), 'vi'))
  }, [activeCodes, permissionSearch, permissionView, permissions, selectedPermissions])

  async function load() {
    if (!canRead) return
    setLoading(true)
    try {
      const workspace = await fetchRolePolicyWorkspace(graphqlUrl, accessToken, accountType)
      setRoles(workspace.roles)
      setPermissions(workspace.permissions.filter((permission) => permission.active))
      setPending(workspace.pendingRequests)
      const next = workspace.roles.find((role) => role.code === selectedCode)
        ?? workspace.roles.find((role) => role.active)
        ?? workspace.roles[0]
      setSelectedCode(next?.code ?? '')
      setSelectedPermissions(new Set(next?.grants.map((grant) => grant.permissionCode) ?? []))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Không thể tải role policy'))
  }, [accountType, canRead])

  useGSAP(() => {
    if (!root.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('.permission-resource-card', { opacity: 0, y: 8 }, {
      opacity: 1, y: 0, duration: 0.28, stagger: 0.025, ease: 'power2.out',
    })
  }, { scope: root, dependencies: [selectedCode, groupedPermissions.length], revertOnUpdate: true })

  function selectRole(role: RolePolicyRole) {
    setCreatingRole(false)
    setSelectedCode(role.code)
    setSelectedPermissions(new Set(role.grants.map((grant) => grant.permissionCode)))
    setPermissionView('all')
    setMessage('')
  }

  function startCreatingRole() {
    setCreatingRole(true)
    setSelectedPermissions(new Set())
    setPermissionView('all')
    setPermissionSearch('')
    setNewCode('')
    setNewName('')
    setReason('')
    setMessage('')
  }

  function cancelCreatingRole() {
    const fallback = selected ?? roles.find((role) => role.active) ?? roles[0]
    setCreatingRole(false)
    setSelectedCode(fallback?.code ?? '')
    setSelectedPermissions(new Set(fallback?.grants.map((grant) => grant.permissionCode) ?? []))
    setReason('')
  }

  function changeAccountType(nextAccountType: AccountType) {
    setCreatingRole(false)
    setApprovalsOpen(false)
    onAccountTypeChange?.(nextAccountType)
  }

  function togglePermission(code: string) {
    setSelectedPermissions((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code); else next.add(code)
      return next
    })
  }

  async function mutate(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true); setMessage('')
    try { await action(); setMessage(success); await load(); return true }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Thay đổi role thất bại'); return false }
    finally { setBusy(false) }
  }

  async function submitNewRole() {
    const created = await mutate(() => requestCreateRole(graphqlUrl, accessToken, {
      code: newCode,
      displayName: newName,
      accountType,
      grants: [...selectedPermissions].map((permissionCode) => ({ permissionCode, allowedScopes: ['ALL'], partitionTypes: [] })),
      reason: reason.trim(),
      idempotencyKey: crypto.randomUUID(),
    }), 'Đã gửi đề xuất tạo role.')
    if (created) {
      setCreatingRole(false)
      setNewCode('')
      setNewName('')
      setReason('')
    }
  }

  if (!canRead) return null

  return (
    <section className="role-policy-workspace" ref={root} aria-label="Quản lý role và quyền">
      {message && <p className="role-policy-message" role="status">{message}</p>}
      {loading && !roles.length && <div className="inline-state"><SpinnerGap className="spinner" />Đang tải danh mục quyền…</div>}

      {(roles.length > 0 || canRequest) && <div className="role-policy-editor">
        {(creatingRole || selected) && <header className="permission-editor-heading role-policy-shared-header">
          <div className="permission-editor-context">
            <ShieldCheck weight="duotone" />
            <div><span>{creatingRole ? 'Khởi tạo policy' : 'Đang chỉnh sửa'}</span><h3>{creatingRole ? 'Tạo role mới' : selected?.displayName}</h3><p>{creatingRole ? `${selectedPermissions.size} quyền khởi tạo đã chọn` : selected?.description || selected?.code}</p></div>
            {!creatingRole && <strong>v{selected?.roleVersion}</strong>}
          </div>
          <div className="permission-editor-command-actions">
            <label><span>Đối tượng</span><select value={accountType} onChange={(event) => changeAccountType(event.target.value as AccountType)}>{accountTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {canRequest && !creatingRole && <button type="button" onClick={startCreatingRole}><Plus />Tạo role</button>}
            {canApprove && <button type="button" className={approvalsOpen ? 'active' : ''} onClick={() => setApprovalsOpen((open) => !open)}><Check />Danh sách duyệt{pending.length > 0 && <strong>{pending.length}</strong>}</button>}
          </div>
          {creatingRole && <div className="role-create-inline">
            <label><span>Mã role</span><input autoFocus placeholder="VD: BOOKING_SUPERVISOR" value={newCode} onChange={(event) => setNewCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} /></label>
            <label><span>Tên hiển thị</span><input placeholder="Tên role" value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
          </div>}
        </header>}

        <aside className="role-catalog-card">
          <label className="role-catalog-search">
            <MagnifyingGlass />
            <span className="sr-only">Tìm kiếm trong danh sách role</span>
            <input value={roleSearch} onChange={(event) => setRoleSearch(event.target.value)} placeholder={`Tìm kiếm trong ${roles.length} role`} />
          </label>
          <div className="role-policy-tabs">
            {visibleRoles.map((role) => (
              <button key={role.code} className={!creatingRole && role.code === selectedCode ? 'active' : ''} onClick={() => selectRole(role)}>
                <span>{role.displayName}</span><small>{role.code} · v{role.roleVersion}{role.systemRole ? ' · hệ thống' : ''}</small>
              </button>
            ))}
            {!visibleRoles.length && <div className="role-catalog-empty"><MagnifyingGlass /><span>Không tìm thấy role phù hợp.</span></div>}
          </div>
        </aside>

        {(creatingRole || selected) && <main className={`permission-editor${creatingRole ? ' creating' : ''}`}>
          <div className="permission-toolbar">
            <label><MagnifyingGlass /><input value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder="Tìm resource, action hoặc mã quyền" /></label>
            <div role="group" aria-label="Lọc quyền">
              {([['all', 'Tất cả'], ['selected', `Đã chọn ${selectedPermissions.size}`], ['changed', `Thay đổi ${additions.length + removals.length}`]] as const).map(([value, label]) => (
                <button type="button" key={value} className={permissionView === value ? 'active' : ''} onClick={() => setPermissionView(value)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="permission-resource-grid">
            {groupedPermissions.map(([resource, entries]) => (
              <section className="permission-resource-card" key={resource}>
                <header><div><span>{resourceLabel(resource)}</span><small>{resource}</small></div><strong>{entries.filter((entry) => selectedPermissions.has(entry.code)).length}/{entries.length}</strong></header>
                <div>
                  {entries.map((permission) => {
                    const checked = selectedPermissions.has(permission.code)
                    const changed = checked !== activeCodes.has(permission.code)
                    return <button
                      type="button"
                      key={permission.code}
                      disabled={!canRequest || busy}
                      className={`permission-choice${checked ? ' active' : ''}${changed ? ' changed' : ''}`}
                      onClick={() => togglePermission(permission.code)}
                      aria-pressed={checked}
                      title={permission.description ?? permission.code}
                    >
                      <span className="permission-check">{checked && <Check />}</span>
                      <span><strong>{actionLabel(permission.action)}</strong><small>{permission.code}</small></span>
                    </button>
                  })}
                </div>
              </section>
            ))}
            {!groupedPermissions.length && <div className="permission-empty"><MagnifyingGlass /><strong>Không có quyền phù hợp</strong><span>Đổi từ khóa hoặc bộ lọc để xem lại danh mục.</span></div>}
          </div>

          <footer className="permission-submit">
            <label><span>{creatingRole ? 'Lý do tạo role' : 'Lý do thay đổi'}</span><input value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} placeholder="Mô tả lý do, tối thiểu 8 ký tự" /></label>
            <div className="permission-diff">{creatingRole
              ? <span className="added">{selectedPermissions.size} quyền đã chọn</span>
              : <><span className="added">+{additions.length} thêm</span><span className="removed">−{removals.length} bỏ</span></>}
            </div>
            <div className="role-policy-actions">
              {creatingRole ? <>
                <button type="button" disabled={busy} onClick={cancelCreatingRole}><X />Hủy</button>
                <button className="primary-button" disabled={!canRequest || busy || !newCode || newName.trim().length < 3 || reason.trim().length < 8 || selectedPermissions.size === 0}
                  onClick={() => void submitNewRole()}>{busy ? <SpinnerGap className="spinner" /> : <Plus />}Gửi đề xuất tạo</button>
              </> : selected && <>
              {!selected.systemRole && selected.active && <button type="button" disabled={!canRequest || busy || reason.trim().length < 8}
                onClick={() => void mutate(() => requestDeactivateRole(graphqlUrl, accessToken, {
                  roleCode: selected.code, accountType, expectedRoleVersion: selected.roleVersion,
                  reason: reason.trim(), idempotencyKey: crypto.randomUUID(),
                }), 'Đã gửi đề xuất ngừng role.')}><X />Ngừng role</button>}
              <button className="primary-button" disabled={!canRequest || busy || reason.trim().length < 8 || additions.length + removals.length === 0}
                onClick={() => void mutate(() => requestRolePermissionChange(graphqlUrl, accessToken, {
                  roleCode: selected.code, accountType,
                  addGrants: additions.map((permissionCode) => ({ permissionCode, allowedScopes: ['ALL'], partitionTypes: [] })),
                  removePermissionCodes: removals,
                  expectedRoleVersion: selected.roleVersion, reason: reason.trim(), idempotencyKey: crypto.randomUUID(),
                }), 'Đã gửi permission diff cho checker.')}>{busy ? <SpinnerGap className="spinner" /> : <Check />}Gửi thay đổi</button>
              </>}
            </div>
          </footer>
        </main>}
      </div>}

      {approvalsOpen && canApprove && <section className="role-approval-tray" aria-label="Thay đổi role chờ phê duyệt">
        <header><div><strong>Danh sách duyệt</strong><span>{pending.length > 0 ? `${pending.length} thay đổi cần checker độc lập` : 'Chưa có thay đổi nào cần xử lý'}</span></div><button type="button" onClick={() => setApprovalsOpen(false)} aria-label="Đóng danh sách chờ duyệt"><X /></button></header>
        <div className="checker-list">
          {pending.map((request) => <div className="checker-row" key={request.id}><div><strong>{request.roleCode}</strong><small>{request.changeType} · {request.reason}</small></div><div><button title="Phê duyệt" onClick={() => void mutate(() => reviewRolePolicyChange(graphqlUrl, accessToken, request.id, 'Approved after independent policy review', true), 'Đã phê duyệt role policy.')}><Check /></button><button title="Từ chối" onClick={() => void mutate(() => reviewRolePolicyChange(graphqlUrl, accessToken, request.id, 'Rejected after independent policy review', false), 'Đã từ chối role policy.')}><X /></button></div></div>)}
          {!pending.length && <div className="role-approval-empty"><Check /><strong>Đã xử lý hết</strong><span>Đề xuất mới sẽ xuất hiện tại đây.</span></div>}
        </div>
      </section>}
    </section>
  )
}
