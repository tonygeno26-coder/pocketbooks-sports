# Pocketbooks Sports — Architecture Checkpoint (Phase Z)
**Date:** 2026-05-19 | **Test count:** 1335/1335 | **Migrations:** 001–018

---

## Auth / Session / Membership

| Layer | Mechanism |
|---|---|
| Token format | HS256 HMAC, signed with `SESSION_SECRET` |
| Token fields | `actorId`, `clubId`, `role` (ignored in prod), `jti`, `exp` |
| Role authority | `club_memberships` table is authoritative — client `role` claim ignored in prod |
| Session store | `sessions` table + in-memory fallback; `jti` checked on every request |
| Revocation | `POST /api/auth/revoke-session`; invalidates jti; stolen tokens die immediately |
| Auto-refresh | `_verifyOrRefreshSession()` refreshes tokens within 10min of expiry |
| Dev bypass | `_DEV_PLAYER_IDS` / `_DEV_CLUB_IDS` skip DB auth in non-production |

## Club Scoping

- Every protected endpoint calls `_checkClubScope()` before role check
- `req._clubId` derived from token (production) or body/query (dev)
- `platform_admin` in `PLATFORM_ADMIN_ALLOWLIST` can cross club boundaries
- `club_scope_mismatch` audit event on violation

## Role Hierarchy

```
owner (5) > full_admin (4) > settlement_manager (3) > risk_viewer (2) > player (1) > view_only (0)
```

`ACTION_MIN_RANK` map enforces minimum rank per action.

## Idempotency

- Required on all money endpoints via `requireIdempotency()` middleware
- `idempotency_keys` table + in-memory fallback
- `_pendingIdemKeys` Set prevents double-click creating two in-flight keys
- Routes with `idem:true`: `/bets/place`, `/bets/cancel`, `/settlements/payment`, `/settlements/payment-confirm`, `/settlements/payment-void`, `/admin/crypto/deposits/confirm`

## Canonical Ledger

- `ledger` table: `direction` (debit/credit), `balance_before`, `balance_after`
- Postgres invariant trigger enforces `balance_before + amount = balance_after`
- `_deriveLedgerBalance()` / `_deriveAvailableBalance()` — no client trust
- `balance = starting − openRisk − settledLosses + settledGains`
- Legacy `ledger_entries` kept for fire-and-forget compat

## Transactional RPCs (Migration 008)

All money operations run inside Postgres stored functions:

| RPC | Trigger |
|---|---|
| `place_bet_tx` | `POST /api/bets/place` |
| `cancel_bet_tx` | `POST /api/bets/cancel` |
| `grade_ticket_tx` | `grade/run` server grading |
| `settle_player_tx` | settlement payment confirm |
| `weekly_rollover_tx` | weekly rollover job |

## Odds Snapshots (Migration 010)

- `odds_snapshots` table records offered odds at placement time
- `_verifyLegOddsSnapshot()` checks live market vs snapshot on grade
- `oddsChangePolicy`: reject | accept_better | accept_any_with_confirm
- Payout recalculated server-side from snapshots; client payout value ignored
- `ticket_legs.accepted_odds_*` fields store what player accepted

## Fail-Closed Odds (Phase R)

- Production: DB error on odds → 503 `odds_service_unavailable` — never uses client odds
- `_marketServiceOk` flag gates Place Bet button
- Dev-only fallback with loud `console.warn`

## Result Snapshots / Trusted Grading (Migration 011)

- `result_snapshots` table: scores/status from external API, stored before grading
- `grade/run` reads **only** from `result_snapshots` — client `result` field completely ignored
- `POST /api/grade/manual`: full_admin+, requires `overrideCode`, writes `grade_overrides` table + audit event
- Future gate: `commenceTime > now` → NEVER grade

## Settlements / Payments (Migrations 012–013)

- `settlement_periods` + `settlement_snapshots` (INSERT-only, Postgres trigger blocks UPDATE)
- `revision` counter for reclose cycles
- `settlement_payments` table — no-DELETE trigger
- Payment status: unpaid / partial / paid / overpaid
- `adminOverride` required (full_admin+) for overpayment

## Risk Limits (Migration 009)

- `club_risk_settings` + `player_limits` tables
- JS pre-check `_checkRiskLimitsJs()` (11 steps) before DB write
- `_pb_check_risk_limits()` Postgres function for atomic enforcement
- `risk_exposure` view for real-time club exposure
- 11 rejection codes with frontend toast messages

## Jobs / Background Worker (Migration 014)

- `jobs` table with exponential backoff [30s, 1m, 2m, 5m, 10m]
- 5 job handlers: `odds_refresh`, `result_refresh`, `grade_run`, `settlement_close_check`, `payment_reconciliation`
- `ENABLE_WORKER=true` env activates in-process 20s poll loop
- Dead-letter after maxAttempts

## Event Feed / Polling (Migration 015)

- `event_feed` table: ring buffer (server), Supabase fire-and-forget
- `GET /api/events` — cursor-based, club-scoped RBAC
- Frontend polls every 12s with tab visibility pause
- 12 event types emitted at: place/cancel/grade/confirm/void/settlement-close/job-fail

## Observability / Diagnostics

- `logEvent()` with `_sanitizeLog()` — redacts auth/token/secret/password fields
- `x-request-id` on every response
- `GET /api/health` — public; db/odds/uptime — no secrets
- `GET /api/admin/diagnostics` — full_admin+; audit counts, session counts, rpcFailCount, job counts
- `GET /api/admin/env-check` — full_admin+; missing/warning env vars, no secret values exposed
- `_sysHealthBadge` in UI: green/red, 90s refresh, full_admin+ only

## Risk Alerts (Migration 016)

- `risk_alerts` table with 24h coalesce window per (clubId+actorId+type)
- Severity escalates with count: low → medium → high
- 9 detection points: rate_limit, risk_reject, snapshot_reject, overpayment, manual_override, bet_velocity, etc.
- Alerts only (no blocking); admin Ack/Dismiss

## Rate Limiting

- In-memory per-actor (IP fallback)
- `/api/auth/token`: 10/min
- `/api/bets/place`: 30/min
- `/api/grade/run`: 5/min/club
- `/api/host/settlements/*`: 20/min/actor
- CORS hardened with `ALLOWED_ORIGINS` env
- Payload: 100KB default, 50KB on betting endpoints
- Security headers: nosniff/DENY/no-store on sensitive paths

## Crypto Deposits / Scanner / Reconciliation (Migrations 017–018)

### Intent Flow
1. `POST /api/crypto/deposits/create-intent` — wallet assigned server-side, returns wallet+QR
2. Player sends crypto to assigned wallet
3. `POST /api/crypto/deposits/submit-hash` — player attaches txHash (ownership + expiry + dup check)
4. `POST /api/admin/crypto/deposits/scan` — admin runs scan: verify tx → match → write scan row
5. `POST /api/admin/crypto/deposits/confirm` — admin confirms: `_writeLedgerEntry(BALANCE_ADJUSTMENT)` idempotently

### Scanner
- `BLOCKCHAIN_SCANNER_ENABLED=false` (default) → `scan_error: scanner_not_configured` (fail-closed)
- Match gates: wallet address match, amount ≥ expectedUsd × 0.98 (2% fee tolerance)
- `AUTO_CREDIT_CONFIRMED_CRYPTO=false` (default) — auto-credit requires explicit opt-in + ≥3 confirmations

### Reconciliation (GET /api/admin/crypto/reconciliation)
Returns 4 datasets:
- `dailySummary[]` — by date: intents, credited diamonds, confirmed USD, flags
- `walletSummary[]` — by wallet+network+symbol: confirmed/credited/pending/mismatch
- `flaggedRows[]` — 7 anomaly types with `playerId` on every row
- `playerAuditRows[]` — per intent: playerId, txHash, scanStatus, matchedPlayerId, creditedDiamonds, flags[]

---

## Production Readiness Gaps

### Required (Railway env vars to set)

| Var | Status |
|---|---|
| `SESSION_SECRET` | ❌ Must be set — all tokens invalid without it |
| `SUPABASE_URL` | ❌ Must be set — no DB writes |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ Must be set |
| `ALLOWED_ORIGINS` | ❌ Must be set — CORS rejects all requests |
| `ODDS_API_KEY` | ❌ Must be set — odds feed dead |

### Recommended

| Var | Default | Risk if missing |
|---|---|---|
| `PLATFORM_ADMIN_ALLOWLIST` | none | No platform admin escape hatch |
| `WALLET_ERC20` | hardcoded fallback | Uses repo-committed address |
| `WALLET_BTC` | hardcoded fallback | Uses repo-committed address |
| `ENABLE_WORKER` | false | No background jobs run |

### Pending Ops Tasks

1. Run Supabase migrations 001–018 in sequence
2. Seed `club_memberships` with existing club/player pairs + roles
3. Set all required Railway env vars (see above)
4. Run `runPhaseBReadValidation()` → confirm `sourceUsed: db`
5. Test token flow: `_acquireSessionToken(actorId, clubId)` → DB role issued
6. Enable worker: `ENABLE_WORKER=true` → verify `odds_refresh` job processes
7. Verify `GET /api/admin/env-check` returns `ok: true` in production

---

## Route Inventory (protected routes)

| Route | Method | Min Role | Idem | Rate | Audit |
|---|---|---|---|---|---|
| `/api/auth/token` | POST | any | — | ✅ | ✅ |
| `/api/auth/verify` | GET | authenticated | — | — | — |
| `/api/auth/refresh` | POST | authenticated | — | — | ✅ |
| `/api/auth/logout` | POST | authenticated | — | — | ✅ |
| `/api/auth/revoke-session` | POST | full_admin | — | — | ✅ |
| `/api/bets/place` | POST | player | ✅ | ✅ | ✅ |
| `/api/bets/cancel` | POST | player | ✅ | — | ✅ |
| `/api/markets/live` | GET | player | — | — | — |
| `/api/markets/refresh` | POST | full_admin | — | — | ✅ |
| `/api/grade/run` | POST | full_admin | — | ✅ | ✅ |
| `/api/grade/manual` | POST | full_admin | — | — | ✅ |
| `/api/club/members` | GET | settlement_manager | — | — | — |
| `/api/club/members/invite` | POST | full_admin | — | — | ✅ |
| `/api/club/risk-settings` | GET | risk_viewer | — | — | — |
| `/api/club/risk-settings` | POST | full_admin | — | — | ✅ |
| `/api/club/exposure` | GET | risk_viewer | — | — | — |
| `/api/host/reconciliation` | GET | settlement_manager | — | — | — |
| `/api/host/settlements/close-week` | POST | settlement_manager | — | ✅ | ✅ |
| `/api/host/settlements/reopen-week` | POST | full_admin | — | — | ✅ |
| `/api/host/settlements/payment` | POST | settlement_manager | ✅ | ✅ | ✅ |
| `/api/host/settlements/payment-confirm` | POST | settlement_manager | ✅ | — | ✅ |
| `/api/host/settlements/payment-void` | POST | full_admin | ✅ | — | ✅ |
| `/api/crypto/deposits/create-intent` | POST | player | — | — | ✅ |
| `/api/crypto/deposits/submit-hash` | POST | player | — | — | ✅ |
| `/api/admin/crypto/deposits` | GET | full_admin | — | — | — |
| `/api/admin/crypto/deposits/scan` | POST | full_admin | — | — | ✅ |
| `/api/admin/crypto/deposits/confirm` | POST | full_admin | ✅ | — | ✅ |
| `/api/admin/crypto/deposits/reject` | POST | full_admin | — | — | ✅ |
| `/api/admin/crypto/reconciliation` | GET | full_admin | — | — | — |
| `/api/health` | GET | public | — | — | — |
| `/api/admin/diagnostics` | GET | full_admin | — | — | — |
| `/api/admin/env-check` | GET | full_admin | — | — | — |
| `/api/admin/jobs` | GET | full_admin | — | — | — |
| `/api/admin/jobs/enqueue` | POST | full_admin | — | — | ✅ |
| `/api/admin/jobs/retry` | POST | full_admin | — | — | ✅ |
| `/api/admin/jobs/cancel` | POST | full_admin | — | — | ✅ |
| `/api/events` | GET | player | — | — | — |
| `/api/admin/risk-alerts` | GET | full_admin | — | — | — |
| `/api/admin/risk-alerts/ack` | POST | full_admin | — | — | ✅ |
| `/api/admin/risk-alerts/dismiss` | POST | full_admin | — | — | ✅ |
