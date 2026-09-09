# BET_DOUBLE_CLICK_AUDIT

**Priority:** P0 (documentation only — no money-math changes)  
**Date:** 2026-09-09  
**Branch:** `cursor/ux-bet-slip`  
**Scope:** Place-bet double-submit / idempotency (read-only audit)

## Executive summary

Backend idempotency is **strong when the same key is reused**. Frontend had a **race window** before this pass: `confirmBet()` could be invoked twice before the confirm button entered busy state. A **FE busy guard** (`_confirmBetInFlight`) is now in place. Residual BE risk remains on the **localStorage fallback path** and from **body vs header key divergence** — fix those in a follow-up; do not change `place_bet_tx` without approval.

## Backend (strong per-key)

| Layer | Behavior |
|---|---|
| `POST /api/bets/place` | Requires idempotency middleware / key |
| `place_bet_tx` RPC | Checks ledger for existing `idempotency_key` + `BET_PLACED`; idempotent replay |
| `idempotency_keys` table | Pending / completed / replay (see `tests/idempotency.test.js`) |

**Verdict:** Same key + same body → one debit. Different keys → separate bets.

## Frontend gaps (audit)

1. **Missing in-flight guard (fixed):** `confirmBet()` ran sync gates before `_cbBtnBusy()`. Fixed with `_confirmBetInFlight`.
2. **Body key regenerated per call:** `BET_<pid>_<timestamp>` — double-click across seconds → two keys → two bets.
3. **Header vs body split:** `_pbFetch` reuses `Idempotency-Key`; body uses separate `idempotencyKey`.
4. **localStorage fallback:** No dedupe on offline/failed DB path.
5. **Legacy `#place-btn`:** Basic disable only.

## Actions this branch

- [x] `_confirmBetInFlight` on confirm, click handler, place-bet delegation, `bsPlaceBet`
- [x] Slip UX: Risk / To Win summary (footer + confirm)
- [ ] Unify body + header keys (P1, needs approval)
- [ ] Idempotent localStorage fallback (P1, needs approval)

## Out of scope

No `place_bet_tx`, settlement, or prod writes. No merge to main.
