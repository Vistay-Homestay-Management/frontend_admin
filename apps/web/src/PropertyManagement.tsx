import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  Buildings,
  DoorOpen,
  GridNine,
  Key,
  ListBullets,
  MapPin,
  PencilSimple,
  Plus,
  SquaresFour,
  Stack,
  X,
} from '@phosphor-icons/react'

type PropertyStatus = 'Đang hoạt động' | 'Bảo trì' | 'Cần bổ sung'

interface PropertyRow {
  id: string
  unitNumber: string
  name: string
  capacity: number
  status: PropertyStatus
  hasAccessCredential: boolean
}

interface FloorNode {
  id: string
  code: string
  name: string
  floorNumber: number
  properties: PropertyRow[]
}

interface BuildingNode {
  id: string
  name: string
  code: string
  address: string
  floors: FloorNode[]
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
  code: string
  areas: AreaNode[]
}

const statusClass: Record<PropertyStatus, string> = {
  'Đang hoạt động': 'active',
  'Bảo trì': 'maintenance',
  'Cần bổ sung': 'missing',
}

const initialCities: CityNode[] = [
  {
    id: 'hcm',
    code: 'HCM',
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
            floors: [
              {
                id: 'nguyen-hue-f1', code: 'F01', name: 'Tầng 1', floorNumber: 1,
                properties: [
                  { id: 'p-101', unitNumber: 'A-101', name: 'Căn hướng phố', capacity: 2, status: 'Đang hoạt động', hasAccessCredential: true },
                  { id: 'p-102', unitNumber: 'A-102', name: 'Căn một phòng ngủ', capacity: 3, status: 'Đang hoạt động', hasAccessCredential: true },
                ],
              },
              {
                id: 'nguyen-hue-f2', code: 'F02', name: 'Tầng 2', floorNumber: 2,
                properties: [
                  { id: 'p-201', unitNumber: 'A-201', name: 'Căn hai phòng ngủ', capacity: 4, status: 'Cần bổ sung', hasAccessCredential: false },
                ],
              },
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
            floors: [
              {
                id: 'le-loi-f3', code: 'F03', name: 'Tầng 3', floorNumber: 3,
                properties: [
                  { id: 'p-301', unitNumber: 'B-301', name: 'Căn ven sông', capacity: 2, status: 'Đang hoạt động', hasAccessCredential: true },
                ],
              },
              {
                id: 'le-loi-f4', code: 'F04', name: 'Tầng 4', floorNumber: 4,
                properties: [
                  { id: 'p-401', unitNumber: 'B-401', name: 'Căn gia đình', capacity: 6, status: 'Bảo trì', hasAccessCredential: false },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'danang',
    code: 'DAD',
    name: 'Thành phố Đà Nẵng',
    areas: [
      {
        id: 'son-tra',
        name: 'Sơn Trà',
        code: 'ST',
        buildings: [
          {
            id: 'han-river',
            name: 'Tòa Hàn River',
            code: 'HR-01',
            address: '24 Trần Hưng Đạo',
            floors: [
              {
                id: 'han-river-f6', code: 'F06', name: 'Tầng 6', floorNumber: 6,
                properties: [
                  { id: 'p-601', unitNumber: 'C-601', name: 'Căn nhìn sông Hàn', capacity: 4, status: 'Đang hoạt động', hasAccessCredential: true },
                  { id: 'p-602', unitNumber: 'C-602', name: 'Căn góc thành phố', capacity: 3, status: 'Đang hoạt động', hasAccessCredential: true },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]

type PropertyView = 'structure' | 'list' | 'density'

type CreateKind = 'city' | 'area' | 'building' | 'floor' | 'unit'

interface CreateTarget {
  kind: CreateKind
  cityId?: string
  areaId?: string
  buildingId?: string
  floorId?: string
}

const createLabels: Record<CreateKind, string> = {
  city: 'thành phố',
  area: 'khu vực',
  building: 'tòa nhà',
  floor: 'tầng',
  unit: 'căn',
}

export function PropertyManagement() {
  const root = useRef<HTMLElement>(null)
  const [catalog, setCatalog] = useState(initialCities)
  const [cityId, setCityId] = useState('all')
  const [areaId, setAreaId] = useState('all')
  const [buildingId, setBuildingId] = useState('all')
  const [view, setView] = useState<PropertyView>('structure')
  const [activeFloors, setActiveFloors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null)
  const [form, setForm] = useState({
    name: '', code: '', address: '', cityId: '', areaId: '', buildingId: '', floorId: '',
    floorNumber: '', unitNumber: '', capacity: '2',
  })

  const availableAreas = useMemo(
    () => catalog.filter((city) => cityId === 'all' || city.id === cityId).flatMap((city) => city.areas),
    [catalog, cityId],
  )
  const availableBuildings = useMemo(
    () => availableAreas.filter((area) => areaId === 'all' || area.id === areaId).flatMap((area) => area.buildings),
    [availableAreas, areaId],
  )
  const visibleCities = useMemo(() => catalog
    .filter((city) => cityId === 'all' || city.id === cityId)
    .map((city) => ({
      ...city,
      areas: city.areas
        .filter((area) => areaId === 'all' || area.id === areaId)
        .map((area) => ({
          ...area,
          buildings: area.buildings.filter((building) => buildingId === 'all' || building.id === buildingId),
        }))
        .filter((area) => area.buildings.length > 0),
    }))
    .filter((city) => city.areas.length > 0), [catalog, cityId, areaId, buildingId])

  const visibleBuildings = visibleCities.flatMap((city) => city.areas.flatMap((area) => area.buildings))
  const visibleFloors = visibleBuildings.flatMap((building) => building.floors)
  const visibleUnits = visibleCities.flatMap((city) => city.areas.flatMap((area) => area.buildings.flatMap((building) =>
    building.floors.flatMap((floor) => floor.properties.map((unit) => ({ city, area, building, floor, unit }))))))

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('.property-management .building-board', { opacity: 0, y: 12 }, {
      opacity: 1, y: 0, duration: 0.38, stagger: 0.055, ease: 'power2.out',
    })
    gsap.fromTo('.property-management .unit-card', { opacity: 0, y: 6 }, {
      opacity: 1, y: 0, duration: 0.24, stagger: 0.025, delay: 0.04, ease: 'power2.out',
    })
    gsap.fromTo('.property-management .property-unit-row, .property-management .density-unit', { opacity: 0, y: 5 }, {
      opacity: 1, y: 0, duration: 0.22, stagger: 0.018, ease: 'power2.out',
    })
  }, { scope: root, dependencies: [cityId, areaId, buildingId, activeFloors, view], revertOnUpdate: true })

  function announce(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  function changeCity(nextCityId: string) {
    setCityId(nextCityId)
    setAreaId('all')
    setBuildingId('all')
  }

  function changeArea(nextAreaId: string) {
    setAreaId(nextAreaId)
    setBuildingId('all')
  }

  function openCreate(target: CreateTarget) {
    const requestedAreaId = target.areaId ?? (areaId !== 'all' ? areaId : '')
    const areaOwner = requestedAreaId ? catalog.find((city) => city.areas.some((area) => area.id === requestedAreaId)) : undefined
    const selectedCityId = target.cityId ?? (cityId !== 'all' ? cityId : areaOwner?.id ?? catalog[0]?.id ?? '')
    const selectedCity = catalog.find((city) => city.id === selectedCityId)
    const selectedAreaId = requestedAreaId || selectedCity?.areas[0]?.id || ''
    const selectedArea = selectedCity?.areas.find((area) => area.id === selectedAreaId)
    const selectedBuildingId = target.buildingId ?? (buildingId !== 'all' ? buildingId : selectedArea?.buildings[0]?.id ?? '')
    const selectedBuilding = selectedArea?.buildings.find((building) => building.id === selectedBuildingId)

    setCreateTarget(target)
    setForm({
      name: '', code: '', address: '', cityId: selectedCityId, areaId: selectedAreaId,
      buildingId: selectedBuildingId, floorId: target.floorId ?? selectedBuilding?.floors[0]?.id ?? '',
      floorNumber: '', unitNumber: '', capacity: '2',
    })
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!createTarget) return

    const id = crypto.randomUUID()
    const kind = createTarget.kind
    const missingName = kind !== 'unit' && (!form.name.trim() || !form.code.trim())
    const missingParent = (kind === 'area' && !form.cityId)
      || (kind === 'building' && !form.areaId)
      || (kind === 'floor' && !form.buildingId)
      || (kind === 'unit' && !form.floorId)
    if (missingName || missingParent || (kind === 'unit' && (!form.unitNumber.trim() || !form.name.trim()))) {
      announce('Vui lòng điền đủ thông tin bắt buộc.')
      return
    }

    setCatalog((current) => {
      if (kind === 'city') return [...current, { id, code: form.code.trim(), name: form.name.trim(), areas: [] }]
      return current.map((city) => {
        if (kind === 'area' && city.id === form.cityId) {
          return { ...city, areas: [...city.areas, { id, code: form.code.trim(), name: form.name.trim(), buildings: [] }] }
        }
        return { ...city, areas: city.areas.map((area) => {
          if (kind === 'building' && area.id === form.areaId) {
            return { ...area, buildings: [...area.buildings, { id, code: form.code.trim(), name: form.name.trim(), address: form.address.trim(), floors: [] }] }
          }
          return { ...area, buildings: area.buildings.map((building) => {
            if (kind === 'floor' && building.id === form.buildingId) {
              return { ...building, floors: [...building.floors, {
                id, code: form.code.trim(), name: form.name.trim(), floorNumber: Number(form.floorNumber) || 0, properties: [],
              }] }
            }
            return { ...building, floors: building.floors.map((floor) => {
              if (kind !== 'unit' || floor.id !== form.floorId) return floor
              return { ...floor, properties: [...floor.properties, {
                id, unitNumber: form.unitNumber.trim(), name: form.name.trim(),
                capacity: Math.max(1, Number(form.capacity) || 1), status: 'Cần bổ sung' as const,
                hasAccessCredential: false,
              }] }
            }) }
          }) }
        }) }
      })
    })
    setCreateTarget(null)
    announce(`Đã thêm ${createLabels[kind]}.`)
  }

  const formAreas = catalog.find((city) => city.id === form.cityId)?.areas ?? []
  const formBuildings = formAreas.find((area) => area.id === form.areaId)?.buildings ?? []
  const formFloors = formBuildings.find((building) => building.id === form.buildingId)?.floors ?? []

  return (
    <section ref={root} className="property-management" aria-labelledby="property-management-title">
      <header className="property-catalog-intro">
        <span className="property-catalog-icon"><Stack weight="duotone" /></span>
        <div><h2 id="property-management-title">Danh mục căn</h2><p>Thành phố · khu vực · tòa nhà · tầng · căn</p></div>
      </header>

      <section className="property-hierarchy" aria-label="Bộ lọc cấu trúc căn hộ">
        <div className="property-filter-grid">
          <div className="hierarchy-select">
            <MapPin /><label htmlFor="property-city">Thành phố</label>
            <select id="property-city" value={cityId} onChange={(event) => changeCity(event.target.value)}>
              <option value="all">Tất cả thành phố</option>
              {catalog.map((city) => <option value={city.id} key={city.id}>{city.name}</option>)}
            </select>
          </div>
          <div className="hierarchy-select">
            <MapPin /><label htmlFor="property-area">Khu vực</label>
            <select id="property-area" value={areaId} onChange={(event) => changeArea(event.target.value)}>
              <option value="all">Tất cả khu vực</option>
              {availableAreas.map((area) => <option value={area.id} key={area.id}>{area.name} · {area.code}</option>)}
            </select>
          </div>
          <div className="hierarchy-select">
            <Buildings /><label htmlFor="property-building">Tòa nhà</label>
            <select id="property-building" value={buildingId} onChange={(event) => setBuildingId(event.target.value)}>
              <option value="all">Tất cả tòa nhà</option>
              {availableBuildings.map((building) => <option value={building.id} key={building.id}>{building.name}</option>)}
            </select>
          </div>
        </div>

        <div className="property-filter-summary" aria-label="Số lượng đang hiển thị">
          <span><strong>{visibleBuildings.length}</strong> tòa</span>
          <span><strong>{visibleFloors.length}</strong> tầng</span>
          <span><strong>{visibleUnits.length}</strong> căn</span>
        </div>

        <div className="property-view-switcher" role="tablist" aria-label="Cách hiển thị kết quả">
          <button type="button" role="tab" className={view === 'structure' ? 'active' : ''} aria-selected={view === 'structure'} aria-label="Hiển thị theo cấu trúc" title="Cấu trúc" onClick={() => setView('structure')}><SquaresFour weight="bold" /></button>
          <button type="button" role="tab" className={view === 'list' ? 'active' : ''} aria-selected={view === 'list'} aria-label="Hiển thị dạng danh sách" title="Danh sách" onClick={() => setView('list')}><ListBullets weight="bold" /></button>
          <button type="button" role="tab" className={view === 'density' ? 'active' : ''} aria-selected={view === 'density'} aria-label="Hiển thị tổng quan nhiều căn" title="Tổng quan mật độ" onClick={() => setView('density')}><GridNine weight="bold" /></button>
        </div>

        <div className="property-filter-actions" aria-label="Thêm cấu trúc">
          <button className="hierarchy-add" type="button" onClick={() => openCreate({ kind: 'city' })}><Plus /> Thành phố</button>
          <button className="hierarchy-add" type="button" onClick={() => openCreate({ kind: 'area' })}><Plus /> Khu vực</button>
          <button className="hierarchy-add primary" type="button" onClick={() => openCreate({ kind: 'building' })}><Plus /> Tòa nhà</button>
        </div>
      </section>

      {view === 'structure' ? (
        <div className="property-tree">
          {visibleCities.map((city) => {
            const cityBuildings = city.areas.flatMap((area) => area.buildings)
            const cityUnits = cityBuildings.flatMap((building) => building.floors.flatMap((floor) => floor.properties))
            return <section className="property-city-group" key={city.id}>
              <header className="property-city-band">
                <div><MapPin weight="fill" /><h3>{city.name}</h3></div>
                <small>{city.areas.length} khu vực · {cityBuildings.length} tòa · {cityUnits.length} căn</small>
              </header>
              {city.areas.map((area) => <section className="property-area-group" key={area.id}>
                <header className="property-area-band">
                  <div><span aria-hidden="true" /><h4>{area.name}</h4></div>
                  <small>{area.buildings.length} tòa nhà</small>
                </header>
                <div className="building-list">
                  {area.buildings.map((building) => {
                    const selectedFloorId = activeFloors[building.id] ?? building.floors[0]?.id ?? ''
                    const selectedFloor = building.floors.find((floor) => floor.id === selectedFloorId) ?? building.floors[0]
                    return <article className="building-board" key={building.id}>
                      <div className="building-board-header">
                        <div className="building-title"><span className="building-icon"><Buildings weight="duotone" /></span><div><p>{building.code} · {building.address}</p><h3>{building.name}</h3></div></div>
                        <button className="building-edit" type="button" onClick={() => announce(`Đang chỉnh sửa ${building.name}`)}><PencilSimple /> Sửa tòa</button>
                      </div>

                      <div className="floor-bar">
                        <div className="floor-tabs" role="tablist" aria-label={`Tầng của ${building.name}`}>
                          {building.floors.map((floor) => <button className={selectedFloor?.id === floor.id ? 'active' : ''} key={floor.id} type="button" role="tab" aria-selected={selectedFloor?.id === floor.id} onClick={() => setActiveFloors((current) => ({ ...current, [building.id]: floor.id }))}>{floor.name}<small>{floor.properties.length} căn</small></button>)}
                        </div>
                        <button className="building-add-floor" type="button" onClick={() => openCreate({ kind: 'floor', cityId: city.id, areaId: area.id, buildingId: building.id })}><Plus /> Thêm tầng</button>
                      </div>

                      <div className="unit-grid">
                        <button className="add-unit-card" type="button" onClick={() => openCreate({ kind: 'unit', cityId: city.id, areaId: area.id, buildingId: building.id, floorId: selectedFloor?.id })}><span><Plus /></span><strong>Thêm căn</strong><small>{selectedFloor?.name ?? 'Chọn tầng'}</small></button>
                        {selectedFloor?.properties.map((unit) => <button className="unit-card" type="button" key={unit.id} onClick={() => announce(`Đã chọn căn ${unit.unitNumber}`)}><div className="unit-card-top"><span className={`unit-state-dot ${statusClass[unit.status]}`} title={unit.status} /><DoorOpen /></div><strong>{unit.unitNumber}</strong><span>{unit.name}</span><div className="unit-card-meta"><small>{unit.capacity} khách</small><small className={unit.hasAccessCredential ? 'credential-ready' : 'credential-missing'} title={unit.hasAccessCredential ? 'Đã cấu hình truy cập' : 'Thiếu thông tin truy cập'}><Key /></small></div></button>)}
                      </div>
                    </article>
                  })}
                </div>
              </section>)}
            </section>
          })}
          {!visibleCities.length && <div className="building-empty">Không có cấu trúc phù hợp với bộ lọc.</div>}
        </div>
      ) : view === 'list' ? (
        <section className="property-unit-directory" aria-label="Danh sách căn">
          <header><div><span>Danh sách căn</span><strong>{visibleUnits.length} căn đang hiển thị</strong></div><small>{visibleUnits.filter(({ unit }) => unit.hasAccessCredential).length}/{visibleUnits.length} căn đã cấu hình truy cập</small></header>
          <div className="property-unit-table-head" aria-hidden="true"><span>Căn</span><span>Vị trí</span><span>Sức chứa</span><span>Trạng thái</span><span>Truy cập</span></div>
          <div className="property-unit-rows">
            {visibleUnits.map(({ city, area, building, floor, unit }) => <button className="property-unit-row" type="button" key={unit.id} onClick={() => announce(`Đã chọn căn ${unit.unitNumber}`)}>
              <span><strong>{unit.unitNumber}</strong><small>{unit.name}</small></span>
              <span><strong>{building.name} · {floor.name}</strong><small>{city.name} · {area.name}</small></span>
              <span><strong>{unit.capacity} khách</strong><small>{floor.code}</small></span>
              <span className={`unit-status ${statusClass[unit.status]}`}>{unit.status}</span>
              <span className={unit.hasAccessCredential ? 'credential-ready' : 'credential-missing'}><Key />{unit.hasAccessCredential ? 'Đã cấu hình' : 'Chưa cấu hình'}</span>
            </button>)}
            {!visibleUnits.length && <div className="building-empty">Không có căn phù hợp với bộ lọc.</div>}
          </div>
        </section>
      ) : (
        <section className="property-density-view" aria-label="Tổng quan mật độ căn">
          <header className="property-density-heading">
            <div><span>Tổng quan căn</span><strong>{visibleUnits.length} căn trong {visibleBuildings.length} tòa</strong></div>
            <div className="property-density-legend" aria-label="Chú giải trạng thái">
              <span><i className="active" />Đang hoạt động</span>
              <span><i className="maintenance" />Bảo trì</span>
              <span><i className="missing" />Cần bổ sung</span>
            </div>
          </header>
          <div className="density-building-list">
            {visibleCities.flatMap((city) => city.areas.flatMap((area) => area.buildings.map((building) => {
              const buildingUnits = building.floors.flatMap((floor) => floor.properties)
              return <article className="density-building" key={building.id}>
                <header>
                  <div><Buildings weight="duotone" /><span><strong>{building.name}</strong><small>{city.name} · {area.name}</small></span></div>
                  <small>{building.floors.length} tầng · {buildingUnits.length} căn</small>
                </header>
                <div className="density-floor-list">
                  {building.floors.map((floor) => <section className="density-floor" key={floor.id}>
                    <header><strong>{floor.name}</strong><small>{floor.properties.length} căn</small></header>
                    <div className="density-unit-grid">
                      {floor.properties.map((unit) => <button className={`density-unit ${statusClass[unit.status]}`} type="button" key={unit.id} aria-label={`${unit.unitNumber}, ${unit.name}, ${unit.status}`} title={`${unit.unitNumber} · ${unit.name} · ${unit.status}`} onClick={() => announce(`Đã chọn căn ${unit.unitNumber}`)}><span>{unit.unitNumber}</span>{!unit.hasAccessCredential && <Key weight="fill" />}</button>)}
                      <button className="density-add-unit" type="button" aria-label={`Thêm căn vào ${floor.name}`} title={`Thêm căn vào ${floor.name}`} onClick={() => openCreate({ kind: 'unit', cityId: city.id, areaId: area.id, buildingId: building.id, floorId: floor.id })}><Plus weight="bold" /></button>
                    </div>
                  </section>)}
                </div>
              </article>
            })))}
            {!visibleUnits.length && <div className="building-empty">Không có căn phù hợp với bộ lọc.</div>}
          </div>
        </section>
      )}

      {createTarget && <div className="property-form-backdrop" role="presentation">
        <section className="property-form-dialog" role="dialog" aria-modal="true" aria-labelledby="property-form-title">
          <header><div><span>Thêm mới</span><h3 id="property-form-title">{createLabels[createTarget.kind]}</h3></div><button type="button" aria-label="Đóng" onClick={() => setCreateTarget(null)}><X /></button></header>
          <form onSubmit={submitCreate}>
            {createTarget.kind !== 'city' && <label>Thành phố<select value={form.cityId} required onChange={(event) => setForm((current) => ({ ...current, cityId: event.target.value, areaId: '', buildingId: '', floorId: '' }))}><option value="">Chọn thành phố</option>{catalog.map((city) => <option value={city.id} key={city.id}>{city.name}</option>)}</select></label>}
            {['building', 'floor', 'unit'].includes(createTarget.kind) && <label>Khu vực<select value={form.areaId} required onChange={(event) => setForm((current) => ({ ...current, areaId: event.target.value, buildingId: '', floorId: '' }))}><option value="">Chọn khu vực</option>{formAreas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label>}
            {['floor', 'unit'].includes(createTarget.kind) && <label>Tòa nhà<select value={form.buildingId} required onChange={(event) => setForm((current) => ({ ...current, buildingId: event.target.value, floorId: '' }))}><option value="">Chọn tòa nhà</option>{formBuildings.map((building) => <option value={building.id} key={building.id}>{building.name}</option>)}</select></label>}
            {createTarget.kind === 'unit' && <label>Tầng<select value={form.floorId} required onChange={(event) => setForm((current) => ({ ...current, floorId: event.target.value }))}><option value="">Chọn tầng</option>{formFloors.map((floor) => <option value={floor.id} key={floor.id}>{floor.name}</option>)}</select></label>}
            <div className="property-form-fields">
              {createTarget.kind === 'unit' ? <label>Số căn<input autoFocus required value={form.unitNumber} onChange={(event) => setForm((current) => ({ ...current, unitNumber: event.target.value }))} placeholder="A-101" /></label> : <label>Mã<input autoFocus required value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="Mã ngắn gọn" /></label>}
              <label>Tên<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={`Tên ${createLabels[createTarget.kind]}`} /></label>
              {createTarget.kind === 'building' && <label className="wide">Địa chỉ<input required value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="Số nhà, đường" /></label>}
              {createTarget.kind === 'floor' && <label>Số tầng<input type="number" value={form.floorNumber} onChange={(event) => setForm((current) => ({ ...current, floorNumber: event.target.value }))} placeholder="1" /></label>}
              {createTarget.kind === 'unit' && <label>Sức chứa<input type="number" min="1" required value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))} /></label>}
            </div>
            <footer><button type="button" onClick={() => setCreateTarget(null)}>Hủy</button><button className="primary" type="submit"><Plus /> Thêm {createLabels[createTarget.kind]}</button></footer>
          </form>
        </section>
      </div>}

      {notice && <div className="property-management-toast" role="status">{notice}</div>}
    </section>
  )
}
