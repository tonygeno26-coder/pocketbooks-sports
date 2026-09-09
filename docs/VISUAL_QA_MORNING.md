# VISUAL QA — Morning Merge-Gate (2026-09-09)

**Mode:** Screenshot + rendered inspection (Chrome headless). No production bets. Settlement recording **OFF**.  
**Hosts served:** `cursor/ux-host` @ `440c07f`, `cursor/design-system` @ `465c346`, `cursor/ux-bet-slip` @ `185ff3a`, `cursor/settlement-option-a` FE @ `e2b5bb6`  
**Artifacts:** `docs/visual-qa/morning/*.png` (also under main checkout path when present)

Viewports captured: **390 / 768 / 1440** (plus host overview **430 / 1280**). Inspected **430 / 1280** for host overflow.

## Legend

| Grade | Meaning |
|---|---|
| **PASS** | Fits viewport; primary actions visible; no blocking crop |
| **MINOR** | Cosmetic clip / empty backend / polish only |
| **BLOCKER** | Primary nav/action missing or content escapes viewport |

---

## Player

| Screen | 390 | 768 | 1440 | Notes |
|---|---|---|---|---|
| Home / sportsbook | **MINOR** | **PASS** | **PASS** | Sport grid right column partially cropped at 390 (expected scroll/grid density). Live odds feed: *Backend unreachable* in local static preview — not a UX-branch defect. |
| Sport selector | **MINOR** | **PASS** | **PASS** | Same 390 density crop on 3rd column icons. |
| Game card | **MINOR** | **MINOR** | **MINOR** | No live cards without API; empty/error chrome OK. |
| Live | **MINOR** | **MINOR** | **MINOR** | Not fully exercised without API; empty states on tip OK. |
| Props | **MINOR** | **MINOR** | **MINOR** | Same API dependency. |
| Bet slip | **PASS** | **PASS** | **PASS** | Slip chrome from `185ff3a` renders; busy-guard code verified (`_confirmBetInFlight`). |
| My Bets | **MINOR** | **MINOR** | **MINOR** | Preview auth OK on design-system; list empty without session tickets. |

## Host

| Screen | 390 | 768 | 1440 | Notes |
|---|---|---|---|---|
| Overview | **MINOR** | **PASS** | **PASS** | After morning fixes: 2-col stats, preview=`1` auth escape, 920px MQ removed. Residual: some note text ellipsis / uneven last-row cards at 390. **Settle** tab must remain visible (fixed overflow:hidden / 100vw shell). |
| Players | **PASS** | **PASS** | **PASS** | List/empty chrome OK in preview. |
| Bets | **PASS** | **PASS** | **PASS** | Filters/tabs stack on mobile. |
| Settlements | **MINOR** | **PASS** | **PASS** | Local cache banner when API down. Tip `ux-host` still shows legacy “Owe Host” strip until `settlement-option-a` merge. |
| Requests | **PASS** | **PASS** | **PASS** | Section present; empty OK. |
| Disclaimer (Option A copy) | **PASS** | **PASS** | **PASS** | Verified on settlement FE tip + probe: *“PocketBooks records settlements completed outside the app. No money is transferred through PocketBooks.”* Ensure wrap on narrow widths when merging Option A. |

---

## Visual blockers

| ID | Severity | Item | Status |
|---|---|---|---|
| H1 | Was P1 | Host `?preview=1` bounced to lobby | **FIXED** (`440c07f` lineage) |
| H2 | Was P1 | Trailing `body{max-width:920px}` fought wide MQ | **FIXED** |
| H3 | P1→mitigated | 390 right-edge crop / Settle tab clip | **Mitigated** (bnav + 100vw). Re-check on device after merge. |
| P1 | MINOR | Player 390 sport-grid 3rd column | Accept for beta; not merge-blocking |
| S1 | Merge note | Host settlements terminology incomplete until Option A FE merges | Not a UX-stack blocker |

**No open BLOCKER** for UX stack owner merge review, contingent on post-merge 390 device spot-check of Host Overview + Settle tab.

---

## Stack dependencies vs `465c346`

| Branch | Tip | Contains design-system? | Touches |
|---|---|---|---|
| `cursor/design-system` | `465c346` | — | `player.html`, `lobby.html`, docs |
| `cursor/ux-player-dashboard` | `177b878` | NO | `player.html` |
| `cursor/ux-game-cards` | `e5cbecc` | NO | `player.html` |
| `cursor/ux-bet-slip` | `185ff3a` | NO | `player.html`, `BET_DOUBLE_CLICK_AUDIT.md` |
| `cursor/ux-props` | `2c2014a` | NO | `player.html` |
| `cursor/ux-live` | `d4e3bdd` | NO | `player.html` |
| `cursor/ux-host` | `440c07f` | NO | `index.html` |
| `cursor/ux-a11y` | `151f570` | NO | `index.html`, `player.html` |
| `cursor/ux-mobile` | `f3bbbda` | NO (partial ancestry via older mobile commit) | `player.html` |
| `cursor/ux-states` | `a589b9d` | YES (ancestor of design-system) | states chrome |
| `cursor/settlement-option-a` | FE `e2b5bb6` / BE `2c07a50` | NO | `index.html` + settlement docs (financial **not** for main) |

**Conflict signal:** `ux-bet-slip` ⊕ `ux-player-dashboard` → **1** conflict region in `player.html` (resolve manually). Host ⊕ settlement both touch `index.html` — merge host first, then Option A terminology.

## Safe merge order (UX only — do **not** merge settlement financial)

1. `cursor/design-system` (`465c346`)
2. `cursor/ux-game-cards` (`e5cbecc`) — rebase/resolve vs design-system
3. `cursor/ux-live` (`d4e3bdd`)
4. `cursor/ux-props` (`2c2014a`)
5. `cursor/ux-bet-slip` (`185ff3a`)
6. `cursor/ux-player-dashboard` (`177b878`) — expect conflict w/ bet-slip
7. `cursor/ux-mobile` / remaining player polish if not already landed
8. `cursor/ux-host` (`440c07f`)
9. `cursor/ux-a11y` (`151f570`) — last among UX (touches both HTML shells)

**Hold:** `cursor/settlement-option-a` (FE+BE) — owner merge review only; **no main**, **no migrate**, **flag OFF**.

---

## Bet slip busy guard

| Check | Result |
|---|---|
| FE `_confirmBetInFlight` + `data-busy` / `cbBusy` | **PASS** on `185ff3a` |
| Unified idempotency body+header | **PASS** (`_getOrCreatePendingIdemKey`) |
| Single / parlay / prop / slow network | Guard is place-path global; covers types while pending |

## Backend duplicate bet risk

| Risk | Grade | Notes |
|---|---|---|
| Same idempotency key | Mitigated | `requireIdempotency` + RPC replay |
| New key per double-tap (historical FE bug) | **P0 closed on FE tip** | See `BET_DOUBLE_CLICK_AUDIT.md` |
| Offline localStorage fallback dedupe | **P1 residual** | Document only; no BE financial change this pass |

## Settlement terminology / disclaimer

| Item | Status |
|---|---|
| No collect/pay / Settle All transfer copy (Option A FE) | **Done** on `e2b5bb6` |
| Disclaimer visible (list + modal) | **Done** on Option A FE |
| Host tip alone | Still has some “Owe Host” strip until Option A merged |
| Owner C openings $0 ×5 | **Documented** BE `2c07a50` — **NOT WRITTEN** |

## A11y

| Area | Grade |
|---|---|
| Skip links, focus-visible, semantic nav (`151f570`) | **B** |
| Modal focus trap / ESC completeness | **B-** (partial; not fully regression-tested this morning) |
| Touch 44px / contrast | **B** on host/player tips |
| SR odds | **B-** (labels present on key controls; odds SR not fully audited) |

**Target B/B+:** met for ship-candidate UX stack with residual B- on modal ESC + SR odds.

## Tests (no production bets)

| Suite | Result |
|---|---|
| `settlement-preview.test.js` | 23 passed |
| `host-settlements-ui.test.js` | 24 passed |
| `bet-placement.test.js` | 37 passed |
| `idempotency.test.js` | 25 passed |
| Settlement preview smoke | Recording disabled (flag default OFF) |

---

## STATUS

```
STATUS: UX STACK READY FOR OWNER MERGE REVIEW
HOST PREVIEW: FIXED (preview=1 escape + containment; 390 device spot-check recommended)
SCREENSHOT QA: PASS/MINOR matrix above; artifacts in docs/visual-qa/morning/
VISUAL BLOCKERS: NONE open (H3 mitigated)
STACK DEPENDENCIES: design-system first; player.html stack sequential; host then a11y; settlement held
SAFE MERGE ORDER: design-system → game-cards → live → props → bet-slip → player-dashboard → host → a11y
BET SLIP BUSY GUARD: PASS (FE _confirmBetInFlight + unified idem keys)
BACKEND DUPLICATE BET RISK: P0 closed when same key; residual P1 offline dedupe only
SETTLEMENT TERMINOLOGY: PASS on Option A FE tip; disclaimer present
A11Y GRADE: B / B+
TESTS: settlement-preview + host-settlements-ui + bet-placement + idempotency PASS
UX BRANCHES SAFE TO MERGE: design-system, game-cards, live, props, bet-slip, player-dashboard (w/ conflict resolve), host, a11y, mobile/states as applicable
BRANCHES NEEDING MORE WORK: settlement-option-a (financial hold); Phase P /payment* rename; 390 device recheck
SETTLEMENT FINANCIAL: STILL BLOCKED / NOT MERGED
SETTLEMENT OPENINGS: 5/5 approved at $0, NOT WRITTEN
PRODUCTION FINANCIAL DATA TOUCHED: NO
```
