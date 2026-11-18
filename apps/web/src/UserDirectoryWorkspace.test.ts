import { describe, expect, it } from 'vitest'
import { formatVietnameseDateInput, isoDateFromVietnamese } from './UserDirectoryWorkspace'

describe('Vietnamese profile date input', () => {
  it('formats typed digits in day/month/year order', () => {
    expect(formatVietnameseDateInput('31121990')).toBe('31/12/1990')
    expect(formatVietnameseDateInput('31/12/1990')).toBe('31/12/1990')
  })

  it('converts a valid display date to the API ISO date', () => {
    expect(isoDateFromVietnamese('29/02/2024')).toBe('2024-02-29')
  })

  it('rejects impossible and ambiguous dates', () => {
    expect(isoDateFromVietnamese('31/02/2024')).toBeNull()
    expect(isoDateFromVietnamese('01/02/24')).toBeNull()
  })
})
