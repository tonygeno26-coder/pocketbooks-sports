# BETA_UX_HEALTH — PocketBooks Sports

**Date:** 2026-09-09 (overnight run)  
**Method:** Inferred BEFORE from pre-overnight beta (main + open UX branches); AFTER from shipped commits on `cursor/ux-host` and `cursor/ux-a11y`.

## Grades (honest)

| Dimension | Before | After | Notes |
|---|---|---|---|
| **Overall beta UX** | **C+** | **B-** | Host + a11y land; player branches still merging |
| Host operator dashboard | **B-** | **B+** | Responsive bets/players tables, empty/loading cards, section notes |
| Accessibility | **C+** | **B+** | Skip links, focus-visible, semantic nav, player main landmark; not full WCAG audit |
| Player lobby / cards | **B-** | **B-** | Parallel `cursor/ux-game-cards` work |
| Bet slip | **B-** | **B-** | Parallel `cursor/ux-bet-slip` work |
| Mobile 390/430 | **B-** | **B** | Host tablet filters + prior mobile branch |
| Empty/loading/error | **C+** | **B** | Host `_hostStateHtml` + player `.pb-*` chrome |
| Images/logos | **B** | **B** | Text fallbacks on main lineage |
| Settlement clarity (UX copy) | **D+** | **B** | Recording terminology on settlement-option-a branch (not merged) |
| Financial safety UX | **C** | **A-** | Recording-only language; flag OFF; no prod touch |

**Letter key:** A = production-ready polish · B = beta-ready with known gaps · C = usable but rough · D = confusing or risky

## P0 remaining

1. Owner C settlement opening decisions before any staging migrate
2. Do **not** enable `SETTLEMENT_RECORDING_ENABLED` until bootstrap signed
3. Visual QA sign-off on host + player at 390px before merging UX stack to `main`
4. Confirm place-bet idempotency / double-click (audit doc if BE gap — no silent money-math changes)

## P1 remaining

1. Merge conflict plan: `cursor/ux-host` + `cursor/ux-a11y` vs `main` vs `cursor/settlement-option-a`
2. Settlement History UI wired to `/api/host/settlement-records` with graceful 503
3. Rename Phase P routes `/settlements/payment*` → recording terminology
4. Host Settlements tab visual-only polish when settlement-option-a merges (avoid arithmetic drift)
5. Full keyboard pass on modals (approve player, limits, diamonds)
6. Screenshot regression pack (design-system breakpoints)

## Safety checklist (overnight)

| Check | Status |
|---|---|
| Production financial data touched | **NO** |
| Production settlement migration | **NOT APPLIED** |
| Settlement recording enabled | **NO** |
| `.env` committed | **NO** |
| Branches merged to main | **NO** |
