import { useCallback, useEffect, useState } from 'react'
import * as Crypto from 'expo-crypto'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  fetchBackofficeSessions,
  revokeBackofficeSession,
  type BackofficeSession,
  type BackofficeViewer,
} from '@vistay/admin-api-client'

interface SecuritySessionsProps {
  authApiUrl: string
  accessToken: string
  viewer: BackofficeViewer
  onCurrentRevoked: () => void
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function SecuritySessions({
  authApiUrl,
  accessToken,
  viewer,
  onCurrentRevoked,
}: SecuritySessionsProps) {
  const [sessions, setSessions] = useState<BackofficeSession[]>([])
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string>()
  const [error, setError] = useState<string>()

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(undefined)
    try {
      setSessions(await fetchBackofficeSessions(
        authApiUrl, accessToken, viewer.accountId, signal,
      ))
    } catch (failure) {
      if (!signal?.aborted) {
        setError(failure instanceof Error ? failure.message : 'Không thể tải phiên hoạt động.')
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accessToken, authApiUrl, viewer.accountId])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => load(controller.signal))
    return () => controller.abort()
  }, [load])

  async function revoke(session: BackofficeSession) {
    if (reason.trim().length < 8 || revoking) return
    setRevoking(session.id)
    setError(undefined)
    try {
      await revokeBackofficeSession(
        authApiUrl, accessToken, viewer.accountId, session.id,
        reason.trim(), Crypto.randomUUID(),
      )
      setSessions((current) => current.filter((item) => item.id !== session.id))
      setReason('')
      if (session.current) onCurrentRevoked()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể thu hồi phiên.')
    } finally {
      setRevoking(undefined)
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>KEYCLOAK SESSION CONTROL</Text>
          <Text style={styles.title}>Thiết bị đang đăng nhập</Text>
        </View>
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load()} style={styles.refresh}>
          <Text style={styles.refreshText}>{loading ? 'Đang tải…' : 'Tải lại'}</Text>
        </Pressable>
      </View>
      <Text style={styles.body}>Refresh token được xoay vòng. Khôi phục mật khẩu nằm tại màn hình đăng nhập Keycloak.</Text>
      <TextInput
        maxLength={500}
        multiline
        onChangeText={setReason}
        placeholder="Lý do thu hồi phiên · tối thiểu 8 ký tự"
        placeholderTextColor="#879189"
        style={styles.input}
        value={reason}
      />
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!loading && sessions.length === 0 && <Text style={styles.empty}>Không còn phiên Keycloak đang hoạt động.</Text>}
      {sessions.map((session) => (
        <View key={session.id} style={[styles.session, session.current && styles.current]}>
          <Text style={styles.badge}>{session.current ? 'PHIÊN HIỆN TẠI' : 'PHIÊN KHÁC'}</Text>
          <Text style={styles.ip}>{session.ipAddress || 'Không rõ địa chỉ IP'}</Text>
          <Text style={styles.meta}>Truy cập cuối {dateTime(session.lastAccessAt)}</Text>
          <Text style={styles.meta}>{Object.values(session.clients).join(' · ') || 'Backoffice client'}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={reason.trim().length < 8 || Boolean(revoking)}
            onPress={() => void revoke(session)}
            style={({ pressed }) => [styles.button, (pressed || reason.trim().length < 8 || Boolean(revoking)) && styles.disabled]}
          >
            <Text style={styles.buttonText}>{revoking === session.id ? 'Đang thu hồi…' : 'Thu hồi phiên'}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { marginTop: 18, padding: 20, borderRadius: 19, backgroundColor: '#17231d', gap: 11 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  headingCopy: { flex: 1 },
  eyebrow: { color: '#9baaa1', fontSize: 9, fontWeight: '700', letterSpacing: 1.1 },
  title: { marginTop: 7, color: 'white', fontSize: 23, fontWeight: '700', letterSpacing: -.8 },
  body: { color: '#a9b5ae', fontSize: 11, lineHeight: 17 },
  refresh: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#3b4b42', borderRadius: 9 },
  refreshText: { color: 'white', fontSize: 10, fontWeight: '700' },
  input: { minHeight: 70, padding: 12, borderWidth: 1, borderColor: '#3b4b42', borderRadius: 11, backgroundColor: '#223128', color: 'white', fontSize: 11, textAlignVertical: 'top' },
  error: { padding: 10, borderRadius: 9, backgroundColor: '#512b28', color: '#ffd6d0', fontSize: 10, lineHeight: 15 },
  empty: { color: '#9baaa1', fontSize: 11 },
  session: { padding: 14, borderWidth: 1, borderColor: '#3b4b42', borderRadius: 12, gap: 4 },
  current: { borderColor: '#8daa39', backgroundColor: '#223427' },
  badge: { color: '#a9b5ae', fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  ip: { marginTop: 5, color: 'white', fontSize: 14, fontWeight: '700' },
  meta: { color: '#9baaa1', fontSize: 9, lineHeight: 14 },
  button: { minHeight: 42, marginTop: 8, borderRadius: 10, backgroundColor: '#d9ff63', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: .4 },
  buttonText: { color: '#17231d', fontSize: 11, fontWeight: '700' },
})
