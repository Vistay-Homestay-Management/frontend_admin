import { useCallback, useEffect, useState } from 'react'
import { fetch as expoFetch } from 'expo/fetch'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { fetchPropertyAdminWorkspace, type PropertyAdminWorkspace } from '@vistay/admin-api-client'
import { useAdmin } from '../../AdminContext'
import { LoadState, Metric, PageHeading, SectionHeading, Surface, pageStyles } from '../../ui/primitives'
import { palette } from '../../ui/theme'

const mobileFetch = expoFetch as typeof globalThis.fetch

export default function PropertiesScreen() {
  const { accessToken, config, viewer } = useAdmin()
  const [data, setData] = useState<PropertyAdminWorkspace>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const canRead = viewer.permissions.includes('property:read') || viewer.permissions.includes('property-attribute:read')

  const load = useCallback(async () => {
    if (!canRead) {
      setError('Tài khoản chưa có quyền đọc tài sản hoặc tiêu chí căn.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      setData(await fetchPropertyAdminWorkspace(config.graphqlUrl, accessToken, mobileFetch))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải dữ liệu căn hộ.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, canRead, config.graphqlUrl])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  return <ScrollView
    refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={() => void load()} tintColor={palette.evergreen} />}
    style={pageStyles.scroll}
    contentContainerStyle={pageStyles.content}
  >
    <PageHeading eyebrow="Danh mục" title="Căn hộ" detail="Tình trạng vận hành và các tiêu chí động đang áp dụng cho căn." />
    {loading && !data ? <LoadState /> : error ? <LoadState error={error} retry={() => void load()} /> : data ? <>
      <View style={pageStyles.grid}>
        <View style={pageStyles.half}><Metric icon="business-outline" label="Đang hoạt động" value={String(data.summary.activeProperties)} tone="dark" /></View>
        <View style={pageStyles.half}><Metric icon="construct-outline" label="Đang bảo trì" value={String(data.summary.maintenanceProperties)} /></View>
        <View style={pageStyles.half}><Metric icon="warning-outline" label="Cần xử lý" value={String(data.summary.propertiesNeedingAttention)} tone="green" /></View>
        <View style={pageStyles.half}><Metric icon="options-outline" label="Tiêu chí động" value={String(data.attributes.length)} /></View>
      </View>
      <View style={styles.section}>
        <SectionHeading title="Tiêu chí căn" caption="Catalog cấu hình chung; không cố định thêm trường riêng trong ứng dụng mobile." />
        <Surface>
          {data.attributes.length ? data.attributes.map((attribute) => <View key={attribute.id} style={styles.attribute}>
            <View style={styles.attributeCopy}>
              <Text style={styles.attributeLabel}>{attribute.label}</Text>
              <Text style={styles.attributeMeta}>{attribute.groupCode} · {attribute.dataType}{attribute.unitLabel ? ` · ${attribute.unitLabel}` : ''}</Text>
            </View>
            <View style={[styles.status, attribute.status === 'ACTIVE' && styles.statusActive]}><Text style={[styles.statusText, attribute.status === 'ACTIVE' && styles.statusTextActive]}>{attribute.status}</Text></View>
          </View>) : <Text style={styles.empty}>Chưa có tiêu chí động nào.</Text>}
        </Surface>
      </View>
    </> : null}
  </ScrollView>
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  attribute: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  attributeCopy: { flex: 1, gap: 3 },
  attributeLabel: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  attributeMeta: { color: palette.muted, fontSize: 9, textTransform: 'uppercase' },
  status: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, backgroundColor: palette.surfaceMuted },
  statusActive: { backgroundColor: '#E2F0E5' },
  statusText: { color: palette.muted, fontSize: 8, fontWeight: '700' },
  statusTextActive: { color: palette.leaf },
  empty: { paddingVertical: 20, color: palette.muted, fontSize: 11, textAlign: 'center' },
})
