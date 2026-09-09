# FEATURE_STATUS_AUDIT — PocketBooks Sports

**Date:** 2026-09-09 (overnight)  
**Scope:** Beta feature readiness. No production settlement migration or financial enablement.

| Area | Branch | Status | Notes |
|---|---|---|---|
| Host UX (overview/players/bets) | `cursor/ux-host` @ `df0776c` | **Shipped overnight** | Responsive tables, pb-empty/loading chrome, section notes; Settlements tab untouched |
| Accessibility | `cursor/ux-a11y` @ `151f570` | **Shipped overnight** | Host skip-link, focus rings, semantic nav; player landmarks |
| Empty/loading/error (player) | `cursor/ux-states` | Prior + player polish | `.pb-empty` / `.pb-loading` on player board |
| Mobile breakpoints | `cursor/ux-mobile` | Prior | 390–1440 layout pass |
| Game cards | `cursor/ux-game-cards` | In flight (parallel) | Hierarchy + token alignment |
| Bet slip | `cursor/ux-bet-slip` | In flight (parallel) | Stake/payout clarity |
| Settlement Option A (recording) | `cursor/settlement-option-a` | Owner review | Flag OFF; no prod migrate |
| Design system docs | `cursor/design-system` | Docs present | Token reference |
| Image/logo fallbacks | `cursor/image-audit-text-fallback` | On main lineage | Text-only fallbacks |

## Explicitly NOT done / blocked

- Production settlement schema apply
- `SETTLEMENT_RECORDING_ENABLED=true`
- Merge settlement financial code to `main`
- Mobbin references (paid plan unavailable)

## Safe merge candidates (non-financial UX)

Owner review still required:

- `cursor/ux-host`, `cursor/ux-a11y`, `cursor/ux-states`, `cursor/ux-mobile`
- `cursor/design-system` (docs only)
- Player UX branches after visual QA vs `main`

## Needs owner review

1. Settlement opening-balance bootstrap (Owner C)
2. Staging migrate for settlement records schema
3. Cross-branch merge order (host/a11y vs main vs settlement-option-a)
4. Full visual QA pack at 390 / 768 / 1280 / 1440
