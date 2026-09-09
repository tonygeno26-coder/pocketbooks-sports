# FEATURE_STATUS_AUDIT — PocketBooks Sports (beta polish)

**Date:** 2026-09-09  
**Branch:** `cursor/away-beta-polish`  
**Scope:** Feature readiness for beta. Settlement recording remains **OFF** / schema **not** applied to prod.

## Working / in beta

| Area | Status | Notes |
|---|---|---|
| Player sportsbook / odds | READY | Core beta path |
| Bet slip + confirm (with BE) | READY | Busy/idempotency guards present |
| My Bets | READY | |
| Live tab | READY | |
| Results | READY | |
| Host Risk Console | READY | |
| Host Players / Bets / Settle UI | READY | Recording flag OFF |
| Diamonds purchase modal | READY | Shared `diamonds.js` |
| Auth resilience / retry caps | READY | Max 3, backoff, no 401 spiral |
| Build SHA / version guard | READY | Settings About + host header |
| Beta onboarding tips | READY | Lightweight checklist |
| Report a Problem | READY | Clipboard payload; no token capture |

## BROKEN / DEAD / NOT IMPLEMENTED — hidden from beta

| Feature | Status | Beta action |
|---|---|---|
| Prediction markets (`#predictions-section`) | NOT IMPLEMENTED | Hidden; `setBNav('predictions')` remaps to sportsbook |
| Global Search tab toast | NOT IMPLEMENTED | Remapped; no coming-soon toast |
| Markets modal `props` / `specials` tabs | NOT IMPLEMENTED | No-op (tabs not in DOM) |
| Lobby unknown `showSection(...)` | NOT IMPLEMENTED | Silent/debug; no toast spam |
| Crypto bottom-nav tab | REMOVED | Diamonds flow only |
| Settlement recording writes | OFF / BLOCKED | UI ledger visible; `SETTLEMENT_RECORDING_ENABLED` must stay false |
| Cancel SQL / prod settle migrate | BLOCKED | Do not apply |

## Explicitly NOT done / blocked

- Production settlement schema apply
- Settlement recording enable (`SETTLEMENT_RECORDING_ENABLED`)
- Merge settlement financial code to `main` without owner sign-off
- Backend feedback inbox (`POST /api/beta/feedback`) — spec only

## Needs owner review

1. Owner C opening-balance decisions (settlement bootstrap)
2. When to apply settlement SQL + RPC on staging
3. When to set `SETTLEMENT_RECORDING_ENABLED=true` (post-bootstrap only)
4. Whether to build a real beta feedback endpoint
