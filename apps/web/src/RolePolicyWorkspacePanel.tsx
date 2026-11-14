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

export function RolePolicyWorkspacePanel({ graphqlUrl, accessToken, viewer, accountType }: {
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
  accountType: AccountType
}) {
  const root = useRef<HTMLElement>(null)
  const [roles, setRoles] = useState<RolePolicyRole[]>([])
  const [permissions, setPermissions] = useState<PermissionCatalogEntry[]>([])
  const [pending, setPending] = useState<Awaited<ReturnType<typeof fetchRolePolicyWorkspace>>['pendingRequests']>([])
  const [selectedCode, setSelectedCode] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())
  const [permissionSearch, setPermissionSearch] = useState('')
  const [permissionView, setPermissionView] = useState<PermissionView>('all')
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const canRead = viewer.permissions.includes('role:read')
  const canRequest = viewer.permissions.includes('role:change-request')
  const canApprove = viewer.permissions.includes('role:change-approve')
  const selected = useMemo(() => roles.find((role) => role.code === selectedCode), [roles, selectedCode])
  const activeCodes = useMemo(() => new Set(selected?.grants.map((grant) => grant.permissionCode) ?? []), [selected])
  const additions = useMemo(() => [...selectedPermissions].filter((code) => !activeCodes.has(code)), [activeCodes, selectedPermissions])
  const removals = useMemo(() => [...activeCodes].filter((code) => !selectedPermissions.has(code)), [activeCodes, selectedPermissions])

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
    setSelectedCode(role.code)
    setSelectedPermissions(new Set(role.grants.map((grant) => grant.permissionCode)))
    setPermissionView('all')
    setMessage('')
  }

  function togglePermission(code: string) {
    setSelectedPermissions((current) => {
      const next = new Set(current)
      if (next.has(code)) next.delete(code); else next.add(code)
      return next
    })
  }

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('')
    try { await action(); setMessage(success); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Thay đổi role thất bại') }
    finally { setBusy(false) }
  }

  if (!canRead) return null

  return (
    <section className="role-policy-workspace" ref={root} aria-label="Quản lý role và quyền">
      <header className="role-policy-heading">
        <div><ShieldCheck weight="duotone" /><div><h3>Role &amp; quyền</h3><p>Chọn role, điều chỉnh quyền theo nhóm và gửi checker phê duyệt.</p></div></div>
        <span>{permissions.length} quyền · {roles.filter((role) => role.active).length} role</span>
      </header>

      {message && <p className="role-policy-message" role="status">{message}</p>}
      {loading && !roles.length && <div className="inline-state"><SpinnerGap className="spinner" />Đang tải danh mục quyền…</div>}

      {!!roles.length && <div className="role-policy-editor">
        <aside className="role-catalog-card">
          <header><span>Danh sách role</span><strong>{roles.length}</strong></header>
          <div className="role-policy-tabs">
            {roles.map((role) => (
              <button key={role.code} className={role.code === selectedCode ? 'active' : ''} onClick={() => selectRole(role)}>
                <span>{role.displayName}</span><small>{role.code} · v{role.roleVersion}{role.systemRole ? ' · hệ thống' : ''}</small>
              </button>
            ))}
          </div>
        </aside>

        {selected && <main className="permission-editor">
          <header className="permission-editor-heading">
            <div><span>Đang chỉnh sửa</span><h3>{selected.displayName}</h3><p>{selected.description || selected.code}</p></div>
            <strong>v{selected.roleVersion}</strong>
          </header>

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
            <label><span>Lý do thay đổi</span><input value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} placeholder="Mô tả lý do, tối thiểu 8 ký tự" /></label>
            <div className="permission-diff"><span className="added">+{additions.length} thêm</span><span className="removed">−{removals.length} bỏ</span></div>
            <div className="role-policy-actions">
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
            </div>
          </footer>
        </main>}
      </div>}

      <div className="role-policy-secondary">
        <article className="role-create-card">
          <header><div><span>Custom role</span><h3>Tạo role mới</h3></div><Plus /></header>
          <p>Role mới dùng tập quyền đang chọn ở trình chỉnh sửa phía trên.</p>
          <div className="role-create-fields"><input placeholder="ROLE_CODE" value={newCode} onChange={(event) => setNewCode(event.target.value.toUpperCase())} /><input placeholder="Tên hiển thị" value={newName} onChange={(event) => setNewName(event.target.value)} /></div>
          <button className="primary-button" disabled={!canRequest || busy || !newCode || newName.length < 3 || reason.trim().length < 8 || selectedPermissions.size === 0}
            onClick={() => void mutate(() => requestCreateRole(graphqlUrl, accessToken, {
              code: newCode, displayName: newName, accountType,
              grants: [...selectedPermissions].map((permissionCode) => ({ permissionCode, allowedScopes: ['ALL'], partitionTypes: [] })),
              reason: reason.trim(), idempotencyKey: crypto.randomUUID(),
            }), 'Đã gửi đề xuất tạo role.')}>Tạo đề xuất với {selectedPermissions.size} quyền</button>
        </article>

        <article className="checker-card">
          <header><div><span>Maker–checker</span><h3>Chờ phê duyệt</h3></div><strong>{pending.length}</strong></header>
          <div className="checker-list">
            {pending.map((request) => <div className="checker-row" key={request.id}><div><strong>{request.roleCode}</strong><small>{request.changeType} · {request.reason}</small></div>{canApprove && <div><button title="Phê duyệt" onClick={() => void mutate(() => reviewRolePolicyChange(graphqlUrl, accessToken, request.id, 'Approved after independent policy review', true), 'Đã phê duyệt role policy.')}><Check /></button><button title="Từ chối" onClick={() => void mutate(() => reviewRolePolicyChange(graphqlUrl, accessToken, request.id, 'Rejected after independent policy review', false), 'Đã từ chối role policy.')}><X /></button></div>}</div>)}
            {!pending.length && <p><Check />Không có thay đổi đang chờ.</p>}
          </div>
        </article>
      </div>
    </section>
  )
}
