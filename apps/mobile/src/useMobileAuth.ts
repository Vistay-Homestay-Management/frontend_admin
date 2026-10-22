import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  exchangeCodeAsync,
  makeRedirectUri,
  refreshAsync,
  ResponseType,
  revokeAsync,
  TokenTypeHint,
  useAuthRequest,
  useAutoDiscovery,
  type TokenResponse,
} from 'expo-auth-session'
import * as SecureStore from 'expo-secure-store'
import type { MobileConfig } from './config'

const ACCESS_TOKEN_KEY = 'vistay.auth.access-token'
const REFRESH_TOKEN_KEY = 'vistay.auth.refresh-token'
const ID_TOKEN_KEY = 'vistay.auth.id-token'
const TOKEN_META_KEY = 'vistay.auth.token-meta'
const SCOPES = ['openid', 'profile', 'email', 'notifications:read']

interface StoredSession {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn?: number
  issuedAt: number
  scope?: string
}

type AuthStatus = 'loading' | 'signedOut' | 'authorizing' | 'authenticated' | 'error'

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể hoàn tất đăng nhập'
}

function isFresh(session: StoredSession): boolean {
  if (!session.expiresIn) return true
  return session.issuedAt + session.expiresIn - 60 > Date.now() / 1_000
}

async function saveSession(session: StoredSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken),
    session.refreshToken
      ? SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken)
      : SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    session.idToken
      ? SecureStore.setItemAsync(ID_TOKEN_KEY, session.idToken)
      : SecureStore.deleteItemAsync(ID_TOKEN_KEY),
    SecureStore.setItemAsync(TOKEN_META_KEY, JSON.stringify({
      expiresIn: session.expiresIn,
      issuedAt: session.issuedAt,
      scope: session.scope,
    })),
  ])
}

async function loadSession(): Promise<StoredSession | undefined> {
  const [accessToken, refreshToken, idToken, metadata] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(ID_TOKEN_KEY),
    SecureStore.getItemAsync(TOKEN_META_KEY),
  ])
  if (!accessToken || !metadata) return undefined
  const parsed = JSON.parse(metadata) as Pick<StoredSession, 'expiresIn' | 'issuedAt' | 'scope'>
  return {
    accessToken,
    refreshToken: refreshToken ?? undefined,
    idToken: idToken ?? undefined,
    ...parsed,
  }
}

async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(ID_TOKEN_KEY),
    SecureStore.deleteItemAsync(TOKEN_META_KEY),
  ])
}

function fromTokenResponse(response: TokenResponse, previous?: StoredSession): StoredSession {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken ?? previous?.refreshToken,
    idToken: response.idToken ?? previous?.idToken,
    expiresIn: response.expiresIn,
    issuedAt: response.issuedAt ?? Math.floor(Date.now() / 1_000),
    scope: response.scope,
  }
}

export function useMobileAuth(config: MobileConfig) {
  const discovery = useAutoDiscovery(config.oidcIssuer)
  const redirectUri = useMemo(
    () => config.oidcRedirectUri ?? makeRedirectUri({ scheme: 'vistay-admin', path: 'oauth/callback' }),
    [config.oidcRedirectUri],
  )
  const [request, response, promptAsync] = useAuthRequest({
    clientId: config.oidcClientId,
    redirectUri,
    responseType: ResponseType.Code,
    scopes: SCOPES,
    usePKCE: true,
  }, discovery)
  const [session, setSession] = useState<StoredSession>()
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (discovery) return
    const timeout = setTimeout(() => {
      setError('Không tải được cấu hình OIDC. Kiểm tra mạng và địa chỉ Backoffice Realm.')
      setStatus('error')
    }, 12_000)
    return () => clearTimeout(timeout)
  }, [discovery])

  const refresh = useCallback(async (current: StoredSession) => {
    if (!discovery?.tokenEndpoint || !current.refreshToken) {
      await clearSession()
      setSession(undefined)
      setStatus('signedOut')
      return
    }
    try {
      const token = await refreshAsync({
        clientId: config.oidcClientId,
        refreshToken: current.refreshToken,
        scopes: SCOPES,
      }, discovery)
      const next = fromTokenResponse(token, current)
      await saveSession(next)
      setSession(next)
      setError(undefined)
      setStatus('authenticated')
    } catch (reason) {
      await clearSession()
      setSession(undefined)
      setError(message(reason))
      setStatus('error')
    }
  }, [config.oidcClientId, discovery])

  useEffect(() => {
    if (!discovery) return
    let active = true
    void loadSession()
      .then(async (stored) => {
        if (!active) return
        if (!stored) {
          setStatus('signedOut')
          return
        }
        if (isFresh(stored)) {
          setSession(stored)
          setStatus('authenticated')
          return
        }
        await refresh(stored)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setError(message(reason))
        setStatus('error')
      })
    return () => { active = false }
  }, [discovery, refresh])

  useEffect(() => {
    if (!response || !discovery || !request) return
    const authResponse = response
    const authDiscovery = discovery
    const authRequest = request
    let active = true
    async function handleResponse() {
      await Promise.resolve()
      if (!active) return
      if (authResponse.type === 'cancel' || authResponse.type === 'dismiss') {
        setStatus('signedOut')
        return
      }
      if (authResponse.type === 'error') {
        setError(authResponse.error?.message ?? 'Nhà cung cấp danh tính từ chối yêu cầu')
        setStatus('error')
        return
      }
      if (authResponse.type !== 'success' || !authResponse.params.code || !authRequest.codeVerifier) return

      setStatus('authorizing')
      try {
        const token = await exchangeCodeAsync({
          clientId: config.oidcClientId,
          code: authResponse.params.code,
          redirectUri,
          scopes: SCOPES,
          extraParams: { code_verifier: authRequest.codeVerifier },
        }, authDiscovery)
        const next = fromTokenResponse(token)
        await saveSession(next)
        if (!active) return
        setSession(next)
        setError(undefined)
        setStatus('authenticated')
      } catch (reason) {
        if (!active) return
        setError(message(reason))
        setStatus('error')
      }
    }
    void handleResponse()
    return () => { active = false }
  }, [config.oidcClientId, discovery, redirectUri, request, response])

  useEffect(() => {
    if (!session?.expiresIn || !session.refreshToken) return
    const refreshAt = (session.issuedAt + session.expiresIn - 60) * 1_000
    const delay = Math.max(refreshAt - Date.now(), 1_000)
    const timeout = setTimeout(() => void refresh(session), delay)
    return () => clearTimeout(timeout)
  }, [refresh, session])

  const login = useCallback(async () => {
    setError(undefined)
    setStatus('authorizing')
    const result = await promptAsync()
    if (result.type === 'cancel' || result.type === 'dismiss') setStatus('signedOut')
  }, [promptAsync])

  const logout = useCallback(async () => {
    let warning: string | undefined
    if (session?.refreshToken && discovery?.revocationEndpoint) {
      try {
        await revokeAsync({
          clientId: config.oidcClientId,
          token: session.refreshToken,
          tokenTypeHint: TokenTypeHint.RefreshToken,
        }, { revocationEndpoint: discovery.revocationEndpoint })
      } catch {
        warning = 'Đã xóa phiên trên thiết bị nhưng chưa thể thu hồi phiên từ máy chủ.'
      }
    }
    await clearSession()
    setSession(undefined)
    setError(warning)
    setStatus('signedOut')
  }, [config.oidcClientId, discovery, session])

  return {
    accessToken: session?.accessToken,
    error,
    login,
    logout,
    readyToLogin: Boolean(request && discovery),
    status,
  }
}
