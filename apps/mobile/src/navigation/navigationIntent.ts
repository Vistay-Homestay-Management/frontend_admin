export const VALID_BOOKING_STATUSES = [
  'PENDING_CONFIRMATION',
  'HELD',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'EXPIRED',
] as const

export type BookingStatus = typeof VALID_BOOKING_STATUSES[number]

export const VALID_BOOKING_SECTIONS = ['map', 'reservations', 'check-in', 'check-out'] as const
export type BookingSection = typeof VALID_BOOKING_SECTIONS[number]

export const VALID_PROPERTY_SECTIONS = ['portfolio', 'owned', 'leased', 'management', 'contracts', 'all'] as const
export type PropertySection = typeof VALID_PROPERTY_SECTIONS[number]

export const VALID_USER_SECTIONS = ['customers', 'staff', 'hosts'] as const
export type UserSection = typeof VALID_USER_SECTIONS[number]

export const VALID_ANALYTICS_SECTIONS = ['overview', 'operations'] as const
export type AnalyticsSection = typeof VALID_ANALYTICS_SECTIONS[number]

export type NavigationIntent =
  | {
      destination: 'booking'
      section: BookingSection
      action?: 'create'
      filters?: {
        status?: BookingStatus
        checkInDate?: string // YYYY-MM-DD
        checkOutDate?: string // YYYY-MM-DD
        search?: string
      }
    }
  | {
      destination: 'properties'
      section: PropertySection
      filters?: {
        needsAttention?: boolean
        search?: string
      }
    }
  | {
      destination: 'users'
      section: UserSection
      filters?: {
        search?: string
      }
    }
  | {
      destination: 'analytics'
      section: AnalyticsSection
    }

export function sanitizeBookingStatus(raw?: string | null): BookingStatus | undefined {
  if (!raw) return undefined
  const upper = raw.trim().toUpperCase()
  return (VALID_BOOKING_STATUSES as readonly string[]).includes(upper)
    ? (upper as BookingStatus)
    : undefined
}

export function sanitizeBookingSection(raw?: string | null): BookingSection {
  if (!raw) return 'map'
  const lower = raw.trim().toLowerCase()
  return (VALID_BOOKING_SECTIONS as readonly string[]).includes(lower)
    ? (lower as BookingSection)
    : 'map'
}

export function sanitizeDateString(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }
  return trimmed
}

/**
 * Parses Mobile Expo Router route and params into a typed NavigationIntent.
 */
export function parseMobileRoute(
  pathname: string,
  params: Record<string, string | string[] | undefined> = {}
): NavigationIntent | null {
  const normalizedPath = pathname.replace(/^\/?(\(admin\)|admin)?\/?/, '')
  const firstParam = (val?: string | string[]) => (Array.isArray(val) ? val[0] : val)

  if (normalizedPath === 'booking' || normalizedPath === '') {
    const section = sanitizeBookingSection(firstParam(params.section))
    const actionRaw = firstParam(params.action)
    const action = actionRaw === 'create' ? ('create' as const) : undefined
    const status = sanitizeBookingStatus(firstParam(params.status))
    const checkInDate = sanitizeDateString(firstParam(params.checkInDate))
    const checkOutDate = sanitizeDateString(firstParam(params.checkOutDate))
    const search = firstParam(params.search)?.trim() || undefined

    const hasFilters = Boolean(status || checkInDate || checkOutDate || search)

    return {
      destination: 'booking',
      section,
      ...(action ? { action } : {}),
      ...(hasFilters ? { filters: { status, checkInDate, checkOutDate, search } } : {}),
    }
  }

  if (normalizedPath === 'properties') {
    const rawSection = firstParam(params.section)
    const section: PropertySection = (VALID_PROPERTY_SECTIONS as readonly string[]).includes(rawSection || '')
      ? (rawSection as PropertySection)
      : 'portfolio'
    const needsAttention = firstParam(params.needsAttention) === 'true'
    const search = firstParam(params.search)?.trim() || undefined
    const hasFilters = needsAttention || Boolean(search)

    return {
      destination: 'properties',
      section,
      ...(hasFilters ? { filters: { needsAttention: needsAttention || undefined, search } } : {}),
    }
  }

  if (normalizedPath === 'users') {
    const rawSection = firstParam(params.section)
    const section: UserSection = (VALID_USER_SECTIONS as readonly string[]).includes(rawSection || '')
      ? (rawSection as UserSection)
      : 'customers'
    const search = firstParam(params.search)?.trim() || undefined

    return {
      destination: 'users',
      section,
      ...(search ? { filters: { search } } : {}),
    }
  }

  if (normalizedPath === 'overview' || normalizedPath === 'analytics') {
    const rawSection = firstParam(params.section)
    const section: AnalyticsSection = (VALID_ANALYTICS_SECTIONS as readonly string[]).includes(rawSection || '')
      ? (rawSection as AnalyticsSection)
      : 'overview'

    return {
      destination: 'analytics',
      section,
    }
  }

  return null
}

/**
 * Formats a NavigationIntent into Expo Router pathname and params.
 */
export function formatMobileRoute(intent: NavigationIntent): {
  pathname: '/(admin)/booking' | '/(admin)/properties' | '/(admin)/users' | '/(admin)/overview'
  params: Record<string, string>
} {
  const params: Record<string, string> = {}

  if (intent.destination === 'booking') {
    params.section = intent.section
    if (intent.action) params.action = intent.action
    if (intent.filters?.status) params.status = intent.filters.status
    if (intent.filters?.checkInDate) params.checkInDate = intent.filters.checkInDate
    if (intent.filters?.checkOutDate) params.checkOutDate = intent.filters.checkOutDate
    if (intent.filters?.search) params.search = intent.filters.search
    return { pathname: '/(admin)/booking', params }
  }

  if (intent.destination === 'properties') {
    params.section = intent.section
    if (intent.filters?.needsAttention) params.needsAttention = 'true'
    if (intent.filters?.search) params.search = intent.filters.search
    return { pathname: '/(admin)/properties', params }
  }

  if (intent.destination === 'users') {
    params.section = intent.section
    if (intent.filters?.search) params.search = intent.filters.search
    return { pathname: '/(admin)/users', params }
  }

  if (intent.destination === 'analytics') {
    params.section = intent.section
    return { pathname: '/(admin)/overview', params }
  }

  return { pathname: '/(admin)/overview', params }
}
