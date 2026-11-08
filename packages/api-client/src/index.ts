export const VIEWER_QUERY = `
  query Viewer {
    viewer {
      accountId
      profileId
      displayName
      email
      contactPhone
      avatarMediaId
      profileVersion
      roles
      permissions
      authorizationVersion
    }
  }
`

export const NOTIFICATION_STREAM_SUBSCRIPTION = `
  subscription NotificationStream($afterCursor: Cursor) {
    notificationStream(afterCursor: $afterCursor) {
      cursor
      notification {
        id
        category
        title
        body
        channels
        requiredChannels
        optionalChannels
        notificationType
        priority
        reference { type id actionUrl }
        templateKey
        templateRevision
        policyRevision
        inboxRevision
        createdAt
        readAt
        version
      }
    }
  }
`

export const NOTIFICATION_INBOX_QUERY = `
  query NotificationInbox($input: NotificationInboxInput) {
    notificationInbox(input: $input) {
      nodes {
        id
        category
        title
        body
        channels
        requiredChannels
        optionalChannels
        notificationType
        priority
        reference { type id actionUrl }
        templateKey
        templateRevision
        policyRevision
        inboxRevision
        createdAt
        readAt
        version
      }
      pageInfo {
        hasNextPage
        endCursor
        startCursor
        cursorState
        retainedFrom
        reconcileFrom
      }
      unread {
        count
        asOfCursor
        inboxRevision
      }
    }
  }
`

export const UNREAD_NOTIFICATION_COUNT_QUERY = `
  query UnreadNotificationCount {
    unreadNotificationCount {
      count
      asOfCursor
      inboxRevision
    }
  }
`

export const MARK_NOTIFICATION_READ_MUTATION = `
  mutation MarkNotificationRead($input: MarkNotificationReadInput!) {
    markNotificationRead(input: $input) {
      id
      readAt
      inboxRevision
      version
    }
  }
`

export const MARK_ALL_NOTIFICATIONS_READ_MUTATION = `
  mutation MarkAllNotificationsRead($input: MarkAllNotificationsReadInput!) {
    markAllNotificationsRead(input: $input) {
      markedCount
      throughCursor
      inboxRevision
    }
  }
`

export const NOTIFICATION_PREFERENCES_QUERY = `
  query NotificationPreferences {
    notificationPreferences {
      revision
      nodes {
        id
        notificationType
        channel
        enabled
        required
        quietHours { start end }
        timeZoneId
        revision
        updatedAt
      }
    }
  }
`

export const UPDATE_NOTIFICATION_PREFERENCES_MUTATION = `
  mutation UpdateNotificationPreferences($input: UpdateNotificationPreferencesInput!) {
    updateNotificationPreferences(input: $input) {
      revision
      nodes {
        id
        notificationType
        channel
        enabled
        required
        quietHours { start end }
        timeZoneId
        revision
        updatedAt
      }
    }
  }
`

const NOTIFICATION_TEMPLATE_FIELDS = `
  id
  templateKey
  channel
  locale
  status
  revision
  policyRevision
  requiredVariables
  subject
  body
  immutable
  createdAt
  publishedAt
  retiredAt
`

export const NOTIFICATION_TEMPLATES_QUERY = `
  query NotificationTemplates($input: NotificationTemplateQueryInput) {
    notificationTemplates(input: $input) {
      nodes { ${NOTIFICATION_TEMPLATE_FIELDS} }
      pageInfo {
        hasNextPage
        endCursor
        startCursor
        cursorState
        retainedFrom
        reconcileFrom
      }
    }
  }
`

export const SAVE_NOTIFICATION_TEMPLATE_DRAFT_MUTATION = `
  mutation SaveNotificationTemplateDraft($input: PublishNotificationTemplateInput!) {
    saveNotificationTemplateDraft(input: $input) { ${NOTIFICATION_TEMPLATE_FIELDS} }
  }
`

export const PREVIEW_NOTIFICATION_TEMPLATE_MUTATION = `
  mutation PreviewNotificationTemplate($input: PreviewNotificationTemplateInput!) {
    previewNotificationTemplate(input: $input) {
      templateKey
      channel
      locale
      revision
      subject
      body
    }
  }
`

export const PUBLISH_NOTIFICATION_TEMPLATE_MUTATION = `
  mutation PublishNotificationTemplate($input: PublishNotificationTemplateInput!) {
    publishNotificationTemplate(input: $input) { ${NOTIFICATION_TEMPLATE_FIELDS} }
  }
`

export const RETIRE_NOTIFICATION_TEMPLATE_MUTATION = `
  mutation RetireNotificationTemplate($input: RetireNotificationTemplateInput!) {
    retireNotificationTemplate(input: $input) { ${NOTIFICATION_TEMPLATE_FIELDS} }
  }
`

export type NotificationCategory = 'WELCOME' | 'SECURITY' | 'BOOKING' | 'OPERATIONS' | 'FINANCE' | 'SYSTEM'
export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'PUSH'
export type NotificationCursorState = 'ACTIVE' | 'EXPIRED' | 'INVALID' | 'RESYNC_REQUIRED'
export type NotificationTemplateStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED'

export interface NotificationReference {
  type: string
  id: string
  actionUrl?: string | null
}

export interface BackofficeViewer {
  accountId: string
  profileId: string
  displayName: string
  email: string
  contactPhone: string | null
  avatarMediaId: string | null
  profileVersion: number
  roles: string[]
  permissions: string[]
  authorizationVersion: number
}

export interface UpdateMyProfileInput {
  displayName: string
  contactPhone: string | null
  avatarMediaId: string | null
  expectedVersion: number
  reason: string
  idempotencyKey: string
}

export interface PersonalProfile {
  accountId: string
  profileId: string
  displayName: string
  email: string
  contactPhone: string | null
  avatarMediaId: string | null
  version: number
  updatedAt: string
  replayed: boolean
}

export interface ProvisionBackofficeAccountInput {
  email: string
  fullName: string
  temporaryPassword: string
  reason: string
}

export interface ProvisionedBackofficeAccount {
  id: string
  subject: string
  email: string
  accountType: 'ADMIN'
  status: 'ACTIVE' | 'DISABLED' | 'CLOSED'
  version: number
  createdAt: string
}

export interface BackofficeSession {
  id: string
  ipAddress: string
  startedAt: string
  lastAccessAt: string
  clients: Record<string, string>
  current: boolean
}

export interface SessionRevocationResult {
  targetAccountId: string
  sessionId: string
  revokedAt: string
  replayed: boolean
}

export type AccountLifecycleAction = 'LOCK' | 'DISABLE' | 'RECOVER'

export interface AccountSecurityView {
  account: {
    id: string
    email: string
    status: 'ACTIVE' | 'LOCKED' | 'DISABLED' | 'CLOSED'
    version: number
    updatedAt: string
  }
  bruteForce: {
    temporarilyLocked: boolean
    failureCount: number
    lastFailureIp: string | null
    lastFailureAt: string | null
  }
}

export interface AccountLifecycleEvent {
  idempotencyKey: string
  actorAccountId: string
  targetAccountId: string
  action: AccountLifecycleAction
  previousStatus: string
  resultingStatus: string
  resultingVersion: number
  reason: string
  correlationId: string
  createdAt: string
  completedAt: string
}

export interface AccountLifecycleResult {
  targetAccountId: string
  action: AccountLifecycleAction
  previousStatus: string
  status: string
  version: number
  completedAt: string
  replayed: boolean
}

export type AccountType = 'CUSTOMER' | 'ADMIN' | 'HOST'
export type DataScope = 'SELF' | 'OWN' | 'ASSIGNED' | 'ALL'
export type AuthorizationChangeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'STALE'

export interface EffectiveGrant {
  permissionCode: string
  scopes: DataScope[]
}

export interface AuthorizationPermissionPolicy {
  permissionCode: string
  allowedScopes: DataScope[]
  defaultScopes: DataScope[]
}

export interface AuthorizationRole {
  code: string
  displayName: string
  accountType: AccountType
  policies: AuthorizationPermissionPolicy[]
}

export interface AuthorizationAssignment {
  id: string
  roleCode: string
  validUntil: string | null
  grants: EffectiveGrant[]
}

export interface AuthorizationSubject {
  id: string
  accountType: AccountType
  accountId: string
  profileId: string
  active: boolean
  authorizationVersion: number
  assignments: AuthorizationAssignment[]
  effectiveGrants: EffectiveGrant[]
}

export interface AuthorizationChangeRequest {
  id: string
  targetSubjectId: string
  requestedBySubjectId: string
  reviewedBySubjectId: string | null
  changeType: string
  status: AuthorizationChangeStatus
  roleCode: string
  reason: string
  reviewReason: string | null
  expiresAt: string
  createdAt: string
}

export interface AuthorizationAuditEvent {
  id: string
  actorSubjectId: string | null
  targetSubjectId: string | null
  action: string
  reason: string
  correlationId: string | null
  createdAt: string
}

export interface PermissionScopeOverrideInput {
  permissionCode: string
  scopes: DataScope[]
}

export interface RequestAuthorizationChangeInput {
  targetSubjectId: string
  roleCode: string
  scopeOverrides: PermissionScopeOverrideInput[]
  validUntil?: string | null
  reason: string
  expectedAuthorizationVersion: number
  idempotencyKey: string
}

export interface RetainedPermissionScopesInput {
  permissionCode: string
  scopes: DataScope[]
}

export interface ReduceAuthorizationScopesInput {
  assignmentId: string
  retainedScopes: RetainedPermissionScopesInput[]
  reason: string
  expectedAuthorizationVersion: number
}

export interface AuthorizationWorkspace {
  subject: AuthorizationSubject
  catalog: AuthorizationRole[]
  pendingRequests: AuthorizationChangeRequest[]
  audit: AuthorizationAuditEvent[]
  auditError?: string
}

export interface RolePolicyGrant {
  permissionCode: string
  allowedScopes: DataScope[]
  partitionTypes: string[]
}

export interface RolePolicyRole {
  code: string
  displayName: string
  description: string | null
  accountType: AccountType
  systemRole: boolean
  active: boolean
  roleVersion: number
  grants: RolePolicyGrant[]
  createdAt: string
  updatedAt: string
}

export interface PermissionCatalogEntry {
  code: string
  resource: string
  action: string
  description: string | null
  active: boolean
  deprecatedAt: string | null
  aliases: string[]
}

export interface RolePolicyChangeRequest {
  id: string
  roleCode: string
  requestedBySubjectId: string
  reviewedBySubjectId: string | null
  changeType: 'CREATE_ROLE' | 'CHANGE_PERMISSIONS' | 'DEACTIVATE_ROLE'
  status: AuthorizationChangeStatus
  expectedRoleVersion: number | null
  reason: string
  reviewReason: string | null
  expiresAt: string
  createdAt: string
}

export interface CreateRoleInput {
  code: string
  displayName: string
  description?: string | null
  accountType: AccountType
  grants: RolePolicyGrant[]
  reason: string
  idempotencyKey: string
}

export interface RolePermissionChangeInput {
  roleCode: string
  accountType: AccountType
  addGrants: RolePolicyGrant[]
  removePermissionCodes: string[]
  expectedRoleVersion: number
  reason: string
  idempotencyKey: string
}

export interface DeactivateRoleInput {
  roleCode: string
  accountType: AccountType
  expectedRoleVersion: number
  reason: string
  idempotencyKey: string
}

export type InventoryBlockType = 'BOOKING' | 'MAINTENANCE' | 'CLEANING' | 'OWNER_USE' | 'MANUAL' | 'CHANNEL'
export type OperatorInventoryBlockType = 'MAINTENANCE' | 'CLEANING' | 'OWNER_USE' | 'MANUAL'
export type InventoryBlockStatus = 'TENTATIVE' | 'ACTIVE' | 'RELEASED' | 'CANCELLED'

export interface InventoryBlockManagementInput {
  propertyId: string
  fromDate?: string
  toDateExclusive?: string
  types?: InventoryBlockType[]
  statuses?: InventoryBlockStatus[]
  first?: number
  after?: string
}

export interface InventoryBlockManagementNode {
  inventoryBlockId: string
  propertyId: string
  type: InventoryBlockType
  status: InventoryBlockStatus
  startDate: string
  endDateExclusive: string
  reason: string | null
  channelProvider: string | null
  blockVersion: string
  createdAt: string
  updatedAt: string
  releasedAt: string | null
}

export interface InventoryBlockManagementPage {
  nodes: InventoryBlockManagementNode[]
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
  inventoryRevision: string
  branchId: string
  propertyMembershipVersion: string
}

export interface PropertyAvailabilityObservation {
  propertyId: string
  checkInDate: string
  checkOutDate: string
  available: boolean
  inventoryRevision: string
  branchId: string
  propertyMembershipVersion: string
  observedAt: string
  overlaps: Array<{
    type: InventoryBlockType
    status: InventoryBlockStatus
    startDate: string
    endDateExclusive: string
    channelProvider: string | null
  }>
}

export interface CreateInventoryBlockInput {
  idempotencyKey: string
  propertyId: string
  blockType: OperatorInventoryBlockType
  startDate: string
  endDateExclusive: string
  expectedInventoryRevision: string
  reason: string
  correlationId: string
}

export interface ReleaseInventoryBlockInput {
  idempotencyKey: string
  propertyId: string
  inventoryBlockId: string
  expectedInventoryRevision: string
  reason: string
  correlationId: string
}

export interface InventoryBlockCommandResult {
  commandId: string
  idempotencyKey: string
  requestHash: string
  inventoryBlockId: string
  action: 'CREATED' | 'RELEASED'
  propertyId: string
  blockType: InventoryBlockType
  status: InventoryBlockStatus
  startDate: string
  endDateExclusive: string
  blockVersion: string
  inventoryRevision: string
  branchId: string
  propertyMembershipVersion: string
  occurredAt: string
  releasedAt: string | null
}

export interface Notification {
  id: string
  category: NotificationCategory
  title: string
  body: string
  channels: NotificationChannel[]
  requiredChannels?: NotificationChannel[]
  optionalChannels?: NotificationChannel[]
  notificationType?: string | null
  priority?: NotificationPriority | null
  reference?: NotificationReference | null
  templateKey?: string | null
  templateRevision?: number | null
  policyRevision?: number | null
  inboxRevision?: number | null
  createdAt: string
  readAt: string | null
  version?: number | null
}

export interface NotificationStreamEvent {
  cursor: string
  notification: Notification
}

export interface NotificationInboxInput {
  afterCursor?: string | null
  limit?: number
  unreadOnly?: boolean
  category?: NotificationCategory
}

export interface NotificationPageInfo {
  hasNextPage: boolean
  endCursor: string | null
  startCursor: string | null
  cursorState: NotificationCursorState
  retainedFrom: string | null
  reconcileFrom: string | null
}

export interface UnreadNotificationCount {
  count: number
  asOfCursor: string
  inboxRevision: number
}

export interface NotificationInboxPage {
  nodes: Notification[]
  pageInfo: NotificationPageInfo
  unread: UnreadNotificationCount
}

export interface MarkNotificationReadInput {
  notificationId: string
  expectedVersion: number
  idempotencyKey: string
}

export interface NotificationReadResult {
  id: string
  readAt: string | null
  inboxRevision: number
  version: number
}

export interface MarkAllNotificationsReadInput {
  throughCursor: string
  idempotencyKey: string
}

export interface MarkAllNotificationsReadResult {
  markedCount: number
  throughCursor: string
  inboxRevision: number
}

export interface NotificationQuietHours {
  start: string
  end: string
}

export interface NotificationPreference {
  id: string
  notificationType: string
  channel: NotificationChannel
  enabled: boolean
  required: boolean
  quietHours: NotificationQuietHours | null
  timeZoneId: string
  revision: number
  updatedAt: string
}

export interface NotificationPreferenceConnection {
  nodes: NotificationPreference[]
  revision: number
}

export interface NotificationPreferenceUpdateInput {
  notificationType: string
  channel: NotificationChannel
  enabled: boolean
  quietHours: NotificationQuietHours | null
  timeZoneId: string
  expectedVersion: number
}

export interface UpdateNotificationPreferencesInput {
  updates: NotificationPreferenceUpdateInput[]
  idempotencyKey: string
}

export interface NotificationTemplateQueryInput {
  templateKey?: string
  channel?: NotificationChannel
  status?: NotificationTemplateStatus
  afterCursor?: string | null
  limit?: number
}

export interface NotificationTemplate {
  id: string
  templateKey: string
  channel: NotificationChannel
  locale: string
  status: NotificationTemplateStatus
  revision: number
  policyRevision: number
  requiredVariables: string[]
  subject?: string | null
  body?: string | null
  immutable?: boolean
  createdAt?: string
  publishedAt?: string | null
  retiredAt?: string | null
}

export interface NotificationTemplatePage {
  nodes: NotificationTemplate[]
  pageInfo: NotificationPageInfo
}

export interface NotificationTemplatePublishInput {
  templateKey: string
  channel: NotificationChannel
  locale: string
  subject?: string | null
  body: string
  requiredVariables: string[]
  policyRevision: number
  expectedVersion?: number | null
  idempotencyKey: string
}

export interface NotificationTemplatePreviewVariable {
  name: string
  value: string
}

export interface NotificationTemplatePreviewInput {
  templateKey: string
  channel: NotificationChannel
  locale: string
  variables: NotificationTemplatePreviewVariable[]
}

export interface NotificationTemplatePreview {
  templateKey: string
  channel: NotificationChannel
  locale: string
  revision: number
  subject?: string | null
  body: string
}

export interface NotificationTemplateRetireInput {
  templateId: string
  expectedVersion: number
  reason: string
  idempotencyKey: string
}

interface GraphqlResponse<T> {
  data?: T
  errors?: Array<{ message?: string; extensions?: { code?: string } }>
}

export class ApiError extends Error {
  readonly status?: number
  readonly code?: string

  constructor(
    message: string,
    status?: number,
    code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function graphqlErrorMessage(errors: GraphqlResponse<unknown>['errors']): string {
  return errors?.map((error) => error.message ?? 'Lỗi GraphQL không xác định').join('; ')
    ?? 'Phản hồi GraphQL không hợp lệ'
}

function graphqlErrorCode(errors: GraphqlResponse<unknown>['errors']): string | undefined {
  return errors?.find((error) => error.extensions?.code)?.extensions?.code
}

export async function provisionBackofficeAccount(
  authApiUrl: string,
  accessToken: string,
  idempotencyKey: string,
  input: ProvisionBackofficeAccountInput,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<ProvisionedBackofficeAccount> {
  const response = await fetcher(authApiUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
      'x-correlation-id': idempotencyKey,
      'x-csrf-token': '1',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    let detail = `Không thể tạo tài khoản (${response.status})`
    try {
      const problem = await response.json() as { detail?: string; message?: string }
      detail = problem.detail || problem.message || detail
    } catch {
      // The HTTP status remains useful when a proxy returns a non-JSON error body.
    }
    throw new ApiError(detail, response.status)
  }
  return response.json() as Promise<ProvisionedBackofficeAccount>
}

async function authenticationProblem(response: Response, fallback: string): Promise<ApiError> {
  let detail = fallback
  try {
    const problem = await response.json() as { detail?: string; message?: string }
    detail = problem.detail || problem.message || detail
  } catch {
    // Keep the HTTP status fallback when a proxy returns a non-JSON body.
  }
  return new ApiError(detail, response.status)
}

export async function fetchBackofficeSessions(
  authApiUrl: string,
  accessToken: string,
  accountId: string,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<BackofficeSession[]> {
  const response = await fetcher(`${authApiUrl}/${encodeURIComponent(accountId)}/sessions`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      'x-csrf-token': '1',
    },
    signal,
  })
  if (!response.ok) {
    throw await authenticationProblem(response, `Không thể tải phiên hoạt động (${response.status})`)
  }
  return response.json() as Promise<BackofficeSession[]>
}

export async function revokeBackofficeSession(
  authApiUrl: string,
  accessToken: string,
  accountId: string,
  sessionId: string,
  reason: string,
  idempotencyKey: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<SessionRevocationResult> {
  const response = await fetcher(
    `${authApiUrl}/${encodeURIComponent(accountId)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        'x-correlation-id': idempotencyKey,
        'x-csrf-token': '1',
      },
      body: JSON.stringify({ reason }),
    },
  )
  if (!response.ok) {
    throw await authenticationProblem(response, `Không thể thu hồi phiên (${response.status})`)
  }
  return response.json() as Promise<SessionRevocationResult>
}

export async function fetchAccountSecurity(
  authApiUrl: string,
  accessToken: string,
  accountId: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AccountSecurityView> {
  const response = await fetcher(`${authApiUrl}/${encodeURIComponent(accountId)}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}`, 'x-csrf-token': '1' },
  })
  if (!response.ok) throw await authenticationProblem(response, `Không thể tải trạng thái tài khoản (${response.status})`)
  return response.json() as Promise<AccountSecurityView>
}

export async function fetchAccountSecurityEvents(
  authApiUrl: string,
  accessToken: string,
  accountId: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AccountLifecycleEvent[]> {
  const response = await fetcher(`${authApiUrl}/${encodeURIComponent(accountId)}/security-events`, {
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}`, 'x-csrf-token': '1' },
  })
  if (!response.ok) throw await authenticationProblem(response, `Không thể tải sự kiện bảo mật (${response.status})`)
  return response.json() as Promise<AccountLifecycleEvent[]>
}

export async function changeAccountLifecycle(
  authApiUrl: string,
  accessToken: string,
  accountId: string,
  action: AccountLifecycleAction,
  expectedVersion: number,
  reason: string,
  idempotencyKey: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AccountLifecycleResult> {
  const response = await fetcher(`${authApiUrl}/${encodeURIComponent(accountId)}/lifecycle`, {
    method: 'POST',
    headers: {
      accept: 'application/json', authorization: `Bearer ${accessToken}`, 'content-type': 'application/json',
      'idempotency-key': idempotencyKey, 'x-correlation-id': idempotencyKey, 'x-csrf-token': '1',
    },
    body: JSON.stringify({ action, expectedVersion, reason }),
  })
  if (!response.ok) throw await authenticationProblem(response, `Không thể thay đổi trạng thái tài khoản (${response.status})`)
  return response.json() as Promise<AccountLifecycleResult>
}

async function graphqlRequest<T>(
  graphqlUrl: string,
  accessToken: string,
  operationName: string,
  query: string,
  variables: Record<string, unknown> = {},
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<T> {
  const response = await fetcher(graphqlUrl, {
    method: 'POST',
    headers: {
      accept: 'application/graphql-response+json, application/json',
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-csrf-token': '1',
    },
    body: JSON.stringify({ operationName, query, variables }),
    signal,
  })

  if (!response.ok) {
    throw new ApiError(`Yêu cầu GraphQL thất bại (${response.status})`, response.status)
  }
  const payload = await response.json() as GraphqlResponse<T>
  if (payload.errors?.length) {
    throw new ApiError(graphqlErrorMessage(payload.errors), undefined, payload.errors[0]?.extensions?.code)
  }
  if (!payload.data) throw new ApiError('Gateway không trả về dữ liệu')
  return payload.data
}

export async function fetchViewer(
  graphqlUrl: string,
  accessToken: string,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<BackofficeViewer> {
  const response = await fetcher(graphqlUrl, {
    method: 'POST',
    headers: {
      accept: 'application/graphql-response+json, application/json',
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-csrf-token': '1',
    },
    body: JSON.stringify({ operationName: 'Viewer', query: VIEWER_QUERY }),
    signal,
  })

  if (!response.ok) {
    throw new ApiError(`Không thể tải hồ sơ (${response.status})`, response.status)
  }

  const payload = await response.json() as GraphqlResponse<{ viewer: BackofficeViewer }>
  if (payload.errors?.length) {
    throw new ApiError(graphqlErrorMessage(payload.errors))
  }
  if (!payload.data?.viewer) {
    throw new ApiError('Gateway không trả về hồ sơ người dùng')
  }
  return payload.data.viewer
}

export async function fetchNotificationInbox(
  graphqlUrl: string,
  accessToken: string,
  input: NotificationInboxInput = { limit: 50 },
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<NotificationInboxPage> {
  const data = await graphqlRequest<{ notificationInbox: NotificationInboxPage }>(
    graphqlUrl,
    accessToken,
    'NotificationInbox',
    NOTIFICATION_INBOX_QUERY,
    { input },
    signal,
    fetcher,
  )
  return data.notificationInbox
}

export async function fetchUnreadNotificationCount(
  graphqlUrl: string,
  accessToken: string,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<UnreadNotificationCount> {
  const data = await graphqlRequest<{ unreadNotificationCount: UnreadNotificationCount }>(
    graphqlUrl,
    accessToken,
    'UnreadNotificationCount',
    UNREAD_NOTIFICATION_COUNT_QUERY,
    {},
    signal,
    fetcher,
  )
  return data.unreadNotificationCount
}

export async function markNotificationRead(
  graphqlUrl: string,
  accessToken: string,
  input: MarkNotificationReadInput,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<NotificationReadResult> {
  const data = await graphqlRequest<{ markNotificationRead: NotificationReadResult }>(
    graphqlUrl,
    accessToken,
    'MarkNotificationRead',
    MARK_NOTIFICATION_READ_MUTATION,
    { input },
    signal,
    fetcher,
  )
  return data.markNotificationRead
}

export async function markAllNotificationsRead(
  graphqlUrl: string,
  accessToken: string,
  input: MarkAllNotificationsReadInput,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<MarkAllNotificationsReadResult> {
  const data = await graphqlRequest<{ markAllNotificationsRead: MarkAllNotificationsReadResult }>(
    graphqlUrl,
    accessToken,
    'MarkAllNotificationsRead',
    MARK_ALL_NOTIFICATIONS_READ_MUTATION,
    { input },
    signal,
    fetcher,
  )
  return data.markAllNotificationsRead
}

export async function fetchNotificationPreferences(
  graphqlUrl: string,
  accessToken: string,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<NotificationPreferenceConnection> {
  const data = await graphqlRequest<{ notificationPreferences: NotificationPreferenceConnection }>(
    graphqlUrl,
    accessToken,
    'NotificationPreferences',
    NOTIFICATION_PREFERENCES_QUERY,
    {},
    signal,
    fetcher,
  )
  return data.notificationPreferences
}

export async function updateNotificationPreferences(
  graphqlUrl: string,
  accessToken: string,
  input: UpdateNotificationPreferencesInput,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<NotificationPreferenceConnection> {
  const data = await graphqlRequest<{ updateNotificationPreferences: NotificationPreferenceConnection }>(
    graphqlUrl,
    accessToken,
    'UpdateNotificationPreferences',
    UPDATE_NOTIFICATION_PREFERENCES_MUTATION,
    { input },
    signal,
    fetcher,
  )
  return data.updateNotificationPreferences
}

export async function fetchNotificationTemplates(
  graphqlUrl: string,
  accessToken: string,
  input: NotificationTemplateQueryInput = { limit: 25 },
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<NotificationTemplatePage> {
  const data = await graphqlRequest<{ notificationTemplates: NotificationTemplatePage }>(
    graphqlUrl,
    accessToken,
    'NotificationTemplates',
    NOTIFICATION_TEMPLATES_QUERY,
    { input },
    signal,
    fetcher,
  )
  return data.notificationTemplates
}

export async function saveNotificationTemplateDraft(
  graphqlUrl: string,
  accessToken: string,
  input: NotificationTemplatePublishInput,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<NotificationTemplate> {
  const data = await graphqlRequest<{ saveNotificationTemplateDraft: NotificationTemplate }>(
    graphqlUrl,
    accessToken,
    'SaveNotificationTemplateDraft',
    SAVE_NOTIFICATION_TEMPLATE_DRAFT_MUTATION,
    { input },
    signal,
    fetcher,
  )
  return data.saveNotificationTemplateDraft
}

export async function previewNotificationTemplate(
  graphqlUrl: string,
  accessToken: string,
  input: NotificationTemplatePreviewInput,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<NotificationTemplatePreview> {
  const data = await graphqlRequest<{ previewNotificationTemplate: NotificationTemplatePreview }>(
    graphqlUrl,
    accessToken,
    'PreviewNotificationTemplate',
    PREVIEW_NOTIFICATION_TEMPLATE_MUTATION,
    { input },
    signal,
    fetcher,
  )
  return data.previewNotificationTemplate
}

export async function publishNotificationTemplate(
  graphqlUrl: string,
  accessToken: string,
  input: NotificationTemplatePublishInput,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<NotificationTemplate> {
  const data = await graphqlRequest<{ publishNotificationTemplate: NotificationTemplate }>(
    graphqlUrl,
    accessToken,
    'PublishNotificationTemplate',
    PUBLISH_NOTIFICATION_TEMPLATE_MUTATION,
    { input },
    signal,
    fetcher,
  )
  return data.publishNotificationTemplate
}

export async function retireNotificationTemplate(
  graphqlUrl: string,
  accessToken: string,
  input: NotificationTemplateRetireInput,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<NotificationTemplate> {
  const data = await graphqlRequest<{ retireNotificationTemplate: NotificationTemplate }>(
    graphqlUrl,
    accessToken,
    'RetireNotificationTemplate',
    RETIRE_NOTIFICATION_TEMPLATE_MUTATION,
    { input },
    signal,
    fetcher,
  )
  return data.retireNotificationTemplate
}

const UPDATE_MY_PROFILE_MUTATION = `
  mutation UpdateMyProfile($input: UpdateMyProfileInput!) {
    updateMyProfile(input: $input) {
      accountId
      profileId
      displayName
      email
      contactPhone
      avatarMediaId
      version
      updatedAt
      replayed
    }
  }
`

export async function updateMyProfile(
  graphqlUrl: string,
  accessToken: string,
  input: UpdateMyProfileInput,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<PersonalProfile> {
  const data = await graphqlRequest<{ updateMyProfile: PersonalProfile }>(
    graphqlUrl,
    accessToken,
    'UpdateMyProfile',
    UPDATE_MY_PROFILE_MUTATION,
    { input },
    undefined,
    fetcher,
  )
  return data.updateMyProfile
}

const AUTHORIZATION_WORKSPACE_QUERY = `
  query AuthorizationWorkspace($accountType: AccountType!, $accountId: ID!) {
    authorizationSubjectByAccount(accountType: $accountType, accountId: $accountId) {
      id accountType accountId profileId active authorizationVersion
      assignments {
        id roleCode validUntil
        grants { permissionCode scopes }
      }
      effectiveGrants { permissionCode scopes }
    }
    authorizationCatalog(accountType: $accountType) {
      code displayName accountType
      policies { permissionCode allowedScopes defaultScopes }
    }
    authorizationChangeRequests(status: PENDING) {
      id targetSubjectId requestedBySubjectId reviewedBySubjectId changeType
      status roleCode reason reviewReason expiresAt createdAt
    }
  }
`

const ROLE_POLICY_WORKSPACE_QUERY = `
  query RolePolicyWorkspace($accountType: AccountType!) {
    roleCatalog(accountType: $accountType) {
      code displayName description accountType systemRole active roleVersion createdAt updatedAt
      grants { permissionCode allowedScopes partitionTypes }
    }
    permissionCatalog { code resource action description active deprecatedAt aliases }
    rolePolicyChangeRequests(status: PENDING) {
      id roleCode requestedBySubjectId reviewedBySubjectId changeType status
      expectedRoleVersion reason reviewReason expiresAt createdAt
    }
  }
`

const REQUEST_CREATE_ROLE_MUTATION = `
  mutation RequestCreateRole($input: CreateRoleInput!) {
    requestCreateRole(input: $input) {
      id roleCode requestedBySubjectId reviewedBySubjectId changeType status
      expectedRoleVersion reason reviewReason expiresAt createdAt
    }
  }
`

const REQUEST_ROLE_PERMISSION_CHANGE_MUTATION = `
  mutation RequestRolePermissionChange($input: RolePermissionChangeInput!) {
    requestRolePermissionChange(input: $input) {
      id roleCode requestedBySubjectId reviewedBySubjectId changeType status
      expectedRoleVersion reason reviewReason expiresAt createdAt
    }
  }
`

const REQUEST_DEACTIVATE_ROLE_MUTATION = `
  mutation RequestDeactivateRole($input: DeactivateRoleInput!) {
    requestDeactivateRole(input: $input) {
      id roleCode requestedBySubjectId reviewedBySubjectId changeType status
      expectedRoleVersion reason reviewReason expiresAt createdAt
    }
  }
`

const REVIEW_ROLE_POLICY_CHANGE_MUTATION = `
  mutation ReviewRolePolicyChange($id: ID!, $reason: String!, $approve: Boolean!) {
    approve: approveRolePolicyChange(id: $id, reason: $reason) @include(if: $approve) {
      id roleCode requestedBySubjectId reviewedBySubjectId changeType status
      expectedRoleVersion reason reviewReason expiresAt createdAt
    }
    reject: rejectRolePolicyChange(id: $id, reason: $reason) @skip(if: $approve) {
      id roleCode requestedBySubjectId reviewedBySubjectId changeType status
      expectedRoleVersion reason reviewReason expiresAt createdAt
    }
  }
`

const AUTHORIZATION_AUDIT_QUERY = `
  query AuthorizationAudit($targetSubjectId: ID) {
    authorizationAudit(targetSubjectId: $targetSubjectId) {
      id actorSubjectId targetSubjectId action reason correlationId createdAt
    }
  }
`

const AUTHORIZATION_SUBJECT_QUERY = `
  query AuthorizationSubject($subjectId: ID!) {
    authorizationSubject(subjectId: $subjectId) {
      id accountType accountId profileId active authorizationVersion
      assignments { id roleCode validUntil grants { permissionCode scopes } }
      effectiveGrants { permissionCode scopes }
    }
  }
`

const REQUEST_AUTHORIZATION_CHANGE_MUTATION = `
  mutation RequestAuthorizationChange($input: RequestAuthorizationChangeInput!) {
    requestAuthorizationChange(input: $input) {
      id targetSubjectId requestedBySubjectId reviewedBySubjectId changeType
      status roleCode reason reviewReason expiresAt createdAt
    }
  }
`

const APPROVE_AUTHORIZATION_CHANGE_MUTATION = `
  mutation ApproveAuthorizationChange($id: ID!, $reason: String!, $expectedAuthorizationVersion: Int!) {
    approveAuthorizationChange(
      id: $id
      reason: $reason
      expectedAuthorizationVersion: $expectedAuthorizationVersion
    ) {
      id targetSubjectId requestedBySubjectId reviewedBySubjectId changeType
      status roleCode reason reviewReason expiresAt createdAt
    }
  }
`

const REJECT_AUTHORIZATION_CHANGE_MUTATION = `
  mutation RejectAuthorizationChange($id: ID!, $reason: String!) {
    rejectAuthorizationChange(id: $id, reason: $reason) {
      id targetSubjectId requestedBySubjectId reviewedBySubjectId changeType
      status roleCode reason reviewReason expiresAt createdAt
    }
  }
`

const REVOKE_ROLE_ASSIGNMENT_MUTATION = `
  mutation RevokeRoleAssignment($assignmentId: ID!, $reason: String!, $expectedAuthorizationVersion: Int!) {
    revokeRoleAssignment(
      assignmentId: $assignmentId
      reason: $reason
      expectedAuthorizationVersion: $expectedAuthorizationVersion
    ) {
      id accountType accountId profileId active authorizationVersion
      assignments { id roleCode validUntil grants { permissionCode scopes } }
      effectiveGrants { permissionCode scopes }
    }
  }
`

const REDUCE_AUTHORIZATION_SCOPES_MUTATION = `
  mutation ReduceAuthorizationScopes($input: ReduceAuthorizationScopesInput!) {
    reduceAuthorizationScopes(input: $input) {
      id accountType accountId profileId active authorizationVersion
      assignments { id roleCode validUntil grants { permissionCode scopes } }
      effectiveGrants { permissionCode scopes }
    }
  }
`

export async function fetchAuthorizationWorkspace(
  graphqlUrl: string,
  accessToken: string,
  accountType: AccountType,
  accountId: string,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AuthorizationWorkspace> {
  const initial = await graphqlRequest<{
    authorizationSubjectByAccount: AuthorizationSubject
    authorizationCatalog: AuthorizationRole[]
    authorizationChangeRequests: AuthorizationChangeRequest[]
  }>(graphqlUrl, accessToken, 'AuthorizationWorkspace', AUTHORIZATION_WORKSPACE_QUERY, {
    accountType,
    accountId,
  }, signal, fetcher)

  let audit: AuthorizationAuditEvent[] = []
  let auditError: string | undefined
  try {
    const result = await graphqlRequest<{ authorizationAudit: AuthorizationAuditEvent[] }>(
      graphqlUrl,
      accessToken,
      'AuthorizationAudit',
      AUTHORIZATION_AUDIT_QUERY,
      { targetSubjectId: initial.authorizationSubjectByAccount.id },
      signal,
      fetcher,
    )
    audit = result.authorizationAudit
  } catch (error) {
    auditError = error instanceof Error ? error.message : 'Không thể tải audit trail'
  }

  return {
    subject: initial.authorizationSubjectByAccount,
    catalog: initial.authorizationCatalog,
    pendingRequests: initial.authorizationChangeRequests,
    audit,
    auditError,
  }
}

export async function fetchRolePolicyWorkspace(
  graphqlUrl: string,
  accessToken: string,
  accountType: AccountType,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<{
  roles: RolePolicyRole[]
  permissions: PermissionCatalogEntry[]
  pendingRequests: RolePolicyChangeRequest[]
}> {
  const data = await graphqlRequest<{
    roleCatalog: RolePolicyRole[]
    permissionCatalog: PermissionCatalogEntry[]
    rolePolicyChangeRequests: RolePolicyChangeRequest[]
  }>(graphqlUrl, accessToken, 'RolePolicyWorkspace', ROLE_POLICY_WORKSPACE_QUERY,
    { accountType }, undefined, fetcher)
  return {
    roles: data.roleCatalog,
    permissions: data.permissionCatalog,
    pendingRequests: data.rolePolicyChangeRequests,
  }
}

export async function requestCreateRole(
  graphqlUrl: string,
  accessToken: string,
  input: CreateRoleInput,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<RolePolicyChangeRequest> {
  const data = await graphqlRequest<{ requestCreateRole: RolePolicyChangeRequest }>(
    graphqlUrl, accessToken, 'RequestCreateRole', REQUEST_CREATE_ROLE_MUTATION,
    { input }, undefined, fetcher)
  return data.requestCreateRole
}

export async function requestRolePermissionChange(
  graphqlUrl: string,
  accessToken: string,
  input: RolePermissionChangeInput,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<RolePolicyChangeRequest> {
  const data = await graphqlRequest<{ requestRolePermissionChange: RolePolicyChangeRequest }>(
    graphqlUrl, accessToken, 'RequestRolePermissionChange', REQUEST_ROLE_PERMISSION_CHANGE_MUTATION,
    { input }, undefined, fetcher)
  return data.requestRolePermissionChange
}

export async function requestDeactivateRole(
  graphqlUrl: string,
  accessToken: string,
  input: DeactivateRoleInput,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<RolePolicyChangeRequest> {
  const data = await graphqlRequest<{ requestDeactivateRole: RolePolicyChangeRequest }>(
    graphqlUrl, accessToken, 'RequestDeactivateRole', REQUEST_DEACTIVATE_ROLE_MUTATION,
    { input }, undefined, fetcher)
  return data.requestDeactivateRole
}

export async function reviewRolePolicyChange(
  graphqlUrl: string,
  accessToken: string,
  id: string,
  reason: string,
  approve: boolean,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<RolePolicyChangeRequest> {
  const data = await graphqlRequest<{
    approve: RolePolicyChangeRequest | null
    reject: RolePolicyChangeRequest | null
  }>(graphqlUrl, accessToken, 'ReviewRolePolicyChange', REVIEW_ROLE_POLICY_CHANGE_MUTATION,
    { id, reason, approve }, undefined, fetcher)
  const result = data.approve ?? data.reject
  if (!result) throw new Error('Role policy review returned no result')
  return result
}

export async function requestAuthorizationChange(
  graphqlUrl: string,
  accessToken: string,
  input: RequestAuthorizationChangeInput,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AuthorizationChangeRequest> {
  const data = await graphqlRequest<{ requestAuthorizationChange: AuthorizationChangeRequest }>(
    graphqlUrl,
    accessToken,
    'RequestAuthorizationChange',
    REQUEST_AUTHORIZATION_CHANGE_MUTATION,
    { input },
    undefined,
    fetcher,
  )
  return data.requestAuthorizationChange
}

export async function fetchAuthorizationSubject(
  graphqlUrl: string,
  accessToken: string,
  subjectId: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AuthorizationSubject> {
  const data = await graphqlRequest<{ authorizationSubject: AuthorizationSubject }>(
    graphqlUrl,
    accessToken,
    'AuthorizationSubject',
    AUTHORIZATION_SUBJECT_QUERY,
    { subjectId },
    undefined,
    fetcher,
  )
  return data.authorizationSubject
}

export async function approveAuthorizationChange(
  graphqlUrl: string,
  accessToken: string,
  id: string,
  reason: string,
  expectedAuthorizationVersion: number,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AuthorizationChangeRequest> {
  const data = await graphqlRequest<{ approveAuthorizationChange: AuthorizationChangeRequest }>(
    graphqlUrl,
    accessToken,
    'ApproveAuthorizationChange',
    APPROVE_AUTHORIZATION_CHANGE_MUTATION,
    { id, reason, expectedAuthorizationVersion },
    undefined,
    fetcher,
  )
  return data.approveAuthorizationChange
}

export async function rejectAuthorizationChange(
  graphqlUrl: string,
  accessToken: string,
  id: string,
  reason: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AuthorizationChangeRequest> {
  const data = await graphqlRequest<{ rejectAuthorizationChange: AuthorizationChangeRequest }>(
    graphqlUrl,
    accessToken,
    'RejectAuthorizationChange',
    REJECT_AUTHORIZATION_CHANGE_MUTATION,
    { id, reason },
    undefined,
    fetcher,
  )
  return data.rejectAuthorizationChange
}

export async function revokeRoleAssignment(
  graphqlUrl: string,
  accessToken: string,
  assignmentId: string,
  reason: string,
  expectedAuthorizationVersion: number,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AuthorizationSubject> {
  const data = await graphqlRequest<{ revokeRoleAssignment: AuthorizationSubject }>(
    graphqlUrl,
    accessToken,
    'RevokeRoleAssignment',
    REVOKE_ROLE_ASSIGNMENT_MUTATION,
    { assignmentId, reason, expectedAuthorizationVersion },
    undefined,
    fetcher,
  )
  return data.revokeRoleAssignment
}

export async function reduceAuthorizationScopes(
  graphqlUrl: string,
  accessToken: string,
  input: ReduceAuthorizationScopesInput,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<AuthorizationSubject> {
  const data = await graphqlRequest<{ reduceAuthorizationScopes: AuthorizationSubject }>(
    graphqlUrl,
    accessToken,
    'ReduceAuthorizationScopes',
    REDUCE_AUTHORIZATION_SCOPES_MUTATION,
    { input },
    undefined,
    fetcher,
  )
  return data.reduceAuthorizationScopes
}

const INVENTORY_BLOCKS_QUERY = `
  query InventoryBlocks($input: InventoryBlockManagementInput!) {
    inventoryBlocks(input: $input) {
      nodes {
        inventoryBlockId propertyId type status startDate endDateExclusive reason
        channelProvider blockVersion createdAt updatedAt releasedAt
      }
      pageInfo { hasNextPage endCursor }
      inventoryRevision branchId propertyMembershipVersion
    }
  }
`

const PROPERTY_AVAILABILITY_QUERY = `
  query PropertyAvailability($input: PropertyAvailabilityInput!) {
    propertyAvailability(input: $input) {
      propertyId checkInDate checkOutDate available inventoryRevision branchId
      propertyMembershipVersion observedAt
      overlaps { type status startDate endDateExclusive channelProvider }
    }
  }
`

const CREATE_INVENTORY_BLOCK_MUTATION = `
  mutation CreateInventoryBlock($input: CreateInventoryBlockInput!) {
    createInventoryBlock(input: $input) {
      commandId idempotencyKey requestHash inventoryBlockId action propertyId blockType
      status startDate endDateExclusive blockVersion inventoryRevision branchId
      propertyMembershipVersion occurredAt releasedAt
    }
  }
`

const RELEASE_INVENTORY_BLOCK_MUTATION = `
  mutation ReleaseInventoryBlock($input: ReleaseInventoryBlockInput!) {
    releaseInventoryBlock(input: $input) {
      commandId idempotencyKey requestHash inventoryBlockId action propertyId blockType
      status startDate endDateExclusive blockVersion inventoryRevision branchId
      propertyMembershipVersion occurredAt releasedAt
    }
  }
`

export async function fetchInventoryBlocks(
  graphqlUrl: string,
  accessToken: string,
  input: InventoryBlockManagementInput,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<InventoryBlockManagementPage> {
  const data = await graphqlRequest<{ inventoryBlocks: InventoryBlockManagementPage }>(
    graphqlUrl,
    accessToken,
    'InventoryBlocks',
    INVENTORY_BLOCKS_QUERY,
    { input },
    signal,
    fetcher,
  )
  return data.inventoryBlocks
}

export async function fetchPropertyAvailability(
  graphqlUrl: string,
  accessToken: string,
  propertyId: string,
  checkInDate: string,
  checkOutDate: string,
  signal?: AbortSignal,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<PropertyAvailabilityObservation> {
  const data = await graphqlRequest<{ propertyAvailability: PropertyAvailabilityObservation }>(
    graphqlUrl,
    accessToken,
    'PropertyAvailability',
    PROPERTY_AVAILABILITY_QUERY,
    { input: { propertyId, checkInDate, checkOutDate } },
    signal,
    fetcher,
  )
  return data.propertyAvailability
}

export async function createInventoryBlock(
  graphqlUrl: string,
  accessToken: string,
  input: CreateInventoryBlockInput,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<InventoryBlockCommandResult> {
  const data = await graphqlRequest<{ createInventoryBlock: InventoryBlockCommandResult }>(
    graphqlUrl,
    accessToken,
    'CreateInventoryBlock',
    CREATE_INVENTORY_BLOCK_MUTATION,
    { input },
    undefined,
    fetcher,
  )
  return data.createInventoryBlock
}

export async function releaseInventoryBlock(
  graphqlUrl: string,
  accessToken: string,
  input: ReleaseInventoryBlockInput,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<InventoryBlockCommandResult> {
  const data = await graphqlRequest<{ releaseInventoryBlock: InventoryBlockCommandResult }>(
    graphqlUrl,
    accessToken,
    'ReleaseInventoryBlock',
    RELEASE_INVENTORY_BLOCK_MUTATION,
    { input },
    undefined,
    fetcher,
  )
  return data.releaseInventoryBlock
}

export interface SseFrame {
  event: string
  data: string
  id?: string
  retry?: number
}

/** Incremental parser for the EventSource wire format used by GraphQL-over-SSE. */
export class SseParser {
  private buffer = ''
  private event = ''
  private data: string[] = []
  private id: string | undefined
  private retry: number | undefined

  push(chunk: string): SseFrame[] {
    this.buffer += chunk
    const frames: SseFrame[] = []
    let lineEnd = this.buffer.indexOf('\n')
    while (lineEnd >= 0) {
      let line = this.buffer.slice(0, lineEnd)
      this.buffer = this.buffer.slice(lineEnd + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      const frame = this.consumeLine(line)
      if (frame) frames.push(frame)
      lineEnd = this.buffer.indexOf('\n')
    }
    return frames
  }

  finish(): SseFrame[] {
    const frames: SseFrame[] = []
    if (this.buffer) {
      const frame = this.consumeLine(this.buffer.endsWith('\r') ? this.buffer.slice(0, -1) : this.buffer)
      if (frame) frames.push(frame)
      this.buffer = ''
    }
    const finalFrame = this.dispatch()
    if (finalFrame) frames.push(finalFrame)
    return frames
  }

  private consumeLine(line: string): SseFrame | undefined {
    if (line === '') return this.dispatch()
    if (line.startsWith(':')) return undefined

    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    let value = separator < 0 ? '' : line.slice(separator + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') this.event = value
    if (field === 'data') this.data.push(value)
    if (field === 'id' && !value.includes('\0')) this.id = value
    if (field === 'retry' && /^\d+$/.test(value)) this.retry = Number(value)
    return undefined
  }

  private dispatch(): SseFrame | undefined {
    if (this.data.length === 0) {
      this.event = ''
      this.retry = undefined
      return undefined
    }
    const frame: SseFrame = {
      event: this.event || 'message',
      data: this.data.join('\n'),
      id: this.id,
      retry: this.retry,
    }
    this.event = ''
    this.data = []
    this.retry = undefined
    return frame
  }
}

export interface ConsumeNotificationStreamOptions {
  graphqlUrl: string
  accessToken: string
  afterCursor: string | null
  signal: AbortSignal
  onOpen?: () => void
  onEvent: (event: NotificationStreamEvent) => void | Promise<void>
  fetcher?: typeof globalThis.fetch
}

function decodeNotificationFrame(frame: SseFrame): NotificationStreamEvent | undefined {
  if (frame.event === 'complete' || frame.event === 'ping' || frame.event === 'ka') return undefined

  const payload = JSON.parse(frame.data) as GraphqlResponse<{
    notificationStream: NotificationStreamEvent
  }>
  if (payload.errors?.length) {
    throw new ApiError(graphqlErrorMessage(payload.errors), undefined, graphqlErrorCode(payload.errors))
  }
  const streamEvent = payload.data?.notificationStream
  if (!streamEvent) return undefined
  if (!isDurableCursor(streamEvent.cursor)) {
    throw new ApiError('Gateway trả về cursor thông báo không hợp lệ')
  }
  if (!streamEvent.notification?.id) {
    throw new ApiError('Gateway trả về thông báo không có định danh')
  }
  return streamEvent
}

export async function consumeNotificationStream({
  graphqlUrl,
  accessToken,
  afterCursor,
  signal,
  onOpen,
  onEvent,
  fetcher = globalThis.fetch,
}: ConsumeNotificationStreamOptions): Promise<void> {
  const response = await fetcher(graphqlUrl, {
    method: 'POST',
    headers: {
      accept: 'text/event-stream',
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-csrf-token': '1',
    },
    body: JSON.stringify({
      operationName: 'NotificationStream',
      query: NOTIFICATION_STREAM_SUBSCRIPTION,
      variables: { afterCursor },
    }),
    signal,
  })

  if (!response.ok) {
    throw new ApiError(`Không thể mở luồng thông báo (${response.status})`, response.status)
  }
  if (!response.body) throw new ApiError('Thiết bị không hỗ trợ luồng SSE')
  onOpen?.()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = new SseParser()
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      const frames = done
        ? parser.finish()
        : parser.push(decoder.decode(value, { stream: true }))
      for (const frame of frames) {
        if (frame.event === 'complete') return
        const streamEvent = decodeNotificationFrame(frame)
        if (streamEvent) await onEvent(streamEvent)
      }
      if (done) return
    }
  } finally {
    reader.releaseLock()
  }
}

export function isDurableCursor(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)
}

export function notificationRevision(notification: Notification): number {
  return notification.inboxRevision ?? notification.version ?? 0
}

/** Merge an ordered server page without allowing an older replay to overwrite a newer row. */
export function mergeNotifications(
  existing: Notification[],
  incoming: Notification[],
  limit = 50,
): Notification[] {
  const merged = [...existing]
  const indexes = new Map(merged.map((notification, index) => [notification.id, index]))
  for (const notification of incoming) {
    const index = indexes.get(notification.id)
    if (index === undefined) {
      indexes.set(notification.id, merged.length)
      merged.push(notification)
      continue
    }
    const current = merged[index]
    if (current && notificationRevision(notification) >= notificationRevision(current)) {
      merged[index] = notification
    }
  }
  return merged.slice(0, Math.max(1, limit))
}

/** Map only known first-party references to local routes; raw actionUrl is intentionally ignored. */
export function mapNotificationReference(reference: NotificationReference | null | undefined): string | null {
  if (!reference) return null
  const type = reference.type.trim().toUpperCase()
  const id = reference.id.trim()
  if (!id || id.length > 128 || /[\u0000-\u001f\u007f]/.test(id)) return null
  const encodedId = encodeURIComponent(id)
  switch (type) {
    case 'BOOKING':
      return `#inventory?reference=${encodedId}`
    case 'PROPERTY':
      return `#inventory?property=${encodedId}`
    case 'ACCOUNT':
      return `#accounts?account=${encodedId}`
    case 'AUTHORIZATION':
      return `#authorization?subject=${encodedId}`
    case 'NOTIFICATION':
      return `#notifications?notification=${encodedId}`
    default:
      return null
  }
}

export function prependNotification(
  notifications: Notification[],
  incoming: Notification,
  limit = 50,
): Notification[] {
  const existingIndex = notifications.findIndex((notification) => notification.id === incoming.id)
  if (existingIndex >= 0) {
    const existing = notifications[existingIndex]
    if (!existing || notificationRevision(incoming) <= notificationRevision(existing)) return notifications
    const updated = [...notifications]
    updated[existingIndex] = incoming
    return updated
  }
  return [incoming, ...notifications].slice(0, limit)
}

export interface DynamicConfigurationWorkspace {
  loyaltyPrograms: Array<{ id: string; code: string; name: string; rowVersion: string; versions: Array<{ version: number; status: string; qualificationWindow: string; rollingWindowDays?: number; effectiveFrom: string; effectiveTo?: string; tiers: Array<{ code: string; displayName: string; minimumPoints: string; displayOrder: number }> }> }>
  loyaltyRequests: Array<{ id: string; programCode: string; status: string; reason: string; requestedBySubjectId: string; createdAt: string }>
  propertyAttributes: Array<{ id: string; code: string; label: string; description?: string; groupCode: string; dataType: string; status: string; visibility: string; rowVersion: string; version: number; requiredOnPublish: boolean; filterable: boolean; displayOrder: number; unitLabel?: string }>
  bookingPolicies: Array<{ id: string; code: string; name: string; policyType: string; status: string; version: number; rowVersion: string; effectiveFrom: string; effectiveTo?: string; holdMinutes: number; minimumNoticeHours: number; maximumAdvanceDays: number; minimumStayNights: number; maximumStayNights?: number; minimumGuestAge: number; securityDepositAmount: string; currency: string }>
  bookingRequests: Array<{ id: string; policyCode: string; status: string; reason: string; requestedByAccountId: string }>
}

const DYNAMIC_CONFIGURATION_WORKSPACE_QUERY = `
  query DynamicConfigurationWorkspace {
    loyaltyPrograms { id code name rowVersion versions { version status qualificationWindow rollingWindowDays effectiveFrom effectiveTo tiers { code displayName minimumPoints displayOrder } } }
    loyaltyRequests: loyaltyProgramChangeRequests(status: "PENDING") { id programCode status reason requestedBySubjectId createdAt }
    propertyAttributes: propertyAttributeCatalog(includeDrafts: true) { id code label description groupCode dataType status visibility rowVersion version requiredOnPublish filterable displayOrder unitLabel }
    bookingPolicies: bookingPolicyCatalog(includeDrafts: true) { id code name policyType status version rowVersion effectiveFrom effectiveTo holdMinutes minimumNoticeHours maximumAdvanceDays minimumStayNights maximumStayNights minimumGuestAge securityDepositAmount currency }
    bookingRequests: bookingPolicyChangeRequests(status: "PENDING") { id policyCode status reason requestedByAccountId }
  }
`

export async function fetchDynamicConfigurationWorkspace(
  graphqlUrl: string,
  accessToken: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<DynamicConfigurationWorkspace> {
  return graphqlRequest<DynamicConfigurationWorkspace>(graphqlUrl, accessToken,
    'DynamicConfigurationWorkspace', DYNAMIC_CONFIGURATION_WORKSPACE_QUERY, {}, undefined, fetcher)
}

export interface LoyaltyTierInput { code: string; displayName: string; minimumPoints: string; displayOrder: number }
export interface LoyaltyEarningRuleInput { code: string; ruleType: string; points: string; amountBlock?: string; priority: number }
export interface LoyaltyProgramChangeInput {
  code: string; name: string; scopeType: string; scopeId?: string; qualificationWindow: string
  rollingWindowDays?: number; effectiveFrom: string; effectiveTo?: string; expectedVersion?: string
  tiers: LoyaltyTierInput[]; earningRules: LoyaltyEarningRuleInput[]; reason: string; idempotencyKey: string
}
export interface PropertyAttributeDraftInput {
  code: string; label: string; description?: string; groupCode: string; dataType: string
  validation?: { minimum?: string; maximum?: string; minLength?: number; maxLength?: number; pattern?: string }
  applicability?: { propertyTypes?: string[]; operatingModels?: string[] }; visibility: string
  requiredOnPublish: boolean; filterable: boolean; displayOrder: number; unitLabel?: string
  options?: Array<{ code: string; label: string; displayOrder: number }>; reason: string; idempotencyKey: string
}
export interface BookingPolicyChangeInput {
  code: string; name: string; policyType: string; effectiveFrom: string; effectiveTo?: string
  holdMinutes: number; minimumNoticeHours: number; maximumAdvanceDays: number; minimumStayNights: number
  maximumStayNights?: number; minimumGuestAge: number; securityDepositAmount: string; currency: string
  allowedStayTypes: string[]; allowedChannels: string[]
  cancellationRules?: { refundableUntilHours?: number; lateCancellationChargePercent?: number; noShowChargePercent?: number }
  guestRules?: { petsAllowed?: boolean; smokingAllowed?: boolean; partiesAllowed?: boolean; quietHoursStart?: string; quietHoursEnd?: string }
  bindings: Array<{ scopeType: string; scopeId?: string; priority: number }>
  expectedPolicyVersion: string; reason: string; idempotencyKey: string
}

export async function requestLoyaltyConfiguration(graphqlUrl: string, accessToken: string,
  input: LoyaltyProgramChangeInput, fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<void> {
  const query = `mutation RequestLoyaltyConfiguration($input: LoyaltyProgramChangeInput!) { requestLoyaltyProgramChange(input: $input) { id status } }`
  await graphqlRequest(graphqlUrl, accessToken, 'RequestLoyaltyConfiguration', query, { input }, undefined, fetcher)
}

export async function reviewLoyaltyConfiguration(graphqlUrl: string, accessToken: string,
  id: string, reason: string, approve: boolean, fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<void> {
  const operation = approve ? 'approveLoyaltyProgramChange' : 'rejectLoyaltyProgramChange'
  const query = `mutation ReviewLoyaltyConfiguration($id: ID!, $reason: String!) { ${operation}(id: $id, reason: $reason) { id status } }`
  await graphqlRequest(graphqlUrl, accessToken, 'ReviewLoyaltyConfiguration', query, { id, reason }, undefined, fetcher)
}

export async function adjustLoyaltyPoints(graphqlUrl: string, accessToken: string,
  input: { customerAccountId: string; delta: string; reason: string; idempotencyKey: string },
  fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<void> {
  const query = `mutation AdjustLoyaltyPoints($input: QualifyingPointAdjustmentInput!) { adjustQualifyingPoints(input: $input) { status qualifyingPoints currentTier { displayName } } }`
  await graphqlRequest(graphqlUrl, accessToken, 'AdjustLoyaltyPoints', query, { input }, undefined, fetcher)
}

export async function createPropertyAttributeConfiguration(graphqlUrl: string, accessToken: string,
  input: PropertyAttributeDraftInput, fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<void> {
  const query = `mutation CreatePropertyAttributeConfiguration($input: PropertyAttributeDraftInput!) { createPropertyAttributeDraft(input: $input) { id status rowVersion } }`
  await graphqlRequest(graphqlUrl, accessToken, 'CreatePropertyAttributeConfiguration', query, { input }, undefined, fetcher)
}

export async function changePropertyAttributeStatus(graphqlUrl: string, accessToken: string,
  definitionId: string, expectedRowVersion: string, reason: string, publish: boolean,
  fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<void> {
  const operation = publish ? 'publishPropertyAttribute' : 'retirePropertyAttribute'
  const query = `mutation ChangePropertyAttributeStatus($definitionId: ID!, $expectedRowVersion: String!, $reason: String!) { ${operation}(definitionId: $definitionId, expectedRowVersion: $expectedRowVersion, reason: $reason) { id status rowVersion } }`
  await graphqlRequest(graphqlUrl, accessToken, 'ChangePropertyAttributeStatus', query,
    { definitionId, expectedRowVersion, reason }, undefined, fetcher)
}

export async function requestBookingConfiguration(graphqlUrl: string, accessToken: string,
  input: BookingPolicyChangeInput, fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<void> {
  const query = `mutation RequestBookingConfiguration($input: BookingPolicyChangeInput!) { requestBookingPolicyChange(input: $input) { id status } }`
  await graphqlRequest(graphqlUrl, accessToken, 'RequestBookingConfiguration', query, { input }, undefined, fetcher)
}

export interface BookingPolicySimulation { id: string; allowed: boolean; reasons: string[]; policy: { code: string; version: number; scopeType: string } }
export async function simulateBookingConfiguration(graphqlUrl: string, accessToken: string,
  input: { policyType: string; organizationId?: string; branchId?: string; propertyId?: string; at: string; stayNights: number; noticeHours: number; advanceDays: number },
  fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<BookingPolicySimulation> {
  const query = `mutation SimulateBookingConfiguration($input: BookingPolicySimulationInput!) { simulateBookingPolicy(input: $input) { id allowed reasons policy { code version scopeType } } }`
  const data = await graphqlRequest<{ simulateBookingPolicy: BookingPolicySimulation }>(graphqlUrl, accessToken,
    'SimulateBookingConfiguration', query, { input }, undefined, fetcher)
  return data.simulateBookingPolicy
}

export interface OperationsAnalytics {
  from: string; to: string; generatedAt: string; totalBookings: number; confirmedBookings: number
  cancelledBookings: number; guests: number; activeProperties: number; occupiedNights: number
  occupancyRate: string; cancellationRate: string
  money: Array<{ currency: string; revenue: string; averageBookingValue: string }>
  series: Array<{ day: string; bookings: number; revenue: string; guests: number }>
  channels: Array<{ code: string; bookings: number; revenue: string }>
  statuses: Array<{ code: string; bookings: number; revenue: string }>
}

export async function fetchOperationsAnalytics(graphqlUrl: string, accessToken: string,
  input: { from: string; to: string }, fetcher: typeof globalThis.fetch = globalThis.fetch): Promise<OperationsAnalytics> {
  const query = `query OperationsAnalytics($input: AnalyticsRangeInput!) { operationsAnalytics(input: $input) { from to generatedAt totalBookings confirmedBookings cancelledBookings guests activeProperties occupiedNights occupancyRate cancellationRate money { currency revenue averageBookingValue } series { day bookings revenue guests } channels { code bookings revenue } statuses { code bookings revenue } } }`
  const data = await graphqlRequest<{ operationsAnalytics: OperationsAnalytics }>(graphqlUrl, accessToken,
    'OperationsAnalytics', query, { input }, undefined, fetcher)
  return data.operationsAnalytics
}

export type OverviewView = 'SYSTEM' | 'PERSONAL'

export interface OverviewBookingAnalytics {
  view: OverviewView
  from: string
  to: string
  generatedAt: string
  totalBookings: number
  confirmedBookings: number
  cancelledBookings: number
  guests: number
  bookedProperties: number
  occupiedNights: number
  occupancyRate: string
  today: {
    expectedCheckIns: number
    expectedCheckOuts: number
    inHouse: number
    pendingConfirmation: number
    cancelledToday: number
    occupiedProperties: number
  }
  money: Array<{ currency: string; revenue: string; averageBookingValue: string }>
}

export interface OverviewDashboardData {
  booking: OverviewBookingAnalytics | null
  property: {
    activeProperties: number
    maintenanceProperties: number
    propertiesNeedingAttention: number
  } | null
  finance: {
    totalGrossRevenue: string
    totalCommissionEarned: string
    totalCleaningFees: string
    totalAdjustments: string
    totalNetPayoutCalculated: string
    totalPayableOutstanding: string
    totalPayablePaid: string
    totalSettlementCount: number
    approvedSettlementCount: number
    paidSettlementCount: number
  } | null
  errors: string[]
}

export async function fetchOverviewDashboard(
  graphqlUrl: string,
  accessToken: string,
  input: { view: OverviewView; from: string; to: string; includeProperty: boolean; includeFinance: boolean },
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<OverviewDashboardData> {
  const query = `query OverviewDashboard($view: OverviewView!, $input: AnalyticsRangeInput!, $includeProperty: Boolean!, $includeFinance: Boolean!) {
    booking: overviewAnalytics(view: $view, input: $input) {
      view from to generatedAt totalBookings confirmedBookings cancelledBookings guests bookedProperties
      occupiedNights occupancyRate
      today { expectedCheckIns expectedCheckOuts inHouse pendingConfirmation cancelledToday occupiedProperties }
      money { currency revenue averageBookingValue }
    }
    property: propertyOperationalSummary @include(if: $includeProperty) {
      activeProperties maintenanceProperties propertiesNeedingAttention
    }
    finance: financeDashboardSummary @include(if: $includeFinance) {
      totalGrossRevenue totalCommissionEarned totalCleaningFees totalAdjustments totalNetPayoutCalculated
      totalPayableOutstanding totalPayablePaid totalSettlementCount approvedSettlementCount paidSettlementCount
    }
  }`
  const response = await fetcher(graphqlUrl, {
    method: 'POST',
    headers: {
      accept: 'application/graphql-response+json, application/json',
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'x-csrf-token': '1',
    },
    body: JSON.stringify({
      operationName: 'OverviewDashboard',
      query,
      variables: {
        view: input.view,
        input: { from: input.from, to: input.to },
        includeProperty: input.includeProperty,
        includeFinance: input.includeFinance,
      },
    }),
  })
  const payload = await response.json() as GraphqlResponse<{
    booking?: OverviewBookingAnalytics | null
    property?: OverviewDashboardData['property']
    finance?: OverviewDashboardData['finance']
  }>
  if (!response.ok && !payload.data) {
    throw new ApiError(graphqlErrorMessage(payload.errors) || `Overview request failed (${response.status})`, response.status)
  }
  return {
    booking: payload.data?.booking ?? null,
    property: payload.data?.property ?? null,
    finance: payload.data?.finance ?? null,
    errors: payload.errors?.map((error) => error.message || error.extensions?.code || 'Không tải được một nguồn dữ liệu') ?? [],
  }
}

export async function reviewBookingConfiguration(
  graphqlUrl: string,
  accessToken: string,
  id: string,
  reason: string,
  approve: boolean,
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<void> {
  const operation = approve ? 'approveBookingPolicyChange' : 'rejectBookingPolicyChange'
  const query = `mutation ReviewBookingConfiguration($id: ID!, $reason: String!) { ${operation}(id: $id, reason: $reason) { id status } }`
  await graphqlRequest<Record<string, { id: string; status: string }>>(graphqlUrl, accessToken,
    'ReviewBookingConfiguration', query, { id, reason }, undefined, fetcher)
}
