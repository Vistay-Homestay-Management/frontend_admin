import { useMemo, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  Buildings,
  DoorOpen,
  Key,
  MapPin,
  PencilSimple,
  Plus,
} from '@phosphor-icons/react'

type PropertyStatus = 'Đang hoạt động' | 'Bảo trì' | 'Cần bổ sung'
type PropertyType = 'APARTMENT' | 'STUDIO' | 'HOUSE'

interface PropertyRow {
  id: string
  buildingId: string
  floor: string
  unitNumber: string
  name: string
  type: PropertyType
  capacity: number
  status: PropertyStatus
  hasAccessCredential: boolean
}

interface BuildingNode {
  id: string
  name: string
  code: string
  address: string
  properties: PropertyRow[]
}

interface AreaNode {
  id: string
  name: string
  code: string
  buildings: BuildingNode[]
}

interface CityNode {
  id: string
  name: string
  areas: AreaNode[]
}

const typeLabels: Record<PropertyType, string> = {
  APARTMENT: 'Căn hộ',
  STUDIO: 'Studio',
  HOUSE: 'Nhà nguyên căn',
}

const statusClass: Record<PropertyStatus, string> = {
  'Đang hoạt động': 'active',
  'Bảo trì': 'maintenance',
  'Cần bổ sung': 'missing',
}

const cities: CityNode[] = [
  {
    id: 'hcm',
    name: 'Thành phố Hồ Chí Minh',
    areas: [
      {
        id: 'district-1',
        name: 'Quận 1',
        code: 'D1',
        buildings: [
          {
            id: 'nguyen-hue',
            name: 'Tòa Nguyễn Huệ',
            code: 'NH-01',
            address: '12 Nguyễn Huệ',
            properties: [
              { id: 'p-101', buildingId: 'nguyen-hue', floor: 'Tầng 1', unitNumber: 'A-101', name: 'Studio hướng phố', type: 'STUDIO', capacity: 2, status: 'Đang hoạt động', hasAccessCredential: true },
              { id: 'p-102', buildingId: 'nguyen-hue', floor: 'Tầng 1', unitNumber: 'A-102', name: 'Căn hộ 1 phòng ngủ', type: 'APARTMENT', capacity: 3, status: 'Đang hoạt động', hasAccessCredential: true },
              { id: 'p-201', buildingId: 'nguyen-hue', floor: 'Tầng 2', unitNumber: 'A-201', name: 'Căn hộ 2 phòng ngủ', type: 'APARTMENT', capacity: 4, status: 'Cần bổ sung', hasAccessCredential: false },
            ],
          },
        ],
      },
      {
        id: 'district-3',
        name: 'Quận 3',
        code: 'D3',
        buildings: [
          {
            id: 'le-loi',
            name: 'Tòa Lê Lợi',
            code: 'LL-01',
            address: '88 Lê Lợi',
            properties: [
              { id: 'p-301', buildingId: 'le-loi', floor: 'Tầng 3', unitNumber: 'B-301', name: 'Studio ven sông', type: 'STUDIO', capacity: 2, status: 'Đang hoạt động', hasAccessCredential: true },
              { id: 'p-401', buildingId: 'le-loi', floor: 'Tầng 4', unitNumber: 'B-401', name: 'Nhà nguyên căn', type: 'HOUSE', capacity: 6, status: 'Bảo trì', hasAccessCredential: false },
            ],
          },
        ],
      },
    ],
  },
]

const defaultTypeTabs = ['Tất cả căn', 'Căn hộ', 'Studio', 'Nhà nguyên căn']

export function PropertyManagement() {
  const root = useRef<HTMLElement>(null)
  const [cityId, setCityId] = useState(cities[0].id)
  const [areaId, setAreaId] = useState(cities[0].areas[0].id)
  const [activeTypes, setActiveTypes] = useState<Record<string, string>>({})
  const [activeFloors, setActiveFloors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')

  const city = cities.find((item) => item.id === cityId) ?? cities[0]
  const area = city.areas.find((item) => item.id === areaId) ?? city.areas[0]
  const buildings = area?.buildings ?? []

  const totals = useMemo(() => {
    const units = buildings.flatMap((building) => building.properties)
    return {
      units: units.length,
      floors: new Set(units.map((unit) => unit.floor)).size,
      credentials: units.filter((unit) => unit.hasAccessCredential).length,
    }
  }, [buildings])

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('.property-management .building-board', { opacity: 0, y: 16 }, {
      opacity: 1, y: 0, duration: 0.46, stagger: 0.08, ease: 'power2.out',
    })
    gsap.fromTo('.property-management .unit-card', { opacity: 0, y: 8 }, {
      opacity: 1, y: 0, duration: 0.3, stagger: 0.035, delay: 0.08, ease: 'power2.out',
    })
  }, { scope: root, dependencies: [cityId, areaId, activeTypes, activeFloors], revertOnUpdate: true })

  function announce(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  function changeCity(nextCityId: string) {
    const nextCity = cities.find((item) => item.id === nextCityId) ?? cities[0]
    setCityId(nextCity.id)
    setAreaId(nextCity.areas[0]?.id ?? '')
  }

  return (
    <section ref={root} className="property-management" aria-labelledby="property-management-title">
      <header className="property-management-heading">
        <div>
          <p className="eyebrow">PROPERTY MASTER</p>
          <h2 id="property-management-title">Thành phố, khu vực và tòa nhà.</h2>
          <p>Thiết lập cấu trúc lưu trú trước khi thêm các unit và phòng vận hành bên trong từng tòa.</p>
        </div>
        <div className="property-management-counts" aria-label="Tổng quan khu vực đang chọn">
          <span><strong>{buildings.length}</strong> tòa</span>
          <span><strong>{totals.floors}</strong> tầng</span>
          <span><strong>{totals.units}</strong> unit</span>
        </div>
      </header>

      <section className="property-hierarchy" aria-label="Cấu trúc địa điểm">
        <div className="hierarchy-select">
          <MapPin /><label htmlFor="property-city">Thành phố</label>
          <select id="property-city" value={city.id} onChange={(event) => changeCity(event.target.value)}>
            {cities.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="hierarchy-select">
          <MapPin /><label htmlFor="property-area">Khu vực</label>
          <select id="property-area" value={area.id} onChange={(event) => setAreaId(event.target.value)}>
            {city.areas.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.code}</option>)}
          </select>
        </div>
        <button className="hierarchy-add" type="button" onClick={() => announce('Đang mở biểu mẫu thêm thành phố')}><Plus /> Thành phố</button>
        <button className="hierarchy-add" type="button" onClick={() => announce('Đang mở biểu mẫu thêm khu vực')}><Plus /> Khu vực</button>
        <button className="hierarchy-add primary" type="button" onClick={() => announce(`Đang mở biểu mẫu thêm tòa tại ${area.name}`)}><Plus /> Tòa nhà</button>
      </section>

      <div className="building-list" aria-label={`Các tòa thuộc ${area.name}`}>
        {buildings.map((building) => {
          const selectedType = activeTypes[building.id] ?? defaultTypeTabs[0]
          const floors = [...new Set(building.properties.map((property) => property.floor))]
          const selectedFloor = activeFloors[building.id] ?? floors[0] ?? 'Chưa có tầng'
          const units = building.properties.filter((property) => {
            const matchesType = selectedType === defaultTypeTabs[0] || typeLabels[property.type] === selectedType
            return matchesType && property.floor === selectedFloor
          })

          return (
            <article className="building-board" key={building.id}>
              <div className="building-board-header">
                <div className="building-title"><span className="building-icon"><Buildings weight="duotone" /></span><div><p className="eyebrow">{building.code} · {building.address}</p><h3>{building.name}</h3></div></div>
                <button className="building-edit" type="button" onClick={() => announce(`Đang chỉnh sửa ${building.name}`)}><PencilSimple /> Sửa tòa</button>
              </div>

              <div className="room-type-tabs" role="tablist" aria-label={`Loại unit tại ${building.name}`}>
                {defaultTypeTabs.map((type) => <button className={selectedType === type ? 'active' : ''} key={type} type="button" role="tab" aria-selected={selectedType === type} onClick={() => setActiveTypes((current) => ({ ...current, [building.id]: type }))}>{type}</button>)}
              </div>

              <div className="floor-bar">
                <div className="floor-tabs" role="tablist" aria-label={`Tầng của ${building.name}`}>
                  {floors.map((floor) => <button className={selectedFloor === floor ? 'active' : ''} key={floor} type="button" role="tab" aria-selected={selectedFloor === floor} onClick={() => setActiveFloors((current) => ({ ...current, [building.id]: floor }))}>{floor}</button>)}
                </div>
                <button className="building-add-floor" type="button" onClick={() => announce(`Đang mở biểu mẫu thêm tầng cho ${building.name}`)}><Plus /> Thêm tầng</button>
              </div>

              <div className="unit-grid">
                <button className="add-unit-card" type="button" onClick={() => announce(`Đang mở biểu mẫu thêm unit cho ${building.name}`)}><span><Plus /></span><strong>Thêm unit</strong><small>Thêm vào {selectedFloor.toLowerCase()}</small></button>
                {units.map((unit) => <button className="unit-card" type="button" key={unit.id} onClick={() => announce(`Đã chọn unit ${unit.unitNumber}`)}><div className="unit-card-top"><span className={`unit-status ${statusClass[unit.status]}`}>{unit.status}</span><DoorOpen /></div><strong>{unit.unitNumber}</strong><span>{unit.name}</span><small>{typeLabels[unit.type]} · {unit.capacity} khách</small><small className={unit.hasAccessCredential ? 'credential-ready' : 'credential-missing'}><Key /> {unit.hasAccessCredential ? 'Đã cấu hình truy cập' : 'Thiếu thông tin truy cập'}</small></button>)}
              </div>
            </article>
          )
        })}
        {buildings.length === 0 && <div className="building-empty">Khu vực này chưa có tòa nhà. Hãy thêm tòa nhà để bắt đầu.</div>}
      </div>

      {notice && <div className="property-management-toast" role="status">{notice}</div>}
    </section>
  )
}
