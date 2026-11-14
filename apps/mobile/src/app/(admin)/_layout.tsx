import { useEffect, type ComponentProps } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, Slot, router, usePathname } from 'expo-router'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AdminProvider } from '../../AdminContext'
import { useMobileSession } from '../../MobileSession'
import { useNotificationInbox, useViewer } from '../../useBackofficeData'
import { palette, radii } from '../../ui/theme'

type IconName = ComponentProps<typeof Ionicons>['name']

const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: '/overview', label: 'Tổng quan', icon: 'grid-outline' },
  { href: '/booking', label: 'Booking', icon: 'calendar-outline' },
  { href: '/properties', label: 'Căn hộ', icon: 'business-outline' },
  { href: '/users', label: 'Người dùng', icon: 'people-outline' },
  { href: '/access', label: 'Phân quyền', icon: 'shield-checkmark-outline' },
]

function ProfileFailure({ error, retry, logout }: { error?: string; retry: () => void; logout: () => void }) {
  return <SafeAreaView style={styles.safe}><View style={styles.failure}>
    <Ionicons color={palette.danger} name="cloud-offline-outline" size={34} />
    <Text style={styles.failureTitle}>Không tải được hồ sơ</Text>
    <Text style={styles.failureBody}>{error ?? 'Federation chưa phản hồi.'}</Text>
    <Pressable onPress={retry} style={styles.failureButton}><Text style={styles.failureButtonText}>Thử lại</Text></Pressable>
    <Pressable onPress={logout}><Text style={styles.logoutLink}>Đăng xuất</Text></Pressable>
  </View></SafeAreaView>
}

function AuthenticatedShell({ accessToken }: { accessToken: string }) {
  const { auth, config } = useMobileSession()
  const { width } = useWindowDimensions()
  const compact = width < 370
  const pathname = usePathname()
  const profile = useViewer(config.graphqlUrl, accessToken)
  const inbox = useNotificationInbox(config.graphqlUrl, accessToken, profile.viewer?.accountId)

  useEffect(() => {
    if (pathname === '/') router.replace('/overview')
  }, [pathname])

  if (profile.status === 'loading') return <SafeAreaView style={styles.safe}><View style={styles.failure}><ActivityIndicator color={palette.evergreen} size="large" /><Text style={styles.failureTitle}>Đang tải không gian quản trị</Text></View></SafeAreaView>
  if (profile.status === 'error' || !profile.viewer) return <ProfileFailure error={profile.error} retry={profile.retry} logout={() => void auth.logout()} />

  const initials = profile.viewer.displayName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase() || 'VA'
  return <AdminProvider value={{ accessToken, config, inbox, retryViewer: profile.retry, viewer: profile.viewer }}>
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <View style={styles.topbar}>
        <Pressable accessibilityLabel="Về Tổng quan" onPress={() => router.push('/overview')} style={styles.brand}>
          <View style={[styles.brandMark, compact && styles.brandMarkCompact]}>
            <Image resizeMode="contain" source={require('../../../../web/src/assets/vistay-logo.png')} style={styles.brandLogo} />
          </View>
        </Pressable>
        <View style={styles.topActions}>
          <View accessibilityLabel={inbox.status === 'live' ? 'Đang trực tuyến' : 'Đang kết nối'} style={styles.live}><View style={[styles.liveDot, inbox.status !== 'live' && styles.liveDotMuted]} />{!compact ? <Text style={styles.liveText}>{inbox.status === 'live' ? 'Trực tuyến' : 'Đồng bộ'}</Text> : null}</View>
          <Pressable accessibilityLabel="Thông báo" onPress={() => router.push('/notifications')} style={styles.iconButton}>
            <Ionicons color={palette.white} name="notifications-outline" size={19} />
            {inbox.unreadCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(inbox.unreadCount, 99)}</Text></View>}
          </Pressable>
          <Pressable accessibilityLabel="Cài đặt" onPress={() => router.push('/settings')} style={styles.iconButton}><Ionicons color={palette.white} name="settings-outline" size={19} /></Pressable>
          <Pressable accessibilityLabel="Tài khoản" onPress={() => router.push('/settings')} style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></Pressable>
        </View>
      </View>

      <ScrollView horizontal contentContainerStyle={styles.navContent} showsHorizontalScrollIndicator={false} style={styles.nav}>
        {navigation.map((item) => {
          const selected = pathname === item.href
          return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} key={item.href} onPress={() => router.push(item.href)} style={[styles.navItem, selected && styles.navItemActive]}>
            <Ionicons color={selected ? palette.white : '#C4D6CC'} name={item.icon} size={18} />
            <Text style={[styles.navText, selected && styles.navTextActive]}>{item.label}</Text>
          </Pressable>
        })}
      </ScrollView>
      <View style={styles.content}><Slot /></View>
    </SafeAreaView>
  </AdminProvider>
}

export default function AdminLayout() {
  const { auth } = useMobileSession()
  if (auth.status !== 'authenticated' || !auth.accessToken) return <Redirect href="/" />
  return <AuthenticatedShell accessToken={auth.accessToken} />
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.evergreen },
  topbar: { minHeight: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 74, height: 34, paddingHorizontal: 3, borderRadius: radii.small, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  brandMarkCompact: { width: 52 },
  brandLogo: { width: '100%', height: 31 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  live: { height: 34, paddingHorizontal: 9, borderRadius: radii.small, backgroundColor: palette.ink, flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#B8EC74' },
  liveDotMuted: { backgroundColor: palette.sage },
  liveText: { color: palette.white, fontSize: 9, fontWeight: '600' },
  iconButton: { position: 'relative', width: 34, height: 34, borderRadius: radii.small, backgroundColor: palette.ink, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: '#B8EC74', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: palette.ink, fontSize: 8, fontWeight: '800' },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.evergreen, fontSize: 10, fontWeight: '800' },
  nav: { flexGrow: 0, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.13)' },
  navContent: { paddingHorizontal: 12, paddingVertical: 9, gap: 7 },
  navItem: { minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.18)', borderRadius: radii.small, flexDirection: 'row', alignItems: 'center', gap: 7 },
  navItemActive: { borderColor: palette.ink, backgroundColor: palette.ink },
  navText: { color: '#D6E2DB', fontSize: 10, fontWeight: '600' },
  navTextActive: { color: palette.white, fontWeight: '800' },
  content: { flex: 1, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: palette.background, overflow: 'hidden' },
  failure: { flex: 1, padding: 28, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center', gap: 11 },
  failureTitle: { color: palette.ink, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  failureBody: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  failureButton: { minWidth: 130, minHeight: 42, marginTop: 7, borderRadius: radii.small, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' },
  failureButtonText: { color: palette.white, fontSize: 11, fontWeight: '700' },
  logoutLink: { padding: 8, color: palette.danger, fontSize: 11, fontWeight: '700' },
})
