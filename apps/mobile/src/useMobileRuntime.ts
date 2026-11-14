import { useEffect, useRef, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'
import { AppState } from 'react-native'
import {
  createInitialMobileRuntimeSnapshot,
  isNetInfoOnline,
  transitionMobileRuntime,
  type MobileRuntime,
} from './mobileRuntime'

/** Single shell source of truth for foreground and network hints. */
export function useMobileRuntime(): MobileRuntime {
  const [snapshot, setSnapshot] = useState(() =>
    createInitialMobileRuntimeSnapshot(AppState.currentState === 'active'),
  )
  const initialSnapshotRef = useRef(snapshot)

  useEffect(() => {
    let active = true
    let hasListenerEvent = false
    let latest = initialSnapshotRef.current

    const applyPatch = (patch: Partial<Pick<MobileRuntime, 'isOnline' | 'isActive'>>) => {
      const next = transitionMobileRuntime(latest, patch)
      if (next === latest) return
      latest = next
      setSnapshot(next)
    }

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (!active) return
      hasListenerEvent = true
      applyPatch({ isOnline: isNetInfoOnline(state) })
    })

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (!active) return
      applyPatch({ isActive: nextState === 'active' })
    })

    applyPatch({ isActive: AppState.currentState === 'active' })

    void NetInfo.fetch()
      .then((state) => {
        if (!active || hasListenerEvent) return
        applyPatch({ isOnline: isNetInfoOnline(state) })
      })
      .catch(() => undefined)

    return () => {
      active = false
      unsubscribeNetInfo()
      appStateSubscription.remove()
    }
  }, [])

  return snapshot.runtime
}
