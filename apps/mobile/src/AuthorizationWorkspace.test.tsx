import { act } from 'react'
import { createRoot } from 'test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthorizationWorkspace } from './AuthorizationWorkspace'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const authorizationMocks = vi.hoisted(() => ({
  approveAuthorizationChange: vi.fn(),
  fetchAuthorizationSubject: vi.fn(),
  fetchAuthorizationWorkspace: vi.fn(),
  fetchRolePolicyWorkspace: vi.fn(),
  reduceAuthorizationScopes: vi.fn(),
  requestCreateRole: vi.fn(),
  requestDeactivateRole: vi.fn(),
  requestRolePermissionChange: vi.fn(),
  rejectAuthorizationChange: vi.fn(),
  requestAuthorizationChange: vi.fn(),
  revokeRoleAssignment: vi.fn(),
  reviewRolePolicyChange: vi.fn(),
}))

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }))

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}))

vi.mock('@vistay/admin-api-client', () => authorizationMocks)

const viewer = {
  accountId: 'admin-1',
  profileId: 'profile-1',
  displayName: 'Role Operator',
  email: 'roles@vistay.test',
  contactPhone: null,
  avatarMediaId: null,
  profileVersion: 1,
  roles: ['ROLE_OPERATOR'],
  permissions: ['role:read', 'role:change-request'],
  authorizationVersion: 3,
}

function renderedText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(renderedText).join('')
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children?: unknown }).children ?? [])
  }
  return ''
}

describe('AuthorizationWorkspace role policy isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorizationMocks.fetchRolePolicyWorkspace.mockResolvedValue({
      roles: [{
        code: 'OPERATIONS', displayName: 'Operations', accountType: 'ADMIN',
        systemRole: false, active: true, roleVersion: 4,
        grants: [{ permissionCode: 'booking:read', allowedScopes: ['ALL'], partitionTypes: [] }],
      }],
      permissions: [{ code: 'booking:read', resource: 'booking', action: 'read', active: true }],
      pendingRequests: [],
    })
  })

  it('loads role policy without querying authorization subjects for a role-only operator', async () => {
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(<AuthorizationWorkspace graphqlUrl="/graphql" accessToken="token" viewer={viewer} />)
      await Promise.resolve()
      await Promise.resolve()
    })

    const output = renderedText(renderer.container.toJSON())
    expect(output).toContain('Chỉ quản trị role policy')
    expect(output).toContain('OPERATIONS')
    expect(authorizationMocks.fetchRolePolicyWorkspace).toHaveBeenCalledWith(
      '/graphql', 'token', 'ADMIN', expect.any(Function),
    )
    expect(authorizationMocks.fetchAuthorizationWorkspace).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('fails closed without either read permission', async () => {
    const renderer = createRoot({ textComponentTypes: ['Text'] })
    await act(async () => {
      renderer.render(<AuthorizationWorkspace
        graphqlUrl="/graphql"
        accessToken="token"
        viewer={{ ...viewer, permissions: [] }}
      />)
      await Promise.resolve()
    })

    expect(renderedText(renderer.container.toJSON())).toContain('authorization:read hoặc role:read')
    expect(authorizationMocks.fetchRolePolicyWorkspace).not.toHaveBeenCalled()
    expect(authorizationMocks.fetchAuthorizationWorkspace).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })
})
