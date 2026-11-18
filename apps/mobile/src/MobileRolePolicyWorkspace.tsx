import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { fetch as expoFetch } from 'expo/fetch'
import * as Crypto from 'expo-crypto'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  fetchRolePolicyWorkspace, requestCreateRole, requestDeactivateRole, requestRolePermissionChange, reviewRolePolicyChange,
  type AccountType, type BackofficeViewer, type PermissionCatalogEntry, type RolePolicyChangeRequest, type RolePolicyRole,
} from '@vistay/admin-api-client'
import { palette, radii } from './ui/theme'

const mobileFetch = expoFetch as typeof globalThis.fetch
const accountTypes: { value: AccountType; label: string }[] = [{ value: 'ADMIN', label: 'Nhân viên' }, { value: 'HOST', label: 'Chủ nhà' }, { value: 'CUSTOMER', label: 'Khách hàng' }]

export function MobileRolePolicyWorkspace({ accessToken, graphqlUrl, viewer }: { accessToken: string; graphqlUrl: string; viewer: BackofficeViewer }) {
  const [accountType, setAccountType] = useState<AccountType>('ADMIN')
  const [roles, setRoles] = useState<RolePolicyRole[]>([])
  const [permissions, setPermissions] = useState<PermissionCatalogEntry[]>([])
  const [pending, setPending] = useState<RolePolicyChangeRequest[]>([])
  const [selectedCode, setSelectedCode] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())
  const [roleSearch, setRoleSearch] = useState('')
  const [permissionSearch, setPermissionSearch] = useState('')
  const [reason, setReason] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const canRead = viewer.permissions.includes('role:read')
  const canRequest = viewer.permissions.includes('role:change-request')
  const canApprove = viewer.permissions.includes('role:change-approve')

  const load = useCallback(async (preferred?: string) => {
    if (!canRead) return
    setLoading(true); setMessage('')
    try {
      const data = await fetchRolePolicyWorkspace(graphqlUrl, accessToken, accountType, mobileFetch)
      setRoles(data.roles); setPermissions(data.permissions.filter((item) => item.active)); setPending(data.pendingRequests)
      const role = data.roles.find((item) => item.code === preferred) ?? data.roles.find((item) => item.active) ?? data.roles[0]
      setSelectedCode(role?.code ?? ''); setSelectedPermissions(new Set(role?.grants.map((grant) => grant.permissionCode) ?? []))
    } catch (reasonValue) { setMessage(reasonValue instanceof Error ? reasonValue.message : 'Không tải được role policy.') }
    finally { setLoading(false) }
  }, [accessToken, accountType, canRead, graphqlUrl])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  const selected = roles.find((role) => role.code === selectedCode)
  const activeCodes = new Set(selected?.grants.map((grant) => grant.permissionCode) ?? [])
  const additions = [...selectedPermissions].filter((code) => !activeCodes.has(code))
  const removals = [...activeCodes].filter((code) => !selectedPermissions.has(code))
  const visibleRoles = roles.filter((role) => `${role.displayName} ${role.code}`.toLocaleLowerCase('vi').includes(roleSearch.trim().toLocaleLowerCase('vi')))
  const groups = useMemo(() => {
    const query = permissionSearch.trim().toLocaleLowerCase('vi')
    const map = new Map<string, PermissionCatalogEntry[]>()
    for (const permission of permissions) {
      if (query && !`${permission.code} ${permission.resource} ${permission.action} ${permission.description ?? ''}`.toLocaleLowerCase('vi').includes(query)) continue
      const list = map.get(permission.resource) ?? []; list.push(permission); map.set(permission.resource, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [permissionSearch, permissions])

  function selectRole(role: RolePolicyRole) { setSelectedCode(role.code); setSelectedPermissions(new Set(role.grants.map((grant) => grant.permissionCode))); setReason(''); setMessage('') }
  function toggle(code: string) { setSelectedPermissions((current) => { const next = new Set(current); if (next.has(code)) next.delete(code); else next.add(code); return next }) }
  async function mutate(action: () => Promise<unknown>, success: string) { setBusy(true); setMessage(''); try { await action(); setMessage(success); await load(selectedCode) } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Thao tác thất bại.') } finally { setBusy(false) } }
  async function saveChanges() { if (!selected) return; await mutate(() => requestRolePermissionChange(graphqlUrl, accessToken, { roleCode: selected.code, accountType, addGrants: additions.map((permissionCode) => ({ permissionCode, allowedScopes: ['ALL'], partitionTypes: [] })), removePermissionCodes: removals, expectedRoleVersion: selected.roleVersion, reason: reason.trim(), idempotencyKey: Crypto.randomUUID() }, mobileFetch), 'Đã gửi thay đổi cho checker.') }
  async function createRole() { await mutate(() => requestCreateRole(graphqlUrl, accessToken, { code: newCode, displayName: newName, accountType, grants: [...selectedPermissions].map((permissionCode) => ({ permissionCode, allowedScopes: ['ALL'], partitionTypes: [] })), reason: reason.trim(), idempotencyKey: Crypto.randomUUID() }, mobileFetch), 'Đã gửi đề xuất tạo role.'); setCreateOpen(false); setNewCode(''); setNewName('') }

  if (!canRead) return <View style={styles.denied}><Ionicons name="lock-closed-outline" size={25} color={palette.sage} /><Text style={styles.roleName}>Cần quyền role:read</Text></View>
  return <View style={styles.root}>
    <View style={styles.topRow}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountTypes}>{accountTypes.map((item) => <Chip key={item.value} active={item.value === accountType} label={item.label} onPress={() => setAccountType(item.value)} />)}</ScrollView><View style={styles.topActions}>{canRequest && <Pressable onPress={() => { setCreateOpen(true); setSelectedPermissions(new Set()); setReason('') }} style={styles.iconButton}><Ionicons name="add" size={20} color={palette.evergreen} /></Pressable>}{canApprove && <Pressable onPress={() => setApprovalOpen(true)} style={styles.iconButton}><Ionicons name="checkmark-done-outline" size={19} color={palette.evergreen} />{pending.length > 0 && <Text style={styles.badge}>{pending.length}</Text>}</Pressable>}</View></View>
    {message && <Text style={styles.message}>{message}</Text>}
    {loading && !roles.length ? <View style={styles.loading}><ActivityIndicator color={palette.evergreen} /></View> : <>
      <View style={styles.roleArea}><View style={styles.search}><Ionicons name="search" size={16} color={palette.evergreen} /><TextInput value={roleSearch} onChangeText={setRoleSearch} placeholder={`Tìm trong ${roles.length} role`} placeholderTextColor={palette.muted} style={styles.searchInput} /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleList}>{visibleRoles.map((role) => <Pressable key={role.code} onPress={() => selectRole(role)} style={[styles.roleCard, role.code === selectedCode && styles.roleCardActive]}><Text numberOfLines={1} style={[styles.roleName, role.code === selectedCode && styles.roleNameActive]}>{role.displayName}</Text><Text numberOfLines={1} style={[styles.roleMeta, role.code === selectedCode && styles.roleMetaActive]}>{role.code} · v{role.roleVersion} · {role.grants.length} quyền</Text></Pressable>)}</ScrollView></View>
      {selected && <View style={styles.editor}>
        <View style={styles.editorHeader}><View style={styles.editorTitle}><Text style={styles.roleName}>{selected.displayName}</Text><Text style={styles.roleMeta}>{selected.code} · {selected.systemRole ? 'Role hệ thống' : 'Role tùy chỉnh'}</Text></View><Text style={styles.diff}>+{additions.length} / −{removals.length}</Text></View>
        <View style={styles.search}><Ionicons name="search" size={16} color={palette.evergreen} /><TextInput value={permissionSearch} onChangeText={setPermissionSearch} placeholder="Tìm resource, action hoặc mã quyền" placeholderTextColor={palette.muted} style={styles.searchInput} /></View>
        <ScrollView nestedScrollEnabled style={styles.permissionScroll} contentContainerStyle={styles.permissionGroups}>
          {groups.map(([resource, entries]) => <View key={resource} style={styles.permissionGroup}><View style={styles.groupHeader}><View><Text style={styles.groupName}>{resource}</Text><Text style={styles.roleMeta}>{entries.length} action</Text></View><Text style={styles.groupCount}>{entries.filter((item) => selectedPermissions.has(item.code)).length}/{entries.length}</Text></View><View style={styles.permissionList}>{entries.map((permission) => { const checked = selectedPermissions.has(permission.code); return <Pressable key={permission.code} disabled={!canRequest || busy} onPress={() => toggle(permission.code)} style={[styles.permission, checked && styles.permissionActive]}><View style={[styles.check, checked && styles.checkActive]}>{checked && <Ionicons name="checkmark" size={13} color={palette.white} />}</View><View style={styles.permissionCopy}><Text style={styles.permissionAction}>{permission.action}</Text><Text style={styles.permissionCode}>{permission.code}</Text></View></Pressable> })}</View></View>)}
        </ScrollView>
        <Input label="Lý do thay đổi" value={reason} onChangeText={setReason} />
        <View style={styles.actions}>{!selected.systemRole && selected.active && <Pressable disabled={!canRequest || busy || reason.trim().length < 8} onPress={() => void mutate(() => requestDeactivateRole(graphqlUrl, accessToken, { roleCode: selected.code, accountType, expectedRoleVersion: selected.roleVersion, reason: reason.trim(), idempotencyKey: Crypto.randomUUID() }, mobileFetch), 'Đã gửi đề xuất ngừng role.')} style={styles.secondary}><Text style={styles.secondaryText}>Ngừng role</Text></Pressable>}<Pressable disabled={!canRequest || busy || reason.trim().length < 8 || additions.length + removals.length === 0} onPress={() => void saveChanges()} style={[styles.primary, (!canRequest || busy || reason.trim().length < 8 || additions.length + removals.length === 0) && styles.disabled]}>{busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.primaryText}>Gửi thay đổi</Text>}</Pressable></View>
      </View>}
    </>}

    <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}><View style={styles.backdrop}><View style={styles.sheet}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Tạo role mới</Text><Pressable onPress={() => setCreateOpen(false)}><Ionicons name="close" size={23} color={palette.evergreen} /></Pressable></View><Input label="Mã role" value={newCode} onChangeText={(value) => setNewCode(value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} /><Input label="Tên hiển thị" value={newName} onChangeText={setNewName} /><Text style={styles.hint}>Sau khi nhập thông tin, chọn quyền trực tiếp trong danh mục phía dưới.</Text><ScrollView style={styles.createPermissions} contentContainerStyle={styles.permissionGroups}>{groups.map(([resource, entries]) => <View key={resource} style={styles.permissionGroup}><Text style={styles.groupName}>{resource}</Text>{entries.map((permission) => <Pressable key={permission.code} onPress={() => toggle(permission.code)} style={[styles.permission, selectedPermissions.has(permission.code) && styles.permissionActive]}><View style={[styles.check, selectedPermissions.has(permission.code) && styles.checkActive]}>{selectedPermissions.has(permission.code) && <Ionicons name="checkmark" size={13} color={palette.white} />}</View><Text style={styles.permissionCode}>{permission.code}</Text></Pressable>)}</View>)}</ScrollView><Input label="Lý do tạo role" value={reason} onChangeText={setReason} /><Pressable disabled={busy || !newCode || newName.trim().length < 3 || reason.trim().length < 8 || selectedPermissions.size === 0} onPress={() => void createRole()} style={[styles.primary, (busy || !newCode || newName.trim().length < 3 || reason.trim().length < 8 || selectedPermissions.size === 0) && styles.disabled]}><Text style={styles.primaryText}>Gửi đề xuất tạo</Text></Pressable></View></View></Modal>

    <Modal visible={approvalOpen} transparent animationType="slide" onRequestClose={() => setApprovalOpen(false)}><View style={styles.backdrop}><View style={styles.sheet}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Danh sách duyệt</Text><Pressable onPress={() => setApprovalOpen(false)}><Ionicons name="close" size={23} color={palette.evergreen} /></Pressable></View><ScrollView style={styles.approvalList}>{pending.map((request) => <View key={request.id} style={styles.approvalRow}><View style={styles.editorTitle}><Text style={styles.roleName}>{request.roleCode}</Text><Text style={styles.roleMeta}>{request.changeType} · {request.reason}</Text></View><View style={styles.approvalActions}><Pressable onPress={() => void mutate(() => reviewRolePolicyChange(graphqlUrl, accessToken, request.id, 'Approved after independent mobile review', true, mobileFetch), 'Đã phê duyệt thay đổi.')} style={styles.approve}><Ionicons name="checkmark" size={17} color={palette.white} /></Pressable><Pressable onPress={() => void mutate(() => reviewRolePolicyChange(graphqlUrl, accessToken, request.id, 'Rejected after independent mobile review', false, mobileFetch), 'Đã từ chối thay đổi.')} style={styles.reject}><Ionicons name="close" size={17} color={palette.danger} /></Pressable></View></View>)}{!pending.length && <View style={styles.denied}><Ionicons name="checkmark-done" size={27} color={palette.sage} /><Text style={styles.roleName}>Đã xử lý hết</Text></View>}</ScrollView></View></View></Modal>
  </View>
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable> }
function Input(props: React.ComponentProps<typeof TextInput> & { label: string }) { const { label, ...rest } = props; return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...rest} placeholderTextColor={palette.muted} style={styles.input} /></View> }

const styles = StyleSheet.create({
  root: { gap: 10 }, topRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 }, accountTypes: { gap: 7, paddingRight: 4 }, topActions: { flexDirection: 'row', gap: 6 }, chip: { minHeight: 38, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, justifyContent: 'center' }, chipActive: { borderColor: palette.ink, backgroundColor: palette.ink }, chipText: { color: palette.muted, fontSize: 10, fontWeight: '600' }, chipTextActive: { color: palette.white }, iconButton: { width: 38, height: 38, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' }, badge: { position: 'absolute', right: -3, top: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: palette.danger, color: palette.white, fontSize: 8, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  message: { padding: 10, borderRadius: radii.small, backgroundColor: '#E6F1E2', color: palette.evergreen, fontSize: 10 }, loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center' }, denied: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8 },
  roleArea: { gap: 8 }, search: { minHeight: 42, paddingHorizontal: 10, borderWidth: 1.5, borderColor: palette.leaf, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 7 }, searchInput: { flex: 1, color: palette.ink, fontSize: 11 }, roleList: { gap: 7, paddingRight: 8 }, roleCard: { width: 176, minHeight: 58, padding: 9, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, justifyContent: 'center' }, roleCardActive: { borderColor: palette.evergreen, backgroundColor: palette.evergreen }, roleName: { color: palette.ink, fontSize: 11, fontWeight: '700' }, roleNameActive: { color: palette.white }, roleMeta: { marginTop: 3, color: palette.muted, fontSize: 8, lineHeight: 12 }, roleMetaActive: { color: '#D5E5E0' },
  editor: { padding: 10, borderWidth: 1, borderColor: palette.line, borderRadius: radii.medium, backgroundColor: palette.white, gap: 9 }, editorHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, editorTitle: { flex: 1 }, diff: { color: palette.evergreen, fontSize: 10, fontWeight: '700' }, permissionScroll: { maxHeight: 430 }, permissionGroups: { gap: 8, paddingBottom: 4 }, permissionGroup: { padding: 9, borderRadius: radii.small, backgroundColor: palette.surfaceMuted, gap: 7 }, groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, groupName: { color: palette.ink, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' }, groupCount: { color: palette.evergreen, fontSize: 9, fontWeight: '700' }, permissionList: { gap: 5 }, permission: { minHeight: 42, paddingHorizontal: 8, borderWidth: 1, borderColor: palette.line, borderRadius: 6, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 8 }, permissionActive: { borderColor: palette.sage, backgroundColor: '#E6F1E2' }, check: { width: 20, height: 20, borderWidth: 1, borderColor: palette.line, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, checkActive: { borderColor: palette.evergreen, backgroundColor: palette.evergreen }, permissionCopy: { flex: 1 }, permissionAction: { color: palette.ink, fontSize: 10, fontWeight: '600' }, permissionCode: { color: palette.muted, fontSize: 8 },
  field: { gap: 5 }, fieldLabel: { color: palette.evergreen, fontSize: 9, fontWeight: '700' }, input: { minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.background, color: palette.ink, fontSize: 11 }, actions: { flexDirection: 'row', gap: 7 }, primary: { minHeight: 44, flex: 1, borderRadius: radii.small, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: palette.white, fontSize: 11, fontWeight: '700' }, secondary: { minHeight: 44, flex: 1, borderWidth: 1, borderColor: palette.evergreen, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: palette.evergreen, fontSize: 11, fontWeight: '700' }, disabled: { opacity: .42 },
  backdrop: { flex: 1, justifyContent: 'flex-end', paddingTop: 50, backgroundColor: 'rgba(9,35,40,.5)' }, sheet: { maxHeight: '94%', padding: 16, paddingBottom: 32, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: palette.background, gap: 10 }, sheetHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { color: palette.ink, fontSize: 19, fontWeight: '700' }, hint: { color: palette.muted, fontSize: 9 }, createPermissions: { maxHeight: 360 }, approvalList: { maxHeight: 520 }, approvalRow: { minHeight: 70, marginBottom: 7, padding: 10, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 8 }, approvalActions: { flexDirection: 'row', gap: 6 }, approve: { width: 34, height: 34, borderRadius: radii.small, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' }, reject: { width: 34, height: 34, borderWidth: 1, borderColor: '#E7C1BA', borderRadius: radii.small, backgroundColor: '#FFF4F1', alignItems: 'center', justifyContent: 'center' },
})
