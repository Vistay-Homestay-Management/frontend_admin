import { useEffect, useMemo, useState } from 'react'
import { ArrowClockwise, Buildings, CalendarCheck, ChartLineUp, CurrencyCircleDollar, DoorOpen, SpinnerGap, UsersThree, WarningCircle } from '@phosphor-icons/react'
import { fetchOperationsAnalytics, type OperationsAnalytics, type BackofficeViewer } from '@vistay/admin-api-client'

type RangeKey = 'today' | 'week' | 'month' | 'quarter'
const rangeDays: Record<RangeKey, number> = { today: 1, week: 7, month: 30, quarter: 90 }
const rangeLabels: Record<RangeKey, string> = { today: 'Hôm nay', week: '7 ngày', month: '30 ngày', quarter: '90 ngày' }

function isoDate(date: Date): string { return date.toISOString().slice(0, 10) }
function rangeInput(key: RangeKey) {
  const to = new Date(); to.setUTCHours(0, 0, 0, 0); to.setUTCDate(to.getUTCDate() + 1)
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - rangeDays[key])
  return { from: isoDate(from), to: isoDate(to) }
}
function money(value: string, currency: string): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value))
}
function points(values: number[]): string {
  if (!values.length) return ''
  const max = Math.max(...values, 1)
  return values.map((value, index) => `${12 + index * (682 / Math.max(values.length - 1, 1))},${194 - value / max * 152}`).join(' ')
}

export function AnalyticsDashboard({ graphqlUrl, accessToken, viewer, compact = false }: {
  graphqlUrl: string; accessToken: string; viewer: BackofficeViewer; compact?: boolean
}) {
  const [range, setRange] = useState<RangeKey>(compact ? 'week' : 'month')
  const [data, setData] = useState<OperationsAnalytics | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const allowed = viewer.permissions.includes('analytics:read')
  async function load() {
    if (!allowed) return
    setLoading(true); setError('')
    try { setData(await fetchOperationsAnalytics(graphqlUrl, accessToken, rangeInput(range))) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tải thống kê') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [range, graphqlUrl, accessToken, allowed])
  const primaryMoney = data?.money.find((item) => item.currency === 'VND') ?? data?.money[0]
  const revenuePoints = useMemo(() => points(data?.series.map((item) => Number(item.revenue)) ?? []), [data])

  if (!allowed) return <section className="analytics-denied"><WarningCircle /><div><h2>Chưa có quyền xem thống kê</h2><p>Role cần grant <code>analytics:read</code> với scope <code>ALL</code>.</p></div></section>
  return <section className={`analytics-dashboard ${compact ? 'compact' : ''}`} aria-labelledby={compact ? 'overview-title' : 'analytics-title'}>
    <header className="analytics-heading"><div><p className="eyebrow">{compact ? 'TỔNG QUAN' : 'ANALYTICS CONTROL ROOM'}</p><h2 id={compact ? 'overview-title' : 'analytics-title'}>{compact ? 'Một nhịp nhìn cho toàn bộ vận hành.' : 'Thống kê vận hành và thương mại.'}</h2><p>Dữ liệu lấy trực tiếp từ Booking Service; khoảng ngày UTC, không dùng số liệu mẫu.</p></div><div className="overview-range" role="tablist">{(Object.keys(rangeDays) as RangeKey[]).filter((key) => !compact || key !== 'quarter').map((key) => <button type="button" role="tab" aria-selected={range === key} className={range === key ? 'active' : ''} key={key} onClick={() => setRange(key)}>{rangeLabels[key]}</button>)}</div></header>
    {loading && !data && <div className="inline-state"><SpinnerGap className="spinner" />Đang tổng hợp dữ liệu…</div>}
    {error && <div className="inline-state error"><WarningCircle /><div><strong>Không tải được thống kê</strong><span>{error}</span></div><button onClick={() => void load()}><ArrowClockwise />Thử lại</button></div>}
    {data && <>
      <div className="analytics-meta">Kỳ {data.from} – {data.to} · cập nhật {new Date(data.generatedAt).toLocaleString('vi-VN')}</div>
      <section className="overview-kpi-grid">
        <article className="overview-kpi-card"><div className="overview-kpi-icon"><CalendarCheck /></div><span>Tổng booking</span><strong>{data.totalBookings.toLocaleString('vi-VN')}</strong><small>{data.confirmedBookings} booking hiệu lực</small></article>
        <article className="overview-kpi-card kpi-guests"><div className="overview-kpi-icon"><UsersThree /></div><span>Lượt khách</span><strong>{data.guests.toLocaleString('vi-VN')}</strong><small>Trong kỳ đã chọn</small></article>
        <article className="overview-kpi-card kpi-revenue"><div className="overview-kpi-icon"><CurrencyCircleDollar /></div><span>Doanh thu {primaryMoney?.currency ?? ''}</span><strong>{primaryMoney ? money(primaryMoney.revenue, primaryMoney.currency) : '—'}</strong><small>{data.money.length > 1 ? `${data.money.length} loại tiền, xem chi tiết bên dưới` : `Giá trị TB ${primaryMoney ? money(primaryMoney.averageBookingValue, primaryMoney.currency) : '—'}`}</small></article>
        <article className="overview-kpi-card kpi-occupancy"><div className="overview-kpi-icon"><DoorOpen /></div><span>Tỷ lệ đêm được đặt</span><strong>{data.occupancyRate}%</strong><small>{data.occupiedNights} đêm · hủy {data.cancellationRate}%</small></article>
      </section>
      <section className="analytics-grid">
        <article className="overview-chart-card analytics-series"><div className="overview-chart-heading"><div><span className="chart-kicker">THEO NGÀY</span><h3>Doanh thu trong kỳ</h3></div><ChartLineUp /></div><svg className="line-chart" viewBox="0 0 706 220" role="img" aria-label="Doanh thu theo ngày">{[42,92,142,194].map(y => <line key={y} x1="12" x2="694" y1={y} y2={y} className="chart-grid-line" />)}<polyline points={revenuePoints} className="chart-line" /></svg><div className="analytics-axis"><span>{data.series[0]?.day}</span><span>{data.series.at(-1)?.day}</span></div></article>
        <article className="overview-chart-card"><div className="overview-chart-heading"><div><span className="chart-kicker">KÊNH</span><h3>Nguồn booking</h3></div><Buildings /></div><div className="analytics-breakdown">{data.channels.map(item => <div key={item.code}><span>{item.code}</span><div><i style={{ width: `${data.totalBookings ? item.bookings / data.totalBookings * 100 : 0}%` }} /></div><strong>{item.bookings}</strong></div>)}</div></article>
        {!compact && <><article className="overview-chart-card"><div className="overview-chart-heading"><div><span className="chart-kicker">TRẠNG THÁI</span><h3>Booking theo trạng thái</h3></div><CalendarCheck /></div><div className="analytics-statuses">{data.statuses.map(item => <div key={item.code}><span>{item.code.replaceAll('_', ' ')}</span><strong>{item.bookings}</strong></div>)}</div></article><article className="overview-chart-card"><div className="overview-chart-heading"><div><span className="chart-kicker">TIỀN TỆ</span><h3>Doanh thu không trộn currency</h3></div><CurrencyCircleDollar /></div><div className="analytics-money">{data.money.length ? data.money.map(item => <div key={item.currency}><span>{item.currency}</span><strong>{money(item.revenue, item.currency)}</strong><small>TB / booking {money(item.averageBookingValue, item.currency)}</small></div>) : <p>Chưa có doanh thu trong kỳ.</p>}</div></article></>}
      </section>
    </>}
  </section>
}
