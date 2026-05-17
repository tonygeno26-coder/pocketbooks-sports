# PocketBooks Sports — Roadmap

## Phase 1: Foundation (current) ✅
- [x] Canonical ticket model with immutable identity fields
- [x] Derived balance engine (no manual patches)
- [x] Grading gates: future, started, date-mismatch, ambiguous, conflict
- [x] Sport access gate (host-enforced, confirmed at execution boundary)
- [x] Teaser sport gate
- [x] Placement gate (started/final game blocking at slip + confirm)
- [x] Conflict prevention (opposing sides)
- [x] `gradeTodaysActiveTickets()` audit helper
- [x] `reconcileInvalidGrades()` / `revertFutureGrades()` recovery tools
- [x] 119 automated tests (lifecycle, balance, grading, conflict, gates)
- [x] Build pipeline: SHA stamping, `npm run verify`, `npm run deploy:prod`
- [x] Vercel deploy fixed: `outputDirectory: "."`, no-cache headers
- [x] ARCHITECTURE.md: 12 non-negotiable rules documented

---

## Phase 2: Backend Persistence (next)

### 2a. Ticket Store → PostgreSQL
- [ ] Move `pb-tickets` from localStorage to backend DB table `tickets`
- [ ] `POST /api/tickets` — place bet (atomic: ticket + ledger row)
- [ ] `GET /api/tickets?playerId=&status=` — load tickets
- [ ] `PATCH /api/tickets/:id` — grade/cancel (server-side only)
- [ ] localStorage becomes a read cache only, invalidated on write

### 2b. Immutable Ledger → DB
- [ ] `ledger` table: append-only, `INSERT` only (no UPDATE/DELETE)
- [ ] Every balance change requires a ledger row with `reason`
- [ ] Balance derived server-side from `SELECT SUM` on ledger

### 2c. Grading → Server-side Only
- [ ] Cron job: `/api/grade/mlb` — polls SportsDataIO, grades tickets
- [ ] Client calls `GET /api/tickets` to see updated status
- [ ] No grading logic runs in browser
- [ ] `gradeTodaysActiveTickets()` becomes a debug-only wrapper calling the API

---

## Phase 3: Auth & Roles
- [ ] JWT auth per player, verified on every API call
- [ ] Club membership validated server-side
- [ ] Host role: can set limits, approve/deny, view all club tickets
- [ ] Player role: can only see own tickets
- [ ] `pb-sports-token` replaced by server-issued JWT with expiry

---

## Phase 4: Risk Engine
- [ ] Per-player max bet, max daily risk, max payout enforced server-side
- [ ] Club-level exposure limits (host sets max liability)
- [ ] Line change detection: odds moved >X% since placement → alert
- [ ] Correlated parlay detection: flag same-game parlay combinations
- [ ] Sharp player detection: win rate >60% over 20+ bets

---

## Phase 5: Audit & Admin
- [ ] Admin panel: full ledger view, manual adjustments with reason
- [ ] Ticket timeline: every state change with timestamp + actor
- [ ] Balance reconciliation report: starting + in/out = ending
- [ ] Export: CSV of all tickets/ledger for a date range
- [ ] Dispute resolution: host can void ticket with reason, auto-refund

---

## Development Contract

Every feature shipped must include:
```
ROOT CAUSE:          Exact file/function/line
FLOW VERIFICATION:   Step-by-step with ✅/❌ per step
ACCEPTANCE TESTS:    All 119 existing + new feature tests pass
CONSOLE PROOF:       Exact log output
DEPLOY SHA:          GitHub = local = build.json = Vercel all match
```

Financial correctness > UI polish. Always.
