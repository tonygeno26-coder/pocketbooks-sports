# Superdesign — Sportsbook Board Enhancement

**Branch:** `cursor/superdesign-sportsbook-board`  
**Base:** `main` @ `6ae492f` (Player Dashboard `--pb-*` tokens)  
**Scope:** Sportsbook market cards, market rows, odds buttons, mobile sport rail. No betting logic / auth / settlement / grading changes.

## Critic findings → resolution

| # | Finding | Status |
|---|---------|--------|
| 1 | Market cards charcoal `#1e1e1e` | Fixed → `var(--pb-card)` / `var(--pb-border)` at source + cascade lock |
| 2 | Odds default charcoal | Fixed → `var(--pb-odds-recess)` |
| 3 | Odds selected neon `#00ff88` | Fixed → `var(--pb-accent)` + soft blue glow |
| 4 | Positive odds neon text-shadow | Fixed → `var(--pb-win)`, `text-shadow:none` |
| 5 | Mobile sport rail too tall | Fixed → horizontal compact rail ≤767px |

## Hierarchy

- **Line** (`.odds-line`): larger / heavier / white — primary
- **Price** (`.odds-num`): smaller / secondary; ML-only cells keep larger price via `:not(:has(.odds-line))`
- Logos: transparent, unboxed, drop-shadow only

## Before / after metrics (fixture card + live rail)

| Width | Sport rail H before | Sport rail H after | Notes |
|------:|--------------------:|-------------------:|-------|
| 390 | ~461px | ~69px | Game Lines much higher |
| 768 | ~331px | ~331px | 6-col grid retained |
| 1440 | ~359px | ~359px | Dense desktop grid retained |

Screenshots: `before-{390,768,1440}.png`, `after-{390,768,1440}.png`

## SAFE MERGE

**NO** — hold for visual QA on device / preview before merging to `main`.

## Untouched (intentional)

- `--pb-*` token values
- Bottom-nav IA
- Recent 12h / My Bets
- Win/loss polarity semantics
- Bet-slip sheet greens (`--pb-slip-*`)
- Betting / odds / financial / grading / auth logic
