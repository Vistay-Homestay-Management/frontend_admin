import { act } from 'react'
import { createRoot } from 'test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PropertiesScreen from './app/(admin)/properties'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const propertyMocks = vi.hoisted(() => ({ fetchPropertyAdminWorkspace: vi.fn() }))

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }))
vi.mock('@expo/vector-icons', () => {
  const Ionicons = () => null
  Ionicons.glyphMap = {}
  return { Ionicons }
})
vi.mock('@vistay/admin-api-client', () => propertyMocks)
vi.mock('./AdminContext', () => ({
  useAdmin: () => ({
    accessToken: 'token',
    config: { graphqlUrl: '/graphql' },
    viewer: { permissions: ['property:read', 'property-attribute:read'] },
  }),
}))
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  RefreshControl: 'RefreshControl',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
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

function findPressable(node: unknown, label: string): { props: { onPress: () => void } } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findPressable(child, label)
      if (match) return match
    }
    return undefined
  }
  if (!node || typeof node !== 'object') return undefined
  const candidate = node as { type?: string; props?: { onPress?: () => void }; children?: unknown }
  if (candidate.type === 'Pressable' && candidate.props?.onPress && renderedText(candidate.children) === label) {
    return candidate as { props: { onPress: () => void } }
  }
  return findPressable(candidate.children, label)
}

describe('PropertiesScreen tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    propertyMocks.fetchPropertyAdminWorkspace.mockResolvedValue({
      summary: { activeProperties: 7, maintenanceProperties: 2, propertiesNeedingAttention: 1 },
      attributes: [{
        id: 'attr-1', code: 'VIEW_TYPE', label: 'Hướng nhìn', description: null,
        groupCode: 'DETAIL', dataType: 'TEXT', status: 'ACTIVE', visibility: 'PUBLIC',
        rowVersion: '2', version: '1', requiredOnPublish: false, filterable: true,
        displayOrder: 1, unitLabel: null,
      }],
    })
  })

  it('separates authoritative overview metrics from the dynamic attribute catalog', async () => {
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(<PropertiesScreen />)
      await Promise.resolve()
      await Promise.resolve()
    })

    let tree = renderer.container.toJSON()
    expect(renderedText(tree)).toContain('Đang hoạt động7')
    expect(renderedText(tree)).not.toContain('VIEW_TYPE')

    const attributesTab = findPressable(tree, 'Tiêu chí căn')
    expect(attributesTab).toBeDefined()
    await act(async () => attributesTab?.props.onPress())

    tree = renderer.container.toJSON()
    expect(renderedText(tree)).toContain('Hướng nhìn')
    expect(renderedText(tree)).toContain('DETAIL · TEXT')
    expect(renderedText(tree)).not.toContain('Đang hoạt động7')
    await act(async () => renderer.unmount())
  })
})
