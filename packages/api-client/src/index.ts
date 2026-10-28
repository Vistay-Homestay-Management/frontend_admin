export const VIEWER_QUERY = `
  query Viewer {
    viewer {
      accountId
      profileId
      displayName
      email
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
        createdAt
        readAt
      }
    }
  }
`

export type NotificationCategory = 'WELCOME' | 'SECURITY'
export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'PUSH'

export interface BackofficeViewer {
  accountId: string
  profileId: string
  displayName: string
  email: string
  roles: string[]
  permissions: string[]
  authorizationVersion: number
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

export interface Notification {
  id: string
  category: NotificationCategory
  title: string
  body: string
  channels: NotificationChannel[]
  createdAt: string
  readAt: string | null
}

export interface NotificationStreamEvent {
  cursor: string
  notification: Notification
}

interface GraphqlResponse<T> {
  data?: T
  errors?: Array<{ message?: string }>
}

export class ApiError extends Error {
  readonly status?: number

  constructor(
    message: string,
    status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function graphqlErrorMessage(errors: GraphqlResponse<unknown>['errors']): string {
  return errors?.map((error) => error.message ?? 'Lỗi GraphQL không xác định').join('; ')
    ?? 'Phản hồi GraphQL không hợp lệ'
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
  if (payload.errors?.length) throw new ApiError(graphqlErrorMessage(payload.errors))
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
  if (payload.errors?.length) throw new ApiError(graphqlErrorMessage(payload.errors))
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

export function prependNotification(
  notifications: Notification[],
  incoming: Notification,
  limit = 50,
): Notification[] {
  if (notifications.some((notification) => notification.id === incoming.id)) return notifications
  return [incoming, ...notifications].slice(0, limit)
}
