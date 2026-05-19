# Phase C — Server-Authoritative Grading

## Architecture

```
Before (Phase A/B):
  Browser → _autoGradePoll() → score API → grade → localStorage

After (Phase C):
  Browser → runServerGrade() → POST /api/grade/run
                ↓ Supabase reads active tickets
                ↓ Score API fetches completed games
                ↓ 4-priority match engine
                ↓ Grade result written to Supabase (tickets + ledger + audit_events)
                ↓ Response returned to browser
  Browser ← result → _initDbPrimaryRead() → betTickets hydrated from DB
                    → syncBalanceDisplays() → renderMyBets()
```

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/grade/run` | Grade all active tickets for player/club |
| `GET /api/grade/status` | Last graded at, active count, recent results |

## POST /api/grade/run

**Request:**
```json
{ "daysBack": 3, "playerId": "P001", "clubId": "C001" }
```

**Response:**
```json
{
  "ok": true,
  "checked": 5,
  "graded": 2,
  "skipped": 3,
  "errors": [],
  "results": [
    {
      "ticketId": "T_001",
      "statusBefore": "active",
      "statusAfter": "won",
      "result": "won",
      "matchMethod": "canonical_game_key",
      "payoutDelta": 90.91,
      "ledgerEntryId": "SG_won_T_001_2026-05-18T21:00:00Z",
      "auditEventId": 42,
      "reason": null
    }
  ]
}
```

## Grading Rules

1. Skip if `ticket.graded_at` is already set (idempotency)
2. Skip if any leg's `scheduled_start` is in the future
3. Match game by priority:
   - P1: `provider_game_id` exact match
   - P2: `canonical_game_key` exact match
   - P3: normalized `home_team`+`away_team`+date
   - P4: TLA matchup string (legacy, single candidate only)
4. Skip if match is ambiguous (>1 candidate at any priority)
5. Skip if matched game is not Final
6. Grade: won/lost/push per market (ML/RL/Total)
7. Write ticket update via `.eq('status','active')` guard (prevents double-grade race)
8. Write ledger entry (idempotency: `SG_{result}_{ticketId}_{gradedAt}`)
9. Write audit_event

## Idempotency

- Ticket update: `.eq('status','active')` guard — if ticket was already graded, update affects 0 rows
- Ledger: `upsert(onConflict:'id')` — same id = no duplicate
- Run twice: `checked:5, graded:0` — all skipped as `already_graded`

## Browser Integration

```js
// Grade via server (preferred)
runServerGrade()
// → POST /api/grade/run
// → if graded > 0: hydrate betTickets from DB
// → syncBalanceDisplays() + renderMyBets()

// Check status
checkServerGradeStatus()
// → GET /api/grade/status

// Browser fallback (dev mode only)
grade()  // or gradeTodaysActiveTickets()
```

## Dev Badges (when DB primary reads enabled)

- `🗄️ DB | db:X local:X` — ticket source
- `🧠 server-grade` or `🧠 browser-fallback` — grading source

## Rollback

If server grading causes issues:
1. `disableDbPrimaryReadsForSession()` — browser reads localStorage
2. `grade()` — browser grading still available
3. Server grade results remain in Supabase — no data loss

## Phase C Acceptance Checklist

- [ ] `POST /api/grade/run` returns correct result for winning single
- [ ] `POST /api/grade/run` returns correct result for losing single
- [ ] Push ticket returns `result: push`, `payoutDelta: 0`
- [ ] Parlay all-win → `result: won`
- [ ] Parlay one-loss → `result: lost`
- [ ] Future game → `skipped`, `reason: future_game_not_gradeable`
- [ ] In-progress game → `skipped`, `reason: game_not_final`
- [ ] Ambiguous doubleheader → `skipped`, `reason: ambiguous_match_refused`
- [ ] Run twice: second run shows `graded:0` (idempotency)
- [ ] Ledger entry written exactly once per ticket per grade
- [ ] audit_events table has entry for each grade
- [ ] `runServerGrade()` in browser hydrates My Bets from DB
- [ ] Balance unchanged by hydration (derived from ledger, not overwritten)
