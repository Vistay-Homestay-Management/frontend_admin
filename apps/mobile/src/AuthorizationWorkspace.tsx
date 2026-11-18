import { useEffect, useMemo, useState } from 'react'
import { fetch as expoFetch } from 'expo/fetch'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  approveAuthorizationChange,
  fetchAuthorizationSubject,
  fetchAuthorizationWorkspace,
  fetchRolePolicyWorkspace,
  reduceAuthorizationScopes,
  requestCreateRole,
  requestDeactivateRole,
  requestRolePermissionChange,
  rejectAuthorizationChange,
  requestAuthorizationChange,
  revokeRoleAssignment,
  reviewRolePolicyChange,
  type AccountType,
  type AuthorizationAssignment,
  type AuthorizationChangeRequest,
  type AuthorizationRole,
  type AuthorizationWorkspace as Workspace,
  type BackofficeViewer,
  type DataScope,
  type PermissionCatalogEntry,
  type RolePolicyChangeRequest,
  type RolePolicyRole,
} from '@vistay/admin-api-client'

const mobileFetch = expoFetch as typeof globalThis.fetch
const accountTypes: { value: AccountType; label: string }[] = [
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

type MutationState = 'idle' | 'saving' | 'success' | 'error'
type RolePolicyWorkspaceData = Awaited<ReturnType<typeof fetchRolePolicyWorkspace>>

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Đã có lỗi không xác định'
}

function formatDate(value: string | null): string {
  if (!value) return 'Không giới hạn'
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function idempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function hasPermission(viewer: BackofficeViewer, permission: string): boolean {
  return viewer.permissions.includes(permission)
}

function Choice({ active, disabled, label, onPress }: {
  active: boolean
  disabled?: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, active && styles.choiceActive, (pressed || disabled) && styles.pressed]}
    >
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  )
}

export function AuthorizationWorkspace({ graphqlUrl, accessToken, viewer, mode = 'all' }: {
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
  mode?: 'all' | 'assignments'
}) {
  const [accountType, setAccountType] = useState<AccountType>('ADMIN')
  const [accountId, setAccountId] = useState(viewer.accountId)
  const [workspace, setWorkspace] = useState<Workspace>()
  const [loading, setLoading] = useState(() => hasPermission(viewer, 'authorization:read'))
  const [loadError, setLoadError] = useState<string>()
  const [selectedRoleCode, setSelectedRoleCode] = useState<string>()
  const [scopeOverrides, setScopeOverrides] = useState<Record<string, DataScope[]>>({})
  const [reason, setReason] = useState('')
  const [mutationState, setMutationState] = useState<MutationState>('idle')
  const [mutationMessage, setMutationMessage] = useState<string>()
  const [reviewing, setReviewing] = useState<AuthorizationChangeRequest>()
  const [reviewReason, setReviewReason] = useState('')
  const [editing, setEditing] = useState<AuthorizationAssignment>()
  const [retainedScopes, setRetainedScopes] = useState<Record<string, DataScope[]>>({})
  const [reductionReason, setReductionReason] = useState('')
  const [policyRoles, setPolicyRoles] = useState<RolePolicyRole[]>([])
  const [policyPermissions, setPolicyPermissions] = useState<PermissionCatalogEntry[]>([])
  const [policyQueue, setPolicyQueue] = useState<RolePolicyChangeRequest[]>([])
  const [selectedPolicyCode, setSelectedPolicyCode] = useState<string>()
  const [selectedPolicyPermissions, setSelectedPolicyPermissions] = useState<string[]>([])
  const [newRoleCode, setNewRoleCode] = useState('')
  const [newRoleName, setNewRoleName] = useState('')
  const [policyReason, setPolicyReason] = useState('')
  const [permissionAttemptKey, setPermissionAttemptKey] = useState<string>()
  const [deactivationAttemptKey, setDeactivationAttemptKey] = useState<string>()
  const [creationAttemptKey, setCreationAttemptKey] = useState<string>()

  const canRead = hasPermission(viewer, 'authorization:read')
  const canGrant = hasPermission(viewer, 'authorization:grant')
  const canApprove = hasPermission(viewer, 'authorization:approve')
  const canRevoke = hasPermission(viewer, 'authorization:revoke')
  const canReadRoles = mode !== 'assignments' && hasPermission(viewer, 'role:read')
  const canRequestRoles = hasPermission(viewer, 'role:change-request')
  const canApproveRoles = hasPermission(viewer, 'role:change-approve')
  const selectedRole = useMemo(
    () => workspace?.catalog.find((role) => role.code === selectedRoleCode),
    [selectedRoleCode, workspace?.catalog],
  )

  function selectRole(role: AuthorizationRole | undefined) {
    setSelectedRoleCode(role?.code)
    setScopeOverrides(Object.fromEntries(role?.policies.map((policy) => [policy.permissionCode, policy.defaultScopes]) ?? []))
    setMutationMessage(undefined)
  }

  function applyRolePolicyWorkspace(data: RolePolicyWorkspaceData, preferredCode?: string) {
    setPolicyRoles(data.roles)
    setPolicyPermissions(data.permissions.filter((permission) => permission.active))
    setPolicyQueue(data.pendingRequests)
    const selected = data.roles.find((role) => role.code === preferredCode && role.active)
      ?? data.roles.find((role) => role.active)
      ?? data.roles[0]
    setSelectedPolicyCode(selected?.code)
    setSelectedPolicyPermissions(selected?.grants.map((grant) => grant.permissionCode) ?? [])
  }

  function changeAccountType(nextType: AccountType) {
    if (nextType === accountType) return
    setAccountType(nextType)
    setWorkspace(undefined)
    setSelectedRoleCode(undefined)
    setPolicyRoles([])
    setPolicyPermissions([])
    setPolicyQueue([])
    setSelectedPolicyCode(undefined)
    setSelectedPolicyPermissions([])
    setPermissionAttemptKey(undefined)
    setDeactivationAttemptKey(undefined)
    setCreationAttemptKey(undefined)
    setMutationMessage(undefined)
    setLoadError(undefined)
  }

  function selectPolicyRole(role: RolePolicyRole) {
    setSelectedPolicyCode(role.code)
    setSelectedPolicyPermissions(role.grants.map((grant) => grant.permissionCode))
    setPermissionAttemptKey(undefined)
    setDeactivationAttemptKey(undefined)
    setCreationAttemptKey(undefined)
  }

  function updatePolicyReason(value: string) {
    setPolicyReason(value)
    setPermissionAttemptKey(undefined)
    setDeactivationAttemptKey(undefined)
    setCreationAttemptKey(undefined)
  }

  async function load(type = accountType, id = accountId) {
    if (!canRead || !id.trim()) return
    setLoading(true)
    setLoadError(undefined)
    try {
      const data = await fetchAuthorizationWorkspace(
        graphqlUrl,
        accessToken,
        type,
        id.trim(),
        undefined,
        mobileFetch,
      )
      setWorkspace(data)
      selectRole(data.catalog[0])
    } catch (error) {
      setWorkspace(undefined)
      setLoadError(messageOf(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canRead) return
    let active = true
    void fetchAuthorizationWorkspace(
      graphqlUrl,
      accessToken,
      'ADMIN',
      viewer.accountId,
      undefined,
      mobileFetch,
    ).then((data) => {
      if (!active) return
      setWorkspace(data)
      selectRole(data.catalog[0])
    }).catch((error: unknown) => {
      if (!active) return
      setLoadError(messageOf(error))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [accessToken, canRead, graphqlUrl, viewer.accountId])

  useEffect(() => {
    if (!canReadRoles) return
    let active = true
    void fetchRolePolicyWorkspace(graphqlUrl, accessToken, accountType, mobileFetch)
      .then((data) => {
        if (!active) return
        applyRolePolicyWorkspace(data)
      })
      .catch((error: unknown) => { if (active) setLoadError(messageOf(error)) })
    return () => { active = false }
  }, [accessToken, accountType, canReadRoles, graphqlUrl])

  function toggleScope(permissionCode: string, scope: DataScope, retained = false) {
    const setter = retained ? setRetainedScopes : setScopeOverrides
    setter((current) => {
      const scopes = current[permissionCode] ?? []
      if (!retained && scopes.length === 1 && scopes[0] === scope) return current
      return {
        ...current,
        [permissionCode]: scopes.includes(scope)
          ? scopes.filter((item) => item !== scope)
          : [...scopes, scope],
      }
    })
  }

  async function mutate(action: () => Promise<unknown>, successMessage: string): Promise<boolean> {
    setMutationState('saving')
    setMutationMessage(undefined)
    try {
      await action()
      setMutationState('success')
      setMutationMessage(successMessage)
      if (canReadRoles) {
        const data = await fetchRolePolicyWorkspace(graphqlUrl, accessToken, accountType, mobileFetch)
        applyRolePolicyWorkspace(data, selectedPolicyCode)
      }
      await load()
      return true
    } catch (error) {
      setMutationState('error')
      setMutationMessage(messageOf(error))
      return false
    }
  }

  const selectedPolicyRole = policyRoles.find((role) => role.code === selectedPolicyCode)
  const activePolicyPermissions = new Set(selectedPolicyRole?.grants.map((grant) => grant.permissionCode) ?? [])
  const addedPolicyPermissions = selectedPolicyPermissions.filter((code) => !activePolicyPermissions.has(code))
  const removedPolicyPermissions = [...activePolicyPermissions].filter((code) => !selectedPolicyPermissions.includes(code))
  const hasPolicyDiff = addedPolicyPermissions.length > 0 || removedPolicyPermissions.length > 0

  function togglePolicyPermission(code: string) {
    setSelectedPolicyPermissions((current) => current.includes(code)
      ? current.filter((item) => item !== code)
      : [...current, code])
    setPermissionAttemptKey(undefined)
    setCreationAttemptKey(undefined)
  }

  async function requestPolicyPermissionChange() {
    if (!selectedPolicyRole || !hasPolicyDiff || policyReason.trim().length < 8) return
    const attemptKey = permissionAttemptKey ?? idempotencyKey()
    setPermissionAttemptKey(attemptKey)
    const succeeded = await mutate(
      () => requestRolePermissionChange(graphqlUrl, accessToken, {
        roleCode: selectedPolicyRole.code,
        accountType,
        addGrants: addedPolicyPermissions
          .map((permissionCode) => ({ permissionCode, allowedScopes: ['ALL'], partitionTypes: [] })),
        removePermissionCodes: removedPolicyPermissions,
        expectedRoleVersion: selectedPolicyRole.roleVersion,
        reason: policyReason.trim(),
        idempotencyKey: attemptKey,
      }, mobileFetch),
      'Đã gửi thay đổi quyền của role cho checker.',
    )
    if (succeeded) {
      setPolicyReason('')
      setPermissionAttemptKey(undefined)
    }
  }

  async function requestRoleDeactivation() {
    if (!selectedPolicyRole || selectedPolicyRole.systemRole || !selectedPolicyRole.active || policyReason.trim().length < 8) return
    const attemptKey = deactivationAttemptKey ?? idempotencyKey()
    setDeactivationAttemptKey(attemptKey)
    const succeeded = await mutate(
      () => requestDeactivateRole(graphqlUrl, accessToken, {
        roleCode: selectedPolicyRole.code,
        accountType,
        expectedRoleVersion: selectedPolicyRole.roleVersion,
        reason: policyReason.trim(),
        idempotencyKey: attemptKey,
      }, mobileFetch),
      'Đã gửi đề xuất vô hiệu hóa role.',
    )
    if (succeeded) {
      setPolicyReason('')
      setDeactivationAttemptKey(undefined)
    }
  }

  async function requestRoleCreation() {
    if (!newRoleCode.trim() || newRoleName.trim().length < 3 || selectedPolicyPermissions.length === 0 || policyReason.trim().length < 8) return
    const attemptKey = creationAttemptKey ?? idempotencyKey()
    setCreationAttemptKey(attemptKey)
    const succeeded = await mutate(
      () => requestCreateRole(graphqlUrl, accessToken, {
        code: newRoleCode.trim().toUpperCase(),
        displayName: newRoleName.trim(),
        accountType,
        grants: selectedPolicyPermissions.map((permissionCode) => ({ permissionCode, allowedScopes: ['ALL'], partitionTypes: [] })),
        reason: policyReason.trim(),
        idempotencyKey: attemptKey,
      }, mobileFetch),
      'Đã gửi đề xuất tạo role custom.',
    )
    if (succeeded) {
      setNewRoleCode('')
      setNewRoleName('')
      setPolicyReason('')
      setCreationAttemptKey(undefined)
    }
  }

  async function submitChange() {
    if (!workspace || !selectedRole || reason.trim().length < 8) return
    const succeeded = await mutate(
      () => requestAuthorizationChange(graphqlUrl, accessToken, {
        targetSubjectId: workspace.subject.id,
        roleCode: selectedRole.code,
        scopeOverrides: selectedRole.policies.map((policy) => ({
          permissionCode: policy.permissionCode,
          scopes: scopeOverrides[policy.permissionCode] ?? policy.defaultScopes,
        })),
        validUntil: null,
        reason: reason.trim(),
        expectedAuthorizationVersion: workspace.subject.authorizationVersion,
        idempotencyKey: idempotencyKey(),
      }, mobileFetch),
      'Đã gửi yêu cầu. Một quản trị viên khác cần phê duyệt.',
    )
    if (succeeded) setReason('')
  }

  async function review(decision: 'approve' | 'reject') {
    if (!reviewing || !workspace || reviewReason.trim().length < 8) return
    const succeeded = await mutate(async () => {
      if (decision === 'reject') {
        return rejectAuthorizationChange(graphqlUrl, accessToken, reviewing.id, reviewReason.trim(), mobileFetch)
      }
      const target = reviewing.targetSubjectId === workspace.subject.id
        ? workspace.subject
        : await fetchAuthorizationSubject(graphqlUrl, accessToken, reviewing.targetSubjectId, mobileFetch)
      return approveAuthorizationChange(
        graphqlUrl,
        accessToken,
        reviewing.id,
        reviewReason.trim(),
        target.authorizationVersion,
        mobileFetch,
      )
    }, decision === 'approve' ? 'Yêu cầu đã được phê duyệt.' : 'Yêu cầu đã bị từ chối.')
    if (succeeded) {
      setReviewing(undefined)
      setReviewReason('')
    }
  }

  function openAssignment(assignment: AuthorizationAssignment) {
    setEditing(assignment)
    setRetainedScopes(Object.fromEntries(assignment.grants.map((grant) => [grant.permissionCode, grant.scopes])))
    setReductionReason('')
  }

  async function saveAssignment(action: 'reduce' | 'revoke') {
    if (!workspace || !editing || reductionReason.trim().length < 8) return
    const succeeded = await mutate(
      () => action === 'revoke'
        ? revokeRoleAssignment(
          graphqlUrl,
          accessToken,
          editing.id,
          reductionReason.trim(),
          workspace.subject.authorizationVersion,
          mobileFetch,
        )
        : reduceAuthorizationScopes(graphqlUrl, accessToken, {
          assignmentId: editing.id,
          retainedScopes: Object.entries(retainedScopes).map(([permissionCode, scopes]) => ({ permissionCode, scopes })),
          reason: reductionReason.trim(),
          expectedAuthorizationVersion: workspace.subject.authorizationVersion,
        }, mobileFetch),
      action === 'revoke' ? 'Vai trò đã được thu hồi.' : 'Phạm vi quyền đã được thu hẹp.',
    )
    if (succeeded) setEditing(undefined)
  }

  if (!canRead && !canReadRoles) {
    return (
      <View style={styles.locked}>
        <Text style={styles.lockedIcon}>⌁</Text>
        <Text style={styles.cardTitle}>Chưa có quyền xem phân quyền</Text>
        <Text style={styles.body}>Tài khoản cần authorization:read hoặc role:read. Ứng dụng không gửi truy vấn quản trị khi thiếu cả hai quyền.</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {canRead ? <View style={styles.hero}>
        <Text style={styles.eyebrow}>MAKER–CHECKER AUTHORIZATION</Text>
        <Text style={styles.heroTitle}>Quyền hạn rõ đến từng phạm vi dữ liệu.</Text>
        <Text style={styles.heroBody}>Tra cứu subject và vận hành cùng một mô hình ba lớp: vai trò, hành động, phạm vi.</Text>
        <View style={styles.accountTypes}>
          {accountTypes.map((type) => (
            <Choice key={type.value} active={accountType === type.value} label={type.label} onPress={() => changeAccountType(type.value)} />
          ))}
        </View>
        <TextInput
          accessibilityLabel="Account ID"
          autoCapitalize="none"
          onChangeText={setAccountId}
          placeholder="Account ID"
          placeholderTextColor="#879189"
          style={styles.input}
          value={accountId}
        />
        <Pressable disabled={loading || !accountId.trim()} onPress={() => void load()} style={({ pressed }) => [styles.primary, (pressed || loading) && styles.pressed]}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Tra cứu phân quyền</Text>}
        </Pressable>
      </View> : <View style={styles.locked}>
        <Text style={styles.cardTitle}>Chỉ quản trị role policy</Text>
        <Text style={styles.body}>Tài khoản không có authorization:read nên ứng dụng không tải subject, assignment hoặc audit. Role policy vẫn dùng quyền role:* độc lập.</Text>
      </View>}

      {canReadRoles && (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>ROLE POLICY V2</Text>
          <Text style={styles.cardTitle}>Catalog và checker queue</Text>
          <Text style={styles.body}>Policy theo role, version hóa và không cho requester tự phê duyệt.</Text>
          <View style={styles.policyRoleList}>
            {policyRoles.map((role) => (
              <Pressable key={role.code} onPress={() => selectPolicyRole(role)} style={[styles.policyRole, selectedPolicyCode === role.code && styles.policyRoleActive]}>
                <Text style={[styles.policyName, selectedPolicyCode === role.code && styles.policyNameActive]}>{role.code}</Text>
                <Text style={[styles.body, selectedPolicyCode === role.code && styles.policyRoleMetaActive]}>v{role.roleVersion} · {role.grants.length} quyền{role.systemRole ? ' · system' : ''}</Text>
              </Pressable>
            ))}
          </View>
          {selectedPolicyRole && <>
            <Text style={styles.cardTitle}>Quyền của {selectedPolicyRole.displayName}</Text>
            <View style={styles.policyPermissionList}>
              {policyPermissions.map((permission) => <Choice
                key={permission.code}
                active={selectedPolicyPermissions.includes(permission.code)}
                disabled={!canRequestRoles}
                label={permission.code}
                onPress={() => togglePolicyPermission(permission.code)}
              />)}
            </View>
            <TextInput accessibilityLabel="Lý do thay đổi role" maxLength={500} multiline onChangeText={updatePolicyReason} placeholder="Lý do thay đổi role (ít nhất 8 ký tự)" placeholderTextColor="#879189" style={[styles.input, styles.textarea]} value={policyReason} />
            <View style={styles.policyActions}>
              <Pressable disabled={!canRequestRoles || mutationState === 'saving' || !hasPolicyDiff || policyReason.trim().length < 8} onPress={() => void requestPolicyPermissionChange()} style={[styles.secondaryButton, (!canRequestRoles || !hasPolicyDiff || policyReason.trim().length < 8) && styles.disabled]}><Text style={styles.secondaryButtonText}>Gửi permission diff</Text></Pressable>
              {!selectedPolicyRole.systemRole && selectedPolicyRole.active && <Pressable disabled={!canRequestRoles || mutationState === 'saving' || policyReason.trim().length < 8} onPress={() => void requestRoleDeactivation()} style={[styles.dangerButton, (!canRequestRoles || policyReason.trim().length < 8) && styles.disabled]}><Text style={styles.dangerButtonText}>Vô hiệu hóa</Text></Pressable>}
            </View>
          </>}
          {canRequestRoles && <>
            <Text style={styles.cardTitle}>Tạo custom role</Text>
            <View style={styles.dateRow}><TextInput autoCapitalize="characters" maxLength={64} onChangeText={(value) => { setNewRoleCode(value); setCreationAttemptKey(undefined) }} placeholder="ROLE_CODE" placeholderTextColor="#879189" style={[styles.input, styles.flexInput]} value={newRoleCode} /><TextInput maxLength={120} onChangeText={(value) => { setNewRoleName(value); setCreationAttemptKey(undefined) }} placeholder="Tên hiển thị" placeholderTextColor="#879189" style={[styles.input, styles.flexInput]} value={newRoleName} /></View>
            <Pressable disabled={mutationState === 'saving' || newRoleCode.trim().length < 2 || newRoleName.trim().length < 3 || selectedPolicyPermissions.length === 0 || policyReason.trim().length < 8} onPress={() => void requestRoleCreation()} style={[styles.secondaryButton, (mutationState === 'saving' || newRoleCode.trim().length < 2 || newRoleName.trim().length < 3 || selectedPolicyPermissions.length === 0 || policyReason.trim().length < 8) && styles.disabled]}><Text style={styles.secondaryButtonText}>Gửi đề xuất tạo role</Text></Pressable>
          </>}
          <Text style={styles.cardTitle}>Đang chờ ({policyQueue.length})</Text>
          {policyQueue.map((request) => (
            <View key={request.id} style={styles.assignmentRow}>
              <View><Text style={styles.policyName}>{request.roleCode}</Text><Text style={styles.body}>{request.changeType} · {request.reason}</Text></View>
              {canApproveRoles && <View style={styles.accountTypes}>
                <Choice active={false} label="Duyệt" onPress={() => void mutate(
                  () => reviewRolePolicyChange(graphqlUrl, accessToken, request.id, 'Approved after independent mobile review', true, mobileFetch),
                  'Đã phê duyệt role policy.',
                )} />
                <Choice active={false} label="Từ chối" onPress={() => void mutate(
                  () => reviewRolePolicyChange(graphqlUrl, accessToken, request.id, 'Rejected after independent mobile review', false, mobileFetch),
                  'Đã từ chối role policy.',
                )} />
              </View>}
            </View>
          ))}
        </View>
      )}

      {loadError && <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>}
      {mutationMessage && <Text accessibilityRole="alert" style={mutationState === 'error' ? styles.error : styles.success}>{mutationMessage}</Text>}

      {workspace && (
        <>
          <View style={styles.metrics}>
            <View style={styles.metric}><Text style={styles.metricLabel}>PHIÊN BẢN</Text><Text style={styles.metricValue}>{workspace.subject.authorizationVersion}</Text></View>
            <View style={styles.metric}><Text style={styles.metricLabel}>VAI TRÒ</Text><Text style={styles.metricValue}>{workspace.subject.assignments.length}</Text></View>
            <View style={[styles.metric, styles.metricLime]}><Text style={styles.metricLabel}>QUYỀN</Text><Text style={styles.metricValue}>{workspace.subject.effectiveGrants.length}</Text></View>
          </View>

          <View style={styles.card}>
            <Text style={styles.eyebrow}>QUYỀN HIỆU LỰC</Text>
            <Text selectable style={styles.subjectId}>{workspace.subject.accountType} · {workspace.subject.accountId}</Text>
            <View style={styles.tags}>
              {workspace.subject.effectiveGrants.map((grant) => (
                <View key={grant.permissionCode} style={styles.grant}>
                  <Text style={styles.grantName}>{grant.permissionCode}</Text>
                  <Text style={styles.grantScope}>{grant.scopes.map((scope) => scopeLabels[scope]).join(' · ')}</Text>
                </View>
              ))}
              {workspace.subject.effectiveGrants.length === 0 && <Text style={styles.empty}>Subject chưa có quyền nghiệp vụ.</Text>}
            </View>
          </View>

          <View style={[styles.card, styles.darkCard]}>
            <Text style={[styles.eyebrow, styles.darkMuted]}>VAI TRÒ ĐANG GÁN</Text>
            {workspace.subject.assignments.map((assignment) => (
              <View key={assignment.id} style={styles.assignment}>
                <View style={styles.flex}>
                  <Text style={styles.assignmentTitle}>{assignment.roleCode}</Text>
                  <Text style={styles.darkMuted}>{formatDate(assignment.validUntil)}</Text>
                </View>
                {canRevoke && <Pressable onPress={() => openAssignment(assignment)} style={styles.darkButton}><Text style={styles.darkButtonText}>Điều chỉnh</Text></Pressable>}
              </View>
            ))}
            {workspace.subject.assignments.length === 0 && <Text style={styles.darkMuted}>Chưa có vai trò.</Text>}
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.eyebrow}>ROLE CATALOG</Text>
            <Text style={styles.sectionTitle}>Tạo yêu cầu cấp quyền</Text>
            <Text style={styles.body}>Mở rộng quyền luôn cần một người tạo và một người khác phê duyệt.</Text>
          </View>
          <View style={styles.roleList}>
            {workspace.catalog.map((role) => (
              <Choice key={role.code} active={role.code === selectedRoleCode} label={role.displayName} onPress={() => selectRole(role)} />
            ))}
          </View>
          {selectedRole && (
            <View style={styles.card}>
              {selectedRole.policies.map((policy) => (
                <View key={policy.permissionCode} style={styles.policy}>
                  <Text style={styles.policyName}>{policy.permissionCode}</Text>
                  <View style={styles.tags}>
                    {policy.allowedScopes.map((scope) => (
                      <Choice
                        key={scope}
                        active={(scopeOverrides[policy.permissionCode] ?? policy.defaultScopes).includes(scope)}
                        label={scopeLabels[scope]}
                        onPress={() => toggleScope(policy.permissionCode, scope)}
                      />
                    ))}
                  </View>
                </View>
              ))}
              <TextInput
                multiline
                onChangeText={setReason}
                placeholder="Lý do thay đổi (ít nhất 8 ký tự)"
                placeholderTextColor="#879189"
                style={[styles.input, styles.textarea]}
                value={reason}
              />
              <Pressable
                disabled={!canGrant || mutationState === 'saving' || reason.trim().length < 8}
                onPress={() => void submitChange()}
                style={({ pressed }) => [styles.primary, (pressed || !canGrant || reason.trim().length < 8) && styles.pressed]}
              >
                <Text style={styles.primaryText}>{canGrant ? 'Gửi yêu cầu phê duyệt' : 'Thiếu quyền authorization:grant'}</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.sectionHeading}>
            <Text style={styles.eyebrow}>PENDING QUEUE</Text>
            <Text style={styles.sectionTitle}>Chờ phê duyệt · {workspace.pendingRequests.length}</Text>
          </View>
          {workspace.pendingRequests.map((request) => (
            <Pressable key={request.id} onPress={() => { setReviewing(request); setReviewReason('') }} style={styles.request}>
              <Text style={styles.eyebrow}>{request.changeType}</Text>
              <Text style={styles.requestTitle}>{request.roleCode}</Text>
              <Text style={styles.body}>{request.reason}</Text>
              <Text style={styles.requestDate}>Hết hạn {formatDate(request.expiresAt)}</Text>
            </Pressable>
          ))}
          {workspace.pendingRequests.length === 0 && <View style={styles.emptyCard}><Text style={styles.empty}>✓ Không có yêu cầu đang chờ.</Text></View>}

          <View style={styles.sectionHeading}>
            <Text style={styles.eyebrow}>AUDIT TRAIL</Text>
            <Text style={styles.sectionTitle}>Lịch sử thay đổi</Text>
          </View>
          {workspace.auditError && <Text style={styles.error}>{workspace.auditError}</Text>}
          {workspace.audit.map((event) => (
            <View key={event.id} style={styles.audit}>
              <Text style={styles.requestDate}>{formatDate(event.createdAt)}</Text>
              <Text style={styles.requestTitle}>{event.action}</Text>
              <Text style={styles.body}>{event.reason}</Text>
              <Text selectable style={styles.correlation}>{event.correlationId ?? 'Không có correlation ID'}</Text>
            </View>
          ))}
          {!workspace.auditError && workspace.audit.length === 0 && <View style={styles.emptyCard}><Text style={styles.empty}>Chưa có sự kiện audit cho subject này.</Text></View>}
        </>
      )}

      <Modal animationType="slide" transparent visible={Boolean(reviewing)} onRequestClose={() => setReviewing(undefined)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.eyebrow}>MAKER–CHECKER REVIEW</Text>
            <Text style={styles.dialogTitle}>{reviewing?.roleCode}</Text>
            <Text style={styles.body}>{reviewing?.reason}</Text>
            <TextInput multiline onChangeText={setReviewReason} placeholder="Lý do duyệt hoặc từ chối" placeholderTextColor="#879189" style={[styles.input, styles.textarea]} value={reviewReason} />
            {!canApprove && <Text style={styles.error}>Thiếu quyền authorization:approve</Text>}
            <View style={styles.dialogActions}>
              <Pressable disabled={!canApprove || reviewReason.trim().length < 8} onPress={() => void review('reject')} style={[styles.secondary, (!canApprove || reviewReason.trim().length < 8) && styles.pressed]}><Text style={styles.secondaryText}>Từ chối</Text></Pressable>
              <Pressable disabled={!canApprove || reviewReason.trim().length < 8} onPress={() => void review('approve')} style={[styles.primary, styles.flex, (!canApprove || reviewReason.trim().length < 8) && styles.pressed]}><Text style={styles.primaryText}>Phê duyệt</Text></Pressable>
            </View>
            <Pressable onPress={() => setReviewing(undefined)} style={styles.close}><Text style={styles.body}>Đóng</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent visible={Boolean(editing)} onRequestClose={() => setEditing(undefined)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.eyebrow}>LEAST PRIVILEGE</Text>
            <Text style={styles.dialogTitle}>{editing?.roleCode}</Text>
            <Text style={styles.body}>Chỉ bỏ quyền/phạm vi đang có. Thêm quyền mới phải qua maker–checker.</Text>
            {editing?.grants.map((grant) => (
              <View key={grant.permissionCode} style={styles.policy}>
                <Text style={styles.policyName}>{grant.permissionCode}</Text>
                <View style={styles.tags}>
                  {grant.scopes.map((scope) => <Choice key={scope} active={(retainedScopes[grant.permissionCode] ?? []).includes(scope)} label={scopeLabels[scope]} onPress={() => toggleScope(grant.permissionCode, scope, true)} />)}
                </View>
              </View>
            ))}
            <TextInput multiline onChangeText={setReductionReason} placeholder="Lý do thu hẹp quyền" placeholderTextColor="#879189" style={[styles.input, styles.textarea]} value={reductionReason} />
            <View style={styles.dialogActions}>
              <Pressable disabled={reductionReason.trim().length < 8} onPress={() => void saveAssignment('revoke')} style={[styles.secondary, reductionReason.trim().length < 8 && styles.pressed]}><Text style={styles.secondaryText}>Thu hồi vai trò</Text></Pressable>
              <Pressable disabled={reductionReason.trim().length < 8} onPress={() => void saveAssignment('reduce')} style={[styles.primary, styles.flex, reductionReason.trim().length < 8 && styles.pressed]}><Text style={styles.primaryText}>Lưu phạm vi</Text></Pressable>
            </View>
            <Pressable onPress={() => setEditing(undefined)} style={styles.close}><Text style={styles.body}>Đóng</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { marginTop: 24, gap: 12 },
  hero: { padding: 22, borderRadius: 22, backgroundColor: '#d9ff63' },
  eyebrow: { color: '#68756e', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  heroTitle: { marginTop: 14, color: '#17231d', fontSize: 34, lineHeight: 34, letterSpacing: -1.8, fontWeight: '700' },
  heroBody: { marginTop: 14, color: '#4f5f54', fontSize: 12, lineHeight: 19 },
  accountTypes: { marginTop: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  input: { minHeight: 48, marginTop: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#d9dcd3', borderRadius: 12, backgroundColor: '#fffef9', color: '#17231d', fontSize: 12 },
  textarea: { minHeight: 92, paddingTop: 13, textAlignVertical: 'top' },
  primary: { minHeight: 48, marginTop: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#17231d', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: 'white', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: .45 },
  choice: { minHeight: 34, paddingHorizontal: 11, borderWidth: 1, borderColor: '#d3d7ce', borderRadius: 9, backgroundColor: '#f3f1ea', justifyContent: 'center' },
  choiceActive: { borderColor: '#17231d', backgroundColor: '#17231d' },
  choiceText: { color: '#5f6c65', fontSize: 10, fontWeight: '600' },
  choiceTextActive: { color: 'white' },
  error: { padding: 12, borderRadius: 10, backgroundColor: '#fff0ec', color: '#a74235', fontSize: 11, lineHeight: 17 },
  success: { padding: 12, borderRadius: 10, backgroundColor: '#eaf4e2', color: '#416448', fontSize: 11, lineHeight: 17 },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minHeight: 112, padding: 14, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 15, backgroundColor: '#fffef9' },
  metricLime: { borderColor: '#d9ff63', backgroundColor: '#d9ff63' },
  metricLabel: { color: '#68756e', fontSize: 8, fontWeight: '700', letterSpacing: .8 },
  metricValue: { marginTop: 'auto', color: '#17231d', fontSize: 31, fontWeight: '700' },
  card: { padding: 20, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 18, backgroundColor: '#fffef9' },
  cardTitle: { marginTop: 9, color: '#17231d', fontSize: 20, fontWeight: '700' },
  subjectId: { marginTop: 9, color: '#17231d', fontSize: 12, fontWeight: '700' },
  tags: { marginTop: 11, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  grant: { padding: 9, borderRadius: 9, backgroundColor: '#edf1e9' },
  grantName: { color: '#30493a', fontSize: 10, fontWeight: '700' },
  grantScope: { marginTop: 4, color: '#68756e', fontSize: 8 },
  empty: { color: '#68756e', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  darkCard: { borderColor: '#17231d', backgroundColor: '#17231d' },
  darkMuted: { color: '#9caaa2', fontSize: 9 },
  assignment: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#35443b', flexDirection: 'row', alignItems: 'center', gap: 9 },
  assignmentRow: { paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#e6e6df', gap: 8 },
  policyRoleList: { marginTop: 14, gap: 7 },
  policyRole: { padding: 12, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 12, backgroundColor: '#f3f4ee' },
  policyRoleActive: { borderColor: '#17231d', backgroundColor: '#17231d' },
  policyNameActive: { color: '#ffffff' },
  policyRoleMetaActive: { color: '#c3d2c8' },
  policyPermissionList: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  policyActions: { flexDirection: 'row', gap: 8 },
  secondaryButton: { flex: 1, minHeight: 44, borderRadius: 11, backgroundColor: '#3d654f', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#ffffff', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  dangerButton: { minHeight: 44, paddingHorizontal: 12, borderRadius: 11, backgroundColor: '#a74235', alignItems: 'center', justifyContent: 'center' },
  dangerButtonText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  dateRow: { flexDirection: 'row', gap: 8 },
  flexInput: { flex: 1 },
  disabled: { opacity: .42 },
  assignmentTitle: { color: 'white', fontSize: 13, fontWeight: '700' },
  flex: { flex: 1 },
  darkButton: { padding: 9, borderWidth: 1, borderColor: '#506158', borderRadius: 9 },
  darkButtonText: { color: 'white', fontSize: 9, fontWeight: '700' },
  sectionHeading: { marginTop: 28 },
  sectionTitle: { marginTop: 7, color: '#17231d', fontSize: 24, fontWeight: '700', letterSpacing: -.8 },
  body: { marginTop: 6, color: '#68756e', fontSize: 11, lineHeight: 17 },
  roleList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  policy: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#e6e6df' },
  policyName: { color: '#17231d', fontSize: 11, fontWeight: '700' },
  request: { padding: 18, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 15, backgroundColor: '#fffef9' },
  requestTitle: { marginTop: 7, color: '#17231d', fontSize: 17, fontWeight: '700' },
  requestDate: { marginTop: 11, color: '#879189', fontSize: 9 },
  emptyCard: { minHeight: 100, padding: 20, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 15, backgroundColor: '#fffef9', alignItems: 'center', justifyContent: 'center' },
  audit: { minHeight: 160, padding: 18, borderLeftWidth: 3, borderLeftColor: '#d9ff63', borderRadius: 12, backgroundColor: '#fffef9' },
  correlation: { marginTop: 'auto', color: '#879189', fontSize: 8 },
  locked: { marginTop: 24, padding: 24, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 18, backgroundColor: '#fffef9' },
  lockedIcon: { color: '#89a91e', fontSize: 36 },
  overlay: { flex: 1, padding: 18, backgroundColor: 'rgba(10,18,13,.72)', justifyContent: 'flex-end' },
  dialog: { maxHeight: '92%', padding: 22, borderRadius: 22, backgroundColor: '#f3f1ea' },
  dialogTitle: { marginTop: 10, color: '#17231d', fontSize: 27, fontWeight: '700' },
  dialogActions: { flexDirection: 'row', gap: 8 },
  secondary: { flex: 1, minHeight: 48, marginTop: 10, borderWidth: 1, borderColor: '#e0b5af', borderRadius: 12, backgroundColor: '#fff0ec', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#a74235', fontSize: 11, fontWeight: '700' },
  close: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
})
