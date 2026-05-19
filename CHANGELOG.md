# Changelog — Pocketbooks Sports

---

## Architecture Milestone — Phases A–Z (2026-05-19)

Full server-authoritative betting platform — 1335 tests across 43 test files.

### Security / Auth (Phases H–M)
- HS256 HMAC token auth (`SESSION_SECRET` signed); `jti` + session store on every request
- `club_memberships` table is authoritative — client role claims ignored in production
- Session revocation: stolen tokens invalidated immediately via jti
- Auto-refresh within 10min of expiry; `_verifyOrRefreshSession()` on boot
- 6-role hierarchy: `owner(5) > full_admin(4) > settlement_manager(3) > risk_viewer(2) > player(1) > view_only(0)`

### Club Scoping + RBAC (Phase J)
- `_checkClubScope()` gate before every role check
- Token clubId is only trusted clubId in production
- `platform_admin` escape hatch via `PLATFORM_ADMIN_ALLOWLIST` env
- `club_scope_mismatch` audit event on violation

### Idempotency (Phase K)
- `requireIdempotency()` middleware on all money endpoints
- `idempotency_keys` table + in-memory fallback
- `_pendingIdemKeys` double-click guard in `_pbFetch()`

### Canonical Ledger + Transactional RPCs (Phases N–O)
- `ledger` table: `direction`, `balance_before/after`, Postgres invariant trigger
- 5 Postgres stored functions: `place_bet_tx`, `cancel_bet_tx`, `grade_ticket_tx`, `settle_player_tx`, `weekly_rollover_tx`
- `available = starting − openRisk − settledLosses + settledGains`

### Odds Snapshots + Fail-Closed (Phases Q, R)
- `odds_snapshots` table; payout recalculated server-side — client value ignored
- Drift tolerance ±3pts; `odds_changed` 409 with `updatedLegs`; accept-new-odds modal
- Production fails closed on DB error → 503 `odds_service_unavailable`

### Trusted Grading (Phase S)
- `result_snapshots` table; `grade/run` reads only from DB — client `result` ignored
- Manual override: `full_admin+` + `overrideCode` required; `grade_overrides` audit table

### Settlements + Payments (Phases T–V)
- `settlement_periods` + `settlement_snapshots` (INSERT-only, Postgres trigger blocks UPDATE)
- `settlement_payments` (no-DELETE trigger); status: unpaid/partial/paid/overpaid
- Revision system for reclose cycles; admin override for overpayment

### Risk Limits + Alerts (Phases P, V2)
- `club_risk_settings` + `player_limits`; 11 rejection codes
- `risk_alerts` table; 24h coalesce per (clubId+actorId+type); severity escalation
- Risk Alerts section in admin panel with Ack/Dismiss

### Ops / Observability (Phases Q2, R2, S2, T2, U2)
- Rate limiting (in-memory), CORS (`ALLOWED_ORIGINS`), security headers, 50KB payload limit
- `GET /api/health`, `GET /api/admin/diagnostics`, `GET /api/admin/env-check`
- Job queue (`jobs` table); 5 handlers; `ENABLE_WORKER=true`; exponential backoff
- Event feed (`event_feed` table); 12s frontend poll; cursor-based; club-scoped RBAC
- Admin system panel (full_admin+ only); health/jobs/events/alerts/crypto sections

### Crypto Deposits + Reconciliation (Phases W–Y)
- `crypto_deposit_intents` + `crypto_tx_scans` tables (migrations 017–018)
- Player flow: create-intent → wallet assigned server-side → submit txHash → admin scan/credit
- Scanner stub: `BLOCKCHAIN_SCANNER_ENABLED=false` (fail-closed); `AUTO_CREDIT_CONFIRMED_CRYPTO=false`
- `GET /api/admin/crypto/reconciliation`: daily summary, wallet summary, 7-flag anomaly detection, player audit rows

### Production Readiness (Phase Z + Ops Tasks 1–5)
- Architecture checkpoint doc (`ARCHITECTURE_CHECKPOINT.md`)
- Deploy checklist (`PRODUCTION_DEPLOY_CHECKLIST.md`)
- Env template (`.env.production.example`)
- Seed template (`supabase/seed_club_memberships.example.sql`)
- `npm run verify:production` — backend smoke check (7 checks)
- `npm run verify:frontend` — frontend smoke check (6 checks)
- `npm run verify:deploy` — combined PASS/FAIL verdict

---
