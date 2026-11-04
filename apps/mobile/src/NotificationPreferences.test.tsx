import { act } from 'react'
import { createRoot } from 'test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationPreferences } from './NotificationPreferences'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const preferenceMocks = vi.hoisted(() => ({
  fetchNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}))

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }))

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}))

vi.mock('@vistay/admin-api-client', () => preferenceMocks)

function renderedText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(renderedText).join('')
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children?: unknown }).children ?? [])
  }
  return ''
}

const preferences = [
  {
    id: 'preference-required', notificationType: 'SECURITY', channel: 'EMAIL', enabled: true,
    required: true, quietHours: null, timeZoneId: 'Asia/Ho_Chi_Minh', revision: 4, updatedAt: '2026-11-04T00:00:00Z',
  },
  {
    id: 'preference-optional', notificationType: 'BOOKING', channel: 'IN_APP', enabled: true,
    required: false, quietHours: null, timeZoneId: 'Asia/Ho_Chi_Minh', revision: 5, updatedAt: '2026-11-04T00:00:00Z',
  },
  {
    id: 'preference-push', notificationType: 'OPERATIONS', channel: 'PUSH', enabled: false,
    required: false, quietHours: null, timeZoneId: 'Asia/Ho_Chi_Minh', revision: 6, updatedAt: '2026-11-04T00:00:00Z',
  },
]

function findByText(renderer: ReturnType<typeof createRoot>, type: string, value: string) {
  return renderer.container.queryAll((instance) => instance.type === type && renderedText(instance.toJSON()).includes(value))[0]
}

async function renderPreferences() {
  const renderer = createRoot({ textComponentTypes: ['Text'] })
  await act(async () => {
    renderer.render(<NotificationPreferences graphqlUrl="/graphql" accessToken="token" pushEnabled={false} />)
    await Promise.resolve()
    await Promise.resolve()
  })
  return renderer
}

describe('Admin mobile notification preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preferenceMocks.fetchNotificationPreferences.mockResolvedValue({ revision: 8, nodes: preferences })
    preferenceMocks.updateNotificationPreferences.mockResolvedValue({ revision: 9, nodes: preferences })
  })

  it('locks mandatory channels and makes unavailable push explicit', async () => {
    const renderer = await renderPreferences()
    const output = renderedText(renderer.container.toJSON())
    const toggles = renderer.container.queryAll((instance) => instance.type === 'Pressable' && instance.props.accessibilityRole === 'checkbox' && ['Bat buoc', 'Dang bat', 'Dang tat'].includes(renderedText(instance.toJSON())))

    expect(output).toContain('Bat buoc')
    expect(output).toContain('Push dang cho feature flag')
    expect(output).toContain('Revision 8')
    expect(toggles[0]?.props.disabled).toBe(true)
    expect(toggles[1]?.props.disabled).toBe(false)
    expect(toggles[2]?.props.disabled).toBe(true)

    await act(async () => renderer.unmount())
  })

  it('rejects invalid timezone and equal quiet-hour boundaries without a request', async () => {
    const renderer = await renderPreferences()
    const zone = renderer.container.queryAll((instance) => instance.type === 'TextInput' && instance.props.accessibilityLabel === 'Trong ung dung mui gio')[0]
    expect(zone).toBeDefined()
    await act(async () => zone?.props.onChangeText('Invalid Zone'))

    const save = findByText(renderer, 'Pressable', 'Luu cai dat')
    await act(async () => save?.props.onPress())
    expect(renderedText(renderer.container.toJSON())).toContain('Mui gio khong hop le')
    expect(preferenceMocks.updateNotificationPreferences).not.toHaveBeenCalled()

    await act(async () => zone?.props.onChangeText('Asia/Ho_Chi_Minh'))
    const quietToggle = renderer.container.queryAll((instance) => instance.type === 'Pressable' && renderedText(instance.toJSON()).includes('Gio yen lang'))[1]
    expect(quietToggle).toBeDefined()
    await act(async () => quietToggle?.props.onPress())
    const start = renderer.container.queryAll((instance) => instance.type === 'TextInput' && instance.props.accessibilityLabel === 'Trong ung dung bat dau')[0]
    const end = renderer.container.queryAll((instance) => instance.type === 'TextInput' && instance.props.accessibilityLabel === 'Trong ung dung ket thuc')[0]
    expect(start).toBeDefined()
    expect(end).toBeDefined()
    await act(async () => start?.props.onChangeText('10:00'))
    const refreshedEnd = renderer.container.queryAll((instance) => instance.type === 'TextInput' && instance.props.accessibilityLabel === 'Trong ung dung ket thuc')[0]
    await act(async () => refreshedEnd?.props.onChangeText('10:00'))
    const secondSave = findByText(renderer, 'Pressable', 'Luu cai dat')
    await act(async () => secondSave?.props.onPress())
    expect(renderedText(renderer.container.toJSON())).toContain('Khoang gio yen lang')
    expect(preferenceMocks.updateNotificationPreferences).not.toHaveBeenCalled()

    await act(async () => renderer.unmount())
  })

  it('keeps the server revision visible when a preference update is stale', async () => {
    preferenceMocks.updateNotificationPreferences.mockRejectedValueOnce(new Error('STALE_REVISION'))
    const renderer = await renderPreferences()
    const toggles = renderer.container.queryAll((instance) => instance.type === 'Pressable' && instance.props.accessibilityRole === 'checkbox' && ['Bat buoc', 'Dang bat', 'Dang tat'].includes(renderedText(instance.toJSON())))
    await act(async () => toggles[1]?.props.onPress())
    const save = findByText(renderer, 'Pressable', 'Luu cai dat')
    await act(async () => {
      await save?.props.onPress()
      await Promise.resolve()
    })

    expect(preferenceMocks.updateNotificationPreferences).toHaveBeenCalledWith(
      '/graphql', 'token', expect.objectContaining({ idempotencyKey: expect.any(String) }), undefined, expect.any(Function),
    )
    expect(renderedText(renderer.container.toJSON())).toContain('STALE_REVISION')
    expect(renderedText(renderer.container.toJSON())).toContain('Revision 8')
    await act(async () => renderer.unmount())
  })
})
