import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  Buildings, DoorOpen, FileText, GridNine, HouseLine, ListBullets, MagnifyingGlass,
  MapPin, Plus, SpinnerGap, SquaresFour, UserPlus, X,
} from '@phosphor-icons/react'
import {
  createOwnerContract, createPropertyStructure, createPropertyUnit, createUserProfile,
  fetchOwnerContracts, fetchPropertyPortfolio, fetchUserDirectory,
  type BackofficeViewer, type OwnerContractRecord, type PropertyOperatingModel,
  type PropertyPortfolio, type PropertyUnitRecord, type UserDirectoryEntry,
} from '@vistay/admin-api-client'
import { VIETNAM_ADMINISTRATIVE_UNITS } from './vietnamAdministrativeUnits'

type PropertyView = 'structure' | 'list' | 'density'
export type PropertySection = 'portfolio' | 'owned' | 'leased' | 'management' | 'contracts'
type CreateKind = 'city' | 'area' | 'building' | 'floor' | 'unit'
type CreateTarget = { kind: CreateKind; parentId?: string }

const modelCopy: Record<PropertyOperatingModel, { label: string; short: string }> = {
  OWNED: { label: 'Sở hữu', short: 'Sở hữu' },
  LEASED_BY_VISTAY: { label: 'Thuê vận hành', short: 'Thuê' },
  MANAGEMENT: { label: 'Quản lý', short: 'Quản lý' },
}

const statusCopy: Record<string, string> = {
  ONBOARDING: 'Đang thiết lập', ACTIVE: 'Đang hoạt động', MAINTENANCE: 'Bảo trì',
  SUSPENDED: 'Tạm ngưng', OFFBOARDING: 'Đang bàn giao', INACTIVE: 'Ngừng hoạt động',
}
const CONTRACT_TODAY = new Date().toISOString().slice(0, 10)
const CONTRACT_NEXT_YEAR = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
const CONTRACT_NUMBER = `HD-${Date.now().toString().slice(-8)}`

export function PropertyManagement({ graphqlUrl, accessToken, viewer, section }: {
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
  section: PropertySection
}) {
  const root = useRef<HTMLElement>(null)
  const [portfolio, setPortfolio] = useState<PropertyPortfolio>({ branches: [], cities: [] })
  const [contracts, setContracts] = useState<OwnerContractRecord[]>([])
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('ALL')
  const [areaFilter, setAreaFilter] = useState('ALL')
  const [buildingFilter, setBuildingFilter] = useState('ALL')
  const [view, setView] = useState<PropertyView>('structure')
  const [activeFloors, setActiveFloors] = useState<Record<string, string>>({})
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [contractOpen, setContractOpen] = useState(false)
  const [selectedUnit, setSelectedUnit] = useState<PropertyUnitRecord | null>(null)
  const [hosts, setHosts] = useState<UserDirectoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [contractMessage, setContractMessage] = useState('')

  const canCreateProperty = viewer.permissions.includes('property:create')
  const canReadContracts = viewer.permissions.includes('contract:read')
  const canCreateContract = viewer.permissions.includes('contract:create')
  const canCreateHost = viewer.permissions.includes('host-profile:create')
  const model: PropertyOperatingModel | 'ALL' = section === 'owned' ? 'OWNED'
    : section === 'leased' ? 'LEASED_BY_VISTAY'
      : section === 'management' ? 'MANAGEMENT' : 'ALL'
  const isContractSection = section === 'contracts'

  const areaOptions = useMemo(() => portfolio.cities
    .filter((city) => cityFilter === 'ALL' || city.id === cityFilter)
    .flatMap((city) => city.areas.map((area) => ({ id: area.id, name: area.name }))), [cityFilter, portfolio.cities])
  const buildingOptions = useMemo(() => portfolio.cities
    .filter((city) => cityFilter === 'ALL' || city.id === cityFilter)
    .flatMap((city) => city.areas
      .filter((area) => areaFilter === 'ALL' || area.id === areaFilter)
      .flatMap((area) => area.buildings.map((building) => ({ id: building.id, name: building.name })))), [areaFilter, cityFilter, portfolio.cities])

  const hierarchy = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi')
    return portfolio.cities.filter((city) => cityFilter === 'ALL' || city.id === cityFilter).map((city) => ({
      ...city,
      areas: city.areas.filter((area) => areaFilter === 'ALL' || area.id === areaFilter).map((area) => ({
        ...area,
        buildings: area.buildings.filter((building) => buildingFilter === 'ALL' || building.id === buildingFilter).map((building) => ({
          ...building,
          floors: building.floors.map((floor) => ({
            ...floor,
            units: floor.units.filter((unit) => {
              const modelMatch = model === 'ALL' || unit.operatingModel === model
              const searchMatch = !query || `${city.name} ${area.name} ${building.name} ${building.address} ${floor.name} ${unit.code} ${unit.unitNumber ?? ''} ${unit.name}`.toLocaleLowerCase('vi').includes(query)
              return modelMatch && searchMatch
            }),
          })).filter((floor) => floor.units.length > 0 || (!query && model === 'ALL')),
        })).filter((building) => building.floors.length > 0),
      })).filter((area) => area.buildings.length > 0),
    })).filter((city) => city.areas.length > 0)
  }, [areaFilter, buildingFilter, cityFilter, model, portfolio.cities, search])

  const units = useMemo(() => hierarchy.flatMap((city) => city.areas.flatMap((area) => area.buildings.flatMap((building) =>
    building.floors.flatMap((floor) => floor.units.map((unit) => ({ city, area, building, floor, unit })))))), [hierarchy])
  const buildingCount = hierarchy.reduce((count, city) => count + city.areas.reduce((sum, area) => sum + area.buildings.length, 0), 0)

  async function load(signal?: AbortSignal) {
    setLoading(true)
    setMessage('')
    setContractMessage('')
    try {
      const nextPortfolio = await fetchPropertyPortfolio(graphqlUrl, accessToken, {}, signal)
      setPortfolio(nextPortfolio)
      if (canReadContracts) {
        try { setContracts(await fetchOwnerContracts(graphqlUrl, accessToken, {}, signal)) }
        catch (error) {
          if (!signal?.aborted) setContractMessage(error instanceof Error ? error.message : 'Không tải được hợp đồng')
        }
      }
    } catch (error) {
      if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Không tải được danh mục căn')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [accessToken, graphqlUrl])

  useGSAP(() => {
    if (!root.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('.property-result-item', { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: .24, stagger: .018, ease: 'power2.out' })
  }, { scope: root, dependencies: [section, model, view, loading], revertOnUpdate: true })

  async function openContract(unit?: PropertyUnitRecord) {
    setSelectedUnit(unit ?? units[0]?.unit ?? null)
    setContractOpen(true)
    if (!hosts.length) {
      try {
        const page = await fetchUserDirectory(graphqlUrl, accessToken, { accountType: 'HOST', first: 100 })
        setHosts(page.nodes)
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Không tải được chủ nhà') }
    }
  }

  return (
    <section ref={root} className="property-management property-operations" aria-label="Quản lý căn hộ">
      <div className={`property-command-row${isContractSection ? ' contract-mode' : ''}`}>
        {!isContractSection && <div className="property-compact-metrics" aria-label="Tóm tắt danh mục">
          <div><span>Tòa nhà</span><strong>{buildingCount}</strong></div>
          <div><span>Căn</span><strong>{units.length}</strong></div>
          <div><span>Hoạt động</span><strong>{units.filter(({ unit }) => unit.operationalStatus === 'ACTIVE').length}</strong></div>
        </div>}
        {!isContractSection && <div className="property-location-filters" aria-label="Lọc vị trí">
          <label><span>Thành phố</span><select value={cityFilter} onChange={(event) => { setCityFilter(event.target.value); setAreaFilter('ALL'); setBuildingFilter('ALL') }}><option value="ALL">Tất cả</option>{portfolio.cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
          <label><span>Khu vực</span><select value={areaFilter} onChange={(event) => { setAreaFilter(event.target.value); setBuildingFilter('ALL') }}><option value="ALL">Tất cả</option>{areaOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
          <label><span>Tòa</span><select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}><option value="ALL">Tất cả</option>{buildingOptions.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}</select></label>
        </div>}
        <label className="property-search-control"><MagnifyingGlass /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={section === 'contracts' ? 'Tìm hợp đồng, chủ nhà hoặc căn' : 'Tìm thành phố, tòa, tầng hoặc căn'} /></label>
        {!isContractSection && <div className="property-view-control" role="group" aria-label="Kiểu hiển thị">
          <button className={view === 'structure' ? 'active' : ''} onClick={() => setView('structure')} title="Cấu trúc"><SquaresFour /></button>
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} title="Danh sách"><ListBullets /></button>
          <button className={view === 'density' ? 'active' : ''} onClick={() => setView('density')} title="Mật độ"><GridNine /></button>
        </div>}
        <div className="property-command-actions">
          {!isContractSection && canCreateProperty && <div className="property-create-control">
            <button type="button" aria-expanded={createMenuOpen} onClick={() => setCreateMenuOpen((current) => !current)}><Plus />Thêm mới</button>
            {createMenuOpen && <div className="property-create-menu" role="menu">
              {([
                ['city', 'Thành phố'], ['area', 'Khu vực'], ['building', 'Tòa nhà'], ['floor', 'Tầng'], ['unit', 'Căn hộ'],
              ] as Array<[CreateKind, string]>).map(([kind, label]) => <button type="button" role="menuitem" key={kind} onClick={() => { setCreateTarget({ kind }); setCreateMenuOpen(false) }}>{label}</button>)}
            </div>}
          </div>}
          {isContractSection && canCreateContract && <button onClick={() => void openContract()}><Plus />Tạo hợp đồng</button>}
        </div>
      </div>

      {message && <p className="property-inline-message" role="status">{message}</p>}
      {isContractSection && contractMessage && <p className="property-inline-message" role="alert">{contractMessage}</p>}

      {!isContractSection ? <>
        <div className="property-results">
          {loading ? <div className="property-state"><SpinnerGap className="spinner" /><strong>Đang tải danh mục</strong></div>
            : view === 'structure' ? <StructureView hierarchy={hierarchy} activeFloors={activeFloors} setActiveFloors={setActiveFloors} canCreate={canCreateProperty} onCreate={(kind, parentId) => setCreateTarget({ kind, parentId })} onContract={openContract} />
              : view === 'list' ? <ListView units={units} onContract={openContract} />
                : <DensityView units={units} />}
          {!loading && units.length === 0 && <div className="property-state"><HouseLine /><strong>Chưa có căn phù hợp</strong><span>Đổi bộ lọc hoặc tạo căn đầu tiên trong khu vực này.</span></div>}
        </div>
      </> : <ContractView contracts={contracts} units={units} search={search} onCreate={() => void openContract()} canCreate={canCreateContract} />}

      {createTarget && <StructureDialog kind={createTarget.kind} initialParentId={createTarget.parentId} portfolio={portfolio} graphqlUrl={graphqlUrl} accessToken={accessToken}
        onClose={() => setCreateTarget(null)} onSaved={() => { setCreateTarget(null); void load() }} setBusy={setBusy} busy={busy} setMessage={setMessage} />}
      {contractOpen && <ContractDialog graphqlUrl={graphqlUrl} accessToken={accessToken} units={units.map(({ unit }) => unit)} hosts={hosts}
        selectedUnit={selectedUnit} canCreateHost={canCreateHost} busy={busy} setBusy={setBusy} setHosts={setHosts}
        onClose={() => setContractOpen(false)} setMessage={setMessage} onSaved={() => { setContractOpen(false); void load() }} />}
    </section>
  )
}

function StructureView({ hierarchy, activeFloors, setActiveFloors, canCreate, onCreate, onContract }: {
  hierarchy: PropertyPortfolio['cities']; activeFloors: Record<string, string>
  setActiveFloors: React.Dispatch<React.SetStateAction<Record<string, string>>>
  canCreate: boolean; onCreate: (kind: CreateKind, parentId?: string) => void; onContract: (unit: PropertyUnitRecord) => Promise<void>
}) {
  return <div className="property-tree-refined">{hierarchy.map((city) => <section className="property-result-item property-city-section" key={city.id}>
    <header><div><MapPin weight="fill" /><strong>{city.name}</strong><small>{city.code}</small></div><span>{city.areas.length} khu vực</span></header>
    {city.areas.map((area) => <div className="property-area-section" key={area.id}>
      <div className="property-area-title"><strong>{area.name}</strong><span>{area.buildings.length} tòa</span></div>
      <div className="property-building-grid">{area.buildings.map((building) => {
        const activeId = activeFloors[building.id] ?? building.floors[0]?.id
        const floor = building.floors.find((item) => item.id === activeId) ?? building.floors[0]
        return <article className="property-building-card" key={building.id}>
          <header><div><Buildings /><span><strong>{building.name}</strong><small>{building.code} · {building.address}</small></span></div>{canCreate && <button onClick={() => onCreate('floor', building.id)}><Plus />Tầng</button>}</header>
          <div className="property-floor-tabs">{building.floors.map((item) => <button className={item.id === floor?.id ? 'active' : ''} key={item.id} onClick={() => setActiveFloors((current) => ({ ...current, [building.id]: item.id }))}>{item.name}<small>{item.units.length}</small></button>)}</div>
          <div className="property-unit-grid">{floor?.units.map((unit) => <article className="property-unit-tile" key={unit.id}>
            <div><span className={`property-status-dot ${unit.operationalStatus.toLowerCase()}`} /><DoorOpen /></div>
            <strong>{unit.unitNumber || unit.code}</strong><span>{unit.name}</span>
            <footer><small>{unit.capacity} khách · {modelCopy[unit.operatingModel].short}</small><button onClick={() => void onContract(unit)} title="Tạo hợp đồng"><FileText /></button></footer>
          </article>)}</div>
        </article>
      })}</div>
    </div>)}
  </section>)}</div>
}

function ListView({ units, onContract }: { units: ReturnType<typeof unitRows>; onContract: (unit: PropertyUnitRecord) => Promise<void> }) {
  return <div className="property-list-view"><div className="property-list-head"><span>Căn</span><span>Vị trí</span><span>Vận hành</span><span>Sức chứa</span><span>Trạng thái</span><span /></div>
    {units.map(({ city, area, building, floor, unit }) => <article className="property-result-item property-list-row" key={unit.id}>
      <span><strong>{unit.unitNumber || unit.code}</strong><small>{unit.name}</small></span>
      <span><strong>{building.name}</strong><small>{city.name} · {area.name} · {floor.name}</small></span>
      <span><i>{modelCopy[unit.operatingModel].label}</i></span><span>{unit.capacity} khách</span>
      <span><i className={`status ${unit.operationalStatus.toLowerCase()}`}>{statusCopy[unit.operationalStatus] ?? unit.operationalStatus}</i></span>
      <button onClick={() => void onContract(unit)}><FileText />Hợp đồng</button>
    </article>)}</div>
}

function DensityView({ units }: { units: ReturnType<typeof unitRows> }) {
  return <div className="property-density-view">{units.map(({ building, floor, unit }) => <article className={`property-result-item property-density-unit ${unit.operationalStatus.toLowerCase()}`} key={unit.id} title={`${building.name} · ${floor.name} · ${unit.name}`}><strong>{unit.unitNumber || unit.code}</strong><small>{modelCopy[unit.operatingModel].short}</small></article>)}</div>
}

function ContractView({ contracts, units, search, onCreate, canCreate }: { contracts: OwnerContractRecord[]; units: ReturnType<typeof unitRows>; search: string; onCreate: () => void; canCreate: boolean }) {
  const query = search.trim().toLocaleLowerCase('vi')
  const names = new Map(units.map(({ unit }) => [unit.id, unit.name]))
  const visible = contracts.filter((contract) => !query || `${contract.contractNumber} ${contract.status} ${contract.parties.map((party) => party.hostProfileId).join(' ')} ${contract.propertyTerms.map((term) => names.get(term.propertyId) ?? term.propertyId).join(' ')}`.toLocaleLowerCase('vi').includes(query))
  return <div className="contract-workspace">
    <div className="contract-summary"><div><span>Tổng hợp đồng</span><strong>{contracts.length}</strong></div><div><span>Đang hiệu lực</span><strong>{contracts.filter((item) => item.status === 'ACTIVE').length}</strong></div><div><span>Sắp hết hạn</span><strong>{contracts.filter((item) => item.status === 'EXPIRING').length}</strong></div></div>
    <div className="contract-list"><div className="contract-list-head"><span>Hợp đồng</span><span>Căn & mô hình</span><span>Chủ nhà</span><span>Thời hạn</span><span>Trạng thái</span></div>
      {visible.map((contract) => <article className="property-result-item contract-row" key={contract.id}>
        <span><strong>{contract.contractNumber}</strong><small>v{contract.version}</small></span>
        <span><strong>{names.get(contract.propertyTerms[0]?.propertyId) ?? contract.propertyTerms[0]?.propertyId}</strong><small>{contract.propertyTerms[0] ? modelCopy[contract.propertyTerms[0].operatingModel].label : '—'}</small></span>
        <span><strong>{contract.parties[0]?.hostProfileId ?? '—'}</strong><small>{contract.parties[0]?.partyRole ?? ''}</small></span>
        <span><strong>{contract.startDate}</strong><small>đến {contract.endDate}</small></span><span><i className={`contract-status ${contract.status.toLowerCase()}`}>{contract.status}</i></span>
      </article>)}
      {!visible.length && <div className="property-state"><FileText /><strong>Chưa có hợp đồng phù hợp</strong>{canCreate && <button onClick={onCreate}><Plus />Tạo hợp đồng</button>}</div>}
    </div>
  </div>
}

function StructureDialog({ kind, initialParentId, portfolio, graphqlUrl, accessToken, onClose, onSaved, busy, setBusy, setMessage }: {
  kind: CreateKind; initialParentId?: string; portfolio: PropertyPortfolio; graphqlUrl: string; accessToken: string; onClose: () => void; onSaved: () => void
  busy: boolean; setBusy: (value: boolean) => void; setMessage: (value: string) => void
}) {
  const areas = portfolio.cities.flatMap((city) => city.areas)
  const buildings = areas.flatMap((area) => area.buildings)
  const floors = buildings.flatMap((building) => building.floors)
  const availableCities = VIETNAM_ADMINISTRATIVE_UNITS.filter((unit) => !portfolio.cities.some((city) => city.code === unit.code))
  const defaultCity = availableCities[0]
  const [form, setForm] = useState({ code: kind === 'city' ? defaultCity?.code ?? '' : '', name: kind === 'city' ? defaultCity?.name ?? '' : '', address: '', cityId: kind === 'area' && initialParentId ? initialParentId : portfolio.cities[0]?.id ?? '', areaId: kind === 'building' && initialParentId ? initialParentId : areas[0]?.id ?? '', buildingId: kind === 'floor' && initialParentId ? initialParentId : buildings[0]?.id ?? '', floorId: kind === 'unit' && initialParentId ? initialParentId : floors[0]?.id ?? '', branchId: portfolio.branches[0]?.id ?? '', floorNumber: '', unitNumber: '', operatingModel: 'MANAGEMENT' as PropertyOperatingModel, areaSqm: '', bedrooms: '1', bathrooms: '1', capacity: '2', price: '' })
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    try {
      if (kind === 'unit') await createPropertyUnit(graphqlUrl, accessToken, { floorId: form.floorId, branchId: form.branchId, code: form.code, unitNumber: form.unitNumber, name: form.name, operatingModel: form.operatingModel, areaSqm: form.areaSqm || undefined, bedroomCount: Number(form.bedrooms), bathroomCount: Number(form.bathrooms), capacity: Number(form.capacity), basePricePerNight: form.price || undefined, currency: 'VND' })
      else await createPropertyStructure(graphqlUrl, accessToken, kind, kind === 'city' ? { code: form.code, name: form.name } : kind === 'area' ? { cityId: form.cityId, code: form.code, name: form.name } : kind === 'building' ? { areaId: form.areaId, code: form.code, name: form.name, address: form.address } : { buildingId: form.buildingId, code: form.code, name: form.name, floorNumber: form.floorNumber ? Number(form.floorNumber) : null })
      setMessage('Đã lưu cấu trúc căn hộ.'); onSaved()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể lưu cấu trúc') }
    finally { setBusy(false) }
  }
  return <div className="dialog-backdrop property-dialog-backdrop"><form className="property-dialog" onSubmit={submit}>
    <header><div><strong>{kind === 'unit' ? 'Thêm căn hộ' : `Thêm ${kind === 'floor' ? 'tầng' : kind === 'building' ? 'tòa nhà' : kind === 'area' ? 'khu vực' : 'thành phố'}`}</strong><span>Thông tin được lưu trực tiếp vào danh mục vận hành.</span></div><button type="button" onClick={onClose}><X /></button></header>
    <div className="property-dialog-body">
      {kind === 'city' && <Field label="Tỉnh/thành phố Việt Nam" wide><select required value={form.code} onChange={(event) => {
        const city = VIETNAM_ADMINISTRATIVE_UNITS.find((unit) => unit.code === event.target.value)
        setForm({ ...form, code: city?.code ?? '', name: city?.name ?? '' })
      }}><option value="">Chọn tỉnh/thành phố</option>{availableCities.map((unit) => <option key={unit.code} value={unit.code}>{unit.type === 'CITY' ? 'Thành phố' : 'Tỉnh'} {unit.name} · {unit.code}</option>)}</select></Field>}
      {kind === 'area' && <Field label="Thành phố"><select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>{portfolio.cities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
      {kind === 'building' && <Field label="Khu vực"><select value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>{areas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
      {kind === 'floor' && <Field label="Tòa nhà"><select value={form.buildingId} onChange={(e) => setForm({ ...form, buildingId: e.target.value })}>{buildings.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
      {kind === 'unit' && <><Field label="Tầng"><select value={form.floorId} onChange={(e) => setForm({ ...form, floorId: e.target.value })}>{floors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Chi nhánh"><select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>{portfolio.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></>}
      {kind !== 'city' && <><Field label="Mã *"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field><Field label="Tên *"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field></>}
      {kind === 'building' && <Field label="Địa chỉ *" wide><input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>}
      {kind === 'floor' && <Field label="Số tầng"><input type="number" value={form.floorNumber} onChange={(e) => setForm({ ...form, floorNumber: e.target.value })} /></Field>}
      {kind === 'unit' && <><Field label="Số căn"><input value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} /></Field><Field label="Mô hình"><select value={form.operatingModel} onChange={(e) => setForm({ ...form, operatingModel: e.target.value as PropertyOperatingModel })}>{Object.entries(modelCopy).map(([value, copy]) => <option key={value} value={value}>{copy.label}</option>)}</select></Field><Field label="Diện tích (m²)"><input type="number" value={form.areaSqm} onChange={(e) => setForm({ ...form, areaSqm: e.target.value })} /></Field><Field label="Sức chứa"><input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field><Field label="Phòng ngủ"><input type="number" min="0" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} /></Field><Field label="Phòng tắm"><input type="number" min="0" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} /></Field><Field label="Giá cơ sở"><input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field></>}
    </div><footer><button type="button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={busy}>{busy ? <SpinnerGap className="spinner" /> : null}Lưu</button></footer>
  </form></div>
}

function ContractDialog({ graphqlUrl, accessToken, units, hosts, selectedUnit, canCreateHost, busy, setBusy, setHosts, onClose, onSaved, setMessage }: {
  graphqlUrl: string; accessToken: string; units: PropertyUnitRecord[]; hosts: UserDirectoryEntry[]; selectedUnit: PropertyUnitRecord | null
  canCreateHost: boolean; busy: boolean; setBusy: (value: boolean) => void; setHosts: React.Dispatch<React.SetStateAction<UserDirectoryEntry[]>>
  onClose: () => void; onSaved: () => void; setMessage: (value: string) => void
}) {
  const [newHost, setNewHost] = useState(false)
  const [hostForm, setHostForm] = useState({ name: '', email: '', phone: '' })
  const [form, setForm] = useState({ number: CONTRACT_NUMBER, propertyId: selectedUnit?.id ?? units[0]?.id ?? '', hostId: hosts[0]?.profileId ?? '', model: selectedUnit?.operatingModel ?? 'MANAGEMENT' as PropertyOperatingModel, startDate: CONTRACT_TODAY, endDate: CONTRACT_NEXT_YEAR, fixedAmount: '', fee: '15', notes: '' })
  async function createHostNow() {
    setBusy(true)
    try {
      const host = await createUserProfile(graphqlUrl, accessToken, { accountType: 'HOST', fullName: hostForm.name, email: hostForm.email || undefined, contactPhone: hostForm.phone || undefined, reason: 'Tạo chủ nhà trong luồng lập hợp đồng', idempotencyKey: crypto.randomUUID() })
      const entry: UserDirectoryEntry = {
        profileId: host.profileId, accountId: host.accountId, accountType: 'HOST', displayName: host.displayName,
        email: host.email, contactPhone: host.contactPhone, status: host.status, referenceCode: host.referenceCode,
        subtype: host.subtype, verificationStatus: host.verificationStatus, joinedOn: host.relevantDate,
        createdAt: host.createdAt, updatedAt: host.updatedAt,
      }
      setHosts((current) => [entry, ...current]); setForm((current) => ({ ...current, hostId: host.profileId })); setNewHost(false)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không tạo được chủ nhà') }
    finally { setBusy(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true)
    try {
      await createOwnerContract(graphqlUrl, accessToken, { contractNumber: form.number, propertyId: form.propertyId, hostProfileId: form.hostId, operatingModel: form.model, startDate: form.startDate, endDate: form.endDate, fixedAmount: form.model === 'LEASED_BY_VISTAY' ? form.fixedAmount : undefined, managementFeePercent: form.model === 'MANAGEMENT' ? form.fee : undefined, paymentPeriod: 'MONTH', paymentCycleCount: 1, currency: 'VND', status: 'ACTIVE', notes: form.notes || undefined })
      setMessage('Đã tạo hợp đồng và gắn chủ nhà với căn.'); onSaved()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không tạo được hợp đồng') }
    finally { setBusy(false) }
  }
  return <div className="dialog-backdrop property-dialog-backdrop"><form className="property-dialog contract-dialog" onSubmit={submit}>
    <header><div><strong>Tạo hợp đồng chủ nhà</strong><span>Hợp đồng xác lập chủ nhà và mô hình vận hành của căn.</span></div><button type="button" onClick={onClose}><X /></button></header>
    <div className="property-dialog-body"><Field label="Số hợp đồng *"><input required value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value.toUpperCase() })} /></Field><Field label="Căn *"><select value={form.propertyId} onChange={(e) => { const unit = units.find((item) => item.id === e.target.value); setForm({ ...form, propertyId: e.target.value, model: unit?.operatingModel ?? form.model }) }}>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unitNumber || unit.code} · {unit.name}</option>)}</select></Field>
      <Field label="Chủ nhà *" wide><div className="inline-select-action"><select required value={form.hostId} onChange={(e) => setForm({ ...form, hostId: e.target.value })}><option value="">Chọn chủ nhà</option>{hosts.map((host) => <option key={host.profileId} value={host.profileId}>{host.displayName} · {host.email || host.contactPhone || host.profileId}</option>)}</select>{canCreateHost && <button type="button" onClick={() => setNewHost((value) => !value)}><UserPlus />Tạo mới</button>}</div></Field>
      {newHost && <div className="inline-host-form"><input placeholder="Họ tên" value={hostForm.name} onChange={(e) => setHostForm({ ...hostForm, name: e.target.value })} /><input placeholder="Email" value={hostForm.email} onChange={(e) => setHostForm({ ...hostForm, email: e.target.value })} /><input placeholder="Điện thoại" value={hostForm.phone} onChange={(e) => setHostForm({ ...hostForm, phone: e.target.value })} /><button type="button" disabled={busy || !hostForm.name || (!hostForm.email && !hostForm.phone)} onClick={() => void createHostNow()}>Tạo và chọn</button></div>}
      <Field label="Mô hình"><select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value as PropertyOperatingModel })}>{Object.entries(modelCopy).map(([value, copy]) => <option key={value} value={value}>{copy.label}</option>)}</select></Field><Field label="Hiệu lực từ"><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field><Field label="Đến ngày"><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
      {form.model === 'LEASED_BY_VISTAY' && <Field label="Tiền thuê/tháng *"><input required type="number" min="0" value={form.fixedAmount} onChange={(e) => setForm({ ...form, fixedAmount: e.target.value })} /></Field>}{form.model === 'MANAGEMENT' && <Field label="Phí quản lý (%) *"><input required type="number" min="0" max="100" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} /></Field>}<Field label="Ghi chú" wide><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
    </div><footer><button type="button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={busy || !form.propertyId || !form.hostId}>{busy ? <SpinnerGap className="spinner" /> : null}Tạo hợp đồng</button></footer>
  </form></div>
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? 'wide' : ''}><span>{label}</span>{children}</label> }
function unitRows(cities: PropertyPortfolio['cities']) { return cities.flatMap((city) => city.areas.flatMap((area) => area.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.units.map((unit) => ({ city, area, building, floor, unit })))))) }
