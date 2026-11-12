import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import * as Crypto from 'expo-crypto'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  ApiError,
  createInventoryBlock,
  fetchInventoryBlocks,
  fetchPropertyAvailability,
  releaseInventoryBlock,
  type InventoryBlockManagementNode,
  type InventoryBlockManagementPage,
  type InventoryBlockStatus,
  type InventoryBlockType,
  type OperatorInventoryBlockType,
  type PropertyAvailabilityObservation,
} from '@vistay/admin-api-client'

import type { MobileWorkspaceProps } from './mobileRuntime'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'
type ErrorCopy = { title: string; detail: string; code?: string }
export type InventorySessionGuard = { pending?: boolean; unknownOutcome?: boolean }
export type InventoryWorkspaceProps = MobileWorkspaceProps & {
  sessionGuard?: InventorySessionGuard
  onPendingChange?: (pending: boolean) => void
  onUnknownOutcome?: () => void
}

type SessionSnapshot = { pending: boolean; unknownOutcome: boolean }
const EMPTY_SESSION_GUARD: SessionSnapshot = { pending: false, unknownOutcome: false }
const sessionGuards = new Map<string, SessionSnapshot>()
const inFlightTokens = new Map<string, number>()
const guardListeners = new Set<() => void>()
let nextGuardToken = 0

function emitGuardChange() {
  for (const listener of guardListeners) listener()
}

function subscribeSessionGuards(listener: () => void) {
  guardListeners.add(listener)
  return () => { guardListeners.delete(listener) }
}

function getAccountSessionGuard(accountId: string): SessionSnapshot {
  return sessionGuards.get(accountId) ?? EMPTY_SESSION_GUARD
}

function startAccountPending(accountId: string): number {
  const token = ++nextGuardToken
  inFlightTokens.set(accountId, token)
  const previous = getAccountSessionGuard(accountId)
  if (!previous.pending) sessionGuards.set(accountId, { pending: true, unknownOutcome: previous.unknownOutcome })
  emitGuardChange()
  return token
}

function finishAccountPending(accountId: string, token: number) {
  if (inFlightTokens.get(accountId) !== token) return
  inFlightTokens.delete(accountId)
  const previous = getAccountSessionGuard(accountId)
  if (previous.unknownOutcome) {
    sessionGuards.set(accountId, { pending: false, unknownOutcome: true })
  } else {
    sessionGuards.delete(accountId)
  }
  emitGuardChange()
}

function lockAccountUnknownOutcome(accountId: string) {
  const previous = getAccountSessionGuard(accountId)
  if (!previous.unknownOutcome) sessionGuards.set(accountId, { pending: previous.pending, unknownOutcome: true })
  emitGuardChange()
}

export function resetInventorySessionGuards() {
  sessionGuards.clear()
  inFlightTokens.clear()
  emitGuardChange()
}

const LOCAL_MANAGEMENT_PROPERTY = '61000000-0000-4000-8000-000000000010'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const OPERATOR_TYPES: OperatorInventoryBlockType[] = ['MAINTENANCE', 'CLEANING', 'OWNER_USE', 'MANUAL']

const typeLabels: Record<InventoryBlockType, string> = {
  BOOKING: 'Đặt phòng',
  MAINTENANCE: 'Bảo trì',
  CLEANING: 'Dọn phòng',
  OWNER_USE: 'Chủ nhà sử dụng',
  MANUAL: 'Khóa thủ công',
  CHANNEL: 'Kênh OTA',
}

const statusLabels: Record<InventoryBlockStatus, string> = {
  TENTATIVE: 'Tạm giữ',
  ACTIVE: 'Đang chặn',
  RELEASED: 'Đã giải phóng',
  CANCELLED: 'Đã hủy',
}

function isoToday(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function dateDistance(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}

function toErrorCopy(error: unknown): ErrorCopy {
  const apiError = error instanceof ApiError ? error : undefined
  const code = apiError?.code
  const titles: Record<string, string> = {
    INVENTORY_READ_FORBIDDEN: 'Bạn không có quyền xem căn này',
    INVENTORY_BLOCK_FORBIDDEN: 'Bạn không có quyền thay đổi tồn phòng',
    STALE_INVENTORY_REVISION: 'Dữ liệu vừa được người khác cập nhật',
    INVENTORY_BLOCK_CONFLICT: 'Khoảng ngày này đang bị chặn',
    PROPERTY_NOT_FOUND: 'Không tìm thấy căn lưu trú',
    PROPERTY_PARTITION_UNMAPPED: 'Căn chưa được gắn vào chi nhánh',
    PROPERTY_PARTITION_UNAVAILABLE: 'Chưa xác minh được chi nhánh của căn',
    AUTHORIZATION_UNAVAILABLE: 'Chưa xác minh được quyền hiện tại',
  }
  return {
    title: code && titles[code] ? titles[code] : 'Không thể hoàn tất yêu cầu',
    detail: 'Hãy làm mới dữ liệu và kiểm tra quyền hoặc kết nối trước khi thử lại.',
    code: code && titles[code] ? code : undefined,
  }
}

function validateWindow(propertyId: string, fromDate: string, toDateExclusive: string): ErrorCopy | undefined {
  if (!UUID_PATTERN.test(propertyId.trim().toLowerCase())) {
    return { title: 'Mã căn chưa hợp lệ', detail: 'Hãy nhập UUID của căn lưu trú.' }
  }
  if (![fromDate, toDateExclusive].every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value)) {
    return { title: 'Ngày chưa hợp lệ', detail: 'Nhập ngày có thật theo YYYY-MM-DD.' }
  }
  const days = dateDistance(fromDate, toDateExclusive)
  if (!Number.isFinite(days) || days < 1 || days > 31) {
    return { title: 'Khoảng xem chưa hợp lệ', detail: 'Chọn từ 1 đến 31 ngày; ngày kết thúc không nằm trong khoảng.' }
  }
}

function validateReason(reason: string): string | undefined {
  const length = reason.trim().length
  if (length < 10 || length > 1000) return 'Lý do phải có từ 10 đến 1000 ký tự.'
}

function canRelease(block: InventoryBlockManagementNode): boolean {
  return OPERATOR_TYPES.includes(block.type as OperatorInventoryBlockType)
    && (block.status === 'ACTIVE' || block.status === 'TENTATIVE')
}

function Field({ label, value, onChangeText, placeholder, multiline = false }: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8c968f"
        style={[styles.input, multiline && styles.textarea]}
        value={value}
      />
    </View>
  )
}

function BlockCard({ block, onPress }: { block: InventoryBlockManagementNode; onPress: () => void }) {
  const historical = block.status === 'RELEASED' || block.status === 'CANCELLED'
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.blockCard, historical && styles.blockCardHistory, pressed && styles.pressed]}
    >
      <View style={styles.blockTopline}>
        <Text style={styles.blockType}>{typeLabels[block.type]}</Text>
        <Text style={[styles.statusPill, historical && styles.statusPillHistory]}>{statusLabels[block.status]}</Text>
      </View>
      <Text style={styles.blockDates}>{block.startDate} → {block.endDateExclusive}</Text>
      <Text numberOfLines={2} style={styles.blockReason}>{block.reason || 'Không có lý do công khai'}</Text>
    </Pressable>
  )
}

export function InventoryWorkspace({ graphqlUrl, accessToken, viewer, runtime, sessionGuard, onPendingChange, onUnknownOutcome }: InventoryWorkspaceProps) {
  const today = useMemo(() => isoToday(), [])
  const [propertyId, setPropertyId] = useState(LOCAL_MANAGEMENT_PROPERTY)
  const [fromDate, setFromDate] = useState(today)
  const [toDateExclusive, setToDateExclusive] = useState(() => addDays(today, 14))
  const [page, setPage] = useState<InventoryBlockManagementPage>()
  const [availability, setAvailability] = useState<PropertyAvailabilityObservation>()
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [error, setError] = useState<ErrorCopy>()
  const [notice, setNotice] = useState<string>()
  const [selectedBlock, setSelectedBlock] = useState<InventoryBlockManagementNode>()
  const [createOpen, setCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<OperatorInventoryBlockType>('MAINTENANCE')
  const [createFrom, setCreateFrom] = useState(today)
  const [createTo, setCreateTo] = useState(() => addDays(today, 1))
  const [createReason, setCreateReason] = useState('')
  const [releaseReason, setReleaseReason] = useState('')
  const [commandStatus, setCommandStatus] = useState<'idle' | 'loading'>('idle')
  const [commandError, setCommandError] = useState<ErrorCopy>()
  const storeGuard = useSyncExternalStore(
    subscribeSessionGuards,
    useCallback(() => getAccountSessionGuard(viewer.accountId), [viewer.accountId]),
  )
  const effectivePending = Boolean(sessionGuard?.pending || storeGuard.pending)
  const effectiveUnknownOutcome = Boolean(sessionGuard?.unknownOutcome || storeGuard.unknownOutcome)
  const mounted = useRef(true)
  const pending = useRef(false)
  const currentPending = useRef(effectivePending)
  const currentUnknownOutcome = useRef(effectiveUnknownOutcome)
  const generation = useRef(0)
  const controller = useRef<AbortController | undefined>(undefined)
  const [observationKey, setObservationKey] = useState<string>()
  const principalKey = JSON.stringify([graphqlUrl, accessToken, viewer.accountId, viewer.authorizationVersion, viewer.permissions])
  const contextKey = JSON.stringify([principalKey, propertyId.trim().toLowerCase(), fromDate, toDateExclusive,
    runtime.isOnline, runtime.isActive, runtime.refreshEpoch])
  const currentContext = useRef(contextKey)
  const currentPrincipal = useRef(principalKey)
  const formKey = JSON.stringify([createOpen, createType, createFrom, createTo, createReason, selectedBlock?.inventoryBlockId, releaseReason])
  const currentForm = useRef(formKey)
  const ready = runtime.isOnline && runtime.isActive && status === 'ready' && observationKey === contextKey
  const writeReady = ready && viewer.permissions.includes('inventory:block') && !effectiveUnknownOutcome && !effectivePending
  const currentWriteReady = useRef(writeReady)
  const previousPrincipal = useRef(principalKey)
  const loadLatest = useRef<() => Promise<InventoryBlockManagementPage | undefined>>(async () => undefined)
  const canManage = viewer.permissions.includes('inventory:block')
  const isBusy = effectivePending || commandStatus === 'loading'

  const load = useCallback(async (quiet = false): Promise<InventoryBlockManagementPage | undefined> => {
    if (currentContext.current !== contextKey || !runtime.isOnline || !runtime.isActive) return undefined
    const request = ++generation.current
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setObservationKey(undefined)
    currentWriteReady.current = false
    const normalizedId = propertyId.trim().toLowerCase()
    const validation = validateWindow(normalizedId, fromDate, toDateExclusive)
    if (validation) {
      setError(validation)
      setStatus('error')
      return undefined
    }
    if (!quiet) setStatus('loading')
    setError(undefined)
    try {
      const [nextPage, observation] = await Promise.all([
        fetchInventoryBlocks(graphqlUrl, accessToken, {
          propertyId: normalizedId,
          fromDate,
          toDateExclusive,
          first: 100,
        }, abort.signal),
        fetchPropertyAvailability(graphqlUrl, accessToken, normalizedId, fromDate, toDateExclusive, abort.signal),
      ])
      if (nextPage.inventoryRevision !== observation.inventoryRevision
        || nextPage.branchId !== observation.branchId
        || nextPage.propertyMembershipVersion !== observation.propertyMembershipVersion
        || observation.propertyId !== normalizedId || observation.checkInDate !== fromDate
        || observation.checkOutDate !== toDateExclusive
        || nextPage.nodes.some((node) => node.propertyId !== normalizedId)) {
        throw new Error('Hai phép đọc không cùng revision hoặc phân vùng. Hãy làm mới trước khi thao tác.')
      }
      if (!mounted.current || request !== generation.current || currentContext.current !== contextKey) return undefined
      setObservationKey(contextKey)
      setPage(nextPage)
      setAvailability(observation)
      setSelectedBlock((current) => nextPage.nodes.find((node) => node.inventoryBlockId === current?.inventoryBlockId))
      setStatus('ready')
      return nextPage
    } catch (reason) {
      if (!mounted.current || request !== generation.current || currentContext.current !== contextKey) return undefined
      setError(toErrorCopy(reason))
      setStatus('error')
      return undefined
    }
  }, [accessToken, fromDate, graphqlUrl, propertyId, toDateExclusive, contextKey, runtime.isOnline, runtime.isActive])
  useLayoutEffect(() => {
    currentContext.current = contextKey
    currentPrincipal.current = principalKey
    currentForm.current = formKey
    currentWriteReady.current = writeReady
    currentPending.current = effectivePending
    currentUnknownOutcome.current = effectiveUnknownOutcome
    loadLatest.current = () => load()
  }, [contextKey, principalKey, formKey, writeReady, effectivePending, effectiveUnknownOutcome, load])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort() }
  }, [])

  useEffect(() => {
    generation.current++
    controller.current?.abort()
    let cancelled = false
    queueMicrotask(() => {
    if (cancelled) return
    setObservationKey(undefined)
    setNotice(undefined)
    setCommandError(undefined)
    if (previousPrincipal.current !== principalKey) {
      previousPrincipal.current = principalKey
      setPage(undefined)
      setAvailability(undefined)
      setSelectedBlock(undefined)
      setCreateOpen(false)
      setCreateReason('')
      setReleaseReason('')
    }
    if (runtime.isOnline && runtime.isActive) void loadLatest.current()
    })
    return () => { cancelled = true }
  }, [principalKey, runtime.isOnline, runtime.isActive, runtime.refreshEpoch])

  async function refreshBeforeCommand(): Promise<InventoryBlockManagementPage | undefined> {
    setNotice('Đang xác minh revision mới nhất trước khi ghi…')
    const freshPage = await load(true)
    if (!freshPage) setNotice(undefined)
    return freshPage
  }

  async function executeGuardedCommand<T extends { commandId: string; inventoryRevision: string }>(
    prepare: (freshPage: InventoryBlockManagementPage) => boolean,
    send: (freshPage: InventoryBlockManagementPage, correlationId: string) => Promise<T>,
    onSuccess: (result: T) => void,
    successText: (result: T) => string,
  ) {
    if (pending.current || currentPending.current || currentUnknownOutcome.current || !currentWriteReady.current || currentContext.current !== contextKey) return
    pending.current = true
    const intentAccountId = viewer.accountId
    const intentPrincipal = principalKey
    const intentForm = formKey
    const guardToken = startAccountPending(intentAccountId)
    onPendingChange?.(true)
    let dispatched = false
    setCommandStatus('loading')
    setCommandError(undefined)
    try {
      const freshPage = await refreshBeforeCommand()
      if (!freshPage) return
      if (currentContext.current !== contextKey || currentPrincipal.current !== intentPrincipal || currentForm.current !== intentForm || !mounted.current) return
      if (!prepare(freshPage)) return
      const correlationId = Crypto.randomUUID()
      dispatched = true
      const result = await send(freshPage, correlationId)
      if (currentPrincipal.current !== intentPrincipal) return
      if (!mounted.current) return
      onSuccess(result)
      setNotice(successText(result))
      if (currentContext.current === contextKey) {
        const refreshed = await load(true)
        if (!refreshed && mounted.current && currentContext.current === contextKey) {
          setNotice(`Đã ghi nhận lệnh ${result.commandId}; dữ liệu chưa đồng bộ. Hãy làm mới, không gửi lại lệnh.`)
        }
      }
    } catch (reason) {
      if (currentPrincipal.current !== intentPrincipal) return
      if (dispatched && (!(reason instanceof ApiError) || !reason.code)) {
        lockAccountUnknownOutcome(intentAccountId)
        onUnknownOutcome?.()
        if (mounted.current) {
          setObservationKey(undefined)
          setCommandError({ title: 'Chưa xác định kết quả lệnh', detail: 'Không gửi lại. Hãy đối chiếu lịch sử và liên hệ vận hành để xác minh lệnh.' })
        }
        return
      }
      if (!mounted.current || currentContext.current !== contextKey) return
      const copy = toErrorCopy(reason)
      setObservationKey(undefined)
      setCommandError(copy)
      setNotice(undefined)
      if (copy.code === 'STALE_INVENTORY_REVISION' || copy.code === 'INVENTORY_BLOCK_CONFLICT') await load(true)
    } finally {
      pending.current = false
      finishAccountPending(intentAccountId, guardToken)
      onPendingChange?.(false)
      if (mounted.current) setCommandStatus('idle')
    }
  }

  async function handleCreate() {
    if (pending.current || currentPending.current || currentUnknownOutcome.current || !currentWriteReady.current || currentContext.current !== contextKey) return
    const reasonError = validateReason(createReason)
    const windowError = validateWindow(propertyId, createFrom, createTo)
    if (reasonError || windowError) {
      setCommandError(windowError ?? { title: 'Lý do chưa hợp lệ', detail: reasonError! })
      return
    }
    await executeGuardedCommand(
      () => true,
      (freshPage, correlationId) => createInventoryBlock(graphqlUrl, accessToken, {
        propertyId: propertyId.trim().toLowerCase(),
        blockType: createType,
        startDate: createFrom,
        endDateExclusive: createTo,
        reason: createReason.trim(),
        expectedInventoryRevision: freshPage.inventoryRevision,
        correlationId,
        idempotencyKey: `admin-mobile-create-${correlationId}`,
      }),
      () => { setCreateOpen(false); setCreateReason('') },
      (result) => `Đã ghi nhận lệnh ${result.commandId} · Revision ${result.inventoryRevision}.`,
    )
  }

  async function handleRelease() {
    if (pending.current || currentPending.current || currentUnknownOutcome.current || !currentWriteReady.current || currentContext.current !== contextKey) return
    if (!selectedBlock || !canRelease(selectedBlock)) return
    const reasonError = validateReason(releaseReason)
    if (reasonError) {
      setCommandError({ title: 'Lý do chưa hợp lệ', detail: reasonError })
      return
    }
    const targetBlockId = selectedBlock.inventoryBlockId
    let resolvedBlock: InventoryBlockManagementNode | undefined
    await executeGuardedCommand(
      (freshPage) => {
        resolvedBlock = freshPage.nodes.find((node) => node.inventoryBlockId === targetBlockId)
        if (!resolvedBlock || !canRelease(resolvedBlock)) {
          setCommandError({ title: 'Block không còn khả dụng', detail: 'Dữ liệu đã đổi. Danh sách vừa được làm mới.' })
          return false
        }
        return true
      },
      (freshPage, correlationId) => releaseInventoryBlock(graphqlUrl, accessToken, {
        propertyId: propertyId.trim().toLowerCase(),
        inventoryBlockId: resolvedBlock!.inventoryBlockId,
        expectedInventoryRevision: freshPage.inventoryRevision,
        reason: releaseReason.trim(),
        correlationId,
        idempotencyKey: `admin-mobile-release-${correlationId}`,
      }),
      () => { setSelectedBlock(undefined); setReleaseReason('') },
      (result) => `Đã giải phóng theo lệnh ${result.commandId} · Revision ${result.inventoryRevision}.`,
    )
  }

  const active = page?.nodes.filter((node) => node.status === 'ACTIVE' || node.status === 'TENTATIVE') ?? []
  const history = page?.nodes.filter((node) => node.status === 'RELEASED' || node.status === 'CANCELLED') ?? []

  return (
    <View style={styles.workspace}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>TỒN PHÒNG THEO CĂN</Text>
          <Text style={styles.title}>Rõ khoảng trống.{`\n`}Chắc từng lệnh ghi.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !writeReady || isBusy, busy: isBusy }}
          disabled={!writeReady || isBusy}
          onPress={() => { if (writeReady && !pending.current && !effectivePending && !effectiveUnknownOutcome) { setCreateOpen(true); setCommandError(undefined) } }}
          style={({ pressed }) => [styles.createButton, (!writeReady || isBusy) && styles.disabled, pressed && styles.pressed]}
        >
          <Text style={styles.createButtonText}>Tạo block</Text>
        </Pressable>
      </View>

      <View style={styles.filterCard}>
        <Field label="Mã căn" value={propertyId} onChangeText={setPropertyId} placeholder="UUID căn lưu trú" />
        <View style={styles.dateRow}>
          <View style={styles.dateField}><Field label="Từ ngày" value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" /></View>
          <View style={styles.dateField}><Field label="Đến trước ngày" value={toDateExclusive} onChangeText={setToDateExclusive} placeholder="YYYY-MM-DD" /></View>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: status === 'loading', busy: status === 'loading' }} disabled={status === 'loading'} onPress={() => void load()} style={({ pressed }) => [styles.applyButton, pressed && styles.pressed]}>
          {status === 'loading' ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.applyButtonText}>Áp dụng và làm mới</Text>}
        </Pressable>
      </View>

      {effectiveUnknownOutcome && (
        <View accessibilityRole="alert" style={styles.errorCard}>
          <Text style={styles.errorTitle}>Chưa xác định kết quả lệnh</Text>
          <Text style={styles.errorDetail}>Không gửi lại. Hãy đối chiếu lịch sử và liên hệ vận hành để xác minh lệnh.</Text>
        </View>
      )}
      {notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
      {!ready && page && <Text accessibilityRole="alert" style={styles.notice}>Dữ liệu cũ — chỉ xem. Áp dụng bộ lọc và làm mới khi có mạng, ứng dụng đang hoạt động.</Text>}
      {error && status === 'error' && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>{error.title}</Text>
          <Text style={styles.errorDetail}>{error.detail}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.errorAction}>Thử lại</Text></Pressable>
        </View>
      )}

      {status === 'loading' && !page ? (
        <View style={styles.loading}><ActivityIndicator color="#17231d" /><Text style={styles.muted}>Đang đồng bộ sơ đồ phòng…</Text></View>
      ) : page ? (
        <>
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryCard, availability?.available && styles.summaryAvailable]}>
              <Text style={styles.summaryLabel}>KHOẢNG ĐANG XEM</Text>
              <Text style={styles.summaryValue}>{availability?.available ? 'Có thể bán' : 'Đang bị chặn'}</Text>
              <Text style={styles.summaryNote}>{availability?.overlaps.length ?? 0} khoảng giao nhau</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>BLOCK HIỆU LỰC ĐÃ TẢI</Text>
              <Text style={styles.summaryNumber}>{active.length}</Text>
              <Text style={styles.summaryNote}>Revision {page.inventoryRevision}</Text>
            </View>
          </View>
          <View style={styles.partitionCard}>
            <Text style={styles.partitionLabel}>CHI NHÁNH ĐÃ XÁC MINH</Text>
            <Text style={styles.partitionValue}>{shortId(page.branchId)}</Text>
            <Text style={styles.partitionMeta}>Membership v{page.propertyMembershipVersion} · ngày kết thúc là exclusive</Text>
          </View>
          {page.pageInfo.hasNextPage && <Text accessibilityRole="alert" style={styles.notice}>Kết quả vượt quá 100 block. Hãy thu hẹp khoảng ngày trước khi thao tác.</Text>}

          <View style={styles.listHeader}><Text style={styles.sectionTitle}>Đang hiệu lực</Text><Text style={styles.count}>{active.length}</Text></View>
          {active.length ? active.map((block) => <BlockCard key={block.inventoryBlockId} block={block} onPress={() => { setSelectedBlock(block); setCommandError(undefined) }} />) : (
            <View style={styles.empty}><Text style={styles.emptyTitle}>Không có block hiệu lực</Text><Text style={styles.muted}>Khoảng ngày này hiện không có block đang hoạt động.</Text></View>
          )}

          <View style={styles.listHeader}><Text style={styles.sectionTitle}>Lịch sử</Text><Text style={styles.count}>{history.length}</Text></View>
          {history.length ? history.map((block) => <BlockCard key={block.inventoryBlockId} block={block} onPress={() => { setSelectedBlock(block); setCommandError(undefined) }} />) : (
            <View style={styles.empty}><Text style={styles.emptyTitle}>Chưa có lịch sử</Text><Text style={styles.muted}>Block đã release hoặc hủy sẽ xuất hiện tại đây.</Text></View>
          )}
        </>
      ) : null}

      <Modal animationType="slide" onRequestClose={() => setCreateOpen(false)} transparent visible={createOpen}>
        <View style={styles.modalBackdrop}><ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" style={styles.sheet}>
          <View style={styles.sheetHeader}><View><Text style={styles.eyebrow}>LỆNH CÓ REVISION</Text><Text style={styles.sheetTitle}>Tạo block vận hành</Text></View><Pressable onPress={() => setCreateOpen(false)}><Text style={styles.close}>Đóng</Text></Pressable></View>
          <Text style={styles.helper}>Lệnh sẽ tải revision mới nhất trước khi gửi; không tự retry và không lưu offline.</Text>
          <Text style={styles.fieldLabel}>Loại block</Text>
          <View style={styles.typeGrid}>{OPERATOR_TYPES.map((type) => <Pressable key={type} onPress={() => setCreateType(type)} style={[styles.typeChip, createType === type && styles.typeChipActive]}><Text style={[styles.typeChipText, createType === type && styles.typeChipTextActive]}>{typeLabels[type]}</Text></Pressable>)}</View>
          <View style={styles.dateRow}><View style={styles.dateField}><Field label="Bắt đầu" value={createFrom} onChangeText={setCreateFrom} placeholder="YYYY-MM-DD" /></View><View style={styles.dateField}><Field label="Kết thúc exclusive" value={createTo} onChangeText={setCreateTo} placeholder="YYYY-MM-DD" /></View></View>
          <Field label="Lý do (10–1000 ký tự)" value={createReason} onChangeText={setCreateReason} multiline />
          {commandError && <View style={styles.inlineError}><Text style={styles.errorTitle}>{commandError.title}</Text><Text style={styles.errorDetail}>{commandError.detail}</Text></View>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !writeReady || isBusy, busy: isBusy }} disabled={!writeReady || isBusy} onPress={() => void handleCreate()} style={[styles.confirmButton, (!writeReady || isBusy) && styles.disabled]}>{isBusy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.confirmText}>Xác nhận tạo block</Text>}</Pressable>
        </ScrollView></View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setSelectedBlock(undefined)} transparent visible={Boolean(selectedBlock)}>
        <View style={styles.modalBackdrop}><ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled" style={styles.sheet}>
          {selectedBlock && <>
            <View style={styles.sheetHeader}><View><Text style={styles.eyebrow}>CHI TIẾT BLOCK</Text><Text style={styles.sheetTitle}>{typeLabels[selectedBlock.type]}</Text></View><Pressable onPress={() => setSelectedBlock(undefined)}><Text style={styles.close}>Đóng</Text></Pressable></View>
            <View style={styles.detailRows}>
              <Text style={styles.detail}>Trạng thái · {statusLabels[selectedBlock.status]}</Text>
              <Text style={styles.detail}>Khoảng · {selectedBlock.startDate} → {selectedBlock.endDateExclusive}</Text>
              <Text style={styles.detail}>Version · {selectedBlock.blockVersion}</Text>
              <Text style={styles.detail}>ID · {shortId(selectedBlock.inventoryBlockId)}</Text>
              {selectedBlock.channelProvider && <Text style={styles.detail}>Kênh · {selectedBlock.channelProvider}</Text>}
            </View>
            <Text style={styles.reasonCopy}>{selectedBlock.reason || 'Không có lý do công khai.'}</Text>
            {canManage && canRelease(selectedBlock) ? <>
              <Field label="Lý do release (10–1000 ký tự)" value={releaseReason} onChangeText={setReleaseReason} multiline />
              {commandError && <View style={styles.inlineError}><Text style={styles.errorTitle}>{commandError.title}</Text><Text style={styles.errorDetail}>{commandError.detail}</Text></View>}
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !writeReady || isBusy, busy: isBusy }} disabled={!writeReady || isBusy} onPress={() => void handleRelease()} style={[styles.releaseButton, (!writeReady || isBusy) && styles.disabled]}>{isBusy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.confirmText}>Xác nhận giải phóng</Text>}</Pressable>
            </> : <Text style={styles.readOnly}>Block từ booking/kênh hoặc trạng thái kết thúc chỉ được xem tại đây.</Text>}
          </>}
        </ScrollView></View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  workspace: { marginTop: 34 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flex: 1 },
  eyebrow: { color: '#68756e', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  title: { marginTop: 8, color: '#17231d', fontSize: 30, lineHeight: 31, fontWeight: '700', letterSpacing: -1.4 },
  createButton: { minHeight: 44, paddingHorizontal: 15, borderRadius: 12, backgroundColor: '#17231d', alignItems: 'center', justifyContent: 'center' },
  createButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  filterCard: { marginTop: 22, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#d9ddd7', backgroundColor: '#fffef9', gap: 12 },
  field: { gap: 6 },
  fieldLabel: { color: '#68756e', fontSize: 10, fontWeight: '700', letterSpacing: .5 },
  input: { minHeight: 46, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: '#d9ddd7', backgroundColor: '#f7f6f0', color: '#17231d', fontSize: 12 },
  textarea: { minHeight: 82, paddingTop: 12, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1 },
  applyButton: { minHeight: 46, borderRadius: 11, backgroundColor: '#3d654f', alignItems: 'center', justifyContent: 'center' },
  applyButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  notice: { marginTop: 12, padding: 12, borderRadius: 11, backgroundColor: '#e5f2dd', color: '#365841', fontSize: 11, lineHeight: 17 },
  errorCard: { marginTop: 12, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#edc3ba', backgroundColor: '#fff7f4' },
  errorTitle: { color: '#6f2f27', fontSize: 12, fontWeight: '700' },
  errorDetail: { marginTop: 4, color: '#a74235', fontSize: 11, lineHeight: 16 },
  errorAction: { marginTop: 10, color: '#3d654f', fontSize: 11, fontWeight: '700' },
  loading: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: '#68756e', fontSize: 11, lineHeight: 17 },
  summaryGrid: { marginTop: 16, flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, minHeight: 140, padding: 15, borderRadius: 17, borderWidth: 1, borderColor: '#d9ddd7', backgroundColor: '#fffef9' },
  summaryAvailable: { backgroundColor: '#d9ff63', borderColor: '#c5e651' },
  summaryLabel: { color: '#68756e', fontSize: 9, fontWeight: '700', letterSpacing: .8 },
  summaryValue: { marginTop: 'auto', color: '#17231d', fontSize: 20, lineHeight: 22, fontWeight: '700' },
  summaryNumber: { marginTop: 'auto', color: '#17231d', fontSize: 38, lineHeight: 40, fontWeight: '700' },
  summaryNote: { marginTop: 5, color: '#54665c', fontSize: 10 },
  partitionCard: { marginTop: 10, padding: 15, borderRadius: 14, backgroundColor: '#17231d' },
  partitionLabel: { color: '#95a29a', fontSize: 9, fontWeight: '700', letterSpacing: .8 },
  partitionValue: { marginTop: 7, color: '#ffffff', fontSize: 17, fontWeight: '700' },
  partitionMeta: { marginTop: 4, color: '#aeb9b2', fontSize: 10 },
  listHeader: { marginTop: 30, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#17231d', fontSize: 21, fontWeight: '700', letterSpacing: -.6 },
  count: { minWidth: 28, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 20, backgroundColor: '#e6e8e0', color: '#52645a', textAlign: 'center', fontSize: 10, fontWeight: '700' },
  blockCard: { marginBottom: 9, padding: 15, borderRadius: 15, borderWidth: 1, borderColor: '#d9ddd7', backgroundColor: '#fffef9' },
  blockCardHistory: { opacity: .72, backgroundColor: '#f0efe9' },
  blockTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  blockType: { flex: 1, color: '#17231d', fontSize: 14, fontWeight: '700' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, overflow: 'hidden', backgroundColor: '#dff0d6', color: '#365841', fontSize: 9, fontWeight: '700' },
  statusPillHistory: { backgroundColor: '#dedfd9', color: '#68756e' },
  blockDates: { marginTop: 9, color: '#3d654f', fontSize: 11, fontWeight: '600' },
  blockReason: { marginTop: 5, color: '#68756e', fontSize: 11, lineHeight: 16 },
  empty: { padding: 22, borderRadius: 15, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cfd4cd', alignItems: 'center' },
  emptyTitle: { color: '#17231d', fontSize: 13, fontWeight: '700', marginBottom: 5 },
  modalBackdrop: { flex: 1, paddingTop: 80, justifyContent: 'flex-end', backgroundColor: 'rgba(12, 22, 16, .48)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#fffef9' },
  sheetContent: { padding: 20, paddingBottom: 34, gap: 14 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  sheetTitle: { marginTop: 5, color: '#17231d', fontSize: 24, fontWeight: '700', letterSpacing: -.8 },
  close: { padding: 8, color: '#3d654f', fontSize: 12, fontWeight: '700' },
  helper: { color: '#68756e', fontSize: 11, lineHeight: 17 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: '#ebede7' },
  typeChipActive: { backgroundColor: '#17231d' },
  typeChipText: { color: '#52645a', fontSize: 10, fontWeight: '700' },
  typeChipTextActive: { color: '#ffffff' },
  inlineError: { padding: 12, borderRadius: 11, backgroundColor: '#fff0ec' },
  confirmButton: { minHeight: 50, borderRadius: 13, backgroundColor: '#3d654f', alignItems: 'center', justifyContent: 'center' },
  releaseButton: { minHeight: 50, borderRadius: 13, backgroundColor: '#a74235', alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  detailRows: { padding: 14, borderRadius: 13, backgroundColor: '#f0f2ec', gap: 7 },
  detail: { color: '#52645a', fontSize: 11 },
  reasonCopy: { color: '#17231d', fontSize: 12, lineHeight: 18 },
  readOnly: { padding: 13, borderRadius: 11, backgroundColor: '#ecece7', color: '#68756e', fontSize: 11, lineHeight: 17 },
  disabled: { opacity: .42 },
  pressed: { opacity: .68 },
})
