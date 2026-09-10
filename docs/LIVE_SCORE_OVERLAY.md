# Live Score Overlay — Soccer / Tennis (P1)

**Branch:** `cursor/post-a11y-gate`  
**Sources:** `scripts/owls-live-scores.js` + helpers from `cursor/live-soccer-tennis` (not full `away-sports-live`)

## Behavior

- Numeric scores render **only** when `_scoreMatchSafe` / `scoreSource === 'owls_scores_live'` (`_pbHasSafeNumericScore`)
- Uncertain identity → keep card + LIVE / state context (`mc-live-score--context-only`); **suppress numeric score**
- Scoreboard markup uses `aria-hidden="true"` so live ticks do not spam the `pb-a11y-live` region
- Hydration: `/api/markets/live` + `/api/odds/live?sport=` → `OwlsLiveScores.indexOwlsLiveScores` → `hydrateGamesWithOwlsScores`

## Unresolved identity cases (documented — score suppressed)

| Case | Outcome |
|---|---|
| Ambiguous same-window candidates (multiple plausible matches) | No safe match; context-only LIVE |
| Fuzzy / substring-similar club names | Rejected by matcher |
| Missing eventId + weak name keys | Unmatched live; no numeric score |
| Swapped home/away without remappable keys | Unmatched unless orientation remap succeeds |
| Non-soccer/tennis sports | Hydrate skipped (existing card score paths unchanged) |

## Tests

`node tests/live-soccer-tennis.test.js` — exact/reorder/swap/tennis variants/ambiguity/hydrate stamp + player.html wiring.
