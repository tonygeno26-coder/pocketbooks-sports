# Ledger Invariant Audit
**Date:** 2026-05-27  
**SHA:** 0f6fe6c (settlement-audit-fixes-complete)  
**Type:** Read-only. No code modified.

---

## 1. Ledger Event Types

### Canonical `ledger` table (Supabase — authoritative)

| Event Type | Direction | Trigger | Amount |
|---|---|---|---|
| `BET_PLACED` | **debit** | `place_bet_tx` RPC | stake amount |
| `BET_CANCELED_REFUND` | **credit** | `cancel_bet_tx` RPC | ticket.risk_amount |
| `BET_GRADED_WIN` | **credit** | `grade_ticket_tx` RPC | risk + profit |
| `BET_GRADED_LOSS` | **neutral** | `grade_ticket_tx` RPC | risk_amount (not applied to balance!) |
| `BET_GRADED_PUSH` | **credit** | `grade_ticket_tx` RPC | risk_amount (refund) |
| `SETTLEMENT_APPLIED` | debit or credit | `settle_player_tx` RPC / `payment-confirm` | settlement amount |
| `WEEKLY_ROLLOVER` | **neutral** | `weekly_rollover_tx` RPC | 0 (snapshot marker only) |
| `BALANCE_ADJUSTMENT` | **credit** | crypto confirm / payment-void reversal / manual | variable |
| `HOST_ACTIVE_BETTOR_CHARGE` | (debit via host ledger) | `_writeLedgerEntry` | 15 diamonds |

### Mirror `ledger_entries` table (PostgreSQL — fire-and-forget)
- Written by `mirrorLedgerEntry()` from browser OR by settle-player as a legacy `settlement` type entry
- **Not used for any balance calculation** — display only
- Types used here (`bet_placed`, `bet_won`, `bet_lost`, `settlement`, etc.) are **different case conventions** from the canonical `ledger` table

### Critical discovery: `HOST_ACTIVE_BETTOR_CHARGE` is NOT in `LEDGER_EVENT_TYPES`
```js
const LEDGER_EVENT_TYPES = new Set([
  'BET_PLACED','BET_CANCELED_REFUND','BET_GRADED_WIN','BET_GRADED_LOSS',
  'BET_GRADED_PUSH','SETTLEMENT_APPLIED','WEEKLY_ROLLOVER','BALANCE_ADJUSTMENT'
]);
```
When `_writeLedgerEntry({ eventType:'HOST_ACTIVE_BETTOR_CHARGE' })` is called at line ~1028, the validation guard `if (!LEDGER_EVENT_TYPES.has(eventType)) throw new Error(...)` **will throw**. The call has `.catch(e => console.warn(...))` — so the error is silently swallowed every time. The host active-bettor charge writes to `host_diamond_ledger` (separate table, correct) but the `_writeLedgerEntry` call to `ledger` (player canonical table) **always fails silently**.

---

## 2. Balance Formulas by Endpoint

### A. `GET /api/player/dashboard` — **ticket-scan only**
```
available = startingBalance - openRisk - settledLosses + settledGains
```
- `startingBalance` from `club_members.balance_start` (legacy PG table — Bug #4 equivalent, not yet fixed here)
- `openRisk` = Σ risk_amount WHERE status IN ('active','open')
- `settledGains` = Σ potential_profit WHERE status='won'
- `settledLosses` = Σ risk_amount WHERE status='lost'
- **Does NOT read canonical `ledger` table**
- Push tickets: added to `settled[]` list but contribute $0 to gains/losses ✅
- Canceled/voided/deleted: excluded ✅

### B. `GET /api/host/dashboard` — **ticket-scan only**
```
profit = settledGain(risk collected on losses) - settledLoss(profit paid on wins)
```
- Reads tickets only; loads `ledger_entries` for display but **does not use them for balance math**
- Push: included in `graded[]` and `handle` count, not in profit/loss ✅

### C. `GET /api/host/settlements-preview` — **ticket-scan only** (Bug #4 fixed: now reads `player_limits`)
```
settledNet = Σ potential_profit(won) - Σ risk_amount(lost)
owesHost   = abs(settledNet) if negative
hostOwes   = settledNet if positive
```
- `balance` field now reads from `player_limits.balance_start` ✅ (fixed this session)
- Settlement math is purely ticket-based, not ledger-based

### D. `GET /api/host/reconciliation` — **dual path** (canonical ledger + ticket scan)
```
ledgerBal   = startingLimit + Σ credits - Σ debits   [from canonical ledger table]
ledgerAvail = ledgerBal - openRisk
ticketAvail = startingLimit - openRisk - losses + gains   [from tickets]
mismatch    = |ledgerAvail - ticketAvail| > 0.01
```
- This is the **only endpoint that actually uses canonical `ledger` table for balance**
- `_deriveLedgerBalance()` → sum credits - debits from `ledger` rows
- **Dual path comparison is correct** — this is the reference implementation

### E. `GET /api/host/settlement-reconciliation` — **bug #11 fixed** (ticket vs canonical ledger x-check)
- Now correctly compares ticket-net per player against canonical ledger credit/debit per player
- Uses `ledger` table (canonical) for ledgerNetByPlayer
- Uses `ledger_entries` table for `ledgerTotals` display section (legacy, not cross-checked)

### F. Supabase RPCs (`place_bet_tx`, `cancel_bet_tx`, `grade_ticket_tx`, `settle_player_tx`)
- All use `_pb_ledger_balance()` which reads canonical `ledger` table
- **These are the only paths where canonical ledger balance is authoritative for decisions**
- `place_bet_tx`: reads `player_limits.balance_start` ✅
- Balance formula in RPCs: `starting + Σ credits - Σ debits - openRisk`

---

## 3. Endpoints That Derive Balance from Tickets (Not Ledger)

| Endpoint | Source | Risk |
|---|---|---|
| `GET /api/player/dashboard` | Tickets only | Diverges from ledger if any out-of-band write occurs |
| `GET /api/host/dashboard` | Tickets only | Display only — no financial decisions made |
| `GET /api/host/settlements-preview` | Tickets only | Settlement preview could be wrong if grading missed a ticket |
| `POST /api/bets/place` (balance gate) | Tickets only | **Bug #1 fixed** (now club-scoped); still not ledger-backed |
| `POST /api/host/settle-player` (overpay check) | Tickets only | Bugs #5/#6 fixed; still not ledger-backed for gross owed |

**None of the ticket-scan balance paths read the canonical `ledger` table.**  
The canonical `ledger` table is **only** used by:
1. The 4 Supabase RPCs (place/cancel/grade/settle)
2. `GET /api/host/reconciliation` (for mismatch detection)
3. `GET /api/host/settlement-reconciliation` section 5b (after Bug #11 fix)

---

## 4. Endpoints That Can Mutate Balances Without Ledger Entries

### Confirmed safe (all write ledger):
- `place_bet_tx` → `BET_PLACED` debit ✅
- `cancel_bet_tx` → `BET_CANCELED_REFUND` credit ✅
- `grade_ticket_tx` → `BET_GRADED_WIN/LOSS/PUSH` ✅ (LOSS is neutral — see Risk #2)
- `settle_player_tx` → `SETTLEMENT_APPLIED` ✅
- `payment-confirm` → `SETTLEMENT_APPLIED` via `_writeLedgerEntry` ✅
- `payment-void` → `BALANCE_ADJUSTMENT` reversal ✅

### Potentially unsafe:
- **`/api/bets/place` balance gate** — JS-side check from ticket scan only. If RPC fails AFTER the JS check passes (race), ticket can exist without ledger entry until RPC is retried. Mitigated by idempotency key.
- **`/api/host/manual-grade`** — needs verification (reads from `_callMoneyRpc('grade_ticket_tx')` ✅ if wired correctly)
- **`weekly_rollover_tx`** — writes `WEEKLY_ROLLOVER` with amount=0, direction=neutral. No balance change. Safe but adds noise to ledger scans.

---

## 5. Double-Count Exposure/Profit/Loss Risks

### 🔴 Risk #1 — `settle_player_tx` AND `payment-confirm` can BOTH write `SETTLEMENT_APPLIED`
Two separate routes write `SETTLEMENT_APPLIED` for the same payment:
- **Route A**: `POST /api/host/settle-player` calls `settle_player_tx` RPC (canonical ledger write)
- **Route B**: `POST /api/host/settlements/payment-confirm` calls `_writeLedgerEntry(SETTLEMENT_APPLIED)`

If a payment is created via `/settlements/payment` (creates a `settlement_payments` row as `pending`) and then confirmed via `payment-confirm`, it writes `SETTLEMENT_APPLIED`. If someone **also** calls `settle-player` for the same player/amount, **a second `SETTLEMENT_APPLIED` entry is written**.

Both paths use idempotency keys, but the keys are different:
- `settle-player`: uses `idempotencyKey` from request body as `settlement_id`
- `payment-confirm`: uses `'CONFIRM_PAY_'+paymentId` as idempotency key

There is **no guard preventing both routes from being called for the same debt**. This is the **highest-risk unresolved accounting issue**.

### 🟡 Risk #2 — `BET_GRADED_LOSS` has direction=`neutral` (does not debit balance)
From `grade_ticket_tx` RPC:
```sql
ELSIF p_grade_result='lost' THEN
  v_amount    := v_ticket.risk_amount;
  v_direction := 'neutral';  -- NOT 'debit'!
```
This is intentional: the risk was already debited at `BET_PLACED` (player's available balance was reduced by `openRisk`). When the bet loses, the money is already "gone" — the ledger just records the outcome.

**However**: `_deriveLedgerBalance()` ignores neutral rows. So after a loss:
- `BET_PLACED` debit: `-100` → balance decreases by 100 ✅
- `BET_GRADED_LOSS` neutral: `0` → balance unchanged ✅
- `openRisk` drops from `_pb_open_risk()` (ticket is now 'lost', not 'active') → available balance increases by 100

This means **a loss actually increases available balance by the stake amount back**, because it removes the open risk. The ledger path implicitly "collects" the loss by no longer including it in `openRisk`. This is correct but non-obvious and inconsistently understood by the ticket-scan paths, which explicitly subtract `settledLosses`.

### 🟡 Risk #3 — `BET_GRADED_WIN` credits `risk + profit` (full payout, not just profit)
From RPC:
```sql
IF p_grade_result='won' THEN
  v_amount    := ROUND(v_ticket.risk_amount + p_profit, 2);  -- full payout
  v_direction := 'credit';
```
Ledger path: place debits stake, win credits `stake + profit` → net gain = profit ✅  
Ticket-scan path: `settledGains = potential_profit` (profit only, not stake return)

This asymmetry means:
- **Ledger formula**: `start - openRisk + Σ(stake+profit for wins) - Σ(stake for placements) = start + net`
- **Ticket formula**: `start - openRisk - settledLosses + settledGains = start + net`

Both should produce the same `available` but via different arithmetic. If either formula has a rounding difference, they diverge. The reconciliation endpoint checks for `> 0.01` tolerance — but accumulated rounding across many bets could exceed this.

### 🟢 Note #4 — `WEEKLY_ROLLOVER` is safe (amount=0, direction=neutral)
No balance effect. Acts as a timestamped marker only. Excluded from reconciliation formula. ✅

### 🟢 Note #5 — `BALANCE_ADJUSTMENT` is always a credit
Used for: diamond purchases, payment void reversals. Always positive credit direction. Negative adjustments go through a separate admin path. ✅

---

## 6. Canceled/Push/Void Consistency Across Endpoints

| Status | player/dashboard | host/dashboard | settlements-preview | settle-player re-derive | weekly-rollover | close-week | reconciliation | settlement-reconciliation |
|---|---|---|---|---|---|---|---|---|
| `canceled` | ✅ excluded | ✅ excluded | ✅ excluded | ✅ excluded | ✅ excluded | ✅ excluded (implicit) | ✅ excluded | ✅ excluded |
| `voided` | ✅ excluded | ✅ excluded | ✅ excluded | ✅ excluded | ✅ excluded | ✅ excluded (implicit) | ✅ excluded | ✅ excluded |
| `deleted` | ✅ excluded | ✅ excluded | ⚠️ excluded | ⚠️ not checked | ⚠️ not checked | ⚠️ not checked | ⚠️ not checked | ⚠️ not checked |
| `push` | ✅ no net change | ✅ no net change | ✅ excluded | ✅ excluded | ✅ excluded | ⚠️ falls to closedCt (Bug #3, harmless) | ✅ excluded | ✅ excluded |
| `pushed` | ✅ no net change | — | ✅ excluded | ✅ excluded | ✅ excluded | — | ✅ excluded | ✅ excluded |

**`deleted` status**: present in `_BROWSER_TERMINAL_STATUSES` and some endpoints, but not consistently checked in weekly-rollover, close-week, or reconciliation. Low risk if `deleted` is never actually written to DB (no RPC writes `deleted`).

---

## 7. Permanent Ticket/Ledger Divergence Paths

### Path A — Browser mirror writes bypass RPCs
If `BROWSER_TICKET_MIRROR_WRITES_ENABLED=true`, the browser can write tickets directly to Supabase without going through any RPC, meaning:
- Ticket exists in DB
- No corresponding `BET_PLACED` ledger entry
- No balance debit
- Player can bet without losing balance

**Currently**: `BROWSER_TICKET_MIRROR_WRITES_ENABLED=false` in production. If ever enabled without RPC enforcement, divergence is guaranteed.

### Path B — RPC succeeds but JS-side balance gate already returned error
Not a real divergence path — if RPC is called, it writes the ledger atomically.

### Path C — Grade run writes ticket status without RPC (dry-run mode)
When `GRADING_SETTLEMENT_ENABLED=false` (current production), grading logs outcome but **does not call `grade_ticket_tx`**. Ticket status stays `active` forever. Canonical ledger never gets `BET_GRADED_WIN/LOSS/PUSH`. This is intentional containment but means the canonical ledger is permanently behind until grading is enabled.

### Path D — `settle-player` + `payment-confirm` double-write (Risk #1 above)
Both write `SETTLEMENT_APPLIED`. No guard prevents both being called for the same settlement debt.

### Path E — `BALANCE_ADJUSTMENT` with no corresponding ticket
Diamond top-up, void reversal — these credit the ledger with no matching ticket. The ticket-scan formula will undercount available balance relative to the ledger formula for players who have received adjustments. The reconciliation endpoint (`GET /api/host/reconciliation`) will flag this as a mismatch. It's legitimate divergence, not a bug.

---

## 8. Canonical Formula Recommendations

### Canonical available balance (should be used everywhere):
```
available = _pb_ledger_balance(club_id, player_id, starting) - _pb_open_risk(club_id, player_id)

where:
  _pb_ledger_balance = starting + Σ credits - Σ debits   (from canonical ledger table)
  _pb_open_risk      = Σ risk_amount WHERE status IN ('active','open')
```

### Settlement net owed (canonical):
```
grossOwed = max(0, -settledNet)    -- player owes if net < 0
grossOwed = max(0,  settledNet)    -- host owes if net > 0

where:
  settledNet = Σ potential_profit(won) - Σ risk_amount(lost)
               # canceled, voided, push, active/open: excluded

remaining = grossOwed - Σ confirmed settlement_payments.amount (same direction)
```

### Ledger-authoritative balance (for RPCs and reconciliation only):
```
ledger_balance = starting_limit
               + Σ amount WHERE direction='credit'
               - Σ amount WHERE direction='debit'
               # neutral rows (BET_GRADED_LOSS, WEEKLY_ROLLOVER) ignored
```

---

## 9. Risks Summary

| # | Risk | Severity | Resolved? |
|---|---|---|---|
| R1 | `settle-player` + `payment-confirm` both write `SETTLEMENT_APPLIED` for same debt | 🔴 HIGH | ❌ No |
| R2 | `BET_GRADED_LOSS` is `neutral` — implicit loss collection via openRisk drop | 🟡 MEDIUM | ✅ Intentional design, documented |
| R3 | `BET_GRADED_WIN` credits `stake+profit`; ticket-scan only credits `profit` — asymmetry | 🟡 MEDIUM | ✅ Both formulas net correctly; rounding risk on large volume |
| R4 | `HOST_ACTIVE_BETTOR_CHARGE` call to `_writeLedgerEntry` always throws/is silently swallowed | 🟡 MEDIUM | ❌ No — player canonical ledger never gets this entry |
| R5 | `player/dashboard` reads `club_members.balance_start` (legacy table) | 🟡 MEDIUM | ❌ No (Bug #4 equivalent, not fixed for this endpoint) |
| R6 | All ticket-scan balance paths ignore canonical ledger `BALANCE_ADJUSTMENT` credits | 🟡 MEDIUM | ❌ No — ticket-scan and ledger-scan will diverge for adjusted players |
| R7 | `deleted` ticket status not consistently excluded across all endpoints | 🟢 LOW | ❌ No (low risk: no RPC writes `deleted`) |
| R8 | Grading containment means canonical ledger permanently behind tickets | 🟢 LOW | ✅ Intentional, documented |

---

## 10. Tests Needed (Priority Order)

### Priority 1 — Double-settlement guard (Risk #1)
```
- settle-player then payment-confirm for same player/amount → second write blocked
- payment-confirm then settle-player for same player/amount → second write blocked
- idempotency key collision prevention between the two paths
- settle-player idempotent replay doesn't re-debit canonical ledger
```

### Priority 2 — Ledger formula correctness
```
- available_balance = ledger_path == ticket_path for win scenario
- available_balance = ledger_path == ticket_path for loss scenario
- available_balance = ledger_path == ticket_path for push scenario (refund of stake)
- available_balance = ledger_path == ticket_path for cancel scenario (refund)
- available_balance DIVERGES between paths when BALANCE_ADJUSTMENT exists (expected)
- BALANCE_ADJUSTMENT credit increases ledger-path balance but not ticket-path balance
```

### Priority 3 — Push/cancel ledger entries
```
- cancel writes BET_CANCELED_REFUND credit equal to original stake
- push writes BET_GRADED_PUSH credit equal to stake (full refund)
- push does NOT double-credit (only refunds stake, not stake+profit)
- canceled ticket excluded from available balance on ticket-scan path
- canceled ticket's BET_CANCELED_REFUND credit applied on ledger-scan path
```

### Priority 4 — Loss implicit collection
```
- after loss: ticket-scan available = start - stake
- after loss: ledger-scan available = start - stake (BET_PLACED debit; no BET_GRADED_LOSS credit/debit)
- openRisk correctly drops to 0 after loss (ticket status='lost' excluded from open risk)
- ledger formula: no double-debit for lost bets
```

### Priority 5 — BALANCE_ADJUSTMENT divergence (expected, should be documented)
```
- player with BALANCE_ADJUSTMENT: reconciliation endpoint shows mismatch (expected)
- mismatch reason should be identifiable from ledger event type
- adjustment amount + ticket-path result = ledger-path result
```

### Priority 6 — HOST_ACTIVE_BETTOR_CHARGE silent failure
```
- calling _writeLedgerEntry with eventType not in LEDGER_EVENT_TYPES throws
- HOST_ACTIVE_BETTOR_CHARGE is not in LEDGER_EVENT_TYPES
- the .catch() swallows the error silently
- host_diamond_ledger IS written correctly (separate path)
- player canonical ledger does NOT get HOST_ACTIVE_BETTOR_CHARGE (current behavior)
```

---

## 11. Highest-Risk Unresolved Accounting Issue

**Risk #1 — Double-settlement: `settle-player` RPC + `payment-confirm` can both write `SETTLEMENT_APPLIED` for the same debt.**

The system has two distinct settlement flows:
- **Flow A (settle-player)**: Direct settlement execution via `settle_player_tx` RPC. Writes `SETTLEMENT_APPLIED` immediately.
- **Flow B (payment lifecycle)**: Record payment via `/settlements/payment` → confirm via `/settlements/payment-confirm` which calls `_writeLedgerEntry(SETTLEMENT_APPLIED)`.

Both flows are valid and both write `SETTLEMENT_APPLIED` to the canonical `ledger` table. If a host uses Flow A for manual collection and Flow B for formal payment tracking, and the idempotency keys don't collide (they won't — different key formats), the canonical ledger will have **two `SETTLEMENT_APPLIED` entries for the same debt**.

The `reconciliation` endpoint uses `_deriveLedgerBalance()` which sums all credit/debit rows. Two `SETTLEMENT_APPLIED` entries for the same debt = the balance is counted twice = ledger shows player as having less balance than they actually do (for `player_owes_host` direction) or more (for `host_owes_player`).

**The fix**: A guard in both routes that checks for an existing `SETTLEMENT_APPLIED` ledger entry for the same `club_id + player_id + amount` within a tolerance window, or explicit documentation that only Flow B should be used (and Flow A deprecated).
