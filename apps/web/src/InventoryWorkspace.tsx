import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  ApiError,
  createInventoryBlock,
  fetchInventoryBlocks,
  fetchPropertyAvailability,
  releaseInventoryBlock,
  type BackofficeViewer,
  type InventoryBlockManagementNode,
  type InventoryBlockManagementPage,
  type InventoryBlockStatus,
  type InventoryBlockType,
  type OperatorInventoryBlockType,
  type PropertyAvailabilityObservation,
} from '@vistay/admin-api-client'
import {
  ArrowClockwise,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  CheckCircle,
  ClockCounterClockwise,
  DoorOpen,
  Funnel,
  LockKeyOpen,
  MagnifyingGlass,
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
const allTypes = Object.keys(typeLabels) as InventoryBlockType[]
const allStatuses = Object.keys(statusLabels) as InventoryBlockStatus[]
const bookingBlockTypes: InventoryBlockType[] = ['BOOKING', 'CHANNEL']
const sectionCopy: Record<InventorySection, { eyebrow: string; title: string; description: string; countLabel: string }> = {
  map: {
    eyebrow: 'SƠ ĐỒ PHÒNG',
    title: 'Sơ đồ booking',
    description: 'Theo dõi tình trạng căn, block vận hành và thay đổi tồn phòng trong một timeline.',
    countLabel: 'Block hiệu lực',
  },
  reservations: {
    eyebrow: 'ĐẶT PHÒNG',
    title: 'Đặt phòng',
    description: 'Các booking và block từ kênh OTA trong khoảng ngày đang chọn.',
    countLabel: 'Đặt phòng',
  },
  'check-in': {
    eyebrow: 'CHECK-IN',
    title: 'Check-in',
    description: 'Các lượt khách bắt đầu lưu trú trong khoảng ngày đang chọn.',
    countLabel: 'Lượt đến',
  },
  'check-out': {
    eyebrow: 'CHECK-OUT',
    title: 'Check out',
    description: 'Các lượt khách kết thúc lưu trú trong khoảng ngày đang chọn.',
    countLabel: 'Lượt đi',
  },
}

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
  const today = useMemo(() => isoToday(), [])
  const [propertyId, setPropertyId] = useState(initialPropertyId)
  const [fromDate, setFromDate] = useState(today)
  const [toDateExclusive, setToDateExclusive] = useState(() => addDays(today, 14))
  const [selectedTypes, setSelectedTypes] = useState<InventoryBlockType[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<InventoryBlockStatus[]>([])
  const [page, setPage] = useState<InventoryBlockManagementPage>()
  const [availability, setAvailability] = useState<PropertyAvailabilityObservation>()
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<ReturnType<typeof errorCopy>>()
  const [selectedBlock, setSelectedBlock] = useState<InventoryBlockManagementNode>()
  const [showCreate, setShowCreate] = useState(false)
  const [commandStatus, setCommandStatus] = useState<'idle' | 'loading'>('idle')
  const [commandError, setCommandError] = useState<ReturnType<typeof errorCopy>>()
  const [notice, setNotice] = useState<string>()
  const canManage = viewer.permissions.includes('inventory:block')
  const initialProperty = useRef(propertyId)
  const previousSection = useRef(section)

  const days = useMemo(() => {
    const length = Math.max(0, Math.min(31, dateDistance(fromDate, toDateExclusive)))
    return Array.from({ length }, (_, index) => addDays(fromDate, index))
  }, [fromDate, toDateExclusive])

  const load = useCallback(async (signal?: AbortSignal) => {
    const normalizedId = propertyId.trim().toLowerCase()
    if (!UUID_PATTERN.test(normalizedId)) {
      setStatus('error')
      setError({ title: 'Mã căn chưa hợp lệ', detail: 'Hãy nhập UUID của căn lưu trú.' })
      return
    }
    const duration = dateDistance(fromDate, toDateExclusive)
    if (duration < 1 || duration > 31) {
      setStatus('error')
      setError({ title: 'Khoảng xem chưa hợp lệ', detail: 'Timeline hỗ trợ từ 1 đến 31 ngày mỗi lần.' })
      return
    }

    setStatus('loading')
    setError(undefined)
    setAvailability(undefined)
    window.localStorage.setItem('vistay.inventory.propertyId', normalizedId)
    try {
      const [inventoryPage, observation] = await Promise.all([
        fetchInventoryBlocks(graphqlUrl, accessToken, {
          propertyId: normalizedId,
          fromDate,
          toDateExclusive,
          types: section === 'map' ? selectedTypes : bookingBlockTypes,
          statuses: section === 'map' ? selectedStatuses : [],
          first: 100,
        }, signal),
        fetchPropertyAvailability(graphqlUrl, accessToken, normalizedId, fromDate, toDateExclusive, signal),
      ])
      setPage(inventoryPage)
      setAvailability(observation)
      setSelectedBlock((current) => inventoryPage.nodes.find((node) => node.inventoryBlockId === current?.inventoryBlockId))
      setStatus('ready')
    } catch (reason) {
      if (signal?.aborted) return
      setStatus('error')
      setError(errorCopy(reason))
    }
  }, [accessToken, fromDate, graphqlUrl, propertyId, section, selectedStatuses, selectedTypes, toDateExclusive])

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
    gsap.fromTo('.inventory-summary-card', { opacity: 0, y: 18 }, {
      opacity: 1, y: 0, duration: 0.48, stagger: 0.06, ease: 'power2.out',
    })
    gsap.fromTo('.inventory-block-bar', { opacity: 0, scaleX: 0.84 }, {
      opacity: 1, scaleX: 1, duration: 0.58, stagger: 0.045, ease: 'power3.out', transformOrigin: 'left center',
    })
    gsap.fromTo('.booking-operation-row', { opacity: 0, y: 12 }, {
      opacity: 1, y: 0, duration: 0.42, stagger: 0.045, ease: 'power2.out',
    })
  }, { scope: root, dependencies: [status, page?.inventoryRevision, section], revertOnUpdate: true })

  function shiftWindow(amount: number) {
    setFromDate((current) => addDays(current, amount))
    setToDateExclusive((current) => addDays(current, amount))
  }

  function toggleType(type: InventoryBlockType) {
    setSelectedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])
  }

  function toggleStatus(blockStatus: InventoryBlockStatus) {
    setSelectedStatuses((current) => current.includes(blockStatus)
      ? current.filter((item) => item !== blockStatus)
      : [...current, blockStatus])
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
      await load()
    } catch (reason) {
      const copy = errorCopy(reason)
      setCommandError(copy)
      if (copy.code === 'STALE_INVENTORY_REVISION') await load()
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
      await load()
    } catch (reasonValue) {
      const copy = errorCopy(reasonValue)
      setCommandError(copy)
      if (copy.code === 'STALE_INVENTORY_REVISION') await load()
    } finally {
      setCommandStatus('idle')
    }
  }

  const activeCount = page?.nodes.filter((node) => node.status === 'ACTIVE' || node.status === 'TENTATIVE').length ?? 0
  const operatorCount = page?.nodes.filter((node) => operatorTypes.includes(node.type as OperatorInventoryBlockType)).length ?? 0
  const bookingBlocks = page?.nodes.filter((node) => bookingBlockTypes.includes(node.type)) ?? []
  const sectionBlocks = bookingBlocks.filter((node) => {
    if (section === 'reservations') return true
    if (section === 'check-in') return node.startDate >= fromDate && node.startDate < toDateExclusive
    if (section === 'check-out') return node.endDateExclusive > fromDate && node.endDateExclusive <= toDateExclusive
    return false
  })
  const copy = sectionCopy[section]

  return (
    <section className="inventory-workspace" ref={root} aria-labelledby="inventory-title">
      <header className="inventory-heading">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="inventory-title">{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <div className={`inventory-heading-actions${section !== 'map' ? ' summary-only' : ''}`}>
          <div className="inventory-heading-signal" aria-label="Tóm tắt lịch phòng">
            <div>
              <span>Đang bán</span>
              <strong>{availability ? (availability.available ? 'Có' : 'Chặn') : '—'}</strong>
            </div>
            <div>
              <span>Block hiệu lực</span>
              <strong>{page ? activeCount : '—'}</strong>
            </div>
            <div>
              <span>Giao nhau</span>
              <strong>{availability ? availability.overlaps.length : '—'}</strong>
            </div>
          </div>
          {section === 'map' && <button className="inventory-create-button" disabled={!canManage || !page} onClick={() => setShowCreate(true)}>
            <Plus weight="bold" /> Tạo block
          </button>}
        </div>
      </header>

      <section className="inventory-toolbar" aria-label="Bộ lọc tồn phòng">
        <label className="property-search">
          <MagnifyingGlass aria-hidden />
          <span>Mã căn</span>
          <input value={propertyId} onChange={(event) => setPropertyId(event.target.value)} placeholder="UUID căn lưu trú" />
        </label>
        <div className="date-window">
          <button aria-label="Lùi 7 ngày" onClick={() => shiftWindow(-7)}><CaretLeft /></button>
          <label><span>Từ ngày</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label><span>Đến trước ngày</span><input type="date" value={toDateExclusive} onChange={(event) => setToDateExclusive(event.target.value)} /></label>
          <button aria-label="Tiến 7 ngày" onClick={() => shiftWindow(7)}><CaretRight /></button>
        </div>
        <button className="inventory-apply-button" onClick={() => void load()} disabled={status === 'loading'}>
          {status === 'loading' ? <SpinnerGap className="spinner" /> : <Funnel />} Áp dụng
        </button>
      </section>

      {section === 'map' && <details className="inventory-filter-panel">
        <summary><Funnel /> Lọc loại và trạng thái <span>{selectedTypes.length + selectedStatuses.length || 'Tất cả'}</span></summary>
        <div>
          <fieldset><legend>Loại block</legend>{allTypes.map((type) => (
            <button key={type} className={selectedTypes.includes(type) ? 'selected' : ''} onClick={() => toggleType(type)}>{typeLabels[type]}</button>
          ))}</fieldset>
          <fieldset><legend>Trạng thái</legend>{allStatuses.map((blockStatus) => (
            <button key={blockStatus} className={selectedStatuses.includes(blockStatus) ? 'selected' : ''} onClick={() => toggleStatus(blockStatus)}>{statusLabels[blockStatus]}</button>
          ))}</fieldset>
        </div>
      </details>}

      {error && status === 'error' && (
        <div className="inventory-alert" role="alert">
          <WarningCircle />
          <div><strong>{error.title}</strong><span>{error.detail}</span></div>
          <button onClick={() => void load()}><ArrowClockwise /> Thử lại</button>
        </div>
      )}

      {status === 'loading' && !page && (
        <div className="inventory-loading"><SpinnerGap className="spinner" /><span>Đang đồng bộ sơ đồ phòng…</span></div>
      )}

      {page && (
        <>
          <section className="inventory-summary" aria-label="Tổng quan tồn phòng">
            <article className="inventory-summary-card availability-card">
              <span>Tình trạng khoảng xem</span>
              <strong>{availability?.available ? 'Có thể bán' : 'Đang bị chặn'}</strong>
              <small>{availability?.available ? <CheckCircle /> : <WarningCircle />}{availability?.overlaps.length ?? 0} khoảng giao nhau</small>
            </article>
            <article className="inventory-summary-card">
              <span>Revision tồn phòng</span><strong>{page.inventoryRevision}</strong><small><ArrowClockwise /> So khớp trước mọi lệnh ghi</small>
            </article>
            <article className="inventory-summary-card">
              <span>{copy.countLabel}</span><strong>{section === 'map' ? activeCount : sectionBlocks.length}</strong><small><DoorOpen /> {section === 'map' ? `${operatorCount} block vận hành trong kết quả` : `${bookingBlocks.length} booking trong dữ liệu hiện tại`}</small>
            </article>
            <article className="inventory-summary-card branch-card">
              <span>Chi nhánh đã xác minh</span><strong title={page.branchId}>{shortId(page.branchId)}</strong><small>Membership v{page.propertyMembershipVersion}</small>
            </article>
          </section>

          {section === 'map' && <section className="inventory-board" aria-label="Timeline block tồn phòng">
            <div className="inventory-board-heading">
              <div><p className="eyebrow">TIMELINE</p><h3>Căn {shortId(propertyId.trim())}</h3></div>
              <div className="inventory-legend">
                <span><i className="active" /> Đang chặn</span><span><i className="history" /> Lịch sử</span>
              </div>
            </div>
            <div className="inventory-timeline-scroll">
              <div className="inventory-timeline" style={{ '--day-count': days.length } as CSSProperties}>
                <div className="timeline-corner">Căn / block</div>
                {days.map((day) => { const label = formatDay(day); return <div className="timeline-day" key={day}><span>{label.weekday}</span><strong>{label.day}</strong></div> })}
                {(page.nodes.length ? page.nodes : [undefined]).map((node) => {
                  const start = node ? Math.max(0, dateDistance(fromDate, node.startDate)) : 0
                  const end = node ? Math.min(days.length, dateDistance(fromDate, node.endDateExclusive)) : days.length
                  const historical = node?.status === 'RELEASED' || node?.status === 'CANCELLED'
                  return (
                    <div className="timeline-row" key={node?.inventoryBlockId ?? 'empty'}>
                      <div className="timeline-row-label">
                        <strong>{node ? typeLabels[node.type] : 'Chưa có block'}</strong>
                        <span>{node ? statusLabels[node.status] : 'Khoảng này đang trống'}</span>
                      </div>
                      <div className="timeline-grid">
                        {days.map((day) => <i key={day} />)}
                        {node && end > start && (
                          <button
                            className={`inventory-block-bar type-${node.type.toLowerCase()} ${historical ? 'historical' : ''}`}
                            style={{ gridColumn: `${start + 1} / ${end + 1}`, gridRow: 1 }}
                            onClick={() => { setSelectedBlock(node); setCommandError(undefined) }}
                            title={`${typeLabels[node.type]} · ${node.startDate} → ${node.endDateExclusive}`}
                          >
                            <strong>{typeLabels[node.type]}</strong><span>{node.startDate.slice(5)} → {node.endDateExclusive.slice(5)}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {page.pageInfo.hasNextPage && <p className="inventory-page-warning">Đang hiển thị 100 block mới nhất. Thu hẹp bộ lọc để xem phần còn lại.</p>}
          </section>}

          {section === 'map' && <section className="inventory-activity-strip" aria-label="Block cập nhật gần đây">
            <div><ClockCounterClockwise /><span>Hoạt động gần đây</span></div>
            <div className="inventory-activity-track">
              {page.nodes.slice(0, 6).map((node) => (
                <button key={node.inventoryBlockId} onClick={() => setSelectedBlock(node)}>
                  <i className={`type-${node.type.toLowerCase()}`} />
                  <span>{typeLabels[node.type]} · {statusLabels[node.status]}</span>
                  <time>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' }).format(new Date(node.updatedAt))}</time>
                </button>
              ))}
              {page.nodes.length === 0 && <span>Chưa có lịch sử block trong khoảng đã chọn.</span>}
            </div>
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
