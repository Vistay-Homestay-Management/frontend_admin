import { useCallback, useEffect, useMemo, useRef, useState, type ElementRef } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { fetch as expoFetch } from 'expo/fetch'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  fetchAdminBookingTimeline,
  fetchPropertyPortfolio,
  type AdminBookingRecord,
  type BackofficeViewer,
  type PropertyPortfolio,
  type PropertyUnitRecord,
} from '@vistay/admin-api-client'
import { palette, radii } from './ui/theme'

const mobileFetch = expoFetch as typeof globalThis.fetch
type TimelineScale = 'day' | 'week' | 'month'
type LocationFilterKind = 'city' | 'area' | 'building'
type TimelineUnit = PropertyUnitRecord & {
  cityId: string; cityName: string; areaId: string; areaName: string
  buildingId: string; buildingName: string; floorName: string
}
type Period = { key: string; start: string; end: string; eyebrow: string; label: string }

function todayIso() { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 10) }
function addDays(value: string, amount: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10) }
function addMonths(value: string, amount: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 10) }
function daysBetween(from: string, to: string) { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) }
function startOfWeek(value: string) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); return date.toISOString().slice(0, 10) }
function startOfMonth(value: string) { return `${value.slice(0, 7)}-01` }
function rangeFor(anchor: string, scale: TimelineScale) {
  if (scale === 'week') { const from = startOfWeek(anchor); return { from, to: addDays(from, 112) } }
  if (scale === 'month') { const from = startOfMonth(anchor); return { from, to: addMonths(from, 12) } }
  return { from: anchor, to: addDays(anchor, 31) }
}
function periodsFor(from: string, to: string, scale: TimelineScale): Period[] {
  const periods: Period[] = []
  let cursor = from
  while (cursor < to && periods.length < 400) {
    const end = scale === 'day' ? addDays(cursor, 1) : scale === 'week' ? addDays(cursor, 7) : addMonths(cursor, 1)
    const date = new Date(`${cursor}T00:00:00Z`)
    periods.push({
      key: cursor, start: cursor, end,
      eyebrow: scale === 'day' ? new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'UTC' }).format(date)
        : scale === 'week' ? 'Tuần' : new Intl.DateTimeFormat('vi-VN', { month: 'short', timeZone: 'UTC' }).format(date),
      label: scale === 'day' ? `${cursor.slice(8)}/${cursor.slice(5, 7)}`
        : scale === 'week' ? `${cursor.slice(8)}/${cursor.slice(5, 7)}` : String(date.getUTCFullYear()),
    })
    cursor = end
  }
  return periods
}
function pixelOffset(value: string, periods: Period[], width: number) {
  if (!periods.length || value <= periods[0].start) return 0
  for (let index = 0; index < periods.length; index += 1) {
    const period = periods[index]
    if (value < period.end) return (index + Math.min(1, Math.max(0, daysBetween(period.start, value)) / Math.max(1, daysBetween(period.start, period.end)))) * width
  }
  return periods.length * width
}

export function MobileBookingTimeline({ graphqlUrl, accessToken, viewer }: { graphqlUrl: string; accessToken: string; viewer: BackofficeViewer }) {
  const today = useMemo(() => todayIso(), [])
  const initial = useMemo(() => rangeFor(today, 'day'), [today])
  const [scale, setScale] = useState<TimelineScale>('day')
  const [fromDate, setFromDate] = useState(initial.from)
  const [toDate, setToDate] = useState(initial.to)
  const timelineEndRef = useRef(initial.to)
  const [visibleDate, setVisibleDate] = useState(initial.from)
  const [portfolio, setPortfolio] = useState<PropertyPortfolio>({ branches: [], cities: [] })
  const [units, setUnits] = useState<TimelineUnit[]>([])
  const [bookings, setBookings] = useState<AdminBookingRecord[]>([])
  const [cityId, setCityId] = useState('ALL')
  const [areaId, setAreaId] = useState('ALL')
  const [buildingId, setBuildingId] = useState('ALL')
  const [locationPicker, setLocationPicker] = useState<LocationFilterKind>()
  const [selected, setSelected] = useState<AdminBookingRecord>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [truncated, setTruncated] = useState(false)
  const scrollRef = useRef<ElementRef<typeof ScrollView>>(null)
  const scrollX = useRef(0)
  const extending = useRef(false)
  const canRead = viewer.permissions.includes('booking:read')
  const periodWidth = scale === 'day' ? 58 : scale === 'week' ? 82 : 92
  const periods = useMemo(() => periodsFor(fromDate, toDate, scale), [fromDate, scale, toDate])
  const areas = useMemo(() => portfolio.cities.filter((city) => cityId === 'ALL' || city.id === cityId).flatMap((city) => city.areas), [cityId, portfolio.cities])
  const buildings = useMemo(() => areas.filter((area) => areaId === 'ALL' || area.id === areaId).flatMap((area) => area.buildings), [areaId, areas])
  const visibleUnits = useMemo(() => units.filter((unit) => (cityId === 'ALL' || unit.cityId === cityId) && (areaId === 'ALL' || unit.areaId === areaId) && (buildingId === 'ALL' || unit.buildingId === buildingId)), [areaId, buildingId, cityId, units])
  const selectedCity = cityId === 'ALL' ? 'Tất cả' : portfolio.cities.find((city) => city.id === cityId)?.name ?? 'Tất cả'
  const selectedArea = areaId === 'ALL' ? 'Tất cả' : areas.find((area) => area.id === areaId)?.name ?? 'Tất cả'
  const selectedBuilding = buildingId === 'ALL' ? 'Tất cả' : buildings.find((building) => building.id === buildingId)?.name ?? 'Tất cả'
  const pickerTitle = locationPicker === 'city' ? 'Chọn thành phố' : locationPicker === 'area' ? 'Chọn khu vực' : 'Chọn tòa'
  const pickerValue = locationPicker === 'city' ? cityId : locationPicker === 'area' ? areaId : buildingId
  const pickerOptions = locationPicker === 'city'
    ? portfolio.cities.map((city) => ({ id: city.id, name: city.name }))
    : locationPicker === 'area'
      ? areas.map((area) => ({ id: area.id, name: area.name }))
      : buildings.map((building) => ({ id: building.id, name: building.name }))

  const fetchRange = useCallback(async (propertyIds: string[], from: string, to: string, replace: boolean) => {
    if (!canRead || propertyIds.length === 0) { if (replace) setBookings([]); return }
    const timeline = await fetchAdminBookingTimeline(graphqlUrl, accessToken, { propertyIds: propertyIds.slice(0, 500), fromDate: from, toDateExclusive: to }, undefined, mobileFetch)
    setBookings((current) => {
      const merged = new Map((replace ? [] : current).map((booking) => [booking.id, booking]))
      timeline.nodes.forEach((booking) => merged.set(booking.id, booking))
      return [...merged.values()]
    })
    setTruncated((current) => replace ? timeline.truncated : current || timeline.truncated)
  }, [accessToken, canRead, graphqlUrl])

  useEffect(() => {
    let active = true
    void fetchPropertyPortfolio(graphqlUrl, accessToken, {}, undefined, mobileFetch).then(async (nextPortfolio) => {
      if (!active) return
      const mapped = nextPortfolio.cities.flatMap((city) => city.areas.flatMap((area) =>
        area.buildings.flatMap((building) => building.floors.flatMap((floor) =>
          floor.units.filter((unit) => Boolean(unit.branchId)).map((unit) => ({
            ...unit,
            cityId: city.id,
            cityName: city.name,
            areaId: area.id,
            areaName: area.name,
            buildingId: building.id,
            buildingName: building.name,
            floorName: floor.name,
          }))))))
      setPortfolio(nextPortfolio); setUnits(mapped)
      await fetchRange(mapped.map((unit) => unit.id), initial.from, initial.to, true)
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Không tải được sơ đồ booking.')).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [accessToken, fetchRange, graphqlUrl, initial.from, initial.to])

  async function reset(anchor: string, nextScale = scale) {
    const range = rangeFor(anchor, nextScale)
    timelineEndRef.current = range.to
    setLoading(true); setError(undefined); setFromDate(range.from); setToDate(range.to); setVisibleDate(range.from)
    scrollRef.current?.scrollTo({ x: 0, animated: false })
    try { await fetchRange(units.map((unit) => unit.id), range.from, range.to, true) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được khoảng lịch.') }
    finally { setLoading(false) }
  }

  async function extend() {
    if (extending.current || units.length === 0) return
    extending.current = true
    const chunkFrom = timelineEndRef.current
    const chunkTo = scale === 'day' ? addDays(chunkFrom, 31) : scale === 'week' ? addDays(chunkFrom, 112) : addMonths(chunkFrom, 12)
    try {
      await fetchRange(units.map((unit) => unit.id), chunkFrom, chunkTo, false)
      timelineEndRef.current = chunkTo
      setToDate(chunkTo)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không nạp thêm được timeline.') }
    finally { extending.current = false }
  }

  function selectLocation(value: string) {
    if (locationPicker === 'city') { setCityId(value); setAreaId('ALL'); setBuildingId('ALL') }
    if (locationPicker === 'area') { setAreaId(value); setBuildingId('ALL') }
    if (locationPicker === 'building') setBuildingId(value)
    setLocationPicker(undefined)
  }

  const bookingForUnit = (unitId: string) => bookings.filter((booking) => booking.propertyId === unitId && booking.checkOutDate > fromDate && booking.checkInDate < toDate)
  return <View style={styles.workspace}>
    <View style={styles.commandRail}>
      <View style={styles.metric}><Text style={styles.metricLabel}>Căn</Text><Text style={styles.metricValue}>{visibleUnits.length}</Text></View>
      <View style={styles.metric}><Text style={styles.metricLabel}>Booking</Text><Text style={styles.metricValue}>{bookings.length}</Text></View>
      <View style={styles.scale}>{(['day', 'week', 'month'] as TimelineScale[]).map((value) => <Pressable key={value} onPress={() => { setScale(value); void reset(visibleDate, value) }} style={[styles.scaleChoice, scale === value && styles.scaleActive]}><Text style={[styles.scaleText, scale === value && styles.scaleTextActive]}>{value === 'day' ? 'Ngày' : value === 'week' ? 'Tuần' : 'Tháng'}</Text></Pressable>)}</View>
    </View>
    <View style={styles.controlRail}>
      <View style={styles.dateControl}><Ionicons name="calendar-outline" color={palette.evergreen} size={17} /><View style={styles.dateCopy}><Text style={styles.dateLabel}>Bắt đầu từ</Text><TextInput value={visibleDate} onChangeText={setVisibleDate} onSubmitEditing={() => void reset(visibleDate)} style={styles.dateInput} /></View></View>
      <LocationControl label="Thành phố" value={selectedCity} onPress={() => setLocationPicker('city')} />
      <LocationControl label="Khu vực" value={selectedArea} onPress={() => setLocationPicker('area')} />
      <LocationControl label="Tòa" value={selectedBuilding} onPress={() => setLocationPicker('building')} />
    </View>
    {error && <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void reset(visibleDate)}><Text style={styles.retry}>Thử lại</Text></Pressable></View>}
    {truncated && <Text style={styles.warning}>Khoảng vừa nạp có hơn 2.000 booking. Hãy lọc hẹp vị trí để đối chiếu.</Text>}
    {loading && !bookings.length ? <View style={styles.loading}><ActivityIndicator color={palette.evergreen} /><Text style={styles.loadingText}>Đang dựng lịch căn…</Text></View> : <View style={styles.timelineFrame}>
      <View style={styles.unitLedger}><View style={styles.ledgerHeader}><Text style={styles.ledgerHeaderText}>Căn</Text></View>{visibleUnits.map((unit) => <View key={unit.id} style={styles.unitRow}><Text numberOfLines={1} style={styles.unitCode}>{unit.unitNumber || unit.code}</Text><Text numberOfLines={1} style={styles.unitPath}>{unit.buildingName} · {unit.floorName}</Text></View>)}{!visibleUnits.length && <View style={styles.unitRow}><Text style={styles.unitCode}>Không có căn</Text></View>}</View>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator onScroll={(event) => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; scrollX.current = contentOffset.x; const index = Math.min(periods.length - 1, Math.max(0, Math.floor(contentOffset.x / periodWidth))); if (periods[index]) setVisibleDate(periods[index].start); if (contentSize.width - layoutMeasurement.width - contentOffset.x < periodWidth * 2) void extend() }} scrollEventThrottle={32}>
        <View style={{ width: periods.length * periodWidth }}><View style={styles.periodHeader}>{periods.map((period) => <View key={period.key} style={[styles.periodCell, { width: periodWidth }]}><Text style={styles.periodEyebrow}>{period.eyebrow}</Text><Text style={styles.periodLabel}>{period.label}</Text></View>)}</View>{visibleUnits.map((unit) => <View key={unit.id} style={[styles.calendarRow, { width: periods.length * periodWidth }]}>{periods.map((period) => <View key={period.key} style={[styles.calendarCell, { width: periodWidth }]} />)}{bookingForUnit(unit.id).map((booking) => { const left = pixelOffset(booking.checkInDate, periods, periodWidth); const right = pixelOffset(booking.checkOutDate, periods, periodWidth); if (right <= left) return null; return <Pressable key={booking.id} onPress={() => setSelected(booking)} style={({ pressed }) => [styles.bookingBar, { left, width: Math.max(5, right - left) }, pressed && styles.bookingBarPressed]}><Text numberOfLines={1} style={styles.bookingBarText}>{booking.bookingCode}</Text></Pressable> })}</View>)}{!visibleUnits.length && <View style={[styles.calendarRow, { width: periods.length * periodWidth }]}>{periods.map((period) => <View key={period.key} style={[styles.calendarCell, { width: periodWidth }]} />)}</View>}</View>
      </ScrollView>
    </View>}
    <Modal animationType="slide" transparent visible={Boolean(locationPicker)} onRequestClose={() => setLocationPicker(undefined)}><View style={styles.backdrop}><View style={styles.filterSheet}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{pickerTitle}</Text><Pressable onPress={() => setLocationPicker(undefined)}><Ionicons name="close" color={palette.evergreen} size={24} /></Pressable></View><ScrollView contentContainerStyle={styles.filterSheetOptions}><Pressable onPress={() => selectLocation('ALL')} style={[styles.filterSheetChoice, pickerValue === 'ALL' && styles.filterSheetChoiceActive]}><Text style={[styles.filterSheetText, pickerValue === 'ALL' && styles.filterSheetTextActive]}>Tất cả</Text>{pickerValue === 'ALL' && <Ionicons name="checkmark" color={palette.white} size={17} />}</Pressable>{pickerOptions.map((option) => <Pressable key={option.id} onPress={() => selectLocation(option.id)} style={[styles.filterSheetChoice, pickerValue === option.id && styles.filterSheetChoiceActive]}><Text numberOfLines={1} style={[styles.filterSheetText, pickerValue === option.id && styles.filterSheetTextActive]}>{option.name}</Text>{pickerValue === option.id && <Ionicons name="checkmark" color={palette.white} size={17} />}</Pressable>)}</ScrollView></View></View></Modal>
    <Modal animationType="slide" transparent visible={Boolean(selected)} onRequestClose={() => setSelected(undefined)}><View style={styles.backdrop}><View style={styles.sheet}>{selected && <><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>{selected.bookingCode}</Text><Text style={styles.sheetMeta}>{selected.status}</Text></View><Pressable onPress={() => setSelected(undefined)}><Ionicons name="close" color={palette.evergreen} size={24} /></Pressable></View><View style={styles.detail}><Text style={styles.detailName}>{selected.guestName}</Text><Text style={styles.detailText}>{selected.propertyName || selected.propertyId}</Text><Text style={styles.detailText}>{selected.checkInDate} → {selected.checkOutDate}</Text></View></>}</View></View></Modal>
  </View>
}

function LocationControl({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.locationControl, pressed && styles.locationControlPressed]}><View style={styles.locationControlCopy}><Text numberOfLines={1} style={styles.locationControlLabel}>{label}</Text><Text numberOfLines={1} style={styles.locationControlValue}>{value}</Text></View><Ionicons name="chevron-down" color={palette.evergreen} size={12} /></Pressable> }

const styles = StyleSheet.create({
  workspace: { gap: 8 }, commandRail: { minHeight: 48, flexDirection: 'row', gap: 7 }, metric: { width: 72, paddingHorizontal: 9, borderRadius: radii.small, backgroundColor: palette.ink, justifyContent: 'center' }, metricLabel: { color: '#B9D0C7', fontSize: 8 }, metricValue: { marginTop: 2, color: palette.white, fontSize: 15, fontWeight: '700' }, scale: { flex: 1, padding: 3, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', gap: 2 }, scaleChoice: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 4 }, scaleActive: { backgroundColor: palette.evergreen }, scaleText: { color: palette.muted, fontSize: 9, fontWeight: '600' }, scaleTextActive: { color: palette.white },
  controlRail: { minWidth: 0, minHeight: 45, flexDirection: 'row', gap: 5 }, dateControl: { minWidth: 0, minHeight: 45, paddingHorizontal: 7, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flex: 1.35, flexDirection: 'row', alignItems: 'center', gap: 5 }, dateCopy: { minWidth: 0, flex: 1 }, dateLabel: { color: palette.muted, fontSize: 7.5 }, dateInput: { height: 23, padding: 0, color: palette.ink, fontSize: 9, fontWeight: '600' }, locationControl: { minWidth: 0, minHeight: 45, paddingHorizontal: 6, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }, locationControlPressed: { borderColor: palette.sage, backgroundColor: '#F3F8F2' }, locationControlCopy: { minWidth: 0, flex: 1 }, locationControlLabel: { color: palette.muted, fontSize: 7, fontWeight: '600' }, locationControlValue: { marginTop: 3, color: palette.ink, fontSize: 8.5, fontWeight: '700' },
  error: { padding: 10, borderRadius: radii.small, backgroundColor: '#FFF0EC', flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, errorText: { flex: 1, color: palette.danger, fontSize: 9 }, retry: { color: palette.evergreen, fontSize: 9, fontWeight: '700' }, warning: { padding: 8, borderRadius: radii.small, backgroundColor: '#FFF6DD', color: '#765B18', fontSize: 8 }, loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8 }, loadingText: { color: palette.muted, fontSize: 9 },
  timelineFrame: { borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, overflow: 'hidden', flexDirection: 'row' }, unitLedger: { width: 108, zIndex: 2, backgroundColor: '#FFFEF9' }, ledgerHeader: { height: 48, paddingHorizontal: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: palette.line, justifyContent: 'center', backgroundColor: '#E8F0E5' }, ledgerHeaderText: { color: palette.evergreen, fontSize: 9, fontWeight: '700' }, unitRow: { height: 34, paddingHorizontal: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: palette.line, justifyContent: 'center' }, unitCode: { color: palette.ink, fontSize: 9, fontWeight: '700' }, unitPath: { marginTop: 1, color: palette.muted, fontSize: 6.5 }, periodHeader: { height: 48, flexDirection: 'row' }, periodCell: { borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.line, backgroundColor: '#F4F7F2', alignItems: 'center', justifyContent: 'center' }, periodEyebrow: { color: palette.muted, fontSize: 7 }, periodLabel: { marginTop: 2, color: palette.ink, fontSize: 9, fontWeight: '700' }, calendarRow: { height: 34, flexDirection: 'row', position: 'relative' }, calendarCell: { height: 34, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E2E9E3' }, bookingBar: { position: 'absolute', top: 3, height: 28, paddingHorizontal: 7, borderRadius: 7, backgroundColor: '#48A86F', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, bookingBarPressed: { opacity: .82 }, bookingBarText: { color: palette.white, fontSize: 8, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9,35,40,.5)' }, sheet: { padding: 16, paddingBottom: 34, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: palette.background, gap: 12 }, filterSheet: { maxHeight: '68%', padding: 16, paddingBottom: 28, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: palette.background, gap: 12 }, filterSheetOptions: { gap: 6 }, filterSheetChoice: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, filterSheetChoiceActive: { borderColor: palette.evergreen, backgroundColor: palette.evergreen }, filterSheetText: { flex: 1, color: palette.ink, fontSize: 11, fontWeight: '600' }, filterSheetTextActive: { color: palette.white, fontWeight: '700' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' }, sheetMeta: { marginTop: 2, color: palette.muted, fontSize: 9 }, detail: { padding: 12, borderRadius: radii.small, backgroundColor: palette.white, gap: 5 }, detailName: { color: palette.ink, fontSize: 13, fontWeight: '700' }, detailText: { color: palette.muted, fontSize: 10 },
})
