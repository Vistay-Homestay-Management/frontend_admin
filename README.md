# ViStay Backoffice Applications

The Backoffice web portal and Expo mobile application implement the Epic 01
walking skeleton against the contracts in
`platform_contracts/graphql/backoffice`.

Both clients perform the same real flow:

1. Sign in to the isolated `vistay-backoffice` Keycloak realm with OIDC
   Authorization Code + PKCE (S256).
2. Query the authenticated `viewer` through Caddy and the Backoffice Hive
   Router.
3. Subscribe to `notificationStream(afterCursor)` over GraphQL-over-SSE.
4. Persist each opaque cursor, reconnect with bounded exponential backoff, and
   deduplicate at-least-once deliveries by notification ID.

No client secret belongs in this repository or in either application. The two
public Keycloak clients are intentionally different:

- Web: `vistay-backoffice-web`, redirect `http://admin.localhost/*` locally.
- Mobile: `vistay-backoffice-mobile`, redirect
  `vistay-admin://oauth/callback` in a development/production build.

## Configuration

Copy the relevant example before running a client:

```powershell
Copy-Item apps/web/.env.example apps/web/.env
Copy-Item apps/mobile/.env.example apps/mobile/.env
```

The web production build can run without a `.env` when the edge follows the
ViStay host convention (`admin.<base>`, `graphql.<base>`, and
`identity.<base>`). `VITE_*` values override that convention at build time.
Mobile always requires explicit `EXPO_PUBLIC_*` URLs because it cannot infer
the edge host from a browser origin.

The stable mobile custom scheme requires an Expo development build or a store
build. Expo Go may only be used after allowlisting the generated `exp://`
redirect URI in a separate development client; do not broaden the production
Keycloak redirect allowlist.

## Run and verify

Node 24 or newer is required.

```powershell
npm ci
npm run dev:web
npm run dev:mobile

npm run typecheck
npm run lint
npm test
npm run build
```

For the integrated local flow, start the `full` profile from
`platform_infrastructure`; Caddy exposes `admin.localhost`,
`graphql.localhost`, and `identity.localhost`. A standalone UI is expected to
show a clear configuration/network error until those dependencies are
available.

## Session and cursor storage

- Web access tokens are managed by `oidc-client-ts` in `sessionStorage` and
  disappear when the browser session closes. Only the non-sensitive cursor is
  placed in `localStorage`, namespaced by Backoffice account ID.
- Mobile token fields are stored separately in Expo SecureStore. This avoids a
  single oversized secure-storage value. Notification cursors are also
  namespaced by account ID in SecureStore.
- Notification payloads are kept in memory; Redis or browser storage is not
  used as a business-data cache.

`packages/api-client` owns the exact Viewer and NotificationStream operations,
the incremental SSE parser, error handling, and notification deduplication used
by both applications.
