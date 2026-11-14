import { act, createElement } from 'react'
import { createRoot } from 'test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NetInfoChangeHandler, NetInfoState } from '@react-native-community/netinfo'
import type { MobileRuntime } from './mobileRuntime'
import { useMobileRuntime } from './useMobileRuntime'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type AppStateName = 'active' | 'background' | 'inactive' | 'unknown' | 'extension'

const runtimeMocks = vi.hoisted(() => {
  let netInfoListener: NetInfoChangeHandler | undefined
  let appStateListener: ((state: AppStateName) => void) | undefined
  const unsubscribeNetInfo = vi.fn(() => {
    netInfoListener = undefined
  })
  const removeAppState = vi.fn(() => {
    appStateListener = undefined
  })
  const state = {
    currentAppState: 'active' as AppStateName,
  }
  return {
    state,
    unsubscribeNetInfo,
    removeAppState,
    netInfoFetch: vi.fn<() => Promise<NetInfoState>>(),
    netInfoAddEventListener: vi.fn((listener: NetInfoChangeHandler) => {
      netInfoListener = listener
      return unsubscribeNetInfo
    }),
    appStateAddEventListener: vi.fn((_event: 'change', listener: (next: AppStateName) => void) => {
      appStateListener = listener
      return { remove: removeAppState }
    }),
    emitNetInfo(next: NetInfoState) {
      netInfoListener?.(next)
    },
    emitAppState(next: AppStateName) {
      state.currentAppState = next
      appStateListener?.(next)
    },
    resetListeners() {
      netInfoListener = undefined
      appStateListener = undefined
    },
  }
})

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: runtimeMocks.netInfoFetch,
    addEventListener: runtimeMocks.netInfoAddEventListener,
  },
  fetch: runtimeMocks.netInfoFetch,
  addEventListener: runtimeMocks.netInfoAddEventListener,
}))

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return runtimeMocks.state.currentAppState
    },
    addEventListener: runtimeMocks.appStateAddEventListener,
  },
}))

function netInfoState(overrides: Record<string, unknown> = {}): NetInfoState {
  return {
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    details: { isConnectionExpensive: false },
    ...overrides,
  } as unknown as NetInfoState
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function Probe({ onValue }: { onValue: (value: MobileRuntime) => void }) {
  const runtime = useMobileRuntime()
  onValue(runtime)
  return null
}

describe('useMobileRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtimeMocks.resetListeners()
    runtimeMocks.state.currentAppState = 'active'
  })

  it('starts unknown/offline until NetInfo resolves, then opens readiness without incrementing epoch on first ready', async () => {
    const initialFetch = deferred<NetInfoState>()
    runtimeMocks.netInfoFetch.mockReturnValueOnce(initialFetch.promise)

    const snapshots: MobileRuntime[] = []
    const renderer = createRoot()
    await act(async () => {
      renderer.render(createElement(Probe, { onValue: (value) => snapshots.push(value) }))
    })

    expect(snapshots[snapshots.length - 1]).toEqual({
      isOnline: false,
      isActive: true,
      refreshEpoch: 0,
    })

    await act(async () => {
      initialFetch.resolve(netInfoState({ type: 'wifi', isConnected: true, isInternetReachable: null }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(snapshots[snapshots.length - 1]).toEqual({
      isOnline: true,
      isActive: true,
      refreshEpoch: 0,
    })
    expect(runtimeMocks.netInfoAddEventListener).toHaveBeenCalledTimes(1)
    expect(runtimeMocks.appStateAddEventListener).toHaveBeenCalledTimes(1)

    await act(async () => renderer.unmount())
  })

  it('treats unknown and isInternetReachable === false as offline and honors non-active initial AppState', async () => {
    runtimeMocks.state.currentAppState = 'background'
    const initialFetch = deferred<NetInfoState>()
    runtimeMocks.netInfoFetch.mockReturnValueOnce(initialFetch.promise)

    const snapshots: MobileRuntime[] = []
    const renderer = createRoot()
    await act(async () => {
      renderer.render(createElement(Probe, { onValue: (value) => snapshots.push(value) }))
    })

    expect(snapshots[snapshots.length - 1]).toEqual({
      isOnline: false,
      isActive: false,
      refreshEpoch: 0,
    })

    await act(async () => {
      initialFetch.resolve(netInfoState({ type: 'wifi', isConnected: true, isInternetReachable: false }))
      await Promise.resolve()
    })
    expect(snapshots[snapshots.length - 1]?.isOnline).toBe(false)

    await act(async () => {
      runtimeMocks.emitNetInfo(netInfoState({ type: 'unknown', isConnected: null, isInternetReachable: null }))
    })
    expect(snapshots[snapshots.length - 1]?.isOnline).toBe(false)

    await act(async () => {
      runtimeMocks.emitNetInfo(netInfoState({ type: 'cellular', isConnected: true, isInternetReachable: true }))
    })
    expect(snapshots[snapshots.length - 1]).toEqual({
      isOnline: true,
      isActive: false,
      refreshEpoch: 0,
    })

    await act(async () => {
      runtimeMocks.emitAppState('active')
    })
    expect(snapshots[snapshots.length - 1]).toEqual({
      isOnline: true,
      isActive: true,
      refreshEpoch: 0,
    })

    await act(async () => renderer.unmount())
  })

  it('increments refreshEpoch on offline/background recovery and dedupes equivalent transitions', async () => {
    runtimeMocks.netInfoFetch.mockResolvedValueOnce(netInfoState({ type: 'wifi', isConnected: true, isInternetReachable: true }))

    const snapshots: MobileRuntime[] = []
    const renderer = createRoot()
    await act(async () => {
      renderer.render(createElement(Probe, { onValue: (value) => snapshots.push(value) }))
      await Promise.resolve()
      await Promise.resolve()
    })

    const countBeforeDuplicate = snapshots.length
    expect(snapshots[snapshots.length - 1]).toEqual({ isOnline: true, isActive: true, refreshEpoch: 0 })

    await act(async () => {
      runtimeMocks.emitNetInfo(netInfoState({ type: 'cellular', isConnected: true, isInternetReachable: true }))
      runtimeMocks.emitAppState('active')
    })
    expect(snapshots.length).toBe(countBeforeDuplicate)

    await act(async () => {
      runtimeMocks.emitNetInfo(netInfoState({ type: 'none', isConnected: false, isInternetReachable: false }))
    })
    expect(snapshots[snapshots.length - 1]).toEqual({ isOnline: false, isActive: true, refreshEpoch: 0 })

    await act(async () => {
      runtimeMocks.emitNetInfo(netInfoState({ type: 'wifi', isConnected: true, isInternetReachable: true }))
    })
    expect(snapshots[snapshots.length - 1]).toEqual({ isOnline: true, isActive: true, refreshEpoch: 1 })

    await act(async () => {
      runtimeMocks.emitAppState('inactive')
      runtimeMocks.emitAppState('background')
    })
    expect(snapshots[snapshots.length - 1]).toEqual({ isOnline: true, isActive: false, refreshEpoch: 1 })

    await act(async () => {
      runtimeMocks.emitAppState('active')
    })
    expect(snapshots[snapshots.length - 1]).toEqual({ isOnline: true, isActive: true, refreshEpoch: 2 })

    await act(async () => renderer.unmount())
  })

  it('ignores stale initial fetch after listener emits and cleans up subscriptions on unmount', async () => {
    const initialFetch = deferred<NetInfoState>()
    runtimeMocks.netInfoFetch.mockReturnValueOnce(initialFetch.promise)

    const snapshots: MobileRuntime[] = []
    const renderer = createRoot()
    await act(async () => {
      renderer.render(createElement(Probe, { onValue: (value) => snapshots.push(value) }))
    })

    await act(async () => {
      runtimeMocks.emitNetInfo(netInfoState({ type: 'none', isConnected: false, isInternetReachable: false }))
    })

    await act(async () => {
      initialFetch.resolve(netInfoState({ type: 'wifi', isConnected: true, isInternetReachable: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(snapshots[snapshots.length - 1]).toEqual({
      isOnline: false,
      isActive: true,
      refreshEpoch: 0,
    })

    await act(async () => renderer.unmount())
    expect(runtimeMocks.unsubscribeNetInfo).toHaveBeenCalledTimes(1)
    expect(runtimeMocks.removeAppState).toHaveBeenCalledTimes(1)
  })
})
