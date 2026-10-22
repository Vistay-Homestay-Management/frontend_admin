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
