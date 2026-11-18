import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { AuthorizationWorkspace } from '../../AuthorizationWorkspace'
import { MobileIdentityAccountWorkspace } from '../../MobileIdentityAccountWorkspace'
import { MobileRolePolicyWorkspace } from '../../MobileRolePolicyWorkspace'
import { useAdmin } from '../../AdminContext'
import { Segmented, pageStyles, useWorkspaceScrollGate } from '../../ui/primitives'
import { palette } from '../../ui/theme'

type AccessSection = 'customers' | 'admins' | 'hosts' | 'roles' | 'assignments'

export default function AccessScreen() {
  const { accessToken, config, viewer } = useAdmin()
  const [section, setSection] = useState<AccessSection>('customers')
  const [refreshEpoch, setRefreshEpoch] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [viewportHeight, setViewportHeight] = useState(0)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scrollGate = useWorkspaceScrollGate()
  const refreshActiveWorkspace = useCallback(() => {
    setRefreshing(true)
    setRefreshEpoch((current) => current + 1)
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => setRefreshing(false), 650)
  }, [])
  useEffect(() => () => { if (refreshTimer.current) clearTimeout(refreshTimer.current) }, [])

  return <ScrollView
    refreshControl={<RefreshControl enabled={scrollGate.refreshEnabled} refreshing={refreshing} onRefresh={refreshActiveWorkspace} tintColor={palette.evergreen} />}
    style={pageStyles.scroll}
    contentContainerStyle={[styles.content, viewportHeight > 0 && { minHeight: viewportHeight + 56 }]}
    stickyHeaderIndices={[1]}
    onLayout={(event) => setViewportHeight(Math.round(event.nativeEvent.layout.height))}
    onScroll={scrollGate.onScroll}
    onTouchStart={scrollGate.onTouchStart}
    onScrollBeginDrag={scrollGate.onScrollBeginDrag}
    onScrollEndDrag={scrollGate.onScrollEndDrag}
    onMomentumScrollEnd={scrollGate.onMomentumScrollEnd}
    scrollEventThrottle={16}
  >
    <View style={styles.command}><Text style={styles.title}>Tài khoản & phân quyền</Text><Text style={styles.meta}>Tài khoản, role và quyền</Text></View>
    <View style={styles.stickyWorkspace}><ScrollView horizontal showsHorizontalScrollIndicator={false}><Segmented options={[{ label: 'Khách hàng', value: 'customers' }, { label: 'Nhân viên', value: 'admins' }, { label: 'Chủ nhà', value: 'hosts' }, { label: 'Role & quyền', value: 'roles' }, { label: 'Gán quyền', value: 'assignments' }]} value={section} onChange={setSection} /></ScrollView></View>
    <View key={`${section}-${refreshEpoch}`} style={styles.workspace}>
      {section === 'customers' && <MobileIdentityAccountWorkspace accountType="CUSTOMER" accessToken={accessToken} authApiUrl={config.authApiUrl} graphqlUrl={config.graphqlUrl} viewer={viewer} />}
      {section === 'admins' && <MobileIdentityAccountWorkspace accountType="ADMIN" accessToken={accessToken} authApiUrl={config.authApiUrl} graphqlUrl={config.graphqlUrl} viewer={viewer} />}
      {section === 'hosts' && <MobileIdentityAccountWorkspace accountType="HOST" accessToken={accessToken} authApiUrl={config.authApiUrl} graphqlUrl={config.graphqlUrl} viewer={viewer} />}
      {section === 'roles' && <MobileRolePolicyWorkspace accessToken={accessToken} graphqlUrl={config.graphqlUrl} viewer={viewer} />}
      {section === 'assignments' && <AuthorizationWorkspace accessToken={accessToken} graphqlUrl={config.graphqlUrl} mode="assignments" viewer={viewer} />}
    </View>
  </ScrollView>
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 48 },
  stickyWorkspace: { zIndex: 4, paddingTop: 12, paddingBottom: 12, backgroundColor: palette.background },
  workspace: { flexGrow: 1 },
  command: { minHeight: 42, justifyContent: 'center' },
  title: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  meta: { marginTop: 2, color: palette.muted, fontSize: 9 },
})
