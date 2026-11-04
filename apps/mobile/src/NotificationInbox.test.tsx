import { act } from 'react'
import { createRoot } from 'test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { NotificationInbox } from './NotificationInbox'
import type { NotificationInboxModel } from './useBackofficeData'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}))

function renderedText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(renderedText).join('')
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children?: unknown }).children ?? [])
  }
  return ''
}

function model(): NotificationInboxModel {
  return {
    inboxStatus: 'ready',
    loadingMore: false,
    notifications: [{
      id: 'notification-1', category: 'OPERATIONS', title: 'Maintenance window',
      body: 'A scheduled operation needs attention.', channels: ['IN_APP'],
      createdAt: '2026-11-04T08:00:00Z', readAt: null, priority: 'HIGH', inboxRevision: 2,
      reference: { type: 'PROPERTY', id: 'property-1', actionUrl: 'javascript:bad' },
    }],
    pageInfo: { hasNextPage: false, endCursor: null, startCursor: '1', cursorState: 'ACTIVE', retainedFrom: null, reconcileFrom: null },
    unreadCount: 1,
    unreadCursor: '2',
    status: 'live',
    reconnect: vi.fn(),
    retry: vi.fn(),
    loadMore: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
    markAllRead: vi.fn(async () => undefined),
  }
}

describe('Admin mobile notification inbox', () => {
  it('renders detail, urgency and redacted safe navigation state', async () => {
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(<NotificationInbox model={model()} />)
      await Promise.resolve()
    })
    const output = renderedText(renderer.container.toJSON())
    expect(output).toContain('Maintenance window')
    expect(output).toContain('Cao')
    expect(output).toContain('Nguon da duoc kiem tra')
    expect(output).not.toContain('javascript:bad')
    await act(async () => renderer.unmount())
  })
})
