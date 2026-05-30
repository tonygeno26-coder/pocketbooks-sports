# Settlement Invariants Audit
**Date:** 2026-05-27  
**Status:** Read-only findings. No code modified.  
**Auditor:** AI assistant, full source review of `pocketbooks-sports-backend/index.js`

---

## 1. Files / Functions Involved

| Function / Route | Location | Role |
|---|---|---|
| `GET /api/host/settlements-preview` | line 7030 | Per-player preview before any payment |
| `POST /api/host/settle-player` | line 7114 | Execute one cash payment, write ledger |
| `POST /api/host/weekly-rollover` | line 7236 | Snapshot all players for a week |
| `POST /api/host/settlements/close-week` | line 8225 | Create canonical `settlement_snapshots` from `ledger` table |
| `GET /api/host/reconciliation` | line 8373 | Per-player ledger vs ticket dual-path comparison |
| `GET /api/host/settlement-reconciliation` | line 8421 | Club-wide ticket/ledger/rollover triple-path comparison |
| `GET /api/player/dashboard` | line 7808 | Player-facing balance and ticket lists |
| `POST /api/bets/place` balance check | line 7415 | Pre-placement balance gate |
| `_deriveLedgerBalance(startingLimit, rows)` | line 3392 | Canonical ledger math |
| `_deriveAvailableBalance(clubId, playerId, start)` | line 3455 | Async wrapper used by RPC path |

---

## 2. Current Formulas

### 2a. Available Balance (player dashboard, bets/place gate)
```
available = startingBalance - openRisk - settledLosses + settledGains
```
- `startingBalance` — pulled from `club_members.balance_start` (default 1000 if missing)
- `openRisk` — sum of `risk_amount` for status IN ('active','open')
- `settledGains` — sum of `potential_profit` for status = 'won'
- `settledLosses` — sum of `risk_amount` for status = 'lost'
- **Excluded from all four:** canceled, voided, deleted, push, pushed

**Source table:** `tickets` filtered by `player_id` only (no `club_id` filter in bets/place balance check — see Bug #1)

### 2b. Settlement Preview (settlements-preview, settle-player re-derive)
```
settledNet = Σ potential_profit (won) - Σ risk_amount (lost)
owesHost   = abs(settledNet) if settledNet < 0
hostOwes   = settledNet      if settledNet > 0
```
- Open tickets skipped from net but tracked in `openRisk`
- Canceled / voided / push / pushed excluded
- **Source table:** `tickets` filtered by `club_id` (preview) and `club_id + player_id` (settle-player)

### 2c. Weekly Rollover Snapshot
Same formula as preview. Writes to `weekly_player_snapshots` and `weekly_rollovers`.  
Also calls `weekly_rollover_tx` RPC per player with **hardcoded `p_starting_balance: 1000`** — see Bug #2.

### 2d. Close-Week (canonical settlement_snapshots)
Uses `ledger` table (canonical, credit/debit rows) as primary source:
```
ledgerBal  = startingLimit + Σ credits - Σ debits   (from ledger table)
netResult  = Σ potential_profit (won) - Σ risk_amount (lost)  (from tickets)
finalBal   = ledgerBal - openRisk
amtOwedByPlayer = abs(netResult) if netResult < 0
amtOwedToPlayer = netResult      if netResult > 0
```
- Members sourced from `club_memberships WHERE status='active'`
- Player limits from `player_limits` (fallback 1000)
- **Does NOT exclude push/pushed from netResult calculation** — see Bug #3

### 2e. Reconciliation (dual-path comparison)
`/api/host/reconciliation` computes both:
- `ledgerAvail` — via `_deriveLedgerBalance` (canonical)
- `ticketAvail` — via `startingLimit - openRisk - losses + gains` (ticket scan)

Mismatch = `|ledgerAvail - ticketAvail| > 0.01`

---

## 3. Risks and Bugs Found

### 🔴 Bug #1 — bets/place balance check ignores club_id filter
**File:** line 7418  
**Code:**
```js
const { data: playerTix } = await sb.from('tickets')
  .select('status,risk_amount,potential_profit').eq('player_id', playerId);
// NO .eq('club_id', clubId)
```
**Risk:** Player could have tickets in other clubs counted against their balance in this club. If a player is a member of two clubs and has losses in club B, those losses reduce their available balance in club A.  
**Severity:** HIGH — can deny valid bets or allow bets in clubs that share players.

### 🔴 Bug #2 — weekly_rollover_tx RPC called with hardcoded starting_balance: 1000
**File:** line 7314  
**Code:**
```js
p_starting_balance: 1000, // snapshot value
```
**Risk:** RPC receives wrong starting balance for players whose `player_limits.balance_start` != 1000. The rollover ledger entry is written with incorrect opening balance, causing carryover drift.  
**Severity:** HIGH — ledger carryover will be wrong for any non-default balance.

### 🟡 Bug #3 — close-week netResult includes push/pushed tickets
**File:** line 8296 (close-week snapshot builder)  
**Code:**
```js
ptix.forEach(function(t){
  var s=t.status.toLowerCase(), r=...p=...
  if(s==='active'||s==='open'){openRisk+=r;openCt++;}
  else closedCt++;
  if(s==='won') gains+=p;
  if(s==='lost') losses+=r;
  // push/pushed: falls into closedCt but NOT excluded from gains/losses math
  // → gains and losses are 0 for push, so no delta. But:
  // ticket_count and closed_ticket_count INCLUDE pushes without labeling them
});
```
**Risk:** Push tickets add to `closedCt` without adding to gains/losses — numerically harmless BUT `amount_owed_by_player` / `amount_owed_to_player` could be non-zero if push tickets have nonzero `potential_profit` (race condition where a push is written with leftover profit). Low probability but silent.  
**Severity:** LOW-MEDIUM — no direct money error currently, but no explicit exclusion guard.

### 🟡 Bug #4 — settlements-preview reads from `club_members` (legacy PG table), not `club_memberships` (Supabase)
**File:** line 7049  
**Code:**
```js
let mq = sb.from('club_members').select('player_id,balance_start');
```
**Risk:** `club_members` is the legacy PostgreSQL schema table. The canonical Supabase table is `club_memberships`. If a club's members were created through the new system (UUID IDs), their `balance_start` will not be found in `club_members`, and the preview will default all balances to 1000.  
**Severity:** MEDIUM — balance display wrong if player_limits row doesn't exist; settlement net calculation unaffected (only the "balance" display field is sourced here, not owesHost/hostOwes).

### 🟡 Bug #5 — settle-player overpay validation uses ticket-scan, not ledger-scan
**File:** line 7145  
**Code:**
```js
(tickets||[]).forEach(function(t){
  var s=t.status.toLowerCase()...
  if (s==='lost') owesHost += r;
  if (s==='won')  hostOwes += p;
  // active/open SKIPPED from net (correct)
  // canceled/voided/push SKIPPED (correct)
});
```
The overpay check (`amt > maxAmt + 0.01`) correctly excludes open/canceled/push. **But** it does not account for prior partial payments — if the host already paid $50 of a $100 debt, the max is still shown as $100, not $50. The Supabase `settlement_payments` table exists but is not consulted here.  
**Severity:** MEDIUM — allows host to "double-pay" a player (overpaying relative to net owed + prior payments).

### 🟡 Bug #6 — weekly-rollover does not check for prior payments before snapshotting
**File:** line 7258  
Similar to Bug #5 — the snapshot treats the full net as owed even if partial cash payments were already made. The `settlement_payments` table is not consulted.  
**Severity:** MEDIUM — snapshot will show inflated "owes" if settlement was partially paid before rollover.

### 🟢 Note #7 — push handling is inconsistent across endpoints
| Endpoint | Push excluded? |
|---|---|
| settlements-preview | ✅ `push/pushed` → `return` (excluded) |
| settle-player re-derive | ✅ `push/pushed` → `return` |
| weekly-rollover | ✅ `push/pushed` → `return` |
| close-week snapshot | ⚠️ push falls into `closedCt` — no explicit exclusion in gains/losses, but no math error since gains/losses are 0 for push |
| player dashboard | ✅ `push/pushed` → tracked in settled list, not in gains/losses |
| bets/place balance gate | ✅ `push/pushed` → `return` |
| settlement-reconciliation | ✅ `push/pushed` → `return` |

### 🟢 Note #8 — idempotent cancel/grade entries are handled correctly
- `cancel_bet_tx` RPC is idempotency-keyed via `ledger.idempotency_key` (unique constraint `23505` = safe duplicate).
- `grade_ticket_tx` RPC similarly idempotent.
- `settle_player_tx` RPC similarly idempotent.
- All three: if `!ok && !idempotent` → route returns error. If `idempotent` → route returns success.
- **No double-counting risk from retried RPCs.**

### 🟢 Note #9 — weekly_rollovers UNIQUE constraint prevents duplicate periods
**File:** line 7285  
```js
const { data: existing } = await sb.from('weekly_rollovers')
  .select('id').eq('club_id', clubId).eq('rollover_week', week).limit(1);
if (existing && existing.length > 0)
  return res.status(409).json(...)
```
Correct. Duplicate rollover for same (club_id, week) is blocked at application layer. Schema UNIQUE constraint also enforces at DB layer.

### 🟢 Note #10 — close-week period_id format: `SP_<clubId>_<weekStart>`
Period IDs are deterministic strings. For UUID clubs: `SP_d616dc2a-...-97b1_2026-05-26`. Unique per (club, week). `settlement_periods` has `onConflict:'club_id,week_start'` upsert for creation, then explicit `period_already_closed` guard.

### 🔴 Bug #11 — settlement-reconciliation preview uses ticket-only path, not ledger
**File:** line 8452  
The "settlement preview" section of the reconciliation endpoint recomputes `owesHost`/`hostOwes` from tickets directly, not from the canonical `ledger` table. This means the reconciliation "balance check" can show `balanced` even when the canonical ledger disagrees with ticket scan. The mismatch check only compares `ticketTotals.profit` vs `previewTotals.net` (same data source, different aggregation) — they will always match unless there's a floating-point rounding divergence.  
**Severity:** MEDIUM — the reconciliation endpoint gives false confidence; it doesn't actually cross-check ledger vs tickets for settlement numbers.

### 🟢 Note #12 — legacy numeric club IDs now blocked on all settlement routes
`requireCanonicalClubId` guard added (deployed `fb3f65e`). All settlement routes now reject numeric clubId. No legacy path reaches Supabase settlement logic.

---

## 4. Tests Needed

### Priority 1 (HIGH — money correctness)

| Test | What it proves |
|---|---|
| `bets/place balance gate uses club-scoped tickets only` | Bug #1: player in two clubs gets correct available balance per club |
| `weekly_rollover_tx receives actual balance_start, not hardcoded 1000` | Bug #2: rollover ledger has correct opening balance |
| `settle-player overpay blocked even after partial prior payment` | Bug #5: can't pay more than net owed minus already paid |
| `preview = settle-player re-derive for same club state` | Preview and execution agree on same ticket set |

### Priority 2 (MEDIUM — settlement correctness)

| Test | What it proves |
|---|---|
| `close-week excludes push tickets from netResult` | Bug #3: push explicitly excluded in snapshot math |
| `weekly rollover accounts for prior payments in owesHost/hostOwes` | Bug #6: partial payments reduce snapshot balance |
| `reconciliation ledger path disagrees with ticket path when ledger has extra entries` | Bug #11: catches when ledger ≠ ticket scan |
| `settlement_snapshots amount_owed equals preview owesHost/hostOwes` | snapshot output matches preview output for same state |

### Priority 3 (CORRECTNESS — formula verification)

| Test | What it proves |
|---|---|
| `canceled ticket excluded from settlement net` | Invariant: cancel refund is not treated as win |
| `voided ticket excluded from settlement net` | Invariant: void is neutral |
| `push ticket excluded from settlement net` | Invariant: push has no monetary effect |
| `net = hostOwes - owesHost correctly signed` | Direction math is correct |
| `available < 0 warning fires when loss exceeds start` | Edge case: starting balance fully consumed |
| `period_id is deterministic: SP_{clubId}_{weekStart}` | Two calls for same (club,week) produce same periodId |

---

## 5. Recommended First Safe Fix

**Fix Bug #1 first — bets/place balance check must filter by club_id.**

This is the highest severity because it silently miscalculates available balance and can:
- Deny valid bets for players with losses in other clubs
- (Theoretically) allow bets in a club where a player has an inflated cross-club balance

**Change required (bets/place, line ~7418):**
```js
// BEFORE (no club filter):
const { data: playerTix } = await sb.from('tickets')
  .select('status,risk_amount,potential_profit').eq('player_id', playerId);

// AFTER (club-scoped):
const { data: playerTix } = await sb.from('tickets')
  .select('status,risk_amount,potential_profit')
  .eq('player_id', playerId)
  .eq('club_id', clubId);
```

**Safe to deploy without any other change.** This is purely additive (narrows the query). It cannot create false positives (wrongly blocking bets) unless a player truly has losses in the current club that were not previously counted. It can only fix false negatives (wrongly allowing bets using cross-club balance).

**Second fix — hardcoded balance in weekly_rollover_tx (Bug #2):**
```js
// BEFORE:
p_starting_balance: 1000, // snapshot value

// AFTER:
p_starting_balance: balMap[p.playerId] || 1000,
// where balMap is already computed from player_limits earlier in the same function
```
The `balMap` variable is already in scope at that point — this is a one-line fix.

---

## 6. Formula Summary (canonical)

```
available_balance = starting_balance
                  - Σ risk_amount [active|open]
                  - Σ risk_amount [lost]
                  + Σ potential_profit [won]
                  # canceled, voided, deleted, push, pushed: excluded

settlement_net_per_player = Σ potential_profit [won] - Σ risk_amount [lost]
  → if net < 0: player owes host |net|
  → if net > 0: host owes player net
  # active/open: excluded (in progress)
  # canceled, voided, push: excluded

ledger_balance = starting_limit + Σ credit_amounts - Σ debit_amounts
  # from canonical ledger table only
  # close-week uses this path; preview/settle-player use ticket scan

net_reconciliation_amount = player_owes - payments_already_made
  # BUG: currently not implemented — prior payments not subtracted
```
