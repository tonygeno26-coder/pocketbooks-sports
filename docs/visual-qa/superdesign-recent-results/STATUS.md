# Superdesign — Recent Bets + Results Premium Pass

**Branch:** `cursor/superdesign-recent-results`  
**Base tip verified:** `2361bfa` (prior recent-bets premium tokens already on tip)  
**Scope:** Visual hierarchy + shared premium ticket language for Recent Bets and Results. Settlement OFF. Bet Slip untouched.

## Hierarchy (ticket)

STATUS+TYPE → selections → odds → Risk/To Win → Est. Win Chance → time → View Details (secondary)

## Visual rules

- Status as left accent strip + badge (no full-card tint)
- Compact parlay leg rows (`rb-leg--compact`, trailing odds)
- Shared `.rb-card` language on Results day tickets
- Micro motion 120–220ms; `prefers-reduced-motion` disables
- Preview/dev tools moved below ticket list so first bet sits near top at 390

## Preserved

- 12h Recent via `created_at`
- Results grouping by DATE PLACED (permanent)
- Est. Win Chance calc
- Grading / bankroll / idempotency / APIs / timestamps

## QA

Screenshots: `recent-{390,430,768,1280,1440}.png`, `results-{390,430,768,1280,1440}.png`  
Metrics: `qa-metrics.json` (hierarchy, first-bet top @390, compact parlay, EWC, overflow)

## Untouched

- Bet Slip (dkslip / bs-*)
- Financial / grading logic
- Settlement
