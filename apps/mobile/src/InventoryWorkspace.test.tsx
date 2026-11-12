import { act } from 'react'
import { createRoot, type Root } from 'test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InventoryWorkspace, resetInventorySessionGuards } from './InventoryWorkspace'
import { ApiError } from '@vistay/admin-api-client'
import type { MobileWorkspaceProps } from './mobileRuntime'

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
    resetInventorySessionGuards()
    inventoryMocks.fetchInventoryBlocks.mockImplementation(async () => page)
    inventoryMocks.fetchPropertyAvailability.mockImplementation(async (_url, _token, propertyId, checkInDate, checkOutDate) => ({
      propertyId, checkInDate, checkOutDate, available: false,
      inventoryRevision: '17', branchId: page.branchId,
      propertyMembershipVersion: '6', observedAt: '2026-11-04T00:00:00Z', overlaps: [],
    }))
    inventoryMocks.createInventoryBlock.mockResolvedValue({ commandId: 'command-created', inventoryRevision: '18' })
    inventoryMocks.releaseInventoryBlock.mockResolvedValue({ commandId: 'command-released', inventoryRevision: '18' })
  })

  it('renders revision-pinned active and historical inventory without protected fields', async () => {
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(<InventoryWorkspace {...props()} />)
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
    expect(button(renderer, 'Tạo block').props.disabled).toBe(false)
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
      renderer.render(<InventoryWorkspace {...props()} />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(button(renderer, 'Tạo block').props.disabled).toBe(true)
    expect(inventoryMocks.createInventoryBlock).not.toHaveBeenCalled()
    expect(inventoryMocks.releaseInventoryBlock).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('invalidates writes immediately offline and never replays a pending intent on recovery', async () => {
    const renderer = await renderInventory()
    await openCreate(renderer)
    const { promise, resolve } = Promise.withResolvers<typeof page>()
    inventoryMocks.fetchInventoryBlocks.mockImplementationOnce(() => promise)
    await act(async () => { button(renderer, 'Xác nhận tạo block').props.onPress() })
    await act(async () => renderer.render(<InventoryWorkspace {...props({ runtime: { isOnline: false, isActive: true, refreshEpoch: 0 } })} />))
    await act(async () => { resolve(page) })
    expect(inventoryMocks.createInventoryBlock).not.toHaveBeenCalled()
    expect(button(renderer, 'Tạo block').props.disabled).toBe(true)
    await act(async () => renderer.render(<InventoryWorkspace {...props({ runtime: { isOnline: true, isActive: true, refreshEpoch: 1 } })} />))
    expect(inventoryMocks.createInventoryBlock).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('dispatches only one command for two synchronous confirmation taps', async () => {
    const renderer = await renderInventory()
    await openCreate(renderer)
    await act(async () => {
      const confirm = button(renderer, 'Xác nhận tạo block').props.onPress
      confirm(); confirm()
    })
    expect(inventoryMocks.createInventoryBlock).toHaveBeenCalledTimes(1)
    expect(renderedText(renderer.container.toJSON())).toContain('command-created')
    await act(async () => renderer.unmount())
  })

  it('does not allow a dirty filter or a stale callback to submit', async () => {
    const renderer = await renderInventory()
    await openCreate(renderer)
    const confirm = button(renderer, 'Xác nhận tạo block').props.onPress
    await act(async () => field(renderer, 'Mã căn').props.onChangeText('61000000-0000-4000-8000-000000000011'))
    await act(async () => confirm())
    expect(inventoryMocks.createInventoryBlock).not.toHaveBeenCalled()
    expect(button(renderer, 'Tạo block').props.disabled).toBe(true)
    await act(async () => renderer.unmount())
  })

  it.each([
    ['2026-02-30', '2026-03-03'], ['2026-11-01', '2026-11-01'], ['2026-11-01', '2026-12-03'],
  ])('rejects invalid calendar/window %s to %s without sending a command', async (from, to) => {
    const renderer = await renderInventory()
    await openCreate(renderer)
    await act(async () => { field(renderer, 'Bắt đầu').props.onChangeText(from); field(renderer, 'Kết thúc exclusive').props.onChangeText(to) })
    await act(async () => button(renderer, 'Xác nhận tạo block').props.onPress())
    expect(inventoryMocks.createInventoryBlock).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('sanitizes remote errors and blocks duplicate submission after an unknown outcome', async () => {
    const renderer = await renderInventory()
    await openCreate(renderer)
    inventoryMocks.createInventoryBlock.mockRejectedValueOnce(new Error('secret-token stack guest@example.test'))
    await act(async () => button(renderer, 'Xác nhận tạo block').props.onPress())
    expect(renderedText(renderer.container.toJSON())).not.toContain('secret-token')
    await act(async () => button(renderer, 'Xác nhận tạo block').props.onPress())
    expect(inventoryMocks.createInventoryBlock).toHaveBeenCalledTimes(1)
    await act(async () => renderer.unmount())
  })

  it('keeps a confirmed command distinct from a failed refresh', async () => {
    const renderer = await renderInventory()
    await openCreate(renderer)
    inventoryMocks.createInventoryBlock.mockImplementationOnce(async () => {
      inventoryMocks.fetchInventoryBlocks.mockRejectedValueOnce(new ApiError('internal token', 503, 'AUTHORIZATION_UNAVAILABLE'))
      return { commandId: 'durable-command', inventoryRevision: '18' }
    })
    await act(async () => button(renderer, 'Xác nhận tạo block').props.onPress())
    expect(renderedText(renderer.container.toJSON())).toContain('durable-command')
    expect(button(renderer, 'Tạo block').props.disabled).toBe(true)
    await act(async () => renderer.unmount())
  })
  it.each([1, 31])('accepts a %i-day calendar window with a valid trimmed reason', async (days) => {
    const renderer = await renderInventory()
    await openCreate(renderer)
    await act(async () => {
      field(renderer, 'Bắt đầu').props.onChangeText('2026-11-01')
      field(renderer, 'Kết thúc exclusive').props.onChangeText(days === 1 ? '2026-11-02' : '2026-12-02')
    })
    await act(async () => button(renderer, 'Xác nhận tạo block').props.onPress())
    expect(inventoryMocks.createInventoryBlock).toHaveBeenCalledTimes(1)
    await act(async () => renderer.unmount())
  })

  it.each([9, 10, 1000, 1001])('enforces the reason boundary at %i characters', async (length) => {
    const renderer = await renderInventory()
    await openCreate(renderer)
    await act(async () => field(renderer, 'Lý do (10–1000 ký tự)').props.onChangeText(`  ${'x'.repeat(length)}  `))
    await act(async () => button(renderer, 'Xác nhận tạo block').props.onPress())
    expect(inventoryMocks.createInventoryBlock).toHaveBeenCalledTimes(length === 10 || length === 1000 ? 1 : 0)
    await act(async () => renderer.unmount())
  })

  it('ignores a late response from the previous token', async () => {
    const deferred = Promise.withResolvers<typeof page>()
    inventoryMocks.fetchInventoryBlocks.mockImplementationOnce(() => deferred.promise)
    const renderer = await renderInventory()
    inventoryMocks.fetchInventoryBlocks.mockResolvedValue({ ...page, inventoryRevision: '22' })
    inventoryMocks.fetchPropertyAvailability.mockImplementation(async (_u, _t, propertyId, checkInDate, checkOutDate) => ({
      propertyId, checkInDate, checkOutDate, inventoryRevision: '22', branchId: page.branchId,
      propertyMembershipVersion: '6', available: true, overlaps: [], observedAt: '2026-11-12T00:00:00Z',
    }))
    await act(async () => renderer.render(<InventoryWorkspace {...props({ accessToken: 'new-token' })} />))
    await act(async () => deferred.resolve(page))
    expect(renderedText(renderer.container.toJSON())).toContain('Revision 22')
    expect(renderedText(renderer.container.toJSON())).not.toContain('Revision 17')
    await act(async () => renderer.unmount())
  })

  it('rechecks release eligibility against the refreshed observation', async () => {
    const renderer = await renderInventory()
    await act(async () => button(renderer, 'Bảo trì').props.onPress())
    await act(async () => field(renderer, 'Lý do release (10–1000 ký tự)').props.onChangeText('Đã hoàn tất bảo trì'))
    inventoryMocks.fetchInventoryBlocks.mockResolvedValueOnce({ ...page, nodes: [{ ...page.nodes[0], status: 'RELEASED' }] })
    await act(async () => button(renderer, 'Xác nhận giải phóng').props.onPress())
    expect(inventoryMocks.releaseInventoryBlock).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('rejects a confirmation callback after the inventory grant is revoked', async () => {
    const renderer = await renderInventory()
    await openCreate(renderer)
    const confirm = button(renderer, 'Xác nhận tạo block').props.onPress
    await act(async () => renderer.render(<InventoryWorkspace {...props({ viewer: { ...viewer, authorizationVersion: 4, permissions: ['inventory:read'] } })} />))
    await act(async () => confirm())
    expect(inventoryMocks.createInventoryBlock).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('locks unknownOutcome even when runtime fluctuates mid-flight before a network failure', async () => {
    let rejectCreate!: (reason?: unknown) => void
    inventoryMocks.createInventoryBlock.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectCreate = reject
      }),
    )
    const renderer = await renderInventory(props({ viewer: { ...viewer, accountId: 'admin-net-1' } }))
    await openCreate(renderer)
    let pressPromise!: Promise<void>
    await act(async () => {
      pressPromise = button(renderer, 'Xác nhận tạo block').props.onPress()
      await Promise.resolve()
    })
    await act(async () => renderer.render(<InventoryWorkspace {...props({
      viewer: { ...viewer, accountId: 'admin-net-1' },
      runtime: { isOnline: false, isActive: true, refreshEpoch: 1 },
    })} />))
    await act(async () => {
      rejectCreate(new Error('network timeout'))
      await pressPromise
    })
    await act(async () => renderer.render(<InventoryWorkspace {...props({
      viewer: { ...viewer, accountId: 'admin-net-1' },
      runtime: { isOnline: true, isActive: true, refreshEpoch: 2 },
    })} />))
    expect(renderedText(renderer.container.toJSON())).toContain('Chưa xác định kết quả lệnh')
    expect(button(renderer, 'Tạo block').props.disabled).toBe(true)
    await act(async () => renderer.unmount())
  })

  it('records command result when runtime fluctuates mid-flight on the same principal and resolves', async () => {
    let resolveCreate!: (value: { commandId: string; inventoryRevision: string }) => void
    inventoryMocks.createInventoryBlock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveCreate = resolve
      }),
    )
    const renderer = await renderInventory(props({ viewer: { ...viewer, accountId: 'admin-fluct-1' } }))
    await openCreate(renderer)
    let pressPromise!: Promise<void>
    await act(async () => {
      pressPromise = button(renderer, 'Xác nhận tạo block').props.onPress()
      await Promise.resolve()
    })
    await act(async () => renderer.render(<InventoryWorkspace {...props({
      viewer: { ...viewer, accountId: 'admin-fluct-1' },
      runtime: { isOnline: false, isActive: false, refreshEpoch: 3 },
    })} />))
    await act(async () => {
      resolveCreate({ commandId: 'cmd-after-reconnect', inventoryRevision: '19' })
      await pressPromise
    })
    expect(renderedText(renderer.container.toJSON())).toContain('cmd-after-reconnect')
    await act(async () => renderer.unmount())
  })

  it('retains unknownOutcome and pending locks across unmount/remount on the same accountId while isolating other accounts', async () => {
    let rejectCreate!: (reason?: unknown) => void
    inventoryMocks.createInventoryBlock.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectCreate = reject
      }),
    )
    const firstMount = await renderInventory(props({ viewer: { ...viewer, accountId: 'admin-remount-1' } }))
    await openCreate(firstMount)
    let pressPromise!: Promise<void>
    await act(async () => {
      pressPromise = button(firstMount, 'Xác nhận tạo block').props.onPress()
      await Promise.resolve()
    })
    await act(async () => firstMount.unmount())

    const remountWhilePending = await renderInventory(props({ viewer: { ...viewer, accountId: 'admin-remount-1' } }))
    expect(button(remountWhilePending, 'Tạo block').props.disabled).toBe(true)
    await act(async () => {
      rejectCreate(new Error('socket closed'))
      await pressPromise
    })
    await act(async () => remountWhilePending.unmount())

    const remountAfterFailure = await renderInventory(props({ viewer: { ...viewer, accountId: 'admin-remount-1' } }))
    expect(renderedText(remountAfterFailure.container.toJSON())).toContain('Chưa xác định kết quả lệnh')
    expect(button(remountAfterFailure, 'Tạo block').props.disabled).toBe(true)
    await act(async () => remountAfterFailure.unmount())

    const otherAccount = await renderInventory(props({ viewer: { ...viewer, accountId: 'admin-other-2' } }))
    expect(button(otherAccount, 'Tạo block').props.disabled).toBe(false)
    await act(async () => otherAccount.unmount())
  })

  it('keeps the main-screen unknownOutcome banner after closing the modal and refreshing, with accessible primary button states', async () => {
    inventoryMocks.createInventoryBlock.mockRejectedValueOnce(new Error('gateway hangup'))
    const renderer = await renderInventory(props({ viewer: { ...viewer, accountId: 'admin-banner-1' } }))
    const createTrigger = button(renderer, 'Tạo block')
    expect(createTrigger.props.accessibilityRole).toBe('button')
    expect(createTrigger.props.accessibilityState).toEqual({ disabled: false, busy: false })
    expect(button(renderer, 'Áp dụng và làm mới').props.accessibilityState).toEqual({ disabled: false, busy: false })

    await openCreate(renderer)
    expect(button(renderer, 'Xác nhận tạo block').props.accessibilityRole).toBe('button')
    expect(button(renderer, 'Xác nhận tạo block').props.accessibilityState).toEqual({ disabled: false, busy: false })
    await act(async () => button(renderer, 'Xác nhận tạo block').props.onPress())
    await act(async () => button(renderer, 'Đóng').props.onPress())
    await act(async () => button(renderer, 'Áp dụng và làm mới').props.onPress())

    expect(renderedText(renderer.container.toJSON())).toContain('Chưa xác định kết quả lệnh')
    expect(button(renderer, 'Tạo block').props.accessibilityState).toEqual({ disabled: true, busy: false })

    await act(async () => button(renderer, 'Bảo trì').props.onPress())
    expect(button(renderer, 'Xác nhận giải phóng').props.accessibilityRole).toBe('button')
    expect(button(renderer, 'Xác nhận giải phóng').props.accessibilityState).toEqual({ disabled: true, busy: false })
    await act(async () => renderer.unmount())
  })
})

function props(overrides: Partial<MobileWorkspaceProps> = {}): MobileWorkspaceProps {
  return { graphqlUrl: '/graphql', accessToken: 'token', viewer, runtime: { isOnline: true, isActive: true, refreshEpoch: 0 }, ...overrides }
}

function button(renderer: Root, text: string) {
  return renderer.container.queryAll((node) => node.type === 'Pressable' && renderedText(node.toJSON()).includes(text))[0]!
}

function field(renderer: Root, label: string) {
  return renderer.container.queryAll((node) => node.type === 'TextInput' && node.props.accessibilityLabel === label)[0]!
}

async function renderInventory(customProps: MobileWorkspaceProps = props()) {
  const renderer = createRoot({ textComponentTypes: ['Text'] })
  await act(async () => renderer.render(<InventoryWorkspace {...customProps} />))
  return renderer
}

async function openCreate(renderer: Root) {
  await act(async () => button(renderer, 'Tạo block').props.onPress())
  await act(async () => field(renderer, 'Lý do (10–1000 ký tự)').props.onChangeText('Bảo trì điều hòa định kỳ'))
}
