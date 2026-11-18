import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root, type TestInstance } from 'test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UsersScreen from '../app/(admin)/users'
import { AdminProvider, type AdminContextValue } from '../AdminContext'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const api = vi.hoisted(() => ({
  checkCustomerContactAvailability: vi.fn(),
  checkCustomerIdentityDocumentAvailability: vi.fn(),
  createUserProfile: vi.fn(),
  fetchUserDirectory: vi.fn(),
  fetchUserProfile: vi.fn(),
}))

vi.mock('@vistay/admin-api-client', () => api)
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'mobile-users-idempotency-key' }))
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }))
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  FlatList: ({ data = [], renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent, ...props }: {
    data?: unknown[]
    renderItem: (input: { item: unknown; index: number }) => ReactNode
    ListHeaderComponent?: ReactNode
    ListEmptyComponent?: ReactNode
    ListFooterComponent?: ReactNode
  }) => createElement('FlatList', props,
    ListHeaderComponent,
    data.length ? data.map((item, index) => renderItem({ item, index })) : ListEmptyComponent,
    ListFooterComponent,
  ),
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: ({ visible, children, ...props }: { visible: boolean; children?: ReactNode }) => visible ? createElement('Modal', props, children) : null,
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T,>(styles: T) => styles, absoluteFill: {} },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}))

const entry = {
  profileId: 'customer-profile-1',
  accountId: null,
  accountType: 'CUSTOMER' as const,
  displayName: 'Nguyễn Minh An',
  email: 'an@example.com',
  contactPhone: '0901234567',
  status: 'ACTIVE',
  referenceCode: 'CUS-001',
  subtype: null,
  verificationStatus: null,
  joinedOn: '2026-01-01',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-11-16T08:00:00Z',
}

const profile = {
  ...entry,
  relevantDate: '1997-05-20',
  address: 'Hà Nội',
  taxCode: null,
  nationalityCode: 'VN',
  documentType: 'CCCD' as const,
  version: 3,
}

function context(permissions = ['user:read', 'customer-profile:create']): AdminContextValue {
  return {
    accessToken: 'access-token',
    authorizationReady: true,
    config: {
      authApiUrl: 'https://auth.vistay.test',
      graphqlUrl: 'https://api.vistay.test/graphql',
      oidcIssuer: 'https://auth.vistay.test/realms/backoffice',
      oidcClientId: 'admin-mobile-client',
    },
    inbox: {
      inboxStatus: 'ready', loadingMore: false, notifications: [], unreadCount: 0, unreadCursor: '0', status: 'live',
      pageInfo: { hasNextPage: false, endCursor: null, startCursor: null, cursorState: 'ACTIVE', retainedFrom: null, reconcileFrom: null },
      reconnect: vi.fn(), retry: vi.fn(), loadMore: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(),
    },
    retryViewer: vi.fn(),
    runtime: { isOnline: true, isActive: true, refreshEpoch: 0 },
    viewer: {
      accountId: 'admin-account', profileId: 'admin-profile', displayName: 'Admin', email: 'admin@vistay.test',
      contactPhone: null, avatarMediaId: null, profileVersion: 1, roles: ['ADMIN'], permissions, authorizationVersion: 2,
    },
  }
}

async function renderScreen(permissions?: string[]) {
  const renderer = createRoot({ textComponentTypes: ['Text'] })
  await act(async () => {
    renderer.render(<AdminProvider value={context(permissions)}><UsersScreen /></AdminProvider>)
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(260)
    await Promise.resolve()
  })
  return renderer
}

function findByProps(renderer: Root, expected: Record<string, unknown>): TestInstance {
  const matches = renderer.container.queryAll((node) => Object.entries(expected).every(([key, value]) => node.props[key] === value))
  expect(matches.length).toBeGreaterThan(0)
  return matches[0]
}

function renderedText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(renderedText).join('')
  if (node && typeof node === 'object' && 'children' in node) return renderedText((node as { children?: unknown }).children)
  return ''
}

describe('UsersScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.fetchUserDirectory.mockResolvedValue({ nodes: [entry], totalCount: 1, nextCursor: null })
    api.fetchUserProfile.mockResolvedValue(profile)
    api.checkCustomerContactAvailability.mockResolvedValue({ emailAvailable: true, phoneAvailable: true })
    api.checkCustomerIdentityDocumentAvailability.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('opens a slide-up quick-view sheet with one press and loads profile details', async () => {
    const renderer = await renderScreen()
    const row = findByProps(renderer, { accessibilityHint: 'Mở thẻ xem nhanh từ cuối màn hình' })

    await act(async () => {
      row.props.onPress()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(api.fetchUserProfile).toHaveBeenCalledWith(
      'https://api.vistay.test/graphql', 'access-token', 'CUSTOMER', 'customer-profile-1', expect.any(AbortSignal), expect.any(Function),
    )
    expect(renderer.container.queryAll((node) => node.type === 'Modal')).toHaveLength(1)
    expect(findByProps(renderer, { children: 'Hà Nội' })).toBeTruthy()
  })

  it('opens the mobile create sheet when the viewer has the profile create permission', async () => {
    const renderer = await renderScreen()
    const add = findByProps(renderer, { accessibilityLabel: 'Thêm khách hàng' })

    await act(async () => add.props.onPress())

    expect(findByProps(renderer, { children: 'HỒ SƠ MỚI' })).toBeTruthy()
    expect(renderedText(renderer.container.toJSON())).toContain('Lý do tạo hồ sơ (tùy chọn)')
  })

  it('keeps the create action disabled when the matching permission is absent', async () => {
    const renderer = await renderScreen(['user:read'])
    const add = findByProps(renderer, { accessibilityLabel: 'Thêm khách hàng' })
    expect(add.props.disabled).toBe(true)
  })
})
