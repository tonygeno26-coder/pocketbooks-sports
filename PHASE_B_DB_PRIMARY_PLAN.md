# Phase B — DB as Primary Source of Truth

> Status: PLANNED (not activated). localStorage remains source of truth during Phase A.
> Activate only after Phase A mirror has been validated for ≥1 week with zero sync gaps.

---

## What Changes in Phase B

| | Phase A (current) | Phase B |
|---|---|---|
| Ticket writes | localStorage + mirror | DB first, localStorage as cache |
| Ticket reads | localStorage | DB via `/api/tickets` |
| Balance derivation | `calcAvailableBalance()` from localStorage tickets | `GET /api/balance` → `SUM(ledger_entries.amount)` |
| Ledger | localStorage + mirror | DB only (ledger_entries is authoritative) |
| Grading | Client-side daemon | Server-side cron, client reads result |

---

## How Reads Switch from localStorage to DB

### Step 1 — Add read endpoints (no client change yet)
```
GET /api/tickets?playerId=&clubId=&status=
GET /api/tickets/:id
GET /api/ledger?playerId=&clubId=&limit=
GET /api/balance?playerId=&clubId=
```

### Step 2 — Dual-read validation (1 week)
Client calls both localStorage and DB, compares results, logs discrepancies.
`runFullPersistenceAudit()` must show 0 gaps for 7 consecutive days.

### Step 3 — Switch reads to DB
Replace `JSON.parse(localStorage.getItem('pb-tickets'))` with `await fetch('/api/tickets')`.
localStorage retained as stale-read fallback for 2 weeks.

### Step 4 — Remove localStorage as primary
`pb-tickets` key becomes a 5-minute read cache only.
Any write goes to DB; cache is invalidated on write.

---

## How Balances Derive from Ledger

```sql
-- Available balance for a player in a club:
SELECT
  cm.balance_start
  + COALESCE(SUM(le.amount), 0) AS available_balance
FROM club_members cm
LEFT JOIN ledger_entries le
  ON le.player_id = cm.player_id
  AND le.club_id  = cm.club_id
WHERE cm.player_id = $1 AND cm.club_id = $2
GROUP BY cm.balance_start;
```

- `bet_placed` → negative amount (risk deducted)
- `bet_won`    → positive amount (profit credited)
- `bet_lost`   → $0 (risk already deducted at placement)
- `bet_push`   → positive amount equal to risk (refund)
- `bet_canceled` → positive amount equal to risk (refund)

No `balance` column stored anywhere. Always derived from ledger.

---

## Rollback Plan

If Phase B causes issues at any step:

1. Re-enable localStorage reads: revert the `fetch('/api/tickets')` call to `JSON.parse(localStorage...)`
2. The DB mirror is still intact — no data is lost
3. Run `runFullPersistenceAudit()` to confirm localStorage and DB match
4. Investigate discrepancy before re-attempting Phase B

Rollback is always safe because:
- localStorage is never deleted in Phase B (only demoted to cache)
- DB rows are additive (no deletes during Phase B)
- Ledger is append-only in both localStorage and DB

---

## Risk List

| Risk | Mitigation |
|---|---|
| DB write fails during ticket placement | Retry queue (3 retries, exponential backoff). If all fail, fall back to localStorage-only write + flag for re-sync. |
| Balance mismatch: DB ledger vs localStorage | `runLedgerMirrorAudit()` detects and re-queues un-mirrored entries |
| Grading cron double-grades (idempotency) | `graded_at IS NOT NULL` check on ticket before grade write; ledger id is `L_bet_won_<ticketId>_<gradedAt>` |
| Network failure between Vercel and Railway | Optimistic UI: show local state immediately, confirm from DB on next poll |
| Player sees stale balance from cache | Cache TTL = 30s; force-invalidate on every bet_placed/grade/cancel event |
| Supabase down during Phase B | Fall back to Railway PostgreSQL for ledger reads; Supabase mirror is secondary |

---

## Required Tests Before Phase B Activation

- [ ] `runFullPersistenceAudit()` shows 0 gaps for 7 days
- [ ] `/api/tickets` returns correct tickets matching localStorage
- [ ] `/api/balance` returns correct balance matching `calcAvailableBalance()`
- [ ] Ticket placement: localStorage write + DB write both succeed in <500ms p95
- [ ] Grading: server cron grades ticket, client polls and sees updated status
- [ ] Double-grade attempt: second grade is silently ignored (idempotent)
- [ ] Cancel: `bet_canceled` ledger row created, balance increases by risk amount
- [ ] All 119 existing test suite still passes
- [ ] New integration tests: place → grade → verify balance via DB ledger SUM

---

## Activation Checklist

```
[ ] Phase A running for ≥7 days with 0 sync gaps
[ ] All required tests passing (above)
[ ] Railway pocketbooks-sports-backend has SUPABASE_* vars
[ ] Supabase schema Phase B migrations applied (add indexes, RLS policies)
[ ] Rollback procedure documented and tested in staging
[ ] Feature flag: ENABLE_DB_PRIMARY=true on Railway (read from process.env)
[ ] Gradual rollout: 10% of requests → DB, monitor for 24h, then 100%
```
