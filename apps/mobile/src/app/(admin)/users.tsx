import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Crypto from 'expo-crypto'
import { Ionicons } from '@expo/vector-icons'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  checkCustomerContactAvailability,
  checkCustomerIdentityDocumentAvailability,
  createUserProfile,
  fetchUserDirectory,
  fetchUserProfile,
  type CreateUserProfileInput,
  type UserDirectoryAccountType,
  type UserDirectoryEntry,
  type UserProfileDetails,
} from '@vistay/admin-api-client'
import { useAdmin } from '../../AdminContext'
import { LoadState, Segmented, useWorkspaceScrollGate } from '../../ui/primitives'
import { palette, radii } from '../../ui/theme'

// Short GraphQL operations should use React Native's native fetch. `expo/fetch`
// is retained by the notification module because it needs a streaming body,
// but using it for ordinary requests on the same screen as the long-lived SSE
// stream can delay dispatch on physical Android devices.
const mobileFetch = globalThis.fetch
const USER_CONTROLS = '__user_controls__' as const

type AvailabilityState = 'idle' | 'checking' | 'available' | 'duplicate' | 'error'

const typeCopy: Record<UserDirectoryAccountType, {
  label: string
  createLabel: string
  createPermission: string
  empty: string
}> = {
  CUSTOMER: {
    label: 'Khách hàng',
    createLabel: 'Thêm khách hàng',
    createPermission: 'customer-profile:create',
    empty: 'Chưa có hồ sơ khách hàng phù hợp.',
  },
  ADMIN: {
    label: 'Nhân viên',
    createLabel: 'Thêm nhân viên',
    createPermission: 'admin-profile:create',
    empty: 'Chưa có hồ sơ nhân viên phù hợp.',
  },
  HOST: {
    label: 'Chủ nhà',
    createLabel: 'Thêm chủ nhà',
    createPermission: 'host-profile:create',
    empty: 'Chưa có hồ sơ chủ nhà phù hợp.',
  },
}

const emptyDraft = {
  fullName: '',
  email: '',
  contactPhone: '',
  referenceCode: '',
  subtype: 'STAFF',
  relevantDate: '',
  nationalityCode: 'VN',
  documentType: 'CCCD' as 'CCCD' | 'PASSPORT',
  documentNumber: '',
  address: '',
  taxCode: '',
  reason: '',
}

const isoCountryCodes = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ')

const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['vi'], { type: 'region' }) : null
const countryOptions = isoCountryCodes
  .map((code) => ({ code, label: regionNames?.of(code) ?? code }))
  .sort((left, right) => left.label.localeCompare(right.label, 'vi'))

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase() || 'VS'
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    ACTIVE: 'Đang hoạt động',
    INACTIVE: 'Ngừng hoạt động',
    SUSPENDED: 'Tạm khóa',
    ANONYMIZED: 'Đã ẩn danh',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function profileMeta(entry: Pick<UserDirectoryEntry, 'accountId' | 'accountType' | 'subtype' | 'verificationStatus'>) {
  if (entry.accountType === 'ADMIN') return entry.subtype?.replaceAll('_', ' ') ?? 'Nhân viên'
  if (entry.accountType === 'HOST') return entry.verificationStatus?.replaceAll('_', ' ') ?? 'Chưa xác minh'
  return entry.accountId ? 'Đã liên kết tài khoản' : 'Chưa có tài khoản'
}

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

function toIsoDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${match[3]}-${match[2]}-${match[1]}`
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
    {children}
  </View>
}

function Input({ value, onChangeText, placeholder, keyboardType = 'default', maxLength, multiline, suffix }: {
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad'
  maxLength?: number
  multiline?: boolean
  suffix?: React.ReactNode
}) {
  return <View style={[styles.inputShell, multiline && styles.inputShellMultiline]}>
    <TextInput
      autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
      keyboardType={keyboardType}
      maxLength={maxLength}
      multiline={multiline}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#87958D"
      style={[styles.input, multiline && styles.inputMultiline, suffix ? styles.inputWithSuffix : null]}
      value={value}
    />
    {suffix}
  </View>
}

function AvailabilityBadge({ state }: { state: AvailabilityState }) {
  if (state === 'idle') return null
  const icon = state === 'checking' ? 'sync-outline' : state === 'available' ? 'checkmark-circle-outline' : 'alert-circle-outline'
  const label = state === 'checking' ? 'Kiểm tra' : state === 'available' ? 'Dùng được' : state === 'duplicate' ? 'Đã tồn tại' : 'Thử lại'
  return <View style={[styles.availability, state === 'duplicate' && styles.availabilityError]}>
    {state === 'checking'
      ? <ActivityIndicator color={palette.muted} size={11} />
      : <Ionicons color={state === 'duplicate' ? palette.danger : palette.leaf} name={icon} size={13} />}
    <Text style={[styles.availabilityText, state === 'duplicate' && styles.availabilityTextError]}>{label}</Text>
  </View>
}

function ProfileSheet({ entry, profile, loading, error, onClose, onRetry }: {
  entry: UserDirectoryEntry | null
  profile: UserProfileDetails | null
  loading: boolean
  error?: string
  onClose: () => void
  onRetry: () => void
}) {
  const current = profile ?? entry
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible={Boolean(entry)}>
    <View style={styles.modalRoot}>
      <Pressable accessibilityLabel="Đóng xem nhanh hồ sơ" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.profileSheet}>
        <View style={styles.sheetHandle} />
        {current ? <>
          <View style={styles.profileHeader}>
            <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{initials(current.displayName)}</Text></View>
            <View style={styles.profileHeaderCopy}>
              <Text style={styles.profileEyebrow}>{typeCopy[current.accountType].label}</Text>
              <Text numberOfLines={2} style={styles.profileName}>{current.displayName}</Text>
              <Text style={styles.profileReference}>{current.referenceCode ?? current.profileId.slice(0, 12)}</Text>
            </View>
            <Pressable accessibilityLabel="Đóng" hitSlop={8} onPress={onClose} style={styles.closeButton}>
              <Ionicons color={palette.ink} name="close" size={22} />
            </Pressable>
          </View>

          <View style={styles.profileStatusRow}>
            <View style={styles.activeStatus}><View style={styles.activeDot} /><Text style={styles.activeStatusText}>{statusLabel(current.status)}</Text></View>
            <Text style={styles.profileMeta}>{profileMeta(current)}</Text>
          </View>

          {loading ? <View style={styles.sheetLoading}><ActivityIndicator color={palette.evergreen} /><Text style={styles.sheetLoadingText}>Đang đồng bộ chi tiết…</Text></View> : null}
          {error ? <View style={styles.sheetError}><Text style={styles.sheetErrorText}>{error}</Text><Pressable onPress={onRetry}><Text style={styles.retryLink}>Thử lại</Text></Pressable></View> : null}

          <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
            <View style={styles.detailGrid}>
              <Detail icon="mail-outline" label="Email" value={current.email ?? 'Chưa cập nhật'} />
              <Detail icon="call-outline" label="Điện thoại" value={current.contactPhone ?? 'Chưa cập nhật'} />
              <Detail icon="person-circle-outline" label="Tài khoản" value={current.accountId ? 'Đã liên kết' : 'Chưa liên kết'} />
              <Detail icon="calendar-outline" label="Ngày liên quan" value={profile?.relevantDate ? new Date(profile.relevantDate).toLocaleDateString('vi-VN') : 'Chưa cập nhật'} />
              {current.accountType === 'CUSTOMER' ? <Detail icon="flag-outline" label="Quốc tịch" value={profile?.nationalityCode ?? 'Chưa cập nhật'} /> : null}
              {current.accountType === 'CUSTOMER' ? <Detail icon="card-outline" label="Giấy tờ" value={profile?.documentType === 'CCCD' ? 'CCCD' : profile?.documentType === 'PASSPORT' ? 'Hộ chiếu' : 'Chưa cập nhật'} /> : null}
            </View>
            {profile?.address ? <View style={styles.detailWide}><Ionicons color={palette.leaf} name="location-outline" size={18} /><View style={styles.detailCopy}><Text style={styles.detailLabel}>Địa chỉ</Text><Text style={styles.detailValue}>{profile.address}</Text></View></View> : null}
            <Text style={styles.updatedAt}>Cập nhật {new Date(current.updatedAt).toLocaleString('vi-VN')}{profile ? ` · Phiên bản ${profile.version}` : ''}</Text>
          </ScrollView>
        </> : null}
      </View>
    </View>
  </Modal>
}

function Detail({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View style={styles.detailItem}>
    <Ionicons color={palette.leaf} name={icon} size={17} />
    <View style={styles.detailCopy}><Text style={styles.detailLabel}>{label}</Text><Text numberOfLines={2} style={styles.detailValue}>{value}</Text></View>
  </View>
}

function CreateProfileSheet({ visible, accountType, canCreate, graphqlUrl, accessToken, onClose, onCreated }: {
  visible: boolean
  accountType: UserDirectoryAccountType
  canCreate: boolean
  graphqlUrl: string
  accessToken: string
  onClose: () => void
  onCreated: (profile: UserProfileDetails) => void
}) {
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [attemptKey, setAttemptKey] = useState<string>()
  const [emailCheck, setEmailCheck] = useState<AvailabilityState>('idle')
  const [phoneCheck, setPhoneCheck] = useState<AvailabilityState>('idle')
  const [documentCheck, setDocumentCheck] = useState<AvailabilityState>('idle')
  const [countryPicker, setCountryPicker] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')

  const update = useCallback((field: keyof typeof emptyDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    if (field === 'email') setEmailCheck('idle')
    if (field === 'contactPhone') setPhoneCheck('idle')
    if (field === 'documentNumber' || field === 'documentType' || field === 'nationalityCode') setDocumentCheck('idle')
    setAttemptKey(undefined)
    setError('')
  }, [])

  function resetForm() {
    setDraft(emptyDraft)
    setSaving(false)
    setError('')
    setAttemptKey(undefined)
    setEmailCheck('idle')
    setPhoneCheck('idle')
    setDocumentCheck('idle')
    setCountryPicker(false)
    setCountrySearch('')
  }

  function close() {
    resetForm()
    onClose()
  }

  useEffect(() => {
    const email = draft.email.trim()
    if (!visible || accountType !== 'CUSTOMER' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setEmailCheck('checking')
      void checkCustomerContactAvailability(graphqlUrl, accessToken, { email }, controller.signal, mobileFetch)
        .then(({ emailAvailable }) => setEmailCheck(emailAvailable === false ? 'duplicate' : 'available'))
        .catch(() => { if (!controller.signal.aborted) setEmailCheck('error') })
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [accessToken, accountType, draft.email, graphqlUrl, visible])

  useEffect(() => {
    const phone = draft.contactPhone.trim()
    const normalized = phone.replace(/[\s().-]/g, '')
    if (!visible || accountType !== 'CUSTOMER' || !/^\+?[0-9]{8,15}$/.test(normalized)) {
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setPhoneCheck('checking')
      void checkCustomerContactAvailability(graphqlUrl, accessToken, { contactPhone: phone }, controller.signal, mobileFetch)
        .then(({ phoneAvailable }) => setPhoneCheck(phoneAvailable === false ? 'duplicate' : 'available'))
        .catch(() => { if (!controller.signal.aborted) setPhoneCheck('error') })
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [accessToken, accountType, draft.contactPhone, graphqlUrl, visible])

  useEffect(() => {
    const documentNumber = draft.documentNumber.trim().toUpperCase()
    const valid = draft.documentType === 'CCCD' ? /^\d{12}$/.test(documentNumber) : /^[A-Z0-9]{6,20}$/.test(documentNumber)
    if (!visible || accountType !== 'CUSTOMER' || !valid) {
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setDocumentCheck('checking')
      void checkCustomerIdentityDocumentAvailability(graphqlUrl, accessToken, {
        nationalityCode: draft.nationalityCode,
        documentType: draft.documentType,
        documentNumber,
      }, controller.signal, mobileFetch)
        .then((available) => setDocumentCheck(available ? 'available' : 'duplicate'))
        .catch(() => { if (!controller.signal.aborted) setDocumentCheck('error') })
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [accessToken, accountType, draft.documentNumber, draft.documentType, draft.nationalityCode, graphqlUrl, visible])

  const selectedCountry = countryOptions.find((country) => country.code === draft.nationalityCode)
  const filteredCountries = countryOptions.filter((country) => `${country.label} ${country.code}`.toLocaleLowerCase('vi').includes(countrySearch.trim().toLocaleLowerCase('vi')))

  async function submit() {
    if (!canCreate || saving) return
    if (!draft.fullName.trim()) return setError('Vui lòng nhập họ và tên.')
    if (accountType === 'CUSTOMER' && !draft.email.trim() && !draft.contactPhone.trim()) return setError('Cần ít nhất email hoặc số điện thoại.')
    if (draft.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())) return setError('Email chưa đúng định dạng.')
    if (accountType === 'CUSTOMER' && !draft.documentNumber.trim()) return setError(`Vui lòng nhập số ${draft.documentType === 'CCCD' ? 'CCCD' : 'hộ chiếu'}.`)
    if (emailCheck === 'duplicate') return setError('Email đã tồn tại trong hồ sơ khách hàng.')
    if (phoneCheck === 'duplicate') return setError('Số điện thoại đã tồn tại trong hồ sơ khách hàng.')
    if (documentCheck === 'duplicate') return setError(`${draft.documentType === 'CCCD' ? 'CCCD' : 'Hộ chiếu'} đã tồn tại.`)
    const relevantDate = draft.relevantDate.trim() ? toIsoDate(draft.relevantDate) : ''
    if (draft.relevantDate.trim() && !relevantDate) return setError('Ngày phải theo định dạng dd/mm/yyyy và hợp lệ.')

    const key = attemptKey ?? Crypto.randomUUID()
    setAttemptKey(key)
    setSaving(true)
    setError('')
    const input: CreateUserProfileInput = {
      accountType,
      ...draft,
      relevantDate: relevantDate ?? '',
      idempotencyKey: key,
    }
    try {
      const profile = await createUserProfile(graphqlUrl, accessToken, input, mobileFetch)
      resetForm()
      onCreated(profile)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo hồ sơ.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <Modal animationType="slide" onRequestClose={close} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <Pressable accessibilityLabel="Đóng form tạo hồ sơ" onPress={close} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.createSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.createHeader}>
            <View><Text style={styles.createEyebrow}>HỒ SƠ MỚI</Text><Text style={styles.createTitle}>{typeCopy[accountType].createLabel}</Text></View>
            <Pressable accessibilityLabel="Đóng" hitSlop={8} onPress={close} style={styles.closeButton}><Ionicons color={palette.ink} name="close" size={22} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.createBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Field label="Họ và tên" required><Input onChangeText={(value) => update('fullName', value)} placeholder="Nhập họ và tên" value={draft.fullName} /></Field>
            <Field label="Email"><Input keyboardType="email-address" onChangeText={(value) => update('email', value)} placeholder="name@example.com" suffix={<AvailabilityBadge state={emailCheck} />} value={draft.email} /></Field>
            <Field label="Điện thoại"><Input keyboardType="phone-pad" onChangeText={(value) => update('contactPhone', value)} placeholder="Số điện thoại" suffix={<AvailabilityBadge state={phoneCheck} />} value={draft.contactPhone} /></Field>

            {accountType === 'CUSTOMER' ? <>
              <Field label="Quốc tịch">
                <Pressable onPress={() => setCountryPicker(true)} style={styles.selectControl}><Text style={styles.selectText}>{selectedCountry?.label ?? draft.nationalityCode}</Text><Ionicons color={palette.muted} name="chevron-down" size={17} /></Pressable>
              </Field>
              <Field label="Loại giấy tờ">
                <View style={styles.choiceRow}>
                  {draft.nationalityCode === 'VN' ? <Choice active={draft.documentType === 'CCCD'} label="CCCD" onPress={() => update('documentType', 'CCCD')} /> : null}
                  <Choice active={draft.documentType === 'PASSPORT'} label="Hộ chiếu" onPress={() => update('documentType', 'PASSPORT')} />
                </View>
              </Field>
              <Field label={draft.documentType === 'CCCD' ? 'Số CCCD' : 'Số hộ chiếu'} required>
                <Input keyboardType={draft.documentType === 'CCCD' ? 'number-pad' : 'default'} maxLength={draft.documentType === 'CCCD' ? 12 : 20} onChangeText={(value) => update('documentNumber', value.toUpperCase())} suffix={<AvailabilityBadge state={documentCheck} />} value={draft.documentNumber} />
              </Field>
            </> : <Field label={accountType === 'ADMIN' ? 'Mã nhân viên' : 'Mã chủ nhà'}><Input onChangeText={(value) => update('referenceCode', value)} value={draft.referenceCode} /></Field>}

            {accountType === 'ADMIN' ? <Field label="Loại nhân viên"><View style={styles.choiceWrap}>{[
              ['STAFF', 'Nhân viên'], ['RECEPTIONIST', 'Lễ tân'], ['CTV', 'Cộng tác viên'], ['MANAGER', 'Quản lý'], ['ADMIN', 'Quản trị'],
            ].map(([value, label]) => <Choice active={draft.subtype === value} key={value} label={label} onPress={() => update('subtype', value)} />)}</View></Field> : null}

            {accountType !== 'HOST' ? <Field label={accountType === 'ADMIN' ? 'Ngày bắt đầu' : 'Ngày sinh'}><Input keyboardType="number-pad" maxLength={10} onChangeText={(value) => update('relevantDate', formatDateInput(value))} placeholder="dd/mm/yyyy" value={draft.relevantDate} /></Field> : null}
            {accountType !== 'ADMIN' ? <Field label="Địa chỉ"><Input multiline onChangeText={(value) => update('address', value)} value={draft.address} /></Field> : null}
            {accountType === 'HOST' ? <Field label="Mã số thuế"><Input maxLength={40} onChangeText={(value) => update('taxCode', value)} value={draft.taxCode} /></Field> : null}
            <Field label="Lý do tạo hồ sơ (tùy chọn)"><Input multiline onChangeText={(value) => update('reason', value)} value={draft.reason} /></Field>
            {error ? <View style={styles.formError}><Ionicons color={palette.danger} name="alert-circle-outline" size={17} /><Text style={styles.formErrorText}>{error}</Text></View> : null}
          </ScrollView>
          <View style={styles.createFooter}>
            <Pressable disabled={saving} onPress={close} style={styles.cancelButton}><Text style={styles.cancelText}>Hủy</Text></Pressable>
            <Pressable disabled={!canCreate || saving} onPress={() => void submit()} style={[styles.submitButton, (!canCreate || saving) && styles.buttonDisabled]}>
              {saving ? <ActivityIndicator color={palette.white} size="small" /> : <Text style={styles.submitText}>Tạo hồ sơ</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    <Modal animationType="fade" onRequestClose={() => setCountryPicker(false)} transparent visible={countryPicker}>
      <View style={styles.pickerBackdrop}>
        <Pressable onPress={() => setCountryPicker(false)} style={StyleSheet.absoluteFill} />
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeader}><Text style={styles.pickerTitle}>Chọn quốc tịch</Text><Pressable onPress={() => setCountryPicker(false)}><Ionicons color={palette.ink} name="close" size={22} /></Pressable></View>
          <View style={styles.countrySearch}><Ionicons color={palette.muted} name="search-outline" size={17} /><TextInput onChangeText={setCountrySearch} placeholder="Tìm quốc gia" placeholderTextColor="#87958D" style={styles.countrySearchInput} value={countrySearch} /></View>
          <FlatList data={filteredCountries} keyExtractor={(item) => item.code} renderItem={({ item }) => <Pressable onPress={() => {
            setDraft((current) => ({ ...current, nationalityCode: item.code, documentType: item.code === 'VN' ? 'CCCD' : 'PASSPORT', documentNumber: '' }))
            setDocumentCheck('idle')
            setCountryPicker(false)
            setCountrySearch('')
          }} style={styles.countryRow}><Text style={styles.countryName}>{item.label}</Text><Text style={styles.countryCode}>{item.code}</Text></Pressable>} />
        </View>
      </View>
    </Modal>
  </>
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.choice, active && styles.choiceActive]}><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>
}

export default function UsersScreen() {
  const { accessToken, authorizationReady, config, viewer } = useAdmin()
  const [type, setType] = useState<UserDirectoryAccountType>('CUSTOMER')
  const [search, setSearch] = useState('')
  const [nodes, setNodes] = useState<UserDirectoryEntry[]>([])
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string>()
  const [selected, setSelected] = useState<UserDirectoryEntry | null>(null)
  const [profile, setProfile] = useState<UserProfileDetails | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [listViewportHeight, setListViewportHeight] = useState(0)
  const profileCache = useRef(new Map<string, UserProfileDetails>())
  const profileRequest = useRef<AbortController | null>(null)
  const allowed = viewer.permissions.includes('user:read')
  const canCreate = viewer.permissions.includes(typeCopy[type].createPermission) && authorizationReady !== false
  const scrollGate = useWorkspaceScrollGate()

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

  const openProfile = useCallback((entry: UserDirectoryEntry) => {
    const cached = profileCache.current.get(entry.profileId) ?? null
    setSelected(entry)
    setProfile(cached)
    setProfileError(undefined)
    setProfileLoading(!cached)
    profileRequest.current?.abort()
    if (cached) return
    const controller = new AbortController()
    profileRequest.current = controller
    void fetchUserProfile(config.graphqlUrl, accessToken, entry.accountType, entry.profileId, controller.signal, mobileFetch)
      .then((details) => {
        if (controller.signal.aborted) return
        profileCache.current.set(entry.profileId, details)
        setProfile(details)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setProfileError(reason instanceof Error ? reason.message : 'Không thể tải chi tiết hồ sơ.')
      })
      .finally(() => { if (!controller.signal.aborted) setProfileLoading(false) })
  }, [accessToken, config.graphqlUrl])

  useEffect(() => () => profileRequest.current?.abort(), [])

  const missingAccounts = useMemo(() => nodes.filter((node) => !node.accountId).length, [nodes])

  const heading = <View style={styles.workspaceHeading}><Text style={styles.workspaceTitle}>Người dùng</Text><Text style={styles.workspaceMeta}>Hồ sơ và thông tin liên hệ</Text></View>
  const controls = <View style={styles.stickyWorkspace}>
    <View style={styles.tabsSpacing}><Segmented horizontalInset={14} options={[{ label: 'Khách hàng', value: 'CUSTOMER' }, { label: 'Nhân viên', value: 'ADMIN' }, { label: 'Chủ nhà', value: 'HOST' }]} value={type} onChange={(nextType) => {
      setSelected(null)
      setProfile(null)
      setCreating(false)
      setType(nextType)
    }} /></View>
    <View style={styles.alignedRail}>
      <View style={styles.wideSlot}><View style={styles.metricPair}>
        <Summary label="Hồ sơ" value={total} />
        <Summary label="Chưa TK" value={missingAccounts} />
      </View></View>
      <View style={styles.doubleNarrowSlot}><View style={styles.search}>
        <Ionicons color={palette.evergreen} name="search-outline" size={15} />
        <TextInput autoCapitalize="none" onChangeText={setSearch} placeholder={`Tìm ${typeCopy[type].label.toLowerCase()}…`} placeholderTextColor={palette.muted} style={styles.searchInput} value={search} />
        {search ? <Pressable accessibilityLabel="Xóa tìm kiếm" hitSlop={7} onPress={() => setSearch('')}><Ionicons color={palette.muted} name="close-circle" size={16} /></Pressable> : null}
      </View></View>
      <View style={styles.lastNarrowSlot}><Pressable accessibilityLabel={typeCopy[type].createLabel} disabled={!canCreate} onPress={() => setCreating(true)} style={({ pressed }) => [styles.addButton, !canCreate && styles.buttonDisabled, pressed && canCreate && styles.buttonPressed]}>
        <Text numberOfLines={1} style={styles.addButtonText}>Thêm hồ sơ</Text>
      </Pressable></View>
    </View>
  </View>
  const listData = useMemo<(typeof USER_CONTROLS | UserDirectoryEntry)[]>(() => [USER_CONTROLS, ...(loading || error ? [] : nodes)], [error, loading, nodes])
  const footer = loading
    ? <LoadState />
    : error
      ? <LoadState error={error} retry={() => void load()} />
      : nodes.length === 0
        ? <View style={styles.empty}><Ionicons color={palette.sage} name="people-outline" size={34} /><Text style={styles.emptyTitle}>{typeCopy[type].empty}</Text><Text style={styles.emptyText}>Thử thay đổi từ khóa tìm kiếm.</Text></View>
        : nextCursor
          ? <Pressable disabled={loadingMore} onPress={() => void load(nextCursor)} style={styles.more}>{loadingMore ? <ActivityIndicator color={palette.white} size="small" /> : <Text style={styles.moreText}>Xem thêm {Math.max(total - nodes.length, 0)} hồ sơ</Text>}</Pressable>
          : <View style={styles.listEndSpace} />

  return <View style={styles.screen}>
    <FlatList
      contentContainerStyle={[styles.content, listViewportHeight > 0 && { minHeight: listViewportHeight + 56 }]}
      data={listData}
      keyExtractor={(entry) => entry === USER_CONTROLS ? USER_CONTROLS : entry.profileId}
      keyboardShouldPersistTaps="handled"
      ListFooterComponent={<View style={styles.footerSlot}>{footer}</View>}
      ListHeaderComponent={<View>{heading}</View>}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      onLayout={(event) => setListViewportHeight(Math.round(event.nativeEvent.layout.height))}
      onScroll={scrollGate.onScroll}
      onTouchStart={scrollGate.onTouchStart}
      onScrollBeginDrag={scrollGate.onScrollBeginDrag}
      onScrollEndDrag={scrollGate.onScrollEndDrag}
      onMomentumScrollEnd={scrollGate.onMomentumScrollEnd}
      refreshControl={<RefreshControl enabled={scrollGate.refreshEnabled} refreshing={loading && nodes.length > 0} onRefresh={() => void load()} tintColor={palette.evergreen} />}
      removeClippedSubviews={Platform.OS === 'android'}
      renderItem={({ item }) => item === USER_CONTROLS ? controls : <View style={styles.listItem}><UserDirectoryRow item={item} onOpen={openProfile} /></View>}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[1]}
      scrollEventThrottle={16}
      updateCellsBatchingPeriod={32}
      windowSize={7}
    />

    <ProfileSheet
      entry={selected}
      error={profileError}
      loading={profileLoading}
      onClose={() => {
        profileRequest.current?.abort()
        setSelected(null)
        setProfile(null)
        setProfileLoading(false)
      }}
      onRetry={() => { if (selected) openProfile(selected) }}
      profile={profile}
    />
    <CreateProfileSheet
      key={type}
      accessToken={accessToken}
      accountType={type}
      canCreate={canCreate}
      graphqlUrl={config.graphqlUrl}
      onClose={() => setCreating(false)}
      onCreated={(created) => {
        setCreating(false)
        void load()
        openProfile({ ...created, joinedOn: created.relevantDate })
      }}
      visible={creating}
    />
  </View>
}

const UserDirectoryRow = memo(function UserDirectoryRow({ item, onOpen }: {
  item: UserDirectoryEntry
  onOpen: (entry: UserDirectoryEntry) => void
}) {
  const open = useCallback(() => onOpen(item), [item, onOpen])
  return <Pressable
    accessibilityHint="Mở thẻ xem nhanh từ cuối màn hình"
    accessibilityRole="button"
    android_ripple={{ color: '#E1ECE2' }}
    onPress={open}
    style={({ pressed }) => [styles.person, pressed && styles.personPressed]}
  >
    <View style={styles.avatar}><Text style={styles.avatarText}>{initials(item.displayName)}</Text></View>
    <View style={styles.personCopy}>
      <View style={styles.nameRow}><Text numberOfLines={1} style={styles.name}>{item.displayName}</Text><View style={styles.chevron}><Ionicons color={palette.evergreen} name="chevron-up" size={14} /></View></View>
      <Text numberOfLines={1} style={styles.contact}>{item.email ?? item.contactPhone ?? 'Chưa có thông tin liên hệ'}</Text>
      <View style={styles.metaRow}><Text numberOfLines={1} style={styles.reference}>{item.referenceCode ?? item.profileId.slice(0, 10)}</Text><Text numberOfLines={1} style={styles.accountState}>{profileMeta(item)}</Text></View>
    </View>
    <View style={[styles.status, item.status !== 'ACTIVE' && styles.statusMuted]}><View style={[styles.statusDot, item.status !== 'ACTIVE' && styles.statusDotMuted]} /><Text style={styles.statusText}>{item.status === 'ACTIVE' ? 'Hoạt động' : statusLabel(item.status)}</Text></View>
  </Pressable>
})

function Summary({ label, value }: { label: string; value: number }) {
  return <View style={styles.summary}><Text numberOfLines={1} style={styles.summaryLabel}>{label}</Text><Text adjustsFontSizeToFit numberOfLines={1} style={styles.summaryValue}>{new Intl.NumberFormat('vi-VN').format(value)}</Text></View>
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 18 },
  stickyWorkspace: { zIndex: 4, paddingTop: 12, paddingBottom: 9, backgroundColor: palette.background },
  tabsSpacing: { marginBottom: 12 },
  listItem: { marginBottom: 9 },
  footerSlot: { flexGrow: 1 },
  workspaceHeading: { minHeight: 42, justifyContent: 'center' },
  workspaceTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  workspaceMeta: { marginTop: 2, color: palette.muted, fontSize: 9 },
  alignedRail: { width: '100%', height: 40, flexDirection: 'row' },
  wideSlot: { width: '31%', paddingRight: 5 },
  doubleNarrowSlot: { width: '46%', paddingRight: 5 },
  lastNarrowSlot: { width: '23%' },
  metricPair: { flex: 1, flexDirection: 'row', gap: 4 },
  summary: { flex: 1, minWidth: 0, height: 40, paddingHorizontal: 6, justifyContent: 'center', borderRadius: radii.small, backgroundColor: palette.ink },
  summaryLabel: { color: '#B9D0C7', fontSize: 9, fontWeight: '600' },
  summaryValue: { marginTop: 1, color: palette.white, fontSize: 13, fontWeight: '700' },
  search: { flex: 1, height: 40, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: palette.controlLine, borderRadius: radii.small, backgroundColor: palette.surface },
  searchInput: { minWidth: 0, flex: 1, height: '100%', paddingVertical: 0, color: palette.ink, fontSize: 11, fontWeight: '600' },
  addButton: { flex: 1, height: 40, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: radii.small, backgroundColor: palette.evergreen },
  addButtonText: { color: palette.white, fontSize: 11, fontWeight: '700' },
  buttonPressed: { opacity: .82 },
  buttonDisabled: { opacity: .45 },
  person: { minHeight: 84, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.surface },
  personPressed: { borderColor: palette.sage, backgroundColor: '#F0F5EF', transform: [{ scale: .992 }] },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.white, fontSize: 11, fontWeight: '700' },
  personCopy: { flex: 1, minWidth: 0, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: '700' },
  chevron: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#E7EFE7', alignItems: 'center', justifyContent: 'center' },
  contact: { color: palette.muted, fontSize: 10.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reference: { maxWidth: '42%', color: palette.leaf, fontSize: 9, fontWeight: '600' },
  accountState: { flex: 1, color: palette.muted, fontSize: 9 },
  status: { alignSelf: 'flex-start', marginTop: 1, paddingHorizontal: 7, height: 24, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radii.small, backgroundColor: '#E5F1E7' },
  statusMuted: { backgroundColor: palette.surfaceMuted },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.leaf },
  statusDotMuted: { backgroundColor: palette.muted },
  statusText: { color: palette.evergreen, fontSize: 8, fontWeight: '700' },
  empty: { minHeight: 250, alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.surface },
  emptyTitle: { maxWidth: 260, color: palette.ink, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: palette.muted, fontSize: 10.5 },
  more: { minHeight: 44, marginTop: 2, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.evergreen },
  moreText: { color: palette.white, fontSize: 11, fontWeight: '700' },
  listEndSpace: { height: 12 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(9,35,40,.42)' },
  sheetHandle: { alignSelf: 'center', width: 44, height: 4, marginTop: 8, marginBottom: 7, borderRadius: 2, backgroundColor: '#C2CEC5' },
  profileSheet: { maxHeight: '82%', paddingHorizontal: 17, paddingBottom: 22, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: palette.surface },
  profileHeader: { minHeight: 77, flexDirection: 'row', alignItems: 'center', gap: 11 },
  profileAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.evergreen },
  profileAvatarText: { color: palette.white, fontSize: 13, fontWeight: '800' },
  profileHeaderCopy: { flex: 1, minWidth: 0, gap: 2 },
  profileEyebrow: { color: palette.leaf, fontSize: 9, fontWeight: '700', letterSpacing: .7, textTransform: 'uppercase' },
  profileName: { color: palette.ink, fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -.5 },
  profileReference: { color: palette.muted, fontSize: 9.5 },
  closeButton: { width: 35, height: 35, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceMuted },
  profileStatusRow: { minHeight: 38, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: radii.small, backgroundColor: '#EDF4EC' },
  activeStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.leaf },
  activeStatusText: { color: palette.evergreen, fontSize: 10, fontWeight: '700' },
  profileMeta: { flex: 1, color: palette.muted, fontSize: 9.5, textAlign: 'right' },
  sheetLoading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sheetLoadingText: { color: palette.muted, fontSize: 10 },
  sheetError: { marginTop: 9, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radii.small, backgroundColor: '#FFF4F1' },
  sheetErrorText: { flex: 1, color: palette.danger, fontSize: 10 },
  retryLink: { color: palette.evergreen, fontSize: 10, fontWeight: '700' },
  detailContent: { paddingTop: 11, paddingBottom: 8, gap: 9 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  detailItem: { width: '48.7%', minHeight: 66, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: '#FBFCFA' },
  detailWide: { minHeight: 60, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: '#FBFCFA' },
  detailCopy: { flex: 1, minWidth: 0, gap: 3 },
  detailLabel: { color: palette.muted, fontSize: 8.5, fontWeight: '600' },
  detailValue: { color: palette.ink, fontSize: 10.5, lineHeight: 15, fontWeight: '600' },
  updatedAt: { paddingTop: 2, color: palette.muted, fontSize: 8.5, textAlign: 'center' },
  createSheet: { height: '91%', borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: palette.background, overflow: 'hidden' },
  createHeader: { minHeight: 66, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line, backgroundColor: palette.surface },
  createEyebrow: { color: palette.leaf, fontSize: 8.5, fontWeight: '700', letterSpacing: 1 },
  createTitle: { marginTop: 2, color: palette.ink, fontSize: 20, fontWeight: '700', letterSpacing: -.5 },
  createBody: { padding: 16, paddingBottom: 22, gap: 13 },
  field: { gap: 6 },
  fieldLabel: { color: palette.ink, fontSize: 11, fontWeight: '600' },
  required: { color: palette.danger },
  inputShell: { minHeight: 45, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CCD8CE', borderRadius: radii.small, backgroundColor: palette.surface },
  inputShellMultiline: { minHeight: 74, alignItems: 'flex-start' },
  input: { flex: 1, minWidth: 0, height: 43, paddingVertical: 0, color: palette.ink, fontSize: 13, fontWeight: '400' },
  inputMultiline: { height: 72, paddingTop: 11, textAlignVertical: 'top' },
  inputWithSuffix: { paddingRight: 5 },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  availabilityError: {},
  availabilityText: { color: palette.leaf, fontSize: 8.5, fontWeight: '600' },
  availabilityTextError: { color: palette.danger },
  selectControl: { height: 45, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#CCD8CE', borderRadius: radii.small, backgroundColor: palette.surface },
  selectText: { color: palette.ink, fontSize: 13 },
  choiceRow: { flexDirection: 'row', gap: 7 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 38, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.surface },
  choiceActive: { borderColor: palette.evergreen, backgroundColor: palette.evergreen },
  choiceText: { color: palette.muted, fontSize: 10.5, fontWeight: '600' },
  choiceTextActive: { color: palette.white, fontWeight: '700' },
  formError: { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#E8CFC9', borderRadius: radii.small, backgroundColor: '#FFF6F3' },
  formErrorText: { flex: 1, color: palette.danger, fontSize: 10.5, lineHeight: 15 },
  createFooter: { minHeight: 66, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, backgroundColor: palette.surface },
  cancelButton: { minWidth: 92, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.evergreen, borderRadius: radii.small, backgroundColor: palette.surface },
  cancelText: { color: palette.evergreen, fontSize: 12, fontWeight: '700' },
  submitButton: { minWidth: 126, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.small, backgroundColor: palette.evergreen },
  submitText: { color: palette.white, fontSize: 12, fontWeight: '700' },
  pickerBackdrop: { flex: 1, paddingHorizontal: 20, justifyContent: 'center', backgroundColor: 'rgba(9,35,40,.48)' },
  pickerCard: { height: '68%', padding: 14, gap: 10, borderRadius: radii.large, backgroundColor: palette.surface },
  pickerHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle: { color: palette.ink, fontSize: 17, fontWeight: '700' },
  countrySearch: { height: 42, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.background },
  countrySearchInput: { flex: 1, height: '100%', paddingVertical: 0, color: palette.ink, fontSize: 12 },
  countryRow: { minHeight: 47, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  countryName: { color: palette.ink, fontSize: 12 },
  countryCode: { color: palette.muted, fontSize: 10, fontWeight: '700' },
})
