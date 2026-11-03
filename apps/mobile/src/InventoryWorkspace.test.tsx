import { act } from 'react'
import { createRoot } from 'test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InventoryWorkspace } from './InventoryWorkspace'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const inventoryMocks = vi.hoisted(() => ({
  fetchInventoryBlocks: vi.fn(),
  fetchPropertyAvailability: vi.fn(),
  createInventoryBlock: vi.fn(),
  releaseInventoryBlock: vi.fn(),
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

const viewer = {
  accountId: 'admin-1',
  profileId: 'profile-1',
  displayName: 'Admin',
  email: 'admin@vistay.test',
  contactPhone: null,
  avatarMediaId: null,
  profileVersion: 1,
  roles: ['ADMIN'],
  permissions: ['inventory:read', 'inventory:block'],
  authorizationVersion: 3,
}

const page = {
  nodes: [
    {
      inventoryBlockId: 'block-active',
      propertyId: '61000000-0000-4000-8000-000000000010',
      type: 'MAINTENANCE' as const,
      status: 'ACTIVE' as const,
      startDate: '2026-11-04',
      endDateExclusive: '2026-11-06',
      reason: 'Bảo trì điều hòa định kỳ',
      channelProvider: null,
      blockVersion: '2',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-02T00:00:00Z',
      releasedAt: null,
    },
    {
      inventoryBlockId: 'block-history',
      propertyId: '61000000-0000-4000-8000-000000000010',
      type: 'CHANNEL' as const,
      status: 'RELEASED' as const,
      startDate: '2026-11-01',
      endDateExclusive: '2026-11-02',
      reason: null,
      channelProvider: 'channex',
      blockVersion: '4',
      createdAt: '2026-10-30T00:00:00Z',
      updatedAt: '2026-11-02T00:00:00Z',
      releasedAt: '2026-11-02T00:00:00Z',
    },
  ],
  pageInfo: { hasNextPage: false, endCursor: null },
  inventoryRevision: '17',
  branchId: '62000000-0000-4000-8000-000000000020',
  propertyMembershipVersion: '6',
}

function renderedText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(renderedText).join('')
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children?: unknown }).children ?? [])
  }
  return ''
}

describe('InventoryWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inventoryMocks.fetchInventoryBlocks.mockResolvedValue(page)
    inventoryMocks.fetchPropertyAvailability.mockResolvedValue({
      propertyId: '61000000-0000-4000-8000-000000000010',
      checkInDate: '2026-11-04',
      checkOutDate: '2026-11-18',
      available: false,
      inventoryRevision: '17',
      branchId: '62000000-0000-4000-8000-000000000020',
      propertyMembershipVersion: '6',
      observedAt: '2026-11-04T00:00:00Z',
      overlaps: [{ type: 'MAINTENANCE', status: 'ACTIVE', startDate: '2026-11-04', endDateExclusive: '2026-11-06', channelProvider: null }],
    })
  })

  it('renders revision-pinned active and historical inventory without protected fields', async () => {
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(<InventoryWorkspace graphqlUrl="/graphql" accessToken="token" viewer={viewer} />)
      await Promise.resolve()
      await Promise.resolve()
    })

    const output = renderedText(renderer.container.toJSON())
    expect(output).toContain('Đang bị chặn')
    expect(output).toContain('Revision 17')
    expect(output).toContain('Membership v6')
    expect(output).toContain('Bảo trì')
    expect(output).toContain('Kênh OTA')
    expect(output).not.toContain('admin@vistay.test')
    expect(inventoryMocks.fetchInventoryBlocks).toHaveBeenCalledWith(
      '/graphql',
      'token',
      expect.objectContaining({ first: 100 }),
    )
    await act(async () => renderer.unmount())
  })

  it('fails closed when availability and block revisions disagree', async () => {
    inventoryMocks.fetchPropertyAvailability.mockResolvedValueOnce({
      propertyId: '61000000-0000-4000-8000-000000000010',
      checkInDate: '2026-11-04',
      checkOutDate: '2026-11-18',
      available: true,
      inventoryRevision: '18',
      branchId: page.branchId,
      propertyMembershipVersion: page.propertyMembershipVersion,
      observedAt: '2026-11-04T00:00:00Z',
      overlaps: [],
    })
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(<InventoryWorkspace graphqlUrl="/graphql" accessToken="token" viewer={viewer} />)
      await Promise.resolve()
      await Promise.resolve()
    })

    const output = renderedText(renderer.container.toJSON())
    expect(output).toContain('Hai phép đọc không cùng revision hoặc phân vùng')
    expect(inventoryMocks.createInventoryBlock).not.toHaveBeenCalled()
    expect(inventoryMocks.releaseInventoryBlock).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })
})
