import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { fetch as expoFetch } from 'expo/fetch'
import { useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  createAdminBooking, createUserProfile, fetchAdminBookings, fetchPropertyPortfolio, fetchUserDirectory, transitionAdminBooking,
  type AdminBookingRecord, type PropertyUnitRecord, type UserDirectoryEntry,
} from '@vistay/admin-api-client'
import type { InventorySection } from '../../InventoryWorkspace'
import { MobileBookingTimeline } from '../../MobileBookingTimeline'
import { useAdmin } from '../../AdminContext'
import { LoadState, Segmented, pageStyles, useWorkspaceScrollGate, type WorkspaceScrollGate } from '../../ui/primitives'
import { palette, radii } from '../../ui/theme'
import { parseMobileRoute } from '../../navigation/navigationIntent'
import { BUSINESS_TIME_ZONE, formatBusinessDate } from '../../utils/businessDate'

const mobileFetch = expoFetch as typeof globalThis.fetch
const DEFAULT_CHECK_IN = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const DEFAULT_CHECK_OUT = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
const statusLabels: Record<string, string> = {
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  HELD: 'Giữ chỗ',
  CONFIRMED: 'Đã xác nhận',
  CHECKED_IN: 'Đang lưu trú',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
  NO_SHOW: 'Không đến',
  EXPIRED: 'Hết hạn',
}

export default function BookingScreen() {
  const { accessToken, authorizationReady, config, isRevalidating, runtime, viewer } = useAdmin()
  const rawParams = useLocalSearchParams()
  const intent = useMemo(
    () => parseMobileRoute('booking', rawParams as Record<string, string | string[] | undefined>),
    [rawParams]
  )
  const initialSection = (intent?.destination === 'booking' ? intent.section : 'map') as InventorySection
  const [section, setSection] = useState<InventorySection>(initialSection)
  const [refreshEpoch, setRefreshEpoch] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scrollGate = useWorkspaceScrollGate()

  useEffect(() => {
    if (intent?.destination === 'booking' && intent.section && intent.section !== section) {
      setSection(intent.section as InventorySection)
    }
  }, [intent, section])

  const refreshActiveWorkspace = useCallback(() => {
    setRefreshing(true)
    setRefreshEpoch((current) => current + 1)
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => setRefreshing(false), 650)
  }, [])

  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current) }, [])

  const heading = (
    <View style={styles.command}>
      <View>
        <Text style={styles.commandTitle}>Booking</Text>
        <Text style={styles.commandMeta}>Đặt phòng và vận hành lưu trú</Text>
      </View>
    </View>
  )
  const tabs = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionTabs}>
      <Segmented
        horizontalInset={14}
        options={[
          { label: 'Sơ đồ', value: 'map' },
          { label: 'Đặt phòng', value: 'reservations' },
          { label: 'Check-in', value: 'check-in' },
          { label: 'Check-out', value: 'check-out' },
        ]}
        value={section}
        onChange={setSection}
      />
    </ScrollView>
  )
  const authorizationNotice = isRevalidating && !authorizationReady ? (
    <Text style={styles.authorizationNotice}>Đang xác minh quyền tài khoản sau kết nối</Text>
  ) : null

  if (section === 'map' && runtime.isOnline && runtime.isActive) {
    return (
      <MobileBookingTimeline
        key={`map-${refreshEpoch}`}
        accessToken={accessToken}
        graphqlUrl={config.graphqlUrl}
        viewer={viewer}
        onRefresh={refreshActiveWorkspace}
        refreshing={refreshing}
        scrollGate={scrollGate}
        topContent={heading}
        stickyTopContent={<>{tabs}{authorizationNotice}</>}
      />
    )
  }

  if (!runtime.isOnline || !runtime.isActive) {
    return (
      <BookingWorkspaceShell
        heading={heading}
        onRefresh={refreshActiveWorkspace}
        refreshing={refreshing}
        scrollGate={scrollGate}
        stickyTopContent={<>{tabs}{authorizationNotice}</>}
      >
        <LoadState error={!runtime.isOnline ? 'Thiết bị đang ngoại tuyến.' : 'Ứng dụng đang ở nền.'} />
      </BookingWorkspaceShell>
    )
  }

  return (
    <MobileBookingWorkspace
      key={`${section}-${refreshEpoch}`}
      accessToken={accessToken}
      authorizationReady={Boolean(authorizationReady)}
      graphqlUrl={config.graphqlUrl}
      heading={heading}
      initialSearch={intent?.destination === 'booking' ? intent.filters?.search : undefined}
      initialStatus={intent?.destination === 'booking' ? intent.filters?.status : undefined}
      onRefresh={refreshActiveWorkspace}
      refreshing={refreshing}
      scrollGate={scrollGate}
      section={section as Exclude<InventorySection, 'map'>}
      stickyTopContent={<>{tabs}{authorizationNotice}</>}
      viewer={viewer}
    />
  )
}

function BookingWorkspaceShell({
  children,
  heading,
  onRefresh,
  refreshing,
  scrollGate,
  stickyTopContent,
}: {
  children: ReactNode
  heading: ReactNode
  onRefresh: () => void
  refreshing: boolean
  scrollGate: WorkspaceScrollGate
  stickyTopContent: ReactNode
}) {
  const [initialOffset] = useState(() => scrollGate.headerHidden ? 56 : 0)
  const initialOffsetPending = useRef(initialOffset > 0)
  const [viewportHeight, setViewportHeight] = useState(0)
  function handleScroll(event: Parameters<WorkspaceScrollGate['onScroll']>[0]) {
    if (initialOffsetPending.current) {
      if (event.nativeEvent.contentOffset.y < initialOffset - 1) return
      initialOffsetPending.current = false
    }
    scrollGate.onScroll(event)
  }
  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          enabled={scrollGate.refreshEnabled}
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.evergreen}
        />
      }
      stickyHeaderIndices={[1]}
      style={pageStyles.scroll}
      contentContainerStyle={[styles.page, viewportHeight > 0 && { minHeight: viewportHeight + 56 }]}
      contentOffset={{ x: 0, y: initialOffset }}
      onLayout={(event) => setViewportHeight(Math.round(event.nativeEvent.layout.height))}
      onScroll={handleScroll}
      onTouchStart={scrollGate.onTouchStart}
      onScrollBeginDrag={scrollGate.onScrollBeginDrag}
      onScrollEndDrag={scrollGate.onScrollEndDrag}
      onMomentumScrollEnd={scrollGate.onMomentumScrollEnd}
      scrollEventThrottle={16}
    >
      <View style={styles.headingSlot}>{heading}</View>
      <View style={styles.simpleStickyWorkspace}>{stickyTopContent}</View>
      <View style={styles.resultsSlot}>{children}</View>
    </ScrollView>
  )
}

function MobileBookingWorkspace({
  accessToken,
  authorizationReady,
  graphqlUrl,
  heading,
  initialSearch,
  initialStatus,
  onRefresh,
  refreshing,
  scrollGate,
  section,
  stickyTopContent,
  viewer,
}: {
  accessToken: string
  authorizationReady: boolean
  graphqlUrl: string
  heading: ReactNode
  initialSearch?: string
  initialStatus?: string
  onRefresh: () => void
  refreshing: boolean
  scrollGate: WorkspaceScrollGate
  section: Exclude<InventorySection, 'map'>
  stickyTopContent: ReactNode
  viewer: ReturnType<typeof useAdmin>['viewer']
}) {
  const [bookings, setBookings] = useState<AdminBookingRecord[]>([])
  const [properties, setProperties] = useState<PropertyUnitRecord[]>([])
  const [customers, setCustomers] = useState<UserDirectoryEntry[]>([])
  const [selected, setSelected] = useState<AdminBookingRecord>()
  const [search, setSearch] = useState(initialSearch ?? '')
  const [statusFilter, setStatusFilter] = useState<string | undefined>(initialStatus)
  const [createOpen, setCreateOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [initialOffset] = useState(() => scrollGate.headerHidden ? 56 : 0)
  const initialOffsetPending = useRef(initialOffset > 0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const canCreate = authorizationReady && viewer.permissions.includes('booking:create')

  useEffect(() => {
    if (initialStatus !== undefined) setStatusFilter(initialStatus)
  }, [initialStatus])

  useEffect(() => {
    if (initialSearch !== undefined) setSearch(initialSearch)
  }, [initialSearch])

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [nextBookings, portfolio, customerPage] = await Promise.all([
        fetchAdminBookings(graphqlUrl, accessToken, { status: statusFilter, limit: 100 }, undefined, mobileFetch),
        fetchPropertyPortfolio(graphqlUrl, accessToken, {}, undefined, mobileFetch),
        fetchUserDirectory(graphqlUrl, accessToken, { accountType: 'CUSTOMER', first: 100 }, undefined, mobileFetch),
      ])
      setBookings(nextBookings)
      setProperties(
        portfolio.cities
          .flatMap((city) => city.areas.flatMap((area) => area.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.units))))
          .filter((unit) => Boolean(unit.branchId))
      )
      setCustomers(customerPage.nodes)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tải được booking.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, graphqlUrl, statusFilter])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi')
    return bookings.filter((booking) => {
      const sectionMatch = section === 'reservations'
        || (section === 'check-in' && ['PENDING_CONFIRMATION', 'HELD', 'CONFIRMED'].includes(booking.status))
        || (section === 'check-out' && booking.status === 'CHECKED_IN')
      const statusMatch = !statusFilter || booking.status === statusFilter
      const queryMatch = !query || `${booking.bookingCode} ${booking.guestName} ${booking.propertyName ?? ''}`.toLocaleLowerCase('vi').includes(query)
      return sectionMatch && statusMatch && queryMatch
    })
  }, [bookings, search, section, statusFilter])

  const today = formatBusinessDate(new Date(), BUSINESS_TIME_ZONE)
  const arrivals = visible.filter((item) => item.checkInDate === today).length
  const departures = visible.filter((item) => item.checkOutDate === today).length

  function handleScroll(event: Parameters<WorkspaceScrollGate['onScroll']>[0]) {
    if (initialOffsetPending.current) {
      if (event.nativeEvent.contentOffset.y < initialOffset - 1) return
      initialOffsetPending.current = false
    }
    scrollGate.onScroll(event)
  }

  return (
    <View style={pageStyles.scroll}>
      <ScrollView
        refreshControl={
          <RefreshControl
            enabled={scrollGate.refreshEnabled}
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.evergreen}
          />
        }
        stickyHeaderIndices={[1]}
        style={pageStyles.scroll}
        contentContainerStyle={[styles.page, viewportHeight > 0 && { minHeight: viewportHeight + 56 }]}
        contentOffset={{ x: 0, y: initialOffset }}
        keyboardShouldPersistTaps="handled"
        onLayout={(event) => setViewportHeight(Math.round(event.nativeEvent.layout.height))}
        onScroll={handleScroll}
        onTouchStart={scrollGate.onTouchStart}
        onScrollBeginDrag={scrollGate.onScrollBeginDrag}
        onScrollEndDrag={scrollGate.onScrollEndDrag}
        onMomentumScrollEnd={scrollGate.onMomentumScrollEnd}
        scrollEventThrottle={16}
      >
        <View style={styles.headingSlot}>{heading}</View>
        <View style={styles.stickyWorkspace}>
          <View style={styles.stickyTopSlot}>{stickyTopContent}</View>
          <View style={styles.alignedRail}>
            <View style={styles.wideSlot}>
              <View style={styles.metricPair}>
                <Metric label="Đến" value={arrivals} />
                <Metric label="Rời" value={departures} />
              </View>
            </View>
            <View style={styles.doubleNarrowSlot}>
              <View style={styles.search}>
                <Ionicons color={palette.evergreen} name="search" size={15} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Tìm booking..."
                  placeholderTextColor={palette.muted}
                  style={styles.searchInput}
                />
              </View>
            </View>
            <View style={styles.lastNarrowSlot}>
              <Pressable
                disabled={!canCreate}
                onPress={() => setCreateOpen(true)}
                style={({ pressed }) => [
                  styles.createButton,
                  !canCreate && styles.disabled,
                  pressed && canCreate && styles.pressed,
                ]}
              >
                <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={styles.createButtonText}>
                  Tạo booking
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Filter pill when directed from Overview */}
          {statusFilter && (
            <View style={styles.filterPillRow}>
              <View style={styles.filterPill}>
                <Text style={styles.filterPillText}>
                  Lọc: {statusLabels[statusFilter] ?? statusFilter}
                </Text>
                <Pressable onPress={() => setStatusFilter(undefined)}>
                  <Ionicons color={palette.evergreen} name="close-circle" size={14} />
                </Pressable>
              </View>
            </View>
          )}
        </View>

        <View style={styles.resultsBody}>
          {notice && <Text style={styles.notice}>{notice}</Text>}
          {bookings.length >= 100 && (
            <View style={styles.limitWarning}>
              <Ionicons color={palette.warning} name="information-circle-outline" size={14} />
              <Text style={styles.limitWarningText}>
                Đang hiển thị tối đa 100 bản ghi theo giới hạn API backend.
              </Text>
            </View>
          )}
          {loading ? (
            <LoadState />
          ) : error ? (
            <LoadState error={error} retry={() => void load()} />
          ) : (
            <View style={styles.list}>
              {visible.map((booking) => (
                <Pressable
                  key={booking.id}
                  onPress={() => setSelected(booking)}
                  style={({ pressed }) => [styles.bookingCard, pressed && styles.pressed]}
                >
                  <View style={styles.bookingTop}>
                    <Text style={styles.bookingCode}>{booking.bookingCode}</Text>
                    <Text style={[styles.status, statusStyle(booking.status)]}>
                      {statusLabels[booking.status] ?? booking.status}
                    </Text>
                  </View>
                  <View style={styles.bookingGuest}>
                    <Ionicons color={palette.leaf} name="person-outline" size={16} />
                    <View>
                      <Text style={styles.bookingName}>{booking.guestName}</Text>
                      <Text style={styles.bookingMeta}>
                        {booking.guestPhone || booking.guestEmail || 'Chưa có liên hệ'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.bookingBottom}>
                    <Text numberOfLines={1} style={styles.bookingProperty}>
                      {booking.propertyName || booking.propertyId}
                    </Text>
                    <Text style={styles.bookingDates}>
                      {booking.checkInDate} → {booking.checkOutDate}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {!visible.length && (
                <View style={styles.empty}>
                  <Ionicons color={palette.sage} name="calendar-outline" size={28} />
                  <Text style={styles.emptyTitle}>Không có booking phù hợp</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <BookingDetail
        visible={Boolean(selected)}
        booking={selected}
        viewer={authorizationReady ? viewer : { ...viewer, permissions: [] }}
        graphqlUrl={graphqlUrl}
        accessToken={accessToken}
        onClose={() => setSelected(undefined)}
        onUpdated={(updated, text) => {
          setBookings((current) => current.map((item) => (item.id === updated.id ? updated : item)))
          setSelected(updated)
          setNotice(text)
        }}
      />

      <BookingCreate
        visible={createOpen}
        properties={properties}
        customers={customers}
        setCustomers={setCustomers}
        canCreateCustomer={authorizationReady && viewer.permissions.includes('customer-profile:create')}
        graphqlUrl={graphqlUrl}
        accessToken={accessToken}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false)
          setNotice('Đã tạo booking và giữ tồn phòng.')
          void load()
        }}
      />
    </View>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  )
}

function statusStyle(status: string) {
  return ['CONFIRMED', 'CHECKED_IN'].includes(status)
    ? styles.statusOk
    : ['CANCELLED', 'NO_SHOW'].includes(status)
    ? styles.statusDanger
    : styles.statusPending
}

function BookingDetail({
  visible,
  booking,
  viewer,
  graphqlUrl,
  accessToken,
  onClose,
  onUpdated,
}: {
  visible: boolean
  booking?: AdminBookingRecord
  viewer: ReturnType<typeof useAdmin>['viewer']
  graphqlUrl: string
  accessToken: string
  onClose: () => void
  onUpdated: (booking: AdminBookingRecord, notice: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  if (!booking) return null
  const current = booking

  async function run(action: 'confirm' | 'check-in' | 'check-out' | 'cancel') {
    setBusy(true)
    setError(undefined)
    try {
      const updated = await transitionAdminBooking(
        graphqlUrl,
        accessToken,
        action,
        {
          id: current.id,
          expectedVersion: current.version,
          reason:
            action === 'confirm'
              ? 'Xác nhận booking trên mobile admin'
              : action === 'check-in'
              ? 'Khách đã nhận phòng trên mobile admin'
              : action === 'check-out'
              ? 'Khách đã trả phòng trên mobile admin'
              : 'Hủy booking trên mobile admin',
        },
        mobileFetch
      )
      onUpdated(
        updated,
        action === 'confirm'
          ? 'Đã xác nhận booking.'
          : action === 'check-in'
          ? 'Đã check-in.'
          : action === 'check-out'
          ? 'Đã check-out.'
          : 'Đã hủy booking.'
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không cập nhật được booking.')
    } finally {
      setBusy(false)
    }
  }

  const can = (permission: string) => viewer.permissions.includes(permission)

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>{booking.bookingCode}</Text>
              <Text style={styles.sheetMeta}>{statusLabels[booking.status]}</Text>
            </View>
            <Pressable onPress={onClose}>
              <Ionicons color={palette.evergreen} name="close" size={23} />
            </Pressable>
          </View>
          <View style={styles.detailGuest}>
            <Ionicons color={palette.leaf} name="person-circle-outline" size={34} />
            <View>
              <Text style={styles.bookingName}>{booking.guestName}</Text>
              <Text style={styles.bookingMeta}>{booking.guestPhone || booking.guestEmail}</Text>
            </View>
          </View>
          <View style={styles.detailGrid}>
            <Detail label="Căn" value={booking.propertyName || booking.propertyId} />
            <Detail label="Check-in" value={booking.checkInDate} />
            <Detail label="Check-out" value={booking.checkOutDate} />
            <Detail
              label="Giá trị"
              value={
                booking.totalAmount
                  ? `${Number(booking.totalAmount).toLocaleString('vi-VN')} ${booking.currency}`
                  : 'Đã ẩn'
              }
            />
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actionGrid}>
            {booking.status === 'PENDING_CONFIRMATION' && can('booking:update') && (
              <Action busy={busy} label="Xác nhận" icon="checkmark" onPress={() => void run('confirm')} />
            )}
            {booking.status === 'CONFIRMED' && can('booking:check-in') && (
              <Action busy={busy} label="Check-in" icon="log-in-outline" onPress={() => void run('check-in')} />
            )}
            {booking.status === 'CHECKED_IN' && can('booking:check-out') && (
              <Action busy={busy} label="Check-out" icon="log-out-outline" onPress={() => void run('check-out')} />
            )}
            {['PENDING_CONFIRMATION', 'HELD', 'CONFIRMED'].includes(booking.status) && can('booking:cancel') && (
              <Action busy={busy} danger label="Hủy booking" icon="close" onPress={() => void run('cancel')} />
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.detailValue}>{value}</Text>
    </View>
  )
}

function Action({
  busy,
  danger,
  label,
  icon,
  onPress,
}: {
  busy: boolean
  danger?: boolean
  label: string
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
}) {
  return (
    <Pressable
      disabled={busy}
      onPress={onPress}
      style={[styles.action, danger && styles.actionDanger, busy && styles.disabled]}
    >
      <Ionicons color={danger ? palette.danger : palette.white} name={icon} size={17} />
      <Text style={[styles.actionText, danger && styles.actionTextDanger]}>{label}</Text>
    </Pressable>
  )
}

function BookingCreate({
  visible,
  properties,
  customers,
  setCustomers,
  canCreateCustomer,
  graphqlUrl,
  accessToken,
  onClose,
  onSaved,
}: {
  visible: boolean
  properties: PropertyUnitRecord[]
  customers: UserDirectoryEntry[]
  setCustomers: React.Dispatch<React.SetStateAction<UserDirectoryEntry[]>>
  canCreateCustomer: boolean
  graphqlUrl: string
  accessToken: string
  onClose: () => void
  onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [newCustomer, setNewCustomer] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [form, setForm] = useState({
    propertyId: properties[0]?.id ?? '',
    customerId: customers[0]?.profileId ?? '',
    checkIn: DEFAULT_CHECK_IN,
    checkOut: DEFAULT_CHECK_OUT,
    price: properties[0]?.basePricePerNight ?? '',
    adults: '1',
  })

  async function addCustomer() {
    setBusy(true)
    try {
      const customer = await createUserProfile(
        graphqlUrl,
        accessToken,
        {
          accountType: 'CUSTOMER',
          fullName: customerName,
          email: customerEmail,
          nationalityCode: 'VN',
          documentType: 'CCCD',
          reason: 'Tạo khách trong luồng booking mobile',
          idempotencyKey: `${Date.now()}-${Math.random()}`,
        },
        mobileFetch
      )
      const entry: UserDirectoryEntry = {
        profileId: customer.profileId,
        accountId: customer.accountId,
        accountType: 'CUSTOMER',
        displayName: customer.displayName,
        email: customer.email,
        contactPhone: customer.contactPhone,
        status: customer.status,
        referenceCode: customer.referenceCode,
        subtype: customer.subtype,
        verificationStatus: customer.verificationStatus,
        joinedOn: customer.relevantDate,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      }
      setCustomers((current) => [entry, ...current])
      setForm((current) => ({ ...current, customerId: customer.profileId }))
      setNewCustomer(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tạo được khách.')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    const property = properties.find((item) => item.id === form.propertyId)
    const customer = customers.find((item) => item.profileId === form.customerId)
    if (!property || !customer) return
    setBusy(true)
    setError(undefined)
    try {
      await createAdminBooking(
        graphqlUrl,
        accessToken,
        {
          idempotencyKey: `${Date.now()}-${Math.random()}`,
          propertyId: property.id,
          propertyName: property.name,
          hostProfileId: property.hostProfileId || undefined,
          customerProfileId: customer.profileId,
          guestName: customer.displayName,
          guestPhone: customer.contactPhone || '',
          guestEmail: customer.email || undefined,
          checkInDate: form.checkIn,
          checkOutDate: form.checkOut,
          adults: Number(form.adults),
          children: 0,
          stayType: 'SHORT_TERM',
          unitPrice: form.price,
          discountAmount: '0',
          feeAmount: '0',
          taxAmount: '0',
          currency: property.currency || 'VND',
        },
        mobileFetch
      )
      onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không tạo được booking.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheet} contentContainerStyle={styles.sheetContent}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Tạo booking</Text>
            <Pressable onPress={onClose}>
              <Ionicons color={palette.evergreen} name="close" size={23} />
            </Pressable>
          </View>
          <ChoiceField
            label="Khách hàng"
            value={form.customerId}
            options={customers.map((item) => ({ value: item.profileId, label: item.displayName }))}
            onChange={(value) => setForm({ ...form, customerId: value })}
          />
          {canCreateCustomer && (
            <Pressable onPress={() => setNewCustomer((value) => !value)} style={styles.inlineButton}>
              <Ionicons color={palette.evergreen} name="person-add-outline" size={16} />
              <Text style={styles.inlineText}>Tạo khách ngay</Text>
            </Pressable>
          )}
          {newCustomer && (
            <View style={styles.inlineForm}>
              <Field label="Họ tên" value={customerName} onChangeText={setCustomerName} />
              <Field label="Email" value={customerEmail} onChangeText={setCustomerEmail} />
              <Action busy={busy} label="Tạo và chọn" icon="person-add-outline" onPress={() => void addCustomer()} />
            </View>
          )}
          <ChoiceField
            label="Căn"
            value={form.propertyId}
            options={properties.map((item) => ({
              value: item.id,
              label: `${item.unitNumber || item.code} · ${item.name}`,
            }))}
            onChange={(value) => {
              const property = properties.find((item) => item.id === value)
              setForm({ ...form, propertyId: value, price: property?.basePricePerNight ?? form.price })
            }}
          />
          <Field label="Check-in (YYYY-MM-DD)" value={form.checkIn} onChangeText={(value) => setForm({ ...form, checkIn: value })} />
          <Field label="Check-out (YYYY-MM-DD)" value={form.checkOut} onChangeText={(value) => setForm({ ...form, checkOut: value })} />
          <Field label="Người lớn" keyboardType="number-pad" value={form.adults} onChangeText={(value) => setForm({ ...form, adults: value })} />
          <Field label="Giá/đêm" keyboardType="numeric" value={form.price} onChangeText={(value) => setForm({ ...form, price: value })} />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            disabled={busy || !form.propertyId || !form.customerId || !form.price}
            onPress={() => void submit()}
            style={[styles.submit, (busy || !form.propertyId || !form.customerId || !form.price) && styles.disabled]}
          >
            {busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.submitText}>Tạo booking</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...input } = props
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={palette.muted} style={styles.input} {...input} />
    </View>
  )
}

function ChoiceField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.choice, value === option.value && styles.choiceActive]}
          >
            <Text numberOfLines={1} style={[styles.choiceText, value === option.value && styles.choiceTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 42 },
  headingSlot: { marginBottom: 0 },
  stickyWorkspace: { zIndex: 4, paddingTop: 12, paddingBottom: 12, backgroundColor: palette.background },
  simpleStickyWorkspace: { zIndex: 4, paddingTop: 12, paddingBottom: 12, backgroundColor: palette.background },
  stickyTopSlot: { marginBottom: 8 },
  resultsSlot: { flexGrow: 1 },
  resultsBody: { flexGrow: 1, gap: 8 },
  sectionTabs: { height: 40, flexGrow: 0 },
  command: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  commandTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  commandMeta: { marginTop: 2, color: palette.muted, fontSize: 9 },
  authorizationNotice: { padding: 10, borderRadius: radii.small, backgroundColor: '#E7F0E4', color: palette.evergreen, fontSize: 10 },
  alignedRail: { width: '100%', height: 40, flexDirection: 'row' },
  wideSlot: { width: '31%', paddingRight: 5 },
  doubleNarrowSlot: { width: '46%', paddingRight: 5 },
  lastNarrowSlot: { width: '23%' },
  metricPair: { flex: 1, flexDirection: 'row', gap: 4 },
  metric: { minWidth: 0, flex: 1, height: 40, paddingHorizontal: 6, borderRadius: radii.small, backgroundColor: palette.ink, justifyContent: 'center' },
  metricLabel: { color: '#B9D0C7', fontSize: 9, fontWeight: '600' },
  metricValue: { marginTop: 1, color: palette.white, fontSize: 13, fontWeight: '700' },
  search: { flex: 1, height: 40, paddingHorizontal: 8, borderWidth: 1.5, borderColor: palette.controlLine, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 5 },
  searchInput: { minWidth: 0, flex: 1, paddingVertical: 0, color: palette.ink, fontSize: 11, fontWeight: '600' },
  createButton: { flex: 1, height: 40, paddingHorizontal: 5, borderRadius: radii.small, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' },
  createButtonText: { color: palette.white, fontSize: 11, fontWeight: '700' },
  notice: { padding: 10, borderRadius: radii.small, backgroundColor: '#E7F0E4', color: palette.evergreen, fontSize: 10 },
  filterPillRow: { marginTop: 6, flexDirection: 'row' },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.small,
    backgroundColor: '#E7F0E4',
    borderWidth: 1,
    borderColor: palette.controlLine,
  },
  filterPillText: { color: palette.evergreen, fontSize: 10, fontWeight: '700' },
  limitWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: radii.small,
    backgroundColor: '#FFF8EF',
    borderLeftWidth: 2,
    borderLeftColor: palette.warning,
  },
  limitWarningText: { color: palette.ink, fontSize: 10 },
  list: { gap: 8 },
  bookingCard: { padding: 11, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, gap: 10 },
  bookingTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  bookingCode: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  status: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 4, overflow: 'hidden', fontSize: 8, fontWeight: '700' },
  statusOk: { backgroundColor: '#E1EFE0', color: palette.leaf },
  statusPending: { backgroundColor: '#F5EBD7', color: '#866524' },
  statusDanger: { backgroundColor: '#F8E5DF', color: palette.danger },
  bookingGuest: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bookingName: { color: palette.ink, fontSize: 11, fontWeight: '700' },
  bookingMeta: { marginTop: 2, color: palette.muted, fontSize: 9 },
  bookingBottom: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  bookingProperty: { flex: 1, color: palette.evergreen, fontSize: 9, fontWeight: '600' },
  bookingDates: { color: palette.muted, fontSize: 9 },
  pressed: { opacity: 0.68 },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'flex-end', paddingTop: 60, backgroundColor: 'rgba(9,35,40,.5)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: palette.background },
  sheetContent: { padding: 16, paddingBottom: 34, gap: 12 },
  sheetHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: palette.ink, fontSize: 19, fontWeight: '700' },
  sheetMeta: { marginTop: 3, color: palette.muted, fontSize: 9 },
  detailGuest: { padding: 11, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detail: { width: '48.7%', padding: 10, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, gap: 4 },
  detailLabel: { color: palette.muted, fontSize: 8 },
  detailValue: { color: palette.ink, fontSize: 10, fontWeight: '700' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 44, paddingHorizontal: 13, borderRadius: radii.small, backgroundColor: palette.evergreen, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionDanger: { borderWidth: 1, borderColor: '#D9AAA1', backgroundColor: palette.white },
  actionText: { color: palette.white, fontSize: 10, fontWeight: '700' },
  actionTextDanger: { color: palette.danger },
  field: { gap: 6 },
  fieldLabel: { color: palette.evergreen, fontSize: 10, fontWeight: '700' },
  input: { minHeight: 44, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, color: palette.ink, fontSize: 12 },
  choices: { gap: 6 },
  choice: { maxWidth: 210, minHeight: 40, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  choiceActive: { borderColor: palette.evergreen, backgroundColor: palette.evergreen },
  choiceText: { color: palette.muted, fontSize: 10 },
  choiceTextActive: { color: palette.white, fontWeight: '700' },
  inlineButton: { minHeight: 40, borderWidth: 1, borderColor: palette.sage, borderRadius: radii.small, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  inlineText: { color: palette.evergreen, fontSize: 10, fontWeight: '700' },
  inlineForm: { padding: 10, borderRadius: radii.small, backgroundColor: '#EAF2E7', gap: 10 },
  submit: { minHeight: 47, borderRadius: radii.small, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: palette.white, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.42 },
  error: { padding: 10, borderRadius: radii.small, backgroundColor: '#FFF0EC', color: palette.danger, fontSize: 10 },
})
