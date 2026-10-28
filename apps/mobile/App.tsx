import { useState } from 'react'
import * as WebBrowser from 'expo-web-browser'
import { StatusBar } from 'expo-status-bar'
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { Notification } from '@vistay/admin-api-client'
import { readMobileConfig, type MobileConfig } from './src/config'
import { useMobileAuth } from './src/useMobileAuth'
import { useNotificationStream, useViewer, type StreamStatus } from './src/useBackofficeData'
import { AuthorizationWorkspace } from './src/AuthorizationWorkspace'
import { AccountProvisioning } from './src/AccountProvisioning'
import { SecuritySessions } from './src/SecuritySessions'
import { PersonalProfileEditor } from './src/PersonalProfileEditor'

WebBrowser.maybeCompleteAuthSession()

const runtime = readMobileConfig()
const streamLabels: Record<StreamStatus, string> = {
  connecting: 'Đang kết nối',
  live: 'Trực tuyến',
  retrying: 'Đang nối lại',
  error: 'Mất kết nối',
}

function StateScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#17231d" />
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateDetail}>{detail}</Text>
      </View>
    </SafeAreaView>
  )
}

function LoginScreen({
  error,
  enabled,
  onLogin,
}: {
  error?: string
  enabled: boolean
  onLogin: () => void
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.loginPage}>
        <Text style={styles.mark}>ViStay<Text style={styles.markDot}>.</Text></Text>
        <View style={styles.loginHero}>
          <Text style={styles.eyebrow}>BACKOFFICE / EPIC 01</Text>
          <Text style={styles.loginTitle}>Một cửa vào.{`\n`}Đúng quyền hạn.</Text>
          <Text style={styles.loginLead}>Đăng nhập để xem hồ sơ phân quyền và nhận thông báo vận hành theo thời gian thực.</Text>
        </View>
        <View style={styles.securityCard}>
          <Text style={styles.securityIcon}>⌁</Text>
          <Text style={styles.securityEyebrow}>ĐĂNG NHẬP AN TOÀN</Text>
          <Text style={styles.securityTitle}>Authorization Code + PKCE</Text>
          <Text style={styles.securityBody}>Mật khẩu chỉ được nhập tại Backoffice Realm. Ứng dụng không chứa client secret; token được lưu trong SecureStore của thiết bị.</Text>
        </View>
        {error && <Text accessibilityRole="alert" style={styles.errorBox}>{error}</Text>}
        <Pressable
          accessibilityRole="button"
          disabled={!enabled}
          onPress={onLogin}
          style={({ pressed }) => [styles.primary, (!enabled || pressed) && styles.buttonPressed]}
        >
          <Text style={styles.primaryText}>{enabled ? 'Đăng nhập Backoffice' : 'Đang tải cấu hình OIDC…'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function NotificationCard({ notification }: { notification: Notification }) {
  const time = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
    .format(new Date(notification.createdAt))
  return (
    <View style={styles.notification}>
      <View style={[styles.notificationIcon, notification.category === 'SECURITY' && styles.notificationIconSecurity]}>
        <Text>{notification.category === 'SECURITY' ? '!' : '✓'}</Text>
      </View>
      <View style={styles.notificationCopy}>
        <View style={styles.notificationMeta}>
          <Text style={styles.notificationCategory}>{notification.category === 'SECURITY' ? 'BẢO MẬT' : 'CHÀO MỪNG'}</Text>
          <Text style={styles.notificationTime}>{time}</Text>
        </View>
        <Text style={styles.notificationTitle}>{notification.title}</Text>
        <Text style={styles.notificationBody}>{notification.body}</Text>
        <Text style={styles.notificationChannels}>{notification.channels.join(' · ')}</Text>
      </View>
    </View>
  )
}

function BackofficeScreen({ config, accessToken, onLogout }: {
  config: MobileConfig
  accessToken: string
  onLogout: () => void
}) {
  const profile = useViewer(config.graphqlUrl, accessToken)
  const stream = useNotificationStream(config.graphqlUrl, accessToken, profile.viewer?.accountId)
  const [section, setSection] = useState<'overview' | 'accounts' | 'authorization'>('overview')

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>TRUNG TÂM VẬN HÀNH</Text>
            <Text style={styles.title}>Xin chào,{`\n`}{profile.viewer?.displayName ?? 'Backoffice'}.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logout}><Text style={styles.logoutText}>Thoát</Text></Pressable>
        </View>

        {profile.status === 'loading' && <View style={styles.inlineState}><ActivityIndicator color="#17231d" /><Text>Đang tải hồ sơ từ Federation…</Text></View>}
        {profile.status === 'error' && (
          <View style={[styles.inlineState, styles.inlineError]}>
            <View style={styles.errorCopy}><Text style={styles.errorTitle}>Không tải được hồ sơ</Text><Text style={styles.errorDetail}>{profile.error}</Text></View>
            <Pressable accessibilityRole="button" onPress={profile.retry} style={styles.retry}><Text style={styles.retryText}>Thử lại</Text></Pressable>
          </View>
        )}

        {profile.viewer && (
          <>
            <View accessibilityRole="tablist" style={styles.tabs}>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: section === 'overview' }}
                onPress={() => setSection('overview')}
                style={[styles.tab, section === 'overview' && styles.tabActive]}
              >
                <Text style={[styles.tabText, section === 'overview' && styles.tabTextActive]}>Tổng quan</Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: section === 'accounts' }}
                onPress={() => setSection('accounts')}
                style={[styles.tab, section === 'accounts' && styles.tabActive]}
              >
                <Text style={[styles.tabText, section === 'accounts' && styles.tabTextActive]}>Tài khoản</Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: section === 'authorization' }}
                onPress={() => setSection('authorization')}
                style={[styles.tab, section === 'authorization' && styles.tabActive]}
              >
                <Text style={[styles.tabText, section === 'authorization' && styles.tabTextActive]}>Phân quyền</Text>
              </Pressable>
            </View>

            {section === 'overview' ? (
              <>
            <View style={styles.signalGrid}>
              <View style={styles.signal}><Text style={styles.signalLabel}>DANH TÍNH</Text><Text style={styles.signalValue}>Đã xác minh</Text><Text style={styles.signalNote}>Backoffice Realm</Text></View>
              <View style={styles.signal}><Text style={styles.signalLabel}>VAI TRÒ</Text><Text style={styles.signalNumber}>{profile.viewer.roles.length}</Text><Text style={styles.signalNote}>{profile.viewer.roles.join(', ') || 'Chưa gán'}</Text></View>
              <View style={styles.signal}><Text style={styles.signalLabel}>QUYỀN</Text><Text style={styles.signalNumber}>{profile.viewer.permissions.length}</Text><Text style={styles.signalNote}>Phiên bản {profile.viewer.authorizationVersion}</Text></View>
              <View style={[styles.signal, stream.status === 'live' && styles.signalLive]}><Text style={styles.signalLabel}>THÔNG BÁO</Text><Text style={styles.signalValue}>{streamLabels[stream.status]}</Text><Text style={styles.signalNote}>GraphQL-over-SSE</Text></View>
            </View>

            <PersonalProfileEditor
              key={profile.viewer.profileVersion}
              graphqlUrl={config.graphqlUrl}
              accessToken={accessToken}
              viewer={profile.viewer}
              onUpdated={profile.retry}
            />

            <SecuritySessions
              authApiUrl={config.authApiUrl}
              accessToken={accessToken}
              viewer={profile.viewer}
              onCurrentRevoked={onLogout}
            />

            <View style={styles.sectionHeader}>
              <View><Text style={styles.eyebrow}>DURABLE INBOX</Text><Text style={styles.sectionTitle}>Thông báo của bạn</Text></View>
              <View style={[styles.livePill, stream.status === 'live' && styles.livePillActive]}><View style={styles.liveDot} /><Text style={styles.liveText}>{streamLabels[stream.status]}</Text></View>
            </View>

            {stream.error && (
              <View style={styles.streamError}>
                <Text style={styles.errorDetail}>{stream.error}</Text>
                <Pressable accessibilityRole="button" onPress={stream.reconnect}><Text style={styles.errorAction}>Kết nối lại</Text></Pressable>
              </View>
            )}

            {stream.notifications.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>♢</Text>
                <Text style={styles.emptyTitle}>Chưa có thông báo mới</Text>
                <Text style={styles.emptyBody}>Thông báo chào mừng và bảo mật sẽ xuất hiện tại đây. Cursor được lưu để tiếp tục sau khi kết nối lại.</Text>
              </View>
            ) : stream.notifications.map((notification) => <NotificationCard key={notification.id} notification={notification} />)}
              </>
            ) : section === 'accounts' ? (
              <AccountProvisioning authApiUrl={config.authApiUrl} accessToken={accessToken} viewer={profile.viewer} />
            ) : (
              <AuthorizationWorkspace graphqlUrl={config.graphqlUrl} accessToken={accessToken} viewer={profile.viewer} />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function MobileRoot({ config }: { config: MobileConfig }) {
  const auth = useMobileAuth(config)
  if (auth.status === 'loading' || auth.status === 'authorizing') {
    return <StateScreen title="Đang xác thực…" detail="ViStay đang thiết lập phiên làm việc an toàn." />
  }
  if (auth.status !== 'authenticated' || !auth.accessToken) {
    return <LoginScreen error={auth.error} enabled={auth.readyToLogin} onLogin={() => void auth.login()} />
  }
  return <BackofficeScreen config={config} accessToken={auth.accessToken} onLogout={() => void auth.logout()} />
}

export default function App() {
  if ('error' in runtime) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.stateTitle}>Ứng dụng chưa được cấu hình.</Text>
          <Text accessibilityRole="alert" style={styles.errorBox}>{runtime.error}</Text>
          <Text style={styles.stateDetail}>Đối chiếu apps/mobile/.env.example rồi khởi động lại Expo.</Text>
        </View>
      </SafeAreaView>
    )
  }
  return <MobileRoot config={runtime.config} />
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f1ea' },
  page: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 70 },
  centered: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stateTitle: { color: '#17231d', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  stateDetail: { maxWidth: 310, color: '#68756e', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  loginPage: { flexGrow: 1, padding: 24, paddingTop: 34, paddingBottom: 44 },
  mark: { color: '#17231d', fontSize: 22, fontWeight: '800' },
  markDot: { color: '#89a91e' },
  loginHero: { marginTop: 70, marginBottom: 36 },
  eyebrow: { color: '#68756e', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  loginTitle: { marginTop: 13, color: '#17231d', fontSize: 46, lineHeight: 44, letterSpacing: -2.7, fontWeight: '700' },
  loginLead: { marginTop: 20, maxWidth: 370, color: '#68756e', fontSize: 14, lineHeight: 22 },
  securityCard: { padding: 23, borderRadius: 20, backgroundColor: '#142119' },
  securityIcon: { color: '#d9ff63', fontSize: 40, lineHeight: 42 },
  securityEyebrow: { marginTop: 24, color: '#94a39a', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  securityTitle: { marginTop: 8, color: 'white', fontSize: 25, fontWeight: '700', letterSpacing: -1 },
  securityBody: { marginTop: 12, color: '#aab8b0', fontSize: 12, lineHeight: 19 },
  errorBox: { marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: '#fff0ec', color: '#a74235', fontSize: 12, lineHeight: 18 },
  primary: { height: 56, marginTop: 14, borderRadius: 15, backgroundColor: '#17231d', alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: .6 },
  primaryText: { color: 'white', fontSize: 14, fontWeight: '700' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1 },
  title: { marginTop: 9, color: '#17231d', fontSize: 38, lineHeight: 37, letterSpacing: -2.2, fontWeight: '700' },
  logout: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, borderWidth: 1, borderColor: '#dcddd5', backgroundColor: '#fffef9' },
  logoutText: { color: '#17231d', fontSize: 12, fontWeight: '700' },
  tabs: { marginTop: 26, padding: 4, borderRadius: 14, backgroundColor: '#e6e5dd', flexDirection: 'row', gap: 4 },
  tab: { flex: 1, minHeight: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: '#17231d' },
  tabText: { color: '#68756e', fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: 'white' },
  inlineState: { minHeight: 82, marginTop: 32, padding: 17, borderRadius: 16, borderWidth: 1, borderColor: '#dcddd5', backgroundColor: '#fffef9', flexDirection: 'row', alignItems: 'center', gap: 12 },
  inlineError: { borderColor: '#e7c0b9', backgroundColor: '#fff7f4' },
  errorCopy: { flex: 1 },
  errorTitle: { color: '#17231d', fontSize: 13, fontWeight: '700' },
  errorDetail: { marginTop: 3, color: '#a74235', fontSize: 11, lineHeight: 16 },
  retry: { padding: 10, borderRadius: 9, backgroundColor: '#17231d' },
  retryText: { color: 'white', fontSize: 11, fontWeight: '700' },
  signalGrid: { marginTop: 34, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  signal: { width: '48%', minHeight: 140, padding: 16, borderRadius: 17, borderWidth: 1, borderColor: '#dcddd5', backgroundColor: '#fffef9' },
  signalLive: { backgroundColor: '#d9ff63', borderColor: '#d9ff63' },
  signalLabel: { color: '#68756e', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  signalNumber: { marginTop: 'auto', color: '#17231d', fontSize: 36, fontWeight: '700', letterSpacing: -1.8 },
  signalValue: { marginTop: 'auto', color: '#17231d', fontSize: 20, lineHeight: 23, fontWeight: '700', letterSpacing: -.8 },
  signalNote: { marginTop: 5, color: '#61766a', fontSize: 10 },
  card: { marginTop: 42, padding: 22, borderRadius: 19, borderWidth: 1, borderColor: '#dcddd5', backgroundColor: '#fffef9' },
  sectionTitle: { marginTop: 6, color: '#17231d', fontSize: 23, fontWeight: '700', letterSpacing: -.8 },
  profileRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e6e6df' },
  profileLabel: { color: '#68756e', fontSize: 10 },
  profileValue: { marginTop: 5, color: '#17231d', fontSize: 12, fontWeight: '600' },
  chips: { marginTop: 15, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 7, backgroundColor: '#edf1e9', color: '#425c4d', fontSize: 10 },
  sectionHeader: { marginTop: 43, marginBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  livePill: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 30, backgroundColor: '#e8e7e0', flexDirection: 'row', alignItems: 'center', gap: 6 },
  livePillActive: { backgroundColor: '#e4f1d8' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#65a275' },
  liveText: { color: '#52645a', fontSize: 9, fontWeight: '600' },
  streamError: { marginBottom: 10, padding: 13, borderRadius: 11, backgroundColor: '#fff0ec', flexDirection: 'row', alignItems: 'center', gap: 12 },
  errorAction: { color: '#a74235', fontSize: 11, fontWeight: '700' },
  empty: { minHeight: 230, padding: 26, borderRadius: 19, borderWidth: 1, borderColor: '#dcddd5', backgroundColor: '#fffef9', alignItems: 'center', justifyContent: 'center' },
  emptyIcon: { color: '#75847b', fontSize: 40 },
  emptyTitle: { marginTop: 12, color: '#17231d', fontSize: 16, fontWeight: '700' },
  emptyBody: { marginTop: 7, maxWidth: 310, color: '#68756e', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  notification: { paddingVertical: 18, borderTopWidth: 1, borderTopColor: '#dcddd5', flexDirection: 'row', gap: 12 },
  notificationIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#eef3e9', alignItems: 'center', justifyContent: 'center' },
  notificationIconSecurity: { backgroundColor: '#fff0ec' },
  notificationCopy: { flex: 1 },
  notificationMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  notificationCategory: { color: '#68756e', fontSize: 9, fontWeight: '700', letterSpacing: .8 },
  notificationTime: { color: '#879189', fontSize: 9 },
  notificationTitle: { marginTop: 5, color: '#17231d', fontSize: 14, fontWeight: '700' },
  notificationBody: { marginTop: 4, color: '#68756e', fontSize: 11, lineHeight: 17 },
  notificationChannels: { marginTop: 7, color: '#879189', fontSize: 9 },
})
