import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { type OverviewBookingAnalytics } from '@vistay/admin-api-client'
import { SectionHeading, Surface } from '../ui/primitives'
import { palette, radii } from '../ui/theme'

export interface OverviewPerformanceTrendsProps {
  current?: OverviewBookingAnalytics | null
  previous?: OverviewBookingAnalytics | null
  loading: boolean
  days: '7' | '30' | '90'
  onDaysChange: (nextDays: '7' | '30' | '90') => void
}

/**
 * Calculates percentage change between current and previous values safely.
 * Returns null if calculation is not applicable.
 */
export function calculateDelta(
  currentVal: number | undefined,
  previousVal: number | undefined
): { percent: number; text: string; direction: 'up' | 'down' | 'flat' } | null {
  if (currentVal === undefined || previousVal === undefined) return null

  if (previousVal === 0 && currentVal === 0) {
    return { percent: 0, text: '0%', direction: 'flat' }
  }

  if (previousVal === 0 && currentVal > 0) {
    return { percent: 100, text: '+100%', direction: 'up' }
  }

  if (previousVal === 0 && currentVal < 0) {
    return { percent: -100, text: '-100%', direction: 'down' }
  }

  const delta = ((currentVal - previousVal) / Math.abs(previousVal)) * 100
  if (!Number.isFinite(delta)) return null

  const formatted = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`
  return {
    percent: delta,
    text: formatted,
    direction: delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat',
  }
}

export function formatMoney(value: string | number | undefined, currency = 'VND'): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return String(value ?? '—')
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function OverviewPerformanceTrends({
  current,
  previous,
  loading,
}: OverviewPerformanceTrendsProps) {
  const currentTotal = current?.totalBookings
  const previousTotal = previous?.totalBookings
  const totalBookingsDelta = calculateDelta(currentTotal, previousTotal)

  const currentConfirmed = current?.confirmedBookings
  const previousConfirmed = previous?.confirmedBookings
  const confirmedDelta = calculateDelta(currentConfirmed, previousConfirmed)

  const currentOccupancy = current?.occupancyRate ? Number(current.occupancyRate) : undefined
  const previousOccupancy = previous?.occupancyRate ? Number(previous.occupancyRate) : undefined
  const occupancyDelta =
    currentOccupancy !== undefined && previousOccupancy !== undefined
      ? currentOccupancy - previousOccupancy
      : null

  // Multi-currency mapping (Fix P1-02: Never drop currencies)
  const currenciesList = current?.money && current.money.length > 0 ? current.money : []

  return (
    <View style={styles.container}>
      <SectionHeading
        title="Hiệu quả & Xu hướng (Performance & Trends)"
        caption="Chỉ số kinh doanh và so sánh với cùng kỳ trước đó."
      />

      <View style={styles.grid}>
        <View style={styles.cardHalf}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Tổng booking</Text>
            <Text style={styles.metricValue}>
              {loading && currentTotal === undefined
                ? '...'
                : currentTotal !== undefined
                ? new Intl.NumberFormat('vi-VN').format(currentTotal)
                : '—'}
            </Text>
            {totalBookingsDelta ? (
              <View style={styles.deltaBox}>
                <Ionicons
                  color={
                    totalBookingsDelta.direction === 'up'
                      ? palette.leaf
                      : totalBookingsDelta.direction === 'down'
                      ? palette.danger
                      : palette.muted
                  }
                  name={
                    totalBookingsDelta.direction === 'up'
                      ? 'trending-up'
                      : totalBookingsDelta.direction === 'down'
                      ? 'trending-down'
                      : 'remove'
                  }
                  size={12}
                />
                <Text
                  style={[
                    styles.deltaText,
                    totalBookingsDelta.direction === 'up' && styles.deltaUp,
                    totalBookingsDelta.direction === 'down' && styles.deltaDown,
                  ]}
                >
                  {totalBookingsDelta.text} vs kỳ trước
                </Text>
              </View>
            ) : (
              <Text style={styles.deltaMuted}>Chưa đủ dữ liệu kỳ trước</Text>
            )}
          </View>
        </View>

        <View style={styles.cardHalf}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Đã xác nhận</Text>
            <Text style={styles.metricValue}>
              {loading && currentConfirmed === undefined
                ? '...'
                : currentConfirmed !== undefined
                ? new Intl.NumberFormat('vi-VN').format(currentConfirmed)
                : '—'}
            </Text>
            {confirmedDelta ? (
              <View style={styles.deltaBox}>
                <Ionicons
                  color={
                    confirmedDelta.direction === 'up'
                      ? palette.leaf
                      : confirmedDelta.direction === 'down'
                      ? palette.danger
                      : palette.muted
                  }
                  name={
                    confirmedDelta.direction === 'up'
                      ? 'trending-up'
                      : confirmedDelta.direction === 'down'
                      ? 'trending-down'
                      : 'remove'
                  }
                  size={12}
                />
                <Text
                  style={[
                    styles.deltaText,
                    confirmedDelta.direction === 'up' && styles.deltaUp,
                    confirmedDelta.direction === 'down' && styles.deltaDown,
                  ]}
                >
                  {confirmedDelta.text} vs kỳ trước
                </Text>
              </View>
            ) : (
              <Text style={styles.deltaMuted}>Chưa đủ dữ liệu kỳ trước</Text>
            )}
          </View>
        </View>

        <View style={styles.cardHalf}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Tỷ lệ lấp đầy</Text>
            <Text style={[styles.metricValue, { color: palette.evergreen }]}>
              {loading && currentOccupancy === undefined
                ? '...'
                : currentOccupancy !== undefined
                ? `${currentOccupancy.toLocaleString('vi-VN')}%`
                : '—'}
            </Text>
            {occupancyDelta !== null ? (
              <View style={styles.deltaBox}>
                <Ionicons
                  color={
                    occupancyDelta > 0
                      ? palette.leaf
                      : occupancyDelta < 0
                      ? palette.danger
                      : palette.muted
                  }
                  name={
                    occupancyDelta > 0
                      ? 'trending-up'
                      : occupancyDelta < 0
                      ? 'trending-down'
                      : 'remove'
                  }
                  size={12}
                />
                <Text
                  style={[
                    styles.deltaText,
                    occupancyDelta > 0 && styles.deltaUp,
                    occupancyDelta < 0 && styles.deltaDown,
                  ]}
                >
                  {occupancyDelta >= 0 ? '+' : ''}
                  {occupancyDelta.toFixed(1)}% điểm
                </Text>
              </View>
            ) : (
              <Text style={styles.deltaMuted}>Chưa đủ dữ liệu kỳ trước</Text>
            )}
          </View>
        </View>

        <View style={styles.cardHalf}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Đêm phòng đã bán</Text>
            <Text style={styles.metricValue}>
              {loading && current?.occupiedNights === undefined
                ? '...'
                : current?.occupiedNights !== undefined
                ? new Intl.NumberFormat('vi-VN').format(current.occupiedNights)
                : '—'}
            </Text>
            <Text style={styles.deltaMuted}>
              {current?.bookedProperties !== undefined
                ? `trên ${current.bookedProperties} căn được đặt`
                : 'Đang tính toán'}
            </Text>
          </View>
        </View>
      </View>

      {/* Multi-Currency Revenue Breakdown (P1-02: Never drop currencies) */}
      <View style={styles.revenueSection}>
        <Text style={styles.subSectionTitle}>Doanh thu theo loại tiền tệ (Multi-currency)</Text>
        {currenciesList.length === 0 ? (
          <Surface>
            <View style={styles.emptyRevenue}>
              <Text style={styles.emptyRevenueText}>
                {loading ? 'Đang tổng hợp doanh thu...' : 'Chưa phát sinh doanh thu trong kỳ.'}
              </Text>
            </View>
          </Surface>
        ) : (
          <Surface>
            {currenciesList.map((item, idx) => {
              const prevMatch = previous?.money.find((m) => m.currency === item.currency)
              const prevRevenue = prevMatch ? Number(prevMatch.revenue) : undefined
              const currRevenue = Number(item.revenue)
              const revDelta = calculateDelta(currRevenue, prevRevenue)

              return (
                <View
                  key={item.currency}
                  style={[
                    styles.currencyRow,
                    idx < currenciesList.length - 1 && styles.borderBottom,
                  ]}
                >
                  <View style={styles.currencyMeta}>
                    <View style={styles.currencyBadge}>
                      <Text style={styles.currencyBadgeText}>{item.currency}</Text>
                    </View>
                    <View>
                      <Text style={styles.revenueAmount}>
                        {formatMoney(item.revenue, item.currency)}
                      </Text>
                      <Text style={styles.avgBookingValue}>
                        Bình quân:{' '}
                        {formatMoney(item.averageBookingValue, item.currency)}/booking
                      </Text>
                    </View>
                  </View>

                  <View style={styles.currencyDelta}>
                    {revDelta ? (
                      <View style={styles.deltaBox}>
                        <Ionicons
                          color={
                            revDelta.direction === 'up'
                              ? palette.leaf
                              : revDelta.direction === 'down'
                              ? palette.danger
                              : palette.muted
                          }
                          name={
                            revDelta.direction === 'up'
                              ? 'trending-up'
                              : revDelta.direction === 'down'
                              ? 'trending-down'
                              : 'remove'
                          }
                          size={12}
                        />
                        <Text
                          style={[
                            styles.deltaText,
                            revDelta.direction === 'up' && styles.deltaUp,
                            revDelta.direction === 'down' && styles.deltaDown,
                          ]}
                        >
                          {revDelta.text}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.deltaMuted}>—</Text>
                    )}
                  </View>
                </View>
              )
            })}
          </Surface>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardHalf: {
    width: '48.8%',
  },
  metricCard: {
    padding: 12,
    borderRadius: radii.medium,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    gap: 4,
    minHeight: 88,
  },
  metricLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  metricValue: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  deltaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  deltaText: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.muted,
  },
  deltaUp: { color: palette.leaf },
  deltaDown: { color: palette.danger },
  deltaMuted: {
    color: palette.muted,
    fontSize: 9,
    marginTop: 2,
  },
  revenueSection: {
    gap: 6,
    marginTop: 4,
  },
  subSectionTitle: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyRevenue: {
    padding: 14,
    alignItems: 'center',
  },
  emptyRevenueText: {
    color: palette.muted,
    fontSize: 11,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  borderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  currencyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  currencyBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#EAF0E9',
  },
  currencyBadgeText: {
    color: palette.evergreen,
    fontSize: 10,
    fontWeight: '800',
  },
  revenueAmount: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  avgBookingValue: {
    color: palette.muted,
    fontSize: 10,
  },
  currencyDelta: {
    alignItems: 'flex-end',
  },
})
