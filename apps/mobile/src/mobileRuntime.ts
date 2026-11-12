import type { NetInfoState } from '@react-native-community/netinfo'
import type { BackofficeViewer } from '@vistay/admin-api-client'

export interface MobileRuntime {
  isOnline: boolean
  isActive: boolean
  refreshEpoch: number
}

export interface MobileWorkspaceProps {
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
  runtime: MobileRuntime
}

export interface MobileRuntimeSnapshot {
  runtime: MobileRuntime
  hasBeenReady: boolean
}

export function isNetInfoOnline(
  state: Pick<NetInfoState, 'type' | 'isConnected' | 'isInternetReachable'> | null | undefined,
): boolean {
  if (!state) return false
  if (state.type === 'none' || state.type === 'unknown') return false
  return state.isConnected === true && state.isInternetReachable !== false
}

export function createInitialMobileRuntimeSnapshot(isActive: boolean): MobileRuntimeSnapshot {
  return {
    runtime: {
      isOnline: false,
      isActive,
      refreshEpoch: 0,
    },
    hasBeenReady: false,
  }
}

export function transitionMobileRuntime(
  current: MobileRuntimeSnapshot,
  patch: Partial<Pick<MobileRuntime, 'isOnline' | 'isActive'>>,
): MobileRuntimeSnapshot {
  const nextOnline = patch.isOnline ?? current.runtime.isOnline
  const nextActive = patch.isActive ?? current.runtime.isActive

  if (nextOnline === current.runtime.isOnline && nextActive === current.runtime.isActive) {
    return current
  }

  const wasReady = current.runtime.isOnline && current.runtime.isActive
  const nextReady = nextOnline && nextActive
  const refreshEpoch = current.hasBeenReady && !wasReady && nextReady
    ? current.runtime.refreshEpoch + 1
    : current.runtime.refreshEpoch

  return {
    runtime: {
      isOnline: nextOnline,
      isActive: nextActive,
      refreshEpoch,
    },
    hasBeenReady: current.hasBeenReady || nextReady,
  }
}
