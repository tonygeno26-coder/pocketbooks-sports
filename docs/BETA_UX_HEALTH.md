# Beta UX Health — PocketBooks Sports

**Updated:** 2026-09-09 · Player dashboard workstream

| Surface | Grade | Notes |
|---|---|---|
| Player tokens / palette | **B+** | Canonical `#080D18` / `#1677FF` on board; slip green preserved |
| Player header / balance | **B** | Shimmer while dashboard hydrates; focus rings on chrome |
| My Bets dashboard | **B** | Dark cards, filter chips, empty/error states polished |
| Game list empty/loading | **B-** | `pb-loading` / `pb-empty` / retry on stall |
| Game cards | **B-** | Hierarchy pass on branch; selected-odds glow reduced |
| Bet slip | **C+** | Light sheet intentional; clarity pass on sibling branch |
| Props / search | **C** | Client filter not yet shipped |
| Host dashboard | **C** | Separate workstream |
| Mobile 390/430 | **B-** | Header + My Bets chips scroll; card grid tight |
| A11y basics | **B-** | Focus-visible on nav/pills/chips; reduced-motion honored |

## Remaining P1 (player dashboard scope)

1. **Ticket leg rows** — Still inline light-theme borders inside My Bets cards; migrate to `.mybet-leg` classes.
2. **Sport badge on tickets** — Light `#eef4ff` pill; remap to accent-soft dark chip.
3. **Cashed-out purple badges** — Replace `#7c3aed` with cyan/accent semantic.
4. **Loading skeletons** — Spinner-only today; optional skeleton rows for games list.
5. **Props client search** — Filter-only, separate branch.

## Out of scope

Settlement Option A accounting, prod migrations, betting/placement logic.
