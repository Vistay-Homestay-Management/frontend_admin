export type BookingIntentStatus =
  | 'IDLE'
  | 'READY'
  | 'SUBMITTING'
  | 'SUCCEEDED'
  | 'UNKNOWN_OUTCOME'

export type ReconciliationStatus = 'RECONCILED_NOT_CREATED' | 'RECONCILED_MANUALLY_CONFIRMED'

export interface ReconciliationDeclaration {
  declaredBy: string
  reconciliationStatus: ReconciliationStatus
  referenceCheckId: string // Unique audit check reference or transaction query ID
  notes: string
  verifiedAt: number
}

export interface BookingSessionContext {
  idempotencyKey: string
  status: BookingIntentStatus
  payloadFingerprint: string | null
  lastError: string | null
  createdAt: number
  updatedAt: number
  reconciliationAudit?: ReconciliationDeclaration
}

export type SecureRandomProvider = () => string

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Creates and validates a cryptographically secure UUIDv4.
 *
 * Uses:
 * 1. Provided secure provider (e.g., expo-crypto on React Native / Mobile)
 * 2. Web Crypto API (globalThis.crypto.randomUUID)
 *
 * Throws an Error if:
 * - No secure random source is available (NEVER falls back to Math.random).
 * - The provider returns a value that does not match UUID regex.
 */
export function generateSecureUUID(provider?: SecureRandomProvider): string {
  let key: string | undefined

  if (provider && typeof provider === 'function') {
    key = provider()
  } else if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    key = globalThis.crypto.randomUUID()
  }

  if (!key) {
    throw new Error(
      'SECURE_RANDOM_UNAVAILABLE: No cryptographically secure random source available. ' +
        'Please inject a secure provider (e.g., expo-crypto on Mobile).'
    )
  }

  if (!UUID_REGEX.test(key)) {
    throw new Error(
      `INVALID_SECURE_UUID: The generated random key "${key}" is not a valid UUIDv4 string.`
    )
  }

  return key
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
      reconciliationProof: ReconciliationDeclaration
      now?: number
    }
  | {
      type: 'INIT_NEW_SESSION'
      keyProvider?: SecureRandomProvider
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

      // P0-01 FIX: In UNKNOWN_OUTCOME, payload fingerprint MUST match the original!
      if (current.status === 'UNKNOWN_OUTCOME') {
        if (!current.payloadFingerprint) {
          throw new Error(
            'CORRUPTED_SESSION_STATE: UNKNOWN_OUTCOME session has no stored payloadFingerprint.'
          )
        }
        if (current.payloadFingerprint !== action.payloadFingerprint) {
          throw new Error(
            'IDEMPOTENCY_PAYLOAD_MISMATCH: Cannot retry an UNKNOWN_OUTCOME session with a modified payload. ' +
              'The existing idempotency key is bound to the original booking payload.'
          )
        }
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
      // Late arrival guard: if already succeeded, ignore late errors
      if (current.status === 'SUCCEEDED') return current

      return {
        ...current,
        status: 'READY',
        lastError: action.error,
        updatedAt: ts,
      }
    }

    case 'SUBMIT_ERROR_UNKNOWN_OUTCOME': {
      // Late arrival guard: if already succeeded, ignore late unknown errors
      if (current.status === 'SUCCEEDED') return current

      return {
        ...current,
        status: 'UNKNOWN_OUTCOME',
        lastError: action.error,
        updatedAt: ts,
      }
    }

    case 'DISMISS_FORM': {
      // P0-02 FIX: Do not wipe in-flight SUBMITTING or UNKNOWN_OUTCOME!
      if (current.status === 'SUBMITTING' || current.status === 'UNKNOWN_OUTCOME') {
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
      // P0-03 FIX: Reopening a completed session with the same key is disallowed
      if (current.status === 'SUCCEEDED') {
        throw new Error(
          'CANNOT_REOPEN_SUCCEEDED_SESSION: Booking session already succeeded. ' +
            'Call INIT_NEW_SESSION to start a fresh intent with a new idempotency key.'
        )
      }
      if (current.status === 'SUBMITTING' || current.status === 'UNKNOWN_OUTCOME') {
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
      // P0-03 FIX: Cannot abandon while request is in-flight!
      if (current.status === 'SUBMITTING') {
        throw new Error(
          'CANNOT_ABANDON_WHILE_SUBMITTING: Request is currently in-flight. ' +
            'Wait for completion or timeout before attempting to abandon.'
        )
      }

      // P0-04 FIX: In UNKNOWN_OUTCOME, strictly require declaredBy, RECONCILED_NOT_CREATED, and referenceCheckId
      if (current.status === 'UNKNOWN_OUTCOME') {
        const proof = action.reconciliationProof
        if (
          !proof ||
          proof.reconciliationStatus !== 'RECONCILED_NOT_CREATED' ||
          !proof.declaredBy?.trim() ||
          !proof.referenceCheckId?.trim()
        ) {
          throw new Error(
            'CANNOT_ABANDON_WITHOUT_RECONCILIATION: Abandoning an UNKNOWN_OUTCOME booking intent ' +
              'requires verified proof (RECONCILED_NOT_CREATED), declaredBy, and a referenceCheckId.'
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

    case 'INIT_NEW_SESSION': {
      if (current.status === 'SUBMITTING') {
        throw new Error(
          'CANNOT_INIT_NEW_SESSION_WHILE_SUBMITTING: An existing request is in-flight.'
        )
      }
      if (current.status === 'UNKNOWN_OUTCOME') {
        throw new Error(
          'CANNOT_INIT_NEW_SESSION_WITH_PENDING_OUTCOME: Unresolved UNKNOWN_OUTCOME session exists. ' +
            'Must reconcile or formally abandon before initiating a new session.'
        )
      }
      const newKey = generateSecureUUID(action.keyProvider)
      return {
        idempotencyKey: newKey,
        status: 'READY',
        payloadFingerprint: null,
        lastError: null,
        createdAt: ts,
        updatedAt: ts,
      }
    }

    default:
      return current
  }
}
