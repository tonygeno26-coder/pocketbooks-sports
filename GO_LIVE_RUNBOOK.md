# Pocketbooks Sports — Go-Live Runbook
**Audience:** Launch operator / host  
**Last updated:** 2026-05-19 | Phases A–Z + Ops Tasks 1–6

Follow each section in order. Do not skip steps. Check off items as you go.

---

## 1. Pre-Launch Checklist

Before touching Railway or Supabase:

- [ ] All Supabase migrations 001–018 run successfully (no errors)
- [ ] `club_memberships` seeded for first club (at least owner + players)
- [ ] All 5 required Railway env vars set (see §2)
- [ ] `npm run verify:deploy` passes locally or against staging
- [ ] Frontend deployed on Vercel and accessible
- [ ] Backend deployed on Railway and `/api/health` returns `ok: true`
- [ ] `GET /api/admin/env-check` returns `{ "ok": true }`
- [ ] Odds API key confirmed valid (check the-odds-api.com dashboard)
- [ ] Crypto wallet addresses confirmed (ERC20 + BTC SegWit)
- [ ] Test bet placed and cancelled in dev/staging before go-live

---

## 2. Railway Env Checklist

Go to Railway → `pocketbooks-sports-backend` → Variables.

### 🔴 Required (set all five before first deploy)

| Variable | How to get it |
|---|---|
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role (not anon) |
| `ALLOWED_ORIGINS` | `https://pocketbooks-sports.vercel.app` (your Vercel URL) |
| `ODDS_API_KEY` | the-odds-api.com → Dashboard → API key |

### 🟡 Recommended

| Variable | Value | Notes |
|---|---|---|
| `PLATFORM_ADMIN_ALLOWLIST` | your owner actorId | Cross-club admin escape hatch |
| `WALLET_ERC20` | your ERC20 address | USDT/USDC/ETH deposits |
| `WALLET_BTC` | your BTC SegWit address | BTC deposits |
| `ENABLE_WORKER` | `true` | Enable background jobs |

### 🔵 Optional (safe defaults)

| Variable | Default | Change when |
|---|---|---|
| `BLOCKCHAIN_SCANNER_ENABLED` | `false` | Scanner implemented |
| `AUTO_CREDIT_CONFIRMED_CRYPTO` | `false` | You trust the scanner |
| `APP_VERSION` | `unknown` | Set to semver |
| `COMMIT_SHA` | — | Set in Railway deploy config |

---

## 3. Supabase Migration Checklist

Run each in Supabase → SQL Editor. **One at a time. No skipping.**

- [ ] `001_fix_ledger_constraints.sql`
- [ ] `002_weekly_rollover_tables.sql`
- [ ] `003_club_staff_permissions.sql`
- [ ] `004_idempotency_keys.sql`
- [ ] `005_sessions_table.sql`
- [ ] `006_club_memberships_authoritative.sql`
- [ ] `007_canonical_ledger.sql`
- [ ] `008_money_rpcs.sql`
- [ ] `009_risk_limits.sql`
- [ ] `010_odds_snapshots.sql`
- [ ] `011_result_snapshots.sql`
- [ ] `012_settlement_periods.sql`
- [ ] `013_settlement_payments.sql`
- [ ] `014_jobs_table.sql`
- [ ] `015_event_feed.sql`
- [ ] `016_risk_alerts.sql`
- [ ] `017_crypto_deposit_intents.sql`
- [ ] `018_crypto_tx_scans.sql`

**After each migration:** check Supabase → Table Editor for the new table before running the next.

---

## 3b. Host Diamond Balance (Required)

Before players can place bets, the host **must** have a `host_diamond_balances` row. Without it, every bet placement returns `402 host_diamond_balance_missing` (fail-closed).

### Seed the host diamond balance

Run this in Supabase SQL Editor after migration 019:

```sql
INSERT INTO host_diamond_balances (club_id, host_actor_id, balance_diamonds, updated_at)
VALUES ('your-club-id', 'owner_actor_id', 1500, NOW())
ON CONFLICT (club_id) DO UPDATE
  SET balance_diamonds = EXCLUDED.balance_diamonds, updated_at = NOW();
```

Or use the admin endpoint:
```bash
POST /api/admin/host-diamonds/seed
{ "clubId": "your-club-id", "hostActorId": "owner_actor_id", "startingBalanceDiamonds": 1500 }
```

### Recommended starting balances

| Balance | Weekly capacity |
|---|---|
| 150 diamonds | 10 active bettors |
| 750 diamonds | 50 active bettors |
| 1500 diamonds | 100 active bettors |
| 3000 diamonds | 200 active bettors |

**Formula:** `capacity = floor(balanceDiamonds / 15)`

### Top up when needed

Use the Settlements tab → Host Diamond Balance card → `+Top Up Diamonds`, or:
```bash
POST /api/admin/host-diamonds/topup
{ "clubId": "...", "amountDiamonds": 1500, "method": "admin_credit",
  "reason": "weekly refill", "idempotencyKey": "TOPUP_<date>_<clubId>" }
```

---

## 4. First Club Setup

### 4a. Run the seed script

Copy `supabase/seed_first_club.example.sql`, replace the placeholder IDs with real values, and run it in Supabase SQL Editor.

Minimum required:
- 1 × `owner` or `full_admin` row (so tokens can be issued)
- All player actorIds who need to bet

### 4b. Verify membership

```sql
SELECT actor_id, club_id, role, status
FROM club_memberships
WHERE club_id = 'your-real-club-id'
ORDER BY
  CASE role
    WHEN 'owner'              THEN 5
    WHEN 'full_admin'         THEN 4
    WHEN 'settlement_manager' THEN 3
    WHEN 'risk_viewer'        THEN 2
    WHEN 'player'             THEN 1
    WHEN 'view_only'          THEN 0
  END DESC;
```

Expected: at least one row per member, `status = 'active'`.

### 4c. Test token issuance

```js
// In browser console on your frontend:
await _acquireSessionToken('your-owner-actor-id', 'your-club-id')
// Expected: { ok: true, token: "eyJ..." }
```

If this returns `membership_not_found`, the actorId is not seeded.

---

## 5. Odds Verification

- [ ] `GET /api/markets/live` returns odds data (non-empty array)
- [ ] `GET /api/markets/health` returns `{ "ok": true }`
- [ ] Odds badge in UI shows "Live" (not "Stale" or "Unavailable")
- [ ] Place a test bet and confirm odds accepted / `oddsAccepted` flag works

If odds are stale:
1. Check `ODDS_API_KEY` is valid
2. Run `GET /api/markets/refresh` (full_admin token required)
3. Check diagnostics for `rpcFailCount` and `oddsStatus`

---

## 6. Grading Verification

- [ ] Grading badge in UI shows `🧠 Grading: Server`
- [ ] In browser console: `checkGradingAuthorityStatus()` → `mode: "server_authoritative"`
- [ ] Grade a completed game manually via admin panel
- [ ] Confirm `result_snapshots` row was written in Supabase
- [ ] Confirm `ledger` row written with event `BET_WON` or `BET_LOST`

If grading falls back to browser:
1. `ENABLE_WORKER=true` must be set (for auto-grade job)
2. `_GRADING_MODE` must be `server_authoritative` (default)
3. Check Railway logs for grading errors

---

## 7. Settlement Closeout Verification

- [ ] Ensure no open/active tickets exist for the period
- [ ] Close week via admin panel (Settlements tab → Close Week)
- [ ] Confirm `settlement_periods` row created in Supabase
- [ ] Confirm `settlement_snapshots` rows are INSERT-only (cannot be updated)
- [ ] Record a test payment: Settlements → player → Record Payment
- [ ] Confirm `settlement_payments` row written
- [ ] Confirm `ledger` row written with event `SETTLEMENT_PAYMENT`
- [ ] Reopen week (full_admin only) → verify `revision` increments

---

## 8. Crypto Deposit Verification

- [ ] Test intent creation: `POST /api/crypto/deposits/create-intent`
  - Confirm wallet address returned (server-assigned, not client-provided)
  - Confirm `crypto_deposit_intents` row in Supabase
- [ ] Submit a test txHash: `POST /api/crypto/deposits/submit-hash`
  - Confirm `status = 'hash_submitted'`
- [ ] Admin scan: `POST /api/admin/crypto/deposits/scan`
  - If `BLOCKCHAIN_SCANNER_ENABLED=false`, expect `scan_error: scanner_not_configured`
  - This is expected — confirm and credit manually
- [ ] Admin confirm: `POST /api/admin/crypto/deposits/confirm`
  - Confirm `status = 'credited'`
  - Confirm `ledger` row with event `BALANCE_ADJUSTMENT`
- [ ] `GET /api/admin/crypto/reconciliation` returns correct daily/wallet summaries

---

## 9. Rollback Plan

### Backend rollback
```
Railway → pocketbooks-sports-backend → Deployments → previous → Redeploy
```
Or revert the commit and push:
```bash
git revert HEAD --no-edit
git push origin main
```

### Frontend rollback
```
Vercel → pocketbooks-sports → Deployments → previous → Promote to Production
```
Or revert and push.

### Database rollback
- Migrations are **additive** — new tables will not be automatically dropped
- To undo a migration: manually DROP the table in Supabase SQL Editor
- `settlement_snapshots`: INSERT-only trigger — to clear test data, DROP and re-run migration 012
- `settlement_payments`: no-DELETE trigger — same approach

### Emergency: revert to a known-good state
1. Rollback Railway to last working deploy SHA
2. Rollback Vercel to last working deploy
3. Do NOT rollback Supabase data unless instructed — contact support

---

## 10. Emergency Pause Plan

Use these procedures if something goes wrong in production and you need to halt activity immediately.

### 10a. Disable all betting via risk settings

```bash
# POST /api/club/risk-settings (full_admin+ token required)
# Set maxStakePerBet to 0 — blocks all bet placement
curl -X POST https://your-backend.railway.app/api/club/risk-settings \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{ "clubId": "your-club-id", "maxStakePerBet": 0 }'
```

Or via admin panel → Risk Settings → set Max Stake to 0.

### 10b. Block all sports

Set `blockedSports` to all available sport keys in risk settings:
```json
{ "blockedSports": ["americanfootball_nfl","basketball_nba","baseball_mlb","icehockey_nhl","soccer_epl"] }
```
No new bets can be placed on blocked sports.

### 10c. Disable background worker

In Railway Variables, set:
```
ENABLE_WORKER=false
```
Then redeploy. This stops odds refresh, auto-grading, and settlement jobs.

### 10d. Disable auto-credit

In Railway Variables, set (or confirm already set):
```
AUTO_CREDIT_CONFIRMED_CRYPTO=false
```
No crypto deposits will be credited automatically.

### 10e. Revoke a specific actor's session

```bash
# POST /api/auth/revoke-session (full_admin+ token required)
curl -X POST https://your-backend.railway.app/api/auth/revoke-session \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{ "actorId": "bad-actor-id", "clubId": "your-club-id" }'
```

This invalidates the actor's jti — their token becomes invalid immediately on next request.

### 10f. Suspend a member (blocks future token issuance)

```sql
-- Supabase SQL Editor
UPDATE club_memberships
SET status = 'suspended'
WHERE actor_id = 'bad-actor-id' AND club_id = 'your-club-id';
```

Suspended actors cannot receive new tokens. Existing tokens expire naturally or can be revoked via §10e.

### 10g. Revoke all active sessions for a club (nuclear option)

```sql
-- Supabase SQL Editor
-- Sets all active sessions for the club to revoked
UPDATE sessions
SET status = 'revoked', revoked_at = NOW()
WHERE club_id = 'your-club-id' AND status = 'active';
```

All members will be logged out immediately. They must re-authenticate.

---

## 11. First Go-Live Sign-Off

Before announcing to players, confirm all boxes checked:

- [ ] §2 Railway env vars — all 5 required set
- [ ] §3 Migrations 001–018 complete
- [ ] §4 First club + owner seeded, token issuance verified
- [ ] §5 Odds live (not stale)
- [ ] §6 Grading mode = Server
- [ ] §7 Test settlement closed + payment recorded
- [ ] §8 Test crypto deposit intent created (scanner-not-configured is OK)
- [ ] `npm run verify:deploy` = 🟢 PASS
- [ ] Release note created: `npm run release:note`

**You are now live. Good luck. 🎲**
