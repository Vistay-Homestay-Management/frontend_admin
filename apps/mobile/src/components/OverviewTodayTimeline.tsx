import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { type OverviewBookingAnalytics } from '@vistay/admin-api-client'
import { SectionHeading, Surface } from '../ui/primitives'
import { palette, radii } from '../ui/theme'
import { formatMobileRoute } from '../navigation/navigationIntent'
import { formatBusinessDate, BUSINESS_TIME_ZONE } from '../utils/businessDate'

export interface OverviewTodayTimelineProps {
  todayData?: OverviewBookingAnalytics['today']
  loading: boolean
  businessTodayDate?: string
}

function formatDisplayCount(value: number | undefined, loading: boolean): string {
  if (loading && value === undefined) return '...'
  if (value === undefined) return '—'
  return new Intl.NumberFormat('vi-VN').format(value)
}

export function OverviewTodayTimeline({
  todayData,
  loading,
  businessTodayDate,
}: OverviewTodayTimelineProps) {
  const router = useRouter()

  const todayStr =
    businessTodayDate || formatBusinessDate(new Date(), BUSINESS_TIME_ZONE)

  const navigateToSection = (
    section: 'check-in' | 'check-out' | 'reservations',
    status?: 'CHECKED_IN' | 'PENDING_CONFIRMATION'
  ) => {
    const route = formatMobileRoute({
      destination: 'booking',
      section,
      filters: status ? { status } : undefined,
    })
    router.push({
      pathname: route.pathname,
      params: route.params,
    })
  }

  const checkIns = formatDisplayCount(todayData?.expectedCheckIns, loading)
  const checkOuts = formatDisplayCount(todayData?.expectedCheckOuts, loading)
  const inHouse = formatDisplayCount(todayData?.inHouse, loading)
  const pending = formatDisplayCount(todayData?.pendingConfirmation, loading)
  const cancelled = formatDisplayCount(todayData?.cancelledToday, loading)

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <SectionHeading
          title="Tiến trình hôm nay (Today's Timeline)"
          caption={`Dữ liệu điều hành vận hành ngày ${todayStr} (GMT+7).`}
        />
      </View>

      <View style={styles.metricRow}>
        <Pressable
          onPress={() => navigateToSection('check-in')}
          style={({ pressed }) => [
            styles.statCard,
            styles.checkInCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.statIconBox}>
            <Ionicons color={palette.leaf} name="log-in-outline" size={18} />
          </View>
          <Text style={styles.statValue}>{checkIns}</Text>
          <Text style={styles.statLabel}>Dự kiến check-in</Text>
          <View style={styles.statBadge}>
            <Text style={styles.badgeText}>Mở danh sách</Text>
            <Ionicons color={palette.leaf} name="chevron-forward" size={10} />
          </View>
        </Pressable>

        <Pressable
          onPress={() => navigateToSection('check-out')}
          style={({ pressed }) => [
            styles.statCard,
            styles.checkOutCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.statIconBox}>
            <Ionicons color="#3468C0" name="log-out-outline" size={18} />
          </View>
          <Text style={styles.statValue}>{checkOuts}</Text>
          <Text style={styles.statLabel}>Dự kiến check-out</Text>
          <View style={styles.statBadge}>
            <Text style={[styles.badgeText, { color: '#3468C0' }]}>Mở danh sách</Text>
            <Ionicons color="#3468C0" name="chevron-forward" size={10} />
          </View>
        </Pressable>

        <Pressable
          onPress={() => navigateToSection('reservations', 'CHECKED_IN')}
          style={({ pressed }) => [
            styles.statCard,
            styles.inHouseCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.statIconBox}>
            <Ionicons color={palette.evergreen} name="bed-outline" size={18} />
          </View>
          <Text style={styles.statValue}>{inHouse}</Text>
          <Text style={styles.statLabel}>Đang lưu trú</Text>
          <View style={styles.statBadge}>
            <Text style={styles.badgeText}>Mở danh mục</Text>
            <Ionicons color={palette.evergreen} name="chevron-forward" size={10} />
          </View>
        </Pressable>
      </View>

      <Surface>
        <Pressable
          onPress={() => navigateToSection('reservations', 'PENDING_CONFIRMATION')}
          style={({ pressed }) => [styles.summaryRow, pressed && styles.pressed]}
        >
          <View style={styles.rowLeft}>
            <Ionicons color={palette.warning} name="time-outline" size={16} />
            <Text style={styles.rowLabel}>Chờ xác nhận trong ngày</Text>
          </View>
          <View style={styles.rowRight}>
            <Text
              style={[
                styles.rowValue,
                Boolean(todayData?.pendingConfirmation) && styles.alertValue,
              ]}
            >
              {pending}
            </Text>
            <Ionicons color={palette.muted} name="chevron-forward" size={14} />
          </View>
        </Pressable>

        <View style={styles.summaryRow}>
          <View style={styles.rowLeft}>
            <Ionicons color={palette.danger} name="close-circle-outline" size={16} />
            <Text style={styles.rowLabel}>Hủy booking trong ngày</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>{cancelled}</Text>
          </View>
        </View>

        {todayData?.occupiedProperties !== undefined && (
          <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
            <View style={styles.rowLeft}>
              <Ionicons color={palette.ink} name="home-outline" size={16} />
              <Text style={styles.rowLabel}>Căn có khách hôm nay</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>
                {formatDisplayCount(todayData.occupiedProperties, loading)}
              </Text>
            </View>
          </View>
        )}
      </Surface>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    minHeight: 106,
    padding: 10,
    borderRadius: radii.medium,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    justifyContent: 'space-between',
  },
  checkInCard: { borderLeftWidth: 3, borderLeftColor: palette.leaf },
  checkOutCard: { borderLeftWidth: 3, borderLeftColor: '#3468C0' },
  inHouseCard: { borderLeftWidth: 3, borderLeftColor: palette.evergreen },
  statIconBox: { width: 26, height: 26, justifyContent: 'center' },
  statValue: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  statLabel: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  badgeText: {
    color: palette.evergreen,
    fontSize: 9,
    fontWeight: '700',
  },
  summaryRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowLabel: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '500',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowValue: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  alertValue: {
    color: palette.warning,
  },
  pressed: { opacity: 0.7 },
})
