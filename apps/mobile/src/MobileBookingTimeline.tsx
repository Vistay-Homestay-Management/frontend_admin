import { useCallback, useEffect, useMemo, useRef, useState, type ElementRef, type ReactNode } from 'react'
import { Ionicons } from '@expo/vector-icons'
import * as Crypto from 'expo-crypto'
import { fetch as expoFetch } from 'expo/fetch'
import { ActivityIndicator, Animated, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import {
  createInventoryBlock,
  fetchAdminBookingTimeline,
  fetchInventoryBlocks,
  fetchPropertyPortfolio,
  type AdminBookingRecord,
  type BackofficeViewer,
  type OperatorInventoryBlockType,
  type PropertyPortfolio,
  type PropertyUnitRecord,
} from '@vistay/admin-api-client'
import { palette, radii } from './ui/theme'
import type { WorkspaceScrollGate } from './ui/primitives'

const mobileFetch = expoFetch as typeof globalThis.fetch
type TimelineScale = 'day' | 'week' | 'month'
type LocationFilterKind = 'city' | 'area' | 'building'
const OPERATOR_TYPES: OperatorInventoryBlockType[] = ['MAINTENANCE', 'CLEANING', 'OWNER_USE', 'MANUAL']
const operatorTypeLabels: Record<OperatorInventoryBlockType, string> = {
  MAINTENANCE: 'Bảo trì', CLEANING: 'Dọn phòng', OWNER_USE: 'Chủ nhà sử dụng', MANUAL: 'Khóa thủ công',
}
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

export function MobileBookingTimeline({ graphqlUrl, accessToken, viewer, onRefresh, refreshing = false, scrollGate, stickyTopContent, topContent }: {
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
  onRefresh?: () => void
  refreshing?: boolean
  scrollGate: WorkspaceScrollGate
  stickyTopContent?: ReactNode
  topContent?: ReactNode
}) {
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
  const [createOpen, setCreateOpen] = useState(false)
  const [createUnitId, setCreateUnitId] = useState('')
  const [createType, setCreateType] = useState<OperatorInventoryBlockType>('MAINTENANCE')
  const [createFrom, setCreateFrom] = useState(today)
  const [createTo, setCreateTo] = useState(addDays(today, 1))
  const [createReason, setCreateReason] = useState('Bảo trì căn theo kế hoạch vận hành')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [unitLedgerWidth, setUnitLedgerWidth] = useState(48)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [truncated, setTruncated] = useState(false)
  const scrollRef = useRef<ElementRef<typeof ScrollView>>(null)
  const [initialVerticalOffset] = useState(() => scrollGate.headerHidden ? 56 : 0)
  const initialVerticalOffsetPending = useRef(initialVerticalOffset > 0)
  const [horizontalOffset] = useState(() => new Animated.Value(0))
  const visiblePeriodIndex = useRef(0)
  const extending = useRef(false)
  const canRead = viewer.permissions.includes('booking:read')
  const canCreateBlock = viewer.permissions.includes('inventory:block')
  const periodWidth = scale === 'day' ? 58 : scale === 'week' ? 82 : 92
  const periods = useMemo(() => periodsFor(fromDate, toDate, scale), [fromDate, scale, toDate])
  const timelineWidth = periods.length * periodWidth
  const headerTranslateX = useMemo(() => Animated.multiply(horizontalOffset, -1), [horizontalOffset])
  const areas = useMemo(() => portfolio.cities.filter((city) => cityId === 'ALL' || city.id === cityId).flatMap((city) => city.areas), [cityId, portfolio.cities])
  const buildings = useMemo(() => areas.filter((area) => areaId === 'ALL' || area.id === areaId).flatMap((area) => area.buildings), [areaId, areas])
  const visibleUnits = useMemo(() => units.filter((unit) => (cityId === 'ALL' || unit.cityId === cityId) && (areaId === 'ALL' || unit.areaId === areaId) && (buildingId === 'ALL' || unit.buildingId === buildingId)), [areaId, buildingId, cityId, units])
  const timelineHeight = Math.max(34, visibleUnits.length * 34)
  const bookingsByUnit = useMemo(() => {
    const grouped = new Map<string, AdminBookingRecord[]>()
    bookings.forEach((booking) => {
      if (booking.checkOutDate <= fromDate || booking.checkInDate >= toDate) return
      const current = grouped.get(booking.propertyId)
      if (current) current.push(booking)
      else grouped.set(booking.propertyId, [booking])
    })
    return grouped
  }, [bookings, fromDate, toDate])
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
    horizontalOffset.setValue(0)
    visiblePeriodIndex.current = 0
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

  function openCreateBlock() {
    if (!canCreateBlock || visibleUnits.length === 0) return
    const unitId = visibleUnits.some((unit) => unit.id === createUnitId) ? createUnitId : visibleUnits[0].id
    setCreateUnitId(unitId)
    setCreateFrom(visibleDate)
    setCreateTo(addDays(visibleDate, 1))
    setCreateError(undefined)
    setNotice(undefined)
    setCreateOpen(true)
  }

  async function submitCreateBlock() {
    const reason = createReason.trim()
    if (!createUnitId) { setCreateError('Hãy chọn căn cần tạo block.'); return }
    if (createTo <= createFrom) { setCreateError('Ngày kết thúc phải sau ngày bắt đầu.'); return }
    if (reason.length < 10 || reason.length > 1000) { setCreateError('Lý do cần từ 10 đến 1000 ký tự.'); return }
    setCreateBusy(true); setCreateError(undefined)
    try {
      const latest = await fetchInventoryBlocks(graphqlUrl, accessToken, {
        propertyId: createUnitId, fromDate: createFrom, toDateExclusive: createTo, first: 1,
      }, undefined, mobileFetch)
      const correlationId = Crypto.randomUUID()
      await createInventoryBlock(graphqlUrl, accessToken, {
        propertyId: createUnitId,
        blockType: createType,
        startDate: createFrom,
        endDateExclusive: createTo,
        expectedInventoryRevision: latest.inventoryRevision,
        reason,
        correlationId,
        idempotencyKey: `admin-mobile-timeline-${correlationId}`,
      }, mobileFetch)
      setCreateOpen(false)
      setNotice('Đã tạo block vận hành.')
    } catch (reasonCaught) {
      setCreateError(reasonCaught instanceof Error ? reasonCaught.message : 'Không tạo được block vận hành.')
    } finally { setCreateBusy(false) }
  }

  function handleHorizontalScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const index = Math.min(periods.length - 1, Math.max(0, Math.floor(contentOffset.x / periodWidth)))
    if (index !== visiblePeriodIndex.current && periods[index]) {
      visiblePeriodIndex.current = index
      setVisibleDate(periods[index].start)
    }
    if (contentSize.width - layoutMeasurement.width - contentOffset.x < periodWidth * 2) void extend()
  }

  function handleVerticalScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (initialVerticalOffsetPending.current) {
      if (event.nativeEvent.contentOffset.y < initialVerticalOffset - 1) return
      initialVerticalOffsetPending.current = false
    }
    scrollGate.onScroll(event)
  }

  return <View style={styles.timelineScreen}>
    <ScrollView
      style={styles.timelineScreen}
      contentContainerStyle={styles.workspace}
      contentOffset={{ x: 0, y: initialVerticalOffset }}
      stickyHeaderIndices={[1]}
      keyboardShouldPersistTaps="handled"
      onScroll={handleVerticalScroll}
      onTouchStart={scrollGate.onTouchStart}
      onScrollBeginDrag={scrollGate.onScrollBeginDrag}
      onScrollEndDrag={scrollGate.onScrollEndDrag}
      onMomentumScrollEnd={scrollGate.onMomentumScrollEnd}
      scrollEventThrottle={16}
      refreshControl={onRefresh ? <RefreshControl enabled={scrollGate.refreshEnabled} refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.evergreen} /> : undefined}
    >
      <View style={styles.topContent}>{topContent}</View>
      <View style={styles.stickyWorkspace}>
        {stickyTopContent ? <View style={styles.stickyTopSlot}>{stickyTopContent}</View> : null}
        <View style={styles.alignedRail}>
          <View style={styles.wideSlot}><View style={styles.metricPair}>
            <View onLayout={(event) => setUnitLedgerWidth(Math.round(event.nativeEvent.layout.width))} style={styles.metric}><Text style={styles.metricLabel}>Căn</Text><Text style={styles.metricValue}>{visibleUnits.length}</Text></View>
            <View style={styles.metric}><Text style={styles.metricLabel}>Booking</Text><Text style={styles.metricValue}>{bookings.length}</Text></View>
          </View></View>
          <View style={styles.doubleNarrowSlot}><View style={styles.scale}>{(['day', 'week', 'month'] as TimelineScale[]).map((value) => <Pressable key={value} onPress={() => { setScale(value); void reset(visibleDate, value) }} style={[styles.scaleChoice, scale === value && styles.scaleActive]}><Text style={[styles.scaleText, scale === value && styles.scaleTextActive]}>{value === 'day' ? 'Ngày' : value === 'week' ? 'Tuần' : 'Tháng'}</Text></Pressable>)}</View></View>
          <View style={styles.lastNarrowSlot}><Pressable accessibilityRole="button" disabled={!canCreateBlock || visibleUnits.length === 0 || createBusy} onPress={openCreateBlock} style={({ pressed }) => [styles.createButton, (!canCreateBlock || visibleUnits.length === 0 || createBusy) && styles.controlDisabled, pressed && styles.controlPressed]}><Text style={styles.createButtonText}>Tạo block</Text></Pressable></View>
        </View>
        <View style={styles.alignedRail}>
          <View style={styles.wideSlot}><View style={styles.dateControl}><Ionicons name="calendar-outline" color={palette.evergreen} size={15} /><View style={styles.dateCopy}><Text style={styles.dateLabel}>Bắt đầu từ</Text><TextInput value={visibleDate} onChangeText={setVisibleDate} onSubmitEditing={() => void reset(visibleDate)} style={styles.dateInput} /></View></View></View>
          <View style={styles.narrowSlot}><LocationControl label="Thành phố" value={selectedCity} onPress={() => setLocationPicker('city')} /></View>
          <View style={styles.narrowSlot}><LocationControl label="Khu vực" value={selectedArea} onPress={() => setLocationPicker('area')} /></View>
          <View style={styles.lastNarrowSlot}><LocationControl label="Tòa" value={selectedBuilding} onPress={() => setLocationPicker('building')} /></View>
        </View>
        <View style={styles.timelineHeaderFrame}><View style={styles.timelineHeader}>
          <View style={[styles.ledgerHeader, { width: unitLedgerWidth }]}><Text style={styles.ledgerHeaderText}>Căn</Text></View>
          <View style={styles.timelineHeaderViewport}><Animated.View style={[styles.periodHeader, { width: timelineWidth, transform: [{ translateX: headerTranslateX }] }]}>{periods.map((period) => <View key={period.key} style={[styles.periodCell, { width: periodWidth }]}><Text style={styles.periodEyebrow}>{period.eyebrow}</Text><Text style={styles.periodLabel}>{period.label}</Text></View>)}</Animated.View></View>
        </View></View>
      </View>
      {notice && <Text style={styles.notice}>{notice}</Text>}
      {error && <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void reset(visibleDate)}><Text style={styles.retry}>Thử lại</Text></Pressable></View>}
      {truncated && <Text style={styles.warning}>Khoảng vừa nạp có hơn 2.000 booking. Hãy lọc hẹp vị trí để đối chiếu.</Text>}
      {loading && !bookings.length ? <View style={styles.loading}><ActivityIndicator color={palette.evergreen} /><Text style={styles.loadingText}>Đang dựng lịch căn…</Text></View> : <View style={styles.timelineRowsFrame}><View style={styles.timelineRows}>
        <View style={[styles.unitLedger, { width: unitLedgerWidth }]}>{visibleUnits.map((unit) => <View key={unit.id} style={styles.unitRow}><Text numberOfLines={1} style={styles.unitCode}>{unit.code || unit.unitNumber}</Text></View>)}{!visibleUnits.length && <View style={styles.unitRow}><Text numberOfLines={1} style={styles.unitCode}>Trống</Text></View>}</View>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator
          style={styles.timelineGridScroll}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: horizontalOffset } } }], { useNativeDriver: true })}
          onScrollEndDrag={handleHorizontalScroll}
          onMomentumScrollEnd={handleHorizontalScroll}
          scrollEventThrottle={16}
        >
          <View style={[styles.calendarGrid, { width: timelineWidth, height: timelineHeight }]}>
            {periods.map((period, index) => <View pointerEvents="none" key={period.key} style={[styles.calendarColumn, { left: index * periodWidth, width: periodWidth, height: timelineHeight }]} />)}
            {(visibleUnits.length ? visibleUnits : [{ id: 'empty-row' }]).map((unit, index) => <View pointerEvents="none" key={unit.id} style={[styles.calendarRowLine, { top: index * 34, width: timelineWidth }]} />)}
            {visibleUnits.flatMap((unit, rowIndex) => (bookingsByUnit.get(unit.id) ?? []).map((booking) => {
              const left = pixelOffset(booking.checkInDate, periods, periodWidth)
              const right = pixelOffset(booking.checkOutDate, periods, periodWidth)
              if (right <= left) return null
              return <Pressable key={booking.id} onPress={() => setSelected(booking)} style={({ pressed }) => [styles.bookingBar, { top: rowIndex * 34 + 3, left, width: Math.max(5, right - left) }, pressed && styles.bookingBarPressed]}><Text numberOfLines={1} style={styles.bookingBarText}>{booking.bookingCode}</Text></Pressable>
            }))}
          </View>
        </Animated.ScrollView>
      </View></View>}
    </ScrollView>
    <Modal animationType="slide" transparent visible={createOpen} onRequestClose={() => setCreateOpen(false)}><View style={styles.backdrop}><View style={styles.blockSheet}>
      <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Tạo block vận hành</Text><Pressable onPress={() => setCreateOpen(false)}><Ionicons name="close" color={palette.evergreen} size={24} /></Pressable></View>
      <Text style={styles.formLabel}>Căn</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitChoices}>{visibleUnits.map((unit) => <Pressable key={unit.id} onPress={() => setCreateUnitId(unit.id)} style={[styles.unitChoice, createUnitId === unit.id && styles.unitChoiceActive]}><Text numberOfLines={1} style={[styles.unitChoiceText, createUnitId === unit.id && styles.unitChoiceTextActive]}>{unit.unitNumber || unit.code}</Text></Pressable>)}</ScrollView>
      <Text style={styles.formLabel}>Loại block</Text>
      <View style={styles.typeGrid}>{OPERATOR_TYPES.map((type) => <Pressable key={type} onPress={() => setCreateType(type)} style={[styles.typeChoice, createType === type && styles.typeChoiceActive]}><Text style={[styles.typeChoiceText, createType === type && styles.typeChoiceTextActive]}>{operatorTypeLabels[type]}</Text></Pressable>)}</View>
      <View style={styles.formDateRow}><View style={styles.formDateField}><Text style={styles.formLabel}>Bắt đầu</Text><TextInput value={createFrom} onChangeText={setCreateFrom} style={styles.formInput} /></View><View style={styles.formDateField}><Text style={styles.formLabel}>Kết thúc</Text><TextInput value={createTo} onChangeText={setCreateTo} style={styles.formInput} /></View></View>
      <Text style={styles.formLabel}>Lý do</Text><TextInput multiline value={createReason} onChangeText={setCreateReason} style={[styles.formInput, styles.reasonInput]} />
      {createError && <Text style={styles.createError}>{createError}</Text>}
      <Pressable disabled={createBusy} onPress={() => void submitCreateBlock()} style={[styles.submitBlock, createBusy && styles.controlDisabled]}>{createBusy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.submitBlockText}>Tạo block</Text>}</Pressable>
    </View></View></Modal>
    <Modal animationType="slide" transparent visible={Boolean(locationPicker)} onRequestClose={() => setLocationPicker(undefined)}><View style={styles.backdrop}><View style={styles.filterSheet}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{pickerTitle}</Text><Pressable onPress={() => setLocationPicker(undefined)}><Ionicons name="close" color={palette.evergreen} size={24} /></Pressable></View><ScrollView contentContainerStyle={styles.filterSheetOptions}><Pressable onPress={() => selectLocation('ALL')} style={[styles.filterSheetChoice, pickerValue === 'ALL' && styles.filterSheetChoiceActive]}><Text style={[styles.filterSheetText, pickerValue === 'ALL' && styles.filterSheetTextActive]}>Tất cả</Text>{pickerValue === 'ALL' && <Ionicons name="checkmark" color={palette.white} size={17} />}</Pressable>{pickerOptions.map((option) => <Pressable key={option.id} onPress={() => selectLocation(option.id)} style={[styles.filterSheetChoice, pickerValue === option.id && styles.filterSheetChoiceActive]}><Text numberOfLines={1} style={[styles.filterSheetText, pickerValue === option.id && styles.filterSheetTextActive]}>{option.name}</Text>{pickerValue === option.id && <Ionicons name="checkmark" color={palette.white} size={17} />}</Pressable>)}</ScrollView></View></View></Modal>
    <Modal animationType="slide" transparent visible={Boolean(selected)} onRequestClose={() => setSelected(undefined)}><View style={styles.backdrop}><View style={styles.sheet}>{selected && <><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>{selected.bookingCode}</Text><Text style={styles.sheetMeta}>{selected.status}</Text></View><Pressable onPress={() => setSelected(undefined)}><Ionicons name="close" color={palette.evergreen} size={24} /></Pressable></View><View style={styles.detail}><Text style={styles.detailName}>{selected.guestName}</Text><Text style={styles.detailText}>{selected.propertyName || selected.propertyId}</Text><Text style={styles.detailText}>{selected.checkInDate} → {selected.checkOutDate}</Text></View></>}</View></View></Modal>
  </View>
}

function LocationControl({ label, value, onPress }: { label: string; value: string; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.locationControl, pressed && styles.locationControlPressed]}><View style={styles.locationControlCopy}><Text numberOfLines={1} style={styles.locationControlLabel}>{label}</Text><Text numberOfLines={1} style={styles.locationControlValue}>{value}</Text></View><Ionicons name="chevron-down" color={palette.evergreen} size={12} /></Pressable> }

const styles = StyleSheet.create({
  timelineScreen: { flex: 1, minHeight: 0 },
  workspace: { flexGrow: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14 },
  topContent: { marginBottom: 0 },
  stickyWorkspace: { zIndex: 4, paddingTop: 12, backgroundColor: palette.background },
  stickyTopSlot: { marginBottom: 8 },
  alignedRail: { width: '100%', height: 40, marginBottom: 8, flexDirection: 'row' },
  wideSlot: { width: '31%', paddingRight: 5 },
  narrowSlot: { width: '23%', paddingRight: 5 },
  doubleNarrowSlot: { width: '46%', paddingRight: 5 },
  lastNarrowSlot: { width: '23%' },
  metricPair: { flex: 1, flexDirection: 'row', gap: 4 },
  metric: { minWidth: 0, flex: 1, height: 40, paddingHorizontal: 6, borderRadius: radii.small, backgroundColor: palette.ink, justifyContent: 'center' },
  metricLabel: { color: '#B9D0C7', fontSize: 9, fontWeight: '600' },
  metricValue: { marginTop: 1, color: palette.white, fontSize: 13, fontWeight: '700' },
  scale: { flex: 1, height: 40, borderWidth: 1, borderColor: palette.controlLine, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', overflow: 'hidden' },
  scaleChoice: { flex: 1, alignItems: 'center', justifyContent: 'center' }, scaleActive: { zIndex: 1, margin: 2, borderRadius: 4, backgroundColor: palette.evergreen }, scaleText: { color: palette.muted, fontSize: 11, fontWeight: '600' }, scaleTextActive: { color: palette.white, fontWeight: '700' },
  createButton: { flex: 1, height: 40, borderRadius: radii.small, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' },
  createButtonText: { color: palette.white, fontSize: 11, fontWeight: '700' },
  controlPressed: { opacity: .82 }, controlDisabled: { opacity: .45 },
  dateControl: { minWidth: 0, flex: 1, height: 40, paddingHorizontal: 6, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 4 }, dateCopy: { minWidth: 0, flex: 1 }, dateLabel: { color: palette.muted, fontSize: 9, fontWeight: '600' }, dateInput: { height: 20, padding: 0, color: palette.ink, fontSize: 10, fontWeight: '600' }, locationControl: { minWidth: 0, flex: 1, height: 40, paddingHorizontal: 6, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 3 }, locationControlPressed: { borderColor: palette.sage, backgroundColor: '#F3F8F2' }, locationControlCopy: { minWidth: 0, flex: 1 }, locationControlLabel: { color: palette.muted, fontSize: 9, fontWeight: '600' }, locationControlValue: { marginTop: 2, color: palette.ink, fontSize: 10, fontWeight: '600' },
  notice: { marginVertical: 8, padding: 8, borderRadius: radii.small, backgroundColor: '#E8F3E4', color: palette.evergreen, fontSize: 8.5, fontWeight: '600' },
  error: { marginVertical: 8, padding: 10, borderRadius: radii.small, backgroundColor: '#FFF0EC', flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, errorText: { flex: 1, color: palette.danger, fontSize: 9 }, retry: { color: palette.evergreen, fontSize: 9, fontWeight: '700' }, warning: { marginVertical: 8, padding: 8, borderRadius: radii.small, backgroundColor: '#FFF6DD', color: '#765B18', fontSize: 8 }, loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8 }, loadingText: { color: palette.muted, fontSize: 9 },
  timelineHeaderFrame: { borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: palette.line, borderTopLeftRadius: radii.small, borderTopRightRadius: radii.small, backgroundColor: palette.white, overflow: 'hidden' }, timelineRowsFrame: { borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: palette.line, borderBottomLeftRadius: radii.small, borderBottomRightRadius: radii.small, backgroundColor: palette.white, overflow: 'hidden' }, timelineHeader: { height: 48, flexDirection: 'row' }, timelineHeaderViewport: { flex: 1, overflow: 'hidden' }, timelineRows: { minHeight: 34, flexDirection: 'row' }, timelineGridScroll: { flex: 1 }, unitLedger: { zIndex: 2, backgroundColor: '#FFFEF9' }, ledgerHeader: { height: 48, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F0E5' }, ledgerHeaderText: { color: palette.evergreen, fontSize: 11, fontWeight: '700' }, unitRow: { height: 34, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' }, unitCode: { color: palette.ink, fontSize: 10, fontWeight: '600' }, periodHeader: { height: 48, flexDirection: 'row' }, periodCell: { borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.line, backgroundColor: '#F4F7F2', alignItems: 'center', justifyContent: 'center' }, periodEyebrow: { color: palette.muted, fontSize: 7 }, periodLabel: { marginTop: 2, color: palette.ink, fontSize: 9, fontWeight: '700' }, calendarGrid: { position: 'relative', backgroundColor: palette.white }, calendarColumn: { position: 'absolute', top: 0, borderRightWidth: StyleSheet.hairlineWidth, borderColor: '#E2E9E3' }, calendarRowLine: { position: 'absolute', left: 0, height: 34, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#E2E9E3' }, bookingBar: { position: 'absolute', height: 28, paddingHorizontal: 7, borderRadius: 7, backgroundColor: '#48A86F', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, bookingBarPressed: { opacity: .82 }, bookingBarText: { color: palette.white, fontSize: 8, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9,35,40,.5)' },
  sheet: { padding: 16, paddingBottom: 34, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: palette.background, gap: 12 },
  blockSheet: { padding: 16, paddingBottom: 28, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: palette.background, gap: 9 },
  unitChoices: { gap: 6 }, unitChoice: { minWidth: 52, height: 34, paddingHorizontal: 10, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' }, unitChoiceActive: { borderColor: palette.evergreen, backgroundColor: palette.evergreen }, unitChoiceText: { color: palette.ink, fontSize: 9, fontWeight: '600' }, unitChoiceTextActive: { color: palette.white },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, typeChoice: { width: '48%', height: 36, paddingHorizontal: 8, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' }, typeChoiceActive: { borderColor: palette.evergreen, backgroundColor: palette.evergreen }, typeChoiceText: { color: palette.ink, fontSize: 9, fontWeight: '600' }, typeChoiceTextActive: { color: palette.white, fontWeight: '700' },
  formDateRow: { flexDirection: 'row', gap: 7 }, formDateField: { flex: 1, gap: 5 }, formLabel: { color: palette.evergreen, fontSize: 9, fontWeight: '600' }, formInput: { minHeight: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, color: palette.ink, fontSize: 10 }, reasonInput: { minHeight: 62, paddingTop: 9, textAlignVertical: 'top' }, createError: { color: palette.danger, fontSize: 9 }, submitBlock: { height: 40, borderRadius: radii.small, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' }, submitBlockText: { color: palette.white, fontSize: 10, fontWeight: '700' },
  filterSheet: { maxHeight: '68%', padding: 16, paddingBottom: 28, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: palette.background, gap: 12 }, filterSheetOptions: { gap: 6 }, filterSheetChoice: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, filterSheetChoiceActive: { borderColor: palette.evergreen, backgroundColor: palette.evergreen }, filterSheetText: { flex: 1, color: palette.ink, fontSize: 11, fontWeight: '600' }, filterSheetTextActive: { color: palette.white, fontWeight: '700' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' }, sheetMeta: { marginTop: 2, color: palette.muted, fontSize: 9 }, detail: { padding: 12, borderRadius: radii.small, backgroundColor: palette.white, gap: 5 }, detailName: { color: palette.ink, fontSize: 13, fontWeight: '700' }, detailText: { color: palette.muted, fontSize: 10 },
})
