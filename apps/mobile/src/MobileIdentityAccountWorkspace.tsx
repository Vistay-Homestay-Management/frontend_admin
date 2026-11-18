import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { fetch as expoFetch } from 'expo/fetch'
import * as Crypto from 'expo-crypto'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  createProfileAccount, fetchIdentityPolicies, fetchProfileLinkReviews, fetchUserDirectory,
  reviewProfileLink, updateIdentityPolicy,
  type BackofficeViewer, type IdentityPolicy, type ProfileLinkReview,
  type UserDirectoryAccountType, type UserDirectoryEntry,
} from '@vistay/admin-api-client'
import { palette, radii } from './ui/theme'

const mobileFetch = expoFetch as typeof globalThis.fetch
type ViewMode = 'unlinked' | 'linked' | 'reviews'

const copy: Record<UserDirectoryAccountType, { title: string; permission: string }> = {
  CUSTOMER: { title: 'Khách hàng', permission: 'customer-account:provision' },
  HOST: { title: 'Chủ nhà', permission: 'host-account:provision' },
  ADMIN: { title: 'Nhân viên', permission: 'admin-account:provision' },
}

export function MobileIdentityAccountWorkspace({ accountType, accessToken, authApiUrl, graphqlUrl, viewer }: {
  accountType: UserDirectoryAccountType
  accessToken: string
  authApiUrl: string
  graphqlUrl: string
  viewer: BackofficeViewer
}) {
  const [nodes, setNodes] = useState<UserDirectoryEntry[]>([])
  const [reviews, setReviews] = useState<ProfileLinkReview[]>([])
  const [policy, setPolicy] = useState<IdentityPolicy>()
  const [view, setView] = useState<ViewMode>('unlinked')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<UserDirectoryEntry>()
  const [reviewing, setReviewing] = useState<ProfileLinkReview>()
  const [policyOpen, setPolicyOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canProvision = viewer.permissions.includes(copy[accountType].permission)
  const canReadReviews = viewer.permissions.includes('identity-link:read')
  const canReadPolicy = viewer.permissions.includes('identity-policy:read')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const directory = await fetchUserDirectory(graphqlUrl, accessToken, { accountType, first: 100 }, undefined, mobileFetch)
      setNodes(directory.nodes)
      if (canReadReviews) {
        try { setReviews(await fetchProfileLinkReviews(graphqlUrl, accessToken, { profileType: accountType, status: 'APPROVAL_PENDING', first: 100 }, undefined, mobileFetch)) }
        catch { setReviews([]) }
      }
      if (canReadPolicy) {
        try { setPolicy((await fetchIdentityPolicies(graphqlUrl, accessToken, undefined, mobileFetch)).find((item) => item.accountType === accountType)) }
        catch { setPolicy(undefined) }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không tải được tài khoản.') }
    finally { setLoading(false) }
  }, [accessToken, accountType, canReadPolicy, canReadReviews, graphqlUrl])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  useEffect(() => { queueMicrotask(() => { setView('unlinked'); setSearch(''); setSelected(undefined) }) }, [accountType])

  const unlinked = nodes.filter((item) => !item.accountId)
  const linked = nodes.filter((item) => Boolean(item.accountId))
  const visible = useMemo(() => {
    if (view === 'reviews') return []
    const source = view === 'linked' ? linked : unlinked
    const query = search.trim().toLocaleLowerCase('vi')
    return source.filter((item) => !query || `${item.displayName} ${item.email ?? ''} ${item.contactPhone ?? ''} ${item.referenceCode ?? ''}`.toLocaleLowerCase('vi').includes(query))
  }, [linked, search, unlinked, view])

  return <View style={styles.root}>
    <View style={styles.commandBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.commandTabs}>
        <Tab active={view === 'unlinked'} label="Chưa có tài khoản" value={unlinked.length} onPress={() => setView('unlinked')} />
        <Tab active={view === 'linked'} label="Đã liên kết" value={linked.length} onPress={() => setView('linked')} />
        {canReadReviews && <Tab active={view === 'reviews'} label="Chờ duyệt" value={reviews.length} onPress={() => setView('reviews')} />}
      </ScrollView>
      {canReadPolicy && policy && <Pressable onPress={() => setPolicyOpen(true)} style={styles.policyButton}><Ionicons name="options-outline" size={17} color={palette.evergreen} /><View style={styles.policyCopy}><Text style={styles.policyTitle}>Đăng ký web: {policy.registrationEnabled ? 'Bật' : 'Tắt'}</Text><Text style={styles.policyMeta}>Liên kết: {policy.linkMode === 'AUTO_LINK' ? 'Tự động' : 'Cần quản trị duyệt'}</Text></View><Ionicons name="chevron-forward" size={16} color={palette.muted} /></Pressable>}
    </View>

    {view !== 'reviews' && <View style={styles.search}><Ionicons name="search" size={17} color={palette.evergreen} /><TextInput value={search} onChangeText={setSearch} placeholder="Tên, email, điện thoại hoặc mã" placeholderTextColor={palette.muted} style={styles.searchInput} /></View>}
    {error && <Text style={styles.error}>{error}</Text>}
    {loading ? <View style={styles.loading}><ActivityIndicator color={palette.evergreen} /></View> : view === 'reviews' ? <View style={styles.list}>
      {reviews.map((item) => <Pressable key={item.linkId} onPress={() => setReviewing(item)} style={styles.row}><Avatar name={item.displayName ?? 'Hồ sơ'} /><View style={styles.rowBody}><Text style={styles.name}>{item.displayName ?? 'Hồ sơ chưa đặt tên'}</Text><Text style={styles.meta}>{item.maskedRecipient} · chờ xác minh liên kết</Text></View><Ionicons name="chevron-forward" size={17} color={palette.muted} /></Pressable>)}
      {!reviews.length && <Empty title="Không có yêu cầu chờ duyệt" />}
    </View> : <View style={styles.list}>
      {visible.map((item) => <Pressable key={item.profileId} onPress={() => setSelected(item)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><Avatar name={item.displayName} /><View style={styles.rowBody}><Text style={styles.name}>{item.displayName}</Text><Text numberOfLines={1} style={styles.meta}>{item.email || item.contactPhone || 'Chưa có thông tin liên hệ'}</Text><View style={styles.rowTags}><Text style={styles.tag}>{item.referenceCode || accountType}</Text><Text style={[styles.tag, item.accountId ? styles.tagLinked : undefined]}>{item.accountId ? 'Đã liên kết' : 'Hồ sơ thuần'}</Text></View></View><Ionicons name="chevron-forward" size={17} color={palette.muted} /></Pressable>)}
      {!visible.length && <Empty title={view === 'linked' ? 'Chưa có tài khoản đã liên kết' : 'Không còn hồ sơ chờ cấp tài khoản'} />}
    </View>}

    <AccountSheet visible={Boolean(selected)} entry={selected} canProvision={canProvision} permission={copy[accountType].permission} accountType={accountType} accessToken={accessToken} authApiUrl={authApiUrl} onClose={() => setSelected(undefined)} onSaved={() => { setSelected(undefined); void load() }} />
    {policy && <PolicySheet visible={policyOpen} policy={policy} canUpdate={viewer.permissions.includes('identity-policy:update')} accessToken={accessToken} graphqlUrl={graphqlUrl} onClose={() => setPolicyOpen(false)} onSaved={(next) => { setPolicy(next); setPolicyOpen(false) }} />}
    <ReviewSheet visible={Boolean(reviewing)} item={reviewing} accessToken={accessToken} graphqlUrl={graphqlUrl} canApprove={viewer.permissions.includes('identity-link:approve')} canReject={viewer.permissions.includes('identity-link:reject')} onClose={() => setReviewing(undefined)} onSaved={() => { setReviewing(undefined); void load() }} />
  </View>
}

function Tab({ active, label, value, onPress }: { active: boolean; label: string; value: number; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}><Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text><Text style={[styles.tabCount, active && styles.tabTextActive]}>{value}</Text></Pressable> }
function Avatar({ name }: { name: string }) { const initials = name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase(); return <View style={styles.avatar}><Text style={styles.avatarText}>{initials || 'VS'}</Text></View> }
function Empty({ title }: { title: string }) { return <View style={styles.empty}><Ionicons name="people-outline" size={27} color={palette.sage} /><Text style={styles.emptyTitle}>{title}</Text></View> }

function AccountSheet({ visible, entry, canProvision, permission, accountType, accessToken, authApiUrl, onClose, onSaved }: { visible: boolean; entry?: UserDirectoryEntry; canProvision: boolean; permission: string; accountType: UserDirectoryAccountType; accessToken: string; authApiUrl: string; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'INVITATION' | 'DIRECT'>('INVITATION'); const [password, setPassword] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  if (!entry) return null
  async function submit() { if (!entry?.email) return; setBusy(true); setError(''); try { await createProfileAccount(authApiUrl, accessToken, Crypto.randomUUID(), { profileId: entry.profileId, accountType, email: entry.email, displayName: entry.displayName, mode, temporaryPassword: mode === 'DIRECT' ? password : undefined, reason: reason.trim() }, mobileFetch); onSaved() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được tài khoản.') } finally { setBusy(false) } }
  return <Sheet visible={visible} title={entry.displayName} onClose={onClose}><View style={styles.profileBlock}><Avatar name={entry.displayName} /><View style={styles.rowBody}><Text style={styles.name}>{entry.email || 'Chưa có email'}</Text><Text style={styles.meta}>{entry.contactPhone || 'Chưa có số điện thoại'}</Text></View></View>{entry.accountId ? <View style={styles.successBox}><Ionicons name="checkmark-circle" size={18} color={palette.leaf} /><Text style={styles.successText}>Hồ sơ đã liên kết tài khoản.</Text></View> : canProvision ? <><View style={styles.modeRow}><Tab active={mode === 'INVITATION'} label="Gửi link" value={0} onPress={() => setMode('INVITATION')} /><Tab active={mode === 'DIRECT'} label="Tạo trực tiếp" value={0} onPress={() => setMode('DIRECT')} /></View>{mode === 'DIRECT' && <Input label="Mật khẩu tạm (tối thiểu 12 ký tự)" value={password} onChangeText={setPassword} secureTextEntry />}<Input label="Lý do" value={reason} onChangeText={setReason} multiline />{!entry.email && <Text style={styles.error}>Cần thêm email vào hồ sơ trước khi cấp tài khoản.</Text>}{error && <Text style={styles.error}>{error}</Text>}<Submit busy={busy} disabled={!entry.email || reason.trim().length < 8 || (mode === 'DIRECT' && password.length < 12)} label={mode === 'DIRECT' ? 'Tạo tài khoản' : 'Gửi lời mời'} onPress={() => void submit()} /></> : <Text style={styles.error}>Thiếu quyền {permission}.</Text>}</Sheet>
}

function PolicySheet({ visible, policy, canUpdate, accessToken, graphqlUrl, onClose, onSaved }: { visible: boolean; policy: IdentityPolicy; canUpdate: boolean; accessToken: string; graphqlUrl: string; onClose: () => void; onSaved: (value: IdentityPolicy) => void }) {
  const [enabled, setEnabled] = useState(policy.registrationEnabled); const [mode, setMode] = useState<IdentityPolicy['linkMode']>(policy.linkMode); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function save() { setBusy(true); setError(''); try { onSaved(await updateIdentityPolicy(graphqlUrl, accessToken, { accountType: policy.accountType, registrationEnabled: enabled, linkMode: mode, policyVersion: policy.policyVersion, reason, idempotencyKey: Crypto.randomUUID() }, mobileFetch)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được policy.') } finally { setBusy(false) } }
  return <Sheet visible={visible} title="Đăng ký & liên kết" onClose={onClose}><Text style={styles.sheetHint}>Cấu hình riêng cho {policy.accountType.toLowerCase()} · phiên bản {policy.policyVersion}</Text><Pressable disabled={!canUpdate} onPress={() => setEnabled((value) => !value)} style={[styles.switchRow, enabled && styles.switchRowActive]}><View><Text style={styles.name}>Cho phép tự đăng ký</Text><Text style={styles.meta}>{enabled ? 'Đang bật trên portal' : 'Đã tắt trên portal'}</Text></View><Ionicons name={enabled ? 'toggle' : 'toggle-outline'} size={28} color={enabled ? palette.white : palette.muted} /></Pressable><Text style={styles.fieldLabel}>Sau khi xác thực giấy tờ</Text><View style={styles.modeRow}><Tab active={mode === 'AUTO_LINK'} label="Tự liên kết" value={0} onPress={() => setMode('AUTO_LINK')} /><Tab active={mode === 'REQUIRE_APPROVAL'} label="Cần duyệt" value={0} onPress={() => setMode('REQUIRE_APPROVAL')} /></View>{canUpdate && <Input label="Lý do thay đổi" value={reason} onChangeText={setReason} multiline />}{error && <Text style={styles.error}>{error}</Text>}{canUpdate && <Submit busy={busy} disabled={reason.trim().length < 8} label="Lưu cấu hình" onPress={() => void save()} />}</Sheet>
}

function ReviewSheet({ visible, item, accessToken, graphqlUrl, canApprove, canReject, onClose, onSaved }: { visible: boolean; item?: ProfileLinkReview; accessToken: string; graphqlUrl: string; canApprove: boolean; canReject: boolean; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  if (!item) return null
  async function run(decision: 'APPROVE' | 'REJECT') { setBusy(true); setError(''); try { await reviewProfileLink(graphqlUrl, accessToken, { linkId: item!.linkId, decision, reason }, mobileFetch); onSaved() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xử lý được yêu cầu.') } finally { setBusy(false) } }
  return <Sheet visible={visible} title="Duyệt liên kết" onClose={onClose}><View style={styles.profileBlock}><Avatar name={item.displayName ?? 'Hồ sơ'} /><View style={styles.rowBody}><Text style={styles.name}>{item.displayName ?? 'Hồ sơ chưa đặt tên'}</Text><Text style={styles.meta}>{item.maskedRecipient}</Text></View></View><Input label="Lý do duyệt / từ chối" value={reason} onChangeText={setReason} multiline />{error && <Text style={styles.error}>{error}</Text>}<View style={styles.actionRow}>{canReject && <Pressable disabled={busy || reason.trim().length < 8} onPress={() => void run('REJECT')} style={styles.secondary}><Text style={styles.secondaryText}>Từ chối</Text></Pressable>}{canApprove && <Submit busy={busy} disabled={reason.trim().length < 8} label="Phê duyệt" onPress={() => void run('APPROVE')} />}</View></Sheet>
}

function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) { return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.backdrop}><ScrollView keyboardShouldPersistTaps="handled" style={styles.sheet} contentContainerStyle={styles.sheetContent}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><Pressable onPress={onClose}><Ionicons name="close" size={23} color={palette.evergreen} /></Pressable></View>{children}</ScrollView></View></Modal> }
function Input(props: React.ComponentProps<typeof TextInput> & { label: string }) { const { label, multiline, ...rest } = props; return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...rest} multiline={multiline} placeholderTextColor={palette.muted} style={[styles.input, multiline && styles.textarea]} /></View> }
function Submit({ busy, disabled, label, onPress }: { busy: boolean; disabled: boolean; label: string; onPress: () => void }) { return <Pressable disabled={busy || disabled} onPress={onPress} style={[styles.submit, (busy || disabled) && styles.disabled]}>{busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.submitText}>{label}</Text>}</Pressable> }

const styles = StyleSheet.create({
  root: { gap: 10 }, commandBar: { gap: 8 }, commandTabs: { gap: 7, paddingRight: 4 }, tab: { minHeight: 40, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 7 }, tabActive: { borderColor: palette.ink, backgroundColor: palette.ink }, tabText: { color: palette.muted, fontSize: 10, fontWeight: '600' }, tabTextActive: { color: palette.white }, tabCount: { color: palette.evergreen, fontSize: 9, fontWeight: '700' }, policyButton: { minHeight: 48, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 9 }, policyCopy: { flex: 1 }, policyTitle: { color: palette.ink, fontSize: 10, fontWeight: '700' }, policyMeta: { marginTop: 2, color: palette.muted, fontSize: 9 },
  search: { minHeight: 44, paddingHorizontal: 11, borderWidth: 1.5, borderColor: palette.leaf, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchInput: { flex: 1, color: palette.ink, fontSize: 11 },
  list: { gap: 8 }, row: { minHeight: 78, padding: 10, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 10 }, rowBody: { flex: 1, gap: 4 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.white, borderWidth: 1.5, borderColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: palette.evergreen, fontSize: 11, fontWeight: '700' }, name: { color: palette.ink, fontSize: 12, fontWeight: '700' }, meta: { color: palette.muted, fontSize: 9, lineHeight: 13 }, rowTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, tag: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: palette.surfaceMuted, color: palette.evergreen, fontSize: 8 }, tagLinked: { backgroundColor: '#DDECD8' }, pressed: { opacity: .68 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center' }, empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8 }, emptyTitle: { color: palette.ink, fontSize: 12, fontWeight: '700' }, error: { padding: 10, borderRadius: radii.small, backgroundColor: '#FFF0EC', color: palette.danger, fontSize: 10 }, successBox: { padding: 12, borderRadius: radii.small, backgroundColor: '#E6F1E2', flexDirection: 'row', alignItems: 'center', gap: 7 }, successText: { color: palette.evergreen, fontSize: 10, fontWeight: '600' },
  backdrop: { flex: 1, justifyContent: 'flex-end', paddingTop: 60, backgroundColor: 'rgba(9,35,40,.5)' }, sheet: { maxHeight: '92%', borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: palette.background }, sheetContent: { padding: 16, paddingBottom: 34, gap: 12 }, sheetHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sheetTitle: { flex: 1, color: palette.ink, fontSize: 19, fontWeight: '700' }, sheetHint: { color: palette.muted, fontSize: 10 }, profileBlock: { padding: 11, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', gap: 10 }, modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, switchRow: { minHeight: 62, padding: 11, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, switchRowActive: { backgroundColor: palette.evergreen },
  field: { gap: 6 }, fieldLabel: { color: palette.evergreen, fontSize: 10, fontWeight: '700' }, input: { minHeight: 44, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.line, borderRadius: radii.small, backgroundColor: palette.white, color: palette.ink, fontSize: 12 }, textarea: { minHeight: 82, paddingTop: 11, textAlignVertical: 'top' }, submit: { minHeight: 46, flex: 1, borderRadius: radii.small, backgroundColor: palette.evergreen, alignItems: 'center', justifyContent: 'center' }, submitText: { color: palette.white, fontSize: 12, fontWeight: '700' }, secondary: { minHeight: 46, flex: 1, borderWidth: 1, borderColor: palette.evergreen, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: palette.evergreen, fontSize: 12, fontWeight: '700' }, actionRow: { flexDirection: 'row', gap: 8 }, disabled: { opacity: .42 },
})
