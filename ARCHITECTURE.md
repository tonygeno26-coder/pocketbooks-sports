# PocketBooks Sports — System Architecture

## Stack

```
UI Layer
  ↓
Validation Gates (placement, conflict, sport-access, teaser, future-game)
  ↓
Canonical Ticket Model (_makeSelection, canonicalGameKey, immutable snapshot)
  ↓
Grading Engine (_gradeTicket, _findGameForSelection, _gradeSingleLeg)
  ↓
Ledger / Balance Engine (calcAvailableBalance, addLedgerEntry)
  ↓
Host Settlement Engine (refreshHostDashboardStats, _calcWeekForPlayer)
  ↓
Audit Logs ([live grading audit], [balance derivation audit], [player sport access gate], etc.)
```

---

## Non-Negotiable Rules

### 1. No Silent Mutations
- Every balance change has a reason string in the ledger.
- Every ticket state change is timestamped (`gradedAt`, `_revertedAt`, `canceledAt`).
- Every grading action emits `[live grading audit]` to console.

### 2. No Fuzzy Grading
- Match by `canonicalGameKey` first.
- TLA pair + date gate second (single candidate only).
- Substring fallback: only for legacy tickets with no `commenceTime`, single candidate.
- Ambiguous = refuse. Wrong date = refuse. Future = refuse.
- **If confidence is not exact → skip grading.**

### 3. All Gates Enforced at Execution Boundary
UI blocking is never sufficient. Every gate is re-checked at `confirmBet()`:
| Gate | Where enforced |
|---|---|
| Future game | `_canGradeTicket()` at daemon + confirm |
| Placement (started/final) | `_checkPlacementGate()` at slip add + confirm |
| Conflict (opposing sides) | `_checkBetConflict()` at slip add + confirm |
| Sport access | `_checkPlayerSportAccess()` at tab click + slip add + confirm |
| Teaser sport | `checkTeaserGate()` at `setSType()` + confirm |

### 4. Derived Balance Only
```
available = starting
          - openRisk       (active tickets)
          - settledLosses  (lost tickets)
          + settledGains   (won tickets)
```
Never write `pb-balance-start` to adjust for outcomes. Flip `ticket.status` only.
Push and cancel: risk freed automatically via `openRisk` exclusion.

### 5. Idempotency
- `gradedAt` field is the guard: if set, never re-grade.
- `revertFutureGrades()` checks `_revertedAt` before reverting.
- `reconcileInvalidGrades()` checks `refuseReason` before re-reverting.
- Ledger entries have unique IDs (`GTA-<ticketId>-<timestamp>`).

### 6. Immutable Grading Snapshot
Once a ticket is graded, `ticket.grading` is written once and never overwritten:
```js
ticket.grading = {
  result, finalScore, finalScoreText, payout,
  balanceBefore, balanceAfter, gradedAt,
  matchedGameId, matchedCanonicalKey, matchedGameDate,
  matchedTeams, matchedStatus, gradingMethod
}
```

### 7. Atomic Financial Writes
```
localStorage.setItem('pb-tickets', ...)   ← ticket state
localStorage.setItem('pb-ledger', ...)    ← ledger entry
localStorage.setItem('hostActiveBets', ...) ← host mirror
```
All three must succeed or none should be trusted. On any error, `revertFutureGrades()` / `reconcileInvalidGrades()` restore state.

---

## Required for Every Feature

```
ROOT CAUSE:      Exact file/function/line, mechanism, why it was wrong.

FLOW VERIFICATION:
  STEP 1: action → state change → expected → ✅/❌
  STEP 2: ...

ACCEPTANCE TESTS:
  node tests/lifecycle.test.js    18/18 ✅
  node tests/run.js               23/23 ✅
  node tests/<feature>.test.js    N/N   ✅

CONSOLE PROOF:
  [exact log line]  key=value  ✅

DEPLOY SHA:
  GitHub main:  <sha>  ✅
  Local:        <sha>  ✅
  build.json:   <sha>  ✅
  Vercel live:  <sha>  ✅/❌
```

---

## Financial Correctness Priority

When forced to choose:
1. Ticket integrity (immutable fields, correct status)
2. Grading correctness (exact match, gates respected)
3. Balance correctness (derived model, no manual patches)
4. Settlement correctness (host stats accurate, atomic writes)
5. UI polish (animations, layout)

---

## Test Suite

Run before every deploy:
```bash
npm run verify
# Runs all test files:
#   tests/lifecycle.test.js      (18 tests — 11 lifecycle rules)
#   tests/run.js                 (23 tests — balance/identity/results/stake)
#   tests/conflict.test.js       (14 tests — opposing-side prevention)
#   tests/placement-gate.test.js (17 tests — started/final game blocking)
#   tests/teaser-gate.test.js    (14 tests — sport-gated teasers)
#   tests/sport-access.test.js   (15 tests — host sport access limits)
#   tests/grading-audit.test.js  (18 tests — full grading pipeline)
#   Total: 119 tests
```

**No new feature ships if any test fails.**

---

## Canonical Data Sources

| Data | Source | Notes |
|---|---|---|
| Player tickets | `localStorage['pb-tickets']` | Authoritative |
| Host mirror | `localStorage['hostActiveBets']` | Derived, updated on grade/cancel |
| Ledger | `localStorage['pb-ledger']` | Append-only |
| Player limits | `localStorage['pb-player-limits'][playerId]` | Set by host |
| Starting balance | `localStorage['pb-balance-start']` | Set on join, never patched |
| Scores (grading) | SportsDataIO via `/api/sportsdataio` | Never Odds API |

---

## Audit Entry Points (console)

| Function | Purpose |
|---|---|
| `gradeTodaysActiveTickets()` | Grade all active tickets, full audit log |
| `grade()` | Alias for above |
| `revertFutureGrades()` | Revert invalid future-dated grades |
| `reconcileInvalidGrades()` | Revert historical grades with date/future mismatch |
| `resetTicketStateForFreshTesting()` | Wipe tickets/ledger, preserve profile/club |
| `refreshHostDashboardStats('manual')` | Recalculate all host KPIs |
| `window._checkBuildVersion()` | Check if Vercel is serving latest SHA |
