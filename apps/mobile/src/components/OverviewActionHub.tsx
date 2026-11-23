import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { fetch as expoFetch } from 'expo/fetch'
import {
  transitionAdminBooking,
  type AdminBookingRecord,
  type BackofficeViewer,
} from '@vistay/admin-api-client'
import { SectionHeading, Surface } from '../ui/primitives'
import { palette, radii } from '../ui/theme'
import { formatMobileRoute } from '../navigation/navigationIntent'

const mobileFetch = expoFetch as typeof globalThis.fetch

export interface OverviewActionHubProps {
  pendingBookings: AdminBookingRecord[]
  loading: boolean
  error?: string
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
  onBookingConfirmed: (updated: AdminBookingRecord) => void
  onRefresh: () => void
}

export function OverviewActionHub({
  pendingBookings,
  loading,
  error,
  graphqlUrl,
  accessToken,
  viewer,
  onBookingConfirmed,
  onRefresh,
}: OverviewActionHubProps) {
  const router = useRouter()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const canConfirm = viewer.permissions.includes('booking:update')

  const handleQuickConfirm = async (booking: AdminBookingRecord) => {
    if (confirmingId) return
    setConfirmingId(booking.id)
    setActionError(null)
    setActionSuccess(null)

    try {
      const updated = await transitionAdminBooking(
        graphqlUrl,
        accessToken,
        'confirm',
        {
          id: booking.id,
          expectedVersion: booking.version,
          reason: 'Xác nhận nhanh từ Mobile Command Center Action Hub',
        },
        mobileFetch
      )
      setActionSuccess(`Đã xác nhận booking ${booking.bookingCode}`)
      onBookingConfirmed(updated)
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : `Không thể xác nhận booking ${booking.bookingCode}`
      )
    } finally {
      setConfirmingId(null)
    }
  }

  const navigateToBookingList = (status?: 'PENDING_CONFIRMATION') => {
    const route = formatMobileRoute({
      destination: 'booking',
      section: 'reservations',
      filters: status ? { status } : undefined,
    })
    router.push({
      pathname: route.pathname,
      params: route.params,
    })
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <SectionHeading
          title="Tác vụ cần xử lý (Action Required)"
          caption="Booking đang chờ xác nhận cần duyệt ngay."
        />
        {pendingBookings.length > 0 && (
          <Pressable
            onPress={() => navigateToBookingList('PENDING_CONFIRMATION')}
            style={({ pressed }) => [styles.viewAllBadge, pressed && styles.pressed]}
          >
            <Text style={styles.viewAllText}>
              Xem tất cả ({pendingBookings.length})
            </Text>
            <Ionicons color={palette.leaf} name="arrow-forward" size={12} />
          </Pressable>
        )}
      </View>

      {actionSuccess && (
        <View style={styles.successBanner}>
          <Ionicons color={palette.leaf} name="checkmark-circle" size={16} />
          <Text style={styles.successText}>{actionSuccess}</Text>
        </View>
      )}

      {actionError && (
        <View style={styles.errorBanner}>
          <Ionicons color={palette.danger} name="alert-circle" size={16} />
          <Text style={styles.errorText}>{actionError}</Text>
        </View>
      )}

      {loading && !pendingBookings.length ? (
        <Surface>
          <View style={styles.loadingBox}>
            <ActivityIndicator color={palette.evergreen} size="small" />
            <Text style={styles.loadingText}>Đang kiểm tra tác vụ cần xử lý...</Text>
          </View>
        </Surface>
      ) : error ? (
        <Surface>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={onRefresh} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Thử lại</Text>
            </Pressable>
          </View>
        </Surface>
      ) : pendingBookings.length === 0 ? (
        <Surface>
          <View style={styles.emptyBox}>
            <Ionicons color={palette.leaf} name="checkmark-done-circle-outline" size={32} />
            <Text style={styles.emptyTitle}>Không có booking chờ xác nhận</Text>
            <Text style={styles.emptySubtitle}>
              Mọi yêu cầu đặt phòng đã được xử lý hoặc xác nhận kịp thời.
            </Text>
          </View>
        </Surface>
      ) : (
        <View style={styles.cardsList}>
          {pendingBookings.map((booking) => {
            const isConfirming = confirmingId === booking.id
            const formattedPrice = booking.totalAmount
              ? `${Number(booking.totalAmount).toLocaleString('vi-VN')} ${booking.currency}`
              : 'Chưa có giá'

            return (
              <View key={booking.id} style={styles.actionCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.codeBadge}>
                    <Text style={styles.codeText}>{booking.bookingCode}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>Chờ xác nhận</Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <View style={styles.infoRow}>
                    <Ionicons color={palette.ink} name="person-outline" size={14} />
                    <Text style={styles.guestName}>{booking.guestName}</Text>
                    {booking.guestPhone ? (
                      <Text style={styles.guestPhone}>· {booking.guestPhone}</Text>
                    ) : null}
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons color={palette.muted} name="home-outline" size={14} />
                    <Text numberOfLines={1} style={styles.propertyText}>
                      {booking.propertyName || booking.propertyId}
                    </Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons color={palette.muted} name="calendar-outline" size={14} />
                    <Text style={styles.datesText}>
                      {booking.checkInDate} → {booking.checkOutDate}
                    </Text>
                    <Text style={styles.amountText}>{formattedPrice}</Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <Pressable
                    disabled={Boolean(confirmingId)}
                    onPress={() => navigateToBookingList('PENDING_CONFIRMATION')}
                    style={({ pressed }) => [
                      styles.secondaryAction,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.secondaryActionText}>Chi tiết</Text>
                  </Pressable>

                  {canConfirm && (
                    <Pressable
                      disabled={Boolean(confirmingId)}
                      onPress={() => void handleQuickConfirm(booking)}
                      style={({ pressed }) => [
                        styles.primaryAction,
                        isConfirming && styles.disabledAction,
                        pressed && !confirmingId && styles.pressed,
                      ]}
                    >
                      {isConfirming ? (
                        <ActivityIndicator color={palette.white} size="small" />
                      ) : (
                        <>
                          <Ionicons color={palette.white} name="checkmark-sharp" size={14} />
                          <Text style={styles.primaryActionText}>Xác nhận nhanh</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  viewAllBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.small,
    backgroundColor: '#E7F2E8',
  },
  viewAllText: { color: palette.evergreen, fontSize: 11, fontWeight: '700' },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radii.small,
    backgroundColor: '#E1EFE0',
  },
  successText: { color: palette.leaf, fontSize: 11, fontWeight: '600' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radii.small,
    backgroundColor: '#FFF0EC',
  },
  errorText: { color: palette.danger, fontSize: 11 },
  loadingBox: { padding: 18, alignItems: 'center', gap: 8 },
  loadingText: { color: palette.muted, fontSize: 11 },
  errorBox: { padding: 14, alignItems: 'center', gap: 8 },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.small,
    backgroundColor: palette.evergreen,
  },
  retryButtonText: { color: palette.white, fontSize: 11, fontWeight: '700' },
  emptyBox: { padding: 20, alignItems: 'center', gap: 6 },
  emptyTitle: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  emptySubtitle: { color: palette.muted, fontSize: 11, textAlign: 'center' },
  cardsList: { gap: 8 },
  actionCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2DBD2',
    borderRadius: radii.medium,
    backgroundColor: palette.white,
    gap: 8,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F0F3EF',
  },
  codeText: { color: palette.ink, fontSize: 11, fontWeight: '800' },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#FBF0DF',
  },
  statusText: { color: '#976116', fontSize: 10, fontWeight: '700' },
  cardBody: { gap: 4 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  guestName: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  guestPhone: { color: palette.muted, fontSize: 11 },
  propertyText: { flex: 1, color: palette.evergreen, fontSize: 11, fontWeight: '500' },
  datesText: { color: palette.muted, fontSize: 10 },
  amountText: {
    marginLeft: 'auto',
    color: palette.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
  },
  secondaryAction: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: palette.controlLine,
    backgroundColor: palette.white,
  },
  secondaryActionText: { color: palette.muted, fontSize: 11, fontWeight: '600' },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.small,
    backgroundColor: palette.evergreen,
  },
  primaryActionText: { color: palette.white, fontSize: 11, fontWeight: '700' },
  disabledAction: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
})
