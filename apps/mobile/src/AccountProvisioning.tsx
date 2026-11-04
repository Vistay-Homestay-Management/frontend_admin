import { useState } from 'react'
import * as Crypto from 'expo-crypto'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  provisionBackofficeAccount,
  type BackofficeViewer,
  type ProvisionedBackofficeAccount,
} from '@vistay/admin-api-client'

interface AccountProvisioningProps {
  authApiUrl: string
  accessToken: string
  viewer: BackofficeViewer
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Không thể tạo tài khoản Backoffice.'
  return error.message === 'BACKOFFICE_ACCOUNT_ALREADY_EXISTS'
    ? 'Email này đã thuộc một tài khoản Backoffice.'
    : error.message
}

export function AccountProvisioning({ authApiUrl, accessToken, viewer }: AccountProvisioningProps) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState(false)
  const [account, setAccount] = useState<ProvisionedBackofficeAccount>()
  const canProvision = viewer.permissions.includes('account:provision')
  const valid = email.trim().length > 3 && fullName.trim().length > 0
    && temporaryPassword.length >= 12 && reason.trim().length >= 8

  async function submit() {
    if (!canProvision || !valid || saving) return
    setSaving(true)
    setMessage(undefined)
    setError(false)
    setAccount(undefined)
    try {
      const created = await provisionBackofficeAccount(
        authApiUrl,
        accessToken,
        Crypto.randomUUID(),
        { email: email.trim(), fullName: fullName.trim(), temporaryPassword, reason: reason.trim() },
      )
      setAccount(created)
      setTemporaryPassword('')
      setMessage('Tài khoản đã hoạt động và phải đổi mật khẩu ở lần đăng nhập đầu tiên.')
    } catch (failure) {
      setError(true)
      setMessage(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>CONTROLLED ONBOARDING</Text>
        <Text style={styles.title}>Cấp tài khoản.{`\n`}Không mở đăng ký.</Text>
        <Text style={styles.body}>Mỗi yêu cầu có người thực hiện, lý do, correlation ID và idempotency key. Mật khẩu chỉ được gửi tới Keycloak.</Text>
      </View>
      <View style={styles.form}>
        {!canProvision && <Text accessibilityRole="alert" style={styles.error}>Bạn thiếu quyền account:provision@ALL.</Text>}
        <TextInput autoCapitalize="words" maxLength={180} onChangeText={setFullName} placeholder="Họ và tên" placeholderTextColor="#879189" style={styles.input} value={fullName} />
        <TextInput autoCapitalize="none" inputMode="email" keyboardType="email-address" onChangeText={setEmail} placeholder="Email" placeholderTextColor="#879189" style={styles.input} value={email} />
        <TextInput autoCapitalize="none" maxLength={128} onChangeText={setTemporaryPassword} placeholder="Mật khẩu tạm thời · tối thiểu 12 ký tự" placeholderTextColor="#879189" secureTextEntry style={styles.input} value={temporaryPassword} />
        <TextInput maxLength={500} multiline onChangeText={setReason} placeholder="Lý do cấp tài khoản" placeholderTextColor="#879189" style={[styles.input, styles.textarea]} value={reason} />
        {message && <Text accessibilityRole={error ? 'alert' : undefined} style={error ? styles.error : styles.success}>{message}</Text>}
        {account && <View style={styles.account}><Text style={styles.accountEmail}>{account.email}</Text><Text selectable style={styles.accountId}>{account.id}</Text></View>}
        <Pressable disabled={!canProvision || !valid || saving} onPress={() => void submit()} style={({ pressed }) => [styles.button, (pressed || !canProvision || !valid || saving) && styles.disabled]}>
          <Text style={styles.buttonText}>{saving ? 'Đang tạo tài khoản…' : 'Tạo và kích hoạt'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { marginTop: 24, gap: 12 },
  hero: { padding: 22, borderRadius: 22, backgroundColor: '#d9ff63' },
  eyebrow: { color: '#68756e', fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 14, color: '#17231d', fontSize: 36, lineHeight: 35, letterSpacing: -1.9, fontWeight: '700' },
  body: { marginTop: 14, color: '#4f5f54', fontSize: 12, lineHeight: 19 },
  form: { padding: 20, borderRadius: 18, backgroundColor: '#17231d', gap: 10 },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: '#3b4b42', borderRadius: 12, backgroundColor: '#223128', color: 'white', fontSize: 12 },
  textarea: { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
  button: { minHeight: 50, borderRadius: 12, backgroundColor: '#fffef9', alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: .45 },
  buttonText: { color: '#17231d', fontSize: 12, fontWeight: '700' },
  error: { padding: 11, borderRadius: 10, backgroundColor: '#512b28', color: '#ffd6d0', fontSize: 11, lineHeight: 17 },
  success: { padding: 11, borderRadius: 10, backgroundColor: '#2b4935', color: '#dcf5d1', fontSize: 11, lineHeight: 17 },
  account: { padding: 12, borderWidth: 1, borderColor: '#3b4b42', borderRadius: 10 },
  accountEmail: { color: 'white', fontSize: 12, fontWeight: '700' },
  accountId: { marginTop: 4, color: '#9baaa1', fontSize: 9 },
})
