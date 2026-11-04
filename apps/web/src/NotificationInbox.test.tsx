import { act } from 'react'
import { createRoot } from 'test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { mapNotificationReference } from '@vistay/admin-api-client'
import { NotificationInbox } from './NotificationInbox'
import type { NotificationInboxModel } from './lib/useBackofficeData'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderedText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(renderedText).join('')
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children?: unknown }).children ?? [])
  }
  return ''
}

const notification = {
  id: 'notification-1',
  category: 'SECURITY' as const,
  title: 'Security review required',
  body: 'A new sign-in needs review.',
  channels: ['IN_APP' as const],
  createdAt: '2026-11-04T08:00:00Z',
  readAt: null,
  priority: 'URGENT' as const,
  inboxRevision: 3,
  version: 3,
  reference: { type: 'ACCOUNT', id: 'account-1', actionUrl: 'javascript:bad' },
}

function model(): NotificationInboxModel {
  return {
    inboxStatus: 'ready',
    loadingMore: false,
    notifications: [notification],
    pageInfo: { hasNextPage: false, endCursor: null, startCursor: '1', cursorState: 'ACTIVE', retainedFrom: null, reconcileFrom: null },
    unreadCount: 1,
    unreadCursor: '3',
    status: 'live',
    reconnect: vi.fn(),
    retry: vi.fn(),
    loadMore: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
    markAllRead: vi.fn(async () => undefined),
  }
}

describe('Admin web notification inbox', () => {
  it('renders the ordered detail and does not expose raw action URLs', async () => {
    const renderer = createRoot()
    await act(async () => {
      renderer.render(<NotificationInbox model={model()} />)
      await Promise.resolve()
    })
    const output = renderedText(renderer.container.toJSON())
    expect(output).toContain('Security review required')
    expect(output).toContain('Khan cap')
    expect(output).toContain('Mo khu vuc duoc phep')
    expect(output).not.toContain('javascript:bad')
    await act(async () => renderer.unmount())
  })

  it('uses the allow-listed local route mapper only', () => {
    expect(mapNotificationReference(notification.reference)).toBe('#accounts?account=account-1')
    expect(mapNotificationReference({ type: 'EXTERNAL', id: 'x', actionUrl: 'https://example.test' })).toBeNull()
  })
})
