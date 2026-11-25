import { useCallback, useEffect, useRef } from 'react'

export interface RequestSequenceHandle {
  /**
   * Starts a new request epoch.
   * Cancels any previously in-flight request via AbortController and increments sequence.
   */
  startRequest: () => { sequence: number; signal: AbortSignal }

  /**
   * Checks if a completed request matches the current active sequence.
   * If false, the response is stale and should be discarded.
   */
  isLatest: (sequence: number) => boolean

  /**
   * Gets the current active sequence number.
   */
  getCurrentSequence: () => number
}

/**
 * Hook to manage request sequence tokens and AbortController signals.
 * Eliminates race conditions where an earlier slow request resolves AFTER a later fast request,
 * overwriting newer state with stale data.
 */
export function useRequestSequence(): RequestSequenceHandle {
  const sequenceRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  const startRequest = useCallback(() => {
    if (controllerRef.current) {
      try {
        controllerRef.current.abort('Superseded by new request sequence')
      } catch {
        // Ignore abort error
      }
    }

    sequenceRef.current += 1
    const controller = new AbortController()
    controllerRef.current = controller

    return {
      sequence: sequenceRef.current,
      signal: controller.signal,
    }
  }, [])

  const isLatest = useCallback((sequence: number) => {
    return sequence === sequenceRef.current
  }, [])

  const getCurrentSequence = useCallback(() => {
    return sequenceRef.current
  }, [])

  useEffect(() => {
    return () => {
      if (controllerRef.current) {
        try {
          controllerRef.current.abort('Component unmounted')
        } catch {
          // Ignore
        }
      }
    }
  }, [])

  return {
    startRequest,
    isLatest,
    getCurrentSequence,
  }
}
