# Pre-beta trust stack — integration lineage

**Branch:** `cursor/pre-beta-trust-stack`  
**Date:** 2026-09-09  
**Owner merge:** leave as integration branch (do not merge to `main` without owner sign-off)

## Included commits (dependency order)

| Order | Branch | Tip SHA | Role |
|------:|--------|---------|------|
| 1 | `cursor/p0-phantom-ledger` | `46bb6d5` | Fail-closed place/cancel — no phantom localStorage ledger/tickets/bankroll |
| 2 | `cursor/trust-boundary-audit` | `0e845ed` | Trust audit doc + Check Results → server grade; Host Risk Console (`fe320a4`) |
| 3 | `cursor/nav-persistence` | `0e46e60` | UI-only nav persistence (URL + sessionStorage); no financial LS authority |

**Base for this branch:** `origin/cursor/nav-persistence` @ `0e46e60` (already contains p0 @ `46bb6d5`).

**Reconcile method:** `git merge origin/cursor/trust-boundary-audit` onto nav tip. Conflicts resolved carefully:

- `player.html` — kept `_pbNavAfterGamesPaint()` (nav) + trust empty/error state UI; preserved p0 phantom gates and trust `checkOpenTickets` → `runServerGrade`
- `package.json` — union of verify scripts (nav + phantom + host-risk-console + mobile-390)
- `index.html` — trust Host Risk Console 390px rules (`hrc-owe-grid`)
- `tests/phantom-ledger-fallback.test.js` — kept p0 suite + trust Check Results assertion

## Additional hardening on this branch (P0.5)

Dashboard `/api/player/dashboard` failure no longer falls back to localStorage / `$1000` / `calcAvailableBalance()` as current bankroll.

- Non-2xx (401/403/404/409/429/500/502), timeout/offline, malformed JSON, missing balance → display `—`, refresh control, placement blocked
- Regression: `tests/dashboard-balance-failclosed.test.js`

## Explicitly NOT included

- Settlement financial / recording enablement
- Cancel isolation SQL apply
- Production financial data mutations
- Boxing / NASCAR enable (feeds NO DATA / PARTIAL — deferred)
- Soccer/tennis overlay polish (`cursor/live-soccer-tennis` remains separate)

## Backend constraints (verified read-only)

- `SETTLEMENT_RECORDING_ENABLED` requires exact `'true'`; unset/default = **OFF**
- Cancel isolation SQL: **NOT APPLIED**
