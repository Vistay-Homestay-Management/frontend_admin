import { useCallback, useEffect, useState } from 'react'
import {
  consumeNotificationStream,
  fetchNotificationInbox,
  fetchViewer,
  isDurableCursor,
  markAllNotificationsRead,
  markNotificationRead,
  mergeNotifications,
  prependNotification,
  type BackofficeViewer,
  type Notification,
  type NotificationCursorState,
  type NotificationInboxPage,
} from '@vistay/admin-api-client'

type LoadStatus = 'loading' | 'ready' | 'error'
export type StreamStatus = 'connecting' | 'live' | 'retrying' | 'error'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Đã có lỗi không xác định'
}

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useViewer(graphqlUrl: string, accessToken: string | undefined) {
  const [viewer, setViewer] = useState<BackofficeViewer>()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setStatus('loading')
    setError(undefined)
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    void fetchViewer(graphqlUrl, accessToken, controller.signal)
      .then((profile) => {
        setViewer(profile)
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(errorMessage(reason))
        setStatus('error')
      })
    return () => controller.abort()
  }, [accessToken, attempt, graphqlUrl])

  return { error, retry, status, viewer }
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout)
      resolve()
    }, { once: true })
  })
}

export function useNotificationStream(
  graphqlUrl: string,
  accessToken: string | undefined,
  accountId: string | undefined,
) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [error, setError] = useState<string>()
  const [restart, setRestart] = useState(0)
  const reconnect = useCallback(() => setRestart((value) => value + 1), [])

  useEffect(() => {
    if (!accessToken || !accountId) return
    const token = accessToken
    const controller = new AbortController()
    const cursorKey = `vistay.notifications.cursor.${accountId}`
    const storedCursor = window.localStorage.getItem(cursorKey)
    let cursor = isDurableCursor(storedCursor) ? storedCursor : null
    if (storedCursor && !cursor) window.localStorage.removeItem(cursorKey)
    let failures = 0
    const seenIds = new Set<string>()

    async function run() {
      while (!controller.signal.aborted) {
        setStatus(failures === 0 ? 'connecting' : 'retrying')
        try {
          await consumeNotificationStream({
            graphqlUrl,
            accessToken: token,
            afterCursor: cursor,
            signal: controller.signal,
            onOpen: () => {
              failures = 0
              setError(undefined)
              setStatus('live')
            },
            onEvent: (event) => {
              if (!seenIds.has(event.notification.id)) {
                seenIds.add(event.notification.id)
                setNotifications((current) => prependNotification(current, event.notification, 100))
              }
              cursor = event.cursor
              window.localStorage.setItem(cursorKey, event.cursor)
              failures = 0
              setError(undefined)
              setStatus('live')
            },
          })
          if (!controller.signal.aborted) failures += 1
        } catch (reason) {
          if (controller.signal.aborted) return
          failures += 1
          setError(errorMessage(reason))
          setStatus(failures >= 5 ? 'error' : 'retrying')
        }
        if (!controller.signal.aborted) {
          await sleep(Math.min(1_000 * 2 ** Math.min(failures - 1, 4), 15_000), controller.signal)
        }
      }
    }

    void run()
    return () => controller.abort()
  }, [accessToken, accountId, graphqlUrl, restart])

  return { error, notifications, reconnect, status }
}

export interface NotificationInboxModel {
  error?: string
  inboxStatus: LoadStatus
  loadingMore: boolean
  notifications: Notification[]
  pageInfo?: NotificationInboxPage['pageInfo']
  cursorState?: NotificationCursorState
  unreadCount: number
  unreadCursor?: string
  status: StreamStatus
  reconnect: () => void
  retry: () => void
  loadMore: () => Promise<void>
  markRead: (notification: Notification) => Promise<void>
  markAllRead: () => Promise<void>
}

function isCursorRecoveryError(reason: unknown): boolean {
  const code = reason && typeof reason === 'object' && 'code' in reason
    ? String((reason as { code?: unknown }).code ?? '')
    : ''
  return ['CURSOR_EXPIRED', 'CURSOR_INVALID', 'CURSOR_RESYNC_REQUIRED'].includes(code)
    || /cursor.*(expired|invalid|resync)/i.test(errorMessage(reason))
}

function mergeReadResult(
  current: Notification,
  result: { readAt: string | null; inboxRevision: number; version: number },
): Notification {
  return {
    ...current,
    readAt: result.readAt,
    inboxRevision: result.inboxRevision,
    version: result.version,
  }
}

export function useNotificationInbox(
  graphqlUrl: string,
  accessToken: string | undefined,
  accountId: string | undefined,
): NotificationInboxModel {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [pageInfo, setPageInfo] = useState<NotificationInboxPage['pageInfo']>()
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadCursor, setUnreadCursor] = useState<string>()
  const [inboxStatus, setInboxStatus] = useState<LoadStatus>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [error, setError] = useState<string>()
  const [restart, setRestart] = useState(0)
  const [reload, setReload] = useState(0)
  const reconnect = useCallback(() => setRestart((value) => value + 1), [])
  const retry = useCallback(() => setReload((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    const reset = () => {
      if (controller.signal.aborted) return
      setNotifications([])
      setPageInfo(undefined)
      setUnreadCount(0)
      setUnreadCursor(undefined)
      setInboxStatus('loading')
      setError(undefined)
    }
    if (!accessToken || !accountId) {
      void Promise.resolve().then(reset)
      return () => controller.abort()
    }
    void Promise.resolve().then(reset)

    void fetchNotificationInbox(graphqlUrl, accessToken, { limit: 50 }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return
        setNotifications((current) => mergeNotifications(current, page.nodes, 100))
        setPageInfo(page.pageInfo)
        setUnreadCount(page.unread.count)
        setUnreadCursor(page.unread.asOfCursor)
        setInboxStatus('ready')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(errorMessage(reason))
        setInboxStatus('error')
      })
    return () => controller.abort()
  }, [accessToken, accountId, graphqlUrl, reload])

  useEffect(() => {
    if (!accessToken || !accountId) return
    const token = accessToken
    const controller = new AbortController()
    const cursorKey = `vistay.notifications.cursor.${accountId}`
    const storedCursor = window.localStorage.getItem(cursorKey)
    let cursor = isDurableCursor(storedCursor) ? storedCursor : null
    if (storedCursor && !cursor) window.localStorage.removeItem(cursorKey)
    let failures = 0
    let recoveredCursor = false

    async function run() {
      while (!controller.signal.aborted) {
        setStatus(failures === 0 ? 'connecting' : 'retrying')
        try {
          await consumeNotificationStream({
            graphqlUrl,
            accessToken: token,
            afterCursor: cursor,
            signal: controller.signal,
            onOpen: () => {
              failures = 0
              setError(undefined)
              setStatus('live')
            },
            onEvent: (event) => {
              setNotifications((current) => prependNotification(current, event.notification, 100))
              cursor = event.cursor
              window.localStorage.setItem(cursorKey, event.cursor)
              failures = 0
              setError(undefined)
              setStatus('live')
            },
          })
          if (!controller.signal.aborted) failures += 1
        } catch (reason) {
          if (controller.signal.aborted) return
          if (!recoveredCursor && isCursorRecoveryError(reason)) {
            recoveredCursor = true
            cursor = null
            window.localStorage.removeItem(cursorKey)
            setError('Cursor đã hết hạn; đang đồng bộ lại thông báo mới nhất.')
            continue
          }
          failures += 1
          setError(errorMessage(reason))
          setStatus(failures >= 5 ? 'error' : 'retrying')
        }
        if (!controller.signal.aborted) {
          await sleep(Math.min(1_000 * 2 ** Math.min(failures - 1, 4), 15_000), controller.signal)
        }
      }
    }

    void run()
    return () => controller.abort()
  }, [accessToken, accountId, graphqlUrl, restart])

  const loadMore = useCallback(async () => {
    if (!accessToken || !accountId || !pageInfo?.hasNextPage || !pageInfo.endCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await fetchNotificationInbox(graphqlUrl, accessToken, {
        afterCursor: pageInfo.endCursor,
        limit: 50,
      })
      setNotifications((current) => mergeNotifications(current, page.nodes, 100))
      setPageInfo(page.pageInfo)
      setUnreadCount(page.unread.count)
      setUnreadCursor(page.unread.asOfCursor)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoadingMore(false)
    }
  }, [accessToken, accountId, graphqlUrl, loadingMore, pageInfo])

  const markRead = useCallback(async (notification: Notification) => {
    if (!accessToken || notification.readAt) return
    const result = await markNotificationRead(graphqlUrl, accessToken, {
      notificationId: notification.id,
      expectedVersion: notification.version ?? notification.inboxRevision ?? 0,
      idempotencyKey: idempotencyKey(),
    })
    setNotifications((current) => current.map((item) => item.id === notification.id ? mergeReadResult(item, result) : item))
    setUnreadCount((count) => Math.max(0, count - 1))
  }, [accessToken, graphqlUrl])

  const markAllRead = useCallback(async () => {
    if (!accessToken || unreadCount <= 0 || !unreadCursor) return
    await markAllNotificationsRead(graphqlUrl, accessToken, {
      throughCursor: unreadCursor,
      idempotencyKey: idempotencyKey(),
    })
    const readAt = new Date().toISOString()
    setNotifications((current) => current.map((item) => item.readAt ? item : { ...item, readAt }))
    setUnreadCount(0)
  }, [accessToken, graphqlUrl, unreadCount, unreadCursor])

  return {
    error,
    inboxStatus,
    loadingMore,
    notifications,
    pageInfo,
    cursorState: pageInfo?.cursorState,
    unreadCount,
    unreadCursor,
    status,
    reconnect,
    retry,
    loadMore,
    markRead,
    markAllRead,
  }
}
