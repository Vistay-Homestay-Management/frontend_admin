export type BookingIntentStatus =
  | 'IDLE'
  | 'READY'
  | 'SUBMITTING'
  | 'SUCCEEDED'
  | 'UNKNOWN_OUTCOME'

export type ReconciliationStatus = 'RECONCILED_NOT_CREATED' | 'RECONCILED_MANUALLY_CONFIRMED'

export interface ReconciliationProof {
  confirmedBy: string
  reconciliationStatus: ReconciliationStatus
  notes: string
}

export interface BookingSessionContext {
  idempotencyKey: string
  status: BookingIntentStatus
  payloadFingerprint: string | null
  lastError: string | null
  createdAt: number
  updatedAt: number
  reconciliationAudit?: ReconciliationProof
}

export type SecureRandomProvider = () => string

/**
 * Creates a cryptographically secure UUIDv4.
 *
 * Uses:
 * 1. Provided secure provider (e.g., expo-crypto on React Native / Mobile)
 * 2. Web Crypto API (globalThis.crypto.randomUUID)
 *
 * Throws an Error if no secure random source is available.
 * NEVER falls back to Math.random().
 */
export function generateSecureUUID(provider?: SecureRandomProvider): string {
  if (provider && typeof provider === 'function') {
    const key = provider()
    if (typeof key === 'string' && key.length > 0) return key
  }

  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID()
  }

  throw new Error(
    'SECURE_RANDOM_UNAVAILABLE: No cryptographically secure random source available. ' +
      'Please inject a secure provider (e.g., expo-crypto on Mobile).'
  )
}

/**
 * Initializes a new Booking Intent Session with a cryptographically secure key.
 */
export function initBookingSession(
  keyProvider?: SecureRandomProvider,
  now = Date.now()
): BookingSessionContext {
  const idempotencyKey = generateSecureUUID(keyProvider)
  return {
    idempotencyKey,
    status: 'READY',
    payloadFingerprint: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  }
}

export type BookingSessionAction =
  | { type: 'START_SUBMIT'; payloadFingerprint: string; now?: number }
  | { type: 'SUBMIT_SUCCESS'; now?: number }
  | { type: 'SUBMIT_ERROR_DETERMINISTIC'; error: string; now?: number }
  | { type: 'SUBMIT_ERROR_UNKNOWN_OUTCOME'; error: string; now?: number }
  | { type: 'DISMISS_FORM'; now?: number }
  | { type: 'REOPEN_FORM'; now?: number }
  | {
      type: 'FORCE_ABANDON_PENDING'
      keyProvider?: SecureRandomProvider
      reconciliationProof: ReconciliationProof
      now?: number
    }

/**
 * Pure state reducer governing Booking creation idempotency lifecycle.
 */
export function bookingSessionReducer(
  current: BookingSessionContext,
  action: BookingSessionAction
): BookingSessionContext {
  const ts = action.now ?? Date.now()

  switch (action.type) {
    case 'START_SUBMIT': {
      if (current.status !== 'READY' && current.status !== 'UNKNOWN_OUTCOME') {
        throw new Error(
          `Cannot submit booking in state "${current.status}". Expected "READY" or "UNKNOWN_OUTCOME".`
        )
      }
      return {
        ...current,
        status: 'SUBMITTING',
        payloadFingerprint: action.payloadFingerprint,
        lastError: null,
        updatedAt: ts,
      }
    }

    case 'SUBMIT_SUCCESS': {
      if (current.status !== 'SUBMITTING' && current.status !== 'UNKNOWN_OUTCOME') {
        throw new Error(
          `Cannot mark success in state "${current.status}". Expected "SUBMITTING" or "UNKNOWN_OUTCOME".`
        )
      }
      return {
        ...current,
        status: 'SUCCEEDED',
        lastError: null,
        updatedAt: ts,
      }
    }

    case 'SUBMIT_ERROR_DETERMINISTIC': {
      // Deterministic error (e.g. 400 Validation, 403 Forbidden).
      // Booking was definitely NOT created, user can edit payload and retry.
      return {
        ...current,
        status: 'READY',
        lastError: action.error,
        updatedAt: ts,
      }
    }

    case 'SUBMIT_ERROR_UNKNOWN_OUTCOME': {
      // Network drop, timeout (504, 502, connection reset).
      // Booking MAY have been committed on backend.
      // MUST PRESERVE idempotencyKey and payloadFingerprint for reconciliation!
      return {
        ...current,
        status: 'UNKNOWN_OUTCOME',
        lastError: action.error,
        updatedAt: ts,
      }
    }

    case 'DISMISS_FORM': {
      // Closing or minimizing the form.
      // If UNKNOWN_OUTCOME, we keep status = UNKNOWN_OUTCOME and retain the key and fingerprint!
      if (current.status === 'UNKNOWN_OUTCOME') {
        return {
          ...current,
          updatedAt: ts,
        }
      }
      return {
        ...current,
        status: 'IDLE',
        updatedAt: ts,
      }
    }

    case 'REOPEN_FORM': {
      // Re-opening the modal/workspace.
      // If it was UNKNOWN_OUTCOME, user sees the pending reconciliation state!
      if (current.status === 'UNKNOWN_OUTCOME') {
        return {
          ...current,
          updatedAt: ts,
        }
      }
      return {
        ...current,
        status: 'READY',
        updatedAt: ts,
      }
    }

    case 'FORCE_ABANDON_PENDING': {
      // Guarded abandon: Only allowed when verified that the booking was NOT created on server
      if (current.status === 'UNKNOWN_OUTCOME') {
        if (
          !action.reconciliationProof ||
          action.reconciliationProof.reconciliationStatus !== 'RECONCILED_NOT_CREATED' ||
          !action.reconciliationProof.confirmedBy.trim()
        ) {
          throw new Error(
            'CANNOT_ABANDON_WITHOUT_RECONCILIATION: Abandoning an UNKNOWN_OUTCOME booking intent ' +
              'requires verified proof (RECONCILED_NOT_CREATED) confirming the booking was not committed.'
          )
        }
      }

      const newKey = generateSecureUUID(action.keyProvider)
      return {
        idempotencyKey: newKey,
        status: 'READY',
        payloadFingerprint: null,
        lastError: null,
        createdAt: ts,
        updatedAt: ts,
        reconciliationAudit: action.reconciliationProof,
      }
    }

    default:
      return current
  }
}
