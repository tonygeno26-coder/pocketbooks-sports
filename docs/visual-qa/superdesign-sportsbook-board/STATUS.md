# Superdesign — Sportsbook board

**Branch:** `cursor/superdesign-sportsbook-board`  
**Base:** `43689c5` (Recent Bets merged to main first)  
**Scope:** Sportsbook board, game cards, sport rail, odds controls. No betting, grading, slip, or Recent Bets logic changes.

## Visual QA (browser, not a production fixture)

In-browser review of the real renderer at 390 / 430 / 768 / 1440:

- First card sits under a compact sport rail and underline market tabs.
- Header is league + time; LIVE is a badge plus a left accent, not a tinted card.
- Odds stay recessed; selected is accent fill with no glow.
- Over/Under color is the line only. Missing markets stay `—`.
- 1440 uses a two-column grid (cards ~620px, not stretched).
- No horizontal overflow at 390.

Screenshot files were not written in this environment. A local stale-build banner appeared because the working stamp (`eb0ddc9`) does not match production; it is not part of this visual pass.

## Safe merge

**NO** — hold for owner review. Do not merge this branch to main.
