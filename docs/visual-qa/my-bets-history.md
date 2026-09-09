# My Bets / Bet History — Visual QA

Preview URLs (no production bets):

- Full fixture set: `player.html?preview=1&myBetsFixture=1` → open **My Bets** tab
- Empty state: `player.html?preview=1&myBetsFixture=empty` → open **My Bets** tab

## Checklist

| Scenario | Expect |
|----------|--------|
| Active single (MB-FIX-ACTIVE) | Blue left border, ACTIVE badge, exposure banner includes $25 |
| Won (MB-FIX-WON) | Green styling, result line explains cover, payout uses actualPayout |
| Lost (MB-FIX-LOST) | Red styling, $0 payout, not gray like void |
| Push (MB-FIX-PUSH) | Amber styling, stake refunded message, payout = risk |
| Void (MB-FIX-VOID) | Gray styling, void reason, distinct from lost |
| Parlay (MB-FIX-PARLAY) | 3 legs visible, expandable if >3 |
| Long parlay (MB-FIX-LONG-PARLAY) | "Show all 6 legs" expand control |
| Player prop (MB-FIX-PROP) | Player name pick, no team jersey required |
| Empty fixture | "No bets yet" |
| Search | Filter by "Celtics", "LeBron", "Parlay" |
| Status chips | Push / Void filters isolate those tickets |
| Sort | Newest / Oldest reorder cards |

## Pass criteria

Player can instantly read: bet identity, time, risk, odds, payout, status, and why won/lost/push/void.
