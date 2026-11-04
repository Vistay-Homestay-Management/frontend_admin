import { useState } from 'react'
import { fetch as expoFetch } from 'expo/fetch'
import * as Crypto from 'expo-crypto'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  changeAccountLifecycle, fetchAccountSecurity, fetchAccountSecurityEvents,
  type AccountLifecycleAction, type AccountLifecycleEvent, type AccountSecurityView,
  type BackofficeViewer,
} from '@vistay/admin-api-client'

const mobileFetch = expoFetch as typeof globalThis.fetch
interface Props { authApiUrl: string; accessToken: string; viewer: BackofficeViewer }

export function AccountSecurityConsole({ authApiUrl, accessToken, viewer }: Props) {
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('Điều tra và xử lý sự kiện bảo mật')
  const [account, setAccount] = useState<AccountSecurityView>()
  const [events, setEvents] = useState<AccountLifecycleEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function load() {
    if (!target.trim()) return
    setBusy(true); setError(undefined)
    try {
      const [state, audit] = await Promise.all([
        fetchAccountSecurity(authApiUrl, accessToken, target.trim(), mobileFetch),
        viewer.permissions.includes('audit:read')
          ? fetchAccountSecurityEvents(authApiUrl, accessToken, target.trim(), mobileFetch) : Promise.resolve([]),
      ])
      setAccount(state); setEvents(audit)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu') }
    finally { setBusy(false) }
  }

  async function change(action: AccountLifecycleAction) {
    if (!account || busy) return
    setBusy(true); setError(undefined)
    try {
      await changeAccountLifecycle(authApiUrl, accessToken, account.account.id, action,
        account.account.version, reason.trim(), Crypto.randomUUID(), mobileFetch)
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể cập nhật') }
    finally { setBusy(false) }
  }

  if (!viewer.permissions.includes('account:read')) return null
  return <View style={styles.card}>
    <Text style={styles.eyebrow}>IDENTITY SECURITY</Text><Text style={styles.title}>Khóa, phục hồi & điều tra</Text>
    <TextInput autoCapitalize="none" placeholder="Target account UUID" value={target} onChangeText={setTarget} style={styles.input} />
    <Pressable onPress={() => void load()} disabled={busy} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Đang xử lý…' : 'Tải trạng thái'}</Text></Pressable>
    {error && <Text style={styles.error}>{error}</Text>}
    {account && <>
      <View style={styles.state}><Text style={styles.stateTitle}>{account.account.status} · v{account.account.version}</Text><Text style={styles.note}>{account.account.email}</Text></View>
      <View style={styles.state}><Text style={styles.stateTitle}>{account.bruteForce.failureCount} lỗi đăng nhập</Text><Text style={styles.note}>{account.bruteForce.temporarilyLocked ? 'Keycloak đang tạm khóa' : 'Không bị brute-force lock'} · {account.bruteForce.lastFailureIp ?? 'Không có IP'}</Text></View>
      <TextInput multiline value={reason} onChangeText={setReason} style={[styles.input, styles.reason]} />
      <View style={styles.actions}>
        {viewer.permissions.includes('account:suspend') && <><Action label="Khóa" disabled={busy || account.account.status !== 'ACTIVE'} onPress={() => void change('LOCK')} /><Action label="Vô hiệu" disabled={busy || account.account.status === 'DISABLED'} onPress={() => void change('DISABLE')} /></>}
        {viewer.permissions.includes('account:unlock') && <Action label="Phục hồi" disabled={busy || !['LOCKED', 'DISABLED'].includes(account.account.status)} onPress={() => void change('RECOVER')} />}
      </View>
      {events.map((item) => <View key={item.idempotencyKey} style={styles.event}><Text style={styles.eventTitle}>{item.action}: {item.previousStatus} → {item.resultingStatus}</Text><Text style={styles.note}>{item.reason}</Text></View>)}
    </>}
  </View>
}

function Action({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.action, disabled && styles.disabled]}><Text style={styles.actionText}>{label}</Text></Pressable>
}

const styles = StyleSheet.create({
  card: { marginTop: 18, padding: 22, borderRadius: 19, backgroundColor: '#18261e' },
  eyebrow: { color: '#96a59c', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 8, marginBottom: 18, color: 'white', fontSize: 24, fontWeight: '700' },
  input: { minHeight: 46, padding: 12, borderRadius: 10, backgroundColor: '#223128', color: 'white' },
  reason: { minHeight: 78, marginTop: 10, textAlignVertical: 'top' },
  primary: { marginTop: 10, minHeight: 48, borderRadius: 11, backgroundColor: '#d9ff63', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#17231d', fontWeight: '700' },
  error: { marginTop: 10, padding: 10, borderRadius: 9, backgroundColor: '#512b28', color: '#ffd6d0' },
  state: { marginTop: 10, padding: 13, borderWidth: 1, borderColor: '#34443a', borderRadius: 10 },
  stateTitle: { color: 'white', fontWeight: '700' }, note: { marginTop: 4, color: '#a9b5ae', fontSize: 10 },
  actions: { marginTop: 10, flexDirection: 'row', gap: 7 }, action: { flex: 1, padding: 11, borderRadius: 9, backgroundColor: '#d9ff63', alignItems: 'center' },
  disabled: { opacity: .3 }, actionText: { color: '#17231d', fontSize: 10, fontWeight: '700' },
  event: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#34443a' }, eventTitle: { color: 'white', fontSize: 11, fontWeight: '700' },
})
