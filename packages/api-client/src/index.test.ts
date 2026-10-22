import { describe, expect, it, vi } from 'vitest'
import {
  consumeNotificationStream,
  fetchViewer,
  isDurableCursor,
  prependNotification,
  SseParser,
  type Notification,
} from './index'

const welcome: Notification = {
  id: 'notification-1',
  category: 'WELCOME',
  title: 'Chào mừng',
  body: 'Tài khoản đã sẵn sàng.',
  channels: ['IN_APP'],
  createdAt: '2026-10-23T08:00:00+07:00',
  readAt: null,
}

describe('SseParser', () => {
  it('parses split and multiline SSE frames', () => {
    const parser = new SseParser()
    expect(parser.push('event: next\ndata: {"data":')).toEqual([])
    expect(parser.push('{}\ndata: }\n\n')).toEqual([
      { event: 'next', data: '{"data":{}\n}', id: undefined, retry: undefined },
    ])
  })
})

describe('GraphQL client', () => {
  it('sends a bearer-authenticated viewer query', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: {
        viewer: {
          accountId: 'account-1',
          profileId: 'profile-1',
          displayName: 'ViStay Admin',
          email: 'admin@vistay.local',
          roles: ['ADMIN'],
          permissions: ['notifications:read'],
          authorizationVersion: 1,
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const viewer = await fetchViewer('/graphql', 'access-token', undefined, fetcher)
    expect(viewer.profileId).toBe('profile-1')
    expect(fetcher).toHaveBeenCalledWith('/graphql', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer access-token' }),
    }))
  })

  it('consumes GraphQL-over-SSE and forwards the durable cursor', async () => {
    const body = `event: next\ndata: ${JSON.stringify({
      data: { notificationStream: { cursor: '42', notification: welcome } },
    })}\n\nevent: complete\ndata: {}\n\n`
    let requestBody = ''
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body)
      return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      })
    }
    const onEvent = vi.fn()

    await consumeNotificationStream({
      graphqlUrl: '/graphql',
      accessToken: 'access-token',
      afterCursor: '41',
      signal: new AbortController().signal,
      onEvent,
      fetcher,
    })

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ cursor: '42' }))
    expect(JSON.parse(requestBody).variables).toEqual({ afterCursor: '41' })
  })
})

describe('notification deduplication', () => {
  it('keeps a notification id only once during at-least-once delivery', () => {
    const once = prependNotification([], welcome)
    expect(prependNotification(once, welcome)).toBe(once)
  })

  it('accepts only canonical non-negative decimal cursors', () => {
    expect(isDurableCursor('0')).toBe(true)
    expect(isDurableCursor('42')).toBe(true)
    expect(isDurableCursor('042')).toBe(false)
    expect(isDurableCursor('-1')).toBe(false)
  })
})
