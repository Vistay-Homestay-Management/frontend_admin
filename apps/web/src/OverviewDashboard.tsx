import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowClockwise, Buildings, CalendarCheck, CalendarMinus, CalendarPlus, CheckCircle,
  ClockCountdown, Coins, CurrencyCircleDollar, DoorOpen, HouseLine, Receipt,
  ShieldWarning, SpinnerGap, TrendDown, TrendUp, UsersThree, WarningCircle, Wrench,
} from '@phosphor-icons/react'
import {
  fetchOverviewDashboard,
  type BackofficeViewer,
  type OverviewDashboardData,
} from '@vistay/admin-api-client'

type Section = 'system' | 'personal'
type RangeKey = 'week' | 'month' | 'quarter'
const rangeDays: Record<RangeKey, number> = { week: 7, month: 30, quarter: 90 }
const rangeLabels: Record<RangeKey, string> = { week: '7 ngày', month: '30 ngày', quarter: '90 ngày' }

function isoDate(value: Date) { return value.toISOString().slice(0, 10) }
function rangeInput(key: RangeKey) {
  const to = new Date(); to.setUTCHours(0, 0, 0, 0); to.setUTCDate(to.getUTCDate() + 1)
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - rangeDays[key])
  return { from: isoDate(from), to: isoDate(to) }
}
function integer(value: number | null | undefined) {
  return value == null ? '—' : value.toLocaleString('vi-VN')
}
function money(value: string | null | undefined, currency = 'VND') {
  if (value == null) return '—'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value))
}

function Metric({ icon, label, value, note, tone = 'plain', urgent = false }: {
  icon: ReactNode; label: string; value: string; note?: string; tone?: 'plain' | 'green' | 'dark' | 'warm'; urgent?: boolean
}) {
  return <article className={`home-metric ${tone} ${urgent ? 'urgent' : ''}`}>
    <span className="home-metric-icon">{icon}</span>
    <span className="home-metric-label">{label}</span>
    <strong>{value}</strong>
    {note && <small>{note}</small>}
  </article>
}

function Group({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`home-group ${className}`}>
    <h2>{title}</h2>
    <div className="home-group-grid">{children}</div>
  </section>
}

export function OverviewDashboard({ graphqlUrl, accessToken, viewer, section }: {
  graphqlUrl: string; accessToken: string; viewer: BackofficeViewer; section: Section
}) {
  const [range, setRange] = useState<RangeKey>('month')
  const [data, setData] = useState<OverviewDashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const allowed = viewer.permissions.includes('analytics:read')
  const financeAllowed = viewer.permissions.includes('finance:read')
  const dates = useMemo(() => rangeInput(range), [range])

  async function load() {
    if (!allowed) return
    setLoading(true); setError('')
    try {
      setData(await fetchOverviewDashboard(graphqlUrl, accessToken, {
        view: section === 'system' ? 'SYSTEM' : 'PERSONAL',
        ...dates,
        includeProperty: section === 'system',
        includeFinance: section === 'system' && financeAllowed,
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được tổng quan')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [graphqlUrl, accessToken, section, range, allowed, financeAllowed])

  if (!allowed) return <section className="analytics-denied"><WarningCircle /><div><h2>Không có quyền xem tổng quan</h2><p>Role cần permission <code>analytics:read</code>.</p></div></section>
  const booking = data?.booking
  const property = data?.property
  const finance = data?.finance
  const primaryMoney = booking?.money.find((item) => item.currency === 'VND') ?? booking?.money[0]
  const availableProperties = property && booking
    ? Math.max(0, property.activeProperties - booking.today.occupiedProperties)
    : null
  const pendingReconciliation = finance
    ? Math.max(0, finance.totalSettlementCount - finance.approvedSettlementCount)
    : null

  return <main className="home-overview">
    <header className="home-overview-head">
      <div>
        <h1>{section === 'system' ? 'Tổng quan hệ thống' : 'Công việc của tôi'}</h1>
        <p>{section === 'system' ? 'Kinh doanh, lưu trú và vận hành hôm nay.' : 'Booking được giao hoặc có tên bạn trong attribution.'}</p>
      </div>
      <div className="overview-range" role="tablist" aria-label="Khoảng thống kê">
        {(Object.keys(rangeDays) as RangeKey[]).map((key) => <button type="button" role="tab" aria-selected={range === key} className={range === key ? 'active' : ''} key={key} onClick={() => setRange(key)}>{rangeLabels[key]}</button>)}
      </div>
    </header>

    {loading && !data && <div className="inline-state"><SpinnerGap className="spinner" />Đang tải tổng quan…</div>}
    {error && <div className="inline-state error"><WarningCircle /><div><strong>Không tải được dữ liệu</strong><span>{error}</span></div><button onClick={() => void load()}><ArrowClockwise />Thử lại</button></div>}
    {data?.errors.length ? <div className="home-partial-warning"><WarningCircle /><span>Một số nguồn dữ liệu đang tạm gián đoạn. Các phần còn lại vẫn được cập nhật.</span></div> : null}

    {data && <div className="home-bento">
      <Group title="Kinh doanh" className="business">
        <Metric icon={<CalendarCheck />} label="Booking" value={integer(booking?.totalBookings)} note={`${integer(booking?.confirmedBookings)} hiệu lực`} />
        <Metric icon={<CurrencyCircleDollar />} label="Doanh thu" value={money(primaryMoney?.revenue, primaryMoney?.currency)} note={primaryMoney ? `Giá trị TB ${money(primaryMoney.averageBookingValue, primaryMoney.currency)}` : 'Chưa phát sinh'} tone="dark" />
        <Metric icon={<DoorOpen />} label="Lấp đầy" value={booking ? `${booking.occupancyRate}%` : '—'} note={`${integer(booking?.occupiedNights)} đêm`} tone="green" />
        <Metric icon={<Buildings />} label="Căn hoạt động" value={section === 'system' ? integer(property?.activeProperties) : integer(booking?.bookedProperties)} note={section === 'system' ? 'Nguồn Property' : 'Có booking của bạn'} />
      </Group>

      <Group title="Lưu trú hôm nay" className="stay">
        <Metric icon={<CalendarPlus />} label="Check-in" value={integer(booking?.today.expectedCheckIns)} />
        <Metric icon={<CalendarMinus />} label="Check-out" value={integer(booking?.today.expectedCheckOuts)} />
        <Metric icon={<UsersThree />} label="Đang lưu trú" value={integer(booking?.today.inHouse)} tone="green" />
        <Metric icon={<ClockCountdown />} label="Chờ xác nhận" value={integer(booking?.today.pendingConfirmation)} urgent={Boolean(booking?.today.pendingConfirmation)} />
        <Metric icon={<TrendDown />} label="Đã hủy" value={integer(booking?.today.cancelledToday)} />
      </Group>

      {section === 'system' && <Group title="Tài sản & vận hành" className="operations">
        <Metric icon={<HouseLine />} label="Căn trống" value={integer(availableProperties)} note="Active trừ đang có khách" />
        <Metric icon={<Wrench />} label="Bảo trì" value={integer(property?.maintenanceProperties)} />
        <Metric icon={<ShieldWarning />} label="Cần xử lý" value={integer(property?.propertiesNeedingAttention)} note="Tài sản sửa chữa hoặc thất lạc" urgent={Boolean(property?.propertiesNeedingAttention)} />
        <Metric icon={<CheckCircle />} label="Việc chưa xong" value="—" note="Chờ Operations contract" />
      </Group>}

      {section === 'system' && <Group title="Tài chính" className="finance">
        <Metric icon={<TrendUp />} label="Tổng thu" value={financeAllowed ? money(finance?.totalGrossRevenue) : '—'} note={financeAllowed ? 'Doanh thu gộp' : 'Cần finance:read'} tone="dark" />
        <Metric icon={<Receipt />} label="Tổng chi" value={financeAllowed ? money(finance?.totalNetPayoutCalculated) : '—'} note="Chi trả dự kiến" />
        <Metric icon={<ClockCountdown />} label="Chờ đối soát" value={financeAllowed ? integer(pendingReconciliation) : '—'} urgent={Boolean(pendingReconciliation)} />
        <Metric icon={<Coins />} label="Phải thu" value="—" note="Chờ receivable contract" />
        <Metric icon={<CurrencyCircleDollar />} label="Phải trả" value={financeAllowed ? money(finance?.totalPayableOutstanding) : '—'} />
      </Group>}

      <Group title="Cần xử lý" className="actions">
        <Metric icon={<CalendarCheck />} label="Xác nhận booking" value={integer(booking?.today.pendingConfirmation)} urgent={Boolean(booking?.today.pendingConfirmation)} />
        {section === 'system' && <Metric icon={<Receipt />} label="Đối soát" value={financeAllowed ? integer(pendingReconciliation) : '—'} urgent={Boolean(pendingReconciliation)} />}
        {section === 'system' && <Metric icon={<WarningCircle />} label="Sự cố căn" value={integer(property?.propertiesNeedingAttention)} urgent={Boolean(property?.propertiesNeedingAttention)} />}
        <Metric icon={<ClockCountdown />} label="Quá hạn" value="—" note="Chờ Operations contract" />
        <Metric icon={<ShieldWarning />} label="Cảnh báo" value="—" note="Chờ Alert contract" />
      </Group>
    </div>}
  </main>
}
