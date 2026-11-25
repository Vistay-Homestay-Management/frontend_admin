import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { type OverviewDashboardData } from '@vistay/admin-api-client'
import { SectionHeading } from '../ui/primitives'
import { palette, radii } from '../ui/theme'
import { formatMobileRoute } from '../navigation/navigationIntent'

export interface OverviewAssetHealthProps {
  property?: OverviewDashboardData['property']
  loading: boolean
}

function formatCount(val: number | undefined, loading: boolean): string {
  if (loading && val === undefined) return '...'
  if (val === undefined) return '—'
  return new Intl.NumberFormat('vi-VN').format(val)
}

export function OverviewAssetHealth({ property, loading }: OverviewAssetHealthProps) {
  const router = useRouter()

  const navigateToProperties = (needsAttention?: boolean) => {
    const route = formatMobileRoute({
      destination: 'properties',
      section: 'all',
      filters: needsAttention ? { needsAttention: true } : undefined,
    })
    router.push({
      pathname: route.pathname,
      params: route.params,
    })
  }

  const active = formatCount(property?.activeProperties, loading)
  const maintenance = formatCount(property?.maintenanceProperties, loading)
  const attention = formatCount(property?.propertiesNeedingAttention, loading)
  const hasAttention = Boolean(property?.propertiesNeedingAttention && property.propertiesNeedingAttention > 0)

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <SectionHeading
          title="Sức khỏe tài sản"
          caption="Tình trạng vận hành của danh mục căn và căn cần xử lý."
        />
        <Pressable
          onPress={() => navigateToProperties(false)}
          style={({ pressed }) => [styles.viewAllBadge, pressed && styles.pressed]}
        >
          <Text style={styles.viewAllText}>Danh mục</Text>
          <Ionicons color={palette.evergreen} name="arrow-forward" size={12} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        <Pressable
          onPress={() => navigateToProperties(false)}
          style={({ pressed }) => [
            styles.card,
            styles.activeCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons color={palette.leaf} name="checkmark-circle-outline" size={18} />
            <Text style={styles.cardLabel}>Đang hoạt động</Text>
          </View>
          <Text style={styles.cardValue}>{active}</Text>
          <Text style={styles.cardHint}>Sẵn sàng đón khách</Text>
        </Pressable>

        <Pressable
          onPress={() => navigateToProperties(false)}
          style={({ pressed }) => [
            styles.card,
            styles.maintenanceCard,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons color="#3468C0" name="construct-outline" size={18} />
            <Text style={styles.cardLabel}>Đang bảo trì</Text>
          </View>
          <Text style={styles.cardValue}>{maintenance}</Text>
          <Text style={styles.cardHint}>Tạm ngưng đón khách</Text>
        </Pressable>

        <Pressable
          onPress={() => navigateToProperties(true)}
          style={({ pressed }) => [
            styles.card,
            styles.attentionCard,
            hasAttention && styles.attentionAlert,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.cardHeader}>
            <Ionicons
              color={hasAttention ? palette.warning : palette.muted}
              name="alert-circle-outline"
              size={18}
            />
            <Text
              style={[
                styles.cardLabel,
                hasAttention && { color: palette.warning },
              ]}
            >
              Cần xử lý
            </Text>
          </View>
          <Text
            style={[
              styles.cardValue,
              hasAttention && { color: palette.warning },
            ]}
          >
            {attention}
          </Text>
          <View style={styles.drillDownRow}>
            <Text
              style={[
                styles.drillDownText,
                hasAttention && { color: palette.warning },
              ]}
            >
              Xem chi tiết
            </Text>
            <Ionicons
              color={hasAttention ? palette.warning : palette.evergreen}
              name="chevron-forward"
              size={12}
            />
          </View>
        </Pressable>
      </View>
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
  grid: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    flex: 1,
    minHeight: 96,
    padding: 10,
    borderRadius: radii.medium,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    justifyContent: 'space-between',
  },
  activeCard: { borderTopWidth: 3, borderTopColor: palette.leaf },
  maintenanceCard: { borderTopWidth: 3, borderTopColor: '#3468C0' },
  attentionCard: { borderTopWidth: 3, borderTopColor: palette.muted },
  attentionAlert: {
    borderTopColor: palette.warning,
    backgroundColor: '#FFFBF5',
    borderColor: '#F3E4D0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardLabel: {
    color: palette.muted,
    fontSize: 9,
    fontWeight: '600',
  },
  cardValue: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  cardHint: {
    color: palette.muted,
    fontSize: 8,
  },
  drillDownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  drillDownText: {
    color: palette.evergreen,
    fontSize: 9,
    fontWeight: '700',
  },
  pressed: { opacity: 0.7 },
})
