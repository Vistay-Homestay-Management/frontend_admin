import { createContext, useContext, type PropsWithChildren } from 'react'
import * as WebBrowser from 'expo-web-browser'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { readMobileConfig, type MobileConfig } from './config'
import { useMobileAuth } from './useMobileAuth'
import { palette, radii } from './ui/theme'

WebBrowser.maybeCompleteAuthSession()

const runtime = readMobileConfig()
type AuthModel = ReturnType<typeof useMobileAuth>

interface MobileSessionValue {
  auth: AuthModel
  config: MobileConfig
}

const MobileSessionContext = createContext<MobileSessionValue | null>(null)

function ConfigurationError({ message }: { message: string }) {
  return <SafeAreaView style={styles.safe}><View style={styles.centered}>
    <Text style={styles.title}>Ứng dụng chưa được cấu hình</Text>
    <Text style={styles.detail}>{message}</Text>
    <Text style={styles.hint}>Đối chiếu apps/mobile/.env.example rồi khởi động lại Expo.</Text>
  </View></SafeAreaView>
}

function ConfiguredProvider({ config, children }: PropsWithChildren<{ config: MobileConfig }>) {
  const auth = useMobileAuth(config)
  return <MobileSessionContext.Provider value={{ auth, config }}>{children}</MobileSessionContext.Provider>
}

export function MobileSessionProvider({ children }: PropsWithChildren) {
  if ('error' in runtime) return <ConfigurationError message={runtime.error ?? 'Thiếu cấu hình runtime.'} />
  return <ConfiguredProvider config={runtime.config}>{children}</ConfiguredProvider>
}

export function useMobileSession(): MobileSessionValue {
  const value = useContext(MobileSessionContext)
  if (!value) throw new Error('MobileSessionProvider is missing')
  return value
}

export function LoadingScreen({ title = 'Đang đồng bộ phiên làm việc' }: { title?: string }) {
  return <SafeAreaView style={styles.safe}><View style={styles.centered}>
    <ActivityIndicator color={palette.evergreen} size="large" />
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.hint}>ViStay đang xác minh danh tính và quyền truy cập.</Text>
  </View></SafeAreaView>
}

export function LoginScreen() {
  const { auth } = useMobileSession()
  return <SafeAreaView style={styles.safe}>
    <View style={styles.login}>
      <View><Text style={styles.brand}>Vistay</Text><Text style={styles.kicker}>ADMIN MOBILE</Text></View>
      <View style={styles.loginCopy}>
        <Text style={styles.loginTitle}>Vận hành trong tầm tay.</Text>
        <Text style={styles.detail}>Một phiên đăng nhập cho cùng quyền, dữ liệu và luồng phê duyệt đang dùng trên web admin.</Text>
      </View>
      {auth.error && <Text accessibilityRole="alert" style={styles.error}>{auth.error}</Text>}
      <Pressable disabled={!auth.readyToLogin} onPress={() => void auth.login()} style={({ pressed }) => [styles.loginButton, (pressed || !auth.readyToLogin) && styles.pressed]}>
        <Text style={styles.loginButtonText}>{auth.readyToLogin ? 'Đăng nhập Backoffice' : 'Đang tải cấu hình OIDC'}</Text>
      </Pressable>
    </View>
  </SafeAreaView>
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  centered: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { color: palette.ink, fontSize: 22, lineHeight: 27, fontWeight: '700', textAlign: 'center' },
  detail: { color: palette.muted, fontSize: 13, lineHeight: 20 },
  hint: { maxWidth: 320, color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  login: { flex: 1, paddingHorizontal: 24, paddingVertical: 28, justifyContent: 'space-between' },
  brand: { color: palette.ink, fontSize: 23, fontWeight: '800', letterSpacing: -1 },
  kicker: { marginTop: 4, color: palette.leaf, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  loginCopy: { gap: 18 },
  loginTitle: { maxWidth: 360, color: palette.ink, fontSize: 48, lineHeight: 48, fontWeight: '700', letterSpacing: -2.5 },
  error: { padding: 12, borderRadius: radii.medium, backgroundColor: '#FCEAE6', color: palette.danger, fontSize: 12, lineHeight: 18 },
  loginButton: { minHeight: 56, borderRadius: radii.medium, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' },
  loginButtonText: { color: palette.white, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: .55 },
})
