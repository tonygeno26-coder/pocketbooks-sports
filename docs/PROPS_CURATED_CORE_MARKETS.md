# Props — Curated Core Markets (Popular)

Popular is a **presentation allowlist**, not a backend inventory cut. Full game inventory remains available via category tabs, player expansion, alternate lines, All Props, and search.

## NFL / NCAAF

- Passing Yards
- Rushing Yards
- Receiving Yards
- Receptions
- Anytime TD
- First TD
- Passing TDs
- Rushing TDs
- Receiving TDs

## MLB

- Hits
- Total Bases
- Home Runs
- RBIs
- Strikeouts

## NBA / WNBA

- Points
- Rebounds
- Assists
- 3-Pointers Made

## Progressive disclosure (UX)

1. **Popular** — curated core markets only; ~25–50 immediately visible primary selections (not a backend cap).
2. **Player cards** — few high-value markets first; `MORE {PLAYER} PROPS (N)` expands the rest.
3. **Alternate lines** — collapsed `ALTERNATE LINES (N)`; rows hydrate only when opened (no synthesized odds).
4. **Category nav** — sport-specific tabs with inventory only; **Other removed**; power users use **All Props**.
5. **All Props** — category → player → market with progressive “show more players”.
6. **Search** — player + market name across **full game inventory**, grouped results.

Source of truth in code: `_PB_POPULAR_PROP_TYPES` in `player.html`.
