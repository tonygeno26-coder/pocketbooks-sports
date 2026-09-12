# Sportsbook board + logo presence gate

**Branch:** `cursor/sportsbook-board-logo-gate`  
**Base:** `main` @ `852479c`  
**Source visual intent:** `cursor/superdesign-sportsbook-board` @ `6ea1274` (ported, not merged as-is)

## Why 6ea1274 was SAFE MERGE: NO

Documented blocker (STATUS on that branch): **hold for owner / visual QA** — not a financial or settlement defect.

Additional technical reason it stayed unsafe to merge as-is: branch tip was **stale vs main** (auth/lobby/odds UX/host commits landed after `43689c5`), and `player.html` **conflicts on direct merge**. Content itself was presentation-scoped (CSS + markup classes for board hierarchy).

## This candidate

- Fresh branch from current FE main
- Ported sportsbook board hierarchy CSS + safe presentation classes (`mc-meta` / `market-card--live` / O-U line color classes)
- Preserved all newer production fixes on main
- Logo presence: larger board containers, 2× CDN fetch, CSS-fill imgs, restrained optical scale + dark-card edge separation
- DEV-ONLY gallery: `docs/visual-qa/logo-presence-gallery.html` (not in production nav)

## Untouched

- Betting / grading / bankroll / settlement
- Odds math / parlay correlation
- API contracts / global nav IA
- Bet Slip and Recent Bets / Results ticket logic

## Safe merge

**Owner visual review required before merge.** Do not merge without owner approval.
