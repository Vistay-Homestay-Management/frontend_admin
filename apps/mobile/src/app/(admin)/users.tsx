import { useCallback, useEffect, useState } from 'react'
import { fetch as expoFetch } from 'expo/fetch'
import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { fetchUserDirectory, type UserDirectoryAccountType, type UserDirectoryEntry } from '@vistay/admin-api-client'
import { useAdmin } from '../../AdminContext'
import { LoadState, PageHeading, Segmented, pageStyles } from '../../ui/primitives'
import { palette, radii } from '../../ui/theme'

const mobileFetch = expoFetch as typeof globalThis.fetch
const copy: Record<UserDirectoryAccountType, string> = { CUSTOMER: 'Khách hàng', ADMIN: 'Nhân viên', HOST: 'Chủ nhà' }

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase() || 'VS'
}

export default function UsersScreen() {
  const { accessToken, config, viewer } = useAdmin()
  const [type, setType] = useState<UserDirectoryAccountType>('CUSTOMER')
  const [search, setSearch] = useState('')
  const [nodes, setNodes] = useState<UserDirectoryEntry[]>([])
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string>()
  const allowed = viewer.permissions.includes('user:read')

  const load = useCallback(async (cursor: string | null = null, signal?: AbortSignal) => {
    if (!allowed) {
      setError('Tài khoản cần quyền user:read để xem danh bạ.')
      setLoading(false)
      return
    }
    if (cursor) setLoadingMore(true)
    else setLoading(true)
    setError(undefined)
    try {
      const page = await fetchUserDirectory(config.graphqlUrl, accessToken, { accountType: type, search, first: 25, after: cursor }, signal, mobileFetch)
      setNodes((current) => cursor ? [...current, ...page.nodes] : page.nodes)
      setTotal(page.totalCount)
      setNextCursor(page.nextCursor)
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'Không thể tải danh bạ.')
    } finally {
      if (!signal?.aborted) { setLoading(false); setLoadingMore(false) }
    }
  }, [accessToken, allowed, config.graphqlUrl, search, type])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => void load(null, controller.signal), 250)
    return () => { clearTimeout(timeout); controller.abort() }
  }, [load])

  return <ScrollView keyboardShouldPersistTaps="handled" style={pageStyles.scroll} contentContainerStyle={pageStyles.content}>
    <PageHeading eyebrow="Danh bạ" title="Người dùng" detail="Thông tin hồ sơ thuần túy; role và quyền được quản lý riêng tại khu Phân quyền." />
    <Segmented options={[{ label: 'Khách hàng', value: 'CUSTOMER' }, { label: 'Nhân viên', value: 'ADMIN' }, { label: 'Chủ nhà', value: 'HOST' }]} value={type} onChange={setType} />
    <View style={styles.search}>
      <Ionicons color={palette.muted} name="search-outline" size={18} />
      <TextInput autoCapitalize="none" onChangeText={setSearch} placeholder={`Tìm ${copy[type].toLowerCase()}…`} placeholderTextColor="#8A9A91" style={styles.input} value={search} />
    </View>
    <View style={styles.summary}><Text style={styles.summaryLabel}>{copy[type]}</Text><Text style={styles.summaryValue}>{new Intl.NumberFormat('vi-VN').format(total)}</Text></View>

    {loading ? <LoadState /> : error ? <LoadState error={error} retry={() => void load()} /> : <View style={styles.list}>
      {nodes.map((entry) => <View key={entry.profileId} style={styles.person}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(entry.displayName)}</Text></View>
        <View style={styles.personCopy}>
          <Text numberOfLines={1} style={styles.name}>{entry.displayName}</Text>
          <Text numberOfLines={1} style={styles.contact}>{entry.email ?? entry.contactPhone ?? 'Chưa có liên hệ'}</Text>
          <Text style={styles.reference}>{entry.referenceCode ?? entry.profileId}</Text>
        </View>
        <View style={[styles.status, entry.status !== 'ACTIVE' && styles.statusMuted]}><Text style={styles.statusText}>{entry.status}</Text></View>
      </View>)}
      {!nodes.length ? <View style={styles.empty}><Ionicons color={palette.sage} name="people-outline" size={30} /><Text style={styles.emptyText}>Không có hồ sơ phù hợp.</Text></View> : null}
      {nextCursor ? <Pressable disabled={loadingMore} onPress={() => void load(nextCursor)} style={styles.more}>
        {loadingMore ? <ActivityIndicator color={palette.white} size="small" /> : <Text style={styles.moreText}>Tải thêm</Text>}
      </Pressable> : null}
    </View>}
  </ScrollView>
}

const styles = StyleSheet.create({
  search: { minHeight: 46, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.surface },
  input: { flex: 1, color: palette.ink, fontSize: 12 },
  summary: { minHeight: 96, padding: 15, justifyContent: 'space-between', borderRadius: radii.medium, backgroundColor: '#E1ECD9' },
  summaryLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
  summaryValue: { color: palette.ink, fontSize: 29, fontWeight: '700', letterSpacing: -1 },
  list: { borderWidth: 1, borderColor: palette.line, borderRadius: radii.medium, backgroundColor: palette.surface, overflow: 'hidden' },
  person: { minHeight: 79, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  avatar: { width: 39, height: 39, borderRadius: 20, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.white, fontSize: 10, fontWeight: '700' },
  personCopy: { flex: 1, gap: 3 },
  name: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  contact: { color: palette.muted, fontSize: 10 },
  reference: { color: palette.sage, fontSize: 8 },
  status: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: radii.small, backgroundColor: '#E2F0E5' },
  statusMuted: { backgroundColor: palette.surfaceMuted },
  statusText: { color: palette.leaf, fontSize: 7, fontWeight: '700' },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: palette.muted, fontSize: 11 },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.evergreen },
  moreText: { color: palette.white, fontSize: 11, fontWeight: '700' },
})
