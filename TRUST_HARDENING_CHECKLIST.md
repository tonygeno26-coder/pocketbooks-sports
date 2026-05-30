# Trust Hardening Checklist — Pre-Internal-Testing Audit
**Date:** 2026-05-27  
**SHA:** 4e4a7e9 (club-members-cleanup)  
**Type:** Read-only. No code modified.

---

## Top 10 Risks — Ranked by Severity

---

### 🔴 RISK #1 — Client-supplied `potentialProfit` stored in DB and used for win payouts
**Severity:** CRITICAL — direct money manipulation attack vector  
**File:** `index.js` line ~7699 (bets/place RPC call)  
**Function:** `POST /api/bets/place` → `place_bet_tx` RPC

**Problem:**
```js
p_potential_profit: rnd(parseFloat(potentialProfit)||0),  // from client body
```
`potentialProfit` comes from `req.body.potentialProfit` — the client. `place_bet_tx` stores it in `tickets.potential_profit`. Later, `grade_ticket_tx` reads `v_ticket.potential_profit` and credits it:
```sql
v_amount := ROUND(v_ticket.risk_amount + p_profit, 2);  -- p_profit = stored potential_profit
```
A player who submits `potentialProfit: 999999` in the placement request body will have that value stored in the DB. When the bet is graded as a win, they receive `risk_amount + 999999` in ledger credits.

**Partial mitigation:** The JS risk check checks `payout_above_max` against the client value before calling the RPC, so clubs with a configured `max_payout` limit will catch inflated payouts. BUT:
- The risk check is in JS before the RPC, and uses the same client value
- If `club_risk_settings.max_payout` is null/not set → `maxPayout = 999999` (default)
- The snapshot recalculation (`_recalcPayoutFromSnapshots`) correctly re-derives payout, but the result (`payoutResult.profit`) is **never used in the RPC call** — only the legs' `accepted_odds_*` fields are updated in `legsArr`

**Fix needed:** After snapshot recalculation succeeds, use `payoutResult.profit` and `payoutResult.payout` for the RPC call, not the client body values.

---

### 🔴 RISK #2 — `oddsAccepted=true` in client body completely bypasses snapshot validation
**Severity:** HIGH — full odds bypass, enables stale/manipulated line acceptance  
**File:** `index.js` line 7566 (bets/place)  
**Frontend:** `player.html` line 3914

**Problem:**
```js
if (!_bodyRaw.oddsAccepted) {
  // snapshot validation...
} else {
  console.log('[bets/place] oddsAccepted=true — skipping snapshot validation');
}
```
Any client can send `{"oddsAccepted": true}` and bypass all snapshot validation, odds drift checks, market status checks, stale odds detection, and server-side payout recalculation. The frontend uses this for the "accept new odds" retry flow, but there is **no server-side guard** preventing any client from setting this field directly.

In the frontend's retry flow, `updatedLegs` from the server's `odds_changed` rejection is used — but the backend doesn't actually return `updatedLegs`. When `_od.updatedLegs` is undefined, `_dbPayload.legs` (original client legs) are reused, meaning the retry sends the original stale odds AND skips validation.

**Fix needed:** `oddsAccepted` must only be honored when server-side conditions are met (e.g., token with `jti` + recent `odds_changed` rejection recorded in a short-lived server cache). Or: remove `oddsAccepted` bypass entirely and have the server auto-accept when snapshot shows drift ≤ configured threshold.

---

### 🔴 RISK #3 — `DEV_AUTH_BYPASS=true` is set in Railway **production**
**Severity:** HIGH — authentication is effectively disabled in production  
**File:** `index.js` line 3122  
**Env:** Railway production env (confirmed in prior session logs)

**Problem:**
```js
const bypassAllowed = !IS_PRODUCTION || DEV_AUTH_BYPASS;
// DEV_AUTH_BYPASS=true in production → bypassAllowed=true
```
When `bypassAllowed=true` and no `Authorization` header is present:
```js
return { actorId:'dev-owner', role:'owner', clubId:bypassClub, platformRole:'platform_admin', isDevBypass:true };
```
Any unauthenticated request to any API route is treated as `owner`/`platform_admin`. This includes bet placement, settlement execution, grading, and all admin routes.

Known intentional for development, but running in `NODE_ENV=production` with `DEV_AUTH_BYPASS=true` means the platform is effectively open to anyone who knows the API URL.

**Fix needed:** Before internal testing, `DEV_AUTH_BYPASS` must be set to `false` in Railway production. OR: add a hard block that prevents bypass when `NODE_ENV=production` regardless of `DEV_AUTH_BYPASS`.

---

### 🔴 RISK #4 — No row lock when `player_limits` row doesn't exist (race condition in `place_bet_tx`)
**Severity:** HIGH — concurrent bet placements can both pass balance check  
**File:** `008_money_rpcs.sql` line 78

**Problem:**
```sql
-- Balance check (FOR UPDATE lock on player_limits)
PERFORM 1 FROM player_limits WHERE club_id=p_club_id AND player_id=p_player_id FOR UPDATE;
```
`FOR UPDATE` on `player_limits` prevents concurrent balance checks. However, if the `player_limits` row doesn't exist (new player, no limit row yet), `PERFORM 1 FROM player_limits ... FOR UPDATE` locks **nothing**. Two concurrent `place_bet_tx` calls for the same player with no `player_limits` row will:
1. Both find no row → both use `v_starting=1000`
2. Both read ledger balance (same value, no lock)
3. Both pass the `v_available > p_stake` check
4. Both write their tickets and ledger entries
5. Player has now placed 2x their available balance

The `ledger` table's unique constraint on `ledger_id` prevents duplicate ledger rows, but two distinct tickets with distinct `ledger_id`s can both succeed.

**Fix needed:** Upsert/insert a `player_limits` row at membership creation. Or: add an advisory lock keyed on `(club_id, player_id)` before the balance check.

---

### 🟡 RISK #5 — `_debug` object leaked in 403 `club_scope_mismatch` response
**Severity:** MEDIUM — internal auth state exposed to any caller who gets a 403  
**File:** `index.js` line 4742

**Problem:**
```js
return res.status(403).json({ ok:false, error:'club_scope_mismatch',
  actorClubId:actor.clubId, requestedClubId, action,
  hint:'token_club_must_match_payload_clubId',
  _debug:{ buildMarker:'legacy-auth-fix-v5-full-trace',
           actorError:actor.error||null, actorClubId:actor.clubId||'',
           legacyToken:actor.legacyToken||false,
           membershipVerified:actor.membershipVerified||false,
           isDevBypass:actor.isDevBypass||false } });
```
This is in `requirePermissionScoped` — called for every protected route. Any player who sends a mismatched club ID in production gets `isDevBypass`, `legacyToken`, `membershipVerified` in their 403 response. This reveals internal auth mechanism details to attackers probing the API.

**Fix needed:** Remove `_debug` object from production responses. Log contents server-side only.

---

### 🟡 RISK #6 — `place_bet_tx` ON CONFLICT DO NOTHING on tickets table
**Severity:** MEDIUM — ticket insert can silently fail, ledger entry still written  
**File:** `008_money_rpcs.sql` line 92

**Problem:**
```sql
INSERT INTO tickets(...)
VALUES(...)
ON CONFLICT (id) DO NOTHING;
-- Then immediately:
INSERT INTO ledger(...) VALUES(...);  -- always runs
```
If a ticket with the same ID already exists (e.g., a dev test collision or idempotency key reuse), the ticket insert does nothing but the ledger `BET_PLACED` debit still fires. This creates a ledger debit with no corresponding ticket — balance is reduced without a bet existing.

The idempotency check at the start (`IF FOUND THEN RETURN idempotent`) should catch most cases, but only if the ledger row exists. If the ticket exists but the ledger row doesn't (partial failure from a previous run), the RPC will write a new ledger debit but not a new ticket.

**Fix needed:** Check `IF NOT FOUND` after the ticket insert and return an error if `ON CONFLICT DO NOTHING` caused a silent skip (i.e., the ticket already existed but wasn't created by this call).

---

### 🟡 RISK #7 — `grade_ticket_tx` uses `p_profit` from server-read `ticket.potential_profit`, which was originally client-supplied
**Severity:** MEDIUM — see Risk #1 for full chain; the RPC itself is correct but its input is tainted  
**File:** `index.js` lines 6342/6460 (auto-grade), 6344/6477 (manual grade)

**Problem:**
```js
const profit = parseFloat(ticket.potential_profit)||0;  // read from DB
await _callMoneyRpc('grade_ticket_tx', { p_profit:profit, ... });
```
`ticket.potential_profit` was originally written from `p_potential_profit` = client body value. All grading paths (auto-grade, manual grade, worker grade) read from the stored ticket. This means the profit inflation in Risk #1 propagates through all grading paths.

The manual grade route correctly reads `ticket.potential_profit` from DB (not from request body), so the grading route itself cannot inflate profit — only the original placement can. But the damage from Risk #1 persists through all grade paths.

**Status:** Dependent on Risk #1 fix.

---

### 🟡 RISK #8 — `oddsAccepted=true` retry in frontend uses original legs (not server-refreshed odds)
**Severity:** MEDIUM — odds bypass retry sends stale odds + bypasses recalculation  
**File:** `player.html` line 3914

**Problem:**
```js
var _rp = Object.assign({}, _dbPayload, {
  legs: _od.updatedLegs || _dbPayload.legs,  // falls back to ORIGINAL legs
  oddsAccepted: true,
  idempotencyKey: _dbPayload.idempotencyKey+'_oa'
});
```
The backend's `odds_changed` rejection does not return `updatedLegs` (field doesn't exist in the response). So `_od.updatedLegs` is always `undefined`, and `_dbPayload.legs` (original stale odds) are reused. Combined with `oddsAccepted=true`, this means:
1. Client submits bet with odds X
2. Server detects odds changed to Y, rejects with `odds_changed`
3. Client retries with `oddsAccepted=true` and STILL odds X (not Y)
4. Server skips validation because `oddsAccepted=true`
5. Bet is placed at stale odds X with no validation

**Fix needed:** Server should return `updatedLegs` (with `accepted_odds_american` stamped) in the `odds_changed` response, OR recalculate on the retry regardless of `oddsAccepted`.

---

### 🟡 RISK #9 — `cancel_bet_tx` doesn't lock against concurrent cancels + concurrent grade
**Severity:** MEDIUM — race between cancel and grade can result in double-credit  
**File:** `008_money_rpcs.sql` line 127

**Problem:**
```sql
SELECT * INTO v_ticket FROM tickets WHERE id=p_ticket_id FOR UPDATE;
```
`cancel_bet_tx` locks the ticket row. `grade_ticket_tx` also locks the ticket row (`FOR UPDATE`). The idempotency checks are:
- Cancel: checks `ledger WHERE event_type='BET_CANCELED_REFUND'`
- Grade: checks `ledger WHERE event_type IN ('BET_GRADED_WIN','BET_GRADED_LOSS','BET_GRADED_PUSH')`

If cancel and grade execute concurrently (before either writes to ledger), both pass their idempotency checks, both lock the ticket row (one waits), then:
- Whichever wins the lock first changes `ticket.status`
- The second sees `status NOT IN ('active','open')` and correctly returns `invalid_transition`

This is actually handled correctly by the `FOR UPDATE` lock + status check. However, there is a window between the idempotency check and the `FOR UPDATE` lock where both functions have passed their ledger checks but neither has the lock. **In PostgreSQL, `FOR UPDATE` serializes this correctly** — the second caller will see the updated ticket status. ✅ Safe.

The one real gap: `cancel_bet_tx` checks `ticket_legs WHERE scheduled_start <= NOW()` to block post-start cancels. If this query happens between a grade writing the ticket status and the cancel checking it, the cancel could see `status='active'` but the game has already started. This is a narrow window but possible in high-concurrency scenarios.

---

### 🟢 RISK #10 — Auth log traces expose `actorId`, `clubId`, `legacyToken` state
**Severity:** LOW — server-side logs only, but detailed for a production system  
**File:** `index.js` lines 4723, 4674, 4695, 3137

**Problem:**
Every auth check in `requirePermissionScoped` logs:
```
[auth] RPS_ENTRY action=... actor.actorId=? actor.clubId="..." actor.legacyToken=...
[auth] MEMBERSHIP_QUERY clubId=? actorId=? found=? status=? role=?
[auth] LEGACY_MEMBERSHIP_OK actor=? reqClub=? dbRole=? status=?
[auth] CSM_RETURN_v4 buildMarker=... actor.error=... actor.isDevBypass=...
```
These are Railway server logs. Actor IDs, club IDs, membership status, and dev bypass state are all logged verbatim. In a shared Railway environment, these logs are potentially visible to service collaborators. Not a critical issue for internal testing but should be reduced to event-type only before any external users.

---

## Complete Settlement Flow Assessment (from prior audit)

| Issue | Status |
|---|---|
| Bug #1: bets/place cross-club balance | ✅ Fixed |
| Bug #2: weekly-rollover hardcoded 1000 | ✅ Fixed |
| Bug #4: settlements-preview club_members | ✅ Fixed |
| Bug #5: settle-player prior payments | ✅ Fixed |
| Bug #6: weekly-rollover prior payments | ✅ Fixed |
| Bug #11: reconciliation real cross-check | ✅ Fixed |
| R1: double SETTLEMENT_APPLIED | ✅ Fixed (guard A+B) |
| club_members in bets/place + dashboard | ✅ Fixed |

---

## Frontend/Server Authority Audit

| Value | Source | Server re-derives? | Risk |
|---|---|---|---|
| `stake` | Client body | Yes — used directly, but balance check blocks excess | Low |
| `potentialProfit` | Client body | **No** — stored and used for win credit | 🔴 CRITICAL (Risk #1) |
| `payout` | Client body | Partially — snapshot recalc runs but result unused in RPC | 🔴 HIGH (Risk #1) |
| `odds` (per leg) | Client body | Yes — snapshot validates against DB, rejects if drifted | Low |
| `playerId` | Client body or token actorId | No direct override, membership lookup validates | Medium |
| `clubId` | Client body + token claim | Token claim enforced in `requirePermissionScoped` | Low (after fixes) |
| `role` | Token claim | DB membership lookup validates in production | Low |
| `betType` | Client body | Validated against `VALID_TYPES` set | Low |
| `direction` (settle) | Client body | Validated against `VALID_DIR` set | Low |
| `amount` (settle) | Client body | Validated server-side against ticket net + prior payments | Low (after Bugs #5/#6) |

---

## Recommended Next Fix Order

1. **Risk #3** — Disable `DEV_AUTH_BYPASS` in production **before any internal testing**. One Railway env var change. No code change needed. Without this, all other auth fixes are irrelevant because auth is bypassed.

2. **Risk #1 + #2** — Server must use `payoutResult.profit`/`payoutResult.payout` for the RPC call (not client body values), AND `oddsAccepted` bypass must be removed or server-gated. These must be fixed together.

3. **Risk #5** — Strip `_debug` from 403 `club_scope_mismatch` response. One-line removal.

4. **Risk #4** — Ensure `player_limits` row exists at membership approval, OR add advisory lock for the no-row case in `place_bet_tx`. Medium effort, requires Supabase migration.

5. **Risk #6** — Detect and return error when ticket `ON CONFLICT DO NOTHING` silently succeeds (ticket already existed). Small RPC change.
