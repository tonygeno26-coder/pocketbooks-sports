# Client Trust Boundary Audit

**Date:** 2026-09-09  
**FE repo:** `pocketbooks-sports`  
**BE verification (read-only):** `~/.openclaw/workspace/pocketbooks-sports-backend`  
**Branch:** `cursor/pre-beta-trust-stack` (includes trust-boundary-audit + p0 + nav + P0.5)  
**Scope:** Frontend assumptions where the browser may act more authoritatively than the server for money, identity, or settlement.  
**Constraint honored:** No production accounting API redesign. Settlement recording remains gated OFF (`SETTLEMENT_RECORDING_ENABLED` must stay false until owner bootstrap sign-off). No production financial data mutations from this work.

---

## Classification key

| Class | Meaning |
|-------|---------|
| **SERVER VERIFIED** | Server recomputes / enforces; client value is input or cache only |
| **CLIENT-ONLY BUT HARMLESS** | Browser-local convenience; cannot change authoritative money if DB-primary path is used |
| **RISK** | Browser can invent, mutate, or display financial authority incorrectly |

Any case where **financial authority depends only on the browser** is **P0**.

---

## Executive summary

The largest P0 was **localStorage phantom ledger / ticket success after failed place or cancel** while `_DB_PRIMARY_READS_ENABLED` is true. That path invented tickets, `pb-ledger` rows, and success UX without a server-accepted money RPC.

**Safe FE hardening applied on this branch:**

1. DB-primary place: network/timeout/uncertain failures **return** — no localStorage success fall-through; abort reconciles `/api/player/dashboard` instead of auto-retrying money POST.
2. Explicit `phantom_ledger_fallback_blocked` gate before any legacy local place write.
3. DB-primary cancel: no fall-through to local “delete request sent” / fake success; fail closed + optional dashboard reconcile.
4. “Check Results” under DB-primary calls `runServerGrade` instead of browser `_gradeTicket` + local ledger mutation.
5. Regression suite: `tests/phantom-ledger-fallback.test.js`.

Backend spot-check (read-only): `/api/bets/place` recalculates payout from odds snapshots (`serverProfit` / `serverPayout`); `oddsAccepted` does **not** bypass snapshot validation. Client `potentialProfit` is only a fallback if snapshot recalc did not produce a server value — still a residual BE concern (document only; owner approval needed to change accounting RPCs).

---

## P0 findings

### P0-1 — Phantom local place/cancel success (was active; **hardened**)

| Field | Detail |
|-------|--------|
| **Where** | `player.html` → `confirmBet()`, `submitDeleteRequest()` |
| **Client values** | stake, ticket status, ledger rows, displayed bankroll |
| **Class before** | **RISK** — financial authority in browser |
| **Class after fix** | **SERVER VERIFIED** for DB-primary; legacy local path only when `_DB_PRIMARY_READS_ENABLED === false` |
| **Evidence** | Prior path toasted “saved locally, syncing when back online” and wrote `pb-tickets` + `addLedgerEntry` after `/api/bets/place` failure/timeout. Cancel fell through to local `deleteRequestStatus` success UX. |
| **Fix** | Fail-closed + reconcile; see Safe fixes. |
| **Owner note** | Do not re-enable offline phantom placement without an explicit product decision. |

### P0-2 — Client auto-grade mutating tickets + `pb-ledger` via “Check Results”

| Field | Detail |
|-------|--------|
| **Where** | `player.html` → `checkOpenTickets()` → `_gradeTicket` / `addLedgerEntry` / `saveTickets` |
| **Client values** | ticket status, potentialProfit-derived display payout, local ledger, derived balance |
| **Class before** | **RISK** when DB-primary (browser grades money state) |
| **Class after fix** | **SERVER VERIFIED** when DB-primary (delegates to `runServerGrade` → `/api/grade/run` + dashboard hydrate) |
| **Residual** | Legacy local grader remains if DB-primary flag is off (dev/offline). Preview `simulateGradeResults` still local — gated to `?preview=1` / `?testmode=1` (**CLIENT-ONLY BUT HARMLESS** in prod if query absent). |

### P0-3 — Settlement recording enablement

| Field | Detail |
|-------|--------|
| **Where** | BE `SETTLEMENT_RECORDING_ENABLED`; FE `openSettlePlayerModal` → `POST /api/host/record-settlement` |
| **Client values** | amount, direction, clubId, playerId, week |
| **Class** | **SERVER VERIFIED** when enabled (RPC + over-settlement block); **RISK** if flag flipped without bootstrap |
| **Status** | Recording must stay **OFF**. Client max-amount UX is advisory; server enforces `over_settlement_blocked`. |
| **Owner approval needed** | Any change to settlement RPCs / enablement. |

---

## P1 findings

### P1-1 — Dashboard failure falls back to `calcAvailableBalance()` from `pb-tickets` / `pb-balance-start` (**fixed on pre-beta trust stack**)

| Field | Detail |
|-------|--------|
| **Where** | `loadPlayerDashboardFromDb` / `syncBalanceDisplays` / `_liveAvailableBalance` |
| **Class before** | **RISK** (display authority) |
| **Class after fix** | **SERVER VERIFIED** display under DB-primary — fail-closed |
| **Fix** | Non-2xx / timeout / offline / malformed JSON / missing balance → paint `—`, show refresh, never `$1000` / `pb-balance-start` / client-derived bankroll. Placement blocked until authoritative balance loads. |


### P1-2 — Host overview / settlements local stores

| Field | Detail |
|-------|--------|
| **Where** | `index.html`: `hostActiveBets`, `pb-tickets`, `pb-settlements`, `pb-settlement-carryover`, `runWeeklySettlement`, stats from local bets |
| **Class** | **RISK** for display/ops if treated as money truth; host DB-primary paths prefer `/api/host/dashboard` |
| **Mitigation present** | Unverified local bankrolls stripped without `balanceSource` from dashboard (`tests/host-player-balance-display.test.js`). |
| **Owner note** | Do not revive client-only weekly close as production settlement. |

### P1-3 — Client still sends `stake` / `payout` / `potentialProfit` / leg odds on place

| Field | Detail |
|-------|--------|
| **Where** | FE payload; BE `/api/bets/place` |
| **Class** | **SERVER VERIFIED** for odds/payout when snapshot recalc succeeds; stake checked against server balance/RPC |
| **Residual RISK** | If `serverProfit` is null, BE still falls back to client `potentialProfit` / `payout` in RPC args. Changing `place_bet_tx` call sites needs **owner approval**. |

### P1-4 — Player/club IDs from localStorage vs JWT

| Field | Detail |
|-------|--------|
| **Where** | Place uses token `actorId`/`clubId` with localStorage fallback; cancel still prefers `pb-player` / `pb-club` |
| **Class** | **SERVER VERIFIED** for authz (scoped permissions); **RISK** for UX misfires / wrong club display |
| **Notes** | Club mismatch on place clears stale club and aborts. Cancel should eventually prefer token IDs the same way (display/routing hardening). |

### P1-5 — Host diamond / crypto admin local ledgers

| Field | Detail |
|-------|--------|
| **Where** | `index.html` `_getDiamondLedger` / `pb-diamond-ledger`, `pb-crypto-purchases`; `diamonds.js` purchase intents hit API |
| **Class** | **RISK** if local diamond ledger is treated as spendable authority; purchase flow itself posts to backend |
| **Owner note** | Diamond accounting APIs not redesigned here. |

### P1-6 — Role / permission chrome from `pb-actor-role` / `pb-host`

| Field | Detail |
|-------|--------|
| **Where** | Boot redirects in `index.html` / `lobby.html` / `player.html` |
| **Class** | **CLIENT-ONLY BUT HARMLESS** for routing chrome; money routes still require signed token + BE `requirePermissionScoped` |
| **RISK** | Spoofed local role can show host UI; cannot authorize money RPCs without valid host token (assuming `DEV_AUTH_BYPASS` off in prod — ops concern, see older `TRUST_HARDENING_CHECKLIST.md`). |

---

## Inventory by trust topic

### Stake

| Path | Class | Notes |
|------|-------|-------|
| Slip stake → `/api/bets/place` body | SERVER VERIFIED | RPC balance + risk limits |
| Client insufficient-funds gate via `_liveAvailableBalance` | CLIENT-ONLY BUT HARMLESS | UX only; server rechecks |
| Phantom local stake debit on failed place | RISK → fixed | P0-1 |

### Odds / payout / potentialProfit

| Path | Class | Notes |
|------|-------|-------|
| Slip odds → legs | Input | Snapshot recalc authoritative on BE |
| Client payout display | CLIENT-ONLY BUT HARMLESS | Display |
| Stored `potentialProfit` on tickets for local balance formula | RISK if used as money truth | Prefer server dashboard |
| BE `p_potential_profit` fallback to client | Residual RISK | Owner approval to hard-fail when snapshot missing |

### Player ID / club ID

| Path | Class | Notes |
|------|-------|-------|
| JWT actor/club on place | SERVER VERIFIED | |
| `pb-player` / `pb-club` for dashboard query | SERVER VERIFIED + RISK of stale filter | Server scopes by membership |
| `pb-active-club` | CLIENT-ONLY BUT HARMLESS | Selection cache |

### Bankroll / balance

| Path | Class | Notes |
|------|-------|-------|
| `/api/player/dashboard` → `applyDisplayedBalance` + `_balanceFromServer` | SERVER VERIFIED | |
| `calcAvailableBalance` from `pb-tickets` + `pb-balance-start` | RISK as fallback display | P1-1 |
| Host `_resolveHostPlayerBalance` + strip without `balanceSource` | SERVER VERIFIED preference | |

### Ticket status

| Path | Class | Notes |
|------|-------|-------|
| Place/cancel success from API | SERVER VERIFIED | |
| Local grade / simulate / revertFutureGrades | RISK unless gated | P0-2 + preview gates |
| Cache write of tickets after server ok | CLIENT-ONLY BUT HARMLESS | Mirror |

### Settlement amount

| Path | Class | Notes |
|------|-------|-------|
| Modal amount + client max | Advisory | |
| `record-settlement` RPC | SERVER VERIFIED when enabled | Flag OFF |
| `pb-settlements` / carryover local | RISK if used as ledger | Legacy |

### Permissions

| Path | Class | Notes |
|------|-------|-------|
| Bearer token + BE scoped permission | SERVER VERIFIED | |
| `pb-actor-role` UI routing | CLIENT-ONLY BUT HARMLESS | |

---

## localStorage keys (financial-adjacent)

| Key | Intended use | Trust class |
|-----|--------------|-------------|
| `pb-tickets` | Ticket cache / legacy derive | Cache; RISK if authority |
| `pb-ledger` | Client mirror / debug | **Not** canonical ledger; RISK if treated as money |
| `hostActiveBets` | Host UI cache | RISK if authority |
| `pb-balance-start` / `pb-balance-start:*` | Starting bankroll seed | RISK as display authority |
| `pb-settlements` / `pb-settlement-*` | Legacy weekly settlement UI | RISK |
| `pb-diamond-ledger` / `pb-diamonds` | Local diamond UX | RISK if spendable |
| `pb-player` / `pb-club` / `pb-active-club` | Identity / club selection | Cache |
| `pb-sports-token` / `pb-session-token` | Auth | Credential; server verifies |
| `pb-actor-role` | Routing chrome | Harmless alone |

Canonical money remains Supabase `ledger` / money RPCs (`place_bet_tx`, `cancel_bet_tx`, `grade_ticket_tx`, settlement Option A RPC) — see `LEDGER_INVARIANT_AUDIT.md`.

---

## Safe fixes applied (this branch)

| Fix | Type | Accounting API changed? |
|-----|------|-------------------------|
| Block localStorage place success when DB-primary | FE fail-closed | No |
| Place timeout: reconcile dashboard, no auto-retry money POST | FE | No |
| Cancel fail-closed under DB-primary | FE | No |
| Check Results → `runServerGrade` under DB-primary | FE display/grade routing | No |
| `tests/phantom-ledger-fallback.test.js` | Regression | No |

**Not changed (needs owner approval):** BE `place_bet_tx` profit fallback, settlement enablement, diamond ledger schema, production financial mutations.

---

## Verification commands

```bash
node tests/phantom-ledger-fallback.test.js
node tests/player-dashboard.test.js
node tests/live-refresh-infrastructure.test.js
node tests/host-player-balance-display.test.js
```

---

## Return checklist

- **STATUS:** CLIENT TRUST BOUNDARY AUDIT  
- **PRODUCTION FINANCIAL DATA TOUCHED:** NO  
- **SETTLEMENT RECORDING:** remains OFF (do not set `SETTLEMENT_RECORDING_ENABLED=true` without bootstrap sign-off)  
- **MAIN MERGE:** not performed  
