#!/bin/sh
set -eu

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

graphql_url=$(json_escape "${VISTAY_GRAPHQL_URL:-}")
auth_api_url=$(json_escape "${VISTAY_AUTH_API_URL:-}")
oidc_issuer=$(json_escape "${VISTAY_OIDC_ISSUER:-}")
oidc_client_id=$(json_escape "${VISTAY_OIDC_CLIENT_ID:-}")
oidc_redirect_uri=$(json_escape "${VISTAY_OIDC_REDIRECT_URI:-}")
oidc_post_logout_redirect_uri=$(json_escape "${VISTAY_OIDC_POST_LOGOUT_REDIRECT_URI:-}")

case "${VISTAY_NOTIFICATION_PUSH_ENABLED:-false}" in
  true|TRUE|1) notification_push_enabled=true ;;
  *) notification_push_enabled=false ;;
esac

printf 'window.__VISTAY_RUNTIME_CONFIG__ = {"graphqlUrl":"%s","authApiUrl":"%s","oidcIssuer":"%s","oidcClientId":"%s","oidcRedirectUri":"%s","oidcPostLogoutRedirectUri":"%s","notificationPushEnabled":%s};\n' \
  "$graphql_url" "$auth_api_url" "$oidc_issuer" "$oidc_client_id" \
  "$oidc_redirect_uri" "$oidc_post_logout_redirect_uri" "$notification_push_enabled" \
  > /tmp/runtime-config.js
