# Inventory Mobile — SCRUM-541

## Observation and commands

The workspace consumes the G0 `MobileWorkspaceProps` contract. The shell owns NetInfo/AppState. A successful read pins property/calendar window, principal/token/authorization version, runtime epoch, inventory revision, branch and property-membership version. Availability and every loaded block must belong to the requested property; availability dates must match exactly.

Editing a filter invalidates write readiness immediately. Apply explicitly to read the draft. Offline/background retains in-memory data marked stale; recovery reads again but never replays a command. Principal changes clear business data and forms. Superseded reads are aborted and ignored even if a transport resolves after abort.

Create/release acquire a synchronous pending latch, refresh authoritative observations, and recheck the original principal/runtime/form before dispatch. Release requires the selected block still be present and operator-managed ACTIVE/TENTATIVE. BOOKING/CHANNEL/history are read-only. Backend authorization remains authoritative; client permissions are not security enforcement.

Dates are calendar strings, `[start,end)`, 1–31 days. Nonexistent dates are rejected rather than normalized. Reasons are trimmed, 10–1000 characters. Only MAINTENANCE/CLEANING/OWNER_USE/MANUAL are offered. Counts describe loaded records, not whole-property totals; results are bounded to 100.

## Outcomes

A confirmed response displays the server command ID and revision. A failed post-command refresh preserves that confirmation and asks to refresh, not submit again. Conflict refreshes never resend. Error messages are allowlisted; raw server messages are not rendered.

Once a mutation has dispatched (`dispatched = true`), result classification uses `principalKey` (`graphqlUrl`, `accessToken`, `viewer.accountId`, `viewer.authorizationVersion`, `viewer.permissions`) rather than `contextKey`, so runtime fluctuations mid-flight cannot discard either a confirmed `commandId` or an `unknownOutcome` lock. A transport error after dispatch locks `pending`/`unknownOutcome` at the session level keyed by `viewer.accountId` (shared across tab switches/remounts via in-memory store and optional `sessionGuard` shell props, cleared on logout or `accountId` change), displays a persistent main-screen alert banner even after closing the modal or refreshing, and exposes `accessibilityState={{ disabled, busy }}` on primary action buttons. Locks do not survive full app process restart; no durable command-status lookup, offline queue, or automatic retry is implemented.

## Acceptance map

| Criterion | Automated evidence in InventoryWorkspace.test.tsx | Native acceptance still required |
|---|---|---|
| AC01 observation/list/history | pinned revision; superseded token response; confirmed command vs refresh failure; 1/31-day windows | Compose fixture list/detail/history and exclusive-end dates |
| AC02 safe create/release | offline preflight cancellation, dirty-filter/grant guards, latest release eligibility, invalid calendar/0/32-day windows, reason 9/10/1000/1001 | create/release each of four operator types; BOOKING/CHANNEL read-only |
| AC03 concurrency/errors | synchronous double tap; mid-flight runtime fluctuation create/reject; tab-switch/remount per-`accountId` guard retention; main-screen banner + `accessibilityState`; revision mismatch; sanitized unknown outcome | stale revision conflict with two operators, correlation/idempotency audit |
| TEST-03 | Not replaced by mocked component tests | Android login/callback, airplane toggle, background/resume, account switching and server audit |

Synthetic test fixtures are test-only. Native/API verification requires a reachable approved Compose environment, OIDC client and synthetic inventory fixtures. No production data or credentials belong in evidence.
