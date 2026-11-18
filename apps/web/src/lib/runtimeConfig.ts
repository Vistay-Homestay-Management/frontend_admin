export interface ViStayRuntimeConfig {
  graphqlUrl?: string
  authApiUrl?: string
  oidcIssuer?: string
  oidcClientId?: string
  oidcRedirectUri?: string
  oidcPostLogoutRedirectUri?: string
  notificationPushEnabled?: boolean
}

declare global {
  interface Window {
    __VISTAY_RUNTIME_CONFIG__?: ViStayRuntimeConfig
  }
}

export const runtimeConfig = window.__VISTAY_RUNTIME_CONFIG__ ?? {}
