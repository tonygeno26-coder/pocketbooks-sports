# BETA_UX_HEALTH — PocketBooks Sports

**Date:** 2026-09-09 (overnight, post-agent sync)

## Grades (honest)

| Dimension | Before | After | Notes |
|---|---|---|---|
| **Overall beta UX** | **C+** | **B** | Host/a11y/player/slip/cards/props/live/mobile advanced |
| Host operator dashboard | **B-** | **B+** | Responsive tables, empty/loading |
| Accessibility | **C+** | **B+** | Skip links, focus-visible, semantic nav |
| Player lobby / cards | **B-** | **B** | Game cards 2.0 |
| Bet slip | **B-** | **B+** | Risk/To Win + unified idempotency keys |
| Player dashboard / My Bets | **B-** | **B** | Premium pass |
| Props discovery | **C+** | **B** | Search fix + empty states |
| Live | **B-** | **B** | Score fallback + chrome |
| Mobile 390/430 | **B-** | **B** | Overflow + safe-area |
| Empty/loading/error | **C+** | **B** | Shared `.pb-*` chrome |
| Images/logos | **B** | **B** | Text fallbacks |
| Settlement clarity | **D+** | **B+** | Record Settlement / Ledger / disclaimer |
| Financial safety UX | **C** | **A-** | Recording-only; flag OFF; no prod touch |

## P0 remaining

1. Owner C settlement opening decisions before any staging migrate
2. Do **not** enable `SETTLEMENT_RECORDING_ENABLED` until bootstrap signed
3. Visual QA sign-off at true 390px on device before merging UX stack to `main`

## P1 remaining

1. Merge conflict plan across UX branches vs `main` vs `settlement-option-a`
2. Phase P `/settlements/payment*` route rename
3. Host `?preview=1` top-level QA bypass
4. Full keyboard pass on host modals
5. localStorage place-bet fallback dedupe (offline path only)
6. Screenshot regression pack consistency

## Safety checklist

| Check | Status |
|---|---|
| Production financial data touched | **NO** |
| Production settlement migration | **NOT APPLIED** |
| Settlement recording enabled | **NO** |
| `.env` committed | **NO** |
| Branches merged to main | **NO** |
| Stashes preserved | **YES** (13) |
