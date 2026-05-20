# Pocketbooks Sports — Production Deploy Checklist
**Last updated:** 2026-05-19 | Phases A–Z complete | 1459 tests

Work through each section top-to-bottom. Check off each item before proceeding.

---

## 1. Railway Environment Variables

### 🔴 Required (system is broken without these)

Set in Railway → `pocketbooks-sports-backend` → Variables:

| Variable | Notes |
|---|---|
| `SESSION_SECRET` | Random 32+ char string. All tokens invalid without it. |
| `SUPABASE_URL` | From Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Settings → API → service_role key (not anon) |
| `ALLOWED_ORIGINS` | Comma-separated. e.g. `https://pocketbooks-sports.vercel.app` |
| `ODDS_API_KEY` | From the-odds-api.com. Odds feed dead without this. |

**Verify:** `GET /api/admin/env-check` must return `{ "ok": true }` after setting all five.

### 🟡 Recommended (system degrades without these)

| Variable | Default | Notes |
|---|---|---|
| `PLATFORM_ADMIN_ALLOWLIST` | (none) | Comma-separated actorIds that get platform_admin. Required for cross-club admin. |
| `WALLET_ERC20` | Hardcoded fallback | Override the ERC20 wallet address for crypto deposits. |
| `WALLET_BTC` | Hardcoded fallback | Override the BTC SegWit wallet address for crypto deposits. |
| `ENABLE_WORKER` | `false` | Set to `true` to enable background job worker (odds_refresh, grade_run, etc). |

### 🔵 Optional

| Variable | Default | Notes |
|---|---|---|
| `BLOCKCHAIN_SCANNER_ENABLED` | `false` | Enable blockchain tx verification. Leave false until scanner is implemented. |
| `AUTO_CREDIT_CONFIRMED_CRYPTO` | `false` | Auto-credit confirmed crypto scans. Leave false — requires manual admin confirm. |
| `APP_VERSION` | `unknown` | Shown in /api/health. Set to semver. |
| `COMMIT_SHA` | `null` | Set in Railway deploy config. Shown in /api/health. |
| `LOG_VERBOSE` | `false` | Verbose request logging. |

---

## 2. Supabase Migrations (run in order)

Run each migration in Supabase → SQL Editor. Run one at a time. Verify no errors before proceeding.

```
001_fix_ledger_constraints.sql
002_weekly_rollover_tables.sql
003_club_staff_permissions.sql
004_idempotency_keys.sql
005_sessions_table.sql
006_club_memberships_authoritative.sql
007_canonical_ledger.sql
008_money_rpcs.sql
009_risk_limits.sql
010_odds_snapshots.sql
011_result_snapshots.sql
012_settlement_periods.sql
013_settlement_payments.sql
014_jobs_table.sql
015_event_feed.sql
016_risk_alerts.sql
017_crypto_deposit_intents.sql
018_crypto_tx_scans.sql
- [ ] `019_host_active_bettors.sql`
- [ ] `020_host_diamond_ledger.sql`
```

Files are in: `pocketbooks-sports/supabase/migrations/`

**After each migration:** check Supabase → Table Editor for the new table.

**If a migration fails:**
- Do NOT skip it.
- Check for dependency order (e.g. 017 references `club_memberships` from 006).
- Fix SQL error, re-run the same file.

---

## 3. Seed: club_memberships

After running migration 006, seed your existing club/player pairs.

Use `supabase/seed_club_memberships.example.sql` as a template.

**Minimum required seed:**
- At least one `owner` or `full_admin` per club (so tokens can be issued)
- Every player who should be able to place bets needs a `player` row

**Verify seeding:**
```sql
SELECT actor_id, club_id, role, status
FROM club_memberships
WHERE club_id = 'your-club-id'
ORDER BY role DESC;
```

---

## 4. Verification Steps

### 4a. Env check
```
GET https://pocketbooks-sports-backend-production.up.railway.app/api/admin/env-check
Authorization: Bearer <admin_token>
```
Expected: `{ "ok": true, "missing": [], "warnings": [...] }`

If `ok: false`, `missing[]` will list exactly which vars to add.

### 4b. Health check
```
GET https://pocketbooks-sports-backend-production.up.railway.app/api/health
```
Expected:
```json
{
  "ok": true,
  "dbStatus": "connected",
  "oddsStatus": "ok",
  "uptime": <seconds>
}
```
If `dbStatus` is not `connected`, Supabase env vars are wrong.

### 4c. Token issuance
```js
// In browser console on pocketbooks-sports.vercel.app:
await _acquireSessionToken('your-actor-id', 'your-club-id')
```
Expected: `{ ok: true, token: "eyJ..." }`

If this fails with `membership_not_found`, the actor is not seeded in `club_memberships`.

### 4d. DB read validation
```js
// In browser console:
await runPhaseBReadValidation()
```
Expected: `sourceUsed: "db"` in result.

### 4e. Server grading check
```js
// In browser console (full_admin only):
await runServerGrade()
```
Grading badge should show `🧠 Grading: Server`.

### 4f. Worker check
After setting `ENABLE_WORKER=true`, wait 20 seconds, then:
```
GET /api/admin/diagnostics
```
`jobCounts.processing` should tick and `jobCounts.completed` should increment.

---

## 5. Smoke Test Run

Run the full test suite locally before any deploy:

```bash
cd pocketbooks-sports
npm run verify
```

Must show: `✅ N/N tests passed` with no failures.

For the pre-commit hook:
```bash
npm run build
```
This runs verify + stamps build.json + patches index.html.

---

## 6. Deploy Order

```
1. Run Supabase migrations 001–020 (if not done)
2. Seed club_memberships
3. Set Railway env vars (required 5 + recommended)
4. Deploy backend: git push origin main (Railway auto-deploys)
5. Wait for Railway build to complete (~2min)
6. GET /api/health → ok: true
7. GET /api/admin/env-check → ok: true
8. Deploy frontend: Vercel auto-deploys on git push
9. Smoke test: _acquireSessionToken() → place test bet → cancel it
10. Verify grading badge shows Server
```

---

## 7. Rollback Notes

### Backend rollback
```bash
# In Railway dashboard: Deployments → previous deploy → Redeploy
# Or force-push previous SHA:
git revert HEAD --no-edit
git push origin main
```

### Database rollback
- Migrations are **additive only** — tables/indexes are not dropped by new migrations.
- If a migration causes issues, manually DROP the new table in Supabase SQL Editor.
- `settlement_snapshots` and `settlement_payments` have no-UPDATE/no-DELETE triggers.
  To remove test data: DROP and re-run the migration SQL.

### Frontend rollback
- Vercel: Deployments → previous → Promote to Production
- Or: `git revert HEAD && git push` triggers new Vercel build

---

## 8. Known Blockers Before Go-Live

- [ ] Supabase migrations 001–020 not yet run in production
- [ ] `club_memberships` not seeded (tokens will fail for all players)
- [ ] `SESSION_SECRET` not confirmed set in Railway
- [ ] `ALLOWED_ORIGINS` must include the live Vercel URL
- [ ] `ENABLE_WORKER=true` not set (background jobs disabled)
- [ ] HoroscopePing Shopify Payments: needs bank account info
- [ ] TikTok Shop setup incomplete
- [ ] Blockchain scanner stub — `BLOCKCHAIN_SCANNER_ENABLED` stays false until implemented
