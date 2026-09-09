# FEATURE_STATUS_AUDIT — PocketBooks Sports

**Date:** 2026-09-09 (overnight, post-agent sync)  
**Scope:** Beta feature readiness. No production settlement migration or financial enablement.

| Area | Branch | Tip | Status | Notes |
|---|---|---|---|---|
| Settlement Option A | `cursor/settlement-option-a` | FE `a2cee75` / BE `ef78f89` | Owner review | Recording terminology + UX; flag OFF; no prod migrate |
| Design system / visual QA | `cursor/design-system` | `465c346` | Shipped overnight | Base was `867ff4e`; canvas/breakpoints/preview auth |
| Player dashboard | `cursor/ux-player-dashboard` | `177b878` | Shipped overnight | My Bets, states, mobile |
| Game cards | `cursor/ux-game-cards` | `e5cbecc` | Shipped overnight | Density, odds, live badges |
| Bet slip | `cursor/ux-bet-slip` | `185ff3a` | Shipped overnight | Clarity + busy guard + unified idempotency keys |
| Host | `cursor/ux-host` | `df0776c` | Shipped overnight | Responsive tables; Settlements tab untouched |
| Accessibility | `cursor/ux-a11y` | `151f570` | Shipped overnight | Skip-link, focus rings, semantic nav (~B+) |
| Props | `cursor/ux-props` | `2c2014a` | Shipped overnight | Empty states; search script fix |
| Live | `cursor/ux-live` | `d4e3bdd` | Shipped overnight | Score fallback; live chrome |
| Mobile | `cursor/ux-mobile` | `f3bbbda` | Shipped overnight | 390/430 overflow fixes |
| Empty/loading/error | `cursor/ux-states` | `a589b9d` | Prior | `.pb-*` chrome |
| Overnight status docs | `cursor/overnight-status` | (this branch) | Docs | |
| Image/logo fallbacks | main lineage | `a278194` | Prior | Text-only fallbacks |

## Explicitly NOT done / blocked

- Production settlement schema apply
- `SETTLEMENT_RECORDING_ENABLED=true`
- Merge settlement financial code to `main`
- Mobbin (paid/unavailable)

## Safe merge candidates (non-financial UX)

Owner review still required. Conflict-check vs `main` first:

- `cursor/design-system`, `cursor/ux-a11y`, `cursor/ux-states`, `cursor/ux-mobile`
- `cursor/ux-host`, `cursor/ux-game-cards`, `cursor/ux-bet-slip`, `cursor/ux-player-dashboard`, `cursor/ux-props`, `cursor/ux-live`

**Not** safe to merge without owner: settlement financial/schema enablement.

## Needs owner review

1. Settlement opening-balance bootstrap (Owner C)
2. Staging migrate for `settlement_records` schema
3. Cross-branch merge order
4. True 390px device visual QA (DevTools min ~485px)
