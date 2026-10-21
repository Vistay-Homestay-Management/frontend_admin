import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ArrowUpRight, Bell, Buildings, CalendarCheck, ChartLine, CirclesThree, CurrencyCircleDollar, MagnifyingGlass, UsersThree, Wrench } from '@phosphor-icons/react'
import './App.css'

const occupancy = [64, 78, 72, 88, 82, 94, 86]

function App() {
  const root = useRef<HTMLElement>(null)
  useGSAP(() => {
    gsap.from('.enter', { y: 24, opacity: 0, duration: .65, stagger: .07, ease: 'power3.out' })
    gsap.from('.chart-bar i', { scaleY: 0, transformOrigin: 'bottom', duration: .8, stagger: .08, ease: 'power3.out', delay: .3 })
  }, { scope: root })

  return (
    <main className="admin" ref={root}>
      <aside>
        <a className="mark" href="#">V<span>.</span></a>
        <nav>
          <a className="active" href="#" aria-label="Tổng quan"><CirclesThree /></a>
          <a href="#" aria-label="Căn hộ"><Buildings /></a>
          <a href="#" aria-label="Booking"><CalendarCheck /></a>
          <a href="#" aria-label="Khách hàng"><UsersThree /></a>
          <a href="#" aria-label="Vận hành"><Wrench /></a>
          <a href="#" aria-label="Tài chính"><CurrencyCircleDollar /></a>
        </nav>
        <button className="avatar">HP</button>
      </aside>
      <section className="canvas">
        <header className="enter">
          <div><span>Trung tâm vận hành</span><h1>Nhịp ViStay hôm nay.</h1></div>
          <div className="tools"><label><MagnifyingGlass /><input aria-label="Tìm kiếm" placeholder="Tìm booking, căn hộ..." /></label><button aria-label="Thông báo"><Bell /></button></div>
        </header>

        <section className="signal enter">
          <article><span>Nhận phòng hôm nay</span><strong>14</strong><small>11 đã sẵn sàng</small></article>
          <article><span>Căn đang khai thác</span><strong>86</strong><small>4 căn đang bảo trì</small></article>
          <article><span>Yêu cầu mở</span><strong>9</strong><small className="warn">2 yêu cầu quá hạn</small></article>
          <article className="accent"><span>Doanh thu tháng</span><strong>1,28 tỷ</strong><small><ChartLine /> 108% kế hoạch</small></article>
        </section>

        <section className="dashboard-grid">
          <article className="occupancy enter">
            <div className="block-title"><div><h2>Công suất 7 ngày</h2><p>Tỷ lệ căn đủ điều kiện bán đã được đặt.</p></div><strong>82,4%</strong></div>
            <div className="chart">
              {occupancy.map((value, index) => <div className="chart-bar" key={index}><i style={{ height: value + '%' }} /><span>{['T2','T3','T4','T5','T6','T7','CN'][index]}</span></div>)}
            </div>
          </article>
          <article className="handover enter">
            <div className="block-title"><div><h2>Luồng nhận phòng</h2><p>Các lượt cần phối hợp tiếp theo.</p></div><a href="#">Mở lịch <ArrowUpRight /></a></div>
            {[
              ['14:00', 'VS-10428', 'Sông Hàn Loft', 'Sẵn sàng'],
              ['14:30', 'VS-10431', 'An Thượng Studio', 'Chờ dọn phòng'],
              ['15:00', 'VS-10436', 'Sơn Trà House', 'Sẵn sàng'],
            ].map((row) => <div className="arrival" key={row[1]}><time>{row[0]}</time><div><strong>{row[2]}</strong><span>{row[1]}</span></div><em>{row[3]}</em></div>)}
          </article>
          <article className="attention enter">
            <div className="block-title"><div><h2>Cần xử lý</h2><p>Ưu tiên dựa trên SLA và ảnh hưởng khách.</p></div><span>9 mục</span></div>
            <div className="task"><i className="critical" /><div><strong>Điều hòa không làm lạnh</strong><p>Sơn Trà House · Khách đang lưu trú</p></div><time>18 phút</time></div>
            <div className="task"><i /><div><strong>Xác nhận chi phí sửa khóa</strong><p>Sông Hàn Loft · Chờ duyệt chủ nhà</p></div><time>46 phút</time></div>
            <div className="task"><i /><div><strong>Đối chiếu booking OTA</strong><p>An Thượng Studio · Sai lệch ngày</p></div><time>1 giờ</time></div>
          </article>
        </section>
      </section>
    </main>
  )
}

export default App
