import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  ApiError,
  createInventoryBlock,
  fetchAdminBookingTimeline,
  fetchInventoryBlocks,
  fetchPropertyPortfolio,
  releaseInventoryBlock,
  type BackofficeViewer,
  type AdminBookingRecord,
  type InventoryBlockManagementNode,
  type InventoryBlockManagementPage,
  type InventoryBlockStatus,
  type InventoryBlockType,
  type OperatorInventoryBlockType,
  type PropertyUnitRecord,
  type PropertyPortfolio,
} from '@vistay/admin-api-client'
import {
  ArrowClockwise,
  CalendarBlank,
  CheckCircle,
  LockKeyOpen,
  Plus,
  SpinnerGap,
  WarningCircle,
  X,
} from '@phosphor-icons/react'

interface InventoryWorkspaceProps {
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
  section: InventorySection
}

export type InventorySection = 'map' | 'reservations' | 'check-in' | 'check-out'
type TimelineScale = 'day' | 'week' | 'month'

interface TimelinePeriod {
  key: string
  start: string
  end: string
  eyebrow: string
  label: string
}

interface TimelineUnit extends PropertyUnitRecord {
  path: string
  cityId: string
  cityName: string
  areaId: string
  areaName: string
  buildingId: string
  buildingName: string
  floorName: string
}

interface TimelineBar {
  id: string
  type: InventoryBlockType
  status: string
  startDate: string
  endDateExclusive: string
  title: string
  subtitle: string
  node?: InventoryBlockManagementNode
}

const LOCAL_MANAGEMENT_PROPERTY = '61000000-0000-4000-8000-000000000010'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const typeLabels: Record<InventoryBlockType, string> = {
  BOOKING: 'Đặt phòng',
  MAINTENANCE: 'Bảo trì',
  CLEANING: 'Dọn phòng',
  OWNER_USE: 'Chủ nhà sử dụng',
  MANUAL: 'Khóa thủ công',
  CHANNEL: 'Kênh OTA',
}

const statusLabels: Record<InventoryBlockStatus, string> = {
  TENTATIVE: 'Tạm giữ',
  ACTIVE: 'Đang chặn',
  RELEASED: 'Đã giải phóng',
  CANCELLED: 'Đã hủy',
}

const operatorTypes: OperatorInventoryBlockType[] = ['MAINTENANCE', 'CLEANING', 'OWNER_USE', 'MANUAL']
const bookingBlockTypes: InventoryBlockType[] = ['BOOKING', 'CHANNEL']

function isoToday(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function addMonths(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + amount)
  return date.toISOString().slice(0, 10)
}

function dateDistance(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-4)}`
}

function formatDay(value: string): { weekday: string; day: string } {
  const date = new Date(`${value}T00:00:00Z`)
  return {
    weekday: new Intl.DateTimeFormat('vi-VN', { weekday: 'short', timeZone: 'UTC' }).format(date),
    day: new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date),
  }
}

function startOfWeek(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  const offset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - offset)
  return date.toISOString().slice(0, 10)
}

function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`
}

function isoWeek(value: string): number {
  const date = new Date(`${value}T00:00:00Z`)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
}

function timelineRange(anchor: string, scale: TimelineScale): { from: string; to: string } {
  if (scale === 'week') {
    const from = startOfWeek(anchor)
    return { from, to: addDays(from, 112) }
  }
  if (scale === 'month') {
    const from = startOfMonth(anchor)
    return { from, to: addMonths(from, 12) }
  }
  return { from: anchor, to: addDays(anchor, 31) }
}

function timelinePeriods(from: string, to: string, scale: TimelineScale): TimelinePeriod[] {
  const periods: TimelinePeriod[] = []
  let cursor = from
  while (cursor < to && periods.length < 400) {
    const next = scale === 'day' ? addDays(cursor, 1) : scale === 'week' ? addDays(cursor, 7) : addMonths(cursor, 1)
    const end = next < to ? next : to
    if (scale === 'day') {
      const copy = formatDay(cursor)
      periods.push({ key: cursor, start: cursor, end, eyebrow: copy.weekday, label: copy.day })
    } else if (scale === 'week') {
      const endInclusive = addDays(end, -1)
      periods.push({
        key: cursor,
        start: cursor,
        end,
        eyebrow: `Tuần ${isoWeek(cursor)}`,
        label: `${cursor.slice(8, 10)}/${cursor.slice(5, 7)}–${endInclusive.slice(8, 10)}/${endInclusive.slice(5, 7)}`,
      })
    } else {
      const date = new Date(`${cursor}T00:00:00Z`)
      periods.push({
        key: cursor,
        start: cursor,
        end,
        eyebrow: new Intl.DateTimeFormat('vi-VN', { month: 'short', timeZone: 'UTC' }).format(date),
        label: String(date.getUTCFullYear()),
      })
    }
    cursor = end
  }
  return periods
}

function timelinePixelOffset(value: string, periods: TimelinePeriod[], periodWidth: number): number {
  if (!periods.length || value <= periods[0].start) return 0
  for (let index = 0; index < periods.length; index += 1) {
    const period = periods[index]
    if (value < period.end) {
      const periodDays = Math.max(1, dateDistance(period.start, period.end))
      const elapsedDays = Math.max(0, dateDistance(period.start, value))
      return (index + Math.min(1, elapsedDays / periodDays)) * periodWidth
    }
  }
  return periods.length * periodWidth
}

function initialTimelineScale(): TimelineScale {
  const saved = window.localStorage.getItem('vistay.inventory.timelineScale')
  return saved === 'week' || saved === 'month' ? saved : 'day'
}

function errorCopy(error: unknown): { title: string; detail: string; code?: string } {
  const apiError = error instanceof ApiError ? error : undefined
  const code = apiError?.code
  const titles: Record<string, string> = {
    INVENTORY_READ_FORBIDDEN: 'Bạn không có quyền xem căn này',
    INVENTORY_BLOCK_FORBIDDEN: 'Bạn không có quyền thay đổi tồn phòng',
    STALE_INVENTORY_REVISION: 'Dữ liệu vừa được người khác cập nhật',
    INVENTORY_BLOCK_CONFLICT: 'Khoảng ngày này đang bị chặn',
    PROPERTY_NOT_FOUND: 'Không tìm thấy căn lưu trú',
    PROPERTY_PARTITION_UNMAPPED: 'Căn chưa được gắn vào chi nhánh',
    PROPERTY_PARTITION_UNAVAILABLE: 'Chưa xác minh được chi nhánh của căn',
    AUTHORIZATION_UNAVAILABLE: 'Chưa xác minh được quyền hiện tại',
  }
  return {
    title: code && titles[code] ? titles[code] : 'Không thể hoàn tất yêu cầu',
    detail: error instanceof Error ? error.message : 'Đã có lỗi không xác định.',
    code,
  }
}

function initialPropertyId(): string {
  const saved = window.localStorage.getItem('vistay.inventory.propertyId')
  if (saved) return saved
  return window.location.hostname.endsWith('.localhost') || window.location.hostname === 'localhost'
    ? LOCAL_MANAGEMENT_PROPERTY
    : ''
}

export function InventoryWorkspace({ graphqlUrl, accessToken, viewer, section }: InventoryWorkspaceProps) {
  const root = useRef<HTMLElement>(null)
  const timelineScroll = useRef<HTMLDivElement>(null)
  const timelineExtensionPending = useRef(false)
  const today = useMemo(() => isoToday(), [])
  const initialScale = useMemo(() => initialTimelineScale(), [])
  const [timelineScale, setTimelineScale] = useState<TimelineScale>(initialScale)
  const [propertyId, setPropertyId] = useState(initialPropertyId)
  const [propertyCatalog, setPropertyCatalog] = useState<TimelineUnit[]>([])
  const [portfolio, setPortfolio] = useState<PropertyPortfolio>({ branches: [], cities: [] })
  const [fromDate, setFromDate] = useState(() => timelineRange(today, initialScale).from)
  const [toDateExclusive, setToDateExclusive] = useState(() => timelineRange(today, initialScale).to)
  const timelineEndRef = useRef(toDateExclusive)
  const [visibleStartDate, setVisibleStartDate] = useState(() => timelineRange(today, initialScale).from)
  const [cityFilter, setCityFilter] = useState('ALL')
  const [areaFilter, setAreaFilter] = useState('ALL')
  const [buildingFilter, setBuildingFilter] = useState('ALL')
  const [page, setPage] = useState<InventoryBlockManagementPage>()
  const [bookings, setBookings] = useState<AdminBookingRecord[]>([])
  const [timelineTruncated, setTimelineTruncated] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<ReturnType<typeof errorCopy>>()
  const [selectedBlock, setSelectedBlock] = useState<InventoryBlockManagementNode>()
  const [showCreate, setShowCreate] = useState(false)
  const [commandStatus, setCommandStatus] = useState<'idle' | 'loading'>('idle')
  const [commandError, setCommandError] = useState<ReturnType<typeof errorCopy>>()
  const [notice, setNotice] = useState<string>()
  const canManage = viewer.permissions.includes('inventory:block')
  const canReadBookings = viewer.permissions.includes('booking:read')
  const bootstrapTimeline = useRef({ from: timelineRange(today, initialScale).from, to: timelineRange(today, initialScale).to, canRead: canReadBookings })
  const initialProperty = useRef(propertyId)
  const previousSection = useRef(section)

  useEffect(() => {
    const controller = new AbortController()
    void fetchPropertyPortfolio(graphqlUrl, accessToken, {}, controller.signal).then((portfolio) => {
      setPortfolio(portfolio)
      const mapped = portfolio.cities.flatMap((city) => city.areas.flatMap((area) => area.buildings.flatMap((building) => building.floors.flatMap((floor) =>
        floor.units.filter((unit) => Boolean(unit.branchId)).map((unit) => ({
          ...unit,
          path: `${building.name} · ${floor.name}`,
          cityId: city.id,
          cityName: city.name,
          areaId: area.id,
          areaName: area.name,
          buildingId: building.id,
          buildingName: building.name,
          floorName: floor.name,
        }))))))
      setPropertyCatalog(mapped)
      if (mapped.length) setPropertyId((current) => mapped.some((unit) => unit.id === current) ? current : mapped[0].id)
      if (mapped.length && bootstrapTimeline.current.canRead) {
        void fetchAdminBookingTimeline(graphqlUrl, accessToken, {
          propertyIds: mapped.slice(0, 500).map((unit) => unit.id),
          fromDate: bootstrapTimeline.current.from,
          toDateExclusive: bootstrapTimeline.current.to,
        }, controller.signal).then((timeline) => { setBookings(timeline.nodes); setTimelineTruncated(timeline.truncated) }).catch(() => undefined)
      }
    }).catch(() => undefined)
    return () => controller.abort()
  }, [accessToken, graphqlUrl])

  const areaOptions = useMemo(() => portfolio.cities
    .filter((city) => cityFilter === 'ALL' || city.id === cityFilter)
    .flatMap((city) => city.areas), [cityFilter, portfolio.cities])
  const buildingOptions = useMemo(() => portfolio.cities
    .filter((city) => cityFilter === 'ALL' || city.id === cityFilter)
    .flatMap((city) => city.areas)
    .filter((area) => areaFilter === 'ALL' || area.id === areaFilter)
    .flatMap((area) => area.buildings), [areaFilter, cityFilter, portfolio.cities])
  const filteredUnits = useMemo(() => propertyCatalog.filter((unit) =>
    (cityFilter === 'ALL' || unit.cityId === cityFilter)
    && (areaFilter === 'ALL' || unit.areaId === areaFilter)
    && (buildingFilter === 'ALL' || unit.buildingId === buildingFilter)), [areaFilter, buildingFilter, cityFilter, propertyCatalog])

  const periods = useMemo(
    () => timelinePeriods(fromDate, toDateExclusive, timelineScale),
    [fromDate, timelineScale, toDateExclusive],
  )

  const load = useCallback(async (signal?: AbortSignal, range?: { from: string; to: string }, targetPropertyId?: string) => {
    const normalizedId = (targetPropertyId ?? propertyId).trim().toLowerCase()
    const rangeFrom = range?.from ?? fromDate
    const rangeTo = range?.to ?? toDateExclusive
    if (!UUID_PATTERN.test(normalizedId)) {
      setStatus('error')
      setError({ title: 'Mã căn chưa hợp lệ', detail: 'Hãy nhập UUID của căn lưu trú.' })
      return
    }
    const duration = dateDistance(rangeFrom, rangeTo)
    if (duration < 1 || duration > 370) {
      setStatus('error')
      setError({ title: 'Khoảng xem chưa hợp lệ', detail: 'Timeline hỗ trợ tối đa 370 ngày mỗi lần.' })
      return
    }

    setStatus('loading')
    setError(undefined)
    window.localStorage.setItem('vistay.inventory.propertyId', normalizedId)
    try {
      const [inventoryPage, bookingTimeline] = await Promise.all([
        fetchInventoryBlocks(graphqlUrl, accessToken, {
          propertyId: normalizedId,
          fromDate: rangeFrom,
          toDateExclusive: rangeTo,
          types: section === 'map' ? [] : bookingBlockTypes,
          statuses: [],
          first: 100,
        }, signal),
        canReadBookings && propertyCatalog.length
          ? fetchAdminBookingTimeline(graphqlUrl, accessToken, {
              propertyIds: propertyCatalog.slice(0, 500).map((unit) => unit.id),
              fromDate: rangeFrom,
              toDateExclusive: rangeTo,
            }, signal)
          : Promise.resolve({ nodes: [], fromDate: rangeFrom, toDateExclusive: rangeTo, truncated: false }),
      ])
      setPage(inventoryPage)
      setBookings(bookingTimeline.nodes)
      setTimelineTruncated(bookingTimeline.truncated)
      setSelectedBlock((current) => inventoryPage.nodes.find((node) => node.inventoryBlockId === current?.inventoryBlockId))
      setStatus('ready')
    } catch (reason) {
      if (signal?.aborted) return
      setStatus('error')
      setError(errorCopy(reason))
    }
  }, [accessToken, canReadBookings, fromDate, graphqlUrl, propertyCatalog, propertyId, section, toDateExclusive])

  const initialLoad = useRef(load)

  useEffect(() => {
    if (!initialProperty.current) return
    const controller = new AbortController()
    queueMicrotask(() => void initialLoad.current(controller.signal))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (previousSection.current === section || !initialProperty.current) return
    previousSection.current = section
    const controller = new AbortController()
    queueMicrotask(() => void load(controller.signal))
    return () => controller.abort()
  }, [load, section])

  useGSAP(() => {
    if (status !== 'ready') return
    gsap.fromTo('.inventory-rail-metric', { opacity: 0, y: 7 }, {
      opacity: 1, y: 0, duration: 0.28, stagger: 0.035, ease: 'power2.out',
    })
    gsap.fromTo('.inventory-block-bar', { opacity: 0, scaleX: 0.84 }, {
      opacity: 1, scaleX: 1, duration: 0.58, stagger: 0.045, ease: 'power3.out', transformOrigin: 'left center',
    })
    gsap.fromTo('.booking-operation-row', { opacity: 0, y: 12 }, {
      opacity: 1, y: 0, duration: 0.42, stagger: 0.045, ease: 'power2.out',
    })
  }, { scope: root, dependencies: [status, page?.inventoryRevision, section, timelineScale], revertOnUpdate: true })

  function changeTimelineScale(nextScale: TimelineScale) {
    if (nextScale === timelineScale) return
    const range = timelineRange(visibleStartDate, nextScale)
    setTimelineScale(nextScale)
    setFromDate(range.from)
    setToDateExclusive(range.to)
    timelineEndRef.current = range.to
    setVisibleStartDate(range.from)
    if (timelineScroll.current) timelineScroll.current.scrollLeft = 0
    window.localStorage.setItem('vistay.inventory.timelineScale', nextScale)
    void load(undefined, range)
  }

  function changeStartDate(value: string) {
    const range = timelineRange(value, timelineScale)
    setFromDate(range.from)
    setToDateExclusive(range.to)
    timelineEndRef.current = range.to
    setVisibleStartDate(range.from)
    if (timelineScroll.current) timelineScroll.current.scrollLeft = 0
    void load(undefined, range)
  }

  async function extendTimeline() {
    if (timelineExtensionPending.current || !canReadBookings || propertyCatalog.length === 0) return
    timelineExtensionPending.current = true
    const chunkFrom = timelineEndRef.current
    const chunkTo = timelineScale === 'day' ? addDays(chunkFrom, 31)
      : timelineScale === 'week' ? addDays(chunkFrom, 112) : addMonths(chunkFrom, 12)
    try {
      const timeline = await fetchAdminBookingTimeline(graphqlUrl, accessToken, {
        propertyIds: propertyCatalog.slice(0, 500).map((unit) => unit.id),
        fromDate: chunkFrom,
        toDateExclusive: chunkTo,
      })
      setBookings((current) => {
        const merged = new Map(current.map((booking) => [booking.id, booking]))
        timeline.nodes.forEach((booking) => merged.set(booking.id, booking))
        return [...merged.values()]
      })
      setTimelineTruncated((current) => current || timeline.truncated)
      timelineEndRef.current = chunkTo
      setToDateExclusive(chunkTo)
    } catch (reason) {
      setError(errorCopy(reason))
    } finally {
      timelineExtensionPending.current = false
    }
  }

  function synchronizeVisibleDate(scrollLeft: number, scrollWidth: number, clientWidth: number) {
    const firstVisibleIndex = Math.min(periods.length - 1, Math.max(0, Math.floor(scrollLeft / periodWidth)))
    const nextDate = periods[firstVisibleIndex]?.start
    if (nextDate) setVisibleStartDate((current) => current === nextDate ? current : nextDate)
    if (scrollWidth - clientWidth - scrollLeft < periodWidth * 2.5) void extendTimeline()
  }

  async function refreshSelectedInventory(targetPropertyId = propertyId) {
    const normalizedId = targetPropertyId.trim().toLowerCase()
    const visibleRange = timelineRange(visibleStartDate, timelineScale)
    if (!UUID_PATTERN.test(normalizedId)) return

    setStatus('loading')
    setError(undefined)
    window.localStorage.setItem('vistay.inventory.propertyId', normalizedId)
    try {
      const inventoryPage = await fetchInventoryBlocks(graphqlUrl, accessToken, {
        propertyId: normalizedId,
        fromDate: visibleRange.from,
        toDateExclusive: visibleRange.to,
        types: section === 'map' ? [] : bookingBlockTypes,
        statuses: [],
        first: 100,
      })
      setPage(inventoryPage)
      setSelectedBlock((current) => inventoryPage.nodes.find((node) => node.inventoryBlockId === current?.inventoryBlockId))
      setStatus('ready')
    } catch (reason) {
      setStatus('error')
      setError(errorCopy(reason))
    }
  }

  function selectTimelineUnit(unit: TimelineUnit) {
    if (unit.id === propertyId) return
    setPropertyId(unit.id)
    setSelectedBlock(undefined)
    void refreshSelectedInventory(unit.id)
  }

  async function handleCreate(input: {
    blockType: OperatorInventoryBlockType
    startDate: string
    endDateExclusive: string
    reason: string
  }) {
    if (!page) return
    setCommandStatus('loading')
    setCommandError(undefined)
    try {
      const correlationId = crypto.randomUUID()
      await createInventoryBlock(graphqlUrl, accessToken, {
        ...input,
        propertyId: propertyId.trim().toLowerCase(),
        expectedInventoryRevision: page.inventoryRevision,
        correlationId,
        idempotencyKey: `admin-web-create-${correlationId}`,
      })
      setShowCreate(false)
      setNotice('Đã tạo block tồn phòng và ghi nhận audit.')
      await refreshSelectedInventory()
    } catch (reason) {
      const copy = errorCopy(reason)
      setCommandError(copy)
      if (copy.code === 'STALE_INVENTORY_REVISION') await refreshSelectedInventory()
    } finally {
      setCommandStatus('idle')
    }
  }

  async function handleRelease(reason: string) {
    if (!page || !selectedBlock) return
    setCommandStatus('loading')
    setCommandError(undefined)
    try {
      const correlationId = crypto.randomUUID()
      await releaseInventoryBlock(graphqlUrl, accessToken, {
        propertyId: propertyId.trim().toLowerCase(),
        inventoryBlockId: selectedBlock.inventoryBlockId,
        expectedInventoryRevision: page.inventoryRevision,
        reason,
        correlationId,
        idempotencyKey: `admin-web-release-${correlationId}`,
      })
      setSelectedBlock(undefined)
      setNotice('Đã giải phóng block. Lịch sử vẫn được giữ nguyên.')
      await refreshSelectedInventory()
    } catch (reasonValue) {
      const copy = errorCopy(reasonValue)
      setCommandError(copy)
      if (copy.code === 'STALE_INVENTORY_REVISION') await refreshSelectedInventory()
    } finally {
      setCommandStatus('idle')
    }
  }

  const bookingBlocks = page?.nodes.filter((node) => bookingBlockTypes.includes(node.type)) ?? []
  const sectionBlocks = bookingBlocks.filter((node) => {
    if (section === 'reservations') return true
    if (section === 'check-in') return node.startDate >= fromDate && node.startDate < toDateExclusive
    if (section === 'check-out') return node.endDateExclusive > fromDate && node.endDateExclusive <= toDateExclusive
    return false
  })
  const periodWidth = timelineScale === 'day' ? 64 : timelineScale === 'week' ? 88 : 96
  const periodUnit = timelineScale === 'day' ? 'ngày' : timelineScale === 'week' ? 'tuần' : 'tháng'
  const cityOptions = portfolio.cities
  const stayingCount = bookings.filter((booking) => booking.status === 'CHECKED_IN').length
  const arrivingToday = bookings.filter((booking) => booking.checkInDate === today && booking.status !== 'CANCELLED').length
  const barsForUnit = (unit: TimelineUnit): TimelineBar[] => [
    ...bookings.filter((booking) => booking.propertyId === unit.id && booking.checkOutDate > fromDate && booking.checkInDate < toDateExclusive).map((booking) => ({
      id: booking.id,
      type: 'BOOKING' as const,
      status: booking.status,
      startDate: booking.checkInDate,
      endDateExclusive: booking.checkOutDate,
      title: booking.bookingCode,
      subtitle: booking.guestName,
    })),
    ...(unit.id === propertyId ? (page?.nodes ?? []).filter((node) => !bookingBlockTypes.includes(node.type)).map((node) => ({
      id: node.inventoryBlockId,
      type: node.type,
      status: node.status,
      startDate: node.startDate,
      endDateExclusive: node.endDateExclusive,
      title: typeLabels[node.type],
      subtitle: statusLabels[node.status],
      node,
    })) : []),
  ]
  return (
    <section className="inventory-workspace" ref={root} aria-label="Sơ đồ booking">
      <header className="inventory-commandbar" aria-label="Điều khiển sơ đồ booking">
        <div className="inventory-rail-summary" aria-label="Tóm tắt lịch phòng">
          <article className="inventory-rail-metric"><span>Căn</span><strong>{filteredUnits.length}</strong></article>
          <article className="inventory-rail-metric"><span>Đang ở</span><strong>{stayingCount}</strong></article>
          <article className="inventory-rail-metric"><span>Đến hôm nay</span><strong>{arrivingToday}</strong></article>
        </div>
        <div className="inventory-location-filters" aria-label="Lọc căn theo vị trí">
          <label><span>Thành phố</span><select value={cityFilter} onChange={(event) => { setCityFilter(event.target.value); setAreaFilter('ALL'); setBuildingFilter('ALL') }}><option value="ALL">Tất cả</option>{cityOptions.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
          <label><span>Khu vực</span><select value={areaFilter} onChange={(event) => { setAreaFilter(event.target.value); setBuildingFilter('ALL') }}><option value="ALL">Tất cả</option>{areaOptions.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
          <label><span>Tòa</span><select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}><option value="ALL">Tất cả</option>{buildingOptions.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}</select></label>
        </div>
        <div className="inventory-scale-control" role="group" aria-label="Đơn vị hiển thị timeline">
          {([['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']] as const).map(([value, label]) => (
            <button type="button" className={timelineScale === value ? 'active' : ''} aria-pressed={timelineScale === value} key={value} onClick={() => changeTimelineScale(value)}>{label}</button>
          ))}
        </div>
        <label className="inventory-start-date"><CalendarBlank /><span>Bắt đầu từ</span><input type="date" value={visibleStartDate} onChange={(event) => changeStartDate(event.target.value)} /></label>
        <button className="inventory-create-button" disabled={!canManage || !page || status === 'loading'} onClick={() => setShowCreate(true)}>
          <Plus weight="bold" /> Tạo block
        </button>
      </header>

      {error && status === 'error' && (
        <div className="inventory-alert" role="alert">
          <WarningCircle />
          <div><strong>{error.title}</strong><span>{error.detail}</span></div>
          <button onClick={() => void load()}><ArrowClockwise /> Thử lại</button>
        </div>
      )}

      {status === 'loading' && !page && (
        <div className="inventory-loading"><SpinnerGap className="spinner" /><span>Đang tải sơ đồ phòng…</span></div>
      )}

      {page && (
        <>
          {section === 'map' && <section className="inventory-board" aria-label="Timeline block tồn phòng">
            <div className="inventory-board-heading">
              <div><h3 id="inventory-title">Lịch căn theo vị trí</h3><span>{filteredUnits.length} căn · {periods.length} {periodUnit} · kéo sang phải để nạp tiếp, chọn ngày để xem mốc trước</span></div>
              <div className="inventory-legend">
                <span><i className="booking" /> Booking</span><span><i className="active" /> Vận hành</span><span><i className="history" /> Đã kết thúc</span>
              </div>
            </div>
            <div className="inventory-timeline-frame">
              <div className="inventory-timeline-ledger">
                <div className="timeline-corner">Danh sách căn</div>
                {filteredUnits.map((unit) => (
                  <button type="button" className={`timeline-row-label${unit.id === propertyId ? ' selected' : ''}`} key={unit.id} onClick={() => selectTimelineUnit(unit)} title={`${unit.name} · ${unit.path}`}>
                    <strong>{unit.unitNumber || unit.code}</strong>
                    <span>{unit.buildingName} · {unit.floorName}</span>
                  </button>
                ))}
                {filteredUnits.length === 0 && <div className="timeline-row-label timeline-empty-label"><strong>Không có căn</strong><span>Đổi bộ lọc vị trí</span></div>}
              </div>
              <div className="inventory-timeline-scroll" ref={timelineScroll} onScroll={(event) => synchronizeVisibleDate(event.currentTarget.scrollLeft, event.currentTarget.scrollWidth, event.currentTarget.clientWidth)}>
                <div className={`inventory-timeline scale-${timelineScale}`} style={{ '--period-count': periods.length, '--period-width': `${periodWidth}px`, width: `${periods.length * periodWidth}px` } as CSSProperties}>
                  <div className="timeline-period-header">
                    {periods.map((period) => <div className="timeline-day" key={period.key}><span>{period.eyebrow}</span><strong>{period.label}</strong></div>)}
                  </div>
                  {filteredUnits.map((unit) => {
                    const bars = barsForUnit(unit)
                    return <div className="timeline-grid" key={unit.id}>
                      {periods.map((period) => <i key={period.key} />)}
                      {bars.map((bar) => {
                        const startOffset = timelinePixelOffset(bar.startDate, periods, periodWidth)
                        const endOffset = timelinePixelOffset(bar.endDateExclusive, periods, periodWidth)
                        const historical = ['RELEASED', 'CANCELLED', 'CHECKED_OUT'].includes(bar.status)
                        if (endOffset <= startOffset) return null
                        return <button
                          className={`inventory-block-bar type-${bar.type.toLowerCase()} ${historical ? 'historical' : ''}`}
                          style={{ left: `${startOffset}px`, width: `${Math.max(5, endOffset - startOffset)}px` }}
                          key={bar.id}
                          onClick={() => { if (bar.node) { setSelectedBlock(bar.node); setCommandError(undefined) } }}
                          title={`${bar.title} · đến ${bar.startDate} · đi ${bar.endDateExclusive}`}
                        >
                          <strong>{bar.title}</strong><small>{bar.subtitle}</small>
                        </button>
                      })}
                    </div>
                  })}
                  {filteredUnits.length === 0 && <div className="timeline-grid timeline-empty-grid">{periods.map((period) => <i key={period.key} />)}</div>}
                </div>
              </div>
            </div>
            {page.pageInfo.hasNextPage && <p className="inventory-page-warning">Đang hiển thị 100 block mới nhất. Thu hẹp bộ lọc để xem phần còn lại.</p>}
            {timelineTruncated && <p className="inventory-page-warning">Khoảng vừa nạp có hơn 2.000 booking. Hãy lọc hẹp vị trí để đối chiếu đầy đủ.</p>}
          </section>}

          {section !== 'map' && (
            <BookingOperationList
              section={section}
              blocks={sectionBlocks}
              propertyId={propertyId}
              fromDate={fromDate}
              toDateExclusive={toDateExclusive}
              onSelect={(block) => { setSelectedBlock(block); setCommandError(undefined) }}
            />
          )}
        </>
      )}

      {notice && <div className="inventory-toast" role="status"><CheckCircle />{notice}<button onClick={() => setNotice(undefined)}><X /></button></div>}

      {showCreate && page && (
        <CreateBlockDialog
          defaultStart={fromDate}
          defaultEnd={addDays(fromDate, 1)}
          busy={commandStatus === 'loading'}
          error={commandError}
          onClose={() => { setShowCreate(false); setCommandError(undefined) }}
          onSubmit={handleCreate}
        />
      )}

      {selectedBlock && (
        <BlockDetailDrawer
          block={selectedBlock}
          canRelease={canManage && !['BOOKING', 'CHANNEL'].includes(selectedBlock.type) && ['ACTIVE', 'TENTATIVE'].includes(selectedBlock.status)}
          busy={commandStatus === 'loading'}
          error={commandError}
          onClose={() => { setSelectedBlock(undefined); setCommandError(undefined) }}
          onRelease={handleRelease}
        />
      )}
    </section>
  )
}

function BookingOperationList({ section, blocks, propertyId, fromDate, toDateExclusive, onSelect }: {
  section: Exclude<InventorySection, 'map'>
  blocks: InventoryBlockManagementNode[]
  propertyId: string
  fromDate: string
  toDateExclusive: string
  onSelect: (block: InventoryBlockManagementNode) => void
}) {
  const title = section === 'reservations' ? 'Đặt phòng trong khoảng'
    : section === 'check-in' ? 'Lịch khách đến'
      : 'Lịch khách rời đi'
  const emptyCopy = section === 'reservations' ? 'Chưa có đặt phòng trong khoảng đang chọn.'
    : section === 'check-in' ? 'Không có lượt check-in trong khoảng đang chọn.'
      : 'Không có lượt check-out trong khoảng đang chọn.'

  return (
    <section className="booking-operations-board" aria-label={title}>
      <header className="booking-operations-heading">
        <div>
          <span>{fromDate} — {toDateExclusive}</span>
          <h3>{title}</h3>
        </div>
        <strong>{blocks.length}</strong>
      </header>
      <div className="booking-operation-table" role="table" aria-label={`${title} của căn ${propertyId}`}>
        <div className="booking-operation-table-head" role="row">
          <span>Mã tham chiếu</span><span>Khoảng lưu trú</span><span>Số đêm</span><span>Nguồn</span><span>Trạng thái</span>
        </div>
        {blocks.map((block) => (
          <button className="booking-operation-row" type="button" role="row" key={block.inventoryBlockId} onClick={() => onSelect(block)}>
            <span><strong>{shortId(block.inventoryBlockId)}</strong><small>Căn {shortId(propertyId.trim())}</small></span>
            <span><strong>{block.startDate}</strong><small>đến {block.endDateExclusive}</small></span>
            <span><strong>{Math.max(1, dateDistance(block.startDate, block.endDateExclusive))}</strong><small>đêm</small></span>
            <span><strong>{block.type === 'CHANNEL' ? block.channelProvider || 'OTA' : 'Trực tiếp'}</strong><small>{typeLabels[block.type]}</small></span>
            <span><i className={`booking-status status-${block.status.toLowerCase()}`}>{statusLabels[block.status]}</i><small>Xem chi tiết</small></span>
          </button>
        ))}
        {blocks.length === 0 && <div className="booking-operation-empty"><CalendarBlank /><strong>{emptyCopy}</strong><span>Thử mở rộng khoảng ngày hoặc kiểm tra lại mã căn.</span></div>}
      </div>
    </section>
  )
}

function CreateBlockDialog({ defaultStart, defaultEnd, busy, error, onClose, onSubmit }: {
  defaultStart: string
  defaultEnd: string
  busy: boolean
  error?: ReturnType<typeof errorCopy>
  onClose: () => void
  onSubmit: (input: { blockType: OperatorInventoryBlockType; startDate: string; endDateExclusive: string; reason: string }) => void
}) {
  const [blockType, setBlockType] = useState<OperatorInventoryBlockType>('MAINTENANCE')
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDateExclusive, setEndDateExclusive] = useState(defaultEnd)
  const [reason, setReason] = useState('Khóa căn theo kế hoạch vận hành đã được phê duyệt')

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit({ blockType, startDate, endDateExclusive, reason: reason.trim() })
  }

  return (
    <div className="inventory-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="inventory-dialog" onSubmit={submit} aria-labelledby="create-block-title">
        <button type="button" className="dialog-close" onClick={onClose} aria-label="Đóng"><X /></button>
        <p className="eyebrow">LỆNH CÓ KIỂM SOÁT</p>
        <h3 id="create-block-title">Tạo block tồn phòng</h3>
        <p>Block mới dùng revision vừa quan sát. Nếu dữ liệu đã đổi, hệ thống sẽ từ chối và tải lại timeline.</p>
        <div className="inventory-form-grid">
          <label>Loại block<select value={blockType} onChange={(event) => setBlockType(event.target.value as OperatorInventoryBlockType)}>{operatorTypes.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></label>
          <label>Từ ngày<input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label>Đến trước ngày<input type="date" required min={addDays(startDate, 1)} value={endDateExclusive} onChange={(event) => setEndDateExclusive(event.target.value)} /></label>
          <label className="wide">Lý do<textarea minLength={10} maxLength={1000} required value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        </div>
        {error && <div className="command-error" role="alert"><WarningCircle /><div><strong>{error.title}</strong><span>{error.detail}</span></div></div>}
        <div className="inventory-dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Hủy</button>
          <button className="inventory-create-button" disabled={busy || dateDistance(startDate, endDateExclusive) < 1 || reason.trim().length < 10}>
            {busy ? <SpinnerGap className="spinner" /> : <Plus />} Tạo block
          </button>
        </div>
      </form>
    </div>
  )
}

function BlockDetailDrawer({ block, canRelease, busy, error, onClose, onRelease }: {
  block: InventoryBlockManagementNode
  canRelease: boolean
  busy: boolean
  error?: ReturnType<typeof errorCopy>
  onClose: () => void
  onRelease: (reason: string) => void
}) {
  const [reason, setReason] = useState('Giải phóng block sau khi hoàn tất công việc vận hành')
  return (
    <div className="inventory-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="inventory-drawer" aria-labelledby="block-detail-title">
        <button className="dialog-close" onClick={onClose} aria-label="Đóng"><X /></button>
        <div className={`drawer-type-mark type-${block.type.toLowerCase()}`}><CalendarBlank /></div>
        <p className="eyebrow">CHI TIẾT BLOCK</p>
        <h3 id="block-detail-title">{typeLabels[block.type]}</h3>
        <span className={`drawer-status status-${block.status.toLowerCase()}`}>{statusLabels[block.status]}</span>
        <dl>
          <div><dt>Khoảng ngày</dt><dd>{block.startDate} → {block.endDateExclusive}</dd></div>
          <div><dt>Phiên bản block</dt><dd>{block.blockVersion}</dd></div>
          <div><dt>Mã block</dt><dd title={block.inventoryBlockId}>{shortId(block.inventoryBlockId)}</dd></div>
          <div><dt>Cập nhật</dt><dd>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(block.updatedAt))}</dd></div>
          {block.channelProvider && <div><dt>Kênh</dt><dd>{block.channelProvider}</dd></div>}
        </dl>
        <section className="drawer-reason"><span>Lý do tạo</span><p>{block.reason || 'Không có lý do được phép hiển thị.'}</p></section>
        {canRelease ? (
          <section className="release-section">
            <label>Lý do giải phóng<textarea minLength={10} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            {error && <div className="command-error" role="alert"><WarningCircle /><div><strong>{error.title}</strong><span>{error.detail}</span></div></div>}
            <button disabled={busy || reason.trim().length < 10} onClick={() => onRelease(reason.trim())}>
              {busy ? <SpinnerGap className="spinner" /> : <LockKeyOpen />} Giải phóng block
            </button>
          </section>
        ) : (
          <div className="drawer-readonly"><WarningCircle /><span>Block này chỉ được xem hoặc phải được xử lý bởi luồng sở hữu tương ứng.</span></div>
        )}
      </aside>
    </div>
  )
}
