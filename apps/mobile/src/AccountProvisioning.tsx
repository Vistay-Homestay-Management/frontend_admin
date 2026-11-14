import { useState } from 'react'
import * as Crypto from 'expo-crypto'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  inviteBackofficeAccount,
  provisionBackofficeAccount,
  type BackofficeViewer,
  type InvitedBackofficeAccount,
  type ProvisionedBackofficeAccount,
} from '@vistay/admin-api-client'

interface AccountProvisioningProps {
  authApiUrl: string
  accessToken: string
  viewer: BackofficeViewer
}

type OnboardingMode = 'DIRECT' | 'INVITATION'

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Không thể tạo tài khoản nhân viên.'
  if (error.message.includes('BACKOFFICE_ACCOUNT_ALREADY_EXISTS')) {
    return 'Email này đã thuộc một tài khoản Backoffice.'
  }
  if (error.message.includes('BACKOFFICE_INVITATION_DISPATCH_UNAVAILABLE')) {
    return 'Đã tạo hồ sơ nhưng chưa gửi được email. Gửi lại với cùng yêu cầu khi dịch vụ mail hoạt động.'
  }
  return error.message
}

export function AccountProvisioning({ authApiUrl, accessToken, viewer }: AccountProvisioningProps) {
  const [mode, setMode] = useState<OnboardingMode>('DIRECT')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [reason, setReason] = useState('')
  const [attemptKey, setAttemptKey] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState(false)
  const [account, setAccount] = useState<ProvisionedBackofficeAccount>()
  const [invitation, setInvitation] = useState<InvitedBackofficeAccount>()
  const canProvision = viewer.permissions.includes('account:provision')
  const valid = email.trim().length > 3 && fullName.trim().length > 0
    && reason.trim().length >= 8 && (mode === 'INVITATION' || temporaryPassword.length >= 12)

  function changeMode(nextMode: OnboardingMode) {
    setMode(nextMode)
    setMessage(undefined)
    setError(false)
    setAccount(undefined)
    setInvitation(undefined)
    setAttemptKey(undefined)
  }

  function updateField(setter: (value: string) => void, value: string) {
    setter(value)
    setAttemptKey(undefined)
  }

  async function submit() {
    if (!canProvision || !valid || saving) return
    setSaving(true)
    setMessage(undefined)
    setError(false)
    setAccount(undefined)
    setInvitation(undefined)
    const idempotencyKey = attemptKey ?? Crypto.randomUUID()
    setAttemptKey(idempotencyKey)
    try {
      if (mode === 'DIRECT') {
        const created = await provisionBackofficeAccount(
          authApiUrl,
          accessToken,
          idempotencyKey,
          { email: email.trim(), fullName: fullName.trim(), temporaryPassword, reason: reason.trim() },
        )
        setAccount(created)
        setTemporaryPassword('')
        setMessage('Đã tạo hồ sơ nhân viên và tài khoản. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu tiên.')
      } else {
        const created = await inviteBackofficeAccount(
          authApiUrl,
          accessToken,
          idempotencyKey,
          { email: email.trim(), fullName: fullName.trim(), reason: reason.trim() },
        )
        setInvitation(created)
        setMessage('Đã tạo hồ sơ nhân viên và gửi email xác thực, đặt mật khẩu.')
      }
      setAttemptKey(undefined)
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
        <Text style={styles.eyebrow}>EMPLOYEE ONBOARDING</Text>
        <Text style={styles.title}>Tài khoản nhân viên.{`\n`}Không đăng ký công khai.</Text>
        <Text style={styles.body}>Admin tạo tài khoản bằng mật khẩu tạm hoặc gửi email để nhân viên tự xác thực và đặt mật khẩu.</Text>
      </View>
      <View style={styles.form}>
        <View accessibilityRole="tablist" style={styles.modeSwitch}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'DIRECT' }} onPress={() => changeMode('DIRECT')} style={[styles.modeButton, mode === 'DIRECT' && styles.modeActive]}><Text style={[styles.modeText, mode === 'DIRECT' && styles.modeTextActive]}>Tạo ngay</Text></Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'INVITATION' }} onPress={() => changeMode('INVITATION')} style={[styles.modeButton, mode === 'INVITATION' && styles.modeActive]}><Text style={[styles.modeText, mode === 'INVITATION' && styles.modeTextActive]}>Gửi email mời</Text></Pressable>
        </View>
        {!canProvision && <Text accessibilityRole="alert" style={styles.error}>Bạn thiếu quyền account:provision.</Text>}
        <TextInput autoCapitalize="words" maxLength={180} onChangeText={(value) => updateField(setFullName, value)} placeholder="Họ và tên" placeholderTextColor="#879189" style={styles.input} value={fullName} />
        <TextInput autoCapitalize="none" inputMode="email" keyboardType="email-address" onChangeText={(value) => updateField(setEmail, value)} placeholder="Email" placeholderTextColor="#879189" style={styles.input} value={email} />
        {mode === 'DIRECT' && <TextInput autoCapitalize="none" maxLength={128} onChangeText={(value) => updateField(setTemporaryPassword, value)} placeholder="Mật khẩu tạm · tối thiểu 12 ký tự" placeholderTextColor="#879189" secureTextEntry style={styles.input} value={temporaryPassword} />}
        <TextInput maxLength={500} multiline onChangeText={(value) => updateField(setReason, value)} placeholder="Lý do tạo nhân viên" placeholderTextColor="#879189" style={[styles.input, styles.textarea]} value={reason} />
        {message && <Text accessibilityRole={error ? 'alert' : undefined} style={error ? styles.error : styles.success}>{message}</Text>}
        {account && <View style={styles.account}><Text style={styles.accountEmail}>{account.email}</Text><Text selectable style={styles.accountId}>{account.id}</Text></View>}
        {invitation && <View style={styles.account}><Text style={styles.accountEmail}>{invitation.email}</Text><Text selectable style={styles.accountId}>{invitation.deliveryStatus} · {invitation.invitationId}</Text></View>}
        <Pressable disabled={!canProvision || !valid || saving} onPress={() => void submit()} style={({ pressed }) => [styles.button, (pressed || !canProvision || !valid || saving) && styles.disabled]}>
          <Text style={styles.buttonText}>{saving ? 'Đang xử lý…' : mode === 'DIRECT' ? 'Tạo nhân viên và tài khoản' : 'Tạo nhân viên và gửi email'}</Text>
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
  modeSwitch: { padding: 4, borderRadius: 12, backgroundColor: '#223128', flexDirection: 'row', gap: 4 },
  modeButton: { minHeight: 42, borderRadius: 9, flex: 1, alignItems: 'center', justifyContent: 'center' },
  modeActive: { backgroundColor: '#fffef9' },
  modeText: { color: '#aebbb3', fontSize: 11, fontWeight: '700' },
  modeTextActive: { color: '#17231d' },
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
