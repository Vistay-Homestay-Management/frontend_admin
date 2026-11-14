import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetch as expoFetch } from 'expo/fetch'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { fetchPropertyAdminWorkspace, type PropertyAdminWorkspace } from '@vistay/admin-api-client'
import { useAdmin } from '../../AdminContext'
import { LoadState, Metric, PageHeading, SectionHeading, Segmented, Surface, pageStyles } from '../../ui/primitives'
import { palette } from '../../ui/theme'

const mobileFetch = expoFetch as typeof globalThis.fetch

type PropertyStatus = 'active' | 'maintenance' | 'missing'
type PropertyView = 'structure' | 'list' | 'density' | 'attributes'
type Unit = { id: string; number: string; name: string; capacity: number; status: PropertyStatus; accessReady: boolean }
type Floor = { id: string; name: string; units: Unit[] }
type Building = { id: string; name: string; code: string; address: string; floors: Floor[] }
type Area = { id: string; name: string; buildings: Building[] }
type City = { id: string; name: string; areas: Area[] }

// Presentation fixture mirrors the web PropertyManagement hierarchy until the
// property service exposes a catalog query. It keeps the mobile interaction
// design testable without inventing a mobile-only API contract.
const previewCatalog: City[] = [
  { id: 'hcm', name: 'Thành phố Hồ Chí Minh', areas: [
    { id: 'd1', name: 'Quận 1', buildings: [{ id: 'nh', name: 'Tòa Nguyễn Huệ', code: 'NH-01', address: '12 Nguyễn Huệ', floors: [
      { id: 'nh1', name: 'Tầng 1', units: [{ id: 'p101', number: 'A-101', name: 'Căn hướng phố', capacity: 2, status: 'active', accessReady: true }, { id: 'p102', number: 'A-102', name: 'Căn một phòng ngủ', capacity: 3, status: 'active', accessReady: true }] },
      { id: 'nh2', name: 'Tầng 2', units: [{ id: 'p201', number: 'A-201', name: 'Căn hai phòng ngủ', capacity: 4, status: 'missing', accessReady: false }] },
    ] }] },
    { id: 'd3', name: 'Quận 3', buildings: [{ id: 'll', name: 'Tòa Lê Lợi', code: 'LL-01', address: '88 Lê Lợi', floors: [
      { id: 'll3', name: 'Tầng 3', units: [{ id: 'p301', number: 'B-301', name: 'Căn ven sông', capacity: 2, status: 'active', accessReady: true }] },
      { id: 'll4', name: 'Tầng 4', units: [{ id: 'p401', number: 'B-401', name: 'Căn gia đình', capacity: 6, status: 'maintenance', accessReady: false }] },
    ] }] },
  ] },
  { id: 'danang', name: 'Thành phố Đà Nẵng', areas: [{ id: 'sontra', name: 'Sơn Trà', buildings: [{ id: 'hr', name: 'Tòa Hàn River', code: 'HR-01', address: '24 Trần Hưng Đạo', floors: [
    { id: 'hr6', name: 'Tầng 6', units: [{ id: 'p601', number: 'C-601', name: 'Căn nhìn sông Hàn', capacity: 4, status: 'active', accessReady: true }, { id: 'p602', number: 'C-602', name: 'Căn góc thành phố', capacity: 3, status: 'active', accessReady: true }] },
  ] }] }] },
]

const statusLabel: Record<PropertyStatus, string> = { active: 'Đang hoạt động', maintenance: 'Bảo trì', missing: 'Cần bổ sung' }

function ChipRow({ label, value, options, onChange }: { label: string; value: string; options: { id: string; label: string }[]; onChange: (value: string) => void }) {
  return <View style={styles.filterBlock}>
    <Text style={styles.filterLabel}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((option) => <Pressable key={option.id} onPress={() => onChange(option.id)} style={[styles.chip, option.id === value && styles.chipActive]}><Text style={[styles.chipText, option.id === value && styles.chipTextActive]}>{option.label}</Text></Pressable>)}
    </ScrollView>
  </View>
}

export default function PropertiesScreen() {
  const { accessToken, config, viewer } = useAdmin()
  const [data, setData] = useState<PropertyAdminWorkspace>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<PropertyView>('structure')
  const [cityId, setCityId] = useState('all')
  const [areaId, setAreaId] = useState('all')
  const [buildingId, setBuildingId] = useState('all')
  const canRead = viewer.permissions.includes('property:read') || viewer.permissions.includes('property-attribute:read')

  const load = useCallback(async () => {
    if (!canRead) {
      setError('Tài khoản chưa có quyền đọc tài sản hoặc tiêu chí căn.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      setData(await fetchPropertyAdminWorkspace(config.graphqlUrl, accessToken, mobileFetch))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải dữ liệu căn hộ.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, canRead, config.graphqlUrl])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const visibleCities = useMemo(() => previewCatalog
    .filter((city) => cityId === 'all' || city.id === cityId)
    .map((city) => ({ ...city, areas: city.areas.filter((area) => areaId === 'all' || area.id === areaId).map((area) => ({ ...area, buildings: area.buildings.filter((building) => buildingId === 'all' || building.id === buildingId) })).filter((area) => area.buildings.length) }))
    .filter((city) => city.areas.length), [areaId, buildingId, cityId])
  const availableAreas = useMemo(() => previewCatalog.filter((city) => cityId === 'all' || city.id === cityId).flatMap((city) => city.areas), [cityId])
  const availableBuildings = useMemo(() => availableAreas.filter((area) => areaId === 'all' || area.id === areaId).flatMap((area) => area.buildings), [availableAreas, areaId])
  const visibleBuildings = visibleCities.flatMap((city) => city.areas.flatMap((area) => area.buildings))
  const visibleFloors = visibleBuildings.flatMap((building) => building.floors)
  const visibleUnits = visibleFloors.flatMap((floor) => floor.units.map((unit) => ({ unit, floor, building: visibleBuildings.find((item) => item.floors.includes(floor))! })))

  function changeCity(next: string) { setCityId(next); setAreaId('all'); setBuildingId('all') }
  function changeArea(next: string) { setAreaId(next); setBuildingId('all') }

  return <ScrollView
    refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={() => void load()} tintColor={palette.evergreen} />}
    style={pageStyles.scroll}
    contentContainerStyle={pageStyles.content}
  >
    <PageHeading eyebrow="Danh mục" title="Căn hộ" detail="Thành phố · khu vực · tòa nhà · tầng · căn, theo cùng cấu trúc quản trị trên web." />
    <Segmented options={[{ label: 'Cấu trúc', value: 'structure' }, { label: 'Danh sách', value: 'list' }, { label: 'Mật độ', value: 'density' }, { label: 'Tiêu chí căn', value: 'attributes' }]} value={view} onChange={setView} />
    {loading && !data ? <LoadState /> : error ? <LoadState error={error} retry={() => void load()} /> : data ? <>
      {view !== 'attributes' ? <>
        <View style={styles.filterCard}>
          <ChipRow label="Thành phố" value={cityId} onChange={changeCity} options={[{ id: 'all', label: 'Tất cả' }, ...previewCatalog.map((city) => ({ id: city.id, label: city.name }))]} />
          <ChipRow label="Khu vực" value={areaId} onChange={changeArea} options={[{ id: 'all', label: 'Tất cả' }, ...availableAreas.map((area) => ({ id: area.id, label: area.name }))]} />
          <ChipRow label="Tòa nhà" value={buildingId} onChange={setBuildingId} options={[{ id: 'all', label: 'Tất cả' }, ...availableBuildings.map((building) => ({ id: building.id, label: building.name }))]} />
          <View style={styles.filterSummary}><Text><Text style={styles.filterNumber}>{visibleBuildings.length}</Text> tòa</Text><Text><Text style={styles.filterNumber}>{visibleFloors.length}</Text> tầng</Text><Text><Text style={styles.filterNumber}>{visibleUnits.length}</Text> căn</Text></View>
        </View>
        <View style={pageStyles.grid}>
          <View style={pageStyles.half}><Metric icon="business-outline" label="Đang hoạt động" value={String(data.summary.activeProperties)} tone="dark" /></View>
          <View style={pageStyles.half}><Metric icon="construct-outline" label="Đang bảo trì" value={String(data.summary.maintenanceProperties)} /></View>
          <View style={pageStyles.half}><Metric icon="warning-outline" label="Cần xử lý" value={String(data.summary.propertiesNeedingAttention)} tone="green" /></View>
          <View style={pageStyles.half}><Metric icon="options-outline" label="Tiêu chí động" value={String(data.attributes.length)} /></View>
        </View>
        {view === 'structure' && <View style={styles.section}>
          {visibleCities.map((city) => <View key={city.id} style={styles.cityGroup}>
            <View style={styles.cityHeader}><Text style={styles.cityTitle}>{city.name}</Text><Text style={styles.muted}>{city.areas.length} khu vực</Text></View>
            {city.areas.map((area) => <View key={area.id} style={styles.areaGroup}>
              <Text style={styles.areaTitle}>{area.name}</Text>
              {area.buildings.map((building) => <Surface key={building.id}>
                <View style={styles.buildingHeader}><View><Text style={styles.buildingCode}>{building.code} · {building.address}</Text><Text style={styles.buildingTitle}>{building.name}</Text></View><Text style={styles.muted}>{building.floors.length} tầng</Text></View>
                {building.floors.map((floor) => <View key={floor.id} style={styles.floor}>
                  <View style={styles.floorHeader}><Text style={styles.floorTitle}>{floor.name}</Text><Text style={styles.muted}>{floor.units.length} căn</Text></View>
                  <View style={styles.unitGrid}>{floor.units.map((unit) => <Pressable key={unit.id} style={styles.unitCard}><View style={[styles.statusDot, { backgroundColor: unit.status === 'active' ? palette.leaf : unit.status === 'maintenance' ? '#d59b43' : palette.danger }]} /><Text style={styles.unitNumber}>{unit.number}</Text><Text numberOfLines={1} style={styles.unitName}>{unit.name}</Text><Text style={styles.unitMeta}>{unit.capacity} khách · {unit.accessReady ? 'Đã cấu hình' : 'Thiếu truy cập'}</Text></Pressable>)}</View>
                </View>)}
              </Surface>)}
            </View>)}
          </View>)}
        </View>}
        {view === 'list' && <Surface><SectionHeading title="Danh sách căn" caption={`${visibleUnits.length} căn đang hiển thị`} />{visibleUnits.map(({ unit, floor, building }) => <View key={unit.id} style={styles.listRow}><View style={styles.listMain}><Text style={styles.unitNumber}>{unit.number} · {unit.name}</Text><Text style={styles.muted}>{building.name} · {floor.name}</Text></View><Text style={styles.listStatus}>{statusLabel[unit.status]}</Text></View>)}</Surface>}
        {view === 'density' && <View style={styles.densityGrid}>{visibleUnits.map(({ unit }) => <View key={unit.id} style={[styles.densityUnit, unit.status === 'active' && styles.densityActive, unit.status === 'maintenance' && styles.densityMaintenance, unit.status === 'missing' && styles.densityMissing]}><Text style={styles.densityText}>{unit.number}</Text></View>)}</View>}
      </> : <View style={styles.section}><SectionHeading title="Tiêu chí căn" caption="Catalog cấu hình chung từ Property service." /><Surface>{data.attributes.length ? data.attributes.map((attribute) => <View key={attribute.id} style={styles.attribute}><View style={styles.attributeCopy}><Text style={styles.attributeLabel}>{attribute.label}</Text><Text style={styles.attributeMeta}>{attribute.groupCode} · {attribute.dataType}{attribute.unitLabel ? ` · ${attribute.unitLabel}` : ''}</Text></View><View style={[styles.status, attribute.status === 'ACTIVE' && styles.statusActive]}><Text style={[styles.statusText, attribute.status === 'ACTIVE' && styles.statusTextActive]}>{attribute.status}</Text></View></View>) : <Text style={styles.empty}>Chưa có tiêu chí động nào.</Text>}</Surface></View>}
    </> : null}
  </ScrollView>
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  filterCard: { marginTop: 14, padding: 14, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, gap: 10 },
  filterBlock: { gap: 6 },
  filterLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: .8, textTransform: 'uppercase' },
  chips: { gap: 7, paddingRight: 10 },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: palette.surfaceMuted },
  chipActive: { backgroundColor: palette.ink },
  chipText: { color: palette.muted, fontSize: 10, fontWeight: '700' },
  chipTextActive: { color: palette.white },
  filterSummary: { paddingTop: 4, flexDirection: 'row', justifyContent: 'space-between', color: palette.muted },
  filterNumber: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  cityGroup: { gap: 8 },
  cityHeader: { paddingHorizontal: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cityTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  areaGroup: { gap: 8 },
  areaTitle: { paddingLeft: 8, color: palette.leaf, fontSize: 13, fontWeight: '800' },
  buildingHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  buildingCode: { color: palette.muted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  buildingTitle: { marginTop: 4, color: palette.ink, fontSize: 16, fontWeight: '800' },
  floor: { marginTop: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  floorHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  floorTitle: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitCard: { width: '47%', minHeight: 95, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.background },
  statusDot: { width: 7, height: 7, marginBottom: 8, borderRadius: 4 },
  unitNumber: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  unitName: { marginTop: 3, color: palette.muted, fontSize: 10 },
  unitMeta: { marginTop: 8, color: palette.muted, fontSize: 9 },
  listRow: { minHeight: 62, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  listMain: { flex: 1, gap: 4 },
  listStatus: { color: palette.leaf, fontSize: 9, fontWeight: '800', textAlign: 'right' },
  densityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  densityUnit: { width: '30%', minHeight: 55, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  densityActive: { backgroundColor: '#d9ff63' },
  densityMaintenance: { backgroundColor: '#f4dfb7' },
  densityMissing: { backgroundColor: '#f2c6bf' },
  densityText: { color: palette.ink, fontSize: 11, fontWeight: '800' },
  attribute: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  attributeCopy: { flex: 1, gap: 3 },
  attributeLabel: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  attributeMeta: { color: palette.muted, fontSize: 9, textTransform: 'uppercase' },
  status: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: palette.surfaceMuted },
  statusActive: { backgroundColor: '#E2F0E5' },
  statusText: { color: palette.muted, fontSize: 8, fontWeight: '700' },
  statusTextActive: { color: palette.leaf },
  muted: { color: palette.muted, fontSize: 10 },
  empty: { paddingVertical: 20, color: palette.muted, fontSize: 11, textAlign: 'center' },
  overviewNote: { color: palette.muted, fontSize: 11, lineHeight: 17 },
})
