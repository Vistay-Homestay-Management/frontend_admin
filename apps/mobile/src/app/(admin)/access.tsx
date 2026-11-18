import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { AuthorizationWorkspace } from '../../AuthorizationWorkspace'
import { MobileIdentityAccountWorkspace } from '../../MobileIdentityAccountWorkspace'
import { MobileRolePolicyWorkspace } from '../../MobileRolePolicyWorkspace'
import { useAdmin } from '../../AdminContext'
import { Segmented, pageStyles } from '../../ui/primitives'
import { palette } from '../../ui/theme'

type AccessSection = 'customers' | 'admins' | 'hosts' | 'roles' | 'assignments'

export default function AccessScreen() {
  const { accessToken, config, viewer } = useAdmin()
  const [section, setSection] = useState<AccessSection>('customers')
  return <ScrollView style={pageStyles.scroll} contentContainerStyle={[pageStyles.content, styles.content]}>
    <View style={styles.command}><Text style={styles.title}>Tài khoản & phân quyền</Text><Text style={styles.meta}>Tài khoản, role và quyền</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}><Segmented options={[{ label: 'Khách hàng', value: 'customers' }, { label: 'Nhân viên', value: 'admins' }, { label: 'Chủ nhà', value: 'hosts' }, { label: 'Role & quyền', value: 'roles' }, { label: 'Gán quyền', value: 'assignments' }]} value={section} onChange={setSection} /></ScrollView>
    {section === 'customers' && <MobileIdentityAccountWorkspace accountType="CUSTOMER" accessToken={accessToken} authApiUrl={config.authApiUrl} graphqlUrl={config.graphqlUrl} viewer={viewer} />}
    {section === 'admins' && <MobileIdentityAccountWorkspace accountType="ADMIN" accessToken={accessToken} authApiUrl={config.authApiUrl} graphqlUrl={config.graphqlUrl} viewer={viewer} />}
    {section === 'hosts' && <MobileIdentityAccountWorkspace accountType="HOST" accessToken={accessToken} authApiUrl={config.authApiUrl} graphqlUrl={config.graphqlUrl} viewer={viewer} />}
    {section === 'roles' && <MobileRolePolicyWorkspace accessToken={accessToken} graphqlUrl={config.graphqlUrl} viewer={viewer} />}
    {section === 'assignments' && <View><AuthorizationWorkspace accessToken={accessToken} graphqlUrl={config.graphqlUrl} mode="assignments" viewer={viewer} /></View>}
  </ScrollView>
}

const styles = StyleSheet.create({
  content: { paddingTop: 14, gap: 12 },
  command: { minHeight: 42, justifyContent: 'center' },
  title: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  meta: { marginTop: 2, color: palette.muted, fontSize: 9 },
})
