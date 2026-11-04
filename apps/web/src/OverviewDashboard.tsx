import { useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  ArrowUpRight,
  Buildings,
  CalendarCheck,
  ChartLineUp,
  CurrencyCircleDollar,
  DoorOpen,
  UsersThree,
} from '@phosphor-icons/react'

type DashboardRange = 'today' | 'week' | 'month'

const rangeLabels: Record<DashboardRange, string> = {
  today: 'Hôm nay',
  week: '7 ngày',
  month: '30 ngày',
}

const snapshots: Record<DashboardRange, {
  guests: string
  revenue: string
  occupancy: string
  bookings: string
  revenueDelta: string
  guestDelta: string
}> = {
  today: { guests: '42', revenue: '18,42 triệu', occupancy: '82%', bookings: '16', revenueDelta: '+12,8%', guestDelta: '+8 khách' },
  week: { guests: '286', revenue: '124,80 triệu', occupancy: '76%', bookings: '98', revenueDelta: '+9,4%', guestDelta: '+34 khách' },
  month: { guests: '1.184', revenue: '486,20 triệu', occupancy: '71%', bookings: '412', revenueDelta: '+15,2%', guestDelta: '+126 khách' },
}

const revenueSeries: Record<DashboardRange, number[]> = {
  today: [22, 31, 28, 46, 40, 55, 68, 61, 76, 72, 86, 92],
  week: [38, 44, 41, 55, 52, 66, 61, 74, 70, 83, 79, 96],
  month: [30, 37, 35, 48, 44, 58, 56, 63, 66, 75, 78, 92],
}

const channelData = [
  { name: 'Trực tiếp', value: 48, color: '#173c2b' },
  { name: 'OTA', value: 31, color: '#72b9a1' },
  { name: 'Đối tác', value: 21, color: '#c9df78' },
]

function pointsFor(values: number[]): string {
  return values.map((value, index) => `${index * 62 + 12},${194 - value * 1.55}`).join(' ')
}

function areaFor(values: number[]): string {
  return `12,194 ${pointsFor(values)} 694,194`
}

export function OverviewDashboard() {
  const root = useRef<HTMLElement>(null)
  const [range, setRange] = useState<DashboardRange>('today')
  const snapshot = snapshots[range]
  const series = revenueSeries[range]

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('.overview-dashboard .overview-kpi-card', { opacity: 0, y: 15 }, {
      opacity: 1, y: 0, duration: 0.42, stagger: 0.06, ease: 'power2.out',
    })
    gsap.fromTo('.overview-dashboard .overview-chart-card', { opacity: 0, y: 18 }, {
      opacity: 1, y: 0, duration: 0.5, stagger: 0.08, delay: 0.12, ease: 'power2.out',
    })
    gsap.fromTo('.overview-dashboard .chart-line', { strokeDashoffset: 780 }, {
      strokeDashoffset: 0, duration: 0.9, delay: 0.25, ease: 'power2.out',
    })
    gsap.fromTo('.overview-dashboard .overview-bar', { scaleY: 0 }, {
      scaleY: 1, duration: 0.55, stagger: 0.07, delay: 0.25, ease: 'power2.out', transformOrigin: 'bottom',
    })
  }, { scope: root, dependencies: [range], revertOnUpdate: true })

  return (
    <section ref={root} className="overview-dashboard" aria-labelledby="overview-dashboard-title">
      <header className="overview-dashboard-heading">
        <div>
          <p className="eyebrow">THÔNG TIN CHUNG</p>
          <h2 id="overview-dashboard-title">Một nhịp nhìn cho toàn bộ vận hành.</h2>
          <p>Số liệu tổng hợp về tòa nhà, khách lưu trú, doanh thu và công suất phòng.</p>
        </div>
        <div className="overview-range" role="tablist" aria-label="Khoảng thời gian báo cáo">
          {(Object.keys(rangeLabels) as DashboardRange[]).map((item) => <button className={range === item ? 'active' : ''} type="button" role="tab" aria-selected={range === item} key={item} onClick={() => setRange(item)}>{rangeLabels[item]}</button>)}
        </div>
      </header>

      <section className="overview-kpi-grid" aria-label="Chỉ số vận hành chính">
        <article className="overview-kpi-card"><div className="overview-kpi-icon"><Buildings /></div><span>Tòa đang hoạt động</span><strong>2</strong><small><ArrowUpRight /> Không thay đổi so với hôm qua</small></article>
        <article className="overview-kpi-card kpi-guests"><div className="overview-kpi-icon"><UsersThree /></div><span>Khách hôm nay</span><strong>{snapshot.guests}</strong><small><ArrowUpRight /> {snapshot.guestDelta} so với kỳ trước</small></article>
        <article className="overview-kpi-card kpi-revenue"><div className="overview-kpi-icon"><CurrencyCircleDollar /></div><span>Doanh thu {rangeLabels[range].toLowerCase()}</span><strong>{snapshot.revenue}</strong><small><ArrowUpRight /> {snapshot.revenueDelta} so với kỳ trước</small></article>
        <article className="overview-kpi-card kpi-occupancy"><div className="overview-kpi-icon"><DoorOpen /></div><span>Công suất phòng</span><strong>{snapshot.occupancy}</strong><small>{snapshot.bookings} booking đã xác nhận</small></article>
      </section>

      <section className="overview-chart-grid" aria-label="Biểu đồ vận hành">
        <article className="overview-chart-card revenue-chart-card">
          <div className="overview-chart-heading"><div><span className="chart-kicker">DOANH THU</span><h3>Dòng tiền theo thời gian</h3></div><ChartLineUp /></div>
          <div className="line-chart-wrap">
            <svg className="line-chart" viewBox="0 0 706 220" role="img" aria-label="Biểu đồ doanh thu tăng dần">
              {[42, 92, 142, 194].map((y) => <line key={y} x1="12" x2="694" y1={y} y2={y} className="chart-grid-line" />)}
              <polygon points={areaFor(series)} className="chart-area" />
              <polyline points={pointsFor(series)} className="chart-line" />
              {series.map((value, index) => <circle key={value + index} cx={index * 62 + 12} cy={194 - value * 1.55} r="4" className="chart-dot" />)}
            </svg>
            <div className="chart-axis-labels"><span>06:00</span><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span><span>21:00</span></div>
          </div>
        </article>

        <article className="overview-chart-card occupancy-chart-card">
          <div className="overview-chart-heading"><div><span className="chart-kicker">CÔNG SUẤT</span><h3>Phòng đang được dùng</h3></div><DoorOpen /></div>
          <div className="occupancy-chart-body"><div className="occupancy-ring" style={{ background: `conic-gradient(#173c2b ${snapshot.occupancy}, #e6ebe2 0)` }}><div><strong>{snapshot.occupancy}</strong><span>đã dùng</span></div></div><div className="occupancy-legend"><span><i className="occupied-dot" /> Đang ở <strong>38</strong></span><span><i className="available-dot" /> Còn trống <strong>9</strong></span><span><i className="maintenance-dot" /> Bảo trì <strong>2</strong></span></div></div>
        </article>

        <article className="overview-chart-card channel-chart-card">
          <div className="overview-chart-heading"><div><span className="chart-kicker">NGUỒN ĐẶT PHÒNG</span><h3>Booking đến từ đâu</h3></div><CalendarCheck /></div>
          <div className="channel-chart">{channelData.map((channel) => <div className="channel-row" key={channel.name}><div><span>{channel.name}</span><strong>{channel.value}%</strong></div><div className="channel-track"><i className="overview-bar" style={{ height: `${channel.value}%`, background: channel.color }} /></div></div>)}</div>
        </article>

        <article className="overview-chart-card arrivals-chart-card">
          <div className="overview-chart-heading"><div><span className="chart-kicker">HÔM NAY</span><h3>Lịch nhận và trả phòng</h3></div><CalendarCheck /></div>
          <div className="arrival-list"><div><span className="arrival-time">14:00</span><strong>Nhận phòng</strong><small>8 khách · Tòa Nguyễn Huệ</small></div><div><span className="arrival-time">11:30</span><strong>Trả phòng</strong><small>5 khách · Tòa Lê Lợi</small></div><div><span className="arrival-time">16:30</span><strong>Nhận phòng</strong><small>4 khách · Tòa Nguyễn Huệ</small></div></div>
        </article>
      </section>
    </section>
  )
}
