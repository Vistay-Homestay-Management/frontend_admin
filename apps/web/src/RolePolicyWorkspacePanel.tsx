import { useEffect, useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Check, Plus, ShieldCheck, SpinnerGap, X } from '@phosphor-icons/react'
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

gsap.registerPlugin(ScrollTrigger, useGSAP)

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
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const canRead = viewer.permissions.includes('role:read')
  const canRequest = viewer.permissions.includes('role:change-request')
  const canApprove = viewer.permissions.includes('role:change-approve')
  const selected = useMemo(() => roles.find((role) => role.code === selectedCode), [roles, selectedCode])

  async function load() {
    if (!canRead) return
    const workspace = await fetchRolePolicyWorkspace(graphqlUrl, accessToken, accountType)
    setRoles(workspace.roles)
    setPermissions(workspace.permissions.filter((permission) => permission.active))
    setPending(workspace.pendingRequests)
    const next = workspace.roles.find((role) => role.active) ?? workspace.roles[0]
    setSelectedCode(next?.code ?? '')
    setSelectedPermissions(new Set(next?.grants.map((grant) => grant.permissionCode) ?? []))
  }

  useEffect(() => { void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Không thể tải role policy')) }, [accountType, canRead])

  useGSAP(() => {
    if (!root.current) return
    const cards = gsap.utils.toArray<HTMLElement>('.role-policy-card', root.current)
    cards.forEach((card, index) => gsap.fromTo(card, { y: 48 + index * 12, scale: 0.96, opacity: 0.25 }, {
      y: 0, scale: 1, opacity: 1,
      scrollTrigger: { trigger: card, start: 'top 92%', end: 'top 58%', scrub: 0.45 },
    }))
    const trigger = ScrollTrigger.create({
      trigger: root.current,
      start: 'top 120px',
      end: 'bottom bottom-=120',
      pin: root.current.querySelector('.role-policy-heading'),
      pinSpacing: false,
    })
    return () => trigger.kill()
  }, { scope: root, dependencies: [roles.length, pending.length] })

  function selectRole(role: RolePolicyRole) {
    setSelectedCode(role.code)
    setSelectedPermissions(new Set(role.grants.map((grant) => grant.permissionCode)))
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

  const activeCodes = new Set(selected?.grants.map((grant) => grant.permissionCode) ?? [])
  return (
    <section className="role-policy-workspace" ref={root} aria-label="Dynamic role policy workspace">
      <div className="role-policy-heading">
        <ShieldCheck weight="duotone" />
        <h3>Role policy v2</h3>
        <p>Mỗi thay đổi là một đề xuất có version, lý do và checker độc lập.</p>
        {message && <p className="role-policy-message" role="status">{message}</p>}
      </div>

      <div className="role-policy-stack">
        <article className="authorization-card role-policy-card role-catalog-card">
          <header><h3>Catalog</h3><strong>{roles.filter((role) => role.active).length}</strong></header>
          <div className="role-policy-tabs">
            {roles.map((role) => <button key={role.code} className={role.code === selectedCode ? 'active' : ''} onClick={() => selectRole(role)}>
              {role.code}<small>v{role.roleVersion}{role.systemRole ? ' · system' : ''}</small>
            </button>)}
          </div>
        </article>

        {selected && <article className="authorization-card role-policy-card permission-accordion">
          <header><div><h3>{selected.displayName}</h3><p>{selected.description}</p></div><strong>v{selected.roleVersion}</strong></header>
          <div className="permission-grid">
            {permissions.map((permission) => <button key={permission.code} disabled={!canRequest || busy}
              className={selectedPermissions.has(permission.code) ? 'permission-choice active' : 'permission-choice'}
              onClick={() => togglePermission(permission.code)}>
              <span>{permission.code}</span><small>{permission.description}</small>
              {selectedPermissions.has(permission.code) ? <Check /> : <Plus />}
            </button>)}
          </div>
          <label>Lý do<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={8} /></label>
          <div className="role-policy-actions">
            <button className="primary-button" disabled={!canRequest || busy || reason.trim().length < 8}
              onClick={() => void mutate(() => requestRolePermissionChange(graphqlUrl, accessToken, {
                roleCode: selected.code, accountType,
                addGrants: [...selectedPermissions].filter((code) => !activeCodes.has(code)).map((permissionCode) => ({ permissionCode, allowedScopes: ['ALL'], partitionTypes: [] })),
                removePermissionCodes: [...activeCodes].filter((code) => !selectedPermissions.has(code)),
                expectedRoleVersion: selected.roleVersion, reason: reason.trim(), idempotencyKey: crypto.randomUUID(),
              }), 'Đã gửi permission diff cho checker.')}>{busy ? <SpinnerGap className="spinner" /> : <Check />} Gửi permission diff</button>
            {!selected.systemRole && selected.active && <button disabled={!canRequest || busy || reason.trim().length < 8}
              onClick={() => void mutate(() => requestDeactivateRole(graphqlUrl, accessToken, {
                roleCode: selected.code, accountType, expectedRoleVersion: selected.roleVersion,
                reason: reason.trim(), idempotencyKey: crypto.randomUUID(),
              }), 'Đã gửi đề xuất deactivate role.')}><X /> Deactivate</button>}
          </div>
        </article>}

        <article className="authorization-card role-policy-card role-create-card">
          <header><h3>Tạo custom role</h3><Plus /></header>
          <div className="role-create-fields"><input placeholder="ROLE_CODE" value={newCode} onChange={(event) => setNewCode(event.target.value.toUpperCase())} /><input placeholder="Tên hiển thị" value={newName} onChange={(event) => setNewName(event.target.value)} /></div>
          <button className="primary-button" disabled={!canRequest || busy || !newCode || newName.length < 3 || reason.trim().length < 8 || selectedPermissions.size === 0}
            onClick={() => void mutate(() => requestCreateRole(graphqlUrl, accessToken, {
              code: newCode, displayName: newName, accountType,
              grants: [...selectedPermissions].map((permissionCode) => ({ permissionCode, allowedScopes: ['ALL'], partitionTypes: [] })),
              reason: reason.trim(), idempotencyKey: crypto.randomUUID(),
            }), 'Đã gửi đề xuất tạo role.')}>Tạo đề xuất</button>
        </article>

        <article className="authorization-card role-policy-card checker-card">
          <header><h3>Checker queue</h3><strong>{pending.length}</strong></header>
          {pending.map((request) => <div className="checker-row" key={request.id}><div><strong>{request.roleCode}</strong><small>{request.changeType} · {request.reason}</small></div>{canApprove && <div><button onClick={() => void mutate(() => reviewRolePolicyChange(graphqlUrl, accessToken, request.id, 'Approved after independent policy review', true), 'Đã phê duyệt role policy.')}><Check /></button><button onClick={() => void mutate(() => reviewRolePolicyChange(graphqlUrl, accessToken, request.id, 'Rejected after independent policy review', false), 'Đã từ chối role policy.')}><X /></button></div>}</div>)}
          {!pending.length && <p>Không có thay đổi đang chờ.</p>}
        </article>
      </div>
    </section>
  )
}
