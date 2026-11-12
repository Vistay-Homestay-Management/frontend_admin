import { act, createElement } from 'react'
import { createRoot } from 'test-renderer'
import { expect, it, vi } from 'vitest'
import { useViewer } from './useBackofficeData'
import type { BackofficeViewer } from '@vistay/admin-api-client'

const mocks = vi.hoisted(() => ({ fetchViewer: vi.fn() }))
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }))
vi.mock('expo-secure-store', () => ({}))
vi.mock('@vistay/admin-api-client', () => mocks)
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const viewer: BackofficeViewer = {
  accountId: 'fresh-account', profileId: 'profile', displayName: 'Synthetic operator',
  email: 'operator@example.test', contactPhone: null, avatarMediaId: null,
  profileVersion: 1, roles: ['ADMIN'], permissions: ['inventory:read'], authorizationVersion: 1,
}

it('hides the previous principal immediately and ignores its late response', async () => {
  const old = Promise.withResolvers<BackofficeViewer>()
  const fresh = Promise.withResolvers<BackofficeViewer>()
  mocks.fetchViewer.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise).mockReturnValue(Promise.withResolvers<BackofficeViewer>().promise)
  const root = createRoot()
  let observed: BackofficeViewer | undefined
  function Probe({ token }: { token: string }) {
    observed = useViewer('/graphql', token).viewer
    return null
  }
  await act(async () => root.render(createElement(Probe, { token: 'old' })))
  await act(async () => root.render(createElement(Probe, { token: 'fresh' })))
  await act(async () => fresh.resolve(viewer))
  expect(observed?.accountId).toBe('fresh-account')
  await act(async () => old.resolve({ ...viewer, accountId: 'old-account' }))
  expect(observed?.accountId).toBe('fresh-account')
  await act(async () => root.render(createElement(Probe, { token: 'third' })))
  expect(observed).toBeUndefined()
  await act(async () => root.unmount())
})

it('retains the ready viewer during background revalidation when refreshEpoch increments on the same principal', async () => {
  const initial = Promise.withResolvers<BackofficeViewer>()
  const revalidated = Promise.withResolvers<BackofficeViewer>()
  mocks.fetchViewer.mockReturnValueOnce(initial.promise).mockReturnValueOnce(revalidated.promise)
  const root = createRoot()
  const snapshots: { status: string; accountId?: string; authVersion?: number }[] = []
  function Probe({ token, refreshEpoch }: { token: string; refreshEpoch: number }) {
    const state = useViewer('/graphql', token, refreshEpoch)
    snapshots.push({ status: state.status, accountId: state.viewer?.accountId, authVersion: state.viewer?.authorizationVersion })
    return null
  }
  await act(async () => root.render(createElement(Probe, { token: 'same-token', refreshEpoch: 0 })))
  await act(async () => initial.resolve(viewer))
  expect(snapshots.at(-1)).toEqual({ status: 'ready', accountId: 'fresh-account', authVersion: 1 })

  await act(async () => root.render(createElement(Probe, { token: 'same-token', refreshEpoch: 1 })))
  expect(snapshots.at(-1)).toEqual({ status: 'ready', accountId: 'fresh-account', authVersion: 1 })

  await act(async () => revalidated.resolve({ ...viewer, authorizationVersion: 2 }))
  expect(snapshots.at(-1)).toEqual({ status: 'ready', accountId: 'fresh-account', authVersion: 2 })
  await act(async () => root.unmount())
})

it('fails closed when background revalidation rejects after refreshEpoch increments', async () => {
  const initial = Promise.withResolvers<BackofficeViewer>()
  const failedRevalidation = Promise.withResolvers<BackofficeViewer>()
  mocks.fetchViewer.mockReturnValueOnce(initial.promise).mockReturnValueOnce(failedRevalidation.promise)
  const root = createRoot()
  let latest!: ReturnType<typeof useViewer>
  function Probe({ token, refreshEpoch }: { token: string; refreshEpoch: number }) {
    latest = useViewer('/graphql', token, refreshEpoch)
    return null
  }
  await act(async () => root.render(createElement(Probe, { token: 'same-token', refreshEpoch: 0 })))
  await act(async () => initial.resolve(viewer))
  expect(latest.status).toBe('ready')

  await act(async () => root.render(createElement(Probe, { token: 'same-token', refreshEpoch: 1 })))
  expect(latest.status).toBe('ready')
  expect(latest.viewer?.accountId).toBe('fresh-account')

  await act(async () => failedRevalidation.reject(new Error('session revoked')))
  expect(latest.status).toBe('error')
  expect(latest.viewer).toBeUndefined()
  await act(async () => root.unmount())
})
