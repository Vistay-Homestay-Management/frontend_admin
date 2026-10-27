export interface RuntimeConfig {
  graphqlUrl: string
  oidcIssuer: string
  oidcClientId: string
  oidcRedirectUri: string
}

export type RuntimeConfigResult =
  | { config: RuntimeConfig; error?: never }
  | { config?: never; error: string }

export function readRuntimeConfig(): RuntimeConfigResult {
  const baseHost = window.location.hostname.replace(/^admin\./, '')
  const edgeProtocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
  const graphqlUrl = import.meta.env.VITE_GRAPHQL_URL?.trim()
    || `${edgeProtocol}//graphql.${baseHost}/graphql`
  const oidcIssuer = import.meta.env.VITE_OIDC_ISSUER?.trim()
    || `${edgeProtocol}//identity.${baseHost}/realms/vistay-backoffice`
  const oidcClientId = import.meta.env.VITE_OIDC_CLIENT_ID?.trim()
    || 'vistay-backoffice-web'
  const oidcRedirectUri = import.meta.env.VITE_OIDC_REDIRECT_URI?.trim()
    || `${window.location.origin}/auth/callback`

  return {
    config: {
      graphqlUrl,
      oidcIssuer: oidcIssuer.replace(/\/$/, ''),
      oidcClientId,
      oidcRedirectUri,
    },
  }
}
