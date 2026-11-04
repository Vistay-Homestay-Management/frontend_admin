import { useState } from 'react'
import { fetch as expoFetch } from 'expo/fetch'
import * as Crypto from 'expo-crypto'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  updateMyProfile,
  type BackofficeViewer,
} from '@vistay/admin-api-client'

const mobileFetch = expoFetch as typeof globalThis.fetch

interface PersonalProfileEditorProps {
  graphqlUrl: string
  accessToken: string
  viewer: BackofficeViewer
  onUpdated: () => void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Đã có lỗi không xác định'
}

export function PersonalProfileEditor({ graphqlUrl, accessToken, viewer, onUpdated }: PersonalProfileEditorProps) {
  const [displayName, setDisplayName] = useState(viewer.displayName)
  const [contactPhone, setContactPhone] = useState(viewer.contactPhone ?? '')
  const [avatarMediaId, setAvatarMediaId] = useState(viewer.avatarMediaId ?? '')
  const [reason, setReason] = useState('Cập nhật hồ sơ cá nhân')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const canUpdate = viewer.permissions.includes('profile:update')

  async function save() {
    if (!canUpdate || saving || displayName.trim().length < 2 || reason.trim().length < 8) return
    setSaving(true)
    setError(undefined)
    setSuccess(undefined)
    try {
      const result = await updateMyProfile(graphqlUrl, accessToken, {
        displayName: displayName.trim(),
        contactPhone: contactPhone.trim() || null,
        avatarMediaId: avatarMediaId.trim() || null,
        expectedVersion: viewer.profileVersion,
        reason: reason.trim(),
        idempotencyKey: Crypto.randomUUID(),
      }, mobileFetch)
      setSuccess(`Đã lưu phiên bản ${result.version}.`)
      onUpdated()
    } catch (cause) {
      setError(message(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>PERSONAL PROFILE</Text>
      <Text style={styles.title}>Hồ sơ đang hoạt động</Text>
      <Text style={styles.label}>Họ và tên</Text>
      <TextInput editable={canUpdate && !saving} maxLength={120} value={displayName} onChangeText={setDisplayName} style={styles.input} />
      <Text style={styles.label}>Email xác thực</Text>
      <TextInput editable={false} value={viewer.email} style={[styles.input, styles.readonly]} />
      <Text style={styles.label}>Số điện thoại E.164</Text>
      <TextInput editable={canUpdate && !saving} keyboardType="phone-pad" placeholder="+84901234567" value={contactPhone} onChangeText={setContactPhone} style={styles.input} />
      <Text style={styles.label}>Avatar media ID</Text>
      <TextInput editable={canUpdate && !saving} autoCapitalize="none" placeholder="UUID tham chiếu" value={avatarMediaId} onChangeText={setAvatarMediaId} style={styles.input} />
      <Text style={styles.label}>Lý do thay đổi</Text>
      <TextInput editable={canUpdate && !saving} multiline maxLength={500} value={reason} onChangeText={setReason} style={[styles.input, styles.reason]} />
      <View style={styles.meta}>
        <Text selectable style={styles.metaText}>Profile {viewer.profileId}</Text>
        <Text style={styles.metaText}>Phiên bản {viewer.profileVersion}</Text>
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {success && <Text accessibilityRole="alert" style={styles.success}>{success}</Text>}
      {canUpdate ? (
        <Pressable
          accessibilityRole="button"
          disabled={saving || displayName.trim().length < 2 || reason.trim().length < 8}
          onPress={() => void save()}
          style={({ pressed }) => [styles.button, (pressed || saving) && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>{saving ? 'Đang lưu…' : 'Lưu hồ sơ'}</Text>
        </Pressable>
      ) : <Text style={styles.readonlyNotice}>Tài khoản chưa có quyền profile:update@SELF.</Text>}
      <View style={styles.chips}>{viewer.permissions.map((permission) => <Text key={permission} style={styles.chip}>{permission}</Text>)}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginTop: 42, padding: 22, borderRadius: 19, borderWidth: 1, borderColor: '#dcddd5', backgroundColor: '#fffef9' },
  eyebrow: { color: '#68756e', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  title: { marginTop: 6, marginBottom: 18, color: '#17231d', fontSize: 23, fontWeight: '700', letterSpacing: -.8 },
  label: { marginTop: 12, marginBottom: 6, color: '#68756e', fontSize: 10, fontWeight: '600' },
  input: { minHeight: 45, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#dcddd5', backgroundColor: 'white', color: '#17231d', fontSize: 12 },
  readonly: { backgroundColor: '#efeee8', color: '#68756e' },
  reason: { minHeight: 76, textAlignVertical: 'top' },
  meta: { marginTop: 13, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  metaText: { color: '#68756e', fontSize: 9 },
  error: { marginTop: 12, padding: 11, borderRadius: 9, backgroundColor: '#fff0ec', color: '#a74235', fontSize: 11 },
  success: { marginTop: 12, padding: 11, borderRadius: 9, backgroundColor: '#e9f4e1', color: '#3f684d', fontSize: 11 },
  button: { minHeight: 49, marginTop: 14, borderRadius: 12, backgroundColor: '#17231d', alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: .55 },
  buttonText: { color: 'white', fontSize: 12, fontWeight: '700' },
  readonlyNotice: { marginTop: 14, color: '#68756e', fontSize: 10 },
  chips: { marginTop: 15, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 7, backgroundColor: '#edf1e9', color: '#425c4d', fontSize: 10 },
})
