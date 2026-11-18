import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import {
  CalendarCheck, CalendarMinus, CalendarPlus, Check, CurrencyCircleDollar,
  MagnifyingGlass, Plus, SpinnerGap, UserPlus, UsersThree, X,
} from '@phosphor-icons/react'
import {
  createAdminBooking, createUserProfile, fetchAdminBookings, fetchPropertyPortfolio,
  fetchUserDirectory, transitionAdminBooking,
  type AdminBookingRecord, type BackofficeViewer, type PropertyUnitRecord, type UserDirectoryEntry,
} from '@vistay/admin-api-client'
import type { InventorySection } from './InventoryWorkspace'

const statusCopy: Record<string, string> = {
  PENDING_CONFIRMATION: 'Chờ xác nhận', HELD: 'Đang giữ chỗ', CONFIRMED: 'Đã xác nhận',
  CHECKED_IN: 'Đang lưu trú', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy', NO_SHOW: 'Không đến', EXPIRED: 'Hết hạn',
}
const BOOKING_TODAY = new Date().toISOString().slice(0, 10)
const BOOKING_TOMORROW = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const BOOKING_AFTER_TOMORROW = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)

export function BookingManagement({ graphqlUrl, accessToken, viewer, section }: {
  graphqlUrl: string; accessToken: string; viewer: BackofficeViewer; section: Exclude<InventorySection, 'map'>
}) {
  const root = useRef<HTMLElement>(null)
  const [bookings, setBookings] = useState<AdminBookingRecord[]>([])
  const [properties, setProperties] = useState<PropertyUnitRecord[]>([])
  const [customers, setCustomers] = useState<UserDirectoryEntry[]>([])
  const [selected, setSelected] = useState<AdminBookingRecord | null>(null)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const canCreate = viewer.permissions.includes('booking:create')
  const canCreateCustomer = viewer.permissions.includes('customer-profile:create')

  async function load(signal?: AbortSignal) {
    setLoading(true); setMessage('')
    try {
      const [nextBookings, portfolio, customerPage] = await Promise.all([
        fetchAdminBookings(graphqlUrl, accessToken, { limit: 100 }, signal),
        fetchPropertyPortfolio(graphqlUrl, accessToken, {}, signal),
        fetchUserDirectory(graphqlUrl, accessToken, { accountType: 'CUSTOMER', first: 100 }, signal),
      ])
      setBookings(nextBookings)
      setProperties(portfolio.cities.flatMap((city) => city.areas.flatMap((area) => area.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.units)))).filter((unit) => Boolean(unit.branchId)))
      setCustomers(customerPage.nodes)
      setSelected((current) => nextBookings.find((item) => item.id === current?.id) ?? nextBookings[0] ?? null)
    } catch (error) {
      if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Không tải được booking')
    } finally { if (!signal?.aborted) setLoading(false) }
  }

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [accessToken, graphqlUrl])

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi')
    return bookings.filter((booking) => {
      const sectionMatch = section === 'reservations'
        || (section === 'check-in' && ['PENDING_CONFIRMATION', 'HELD', 'CONFIRMED'].includes(booking.status))
        || (section === 'check-out' && booking.status === 'CHECKED_IN')
      return sectionMatch && (!query || `${booking.bookingCode} ${booking.guestName} ${booking.guestPhone} ${booking.guestEmail ?? ''} ${booking.propertyName ?? ''}`.toLocaleLowerCase('vi').includes(query))
    })
  }, [bookings, search, section])

  useGSAP(() => {
    if (!root.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('.booking-record', { opacity: 0, y: 7 }, { opacity: 1, y: 0, duration: .23, stagger: .025, ease: 'power2.out' })
  }, { scope: root, dependencies: [section, visible.length], revertOnUpdate: true })

  async function transition(action: 'confirm' | 'check-in' | 'check-out' | 'cancel') {
    if (!selected) return
    setBusy(true); setMessage('')
    try {
      const updated = await transitionAdminBooking(graphqlUrl, accessToken, action, {
        id: selected.id, expectedVersion: selected.version,
        reason: action === 'confirm' ? 'Xác nhận booking tại backoffice' : action === 'check-in' ? 'Khách đã hoàn tất thủ tục nhận phòng' : action === 'check-out' ? 'Khách đã hoàn tất trả phòng' : 'Hủy booking tại backoffice',
      })
      setBookings((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelected(updated)
      setMessage(action === 'confirm' ? 'Đã xác nhận booking.' : action === 'check-in' ? 'Đã check-in.' : action === 'check-out' ? 'Đã check-out.' : 'Đã hủy booking.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không cập nhật được booking') }
    finally { setBusy(false) }
  }

  const today = BOOKING_TODAY
  const title = section === 'reservations' ? 'Đặt phòng' : section === 'check-in' ? 'Check-in' : 'Check-out'
  return <section ref={root} className="booking-management" aria-label={title}>
    <div className="booking-commandbar">
      <div className="booking-summary" aria-label="Tóm tắt booking">
        <Metric label={title} value={visible.length} />
        <Metric label="Chờ xác nhận" value={bookings.filter((item) => item.status === 'PENDING_CONFIRMATION').length} />
        <Metric label="Đến hôm nay" value={bookings.filter((item) => item.checkInDate === today && item.status === 'CONFIRMED').length} />
        <Metric label="Rời hôm nay" value={bookings.filter((item) => item.checkOutDate === today && item.status === 'CHECKED_IN').length} />
      </div>
      {canCreate && <button className="booking-create" onClick={() => setCreateOpen(true)}><Plus />Tạo booking</button>}
      <label className="booking-search"><MagnifyingGlass /><span className="sr-only">Tìm booking</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Mã booking, khách hoặc căn" /></label>
    </div>
    {message && <p className="booking-inline-message" role="status">{message}</p>}
    <div className="booking-board">
      <div className="booking-record-list"><div className="booking-list-head"><span>Booking</span><span>Khách</span><span>Căn</span><span>Thời gian</span><span>Trạng thái</span></div>
        <div className="booking-record-scroll">{loading ? <div className="booking-empty"><SpinnerGap className="spinner" /><strong>Đang tải booking</strong></div> : visible.map((booking) => <button className={`booking-record${selected?.id === booking.id ? ' active' : ''}`} key={booking.id} onClick={() => setSelected(booking)}>
          <span><strong>{booking.bookingCode}</strong><small>{booking.createdAt.slice(0, 10)}</small></span>
          <span><strong>{booking.guestName}</strong><small>{booking.guestPhone || booking.guestEmail || 'Chưa có liên hệ'}</small></span>
          <span><strong>{booking.propertyName || booking.propertyId}</strong><small>{booking.propertyId.slice(0, 8)}</small></span>
          <span><strong>{booking.checkInDate}</strong><small>đến {booking.checkOutDate}</small></span>
          <span><i className={`booking-state ${booking.status.toLowerCase()}`}>{statusCopy[booking.status] ?? booking.status}</i></span>
        </button>)}{!loading && !visible.length && <div className="booking-empty"><CalendarCheck /><strong>Không có booking phù hợp</strong><span>Thử đổi từ khóa hoặc tạo booking mới.</span></div>}</div>
      </div>
      <BookingInspector booking={selected} viewer={viewer} busy={busy} onTransition={transition} />
    </div>
    {createOpen && <BookingDialog graphqlUrl={graphqlUrl} accessToken={accessToken} properties={properties} customers={customers} canCreateCustomer={canCreateCustomer}
      busy={busy} setBusy={setBusy} setCustomers={setCustomers} setMessage={setMessage} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); void load() }} />}
  </section>
}

function Metric({ label, value }: { label: string; value: number }) { return <article><span>{label}</span><strong>{value}</strong></article> }

function BookingInspector({ booking, viewer, busy, onTransition }: { booking: AdminBookingRecord | null; viewer: BackofficeViewer; busy: boolean; onTransition: (action: 'confirm' | 'check-in' | 'check-out' | 'cancel') => Promise<void> }) {
  if (!booking) return <aside className="booking-inspector"><div className="booking-inspector-empty"><CalendarCheck /><strong>Chi tiết booking</strong><span>Chọn một bản ghi để xem và xử lý.</span></div></aside>
  const can = (permission: string) => viewer.permissions.includes(permission)
  return <aside className="booking-inspector populated"><header><div><small>Booking</small><strong>{booking.bookingCode}</strong></div><i className={`booking-state ${booking.status.toLowerCase()}`}>{statusCopy[booking.status]}</i></header>
    <div className="booking-inspector-guest"><UsersThree /><span><strong>{booking.guestName}</strong><small>{booking.guestPhone || booking.guestEmail || 'Chưa có liên hệ'}</small></span></div>
    <dl><div><dt>Căn</dt><dd>{booking.propertyName || booking.propertyId}</dd></div><div><dt>Check-in</dt><dd>{booking.checkInDate}</dd></div><div><dt>Check-out</dt><dd>{booking.checkOutDate}</dd></div><div><dt>Giá trị</dt><dd>{booking.totalAmount ? `${Number(booking.totalAmount).toLocaleString('vi-VN')} ${booking.currency}` : 'Đã ẩn theo quyền'}</dd></div></dl>
    <div className="booking-inspector-actions">
      {booking.status === 'PENDING_CONFIRMATION' && can('booking:update') && <button disabled={busy} onClick={() => void onTransition('confirm')}><Check />Xác nhận</button>}
      {booking.status === 'CONFIRMED' && can('booking:check-in') && <button disabled={busy} onClick={() => void onTransition('check-in')}><CalendarPlus />Check-in</button>}
      {booking.status === 'CHECKED_IN' && can('booking:check-out') && <button disabled={busy} onClick={() => void onTransition('check-out')}><CalendarMinus />Check-out</button>}
      {['PENDING_CONFIRMATION', 'HELD', 'CONFIRMED'].includes(booking.status) && can('booking:cancel') && <button className="danger" disabled={busy} onClick={() => void onTransition('cancel')}><X />Hủy booking</button>}
    </div>
  </aside>
}

function BookingDialog({ graphqlUrl, accessToken, properties, customers, canCreateCustomer, busy, setBusy, setCustomers, setMessage, onClose, onSaved }: {
  graphqlUrl: string; accessToken: string; properties: PropertyUnitRecord[]; customers: UserDirectoryEntry[]; canCreateCustomer: boolean; busy: boolean
  setBusy: (value: boolean) => void; setCustomers: React.Dispatch<React.SetStateAction<UserDirectoryEntry[]>>; setMessage: (value: string) => void
  onClose: () => void; onSaved: () => void
}) {
  const [newCustomer, setNewCustomer] = useState(false)
  const [customerForm, setCustomerForm] = useState({ name: '', email: '', phone: '' })
  const [form, setForm] = useState({ propertyId: properties[0]?.id ?? '', customerId: customers[0]?.profileId ?? '', checkIn: BOOKING_TOMORROW, checkOut: BOOKING_AFTER_TOMORROW, adults: '1', children: '0', unitPrice: properties[0]?.basePricePerNight ?? '', discount: '0', fee: '0', tax: '0', notes: '' })
  const selectedCustomer = customers.find((item) => item.profileId === form.customerId)
  const selectedProperty = properties.find((item) => item.id === form.propertyId)

  async function createCustomerNow() {
    setBusy(true)
    try {
      const customer = await createUserProfile(graphqlUrl, accessToken, { accountType: 'CUSTOMER', fullName: customerForm.name, email: customerForm.email || undefined, contactPhone: customerForm.phone || undefined, nationalityCode: 'VN', documentType: 'CCCD', reason: 'Tạo khách hàng trong luồng đặt phòng', idempotencyKey: crypto.randomUUID() })
      const entry: UserDirectoryEntry = { profileId: customer.profileId, accountId: customer.accountId, accountType: 'CUSTOMER', displayName: customer.displayName, email: customer.email, contactPhone: customer.contactPhone, status: customer.status, referenceCode: customer.referenceCode, subtype: customer.subtype, verificationStatus: customer.verificationStatus, joinedOn: customer.relevantDate, createdAt: customer.createdAt, updatedAt: customer.updatedAt }
      setCustomers((current) => [entry, ...current]); setForm((current) => ({ ...current, customerId: customer.profileId })); setNewCustomer(false)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không tạo được khách hàng') }
    finally { setBusy(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!selectedCustomer || !selectedProperty) return
    setBusy(true)
    try {
      await createAdminBooking(graphqlUrl, accessToken, { idempotencyKey: crypto.randomUUID(), propertyId: selectedProperty.id, propertyName: selectedProperty.name, hostProfileId: selectedProperty.hostProfileId || undefined, customerProfileId: selectedCustomer.profileId, guestName: selectedCustomer.displayName, guestPhone: selectedCustomer.contactPhone || '', guestEmail: selectedCustomer.email || undefined, checkInDate: form.checkIn, checkOutDate: form.checkOut, adults: Number(form.adults), children: Number(form.children), stayType: 'SHORT_TERM', unitPrice: form.unitPrice, discountAmount: form.discount, feeAmount: form.fee, taxAmount: form.tax, currency: selectedProperty.currency || 'VND', notes: form.notes || undefined })
      setMessage('Đã tạo booking và giữ tồn phòng.'); onSaved()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không tạo được booking') }
    finally { setBusy(false) }
  }

  return <div className="dialog-backdrop booking-dialog-backdrop"><form className="booking-dialog" onSubmit={submit}>
    <header><div><strong>Tạo booking</strong><span>Chọn hồ sơ khách và căn có sẵn, hoặc tạo khách ngay trong luồng.</span></div><button type="button" onClick={onClose}><X /></button></header>
    <div className="booking-dialog-body">
      <label className="wide"><span>Khách hàng *</span><div className="inline-select-action"><select required value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })}><option value="">Chọn khách hàng</option>{customers.map((customer) => <option key={customer.profileId} value={customer.profileId}>{customer.displayName} · {customer.email || customer.contactPhone || customer.profileId}</option>)}</select>{canCreateCustomer && <button type="button" onClick={() => setNewCustomer((value) => !value)}><UserPlus />Tạo khách</button>}</div></label>
      {newCustomer && <div className="inline-customer-form"><input placeholder="Họ tên" value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} /><input placeholder="Email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} /><input placeholder="Điện thoại" value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} /><button type="button" disabled={busy || !customerForm.name || (!customerForm.email && !customerForm.phone)} onClick={() => void createCustomerNow()}>Tạo và chọn</button></div>}
      <label className="wide"><span>Căn *</span><select required value={form.propertyId} onChange={(event) => { const unit = properties.find((item) => item.id === event.target.value); setForm({ ...form, propertyId: event.target.value, unitPrice: unit?.basePricePerNight ?? form.unitPrice }) }}>{properties.map((unit) => <option key={unit.id} value={unit.id}>{unit.unitNumber || unit.code} · {unit.name} · {unit.capacity} khách</option>)}</select></label>
      <label><span>Check-in *</span><input required type="date" value={form.checkIn} onChange={(event) => setForm({ ...form, checkIn: event.target.value })} /></label><label><span>Check-out *</span><input required type="date" value={form.checkOut} onChange={(event) => setForm({ ...form, checkOut: event.target.value })} /></label>
      <label><span>Người lớn</span><input type="number" min="1" value={form.adults} onChange={(event) => setForm({ ...form, adults: event.target.value })} /></label><label><span>Trẻ em</span><input type="number" min="0" value={form.children} onChange={(event) => setForm({ ...form, children: event.target.value })} /></label>
      <label><span>Giá/đêm *</span><input required type="number" min="0" value={form.unitPrice} onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} /></label><label><span>Giảm giá</span><input type="number" min="0" value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} /></label>
      <label><span>Phí</span><input type="number" min="0" value={form.fee} onChange={(event) => setForm({ ...form, fee: event.target.value })} /></label><label><span>Thuế</span><input type="number" min="0" value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} /></label>
      <label className="wide"><span>Ghi chú</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
    </div><footer><button type="button" onClick={onClose}>Hủy</button><button className="primary-button" disabled={busy || !selectedCustomer || !selectedProperty || !form.unitPrice}>{busy ? <SpinnerGap className="spinner" /> : <CurrencyCircleDollar />}Tạo booking</button></footer>
  </form></div>
}
