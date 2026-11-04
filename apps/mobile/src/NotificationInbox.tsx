import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  mapNotificationReference,
  type Notification,
  type NotificationCategory,
  type NotificationPriority,
} from '@vistay/admin-api-client'
import type { NotificationInboxModel } from './useBackofficeData'

interface NotificationInboxProps {
  model: NotificationInboxModel
}

const categories: (NotificationCategory | 'ALL')[] = [
  'ALL', 'WELCOME', 'SECURITY', 'BOOKING', 'OPERATIONS', 'FINANCE', 'SYSTEM',
]
const priorities: (NotificationPriority | 'ALL')[] = ['ALL', 'URGENT', 'HIGH', 'NORMAL', 'LOW']

const categoryLabels: Record<NotificationCategory | 'ALL', string> = {
  ALL: 'Tat ca', WELCOME: 'Chao mung', SECURITY: 'Bao mat', BOOKING: 'Dat phong',
  OPERATIONS: 'Van hanh', FINANCE: 'Tai chinh', SYSTEM: 'He thong',
}
const priorityLabels: Record<NotificationPriority | 'ALL', string> = {
  ALL: 'Muc do', URGENT: 'Khan cap', HIGH: 'Cao', NORMAL: 'Thuong', LOW: 'Thap',
}

function notificationPriority(notification: Notification): NotificationPriority {
  return notification.priority ?? 'NORMAL'
}

function priorityStyle(priority: NotificationPriority) {
  switch (priority) {
    case 'URGENT': return styles.priorityURGENT
    case 'HIGH': return styles.priorityHIGH
    case 'LOW': return styles.priorityLOW
    default: return styles.priorityNORMAL
  }
}

function matchesDate(value: string, from: string, to: string): boolean {
  const day = value.slice(0, 10)
  return (!from || day >= from) && (!to || day <= to)
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value))
}

function NotificationRow({
  notification,
  selected,
  onSelect,
}: {
  notification: Notification
  selected: boolean
  onSelect: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={`${notification.readAt ? '' : 'Chua doc: '}${notification.title}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={[styles.row, selected && styles.rowSelected, !notification.readAt && styles.rowUnread]}
    >
      <View style={[styles.priority, priorityStyle(notificationPriority(notification))]}>
        <Text style={styles.priorityText}>{priorityLabels[notificationPriority(notification)]}</Text>
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.rowTopline}>
          <Text style={styles.category}>{categoryLabels[notification.category]}</Text>
          <Text style={styles.time}>{formatDate(notification.createdAt)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.rowTitle}>{notification.title}</Text>
        <Text numberOfLines={2} style={styles.rowBody}>{notification.body}</Text>
        <Text style={styles.rowHint}>{notification.reference && mapNotificationReference(notification.reference) ? 'Co nguon an toan' : 'Thong bao noi bo'}</Text>
      </View>
      {!notification.readAt && <View accessibilityLabel="Chua doc" style={styles.unreadDot} />}
    </Pressable>
  )
}

function NotificationDetail({
  notification,
  onMarkRead,
}: {
  notification: Notification
  onMarkRead: () => void
}) {
  const safeRoute = mapNotificationReference(notification.reference)
  return (
    <View accessibilityLabel="Chi tiet thong bao" style={styles.detail}>
      <View style={styles.detailHeading}>
        <View style={[styles.priority, priorityStyle(notificationPriority(notification))]}>
          <Text style={styles.priorityText}>{priorityLabels[notificationPriority(notification)]}</Text>
        </View>
        <Text style={styles.detailCategory}>{categoryLabels[notification.category]}</Text>
      </View>
      <Text style={styles.detailTitle}>{notification.title}</Text>
      <Text style={styles.detailTime}>{formatDate(notification.createdAt)}</Text>
      <Text style={styles.detailBody}>{notification.body}</Text>
      <View style={styles.detailMeta}>
        <Text style={styles.metaLabel}>Kenh: <Text style={styles.metaValue}>{notification.channels.join(' · ')}</Text></Text>
        {notification.notificationType && <Text style={styles.metaLabel}>Loai: <Text style={styles.metaValue}>{notification.notificationType}</Text></Text>}
        {notification.templateKey && <Text style={styles.metaLabel}>Mau: <Text style={styles.metaValue}>{notification.templateKey} / v{notification.templateRevision ?? '-'}</Text></Text>}
      </View>
      {safeRoute && <Text style={styles.safeReference}>Nguon da duoc kiem tra va gioi han trong ung dung.</Text>}
      {!notification.readAt && <Pressable accessibilityRole="button" onPress={onMarkRead} style={styles.markRead}><Text style={styles.markReadText}>Danh dau da doc</Text></Pressable>}
    </View>
  )
}

export function NotificationInbox({ model }: NotificationInboxProps) {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [category, setCategory] = useState<NotificationCategory | 'ALL'>('ALL')
  const [priority, setPriority] = useState<NotificationPriority | 'ALL'>('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [actionError, setActionError] = useState<string>()

  const filtered = useMemo(() => model.notifications.filter((notification) => (
    (!unreadOnly || !notification.readAt)
      && (category === 'ALL' || notification.category === category)
      && (priority === 'ALL' || notificationPriority(notification) === priority)
      && matchesDate(notification.createdAt, fromDate, toDate)
  )), [category, fromDate, model.notifications, priority, toDate, unreadOnly])

  const selected = filtered.find((notification) => notification.id === selectedId) ?? filtered[0]
  const markRead = async (notification: Notification) => {
    setActionError(undefined)
    try {
      await model.markRead(notification)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Khong the cap nhat thong bao')
    }
  }
  const markAllRead = async () => {
    setActionError(undefined)
    try {
      await model.markAllRead()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Khong the cap nhat thong bao')
    }
  }

  return (
    <View accessibilityLabel="Hop thu thong bao" style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>DURABLE INBOX</Text>
          <Text style={styles.title}>Thong bao cua ban</Text>
          <Text style={styles.summary}>{model.unreadCount} chua doc · {filtered.length} dang hien thi</Text>
        </View>
        <Pressable accessibilityRole="button" disabled={model.unreadCount === 0} onPress={() => void markAllRead()} style={styles.markAll}><Text style={styles.markAllText}>Doc tat ca</Text></Pressable>
      </View>

      <View accessibilityLabel="Bo loc thong bao" style={styles.filters}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: unreadOnly }} onPress={() => setUnreadOnly((value) => !value)} style={[styles.filterChip, unreadOnly && styles.filterChipActive]}>
          <Text style={[styles.filterChipText, unreadOnly && styles.filterChipTextActive]}>Chi chua doc</Text>
        </Pressable>
        {categories.map((value) => <Pressable accessibilityRole="button" key={value} onPress={() => setCategory(value)} style={[styles.filterChip, category === value && styles.filterChipActive]}><Text style={[styles.filterChipText, category === value && styles.filterChipTextActive]}>{categoryLabels[value]}</Text></Pressable>)}
        {priorities.map((value) => <Pressable accessibilityRole="button" key={value} onPress={() => setPriority(value)} style={[styles.filterChip, priority === value && styles.filterChipActive]}><Text style={[styles.filterChipText, priority === value && styles.filterChipTextActive]}>{priorityLabels[value]}</Text></Pressable>)}
        <TextInput accessibilityLabel="Tu ngay" onChangeText={setFromDate} placeholder="Tu ngay YYYY-MM-DD" placeholderTextColor="#8c968f" style={styles.dateInput} value={fromDate} />
        <TextInput accessibilityLabel="Den ngay" onChangeText={setToDate} placeholder="Den ngay YYYY-MM-DD" placeholderTextColor="#8c968f" style={styles.dateInput} value={toDate} />
      </View>

      <View style={styles.connectionRow}>
        <View style={[styles.liveDot, model.status === 'live' && styles.liveDotActive]} />
        <Text style={styles.connectionText}>{model.status === 'live' ? 'Truc tuyen' : model.status === 'error' ? 'Mat ket noi' : 'Dang dong bo'}</Text>
        {model.status !== 'live' && <Pressable accessibilityRole="button" onPress={model.reconnect}><Text style={styles.reconnect}>Ket noi lai</Text></Pressable>}
      </View>
      {model.error && <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{model.error}</Text><Pressable accessibilityRole="button" onPress={model.retry}><Text style={styles.reconnect}>Thu lai</Text></Pressable></View>}
      {actionError && <Text accessibilityRole="alert" style={styles.errorText}>{actionError}</Text>}
      {model.cursorState && model.cursorState !== 'ACTIVE' && <Text style={styles.cursorNotice}>Lich su phan trang can dong bo lai ({model.cursorState}).</Text>}
      {model.inboxStatus === 'loading' && <View style={styles.empty}><ActivityIndicator color="#17231d" /><Text style={styles.emptyTitle}>Dang tai thong bao...</Text></View>}
      {model.inboxStatus !== 'loading' && filtered.length === 0 && <View style={styles.empty}><Text style={styles.emptyTitle}>Chua co thong bao phu hop</Text><Text style={styles.emptyBody}>Thu doi bo loc hoac ket noi lai de dong bo lich su.</Text></View>}
      {filtered.length > 0 && <View style={styles.list}>
        {filtered.map((notification) => <NotificationRow key={notification.id} notification={notification} onSelect={() => {
          setSelectedId(notification.id)
          if (!notification.readAt) void markRead(notification)
        }} selected={notification.id === selectedId} />)}
        {model.pageInfo?.hasNextPage && <Pressable accessibilityRole="button" disabled={model.loadingMore} onPress={() => void model.loadMore()} style={styles.loadMore}><Text style={styles.loadMoreText}>{model.loadingMore ? 'Dang tai...' : 'Tai them'}</Text></Pressable>}
      </View>}
      {selected && <NotificationDetail notification={selected} onMarkRead={() => void markRead(selected)} />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginTop: 34, paddingBottom: 28 },
  heading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  headingCopy: { flex: 1 },
  eyebrow: { color: '#68756e', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  title: { marginTop: 7, color: '#17231d', fontSize: 28, lineHeight: 31, fontWeight: '700', letterSpacing: -1.2 },
  summary: { marginTop: 7, color: '#68756e', fontSize: 11 },
  markAll: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10, backgroundColor: '#17231d' },
  markAllText: { color: 'white', fontSize: 10, fontWeight: '700' },
  filters: { marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: '#e6e5dd' },
  filterChipActive: { backgroundColor: '#17231d' },
  filterChipText: { color: '#52645a', fontSize: 9, fontWeight: '700' },
  filterChipTextActive: { color: 'white' },
  dateInput: { minWidth: 130, flexGrow: 1, paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 8, backgroundColor: '#fffef9', color: '#17231d', fontSize: 10 },
  connectionRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#b5bdb7' },
  liveDotActive: { backgroundColor: '#65a275' },
  connectionText: { color: '#68756e', fontSize: 10 },
  reconnect: { marginLeft: 'auto', color: '#6c8b48', fontSize: 10, fontWeight: '700' },
  error: { marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: '#fff0ec', flexDirection: 'row', gap: 10 },
  errorText: { flex: 1, color: '#a74235', fontSize: 11, lineHeight: 16 },
  cursorNotice: { marginTop: 10, padding: 11, borderRadius: 10, backgroundColor: '#fff4d6', color: '#765d25', fontSize: 10 },
  empty: { minHeight: 180, marginTop: 12, padding: 24, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 17, backgroundColor: '#fffef9', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { color: '#17231d', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  emptyBody: { color: '#68756e', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  list: { marginTop: 12, paddingHorizontal: 13, borderWidth: 1, borderColor: '#dcddd5', borderRadius: 17, backgroundColor: '#fffef9' },
  row: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#e6e6df', flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowSelected: { paddingHorizontal: 8, borderRadius: 11, backgroundColor: '#f4f8e8' },
  rowUnread: { borderLeftWidth: 3, borderLeftColor: '#8aad18', paddingLeft: 8 },
  priority: { paddingHorizontal: 6, paddingVertical: 5, borderRadius: 6 },
  priorityText: { fontSize: 8, fontWeight: '800' },
  priorityURGENT: { backgroundColor: '#ffe0d8' },
  priorityHIGH: { backgroundColor: '#fff0cd' },
  priorityNORMAL: { backgroundColor: '#e5f1d9' },
  priorityLOW: { backgroundColor: '#e9ece8' },
  rowCopy: { flex: 1, gap: 4 },
  rowTopline: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  category: { color: '#68756e', fontSize: 9, fontWeight: '700' },
  time: { color: '#879189', fontSize: 9 },
  rowTitle: { color: '#17231d', fontSize: 13, fontWeight: '700' },
  rowBody: { color: '#68756e', fontSize: 11, lineHeight: 17 },
  rowHint: { color: '#6c8b48', fontSize: 9, fontWeight: '700' },
  unreadDot: { width: 7, height: 7, marginTop: 4, borderRadius: 4, backgroundColor: '#8aad18' },
  loadMore: { marginVertical: 12, padding: 11, borderRadius: 9, backgroundColor: '#e6e5dd', alignItems: 'center' },
  loadMoreText: { color: '#17231d', fontSize: 10, fontWeight: '700' },
  detail: { marginTop: 14, padding: 18, borderRadius: 17, backgroundColor: '#142119' },
  detailHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  detailCategory: { color: '#aab8b0', fontSize: 10, fontWeight: '700' },
  detailTitle: { marginTop: 12, color: 'white', fontSize: 20, lineHeight: 24, fontWeight: '700' },
  detailTime: { marginTop: 5, color: '#aab8b0', fontSize: 10 },
  detailBody: { marginTop: 13, color: '#d7e0da', fontSize: 12, lineHeight: 19 },
  detailMeta: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.12)', gap: 7 },
  metaLabel: { color: '#90a49a', fontSize: 10 },
  metaValue: { color: '#e9f0eb', fontWeight: '600' },
  safeReference: { marginTop: 12, color: '#d9ff63', fontSize: 10, fontWeight: '700' },
  markRead: { alignSelf: 'flex-start', marginTop: 14, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: '#d9ff63' },
  markReadText: { color: '#17231d', fontSize: 10, fontWeight: '700' },
})
