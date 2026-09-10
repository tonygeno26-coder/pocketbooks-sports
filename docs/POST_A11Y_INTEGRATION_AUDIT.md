# Post-A11Y Integration Conflict Audit

**Base tip verified:** `62b598c` (`cursor/away-a11y-perf`) includes `02b4267`  
**Working branch:** `cursor/post-a11y-gate`  
**Date:** 2026-09-09

## Contaminated / do-not-merge-blindly

| Ref | Issue |
|---|---|
| `efa7ed7` | Fail-closed balance on `away-player-ux` / `away-host-ops` / `away-sports-live` / financial stacks — mixes trust/balance into UX/live trees |
| `cursor/away-player-ux` @ `d787dc5` | Contains `efa7ed7` + settlement UI lineage + nav — cherry-pick UX only |
| `cursor/away-host-ops` @ `1849363` | Same contamination; host Players/Bets UX sits atop settlement Option A docs/UI |
| `cursor/away-sports-live` @ `c498ff0` | Live overlay + catalog safety **and** contaminated ancestors — extract live/catalog files only (done on this branch from cleaner `cursor/live-soccer-tennis` + selective catalog filters) |
| `cursor/host-preview-responsive` / `empty-states` / `nav-persistence` | Carry settlement terminology / Host Risk Console / Option A UI — park settlement OFF |

## Conflict matrix vs `62b598c` (player.html hotspots)

| Parked branch | Tip | vs a11y | Duplicate / overwrite risks |
|---|---|---|---|
| `cursor/design-system` | `465c346` | Diverged @ `a278194` | **No `pb-a11y.js` / PbA11y** — overwrites a11y hooks; adds `_pbHideBrokenImg` competing with `_pbCollapseImgToText`; +5 `@media` breakpoints; **drops deferHeavy** |
| `cursor/ux-player-dashboard` | `177b878` | Diverged | No PbA11y; no defer; empty/loading chrome helpers collide with later empty-states |
| `cursor/props-discovery-2` | `5b1103b` | Diverged | **Competing prop rendering** (`_pbApplyPropsDiscoveryFilter`, player grouping) — **no defer hydrate**; will clobber `_pbRenderInlinePropsHtml` / deferred templates |
| `cursor/ux-bet-slip` | `185ff3a` | Diverged | Slip clarity + idempotency; touches selection/`selected` classes — rebase onto a11y `aria-pressed` / PbA11y announce |
| `cursor/host-preview-responsive` | `365cc2e` | Diverged | Mostly `index.html` breakpoints; light `player.html`; settlement docs |
| `cursor/empty-states` | `9d23516` | Diverged | `_pbStateHtml` / empty helpers — overlaps design-system empty chrome |
| `cursor/nav-persistence` | `0e46e60` | Diverged | Nav sessionStorage — conflicts with sport-tab a11y `aria-selected`; no PbA11y |
| `cursor/live-soccer-tennis` | cleaner live | Diverged | Live helpers only — **safe extract** (used here) |

### Specific conflict classes

1. **Duplicate selectors / breakpoints** — design-system & dashboard add mobile-first `@media` (17→22). Merge CSS tokens once; do not stack conflicting 390/768 rules.
2. **Overwritten a11y hooks** — any parked UX branch from pre-`02b4267` lacks `PbA11y.activate` / live region / keyboard odds. Always land UX *onto* a11y tip, never reverse.
3. **Competing prop rendering** — props-discovery-2 vs defer templates. Discovery filter must call `_pbRerenderPropsPanel` / keep `_pbPropsCache` + defer path.
4. **Duplicated image-error handlers** — `_pbHideBrokenImg` (design-system) vs `_pbCollapseImgToText` / `_pbPropHeadshotError` (a11y tip). Keep collapse-to-text; delete hide-only if it leaves empty controls.
5. **Live score** — port from `live-soccer-tennis` / `owls-live-scores.js`; avoid whole `away-sports-live` merge.

## Safe integration order

1. **Keep / merge `62b598c` (a11y+defer+images)** first — foundation.
2. **Live overlay + catalog safety** (this branch) — soccer/tennis deterministic scores; NASCAR outright filter; boxing badge zero — display-only.
3. **`cursor/ux-bet-slip`** — rebase; preserve PbA11y announce + `aria-pressed` / cellId identity.
4. **`cursor/nav-persistence`** — rebase; keep sport-tab ARIA.
5. **`cursor/empty-states`** then **`cursor/ux-player-dashboard`** — empty chrome after nav.
6. **`cursor/design-system`** tokens/CSS — last visual layer; re-wire any lost `pb-a11y.js` script tag; unify image onerror to `_pbCollapseImgToText`; reconcile breakpoints.
7. **`cursor/props-discovery-2`** — last props feature; **must re-apply defer ≥100** + hydrate + resync after discovery filter.
8. **Host responsive / host-ops** — only after settlement stays OFF; strip Option A / ledger UI from those merges or leave parked.
9. **Never blind-merge** `efa7ed7` trees for UX; cherry-pick file-level.

## Settlement / financial

Settlement recording **OFF**. No cancel SQL apply. No prod financial mutations on this branch.
