export interface CalendarDateParts {
  year: number
  month: number
  day: number
}

/**
 * Extracts year, month, day components in a given IANA timezone.
 * Throws error if date is invalid or parts cannot be resolved.
 */
export function getTimezoneDateParts(
  date: Date,
  timeZone = 'Asia/Ho_Chi_Minh'
): CalendarDateParts {
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid Date provided: ${String(date)}`)
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const yStr = parts.find((p) => p.type === 'year')?.value
  const mStr = parts.find((p) => p.type === 'month')?.value
  const dStr = parts.find((p) => p.type === 'day')?.value

  if (!yStr || !mStr || !dStr) {
    throw new Error(
      `Failed to extract timezone date parts for timeZone "${timeZone}". Missing component.`
    )
  }

  const year = Number.parseInt(yStr, 10)
  const month = Number.parseInt(mStr, 10)
  const day = Number.parseInt(dStr, 10)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(
      `Extracted date parts are not valid integers: ${yStr}-${mStr}-${dStr}`
    )
  }

  return { year, month, day }
}

/**
 * Formats a Date object to YYYY-MM-DD in the specified business timezone.
 */
export function formatBusinessDate(
  date: Date,
  timeZone = 'Asia/Ho_Chi_Minh'
): string {
  const { year, month, day } = getTimezoneDateParts(date, timeZone)
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/**
 * Shifts calendar dates by a delta of whole days using UTC date projection
 * to safely navigate leap years, month ends, and year boundaries.
 */
export function addCalendarDays(
  parts: CalendarDateParts,
  deltaDays: number
): CalendarDateParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

export function formatCalendarParts(parts: CalendarDateParts): string {
  const mm = String(parts.month).padStart(2, '0')
  const dd = String(parts.day).padStart(2, '0')
  return `${parts.year}-${mm}-${dd}`
}

/**
 * Calculates a half-open analytics range [fromInclusive, toExclusive).
 *
 * Backend expects:
 * - `from`: YYYY-MM-DD inclusive
 * - `to`: YYYY-MM-DD exclusive (e.g., tomorrow at 00:00 UTC)
 *
 * Days parameter must be a positive integer >= 1.
 */
export function getBusinessAnalyticsRange(
  days: number,
  now: Date = new Date(),
  timeZone = 'Asia/Ho_Chi_Minh'
): { from: string; to: string } {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`Range days must be a positive integer >= 1. Received: ${days}`)
  }

  const todayParts = getTimezoneDateParts(now, timeZone)

  // toExclusive is tomorrow in target timezone
  const toParts = addCalendarDays(todayParts, 1)
  const to = formatCalendarParts(toParts)

  // fromInclusive is (days - 1) days prior to today
  const fromParts = addCalendarDays(todayParts, -(days - 1))
  const from = formatCalendarParts(fromParts)

  return { from, to }
}
