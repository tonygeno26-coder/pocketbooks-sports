# PL-6 Audit: player_limits Enforcement — JS-only vs RPC-level
**Date:** 2026-05-27  
**SHA:** 35e1009 (grd2-push-reduced)  
**Type:** Read-only. No code modified.

---

## 1. Which checks run only in JS (_checkRiskLimitsJs)

All of the following run in `_checkRiskLimitsJs` at `index.js:4378` before the RPC is called:

| Check | Source | JS enforcement | RPC enforcement |
|---|---|---|---|
| `suspended_until` | `player_limits.suspended_until` | ✅ Yes | ⚠️ See §4 |
| `max_single_bet` (stake cap) | `player_limits.max_single_bet` | ✅ Yes | ⚠️ See §4 |
| `max_open_risk` | `player_limits.max_open_risk` | ✅ Yes | ⚠️ See §4 |
| `max_payout` | `player_limits + club_risk_settings` | ✅ Yes | ⚠️ See §4 |
| `min_stake` / `max_stake` (club) | `club_risk_settings` | ✅ Yes | ⚠️ See §4 |
| `blocked_sports` (player) | `player_limits.blocked_sports` | ✅ Yes | ⚠️ See §4 |
| `blocked_sports` (club) | `club_risk_settings.blocked_sports` | ✅ Yes | ⚠️ See §4 |
| `blocked_markets` (player+club) | both tables | ✅ Yes | ⚠️ See §4 |
| `allowed_sports` | `player_limits.allowed_sports` | ✅ Yes | ⚠️ See §4 |
| `allow_parlays/teasers/rr` | `club_risk_settings` | ✅ Yes | ⚠️ See §4 |
| `max_parlay_legs` | `club_risk_settings` | ✅ Yes | ⚠️ See §4 |
| `allow_live_betting` | `club_risk_settings` | ✅ Yes (via `leg.server_is_live`) | ⚠️ See §4 |
| `club_open_risk_exceeded` | code present but **never returned** | ❌ Dead code | ❌ No |
| `event_risk_exceeded` | code present but **never returned** | ❌ Dead code | ❌ No |
| `market_risk_exceeded` | code present but **never returned** | ❌ Dead code | ❌ No |

**Critical: `_checkRiskLimitsJs` is wrapped in `try/catch` with fail-OPEN behavior:**
```js
try {
  const riskCheck = await _checkRiskLimitsJs(...);
  if (!riskCheck.ok) return error;
} catch(riskErr) {
  console.warn('[bets/place] risk check error (fail-open):', riskErr.message);
  // Bet PROCEEDS even if check threw
}
```
A Supabase outage, network timeout, or uncaught exception in `_checkRiskLimitsJs` silently bypasses ALL player_limits enforcement.

---

## 2. Can place_bet_tx be called without _checkRiskLimitsJs?

**Single call site in index.js (line 7766)**: `place_bet_tx` is called from exactly ONE place: `POST /api/bets/place`. There are no other server-side paths that call `place_bet_tx` — the worker (`_runGradeCore`), manual grading, weekly rollover, and settlement paths do not call it.

**But _checkRiskLimitsJs is skippable in two ways:**

1. **Supabase outage / exception**: The try/catch fail-open means any error skips all limit checks.
2. **`club_risk_settings` table doesn't exist for a club**: The catch silently swallows the error and `cs = {}` defaults to null for every limit — all club-level checks become no-ops.

---

## 3. Can public clients call the RPC directly?

**Current GRANT status** (from migration 009):
```sql
GRANT EXECUTE ON FUNCTION public.place_bet_tx(...) TO authenticated, service_role;
```
And also from migration `2026-05-27_place_bet_tx_balance_fix_v2.sql`:
```sql
GRANT EXECUTE ON FUNCTION public.place_bet_tx(...) TO authenticated, service_role;
```
`authenticated` = any logged-in Supabase user. **If the Supabase URL and anon key were known to a client**, they could call `place_bet_tx` directly via `POST https://<supabase-url>/rest/v1/rpc/place_bet_tx` with a valid JWT — bypassing ALL JS risk limit checks.

**Current exposure level**: The Supabase URL and anon key are **NOT embedded in any frontend file** and are **not returned by any backend endpoint**. The backend only exposes `hasSupabaseUrl: true` (boolean) from `/api/env-check`. An attacker would need to:
1. Obtain the Supabase project URL (guessable from the format `<project-ref>.supabase.co`)
2. Obtain the anon key (not currently exposed anywhere)
3. Register a Supabase auth user (possible if email signup is open)
4. Get a valid JWT with `authenticated` role

**Verdict**: Not currently exploitable from the web UI because the anon key isn't exposed. However, the `GRANT TO authenticated` means this attack surface exists and would become a real risk if:
- The anon key ever leaks (logs, error messages, env dump, git history)
- A team member tests against Supabase directly and forgets limits bypass

---

## 4. Is _pb_check_risk_limits deployed and active in place_bet_tx?

**Migration 009 status**: The migration file `009_risk_limits.sql` defines `_pb_check_risk_limits()` AND a new `place_bet_tx` that calls it. However, this was applied to the **Supabase** project (via migration files), while the later migration `2026-05-27_place_bet_tx_balance_fix_v2.sql` (applied to **Railway PostgreSQL**) does NOT call `_pb_check_risk_limits`.

The project has two separate databases:
- **Railway PostgreSQL** — used by the legacy `/api/clubs`, `/api/bets`, `/api/auth/login` routes
- **Supabase** — used by all modern RPC calls (`place_bet_tx`, `grade_ticket_tx`, etc.)

The `_callMoneyRpc('place_bet_tx', ...)` call goes to **Supabase**.

Migration 009 was intended to be applied to Supabase — if it was applied, `_pb_check_risk_limits` IS running inside the RPC. If it wasn't, the RPC has no risk limit enforcement.

**Verified behavior**: A `stake=501` bet against the club's `max_stake=500` returns `odds_service_unavailable` (snapshot check fires first), not `stake_above_max`. This is inconclusive — it could mean the migration wasn't applied, or simply that the snapshot check fires before the RPC is reached.

**What is confirmed**: The deployed RPC returns `push_reduced=true` correctly (GRD-2 smoke test just passed), which means the latest Supabase migration (023) is active. Whether migration 009's `_pb_check_risk_limits` addition was applied cannot be determined from JS-side probing alone without a direct DB query.

---

## 5. Which checks are practical to move/confirm inside place_bet_tx

All these checks already exist in `_pb_check_risk_limits` (migration 009):

| Check | Data needed | Already in RPC params |
|---|---|---|
| `suspended_until` | player_limits.suspended_until | Read from DB inside RPC ✅ |
| `max_single_bet` | player_limits.max_single_bet | Read from DB inside RPC ✅ |
| `max_payout` | player_limits + club_risk_settings | Read from DB inside RPC ✅ |
| `min_stake` / `max_stake` | club_risk_settings | Read from DB inside RPC ✅ |
| `max_open_risk` (player) | tickets table | Queried inside RPC ✅ |
| `club_open_risk_exceeded` | tickets table | Queried inside RPC ✅ |
| `event_risk_exceeded` | ticket_legs + tickets | `p_canonical_keys[]` already passed ✅ |
| `market_risk_exceeded` | ticket_legs + tickets | `p_markets[]` already passed ✅ |
| `blocked_sports/markets` | player_limits + club | `p_sports[]`, `p_markets[]` already passed ✅ |
| `allow_parlays/teasers` | club_risk_settings | `p_bet_type` already passed ✅ |
| `allow_live_betting` | club_risk_settings | `p_is_live` already passed ✅ |
| `allowed_sports` | player_limits.allowed_sports | `p_sports[]` already passed ✅ |

**All data needed for full enforcement is already passed as RPC params.**

---

## 6. Does place_bet_tx receive enough leg data for sports/market enforcement?

**Yes — completely.** The RPC already receives:
```sql
p_sports         text[]   -- e.g. ['mlb', 'nba']
p_markets        text[]   -- e.g. ['moneyline', 'spread']
p_canonical_keys text[]   -- e.g. ['MLB|team-a|team-b|2026-06-01']
p_is_live        boolean
p_bet_type       text     -- 'Single', 'Parlay', etc.
p_leg_count      int
```

And the JS call at line ~7789 already passes all of them:
```js
p_leg_count:    legsArr.length,
p_sports:       legsArr.map(l => l.sport?.toLowerCase()),
p_markets:      legsArr.map(l => l.market?.toLowerCase()),
p_canonical_keys: legsArr.map(l => l.canonicalGameKey),
p_is_live:      legsArr.some(l => l.isLive)
```

No RPC signature change is needed to enforce sports/markets/live. The params are already there.

---

## 7. Bypass Risk Ranking

| Risk | Severity | Exploitable today? |
|---|---|---|
| `_checkRiskLimitsJs` fail-open on exception | 🔴 HIGH | Yes — Supabase outage or DB error silently skips all limits |
| `GRANT TO authenticated` on place_bet_tx | 🟡 MEDIUM | Not today (anon key not exposed) — latent risk |
| `club_open_risk_exceeded` / `event_risk_exceeded` dead code in JS | 🟡 MEDIUM | Yes — these codes are defined but never actually returned |
| Migration 009 `_pb_check_risk_limits` not confirmed active in Supabase | 🟡 MEDIUM | Unknown — cannot confirm without direct DB query |
| `allowed_sports` null = all allowed (correct but verify) | 🟢 LOW | No — correct behavior |
| `live_betting_disabled` check uses `leg.server_is_live` not `leg.isLive` | 🟢 LOW | Minor — consistent with snapshot result |

---

## 8. Recommendation

### Option B: Add RPC-level defense-in-depth for numeric/suspension checks only

**Rationale**:
- Migration 009 already wrote `_pb_check_risk_limits()` — the work is mostly done
- The RPC signature already receives all needed params — no signature change needed
- The single highest risk is **fail-open JS check on exception** — RPC enforcement fixes this
- The `GRANT TO authenticated` risk is latent but requires action eventually

**What to do**:

1. **Confirm migration 009 was applied to Supabase** — run a direct query:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = '_pb_check_risk_limits';
   ```
   If missing, apply `009_risk_limits.sql` to Supabase.

2. **Change JS fail-open to fail-CLOSED**: The `try/catch` in `bets/place` should reject the bet on exception, not silently allow it. This is a one-line JS change.

3. **Revoke `authenticated` from place_bet_tx**, grant to `service_role` only. Direct Supabase clients cannot be trusted to enforce JS-side limits. This requires a one-line migration.

4. **Fix the three dead-code risk checks** (`club_open_risk_exceeded`, `event_risk_exceeded`, `market_risk_exceeded`) — these are already in `_pb_check_risk_limits` (migration 009) but dead in `_checkRiskLimitsJs`. They need to either be removed from `RISK_CODE_STATUS` or actually implemented in JS.

### Smallest safe next patch

**Change 1 (one line, JS only):** Make risk check fail-CLOSED:
```js
// Before:
} catch(riskErr) {
  console.warn('[bets/place] risk check error (fail-open):', riskErr.message);
}

// After:
} catch(riskErr) {
  console.error('[bets/place] risk check error — failing closed:', riskErr.message);
  emitRiskAlert('repeated_rate_limit', clubId, playerId, { reason:'risk_check_exception', err:riskErr.message });
  return res.status(503).json({ ok:false, error:'risk_check_unavailable',
    hint:'Please retry. If this persists, contact support.' });
}
```

**Change 2 (one SQL statement, migration):** Revoke `authenticated` from place_bet_tx:
```sql
REVOKE EXECUTE ON FUNCTION public.place_bet_tx(...) FROM authenticated;
-- Keep: GRANT EXECUTE ... TO service_role;
```

These two changes together eliminate both the active bypass risk and the latent direct-RPC risk without any new logic complexity.
