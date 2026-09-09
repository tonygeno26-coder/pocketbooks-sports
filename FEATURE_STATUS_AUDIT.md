# FEATURE_STATUS_AUDIT — PocketBooks Sports (overnight)

**Date:** 2026-09-09  
**Scope:** Feature readiness for beta. Settlement recording remains **OFF** / schema **not** applied to prod.

| Area | Branch | Tip (approx) | Status | Notes |
|---|---|---|---|---|
| Settlement Option A (recording) | `cursor/settlement-option-a` | FE `19adf36` / BE `ef78f89` | Ready for owner review | Terminology + UX polish; flag OFF; **no prod migrate** |
| Design system / visual QA | `cursor/design-system` | `465c346` | Updated overnight | Breakpoints / canvas / preview auth |
| Player dashboard | `cursor/ux-player-dashboard` | `177b878` | Overnight premium pass | |
| Game cards | `cursor/ux-game-cards` | `f5aca68` | Prior polish | |
| Bet slip | `cursor/ux-bet-slip` | `24f161b` | Overnight 2.0 + busy guard | |
| Props | `cursor/ux-props` | prior | Prior polish | |
| Live | `cursor/ux-live` | prior | Prior polish | |
| Host | `cursor/ux-host` | `df0776c` | Responsive tables / states | |
| A11y | `cursor/ux-a11y` | `2978c9c` | Focus / reduced-motion | Target B+ |
| Mobile | `cursor/ux-mobile` | prior | 390–1440 | |
| Empty/loading/error | `cursor/ux-states` | prior | | |
| Image/logo fallbacks | tip on main lineage | `a278194` | Text-only fallbacks | |

## Explicitly NOT done / blocked

- Production settlement schema apply
- Settlement recording enable (`SETTLEMENT_RECORDING_ENABLED`)
- Merge settlement financial code to `main`
- Mobbin references (paid/unavailable — skipped)

## Safe merge candidates (non-financial UX)

Owner review still required. UX-only branches that do not enable settlement recording:

- `cursor/design-system`, `cursor/ux-a11y`, `cursor/ux-states`, `cursor/ux-mobile`
- `cursor/ux-game-cards`, `cursor/ux-bet-slip`, `cursor/ux-props`, `cursor/ux-live`, `cursor/ux-host`, `cursor/ux-player-dashboard` — after conflict review vs main

## Needs owner review

1. Owner C opening-balance decisions (settlement bootstrap)
2. When to apply `PROPOSED_settlement_records.sql` + RPC on staging
3. When to set `SETTLEMENT_RECORDING_ENABLED=true` (post-bootstrap only)
4. Phase P `/settlements/payment*` API path rename (table already `settlement_records` on Option A BE)
