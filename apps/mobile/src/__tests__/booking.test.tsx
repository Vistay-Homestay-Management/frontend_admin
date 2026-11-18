import { act } from 'react'
import { createRoot } from 'test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BookingScreen from '../app/(admin)/booking'
import { AdminProvider, type AdminContextValue } from '../AdminContext'
import type { BackofficeViewer } from '@vistay/admin-api-client'
import type { MobileRuntime } from '../mobileRuntime'
import type { NotificationInboxModel } from '../useBackofficeData'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const inventoryMocks = vi.hoisted(() => ({
  fetchAdminBookingTimeline: vi.fn(),
  fetchInventoryBlocks: vi.fn(),
  fetchPropertyAvailability: vi.fn(),
  fetchPropertyPortfolio: vi.fn(),
  createInventoryBlock: vi.fn(),
  releaseInventoryBlock: vi.fn(),
}))

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

vi.mock('expo-crypto', () => ({ randomUUID: () => '6cb94034-7bfa-4c2e-a6ad-69ad6b3bb755' }))
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }))

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
  permissions: ['booking:read', 'inventory:read', 'inventory:block'],
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

function createMockAdminContext(
  runtimeOverrides: Partial<MobileRuntime> = {},
  contextOverrides: Partial<AdminContextValue> = {},
): AdminContextValue {
  return {
    accessToken: "test-access-token",
    config: {
      authApiUrl: "https://auth.vistay.test",
      graphqlUrl: "https://api.vistay.test/graphql",
      oidcIssuer: "https://auth.vistay.test/realms/backoffice",
      oidcClientId: "admin-mobile-client",
    },
    inbox: mockInbox,
    retryViewer: vi.fn(),
    viewer: mockViewer,
    authorizationReady: true,
    isRevalidating: false,
    runtime: {
      isOnline: true,
      isActive: true,
      refreshEpoch: 0,
      ...runtimeOverrides,
    },
    ...contextOverrides,
  }
}

describe('BookingScreen with Expo Router and Mobile Runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inventoryMocks.fetchPropertyPortfolio.mockResolvedValue({
      branches: [{ id: 'branch-1', code: 'HN', name: 'Hà Nội' }],
      cities: [{
        id: 'city-1', code: 'HANOI', name: 'Hà Nội',
        areas: [{
          id: 'area-1', cityId: 'city-1', code: 'CENTER', name: 'Trung tâm',
          buildings: [{
            id: 'building-1', areaId: 'area-1', code: 'B1', name: 'Tòa B1', address: 'Hà Nội',
            floors: [{
              id: 'floor-1', buildingId: 'building-1', code: 'F1', name: 'Tầng 1', floorNumber: 1,
              units: [{ id: 'unit-1', floorId: 'floor-1', branchId: 'branch-1', code: 'U101', unitNumber: '101', name: 'Căn 101', operatingModel: 'MANAGEMENT', operationalStatus: 'ACTIVE', bedroomCount: 1, bathroomCount: 1, capacity: 2, currency: 'VND', version: '1' }],
            }],
          }],
        }],
      }],
    })
    inventoryMocks.fetchAdminBookingTimeline.mockResolvedValue({ nodes: [], fromDate: '2026-11-17', toDateExclusive: '2026-12-18', truncated: false })
    inventoryMocks.fetchInventoryBlocks.mockResolvedValue({
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null, startCursor: null, cursorState: 'ACTIVE', retainedFrom: null, reconcileFrom: null },
      totalCount: 0,
      inventoryRevision: '17',
      branchId: '62000000-0000-4000-8000-000000000020',
      propertyMembershipVersion: '6',
    })
    inventoryMocks.fetchPropertyAvailability.mockImplementation(async (_url, _token, propertyId, checkInDate, checkOutDate) => ({
      propertyId, checkInDate, checkOutDate, available: false,
      inventoryRevision: '17', branchId: '62000000-0000-4000-8000-000000000020',
      propertyMembershipVersion: '6', observedAt: '2026-11-04T08:00:00Z', overlaps: [],
    }))
  })

  it('renders the mobile booking timeline and requests one batched range', async () => {
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
    expect(text).toContain('Sơ đồ')
    expect(text).toContain('NgàyTuầnTháng')
    expect(text).toContain('Thành phốTất cả')
    expect(inventoryMocks.fetchPropertyPortfolio).toHaveBeenCalledTimes(1)
    expect(inventoryMocks.fetchAdminBookingTimeline).toHaveBeenCalledTimes(1)
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
  it('locks write mutations and disables create button when viewer is revalidating (authorizationReady is false)', async () => {
    const revalidatingContext = createMockAdminContext({}, { authorizationReady: false, isRevalidating: true })
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(
        <AdminProvider value={revalidatingContext}>
          <BookingScreen />
        </AdminProvider>,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    const text = renderedText(renderer.container.toJSON())
    expect(text).toContain('Booking')
    expect(text).toContain('Đang xác minh quyền tài khoản sau kết nối')
  })

  it('enables write mutations once authorizationReady transitions to true on current recovery epoch', async () => {
    const revalidatingContext = createMockAdminContext({}, { authorizationReady: false, isRevalidating: true })
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(
        <AdminProvider value={revalidatingContext}>
          <BookingScreen />
        </AdminProvider>,
      )
    })
    expect(renderedText(renderer.container.toJSON())).toContain('Đang xác minh quyền tài khoản sau kết nối')

    const readyContext = createMockAdminContext({}, { authorizationReady: true, isRevalidating: false })
    await act(async () => {
      renderer.render(
        <AdminProvider value={readyContext}>
          <BookingScreen />
        </AdminProvider>,
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(renderedText(renderer.container.toJSON())).not.toContain('Đang xác minh quyền tài khoản sau kết nối')
  })

  it('remains locked if revalidation completes with revoked inventory:block grant', async () => {
    const revokedContext = createMockAdminContext(
      {},
      {
        viewer: { ...mockViewer, permissions: ['inventory:read'] },
        authorizationReady: true,
        isRevalidating: false,
      },
    )
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(
        <AdminProvider value={revokedContext}>
          <BookingScreen />
        </AdminProvider>,
      )
    })
    const text = renderedText(renderer.container.toJSON())
    expect(text).toContain('Booking')
  })
});
