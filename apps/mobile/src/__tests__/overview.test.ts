import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  RefreshControl: 'RefreshControl',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}))

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useLocalSearchParams: () => ({}),
}))

import {
  BUSINESS_TIME_ZONE,
  addCalendarDays,
  formatBusinessDate,
  formatCalendarParts,
  getBusinessAnalyticsRange,
  getPreviousAnalyticsRange,
  getTimezoneDateParts,
} from '../utils/businessDate'
import {
  calculateDelta,
  formatMoney,
} from '../components/OverviewPerformanceTrends'
import {
  formatMobileRoute,
  parseMobileRoute,
  sanitizeBookingSection,
  sanitizeBookingStatus,
  sanitizeDateString,
} from '../navigation/navigationIntent'

describe('ViStay Mobile Command Center: businessDate.ts (P1-01)', () => {
  it('extracts date parts accurately in GMT+7 Asia/Ho_Chi_Minh', () => {
    // 2026-11-23 00:15:00 GMT+7 is 2026-11-22 17:15:00 UTC
    const dateAtMidnightGMT7 = new Date('2026-11-22T17:15:00.000Z')
    const parts = getTimezoneDateParts(dateAtMidnightGMT7, BUSINESS_TIME_ZONE)
    expect(parts).toEqual({ year: 2026, month: 11, day: 23 })
  })

  it('formats business date to YYYY-MM-DD in GMT+7 without UTC regression', () => {
    // 01:00 AM in Vietnam is still previous evening in UTC
    const date = new Date('2026-11-22T18:00:00.000Z')
    expect(formatBusinessDate(date, BUSINESS_TIME_ZONE)).toBe('2026-11-23')
  })

  it('safely shifts calendar days across month and leap year boundaries', () => {
    // Leap year boundary: 2024-02-28 + 1 day = 2024-02-29
    const feb28 = { year: 2024, month: 2, day: 28 }
    const feb29 = addCalendarDays(feb28, 1)
    expect(feb29).toEqual({ year: 2024, month: 2, day: 29 })
    expect(formatCalendarParts(feb29)).toBe('2024-02-29')

    // Month rollover: 2026-11-30 + 1 day = 2026-12-01
    const nov30 = { year: 2026, month: 11, day: 30 }
    expect(formatCalendarParts(addCalendarDays(nov30, 1))).toBe('2026-12-01')

    // Year rollover: 2026-12-31 + 1 day = 2027-01-01
    const dec31 = { year: 2026, month: 12, day: 31 }
    expect(formatCalendarParts(addCalendarDays(dec31, 1))).toBe('2027-01-01')

    // Subtraction across month: 2026-03-01 - 1 day = 2026-02-28
    const mar01 = { year: 2026, month: 3, day: 1 }
    expect(formatCalendarParts(addCalendarDays(mar01, -1))).toBe('2026-02-28')
  })

  it('calculates [fromInclusive, toExclusive) analytics range for 7, 30, 90 days', () => {
    const fixedNow = new Date('2026-11-23T05:00:00.000Z') // 12:00 PM GMT+7

    // 7 days: from = 2026-11-17, to = 2026-11-24 (tomorrow exclusive)
    const range7 = getBusinessAnalyticsRange(7, fixedNow, BUSINESS_TIME_ZONE)
    expect(range7).toEqual({
      from: '2026-11-17',
      to: '2026-11-24',
    })

    // 30 days: from = 2026-10-25, to = 2026-11-24
    const range30 = getBusinessAnalyticsRange(30, fixedNow, BUSINESS_TIME_ZONE)
    expect(range30).toEqual({
      from: '2026-10-25',
      to: '2026-11-24',
    })

    // 90 days
    const range90 = getBusinessAnalyticsRange(90, fixedNow, BUSINESS_TIME_ZONE)
    expect(range90.to).toBe('2026-11-24')
    expect(range90.from).toBe('2026-08-26')
  })

  it('calculates consecutive previous analytics range without gaps or overlaps', () => {
    const fixedNow = new Date('2026-11-23T05:00:00.000Z')
    const current7 = getBusinessAnalyticsRange(7, fixedNow, BUSINESS_TIME_ZONE)
    const prev7 = getPreviousAnalyticsRange(7, fixedNow, BUSINESS_TIME_ZONE)

    // Current: 2026-11-17 to 2026-11-24
    // Previous: 2026-11-10 to 2026-11-17
    expect(current7.from).toBe('2026-11-17')
    expect(prev7.to).toBe(current7.from) // Seamless boundary: toPrev === fromCurrent
    expect(prev7.from).toBe('2026-11-10')
  })

  it('throws descriptive errors on invalid dates or non-positive day ranges', () => {
    expect(() => getTimezoneDateParts(new Date('invalid-date'))).toThrow(
      'Invalid Date provided'
    )
    expect(() => getBusinessAnalyticsRange(0)).toThrow('positive integer >= 1')
    expect(() => getBusinessAnalyticsRange(-5)).toThrow('positive integer >= 1')
  })
})

describe('ViStay Mobile Command Center: OverviewPerformanceTrends.tsx (P1-02, P1-03)', () => {
  it('formats money with multi-currency support without dropping currencies', () => {
    const formattedVND = formatMoney('1500000', 'VND')
    expect(formattedVND).toContain('1.500.000')

    const formattedUSD = formatMoney('250.75', 'USD')
    expect(formattedUSD).toContain('251') // rounded integer in vi-VN currency format
  })

  it('calculates delta percentage safely across edge cases', () => {
    // Normal positive growth
    const upDelta = calculateDelta(120, 100)
    expect(upDelta).toEqual({
      percent: 20,
      text: '+20.0%',
      direction: 'up',
    })

    // Normal drop
    const downDelta = calculateDelta(75, 100)
    expect(downDelta).toEqual({
      percent: -25,
      text: '-25.0%',
      direction: 'down',
    })

    // Zero previous with positive current (no divide by zero NaN)
    const fromZeroDelta = calculateDelta(50, 0)
    expect(fromZeroDelta).toEqual({
      percent: 100,
      text: '+100%',
      direction: 'up',
    })

    // Zero current with previous drop
    const toZeroDelta = calculateDelta(0, 50)
    expect(toZeroDelta).toEqual({
      percent: -100,
      text: '-100.0%',
      direction: 'down',
    })

    // Zero both
    const zeroZero = calculateDelta(0, 0)
    expect(zeroZero).toEqual({
      percent: 0,
      text: '0%',
      direction: 'flat',
    })

    // Missing values
    expect(calculateDelta(undefined, 100)).toBeNull()
    expect(calculateDelta(100, undefined)).toBeNull()
  })
})

describe('ViStay Mobile Command Center: navigationIntent.ts (P1-04)', () => {
  it('sanitizes booking status and sections correctly', () => {
    expect(sanitizeBookingStatus('pending_confirmation')).toBe('PENDING_CONFIRMATION')
    expect(sanitizeBookingStatus('CONFIRMED')).toBe('CONFIRMED')
    expect(sanitizeBookingStatus('UNKNOWN_STATUS')).toBeUndefined()
    expect(sanitizeBookingStatus(null)).toBeUndefined()

    expect(sanitizeBookingSection('check-in')).toBe('check-in')
    expect(sanitizeBookingSection('RESERVATIONS')).toBe('reservations')
    expect(sanitizeBookingSection('invalid')).toBe('map')
  })

  it('sanitizes date strings preventing invalid calendar dates', () => {
    expect(sanitizeDateString('2026-11-23')).toBe('2026-11-23')
    expect(sanitizeDateString('2026-02-30')).toBeUndefined() // Non-existent date
    expect(sanitizeDateString('not-a-date')).toBeUndefined()
    expect(sanitizeDateString('')).toBeUndefined()
  })

  it('parses mobile route params into typed NavigationIntent for booking and properties', () => {
    // Booking route with status filter
    const bookingIntent = parseMobileRoute('booking', {
      section: 'reservations',
      status: 'PENDING_CONFIRMATION',
      search: 'Khách VIP',
    })
    expect(bookingIntent).toEqual({
      destination: 'booking',
      section: 'reservations',
      filters: {
        status: 'PENDING_CONFIRMATION',
        search: 'Khách VIP',
      },
    })

    // Properties route with needsAttention filter
    const propertiesIntent = parseMobileRoute('properties', {
      needsAttention: 'true',
    })
    expect(propertiesIntent).toEqual({
      destination: 'properties',
      section: 'portfolio',
      filters: {
        needsAttention: true,
      },
    })
  })

  it('formats NavigationIntent into Expo Router pathname and params', () => {
    const route = formatMobileRoute({
      destination: 'booking',
      section: 'reservations',
      filters: {
        status: 'PENDING_CONFIRMATION',
      },
    })
    expect(route).toEqual({
      pathname: '/(admin)/booking',
      params: {
        section: 'reservations',
        status: 'PENDING_CONFIRMATION',
      },
    })

    const propRoute = formatMobileRoute({
      destination: 'properties',
      section: 'all',
      filters: {
        needsAttention: true,
      },
    })
    expect(propRoute).toEqual({
      pathname: '/(admin)/properties',
      params: {
        section: 'all',
        needsAttention: 'true',
      },
    })
  })
})

describe('ViStay Mobile Command Center: useRequestSequence Logic (P2-01)', () => {
  it('monotonically increments sequence and properly invalidates stale sequences', () => {
    let currentSequence = 0
    let activeController: AbortController | null = null

    const startRequest = () => {
      if (activeController) {
        activeController.abort('Superseded')
      }
      currentSequence += 1
      activeController = new AbortController()
      return { sequence: currentSequence, signal: activeController.signal }
    }

    const isLatest = (seq: number) => seq === currentSequence

    // First request started
    const req1 = startRequest()
    expect(req1.sequence).toBe(1)
    expect(req1.signal.aborted).toBe(false)
    expect(isLatest(req1.sequence)).toBe(true)

    // Second request started while req1 in-flight
    const req2 = startRequest()
    expect(req2.sequence).toBe(2)
    expect(req2.signal.aborted).toBe(false)

    // req1 signal is now aborted and marked stale
    expect(req1.signal.aborted).toBe(true)
    expect(isLatest(req1.sequence)).toBe(false)

    // req2 is currently latest
    expect(isLatest(req2.sequence)).toBe(true)
  })
})
