# Admin Mobile integration — local mode

Baseline: `f50195bd210a72be19b3c369f93cb1a850e1dae8`.
Common setup: `common-setup.patch`, SHA-256 `c6f126b4f9380573b6957dd42a1085502ca087f71ab60846036b0a3891d7a3dd`.
Inventory delta: `agent-1-inventory-v2.patch` (three inventory-owned paths only; SHA-256 `39e42f982b3c5c9555658c3f09b1466b6b41d453abdf4cf2ac8ada0c6ba5ada1`).
Integration delta: `agent-1-integration-v2.patch` (five integration-owned paths only).
Booking docs delta: `agent-3-booking-docs-v2.patch` (`docs/mobile/booking.md`; SHA-256 `a153126f9f1a35db6aec2962534645625fac9cf2ffc490169c8cd7a43ab9a6c8`).
Pricing docs delta: `agent-4-pricing-final.patch` (`docs/mobile/pricing.md`; SHA-256 `498375a354ec272611cee83cfdb59d503f10575f7a6ef40165a3a2c3e38d1e5d`).

The shell mounts one `useMobileRuntime` subscription. Inventory receives the real runtime, never a default-online shim. When only `refreshEpoch` or `retry` increments on the same `(graphqlUrl, accessToken)`, `useViewer` retains the ready viewer continuously while revalidating in the background so `BackofficeScreen` tabs, `InventoryWorkspace`, and SSE subscriptions stay mounted; changing `graphqlUrl` or `accessToken` or failing background revalidation fails closed immediately. `InventoryWorkspace` is keyed by `accountId:authorizationVersion` and `BackofficeScreen` preserves per-`accountId` Inventory `pending` and `unknownOutcome` session locks across tab switches/remounts (clearing them on logout or screen unmount). Existing five state tabs remain; no Booking/Pricing screen is mounted while their gates are blocked. Notification hooks are unchanged.

## Local commands

Run from this integration worktree, not `frontend_admin`:

```sh
npm run typecheck
npm run lint
npm run test:mobile
npm test
npm run build
```

`test:mobile` discovers all mobile source tests. `npm test` preserves workspace and Web suites. `build` is Web-only, not an Android artifact.

Dependencies already installed under this worktree's `node_modules`; no new package/global runtime is installed by this continuation.

## Native gate

Set real, approved public endpoints in `apps/mobile/.env` using `.env.example`. Example `.example` endpoints are intentionally nonfunctional and must not be represented as live configuration. Device URLs must resolve from Android; localhost is not the PC. Use the approved public OIDC client and `vistay-admin://oauth/callback`; never add a client secret.

With the approved Compose `full` environment, synthetic inventory fixtures and a connected Android device/emulator, run:

```sh
npm run android --workspace @vistay/admin-mobile
```

Then verify login/callback, scoped list/detail/history, create/release operator blocks, stale revision, double tap, airplane mode, background/resume, logout/account switching and server correlation/idempotency evidence. Do not change backend/Router/contracts here. Android SDK/JDK availability is not proof of a native build or TEST-03. No device was visible to `adb devices -l` during continuation; native smoke is blocked. No production credentials or data were used.

## Gates and rollback

Inventory automated/integration evidence is recorded separately in the central task log. G-DEVICE/TEST-03 needs runtime/device evidence. Booking remains BLOCKED_CONTRACT/UPSTREAM and Pricing BLOCKED_PERMISSION/UPSTREAM per A2 until owners provide authoritative evidence. No permission alias, Mode.ALL fallback or mock production data is added.

No commit, push, PR, CI run or Jira transition is authorized by local implementation. Review patches before promotion. Rollback only this uncommitted integration delta in its isolated workspace after review; do not reset/clean the original checkout or remove the common staged baseline.
