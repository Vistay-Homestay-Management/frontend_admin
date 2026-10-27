export interface MobileConfig {
  graphqlUrl: string
  oidcIssuer: string
  oidcClientId: string
  oidcRedirectUri?: string
}

export type MobileConfigResult =
  | { config: MobileConfig; error?: never }
  | { config?: never; error: string }

export function readMobileConfig(): MobileConfigResult {
  const graphqlUrl = process.env.EXPO_PUBLIC_GRAPHQL_URL?.trim()
  const oidcIssuer = process.env.EXPO_PUBLIC_OIDC_ISSUER?.trim()
  const oidcClientId = process.env.EXPO_PUBLIC_OIDC_CLIENT_ID?.trim()
  const missing = [
    ['EXPO_PUBLIC_GRAPHQL_URL', graphqlUrl],
    ['EXPO_PUBLIC_OIDC_ISSUER', oidcIssuer],
    ['EXPO_PUBLIC_OIDC_CLIENT_ID', oidcClientId],
  ].filter(([, value]) => !value).map(([name]) => name)

  if (missing.length) return { error: `Thiếu cấu hình: ${missing.join(', ')}` }
  return {
    config: {
      graphqlUrl: graphqlUrl!,
      oidcIssuer: oidcIssuer!.replace(/\/$/, ''),
      oidcClientId: oidcClientId!,
      oidcRedirectUri: process.env.EXPO_PUBLIC_OIDC_REDIRECT_URI?.trim() || undefined,
    },
  }
}
