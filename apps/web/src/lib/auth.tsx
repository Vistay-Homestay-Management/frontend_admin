import type { PropsWithChildren } from 'react'
import { WebStorageStateStore } from 'oidc-client-ts'
import { AuthProvider } from 'react-oidc-context'
import type { RuntimeConfig } from './config'

interface BackofficeAuthProviderProps extends PropsWithChildren {
  config: RuntimeConfig
}

export function BackofficeAuthProvider({ config, children }: BackofficeAuthProviderProps) {
  return (
    <AuthProvider
      authority={config.oidcIssuer}
      client_id={config.oidcClientId}
      redirect_uri={config.oidcRedirectUri}
      post_logout_redirect_uri={window.location.origin}
      response_type="code"
      scope="openid profile email notifications:read"
      automaticSilentRenew
      loadUserInfo
      userStore={new WebStorageStateStore({ store: window.sessionStorage })}
      onSigninCallback={() => {
        window.history.replaceState({}, document.title, window.location.pathname)
      }}
    >
      {children}
    </AuthProvider>
  )
}
