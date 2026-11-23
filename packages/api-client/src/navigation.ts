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

export const VALID_PROPERTY_SECTIONS = ['portfolio', 'owned', 'leased', 'management', 'contracts'] as const
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
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined
}

/**
 * Parses Web hash like:
 * #inventory?section=reservations&status=PENDING_CONFIRMATION&action=create
 */
export function parseWebHash(hash: string): NavigationIntent | null {
  if (!hash) return null
  const cleaned = hash.replace(/^#/, '').trim()
  if (!cleaned) return null

  const [rawRoute, rawQuery] = cleaned.split('?')
  const params = new URLSearchParams(rawQuery || '')

  if (rawRoute === 'inventory' || rawRoute === 'booking') {
    const section = sanitizeBookingSection(params.get('section'))
    const actionRaw = params.get('action')
    const action = actionRaw === 'create' ? ('create' as const) : undefined
    const status = sanitizeBookingStatus(params.get('status'))
    const checkInDate = sanitizeDateString(params.get('checkInDate'))
    const checkOutDate = sanitizeDateString(params.get('checkOutDate'))
    const search = params.get('search')?.trim() || undefined

    const hasFilters = Boolean(status || checkInDate || checkOutDate || search)

    return {
      destination: 'booking',
      section,
      ...(action ? { action } : {}),
      ...(hasFilters ? { filters: { status, checkInDate, checkOutDate, search } } : {}),
    }
  }

  if (rawRoute === 'management' || rawRoute === 'properties') {
    const rawSection = params.get('section')
    const section: PropertySection = (VALID_PROPERTY_SECTIONS as readonly string[]).includes(rawSection || '')
      ? (rawSection as PropertySection)
      : 'portfolio'
    const needsAttention = params.get('needsAttention') === 'true'
    const search = params.get('search')?.trim() || undefined
    const hasFilters = needsAttention || Boolean(search)

    return {
      destination: 'properties',
      section,
      ...(hasFilters ? { filters: { needsAttention: needsAttention || undefined, search } } : {}),
    }
  }

  if (rawRoute === 'users') {
    const rawSection = params.get('section')
    const section: UserSection = (VALID_USER_SECTIONS as readonly string[]).includes(rawSection || '')
      ? (rawSection as UserSection)
      : 'customers'
    const search = params.get('search')?.trim() || undefined

    return {
      destination: 'users',
      section,
      ...(search ? { filters: { search } } : {}),
    }
  }

  if (rawRoute === 'analytics') {
    const rawSection = params.get('section')
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
 * Formats a NavigationIntent into a Web Hash URI component.
 */
export function formatWebHash(intent: NavigationIntent): string {
  const params = new URLSearchParams()

  if (intent.destination === 'booking') {
    params.set('section', intent.section)
    if (intent.action) params.set('action', intent.action)
    if (intent.filters?.status) params.set('status', intent.filters.status)
    if (intent.filters?.checkInDate) params.set('checkInDate', intent.filters.checkInDate)
    if (intent.filters?.checkOutDate) params.set('checkOutDate', intent.filters.checkOutDate)
    if (intent.filters?.search) params.set('search', intent.filters.search)
    const qs = params.toString()
    return qs ? `#inventory?${qs}` : '#inventory'
  }

  if (intent.destination === 'properties') {
    params.set('section', intent.section)
    if (intent.filters?.needsAttention) params.set('needsAttention', 'true')
    if (intent.filters?.search) params.set('search', intent.filters.search)
    const qs = params.toString()
    return qs ? `#management?${qs}` : '#management'
  }

  if (intent.destination === 'users') {
    params.set('section', intent.section)
    if (intent.filters?.search) params.set('search', intent.filters.search)
    const qs = params.toString()
    return qs ? `#users?${qs}` : '#users'
  }

  if (intent.destination === 'analytics') {
    params.set('section', intent.section)
    const qs = params.toString()
    return qs ? `#analytics?${qs}` : '#analytics'
  }

  return '#overview'
}

/**
 * Parses Mobile Expo Router route and params.
 */
export function parseMobileRoute(
  pathname: string,
  params: Record<string, string | string[] | undefined> = {}
): NavigationIntent | null {
  const normalizedPath = pathname.replace(/^\/(admin)?\/?/, '')
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

  return null
}

/**
 * Formats a NavigationIntent into Expo Router pathname and params.
 */
export function formatMobileRoute(intent: NavigationIntent): {
  pathname: string
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
    return { pathname: '/booking', params }
  }

  if (intent.destination === 'properties') {
    params.section = intent.section
    if (intent.filters?.needsAttention) params.needsAttention = 'true'
    if (intent.filters?.search) params.search = intent.filters.search
    return { pathname: '/properties', params }
  }

  if (intent.destination === 'users') {
    params.section = intent.section
    if (intent.filters?.search) params.search = intent.filters.search
    return { pathname: '/users', params }
  }

  return { pathname: '/overview', params }
}
