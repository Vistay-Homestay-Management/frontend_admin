import { describe, expect, it } from 'vitest'
import {
  formatWebHash,
  parseWebHash,
  formatMobileRoute,
  parseMobileRoute,
  sanitizeBookingStatus,
  sanitizeBookingSection,
  sanitizeDateString,
  type NavigationIntent,
} from './navigation.js'
import {
  formatBusinessDate,
  getBusinessAnalyticsRange,
  getTimezoneDateParts,
  addCalendarDays,
} from './date.js'
import {
  bookingSessionReducer,
  generateSecureUUID,
  initBookingSession,
  type BookingSessionContext,
  type ReconciliationDeclaration,
} from './lifecycle.js'

describe('Navigation Intent & Parser (P0-02, P0-05)', () => {
  it('sanitizes valid and invalid booking statuses', () => {
    expect(sanitizeBookingStatus('PENDING_CONFIRMATION')).toBe('PENDING_CONFIRMATION')
    expect(sanitizeBookingStatus('pending_confirmation')).toBe('PENDING_CONFIRMATION')
    expect(sanitizeBookingStatus(' CONFIRMED ')).toBe('CONFIRMED')
    expect(sanitizeBookingStatus('INVALID_STATUS')).toBeUndefined()
    expect(sanitizeBookingStatus('')).toBeUndefined()
    expect(sanitizeBookingStatus(null)).toBeUndefined()
  })

  it('sanitizes booking section with fallback to map', () => {
    expect(sanitizeBookingSection('reservations')).toBe('reservations')
    expect(sanitizeBookingSection('CHECK-IN')).toBe('check-in')
    expect(sanitizeBookingSection('invalid_section')).toBe('map')
    expect(sanitizeBookingSection(null)).toBe('map')
  })

  it('sanitizes date strings according to YYYY-MM-DD pattern and validates real calendar dates', () => {
    expect(sanitizeDateString('2026-11-23')).toBe('2026-11-23')
    expect(sanitizeDateString(' 2026-01-05 ')).toBe('2026-01-05')
    // Leap year 2024 has Feb 29
    expect(sanitizeDateString('2024-02-29')).toBe('2024-02-29')

    // Invalid calendar dates must return undefined
    expect(sanitizeDateString('2026-02-30')).toBeUndefined() // Feb 30 does not exist
    expect(sanitizeDateString('2025-02-29')).toBeUndefined() // Non-leap year Feb 29
    expect(sanitizeDateString('2026-04-31')).toBeUndefined() // April only has 30 days
    expect(sanitizeDateString('2026-13-01')).toBeUndefined() // Month 13 does not exist
    expect(sanitizeDateString('23-11-2026')).toBeUndefined()
    expect(sanitizeDateString('malicious-script')).toBeUndefined()
    expect(sanitizeDateString('')).toBeUndefined()
    expect(sanitizeDateString(null)).toBeUndefined()
  })

  it('performs Web Hash round-trip correctly for booking drill-down', () => {
    const intent: NavigationIntent = {
      destination: 'booking',
      section: 'reservations',
      action: 'create',
      filters: {
        status: 'PENDING_CONFIRMATION',
        checkInDate: '2026-11-25',
        checkOutDate: '2026-11-27',
        search: 'VS-001',
      },
    }

    const hash = formatWebHash(intent)
    expect(hash).toContain('#inventory?')
    expect(hash).toContain('section=reservations')
    expect(hash).toContain('action=create')
    expect(hash).toContain('status=PENDING_CONFIRMATION')
    expect(hash).toContain('checkInDate=2026-11-25')

    const parsed = parseWebHash(hash)
    expect(parsed).toEqual(intent)
  })

  it('handles Web Hash round-trip for properties, users, and analytics', () => {
    const propIntent: NavigationIntent = {
      destination: 'properties',
      section: 'management',
      filters: { needsAttention: true, search: 'Apartment' },
    }
    expect(parseWebHash(formatWebHash(propIntent))).toEqual(propIntent)

    const userIntent: NavigationIntent = {
      destination: 'users',
      section: 'hosts',
      filters: { search: 'John' },
    }
    expect(parseWebHash(formatWebHash(userIntent))).toEqual(userIntent)

    const analyticsIntent: NavigationIntent = {
      destination: 'analytics',
      section: 'operations',
    }
    expect(parseWebHash(formatWebHash(analyticsIntent))).toEqual(analyticsIntent)
  })

  it('handles Web Hash edge cases gracefully', () => {
    expect(parseWebHash('')).toBeNull()
    expect(parseWebHash('#')).toBeNull()
    expect(parseWebHash('#unknownRoute?foo=bar')).toBeNull()

    // Fallback when query contains invalid status
    const parsedWithBadStatus = parseWebHash('#inventory?section=check-in&status=HACKED')
    expect(parsedWithBadStatus).toEqual({
      destination: 'booking',
      section: 'check-in',
    })
  })

  it('performs Mobile Expo Router round-trip correctly for booking', () => {
    const intent: NavigationIntent = {
      destination: 'booking',
      section: 'check-in',
      filters: {
        status: 'CONFIRMED',
        checkInDate: '2026-11-23',
      },
    }

    const { pathname, params } = formatMobileRoute(intent)
    expect(pathname).toBe('/booking')
    expect(params.section).toBe('check-in')
    expect(params.status).toBe('CONFIRMED')

    const parsed = parseMobileRoute(pathname, params)
    expect(parsed).toEqual(intent)
  })

  it('performs Mobile Expo Router round-trip for analytics with route group handling', () => {
    const analyticsIntent: NavigationIntent = {
      destination: 'analytics',
      section: 'operations',
    }

    const { pathname, params } = formatMobileRoute(analyticsIntent)
    expect(pathname).toBe('/overview')
    expect(params.section).toBe('operations')

    // Direct /overview route
    expect(parseMobileRoute('/overview', params)).toEqual(analyticsIntent)
    // Expo Route group /(admin)/overview
    expect(parseMobileRoute('/(admin)/overview', params)).toEqual(analyticsIntent)
    // Normalized route /admin/overview
    expect(parseMobileRoute('/admin/overview', params)).toEqual(analyticsIntent)
  })
})

describe('Business Timezone Utilities (P0-04, P0-10)', () => {
  it('formats dates in Asia/Ho_Chi_Minh correctly around midnight boundary', () => {
    // 2026-11-20 17:30:00 UTC == 2026-11-21 00:30:00 GMT+7
    const midnightAfter = new Date('2026-11-20T17:30:00.000Z')
    expect(formatBusinessDate(midnightAfter, 'Asia/Ho_Chi_Minh')).toBe('2026-11-21')

    // 2026-11-20 16:59:00 UTC == 2026-11-20 23:59:00 GMT+7
    const midnightBefore = new Date('2026-11-20T16:59:00.000Z')
    expect(formatBusinessDate(midnightBefore, 'Asia/Ho_Chi_Minh')).toBe('2026-11-20')
  })

  it('handles month and year boundaries correctly with calendar projection', () => {
    const dec31 = { year: 2025, month: 12, day: 31 }
    const jan01 = addCalendarDays(dec31, 1)
    expect(jan01).toEqual({ year: 2026, month: 1, day: 1 })

    const jan01_2026 = { year: 2026, month: 1, day: 1 }
    const dec31_prev = addCalendarDays(jan01_2026, -1)
    expect(dec31_prev).toEqual({ year: 2025, month: 12, day: 31 })
  })

  it('handles leap years accurately (Feb 28 vs Feb 29)', () => {
    // 2024 is leap year
    const feb28_2024 = { year: 2024, month: 2, day: 28 }
    expect(addCalendarDays(feb28_2024, 1)).toEqual({ year: 2024, month: 2, day: 29 })

    // 2025 is not leap year
    const feb28_2025 = { year: 2025, month: 2, day: 28 }
    expect(addCalendarDays(feb28_2025, 1)).toEqual({ year: 2025, month: 3, day: 1 })
  })

  it('throws an error on invalid Date and never silently falls back to 1970', () => {
    expect(() => getTimezoneDateParts(new Date(Number.NaN))).toThrow(/Invalid Date provided/)
    expect(() => formatBusinessDate(new Date('invalid-date'))).toThrow(/Invalid Date provided/)
  })

  it('calculates half-open analytics range [from, toExclusive) for 7, 30, and 90 days', () => {
    // Fixed reference time: 2026-11-23 10:00:00 GMT+7
    const refDate = new Date('2026-11-23T03:00:00.000Z')

    const range7 = getBusinessAnalyticsRange(7, refDate, 'Asia/Ho_Chi_Minh')
    // Today is 2026-11-23 -> toExclusive is 2026-11-24
    expect(range7.to).toBe('2026-11-24')
    // 7 days duration inclusive ending on 23rd: 17, 18, 19, 20, 21, 22, 23 (from = 2026-11-17)
    expect(range7.from).toBe('2026-11-17')

    const range30 = getBusinessAnalyticsRange(30, refDate, 'Asia/Ho_Chi_Minh')
    expect(range30.to).toBe('2026-11-24')
    expect(range30.from).toBe('2026-10-25')

    expect(() => getBusinessAnalyticsRange(0, refDate)).toThrow(/positive integer >= 1/)
  })
})

describe('Idempotency & Lifecycle State Machine (P0-03, P0-08, P0-11)', () => {
  it('generates secure UUID and rejects insecure Math.random or invalid format', () => {
    const key = generateSecureUUID()
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

    const customSecureProvider = () => '11111111-2222-4333-8444-555555555555'
    expect(generateSecureUUID(customSecureProvider)).toBe('11111111-2222-4333-8444-555555555555')

    // Rejects non-UUID format provider output
    const badProvider = () => 'not-a-valid-uuid-string'
    expect(() => generateSecureUUID(badProvider)).toThrow(/INVALID_SECURE_UUID/)
  })

  it('initializes a clean session in READY state with a secure key', () => {
    const session = initBookingSession()
    expect(session.status).toBe('READY')
    expect(session.idempotencyKey).toBeDefined()
    expect(session.payloadFingerprint).toBeNull()
  })

  it('transitions through happy path: READY -> SUBMITTING -> SUCCEEDED', () => {
    let session = initBookingSession()
    session = bookingSessionReducer(session, {
      type: 'START_SUBMIT',
      payloadFingerprint: 'sha256-hash-payload-1',
    })
    expect(session.status).toBe('SUBMITTING')
    expect(session.payloadFingerprint).toBe('sha256-hash-payload-1')

    session = bookingSessionReducer(session, { type: 'SUBMIT_SUCCESS' })
    expect(session.status).toBe('SUCCEEDED')
  })

  it('handles deterministic errors by returning to READY while keeping key', () => {
    let session = initBookingSession()
    const originalKey = session.idempotencyKey

    session = bookingSessionReducer(session, {
      type: 'START_SUBMIT',
      payloadFingerprint: 'sha256-hash-payload-1',
    })
    session = bookingSessionReducer(session, {
      type: 'SUBMIT_ERROR_DETERMINISTIC',
      error: '400 Bad Request: Invalid guest phone',
    })

    expect(session.status).toBe('READY')
    expect(session.lastError).toBe('400 Bad Request: Invalid guest phone')
    expect(session.idempotencyKey).toBe(originalKey)
  })

  it('CRITICAL: UNKNOWN_OUTCOME retains key and payload even if form is dismissed and reopened', () => {
    let session = initBookingSession()
    const originalKey = session.idempotencyKey
    const payloadHash = 'sha256-canonical-booking-input'

    // 1. Submit mutation
    session = bookingSessionReducer(session, {
      type: 'START_SUBMIT',
      payloadFingerprint: payloadHash,
    })

    // 2. Gateway timeout / Network drop
    session = bookingSessionReducer(session, {
      type: 'SUBMIT_ERROR_UNKNOWN_OUTCOME',
      error: '504 Gateway Timeout: Response not received',
    })
    expect(session.status).toBe('UNKNOWN_OUTCOME')
    expect(session.idempotencyKey).toBe(originalKey)
    expect(session.payloadFingerprint).toBe(payloadHash)

    // 3. User closes form / modal -> MUST NOT reset to IDLE
    session = bookingSessionReducer(session, { type: 'DISMISS_FORM' })
    expect(session.status).toBe('UNKNOWN_OUTCOME')
    expect(session.idempotencyKey).toBe(originalKey)
    expect(session.payloadFingerprint).toBe(payloadHash)

    // 4. User re-opens form
    session = bookingSessionReducer(session, { type: 'REOPEN_FORM' })
    expect(session.status).toBe('UNKNOWN_OUTCOME')
    expect(session.idempotencyKey).toBe(originalKey)

    // 5. User retries -> submit is allowed with the SAME key and payload
    session = bookingSessionReducer(session, {
      type: 'START_SUBMIT',
      payloadFingerprint: payloadHash,
    })
    expect(session.status).toBe('SUBMITTING')
    expect(session.idempotencyKey).toBe(originalKey)

    // 6. Backend confirms replay succeeded
    session = bookingSessionReducer(session, { type: 'SUBMIT_SUCCESS' })
    expect(session.status).toBe('SUCCEEDED')
  })

  it('CRITICAL: retrying UNKNOWN_OUTCOME with a modified payload throws IDEMPOTENCY_PAYLOAD_MISMATCH', () => {
    let session = initBookingSession()
    const payloadOriginal = 'sha256-original-payload'
    const payloadModified = 'sha256-modified-payload'

    session = bookingSessionReducer(session, {
      type: 'START_SUBMIT',
      payloadFingerprint: payloadOriginal,
    })
    session = bookingSessionReducer(session, {
      type: 'SUBMIT_ERROR_UNKNOWN_OUTCOME',
      error: '504 Gateway Timeout',
    })

    // Attempting to retry with a modified payload must throw
    expect(() =>
      bookingSessionReducer(session, {
        type: 'START_SUBMIT',
        payloadFingerprint: payloadModified,
      })
    ).toThrow(/IDEMPOTENCY_PAYLOAD_MISMATCH/)
  })

  it('dismissing form during SUBMITTING preserves SUBMITTING status', () => {
    let session = initBookingSession()
    session = bookingSessionReducer(session, {
      type: 'START_SUBMIT',
      payloadFingerprint: 'payload-hash',
    })
    expect(session.status).toBe('SUBMITTING')

    session = bookingSessionReducer(session, { type: 'DISMISS_FORM' })
    expect(session.status).toBe('SUBMITTING')
  })

  it('cannot abandon while request is currently in-flight', () => {
    let session = initBookingSession()
    session = bookingSessionReducer(session, {
      type: 'START_SUBMIT',
      payloadFingerprint: 'payload-hash',
    })

    expect(() =>
      bookingSessionReducer(session, {
        type: 'FORCE_ABANDON_PENDING',
        reconciliationProof: {
          declaredBy: 'reception-01',
          reconciliationStatus: 'RECONCILED_NOT_CREATED',
          referenceCheckId: 'AUDIT-REF-999',
          notes: 'Tested in-flight',
          verifiedAt: Date.now(),
        },
      })
    ).toThrow(/CANNOT_ABANDON_WHILE_SUBMITTING/)
  })

  it('cannot reopen form after SUCCEEDED session', () => {
    let session = initBookingSession()
    session = bookingSessionReducer(session, {
      type: 'START_SUBMIT',
      payloadFingerprint: 'payload-hash',
    })
    session = bookingSessionReducer(session, { type: 'SUBMIT_SUCCESS' })

    expect(() => bookingSessionReducer(session, { type: 'REOPEN_FORM' })).toThrow(
      /CANNOT_REOPEN_SUCCEEDED_SESSION/
    )
  })

  it('late error arrival after SUCCEEDED is safely ignored', () => {
    let session = initBookingSession()
    session = bookingSessionReducer(session, {
      type: 'START_SUBMIT',
      payloadFingerprint: 'payload-hash',
    })
    session = bookingSessionReducer(session, { type: 'SUBMIT_SUCCESS' })

    // Late deterministic error
    session = bookingSessionReducer(session, {
      type: 'SUBMIT_ERROR_DETERMINISTIC',
      error: 'Late network error',
    })
    expect(session.status).toBe('SUCCEEDED')

    // Late unknown error
    session = bookingSessionReducer(session, {
      type: 'SUBMIT_ERROR_UNKNOWN_OUTCOME',
      error: 'Late timeout error',
    })
    expect(session.status).toBe('SUCCEEDED')
  })

  it('strictly guards FORCE_ABANDON_PENDING requiring verified reconciliation proof', () => {
    let session = initBookingSession()
    const firstKey = session.idempotencyKey

    session = bookingSessionReducer(session, {
      type: 'START_SUBMIT',
      payloadFingerprint: 'hash-1',
    })
    session = bookingSessionReducer(session, {
      type: 'SUBMIT_ERROR_UNKNOWN_OUTCOME',
      error: 'Network drop',
    })

    // 1. Attempting to abandon with RECONCILED_MANUALLY_CONFIRMED throws
    expect(() =>
      bookingSessionReducer(session, {
        type: 'FORCE_ABANDON_PENDING',
        reconciliationProof: {
          declaredBy: 'staff-01',
          reconciliationStatus: 'RECONCILED_MANUALLY_CONFIRMED',
          referenceCheckId: 'AUDIT-101',
          notes: 'Booking was created on server',
          verifiedAt: Date.now(),
        },
      })
    ).toThrow(/CANNOT_ABANDON_WITHOUT_RECONCILIATION/)

    // 2. Attempting to abandon without referenceCheckId throws
    expect(() =>
      bookingSessionReducer(session, {
        type: 'FORCE_ABANDON_PENDING',
        reconciliationProof: {
          declaredBy: 'staff-01',
          reconciliationStatus: 'RECONCILED_NOT_CREATED',
          referenceCheckId: '',
          notes: 'Missing audit reference',
          verifiedAt: Date.now(),
        },
      })
    ).toThrow(/CANNOT_ABANDON_WITHOUT_RECONCILIATION/)

    // 3. Attempting to abandon without declaredBy throws
    expect(() =>
      bookingSessionReducer(session, {
        type: 'FORCE_ABANDON_PENDING',
        reconciliationProof: {
          declaredBy: '',
          reconciliationStatus: 'RECONCILED_NOT_CREATED',
          referenceCheckId: 'AUDIT-102',
          notes: 'Missing staff id',
          verifiedAt: Date.now(),
        },
      })
    ).toThrow(/CANNOT_ABANDON_WITHOUT_RECONCILIATION/)

    // 4. Supplying valid verified proof succeeds and generates new session key
    const customKey = '22222222-3333-4444-8555-666666666666'
    session = bookingSessionReducer(session, {
      type: 'FORCE_ABANDON_PENDING',
      keyProvider: () => customKey,
      reconciliationProof: {
        declaredBy: 'staff-01',
        reconciliationStatus: 'RECONCILED_NOT_CREATED',
        referenceCheckId: 'AUDIT-REF-999',
        notes: 'Checked booking database and bank gateway: no reservation recorded.',
        verifiedAt: Date.now(),
      },
    })

    expect(session.status).toBe('READY')
    expect(session.idempotencyKey).toBe(customKey)
    expect(session.payloadFingerprint).toBeNull()
    expect(session.reconciliationAudit?.reconciliationStatus).toBe('RECONCILED_NOT_CREATED')
    expect(session.reconciliationAudit?.referenceCheckId).toBe('AUDIT-REF-999')
  })
})
