import { useCallback, useEffect, useState } from 'react'
import { fetch as expoFetch } from 'expo/fetch'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  fetchAdminBookings,
  fetchOverviewDashboard,
  type AdminBookingRecord,
  type OverviewDashboardData,
  type OverviewView,
} from '@vistay/admin-api-client'
import { useAdmin } from '../../AdminContext'
import {
  LoadState,
  PageHeading,
  Segmented,
  Surface,
  pageStyles,
  useWorkspaceScrollGate,
} from '../../ui/primitives'
import { palette } from '../../ui/theme'
import { OverviewActionHub } from '../../components/OverviewActionHub'
import { OverviewTodayTimeline } from '../../components/OverviewTodayTimeline'
import { OverviewPerformanceTrends, formatMoney } from '../../components/OverviewPerformanceTrends'
import { OverviewAssetHealth } from '../../components/OverviewAssetHealth'
import { useRequestSequence } from '../../hooks/useRequestSequence'
import {
  BUSINESS_TIME_ZONE,
  formatBusinessDate,
  getBusinessAnalyticsRange,
  getPreviousAnalyticsRange,
} from '../../utils/businessDate'

const mobileFetch = expoFetch as typeof globalThis.fetch

function formatInteger(value: number | undefined): string {
  if (value === undefined) return '—'
  return new Intl.NumberFormat('vi-VN').format(value)
}

export default function OverviewScreen() {
  const { accessToken, config, viewer } = useAdmin()
  const [view, setView] = useState<OverviewView>('SYSTEM')
  const [days, setDays] = useState<'7' | '30' | '90'>('30')

  // Dashboard analytics data for current and previous period
  const [currentData, setCurrentData] = useState<OverviewDashboardData>()
  const [previousData, setPreviousData] = useState<OverviewDashboardData>()

  // Action triage queue
  const [pendingBookings, setPendingBookings] = useState<AdminBookingRecord[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState<string>()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const scrollGate = useWorkspaceScrollGate()
  const { startRequest, isLatest } = useRequestSequence()

  const canReadAnalytics = viewer.permissions.includes('analytics:read')
  const canReadFinance = viewer.permissions.includes('finance:read')
  const canReadBookings = viewer.permissions.includes('booking:read')

  // Load Action Hub pending bookings
  const loadPendingQueue = useCallback(async (signal?: AbortSignal) => {
    if (!canReadBookings) return
    setPendingLoading(true)
    setPendingError(undefined)
    try {
      const records = await fetchAdminBookings(
        config.graphqlUrl,
        accessToken,
        { status: 'PENDING_CONFIRMATION', limit: 10 },
        signal,
        mobileFetch
      )
      setPendingBookings(records)
    } catch (err) {
      if (signal?.aborted) return
      setPendingError(
        err instanceof Error ? err.message : 'Không thể tải danh sách chờ xác nhận.'
      )
    } finally {
      setPendingLoading(false)
    }
  }, [accessToken, canReadBookings, config.graphqlUrl])

  // Load main overview dashboard with race-condition guard and GMT+7 timezone ranges
  const loadDashboard = useCallback(async () => {
    if (!canReadAnalytics) {
      setError('Tài khoản cần quyền analytics:read để mở Tổng quan Điều hành.')
      setLoading(false)
      return
    }

    const { sequence, signal } = startRequest()
    setLoading(true)
    setError(undefined)

    try {
      const currentRange = getBusinessAnalyticsRange(Number(days), new Date(), BUSINESS_TIME_ZONE)
      const previousRange = getPreviousAnalyticsRange(Number(days), new Date(), BUSINESS_TIME_ZONE)

      const [currentRes, previousRes] = await Promise.all([
        fetchOverviewDashboard(
          config.graphqlUrl,
          accessToken,
          {
            view,
            ...currentRange,
            includeProperty: view === 'SYSTEM',
            includeFinance: view === 'SYSTEM' && canReadFinance,
          },
          mobileFetch
        ),
        fetchOverviewDashboard(
          config.graphqlUrl,
          accessToken,
          {
            view,
            ...previousRange,
            includeProperty: false,
            includeFinance: false,
          },
          mobileFetch
        ),
        loadPendingQueue(signal),
      ])

      if (!isLatest(sequence)) return

      setCurrentData(currentRes)
      setPreviousData(previousRes)
    } catch (reason) {
      if (signal.aborted || !isLatest(sequence)) return
      setError(
        reason instanceof Error ? reason.message : 'Không thể tải Tổng quan Điều hành.'
      )
    } finally {
      if (isLatest(sequence)) {
        setLoading(false)
      }
    }
  }, [
    accessToken,
    canReadAnalytics,
    canReadFinance,
    config.graphqlUrl,
    days,
    isLatest,
    loadPendingQueue,
    startRequest,
    view,
  ])

  useEffect(() => {
    void Promise.resolve().then(loadDashboard)
  }, [loadDashboard])

  const handleBookingConfirmed = (confirmed: AdminBookingRecord) => {
    setPendingBookings((current) => current.filter((b) => b.id !== confirmed.id))
    void loadDashboard()
  }

  const todayBusinessStr = formatBusinessDate(new Date(), BUSINESS_TIME_ZONE)

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          enabled={scrollGate.refreshEnabled}
          refreshing={loading && Boolean(currentData)}
          onRefresh={() => void loadDashboard()}
          tintColor={palette.evergreen}
        />
      }
      style={pageStyles.scroll}
      contentContainerStyle={styles.scrollContent}
      stickyHeaderIndices={[1]}
      onScroll={scrollGate.onScroll}
      onTouchStart={scrollGate.onTouchStart}
      onScrollBeginDrag={scrollGate.onScrollBeginDrag}
      onScrollEndDrag={scrollGate.onScrollEndDrag}
      onMomentumScrollEnd={scrollGate.onMomentumScrollEnd}
      scrollEventThrottle={16}
    >
      <View>
        <PageHeading
          eyebrow="Trung tâm Điều hành"
          title="Tổng quan Tác nghiệp"
          detail={`Điều hành tập trung GMT+7 · ${todayBusinessStr}`}
        />
      </View>

      <View style={styles.stickyWorkspace}>
        <View style={styles.stickyRowSpacing}>
          <Segmented
            options={[
              { label: 'Hệ thống', value: 'SYSTEM' },
              { label: 'Cá nhân', value: 'PERSONAL' },
            ]}
            value={view}
            onChange={setView}
          />
        </View>
        <Segmented
          options={[
            { label: '7 ngày', value: '7' },
            { label: '30 ngày', value: '30' },
            { label: '90 ngày', value: '90' },
          ]}
          value={days}
          onChange={setDays}
        />
      </View>

      <View style={styles.body}>
        {loading && !currentData ? (
          <LoadState />
        ) : error ? (
          <LoadState error={error} retry={() => void loadDashboard()} />
        ) : (
          <>
            {/* Subgraph Error Banner (P1-03: Distinguish partial errors) */}
            {currentData?.errors && currentData.errors.length > 0 && (
              <View style={styles.warningBanner}>
                <Text style={styles.warningTitle}>Một số nguồn dữ liệu đang gián đoạn</Text>
                <Text style={styles.warningText}>{currentData.errors.join('\n')}</Text>
              </View>
            )}

            {/* Module A: Action Required Hub */}
            {canReadBookings && (
              <OverviewActionHub
                pendingBookings={pendingBookings}
                loading={pendingLoading}
                error={pendingError}
                graphqlUrl={config.graphqlUrl}
                accessToken={accessToken}
                viewer={viewer}
                onBookingConfirmed={handleBookingConfirmed}
                onRefresh={() => void loadPendingQueue()}
              />
            )}

            {/* Module B: Today's Operations Timeline */}
            <OverviewTodayTimeline
              todayData={currentData?.booking?.today}
              loading={loading}
              businessTodayDate={todayBusinessStr}
            />

            {/* Module C: Performance & Trends (7/30/90 days, Delta%, Multi-currency) */}
            <OverviewPerformanceTrends
              current={currentData?.booking}
              previous={previousData?.booking}
              loading={loading}
              days={days}
              onDaysChange={setDays}
            />

            {/* Module D: Asset Health (Only for SYSTEM view) */}
            {view === 'SYSTEM' && (
              <OverviewAssetHealth
                property={currentData?.property}
                loading={loading}
              />
            )}

            {/* Finance Summary (Only for SYSTEM view with finance:read) */}
            {view === 'SYSTEM' && currentData?.finance && canReadFinance && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Tài chính</Text>
                <Surface>
                  <FinanceRow
                    label="Tổng doanh thu ghi nhận"
                    value={formatMoney(currentData.finance.totalGrossRevenue)}
                  />
                  <FinanceRow
                    label="Hoa hồng nền tảng"
                    value={formatMoney(currentData.finance.totalCommissionEarned)}
                  />
                  <FinanceRow
                    label="Phải thanh toán chủ nhà"
                    value={formatMoney(currentData.finance.totalPayableOutstanding)}
                    alert={Number(currentData.finance.totalPayableOutstanding) > 0}
                  />
                  <FinanceRow
                    label="Đã thanh toán cho đối tác"
                    value={formatMoney(currentData.finance.totalPayablePaid)}
                  />
                  <FinanceRow
                    label="Đối soát đã duyệt"
                    value={`${formatInteger(
                      currentData.finance.approvedSettlementCount
                    )} / ${formatInteger(currentData.finance.totalSettlementCount)} hồ sơ`}
                  />
                </Surface>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  )
}

function FinanceRow({
  label,
  value,
  alert = false,
}: {
  label: string
  value: string
  alert?: boolean
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, alert && styles.rowAlert]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 48,
  },
  stickyWorkspace: {
    zIndex: 4,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: palette.background,
  },
  stickyRowSpacing: { marginBottom: 12 },
  body: { flexGrow: 1, gap: 20 },
  section: { gap: 10 },
  sectionTitle: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  row: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  rowLabel: { color: palette.muted, fontSize: 11 },
  rowValue: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  rowAlert: { color: palette.warning },
  warningBanner: {
    padding: 12,
    gap: 4,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: palette.warning,
    backgroundColor: '#FFF8EF',
  },
  warningTitle: { color: palette.ink, fontSize: 11, fontWeight: '700' },
  warningText: { color: palette.muted, fontSize: 10, lineHeight: 15 },
})
