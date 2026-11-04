import { useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  Buildings,
  CheckCircle,
  DoorOpen,
  Funnel,
  Key,
  Plus,
  WarningCircle,
} from '@phosphor-icons/react'

type PropertyStatus = 'Đang hoạt động' | 'Bảo trì' | 'Cần bổ sung'
type PropertyFilter = 'all' | 'active' | 'missing'

interface PropertyRow {
  id: string
  building: string
  floor: string
  unitNumber: string
  name: string
  type: string
  capacity: number
  status: PropertyStatus
  hasAccessCredential: boolean
}

const properties: PropertyRow[] = [
  { id: 'p-101', building: 'Tòa Nguyễn Huệ', floor: 'Tầng 1', unitNumber: 'A-101', name: 'Studio hướng phố', type: 'STUDIO', capacity: 2, status: 'Đang hoạt động', hasAccessCredential: true },
  { id: 'p-102', building: 'Tòa Nguyễn Huệ', floor: 'Tầng 1', unitNumber: 'A-102', name: 'Căn hộ 1 phòng ngủ', type: 'APARTMENT', capacity: 3, status: 'Đang hoạt động', hasAccessCredential: true },
  { id: 'p-201', building: 'Tòa Nguyễn Huệ', floor: 'Tầng 2', unitNumber: 'A-201', name: 'Căn hộ 2 phòng ngủ', type: 'APARTMENT', capacity: 4, status: 'Cần bổ sung', hasAccessCredential: false },
  { id: 'p-301', building: 'Tòa Lê Lợi', floor: 'Tầng 3', unitNumber: 'B-301', name: 'Studio ven sông', type: 'STUDIO', capacity: 2, status: 'Đang hoạt động', hasAccessCredential: true },
  { id: 'p-401', building: 'Tòa Lê Lợi', floor: 'Tầng 4', unitNumber: 'B-401', name: 'Nhà nguyên căn', type: 'HOUSE', capacity: 6, status: 'Bảo trì', hasAccessCredential: false },
]

const statusClass: Record<PropertyStatus, string> = {
  'Đang hoạt động': 'active',
  'Bảo trì': 'maintenance',
  'Cần bổ sung': 'missing',
}

export function PropertyManagement() {
  const root = useRef<HTMLElement>(null)
  const [filter, setFilter] = useState<PropertyFilter>('all')
  const [buildingFilter, setBuildingFilter] = useState('Tất cả tòa')
  const [notice, setNotice] = useState('')

  const visibleProperties = properties.filter((property) => {
    const matchesBuilding = buildingFilter === 'Tất cả tòa' || property.building === buildingFilter
    const matchesStatus = filter === 'all'
      || (filter === 'active' && property.status === 'Đang hoạt động')
      || (filter === 'missing' && (!property.hasAccessCredential || property.status === 'Cần bổ sung'))
    return matchesBuilding && matchesStatus
  })

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('.property-management .property-summary-card', { opacity: 0, y: 14 }, {
      opacity: 1, y: 0, duration: 0.42, stagger: 0.06, ease: 'power2.out',
    })
    gsap.fromTo('.property-management .property-row', { opacity: 0, y: 10 }, {
      opacity: 1, y: 0, duration: 0.36, stagger: 0.04, delay: 0.1, ease: 'power2.out',
    })
  }, { scope: root, dependencies: [filter, buildingFilter], revertOnUpdate: true })

  function announce(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  return (
    <section ref={root} className="property-management" aria-labelledby="property-management-title">
      <header className="property-management-heading">
        <div>
          <p className="eyebrow">PROPERTY MASTER / UNIT CATALOG</p>
          <h2 id="property-management-title">Quản lý tòa và căn theo dữ liệu Property.</h2>
          <p>Danh mục này bám vào building, floor_label và unit_number của bảng properties; mỗi căn có thể theo dõi trạng thái cấu hình truy cập riêng.</p>
        </div>
        <button className="property-create-button" type="button" onClick={() => announce('Đang mở biểu mẫu thêm căn mới')}><Plus /> Thêm căn</button>
      </header>

      <section className="property-summary-grid" aria-label="Tổng quan danh mục căn">
        <article className="property-summary-card property-summary-highlight"><Buildings /><span>Tòa đang quản lý</span><strong>2</strong><small>Phân theo building_id</small></article>
        <article className="property-summary-card"><DoorOpen /><span>Tổng số căn</span><strong>{properties.length}</strong><small>Đơn vị lưu trú chính xác</small></article>
        <article className="property-summary-card"><CheckCircle /><span>Đang hoạt động</span><strong>{properties.filter((property) => property.status === 'Đang hoạt động').length}</strong><small>Đủ dữ liệu vận hành</small></article>
        <article className="property-summary-card property-summary-warning"><WarningCircle /><span>Cần bổ sung</span><strong>{properties.filter((property) => !property.hasAccessCredential || property.status === 'Cần bổ sung').length}</strong><small>Kiểm tra tầng, mã căn hoặc truy cập</small></article>
      </section>

      <section className="property-catalog" aria-label="Danh mục căn lưu trú">
        <div className="property-catalog-toolbar">
          <div className="property-filter-tabs" role="tablist" aria-label="Lọc trạng thái căn">
            <button className={filter === 'all' ? 'active' : ''} type="button" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>Tất cả căn</button>
            <button className={filter === 'active' ? 'active' : ''} type="button" role="tab" aria-selected={filter === 'active'} onClick={() => setFilter('active')}>Đang hoạt động</button>
            <button className={filter === 'missing' ? 'active' : ''} type="button" role="tab" aria-selected={filter === 'missing'} onClick={() => setFilter('missing')}>Cần bổ sung</button>
          </div>
          <label className="property-building-filter"><Funnel /><span>Tòa</span><select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}><option>Tất cả tòa</option><option>Tòa Nguyễn Huệ</option><option>Tòa Lê Lợi</option></select></label>
        </div>

        <div className="property-table" role="table" aria-label="Các căn lưu trú">
          <div className="property-table-head" role="row"><span>Tòa / tầng</span><span>Mã căn</span><span>Loại căn</span><span>Sức chứa</span><span>Trạng thái</span><span>Truy cập</span></div>
          {visibleProperties.map((property) => (
            <button className="property-row" type="button" role="row" key={property.id} onClick={() => announce(`Đã chọn căn ${property.unitNumber}`)}>
              <span className="property-place"><strong>{property.building}</strong><small>{property.floor} · {property.name}</small></span>
              <strong className="property-unit-number">{property.unitNumber}</strong>
              <span className="property-type">{property.type}</span>
              <span className="property-capacity">{property.capacity} khách</span>
              <span className={`property-status ${statusClass[property.status]}`}>{property.status}</span>
              <span className={`property-credential ${property.hasAccessCredential ? 'configured' : 'unconfigured'}`}><Key /> {property.hasAccessCredential ? 'Đã cấu hình' : 'Chưa cấu hình'}</span>
            </button>
          ))}
          {visibleProperties.length === 0 && <div className="property-empty">Không có căn nào khớp bộ lọc hiện tại.</div>}
        </div>
      </section>

      {notice && <div className="property-management-toast" role="status">{notice}</div>}
    </section>
  )
}
