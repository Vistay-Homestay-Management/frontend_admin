import { useCallback, useEffect, useState } from 'react'
import { fetch as expoFetch } from 'expo/fetch'
import * as SecureStore from 'expo-secure-store'
import {
  consumeNotificationStream,
  fetchViewer,
  isDurableCursor,
  prependNotification,
  type BackofficeViewer,
  type Notification,
} from '@vistay/admin-api-client'

const mobileFetch = expoFetch as typeof globalThis.fetch
type LoadStatus = 'loading' | 'ready' | 'error'
export type StreamStatus = 'connecting' | 'live' | 'retrying' | 'error'

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Đã có lỗi không xác định'
}

export function useViewer(graphqlUrl: string, accessToken: string) {
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
    const controller = new AbortController()
    void fetchViewer(graphqlUrl, accessToken, controller.signal, mobileFetch)
      .then((profile) => {
        setViewer(profile)
        setStatus('ready')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(message(reason))
        setStatus('error')
      })
    return () => controller.abort()
  }, [accessToken, attempt, graphqlUrl])

  return { error, retry, status, viewer }
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      clearTimeout(timeout)
      resolve()
    }, { once: true })
  })
}

export function useNotificationStream(
  graphqlUrl: string,
  accessToken: string,
  accountId: string | undefined,
) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [error, setError] = useState<string>()
  const [restart, setRestart] = useState(0)
  const reconnect = useCallback(() => setRestart((value) => value + 1), [])

  useEffect(() => {
    if (!accountId) return
    const controller = new AbortController()
    const cursorKey = `vistay.notifications.cursor.${accountId}`
    const seenIds = new Set<string>()
    let cursor: string | null = null
    let failures = 0

    async function run() {
      const storedCursor = await SecureStore.getItemAsync(cursorKey)
      cursor = isDurableCursor(storedCursor) ? storedCursor : null
      if (storedCursor && !cursor) await SecureStore.deleteItemAsync(cursorKey)
      while (!controller.signal.aborted) {
        setStatus(failures === 0 ? 'connecting' : 'retrying')
        try {
          await consumeNotificationStream({
            graphqlUrl,
            accessToken,
            afterCursor: cursor,
            signal: controller.signal,
            fetcher: mobileFetch,
            onOpen: () => {
              failures = 0
              setError(undefined)
              setStatus('live')
            },
            onEvent: async (event) => {
              if (!seenIds.has(event.notification.id)) {
                seenIds.add(event.notification.id)
                setNotifications((current) => prependNotification(current, event.notification))
              }
              cursor = event.cursor
              await SecureStore.setItemAsync(cursorKey, event.cursor)
              failures = 0
              setError(undefined)
              setStatus('live')
            },
          })
          if (!controller.signal.aborted) failures += 1
        } catch (reason) {
          if (controller.signal.aborted) return
          failures += 1
          setError(message(reason))
          setStatus(failures >= 5 ? 'error' : 'retrying')
        }
        if (!controller.signal.aborted) {
          await sleep(Math.min(1_000 * 2 ** Math.min(failures - 1, 4), 15_000), controller.signal)
        }
      }
    }

    void run().catch((reason: unknown) => {
      if (controller.signal.aborted) return
      setError(message(reason))
      setStatus('error')
    })
    return () => controller.abort()
  }, [accessToken, accountId, graphqlUrl, restart])

  return { error, notifications, reconnect, status }
}
