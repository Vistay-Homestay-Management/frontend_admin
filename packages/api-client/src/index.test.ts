import { describe, expect, it, vi } from 'vitest'
import {
  consumeNotificationStream,
  fetchAuthorizationWorkspace,
  fetchAuthorizationSubject,
  fetchBackofficeSessions,
  fetchViewer,
  isDurableCursor,
  prependNotification,
  provisionBackofficeAccount,
  requestAuthorizationChange,
  revokeBackofficeSession,
  SseParser,
  updateMyProfile,
  changeAccountLifecycle,
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
          contactPhone: null,
          avatarMediaId: null,
          profileVersion: 0,
          roles: ['ADMIN'],
          permissions: ['notifications:read'],
          authorizationVersion: 1,
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const viewer = await fetchViewer('/graphql', 'access-token', undefined, fetcher)
    expect(viewer.profileId).toBe('profile-1')
    expect(fetcher).toHaveBeenCalledWith('/graphql', expect.objectContaining({
      headers: expect.objectContaining({
        authorization: 'Bearer access-token',
        'x-csrf-token': '1',
      }),
    }))
  })

  it('consumes GraphQL-over-SSE and forwards the durable cursor', async () => {
    const body = `event: next\ndata: ${JSON.stringify({
      data: { notificationStream: { cursor: '42', notification: welcome } },
    })}\n\nevent: complete\ndata: {}\n\n`
    let requestBody = ''
    let requestHeaders: HeadersInit | undefined
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body)
      requestHeaders = init?.headers
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
    expect(requestHeaders).toEqual(expect.objectContaining({ 'x-csrf-token': '1' }))
  })

  it('updates the personal profile with concurrency and idempotency metadata', async () => {
    let requestBody = ''
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body)
      return new Response(JSON.stringify({ data: { updateMyProfile: {
        accountId: 'account-1', profileId: 'profile-1', displayName: 'ViStay Operator',
        email: 'admin@vistay.local', contactPhone: '+84901234567', avatarMediaId: null,
        version: 2, updatedAt: '2026-10-28T15:00:00Z', replayed: false,
      } } }), { status: 200 })
    }

    const profile = await updateMyProfile('/graphql', 'token', {
      displayName: 'ViStay Operator', contactPhone: '+84901234567', avatarMediaId: null,
      expectedVersion: 1, reason: 'Correct contact information', idempotencyKey: 'profile-key-1',
    }, fetcher)

    const request = JSON.parse(requestBody)
    expect(profile.version).toBe(2)
    expect(request.operationName).toBe('UpdateMyProfile')
    expect(request.variables.input).toEqual(expect.objectContaining({
      expectedVersion: 1,
      idempotencyKey: 'profile-key-1',
    }))
  })

  it('loads the authorization subject, catalog, pending queue and audit trail', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { operationName: string }
      if (request.operationName === 'AuthorizationAudit') {
        return new Response(JSON.stringify({ data: { authorizationAudit: [{
          id: 'audit-1', actorSubjectId: 'subject-actor', targetSubjectId: 'subject-1',
          action: 'ROLE_GRANTED', reason: 'Approved for operations', correlationId: 'correlation-1',
          createdAt: '2026-10-28T00:00:00Z',
        }] } }), { status: 200 })
      }
      return new Response(JSON.stringify({ data: {
        authorizationSubjectByAccount: {
          id: 'subject-1', accountType: 'ADMIN', accountId: 'account-1', profileId: 'profile-1',
          active: true, authorizationVersion: 3, assignments: [], effectiveGrants: [],
        },
        authorizationCatalog: [{ code: 'SECURITY_ADMIN', displayName: 'Security admin', accountType: 'ADMIN', policies: [] }],
        authorizationChangeRequests: [],
      } }), { status: 200 })
    })

    const workspace = await fetchAuthorizationWorkspace('/graphql', 'token', 'ADMIN', 'account-1', undefined, fetcher)
    expect(workspace.subject.authorizationVersion).toBe(3)
    expect(workspace.catalog[0]?.code).toBe('SECURITY_ADMIN')
    expect(workspace.audit[0]?.action).toBe('ROLE_GRANTED')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('sends an idempotent maker request with scope overrides', async () => {
    let requestBody = ''
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body)
      return new Response(JSON.stringify({ data: { requestAuthorizationChange: {
        id: 'request-1', targetSubjectId: 'subject-1', requestedBySubjectId: 'actor-1',
        reviewedBySubjectId: null, changeType: 'GRANT_ROLE', status: 'PENDING',
        roleCode: 'SECURITY_ADMIN', reason: 'Support security operations', reviewReason: null,
        expiresAt: '2026-10-29T00:00:00Z', createdAt: '2026-10-28T00:00:00Z',
      } } }), { status: 200 })
    }

    const result = await requestAuthorizationChange('/graphql', 'token', {
      targetSubjectId: 'subject-1', roleCode: 'SECURITY_ADMIN',
      scopeOverrides: [{ permissionCode: 'authorization:read', scopes: ['ALL'] }],
      reason: 'Support security operations', expectedAuthorizationVersion: 3,
      idempotencyKey: 'request-key-1',
    }, fetcher)

    expect(result.status).toBe('PENDING')
    expect(JSON.parse(requestBody).variables.input).toEqual(expect.objectContaining({
      idempotencyKey: 'request-key-1', expectedAuthorizationVersion: 3,
    }))
  })

  it('surfaces GraphQL authorization errors without returning partial data', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      errors: [{ message: 'Missing permission: authorization:read' }],
    }), { status: 200 })

    await expect(fetchAuthorizationSubject('/graphql', 'token', 'subject-1', fetcher))
      .rejects.toThrow('Missing permission: authorization:read')
  })
})

describe('Backoffice account provisioning client', () => {
  it('sends an audited versioned account lifecycle action', async () => {
    let requestBody = ''
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body)
      return new Response(JSON.stringify({
        targetAccountId: 'account-2', action: 'LOCK', previousStatus: 'ACTIVE',
        status: 'LOCKED', version: 2, completedAt: '2026-10-28T16:00:00Z', replayed: false,
      }), { status: 200 })
    }

    const result = await changeAccountLifecycle('/accounts', 'token', 'account-2', 'LOCK', 1,
      'Suspicious login investigation', '6b1fb4a4-90a3-4231-a779-61af996b9f41', fetcher)

    expect(result.status).toBe('LOCKED')
    expect(JSON.parse(requestBody)).toEqual({ action: 'LOCK', expectedVersion: 1, reason: 'Suspicious login investigation' })
  })

  it('sends authorization, audit and idempotency metadata without leaking them into the URL', async () => {
    let requestBody = ''
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = String(init?.body)
      return new Response(JSON.stringify({
        id: 'account-1', subject: 'account-1', email: 'operator@vistay.vn',
        accountType: 'ADMIN', status: 'ACTIVE', version: 0,
        createdAt: '2026-10-28T00:00:00Z',
      }), { status: 201, headers: { 'content-type': 'application/json' } })
    })

    const account = await provisionBackofficeAccount(
      '/api/v1/backoffice/accounts',
      'access-token',
      '6b1fb4a4-90a3-4231-a779-61af996b9f41',
      {
        email: 'operator@vistay.vn', fullName: 'ViStay Operator',
        temporaryPassword: 'temporary-pass-123', reason: 'Required for night operations',
      },
      fetcher,
    )

    expect(account.status).toBe('ACTIVE')
    expect(fetcher).toHaveBeenCalledWith('/api/v1/backoffice/accounts', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        authorization: 'Bearer access-token',
        'idempotency-key': '6b1fb4a4-90a3-4231-a779-61af996b9f41',
        'x-correlation-id': '6b1fb4a4-90a3-4231-a779-61af996b9f41',
      }),
    }))
    expect(JSON.parse(requestBody)).toEqual(expect.objectContaining({
      temporaryPassword: 'temporary-pass-123',
      reason: 'Required for night operations',
    }))
  })

  it('surfaces the service problem detail for an existing email', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      detail: 'BACKOFFICE_ACCOUNT_ALREADY_EXISTS',
    }), { status: 409, headers: { 'content-type': 'application/problem+json' } })

    await expect(provisionBackofficeAccount('/accounts', 'token', 'key', {
      email: 'existing@vistay.vn', fullName: 'Existing Account',
      temporaryPassword: 'temporary-pass-123', reason: 'Duplicate account test',
    }, fetcher)).rejects.toMatchObject({
      message: 'BACKOFFICE_ACCOUNT_ALREADY_EXISTS',
      status: 409,
    })
  })

  it('lists and revokes an active Keycloak session through the auth facade', async () => {
    const session = {
      id: 'session-1', ipAddress: '10.0.0.8', startedAt: '2026-10-28T12:00:00Z',
      lastAccessAt: '2026-10-28T12:05:00Z', clients: { web: 'Web' }, current: true,
    }
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return new Response(JSON.stringify({
          targetAccountId: 'account-1', sessionId: 'session-1',
          revokedAt: '2026-10-28T12:06:00Z', replayed: false,
        }), { status: 200 })
      }
      return new Response(JSON.stringify([session]), { status: 200 })
    })

    const sessions = await fetchBackofficeSessions('/accounts', 'token', 'account-1', undefined, fetcher)
    const revoked = await revokeBackofficeSession(
      '/accounts', 'token', 'account-1', 'session-1',
      'Lost operations device', '6b1fb4a4-90a3-4231-a779-61af996b9f41', fetcher,
    )

    expect(sessions).toEqual([session])
    expect(revoked.sessionId).toBe('session-1')
    expect(fetcher).toHaveBeenLastCalledWith(
      '/accounts/account-1/sessions/session-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          authorization: 'Bearer token',
          'idempotency-key': '6b1fb4a4-90a3-4231-a779-61af996b9f41',
        }),
        body: JSON.stringify({ reason: 'Lost operations device' }),
      }),
    )
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
