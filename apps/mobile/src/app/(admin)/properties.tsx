import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { fetch as expoFetch } from 'expo/fetch'
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  createOwnerContract, createPropertyUnit, createUserProfile, fetchOwnerContracts, fetchPropertyPortfolio, fetchUserDirectory,
  type OwnerContractRecord, type PropertyOperatingModel, type PropertyPortfolio, type PropertyUnitRecord, type UserDirectoryEntry,
} from '@vistay/admin-api-client'
import { useAdmin } from '../../AdminContext'
import { LoadState, pageStyles } from '../../ui/primitives'
import { palette, radii } from '../../ui/theme'

const mobileFetch = expoFetch as typeof globalThis.fetch
const DEFAULT_TODAY = new Date().toISOString().slice(0, 10)
const DEFAULT_NEXT_YEAR = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
const DEFAULT_CONTRACT_NUMBER = `HD-${Date.now().toString().slice(-8)}`
type Section = 'all' | PropertyOperatingModel | 'contracts'
type LocationFilterKind = 'city' | 'area' | 'building'
const modelLabels: Record<PropertyOperatingModel, string> = { OWNED: 'Sở hữu', LEASED_BY_VISTAY: 'Thuê', MANAGEMENT: 'Quản lý' }

export default function PropertiesScreen() {
  const { accessToken, config, viewer } = useAdmin()
  const [portfolio, setPortfolio] = useState<PropertyPortfolio>()
  const [contracts, setContracts] = useState<OwnerContractRecord[]>([])
  const [hosts, setHosts] = useState<UserDirectoryEntry[]>([])
  const [section, setSection] = useState<Section>('all')
  const [search, setSearch] = useState('')
  const [cityId, setCityId] = useState('ALL')
  const [areaId, setAreaId] = useState('ALL')
  const [buildingId, setBuildingId] = useState('ALL')
  const [locationPicker, setLocationPicker] = useState<LocationFilterKind>()
  const [unitOpen, setUnitOpen] = useState(false)
  const [contractOpen, setContractOpen] = useState(false)
  const [selected, setSelected] = useState<PropertyUnitRecord>()
  const [error, setError] = useState<string>()
  const [contractError, setContractError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [loading, setLoading] = useState(true)
  const canRead = viewer.permissions.includes('property:read')
  const canCreate = viewer.permissions.includes('property:create')
  const canReadContract = viewer.permissions.includes('contract:read')
  const canCreateContract = viewer.permissions.includes('contract:create')

  const load = useCallback(async () => {
    if (!canRead) { setError('Tài khoản chưa có quyền property:read.'); setLoading(false); return }
    setLoading(true); setError(undefined); setContractError(undefined)
    try {
      const next = await fetchPropertyPortfolio(config.graphqlUrl, accessToken, {}, undefined, mobileFetch)
      setPortfolio(next)
      if (canReadContract) {
        try { setContracts(await fetchOwnerContracts(config.graphqlUrl, accessToken, {}, undefined, mobileFetch)) }
        catch (reason) { setContractError(reason instanceof Error ? reason.message : 'Không tải được hợp đồng.') }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được danh mục căn.') }
    finally { setLoading(false) }
  }, [accessToken, canRead, canReadContract, config.graphqlUrl])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const cities = useMemo(() => portfolio?.cities ?? [], [portfolio])
  const areas = useMemo(() => cities.filter((city) => cityId === 'ALL' || city.id === cityId).flatMap((city) => city.areas), [cities, cityId])
  const buildings = useMemo(() => areas.filter((area) => areaId === 'ALL' || area.id === areaId).flatMap((area) => area.buildings), [areaId, areas])
  const selectedCity = cityId === 'ALL' ? 'Tất cả' : cities.find((city) => city.id === cityId)?.name ?? 'Tất cả'
  const selectedArea = areaId === 'ALL' ? 'Tất cả' : areas.find((area) => area.id === areaId)?.name ?? 'Tất cả'
  const selectedBuilding = buildingId === 'ALL' ? 'Tất cả' : buildings.find((building) => building.id === buildingId)?.name ?? 'Tất cả'
  const pickerTitle = locationPicker === 'city' ? 'Chọn thành phố' : locationPicker === 'area' ? 'Chọn khu vực' : 'Chọn tòa'
  const pickerValue = locationPicker === 'city' ? cityId : locationPicker === 'area' ? areaId : buildingId
  const pickerOptions = locationPicker === 'city'
    ? cities.map((city) => ({ id: city.id, name: city.name }))
    : locationPicker === 'area'
      ? areas.map((area) => ({ id: area.id, name: area.name }))
      : buildings.map((building) => ({ id: building.id, name: building.name }))
  const unitRows = useMemo(() => cities.flatMap((city) => city.areas.flatMap((area) => area.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.units.map((unit) => ({ city, area, building, floor, unit })))))), [cities])
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi')
    return unitRows.filter(({ city, area, building, floor, unit }) =>
      ((section === 'all' || section === 'contracts') || unit.operatingModel === section)
      && (cityId === 'ALL' || city.id === cityId)
      && (areaId === 'ALL' || area.id === areaId)
      && (buildingId === 'ALL' || building.id === buildingId)
      && (!query || `${city.name} ${area.name} ${building.name} ${floor.name} ${unit.code} ${unit.unitNumber ?? ''} ${unit.name}`.toLocaleLowerCase('vi').includes(query)))
  }, [areaId, buildingId, cityId, search, section, unitRows])

  async function openContract(unit?: PropertyUnitRecord) {
    setSelected(unit ?? filtered[0]?.unit)
    setContractOpen(true)
    if (!hosts.length) {
      try { setHosts((await fetchUserDirectory(config.graphqlUrl, accessToken, { accountType: 'HOST', first: 100 }, undefined, mobileFetch)).nodes) }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được chủ nhà.') }
    }
  }

  function selectLocation(value: string) {
    if (locationPicker === 'city') { setCityId(value); setAreaId('ALL'); setBuildingId('ALL') }
    if (locationPicker === 'area') { setAreaId(value); setBuildingId('ALL') }
    if (locationPicker === 'building') setBuildingId(value)
    setLocationPicker(undefined)
  }

  return <ScrollView refreshControl={<RefreshControl refreshing={loading && Boolean(portfolio)} onRefresh={() => void load()} tintColor={palette.evergreen} />} style={pageStyles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.command}><View><Text style={styles.commandTitle}>Căn hộ</Text><Text style={styles.commandMeta}>Danh mục căn và hợp đồng</Text></View><View style={styles.commandActions}>{section !== 'contracts' && canCreate && <Pressable onPress={() => setUnitOpen(true)} style={styles.primaryIcon}><Ionicons color={palette.white} name="add" size={20} /></Pressable>}{section === 'contracts' && canCreateContract && <Pressable onPress={() => void openContract()} style={styles.primaryIcon}><Ionicons color={palette.white} name="document-text-outline" size={18} /></Pressable>}</View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionTabs}>
      {([{ label: 'Danh mục', value: 'all' }, { label: 'Sở hữu', value: 'OWNED' }, { label: 'Thuê vận hành', value: 'LEASED_BY_VISTAY' }, { label: 'Quản lý', value: 'MANAGEMENT' }, ...(canReadContract ? [{ label: 'Hợp đồng', value: 'contracts' }] : [])] as { label: string; value: Section }[]).map((item) => <Filter key={item.value} active={section === item.value} label={item.label} onPress={() => setSection(item.value)} />)}
    </ScrollView>
    <View style={styles.search}><Ionicons color={palette.evergreen} name="search" size={17} /><TextInput placeholder="Tìm tòa, tầng hoặc căn" placeholderTextColor={palette.muted} style={styles.searchInput} value={search} onChangeText={setSearch} /></View>
    {section !== 'contracts' && <View style={styles.locationControlRail}>
      <PropertyLocationControl label="Thành phố" value={selectedCity} onPress={() => setLocationPicker('city')} />
      <PropertyLocationControl label="Khu vực" value={selectedArea} onPress={() => setLocationPicker('area')} />
      <PropertyLocationControl label="Tòa" value={selectedBuilding} onPress={() => setLocationPicker('building')} />
    </View>}
    {notice && <Text style={styles.notice}>{notice}</Text>}
    {section === 'contracts' && contractError && <Text style={styles.error}>{contractError}</Text>}
    {loading && !portfolio ? <LoadState /> : error ? <LoadState error={error} retry={() => void load()} /> : section !== 'contracts' ? <>
      <View style={styles.metrics}><Metric label="Tòa" value={new Set(filtered.map((item) => item.building.id)).size} /><Metric label="Tầng" value={new Set(filtered.map((item) => item.floor.id)).size} /><Metric label="Căn" value={filtered.length} /></View>
      <View style={styles.list}>{filtered.map(({ city, area, building, floor, unit }) => <Pressable key={unit.id} onPress={() => setSelected(unit)} style={({ pressed }) => [styles.unitCard, pressed && styles.pressed]}>
        <View style={styles.unitIcon}><Ionicons color={palette.evergreen} name="business-outline" size={19} /></View><View style={styles.unitCopy}><Text numberOfLines={1} style={styles.unitName}>{unit.unitNumber || unit.code} · {unit.name}</Text><Text numberOfLines={1} style={styles.unitMeta}>{building.name} · {floor.name} · {city.name}, {area.name}</Text><View style={styles.unitTags}><Text style={styles.tag}>{modelLabels[unit.operatingModel]}</Text><Text style={styles.tag}>{unit.capacity} khách</Text><Text style={styles.tag}>{unit.operationalStatus}</Text></View></View>
        {canCreateContract && <Pressable onPress={() => void openContract(unit)} style={styles.rowAction}><Ionicons color={palette.evergreen} name="document-text-outline" size={17} /></Pressable>}
      </Pressable>)}{!filtered.length && <Empty icon="business-outline" title="Chưa có căn phù hợp" />}</View>
    </> : <View style={styles.list}>{contracts.filter((contract) => !search || contract.contractNumber.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map((contract) => <View key={contract.id} style={styles.contractCard}><View style={styles.contractTop}><Text style={styles.unitName}>{contract.contractNumber}</Text><Text style={styles.contractStatus}>{contract.status}</Text></View><Text style={styles.unitMeta}>{contract.startDate} → {contract.endDate}</Text><Text style={styles.contractProperty}>{contract.propertyTerms.map((term) => unitRows.find(({ unit }) => unit.id === term.propertyId)?.unit.name ?? term.propertyId).join(', ')}</Text></View>)}{!contracts.length && <Empty icon="document-text-outline" title="Chưa có hợp đồng" />}</View>}
    <Modal animationType="slide" transparent visible={Boolean(locationPicker)} onRequestClose={() => setLocationPicker(undefined)}><View style={styles.backdrop}><View style={styles.locationSheet}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{pickerTitle}</Text><Pressable onPress={() => setLocationPicker(undefined)}><Ionicons color={palette.evergreen} name="close" size={22} /></Pressable></View><ScrollView contentContainerStyle={styles.locationSheetOptions}><Pressable onPress={() => selectLocation('ALL')} style={[styles.locationSheetChoice, pickerValue === 'ALL' && styles.locationSheetChoiceActive]}><Text style={[styles.locationSheetText, pickerValue === 'ALL' && styles.locationSheetTextActive]}>Tất cả</Text>{pickerValue === 'ALL' && <Ionicons name="checkmark" color={palette.white} size={17} />}</Pressable>{pickerOptions.map((option) => <Pressable key={option.id} onPress={() => selectLocation(option.id)} style={[styles.locationSheetChoice, pickerValue === option.id && styles.locationSheetChoiceActive]}><Text numberOfLines={1} style={[styles.locationSheetText, pickerValue === option.id && styles.locationSheetTextActive]}>{option.name}</Text>{pickerValue === option.id && <Ionicons name="checkmark" color={palette.white} size={17} />}</Pressable>)}</ScrollView></View></View></Modal>
    {portfolio && <UnitModal visible={unitOpen} portfolio={portfolio} graphqlUrl={config.graphqlUrl} accessToken={accessToken} onClose={() => setUnitOpen(false)} onSaved={() => { setUnitOpen(false); setNotice('Đã tạo căn và gắn chi nhánh.'); void load() }} />}
    {portfolio && <ContractModal visible={contractOpen} units={unitRows.map((item) => item.unit)} hosts={hosts} selected={selected} graphqlUrl={config.graphqlUrl} accessToken={accessToken} canCreateHost={viewer.permissions.includes('host-profile:create')} setHosts={setHosts} onClose={() => setContractOpen(false)} onSaved={() => { setContractOpen(false); setNotice('Đã tạo hợp đồng chủ nhà.'); void load() }} />}
  </ScrollView>
}

function Filter({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.filter, active && styles.filterActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable> }
function PropertyLocationControl({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.locationControl, pressed && styles.locationControlPressed]}><View style={styles.locationControlCopy}><Text numberOfLines={1} style={styles.locationControlLabel}>{label}</Text><Text numberOfLines={1} style={styles.locationControlValue}>{value}</Text></View><Ionicons name="chevron-down" color={palette.evergreen} size={13} /></Pressable> }
function Metric({ label, value }: { label: string; value: number }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View> }
function Empty({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) { return <View style={styles.empty}><Ionicons color={palette.sage} name={icon} size={28} /><Text style={styles.emptyTitle}>{title}</Text></View> }

function UnitModal({ visible, portfolio, graphqlUrl, accessToken, onClose, onSaved }: { visible: boolean; portfolio: PropertyPortfolio; graphqlUrl: string; accessToken: string; onClose: () => void; onSaved: () => void }) {
  const floors = portfolio.cities.flatMap((city) => city.areas.flatMap((area) => area.buildings.flatMap((building) => building.floors)))
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>()
  const [form, setForm] = useState({ floorId: floors[0]?.id ?? '', branchId: portfolio.branches[0]?.id ?? '', code: '', number: '', name: '', model: 'MANAGEMENT' as PropertyOperatingModel, capacity: '2', price: '' })
  async function submit() { setBusy(true); setError(undefined); try { await createPropertyUnit(graphqlUrl, accessToken, { floorId: form.floorId, branchId: form.branchId, code: form.code, unitNumber: form.number, name: form.name, operatingModel: form.model, bedroomCount: 1, bathroomCount: 1, capacity: Number(form.capacity), basePricePerNight: form.price || undefined, currency: 'VND' }, mobileFetch); onSaved() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tạo được căn.') } finally { setBusy(false) } }
  return <Sheet visible={visible} title="Thêm căn" onClose={onClose}><Select label="Tầng" value={form.floorId} options={floors.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => setForm({ ...form, floorId: value })} /><Select label="Chi nhánh" value={form.branchId} options={portfolio.branches.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => setForm({ ...form, branchId: value })} /><Input label="Mã căn" value={form.code} onChangeText={(value) => setForm({ ...form, code: value.toUpperCase() })} /><Input label="Số căn" value={form.number} onChangeText={(value) => setForm({ ...form, number: value })} /><Input label="Tên căn" value={form.name} onChangeText={(value) => setForm({ ...form, name: value })} /><Select label="Mô hình" value={form.model} options={(Object.keys(modelLabels) as PropertyOperatingModel[]).map((value) => ({ value, label: modelLabels[value] }))} onChange={(value) => setForm({ ...form, model: value as PropertyOperatingModel })} /><Input label="Sức chứa" keyboardType="number-pad" value={form.capacity} onChangeText={(value) => setForm({ ...form, capacity: value })} /><Input label="Giá cơ sở" keyboardType="numeric" value={form.price} onChangeText={(value) => setForm({ ...form, price: value })} />{error && <Text style={styles.error}>{error}</Text>}<Submit busy={busy} disabled={!form.floorId || !form.branchId || !form.code || !form.name} label="Tạo căn" onPress={() => void submit()} /></Sheet>
}

function ContractModal({ visible, units, hosts, selected, graphqlUrl, accessToken, canCreateHost, setHosts, onClose, onSaved }: { visible: boolean; units: PropertyUnitRecord[]; hosts: UserDirectoryEntry[]; selected?: PropertyUnitRecord; graphqlUrl: string; accessToken: string; canCreateHost: boolean; setHosts: React.Dispatch<React.SetStateAction<UserDirectoryEntry[]>>; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const [newHost, setNewHost] = useState(false); const [hostName, setHostName] = useState(''); const [hostEmail, setHostEmail] = useState('')
  const [form, setForm] = useState({ number: DEFAULT_CONTRACT_NUMBER, propertyId: selected?.id ?? units[0]?.id ?? '', hostId: hosts[0]?.profileId ?? '', model: selected?.operatingModel ?? 'MANAGEMENT' as PropertyOperatingModel, start: DEFAULT_TODAY, end: DEFAULT_NEXT_YEAR, amount: '', fee: '15' })
  async function addHost() { setBusy(true); try { const host = await createUserProfile(graphqlUrl, accessToken, { accountType: 'HOST', fullName: hostName, email: hostEmail, reason: 'Tạo chủ nhà trong luồng hợp đồng mobile', idempotencyKey: `${Date.now()}-${Math.random()}` }, mobileFetch); const entry: UserDirectoryEntry = { profileId: host.profileId, accountId: host.accountId, accountType: 'HOST', displayName: host.displayName, email: host.email, contactPhone: host.contactPhone, status: host.status, referenceCode: host.referenceCode, subtype: host.subtype, verificationStatus: host.verificationStatus, joinedOn: host.relevantDate, createdAt: host.createdAt, updatedAt: host.updatedAt }; setHosts((current) => [entry, ...current]); setForm((current) => ({ ...current, hostId: host.profileId })); setNewHost(false) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tạo được chủ nhà.') } finally { setBusy(false) } }
  async function submit() { setBusy(true); setError(undefined); try { await createOwnerContract(graphqlUrl, accessToken, { contractNumber: form.number, propertyId: form.propertyId, hostProfileId: form.hostId, operatingModel: form.model, startDate: form.start, endDate: form.end, fixedAmount: form.model === 'LEASED_BY_VISTAY' ? form.amount : undefined, managementFeePercent: form.model === 'MANAGEMENT' ? form.fee : undefined, paymentPeriod: 'MONTH', paymentCycleCount: 1, currency: 'VND', status: 'ACTIVE' }, mobileFetch); onSaved() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tạo được hợp đồng.') } finally { setBusy(false) } }
  return <Sheet visible={visible} title="Hợp đồng chủ nhà" onClose={onClose}><Input label="Số hợp đồng" value={form.number} onChangeText={(value) => setForm({ ...form, number: value.toUpperCase() })} /><Select label="Căn" value={form.propertyId} options={units.map((item) => ({ value: item.id, label: `${item.unitNumber || item.code} · ${item.name}` }))} onChange={(value) => { const unit = units.find((item) => item.id === value); setForm({ ...form, propertyId: value, model: unit?.operatingModel ?? form.model }) }} /><Select label="Chủ nhà" value={form.hostId} options={hosts.map((item) => ({ value: item.profileId, label: item.displayName }))} onChange={(value) => setForm({ ...form, hostId: value })} />{canCreateHost && <Pressable onPress={() => setNewHost((value) => !value)} style={styles.inlineButton}><Ionicons name="person-add-outline" color={palette.evergreen} size={16} /><Text style={styles.inlineButtonText}>Tạo chủ nhà ngay</Text></Pressable>}{newHost && <View style={styles.inlineForm}><Input label="Họ tên" value={hostName} onChangeText={setHostName} /><Input label="Email" value={hostEmail} onChangeText={setHostEmail} /><Submit busy={busy} disabled={!hostName || !hostEmail} label="Tạo và chọn" onPress={() => void addHost()} /></View>}<Select label="Mô hình" value={form.model} options={(Object.keys(modelLabels) as PropertyOperatingModel[]).map((value) => ({ value, label: modelLabels[value] }))} onChange={(value) => setForm({ ...form, model: value as PropertyOperatingModel })} /><Input label="Hiệu lực từ" value={form.start} onChangeText={(value) => setForm({ ...form, start: value })} /><Input label="Đến ngày" value={form.end} onChangeText={(value) => setForm({ ...form, end: value })} />{form.model === 'LEASED_BY_VISTAY' && <Input label="Tiền thuê/tháng" keyboardType="numeric" value={form.amount} onChangeText={(value) => setForm({ ...form, amount: value })} />}{form.model === 'MANAGEMENT' && <Input label="Phí quản lý (%)" keyboardType="numeric" value={form.fee} onChangeText={(value) => setForm({ ...form, fee: value })} />}{error && <Text style={styles.error}>{error}</Text>}<Submit busy={busy} disabled={!form.propertyId || !form.hostId} label="Tạo hợp đồng" onPress={() => void submit()} /></Sheet>
}

function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) { return <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}><View style={styles.backdrop}><ScrollView keyboardShouldPersistTaps="handled" style={styles.sheet} contentContainerStyle={styles.sheetContent}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><Pressable onPress={onClose}><Ionicons color={palette.evergreen} name="close" size={22} /></Pressable></View>{children}</ScrollView></View></Modal> }
function Input(props: React.ComponentProps<typeof TextInput> & { label: string }) { const { label, ...input } = props; return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor={palette.muted} style={styles.input} {...input} /></View> }
function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{options.map((option) => <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.choiceActive]}><Text style={[styles.choiceText, value === option.value && styles.choiceTextActive]} numberOfLines={1}>{option.label}</Text></Pressable>)}</ScrollView></View> }
function Submit({ busy, disabled, label, onPress }: { busy: boolean; disabled: boolean; label: string; onPress: () => void }) { return <Pressable disabled={busy || disabled} onPress={onPress} style={[styles.submit, (busy || disabled) && styles.disabled]}>{busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.submitText}>{label}</Text>}</Pressable> }

const styles = StyleSheet.create({
  content: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 42, gap: 12 },
  command: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  commandTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' }, commandMeta: { marginTop: 2, color: palette.muted, fontSize: 9 },
  commandActions: { flexDirection: 'row', gap: 6 }, primaryIcon: { width: 40, height: 40, borderRadius: radii.small, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center' },
  sectionTabs: { gap: 7, paddingRight: 14 },
  search: { minHeight: 44, paddingHorizontal: 11, borderWidth: 1.5, borderColor: palette.leaf, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchInput: { flex: 1, color: palette.ink, fontSize: 11 },
  locationControlRail: { minWidth: 0, minHeight: 44, flexDirection: 'row', gap: 6 }, locationControl: { minWidth: 0, minHeight: 44, paddingHorizontal: 8, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }, locationControlPressed: { borderColor: palette.sage, backgroundColor: '#F3F8F2' }, locationControlCopy: { minWidth: 0, flex: 1 }, locationControlLabel: { color: palette.muted, fontSize: 7.5, fontWeight: '600' }, locationControlValue: { marginTop: 3, color: palette.ink, fontSize: 9.5, fontWeight: '700' },
  notice: { padding: 10, borderRadius: radii.small, backgroundColor: '#E7F0E4', color: palette.evergreen, fontSize: 10 },
  filters: { gap: 7 }, filter: { minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' }, filterActive: { borderColor: palette.ink, backgroundColor: palette.ink }, filterText: { color: palette.muted, fontSize: 10, fontWeight: '600' }, filterTextActive: { color: palette.white },
  metrics: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, minHeight: 54, padding: 9, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, metricLabel: { color: palette.muted, fontSize: 9 }, metricValue: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  list: { gap: 8 }, unitCard: { minHeight: 80, padding: 10, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 10 }, unitIcon: { width: 39, height: 39, borderRadius: radii.small, backgroundColor: '#E7F0E4', alignItems: 'center', justifyContent: 'center' }, unitCopy: { flex: 1, gap: 4 }, unitName: { color: palette.ink, fontSize: 12, fontWeight: '700' }, unitMeta: { color: palette.muted, fontSize: 9 }, unitTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, tag: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: palette.surfaceMuted, color: palette.evergreen, fontSize: 8 }, rowAction: { width: 34, height: 34, borderRadius: radii.small, backgroundColor: '#EDF4EC', alignItems: 'center', justifyContent: 'center' }, pressed: { opacity: .68 },
  contractCard: { padding: 12, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, gap: 5 }, contractTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, contractStatus: { color: palette.leaf, fontSize: 9, fontWeight: '700' }, contractProperty: { color: palette.evergreen, fontSize: 10, fontWeight: '600' },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8 }, emptyTitle: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'flex-end', paddingTop: 60, backgroundColor: 'rgba(9,35,40,.5)' }, sheet: { maxHeight: '92%', borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: palette.background }, sheetContent: { padding: 16, paddingBottom: 34, gap: 12 }, locationSheet: { maxHeight: '68%', padding: 16, paddingBottom: 28, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: palette.background, gap: 12 }, locationSheetOptions: { gap: 6 }, locationSheetChoice: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, locationSheetChoiceActive: { borderColor: palette.evergreen, backgroundColor: palette.evergreen }, locationSheetText: { flex: 1, color: palette.ink, fontSize: 11, fontWeight: '600' }, locationSheetTextActive: { color: palette.white, fontWeight: '700' }, sheetHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { color: palette.ink, fontSize: 19, fontWeight: '700' },
  field: { gap: 6 }, label: { color: palette.evergreen, fontSize: 10, fontWeight: '700' }, input: { minHeight: 44, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, color: palette.ink, fontSize: 12 }, choiceRow: { gap: 6 }, choice: { maxWidth: 200, minHeight: 40, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' }, choiceActive: { borderColor: palette.evergreen, backgroundColor: palette.evergreen }, choiceText: { color: palette.muted, fontSize: 10 }, choiceTextActive: { color: palette.white, fontWeight: '700' },
  inlineButton: { minHeight: 40, borderWidth: 1, borderColor: palette.sage, borderRadius: radii.small, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, inlineButtonText: { color: palette.evergreen, fontSize: 10, fontWeight: '700' }, inlineForm: { padding: 10, borderRadius: radii.small, backgroundColor: '#EAF2E7', gap: 10 },
  submit: { minHeight: 47, borderRadius: radii.small, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' }, submitText: { color: palette.white, fontSize: 12, fontWeight: '700' }, disabled: { opacity: .42 }, error: { padding: 10, borderRadius: radii.small, backgroundColor: '#FFF0EC', color: palette.danger, fontSize: 10 },
})
