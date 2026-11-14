import { act } from 'react'
import { createRoot } from 'test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BookingScreen from './booking'
import { AdminProvider, type AdminContextValue } from '../../AdminContext'
import type { BackofficeViewer } from '@vistay/admin-api-client'
import type { MobileRuntime } from '../../mobileRuntime'
import type { NotificationInboxModel } from '../../useBackofficeData'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const inventoryMocks = vi.hoisted(() => ({
  fetchInventoryBlocks: vi.fn(),
  fetchPropertyAvailability: vi.fn(),
  createInventoryBlock: vi.fn(),
  releaseInventoryBlock: vi.fn(),
}))

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

vi.mock('expo-crypto', () => ({ randomUUID: () => '6cb94034-7bfa-4c2e-a6ad-69ad6b3bb755' }))

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  Modal: 'Modal',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}))

vi.mock('@vistay/admin-api-client', () => ({
  ApiError: class ApiError extends Error {
    code?: string
    constructor(message: string, _status?: number, code?: string) {
      super(message)
      this.code = code
    }
  },
  ...inventoryMocks,
}))

function renderedText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(renderedText).join('')
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children?: unknown }).children ?? [])
  }
  return ''
}

const mockViewer: BackofficeViewer = {
  accountId: 'admin-account-1',
  profileId: 'profile-1',
  displayName: 'Admin User',
  email: 'admin@vistay.test',
  contactPhone: null,
  avatarMediaId: null,
  profileVersion: 1,
  roles: ['ADMIN'],
  permissions: ['inventory:read', 'inventory:block'],
  authorizationVersion: 2,
}

const mockInbox: NotificationInboxModel = {
  inboxStatus: 'ready',
  loadingMore: false,
  notifications: [],
  pageInfo: { hasNextPage: false, endCursor: null, startCursor: null, cursorState: 'ACTIVE', retainedFrom: null, reconcileFrom: null },
  unreadCount: 0,
  unreadCursor: '0',
  status: 'live',
  reconnect: vi.fn(),
  retry: vi.fn(),
  loadMore: vi.fn(async () => undefined),
  markRead: vi.fn(async () => undefined),
  markAllRead: vi.fn(async () => undefined),
}

function createMockAdminContext(runtimeOverrides: Partial<MobileRuntime> = {}): AdminContextValue {
  return {
    accessToken: 'test-access-token',
    config: {
      authApiUrl: 'https://auth.vistay.test',
      graphqlUrl: 'https://api.vistay.test/graphql',
      oidcIssuer: 'https://auth.vistay.test/realms/backoffice',
      oidcClientId: 'admin-mobile-client',
    },
    inbox: mockInbox,
    retryViewer: vi.fn(),
    viewer: mockViewer,
    runtime: {
      isOnline: true,
      isActive: true,
      refreshEpoch: 0,
      ...runtimeOverrides,
    },
  }
}

describe('BookingScreen with Expo Router and Mobile Runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inventoryMocks.fetchInventoryBlocks.mockResolvedValue({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null, startCursor: null, cursorState: 'ACTIVE', retainedFrom: null, reconcileFrom: null },
      totalCount: 0,
    })
    inventoryMocks.fetchPropertyAvailability.mockResolvedValue({
      propertyId: '61000000-0000-4000-8000-000000000010',
      fromDateInclusive: '2026-11-04',
      toDateExclusive: '2026-11-05',
      units: [],
      inventoryRevision: 1,
      observedAt: '2026-11-04T08:00:00Z',
    })
  })

  it('renders BookingScreen within AdminProvider propagating runtime to InventoryWorkspace', async () => {
    const adminContext = createMockAdminContext()
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(
        <AdminProvider value={adminContext}>
          <BookingScreen />
        </AdminProvider>,
      )
    })
    const text = renderedText(renderer.container.toJSON())
    expect(text).toContain('Booking')
    expect(text).toContain('Lịch khả dụng')
    expect(inventoryMocks.fetchInventoryBlocks).toHaveBeenCalled()
    expect(inventoryMocks.fetchPropertyAvailability).toHaveBeenCalled()
  })

  it('reflects offline runtime state when runtime.isOnline is false by suppressing network queries', async () => {
    const offlineContext = createMockAdminContext({ isOnline: false })
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(
        <AdminProvider value={offlineContext}>
          <BookingScreen />
        </AdminProvider>,
      )
    })
    const text = renderedText(renderer.container.toJSON())
    expect(text).toContain('Booking')
    expect(inventoryMocks.fetchInventoryBlocks).not.toHaveBeenCalled()
    expect(inventoryMocks.fetchPropertyAvailability).not.toHaveBeenCalled()
  })

  it('reflects background runtime state when runtime.isActive is false by suppressing network queries', async () => {
    const backgroundContext = createMockAdminContext({ isActive: false })
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(
        <AdminProvider value={backgroundContext}>
          <BookingScreen />
        </AdminProvider>,
      )
    })
    const text = renderedText(renderer.container.toJSON())
    expect(text).toContain('Booking')
    expect(inventoryMocks.fetchInventoryBlocks).not.toHaveBeenCalled()
    expect(inventoryMocks.fetchPropertyAvailability).not.toHaveBeenCalled()
  })
})
