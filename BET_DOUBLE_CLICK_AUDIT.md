# BET_DOUBLE_CLICK_AUDIT

**Priority:** P0 residual closed on FE (no money-math changes)  
**Date:** 2026-09-09  
**Branch:** `cursor/ux-bet-slip`  
**Scope:** Place-bet double-submit / idempotency

## Executive summary

Backend idempotency is **strong when the same key is reused**. Frontend now has:
1. `_confirmBetInFlight` busy guard
2. **Unified body + header idempotency keys** via `_getOrCreatePendingIdemKey('/api/bets/place')`
3. Fixed `_pbFetch` money-endpoint match to use **pathname** (was broken against absolute URLs after `_absApiUrl`)

## Backend (strong per-key)

| Layer | Behavior |
|---|---|
| `POST /api/bets/place` | `requireIdempotency({ required: true })` |
| `place_bet_tx` RPC | Idempotent replay on same key |
| Verdict | Same key → one debit. Different keys → separate bets. |

## Frontend (this follow-up)

| Gap | Status |
|---|---|
| Race before busy | Fixed — `_confirmBetInFlight` |
| Body key regenerated per call | **Fixed** — reuses pending key for in-flight place |
| Header vs body split | **Fixed** — same `_iKey` passed in header + body |
| `_pbFetch` absolute-URL miss | **Fixed** — `_MONEY_ENDPOINTS.has(path)` |
| Odds-accept intentional new key | Header/body aligned with `_oa` suffix |
| localStorage fallback dedupe | Residual P1 (offline path only) |

## Out of scope

No `place_bet_tx`, settlement, or prod writes. No merge to main.
