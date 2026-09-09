# BET_DOUBLE_CLICK_AUDIT

**Date:** 2026-09-09  
**Scope:** Place-bet double-submit / idempotency (read-only audit; no money-math changes)

## Verdict: **not a P0 accounting hole** (FE + BE guarded)

### Backend
- `POST /api/bets/place` uses `requireIdempotency({ required: true })`
- Placement goes through `place_bet_tx` money RPC after middleware

### Frontend (`player.html`)
- Money POSTs auto-inject `Idempotency-Key`
- Per-action key store reuses in-flight key for same endpoint (double-click protection)
- Bet slip overnight tip adds confirm busy guard (`24f161b`)

### Residual P1 (UX)
- Keep busy/disabled visuals consistent across all slip variants

### Out of scope overnight
- No changes to `place_bet_tx` arithmetic
- No production financial writes
