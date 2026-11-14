import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { AccountProvisioning } from '../../AccountProvisioning'
import { AccountSecurityConsole } from '../../AccountSecurityConsole'
import { NotificationPreferences } from '../../NotificationPreferences'
import { PersonalProfileEditor } from '../../PersonalProfileEditor'
import { SecuritySessions } from '../../SecuritySessions'
import { useAdmin } from '../../AdminContext'
import { useMobileSession } from '../../MobileSession'
import { PageHeading, SectionHeading, pageStyles } from '../../ui/primitives'
import { palette, radii } from '../../ui/theme'

export default function SettingsScreen() {
  const { accessToken, config, retryViewer, viewer } = useAdmin()
  const { auth } = useMobileSession()
  const logout = () => void auth.logout()
  return <ScrollView keyboardShouldPersistTaps="handled" style={pageStyles.scroll} contentContainerStyle={pageStyles.content}>
    <PageHeading eyebrow="Cá nhân" title="Cài đặt" detail="Hồ sơ, thông báo và bảo mật tài khoản quản trị hiện tại." />
    <View style={styles.group}>
      <SectionHeading title="Hồ sơ" />
      <PersonalProfileEditor accessToken={accessToken} graphqlUrl={config.graphqlUrl} onUpdated={retryViewer} viewer={viewer} />
    </View>
    <View style={styles.group}>
      <SectionHeading title="Thông báo" />
      <NotificationPreferences accessToken={accessToken} graphqlUrl={config.graphqlUrl} />
    </View>
    <View style={styles.group}>
      <SectionHeading title="Phiên đăng nhập" />
      <SecuritySessions accessToken={accessToken} authApiUrl={config.authApiUrl} onCurrentRevoked={logout} viewer={viewer} />
    </View>
    {viewer.permissions.includes('account:provision') ? <View style={styles.group}>
      <SectionHeading title="Cấp tài khoản" />
      <AccountProvisioning accessToken={accessToken} authApiUrl={config.authApiUrl} viewer={viewer} />
    </View> : null}
    {viewer.permissions.some((permission) => permission.startsWith('account:')) ? <View style={styles.group}>
      <SectionHeading title="Bảo mật tài khoản" />
      <AccountSecurityConsole accessToken={accessToken} authApiUrl={config.authApiUrl} viewer={viewer} />
    </View> : null}
    <Pressable onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Đăng xuất</Text></Pressable>
  </ScrollView>
}

const styles = StyleSheet.create({
  group: { gap: 9 },
  logout: { minHeight: 46, marginTop: 5, borderWidth: 1, borderColor: '#D7AAA3', borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7F5' },
  logoutText: { color: palette.danger, fontSize: 11, fontWeight: '700' },
})
