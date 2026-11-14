import { useCallback, useEffect, useState } from 'react'
import { fetch as expoFetch } from 'expo/fetch'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { fetchOverviewDashboard, type OverviewDashboardData, type OverviewView } from '@vistay/admin-api-client'
import { useAdmin } from '../../AdminContext'
import { LoadState, Metric, PageHeading, SectionHeading, Segmented, Surface, pageStyles } from '../../ui/primitives'
import { palette } from '../../ui/theme'

const mobileFetch = expoFetch as typeof globalThis.fetch

function range(days: number) {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - (days - 1))
  const date = (value: Date) => value.toISOString().slice(0, 10)
  return { from: date(from), to: date(to) }
}

function integer(value: number | undefined) {
  return new Intl.NumberFormat('vi-VN').format(value ?? 0)
}

function money(value: string | undefined, currency = 'VND') {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return value ?? '0'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

export default function OverviewScreen() {
  const { accessToken, config, viewer } = useAdmin()
  const [view, setView] = useState<OverviewView>('SYSTEM')
  const [days, setDays] = useState<'7' | '30' | '90'>('30')
  const [data, setData] = useState<OverviewDashboardData>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const canReadAnalytics = viewer.permissions.includes('analytics:read')
  const canReadFinance = viewer.permissions.includes('finance:read')

  const load = useCallback(async () => {
    if (!canReadAnalytics) {
      setError('Tài khoản cần quyền analytics:read để mở Tổng quan.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      const period = range(Number(days))
      const next = await fetchOverviewDashboard(config.graphqlUrl, accessToken, {
        view,
        ...period,
        includeProperty: view === 'SYSTEM',
        includeFinance: view === 'SYSTEM' && canReadFinance,
      }, mobileFetch)
      setData(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải Tổng quan.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, canReadAnalytics, canReadFinance, config.graphqlUrl, days, view])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const booking = data?.booking
  const revenue = booking?.money[0]
  return <ScrollView
    refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={() => void load()} tintColor={palette.evergreen} />}
    style={pageStyles.scroll}
    contentContainerStyle={pageStyles.content}
  >
    <PageHeading eyebrow="Điều hành" title="Tổng quan" detail="Những chỉ số cần biết ngay, dùng cùng nguồn dữ liệu và quyền truy cập với web admin." />
    <Segmented options={[{ label: 'Hệ thống', value: 'SYSTEM' }, { label: 'Cá nhân', value: 'PERSONAL' }]} value={view} onChange={setView} />
    <Segmented options={[{ label: '7 ngày', value: '7' }, { label: '30 ngày', value: '30' }, { label: '90 ngày', value: '90' }]} value={days} onChange={setDays} />

    {loading && !data ? <LoadState /> : error ? <LoadState error={error} retry={() => void load()} /> : <>
      <View style={pageStyles.grid}>
        <View style={pageStyles.half}><Metric icon="calendar-outline" label="Tổng booking" value={integer(booking?.totalBookings)} /></View>
        <View style={pageStyles.half}><Metric icon="trending-up-outline" label="Doanh thu" value={money(revenue?.revenue, revenue?.currency)} tone="dark" /></View>
        <View style={pageStyles.half}><Metric icon="pie-chart-outline" label="Tỷ lệ lấp đầy" value={`${Number(booking?.occupancyRate ?? 0).toLocaleString('vi-VN')}%`} tone="green" /></View>
        <View style={pageStyles.half}><Metric icon="business-outline" label="Căn đang hoạt động" value={integer(data?.property?.activeProperties ?? booking?.bookedProperties)} /></View>
      </View>

      <View style={styles.section}>
        <SectionHeading title="Hôm nay" caption="Luồng khách và booking cần theo dõi." />
        <Surface>
          <Row label="Dự kiến check-in" value={integer(booking?.today.expectedCheckIns)} />
          <Row label="Dự kiến check-out" value={integer(booking?.today.expectedCheckOuts)} />
          <Row label="Đang lưu trú" value={integer(booking?.today.inHouse)} />
          <Row label="Chờ xác nhận" value={integer(booking?.today.pendingConfirmation)} alert={Boolean(booking?.today.pendingConfirmation)} />
          <Row label="Bị hủy hôm nay" value={integer(booking?.today.cancelledToday)} />
        </Surface>
      </View>

      {view === 'SYSTEM' && data?.property ? <View style={styles.section}>
        <SectionHeading title="Tài sản" caption="Tình trạng vận hành của danh mục căn." />
        <View style={pageStyles.grid}>
          <View style={pageStyles.half}><Metric label="Đang hoạt động" value={integer(data.property.activeProperties)} /></View>
          <View style={pageStyles.half}><Metric label="Đang bảo trì" value={integer(data.property.maintenanceProperties)} /></View>
          <View style={pageStyles.half}><Metric label="Cần xử lý" value={integer(data.property.propertiesNeedingAttention)} tone="green" /></View>
        </View>
      </View> : null}

      {view === 'SYSTEM' && data?.finance ? <View style={styles.section}>
        <SectionHeading title="Tài chính" caption="Chỉ hiển thị khi có quyền finance:read." />
        <Surface>
          <Row label="Tổng doanh thu" value={money(data.finance.totalGrossRevenue)} />
          <Row label="Phải thanh toán" value={money(data.finance.totalPayableOutstanding)} alert={Number(data.finance.totalPayableOutstanding) > 0} />
          <Row label="Đã thanh toán" value={money(data.finance.totalPayablePaid)} />
          <Row label="Đối soát đã duyệt" value={`${integer(data.finance.approvedSettlementCount)} / ${integer(data.finance.totalSettlementCount)}`} />
        </Surface>
      </View> : null}

      {data?.errors.length ? <View style={styles.warning}><Text style={styles.warningTitle}>Một số nguồn đang gián đoạn</Text><Text style={styles.warningText}>{data.errors.join('\n')}</Text></View> : null}
    </>}
  </ScrollView>
}

function Row({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={[styles.rowValue, alert && styles.rowAlert]}>{value}</Text></View>
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  row: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  rowLabel: { color: palette.muted, fontSize: 11 },
  rowValue: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  rowAlert: { color: palette.warning },
  warning: { padding: 13, gap: 4, borderLeftWidth: 3, borderLeftColor: palette.warning, backgroundColor: '#FFF8EF' },
  warningTitle: { color: palette.ink, fontSize: 11, fontWeight: '700' },
  warningText: { color: palette.muted, fontSize: 10, lineHeight: 15 },
})
