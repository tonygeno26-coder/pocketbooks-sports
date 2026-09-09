# Player UX Audit — PocketBooks Sports

**Date:** 2026-09-08  
**Surfaces:** `player.html` (player sportsbook), host `index.html` (operator)  
**Brand target:** bg `#080D18`, cards `#101A2E`, borders `#1D2B42`, accent `#1677FF`, white/muted slate, green/red semantic  
**Research:** Mobbin MCP requires paid plan (unavailable this session). Superdesign CLI deferred — critique against existing host palette + sportsbook patterns instead of blind redesign.

---

## KEEP

| Area | Why |
|---|---|
| Floating team logos / photo→logo→O/U→Draw→text hierarchy | Strong product identity; already wired with text fallbacks |
| Live score strip + LIVE badge + bases diamond | Clear live hierarchy when data exists |
| Props expand/collapse + team pills + category sections | Caesars-like structure already present |
| Bet slip light sheet + green Place Bet | Intentional contrast vs dark board; preserves place clarity |
| Host owe-you green / owe-players red | Operator semantic must not flip |
| Image audit text-only fallbacks | Avoids broken-image chrome |
| Club-scoped settlement FE (branch `6cfe713`) | Financial safety — do not overwrite |

---

## IMPROVE (priority)

### P0
1. **Token drift** — Early `:root` still neon black/`#00ff87`; redesign block uses `#070b12` / `#3d8bfd` instead of canonical `#080D18` / `#1677FF`. Align tokens (presentation only).
2. **Selected odds glow** — Excess blue/white glow competes with LIVE and Place Bet. Prefer 1.5px accent border + soft fill, no multi-layer glow.
3. **Empty games state** — Inline gray text only; needs polished empty card + retry affordance styling (no logic change).
4. **Focus / touch** — Ensure 44px targets on pills, odds, slip controls; visible `:focus-visible` rings.

### P1
5. **Game card hierarchy** — Emphasize LIVE → teams → score → odds → secondary (props/alt). Tighten spacing; reduce card hover lift on mobile.
6. **Bet slip clarity** — Stake/payout row contrast; Place Bet obvious without flooding board with blue; preserve O/U/Draw identity.
7. **Props O/U readability** — Stronger Over/Under label contrast; denser but scannable rows; optional client search/filter.
8. **Host dashboard density** — Operator feel: clearer section headers, less glow on tabs, preserve settlement colors.
9. **Mobile overflow** — 390/430: team names ellipsis, odds not crushed, sticky header/slip safe-area.

### P2
10. Micro-interactions (pressed scale 0.97, reduced-motion respect).
11. Loading skeletons vs endless spinners.
12. Design-token doc + incremental cleanup of duplicate CSS blocks.

---

## REMOVE / DE-EMPHASIZE

| Item | Action |
|---|---|
| Neon `#00ff87` as primary board accent | Remap board chrome to `#1677FF`; keep slip Place Bet green |
| Multi-layer selected-odds white+green glow | Soften to accent border |
| Sport-tab double glow rings | Single accent ring |
| Giant card hover translate on touch devices | Desktop-only or reduce |
| Blue everywhere (filters, badges, CTAs) | Accent sparingly; semantic green/red for money |

---

## ADD

| Item | Priority | Notes |
|---|---|---|
| `docs/PLAYER_UX_AUDIT.md` | P0 | This file |
| Canonical `:root` PocketBooks tokens on player | P0 | Match host |
| Props client-side search input | P1 | Filter existing rows only — no coverage/dedup changes |
| Polished `.pb-empty` / `.pb-loading` / `.pb-error` | P1 | States task |
| `docs/DESIGN_SYSTEM.md` | P1 | Tokens, type, spacing, image rules |
| `docs/BETA_UX_HEALTH.md` | P2 | A–F grades + backlog |
| `@media (prefers-reduced-motion: reduce)` | P1 | A11y |

---

## Out of scope (do not touch)

- Betting construction / placement / odds math  
- Grading, eligibility, settlement accounting, Diamonds  
- Merging `cursor/settlement-partial-carry`  
- Production financial data  

---

## Implementation plan (this queue)

| Task | Branch | Scope |
|---|---|---|
| 2 Player dashboard | `cursor/ux-player-dashboard` | Audit + token align + chrome polish |
| 3 Game cards | `cursor/ux-game-cards` | Hierarchy / LIVE / selected / spacing |
| 4 Bet slip | `cursor/ux-bet-slip` | Slip clarity only |
| 5 Props | `cursor/ux-props` | Search/filter + O/U readability |
| 6 Live | `cursor/ux-live` | Live visual states |
| 7 Host | `cursor/ux-host` | Host chrome only |
| 8 Mobile | `cursor/ux-mobile` | Breakpoints |
| 9 States | `cursor/ux-states` | Empty/loading/error |
| 10 A11y | `cursor/ux-a11y` | Focus / reduced-motion |
| 11 Design system | `cursor/design-system` | `DESIGN_SYSTEM.md` + token doc |
| 12 Health report | (design-system or docs) | `BETA_UX_HEALTH.md` |
