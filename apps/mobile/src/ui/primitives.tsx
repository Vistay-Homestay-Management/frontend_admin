import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { palette, radii } from './theme'

export function PageHeading({ eyebrow, title, detail, action }: {
  eyebrow?: string
  title: string
  detail?: string
  action?: ReactNode
}) {
  return <View style={styles.heading}>
    <View style={styles.headingCopy}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
    {action}
  </View>
}

export function SectionHeading({ title, caption }: { title: string; caption?: string }) {
  return <View style={styles.sectionHeading}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
  </View>
}

export function Surface({ children }: { children: ReactNode }) {
  return <View style={styles.surface}>{children}</View>
}

export function Metric({ label, value, tone = 'plain', icon }: {
  label: string
  value: string
  tone?: 'plain' | 'green' | 'dark'
  icon?: keyof typeof Ionicons.glyphMap
}) {
  return <View style={[styles.metric, tone === 'green' && styles.metricGreen, tone === 'dark' && styles.metricDark]}>
    <View style={styles.metricTop}>
      <Text style={[styles.metricLabel, tone === 'dark' && styles.metricTextLight]}>{label}</Text>
      {icon ? <Ionicons color={tone === 'dark' ? palette.sage : palette.leaf} name={icon} size={17} /> : null}
    </View>
    <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.metricValue, tone === 'dark' && styles.metricTextLight]}>{value}</Text>
  </View>
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { label: string; value: T }[]
  value: T
  onChange: (value: T) => void
}) {
  return <View accessibilityRole="tablist" style={styles.segmented}>
    {options.map((option) => {
      const selected = option.value === value
      return <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        key={option.value}
        onPress={() => onChange(option.value)}
        style={[styles.segment, selected && styles.segmentActive]}
      >
        <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{option.label}</Text>
      </Pressable>
    })}
  </View>
}

export function LoadState({ error, retry }: { error?: string; retry?: () => void }) {
  if (!error) return <View style={styles.loadState}><ActivityIndicator color={palette.evergreen} /><Text style={styles.loadText}>Đang đồng bộ dữ liệu…</Text></View>
  return <View style={styles.errorState}>
    <Ionicons color={palette.danger} name="alert-circle-outline" size={22} />
    <View style={styles.errorCopy}><Text style={styles.errorTitle}>Không thể tải dữ liệu</Text><Text style={styles.errorBody}>{error}</Text></View>
    {retry ? <Pressable onPress={retry} style={styles.retry}><Text style={styles.retryText}>Thử lại</Text></Pressable> : null}
  </View>
}

export const pageStyles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 48, gap: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  half: { width: '48.4%' },
})

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  headingCopy: { flex: 1, gap: 5 },
  eyebrow: { color: palette.leaf, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { maxWidth: 320, color: palette.ink, fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -1.1 },
  detail: { maxWidth: 410, color: palette.muted, fontSize: 12, lineHeight: 18 },
  sectionHeading: { gap: 3 },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: '700', letterSpacing: -.3 },
  sectionCaption: { color: palette.muted, fontSize: 10, lineHeight: 15 },
  surface: { padding: 14, gap: 12, borderWidth: 1, borderColor: palette.line, borderRadius: radii.medium, backgroundColor: palette.surface },
  metric: { minHeight: 110, padding: 13, justifyContent: 'space-between', borderWidth: 1, borderColor: palette.line, borderRadius: radii.medium, backgroundColor: palette.surface },
  metricGreen: { borderColor: '#CFE0D2', backgroundColor: '#E7F0E7' },
  metricDark: { borderColor: palette.ink, backgroundColor: palette.ink },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  metricLabel: { flex: 1, color: palette.muted, fontSize: 10, lineHeight: 14, fontWeight: '600' },
  metricValue: { color: palette.ink, fontSize: 23, fontWeight: '700', letterSpacing: -.8 },
  metricTextLight: { color: palette.white },
  segmented: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: radii.medium, backgroundColor: '#E7ECE6' },
  segment: { flex: 1, minHeight: 38, paddingHorizontal: 10, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: palette.ink },
  segmentText: { color: palette.muted, fontSize: 11, fontWeight: '600' },
  segmentTextActive: { color: palette.white, fontWeight: '700' },
  loadState: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadText: { color: palette.muted, fontSize: 11 },
  errorState: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E6CFCB', borderRadius: radii.medium, backgroundColor: '#FFF7F5' },
  errorCopy: { flex: 1, gap: 2 },
  errorTitle: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  errorBody: { color: palette.muted, fontSize: 10, lineHeight: 15 },
  retry: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radii.small, backgroundColor: palette.ink },
  retryText: { color: palette.white, fontSize: 10, fontWeight: '700' },
})
