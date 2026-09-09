# BETA BUG HUNT — 2026-09-09

**Tester:** Hostile beta (dev fixtures only)  
**Target:** `localhost:3000` via `npm run dev`  
**Player fixture:** `player.html?preview=1&testUser=1` (TestPlayer1 / dev club `d616dc2a-…`)  
**No production financial writes performed.**

---

## STATUS: BETA KILLER BUG HUNT

### P0 (data / financial / security — STOP, do not fix accounting here)

1. **confirmBet localStorage fallback after network/500 failure** — When `_DB_PRIMARY_READS_ENABLED` and `/api/bets/place` throws or times out, code falls through to `LOCALSTORAGE FALLBACK PATH`: writes tickets + `addLedgerEntry` locally and shows success toast (“saved locally, syncing when back online”). Risk: phantom bets / balance drift vs server ledger. **Owner decision required before changing placement authority.**

2. **Cancel bet localStorage fallback** — `/api/bets/cancel` failures can fall through to local cancel path (see cancel handler ~8705–8722). Same ledger-trust concern.

3. **Settlement recording still gated** — `SETTLEMENT_RECORDING_ENABLED` must remain OFF until bootstrap signed (per `BETA_UX_HEALTH.md`, `SETTLEMENT_PARTIAL_CARRY.md`).

4. **Owner C settlement opening decisions** — staging migrate blocked pending owner sign-off.

### P1 (blocks normal beta)

1. **Confirm double-tap window** — `confirmBet()` called `_cbBtnBusy()` only after ticket build (~8193); rapid double-tap before spinner could enqueue duplicate work (BE idempotency mitigates money; UX still confusing). **FIXED:** early `_confirmBetInFlight` + `cbBusy` dedupe guard.

2. **Host dashboard without session** — `index.html` redirects player-only JWT to `survivor.html` / `lobby.html` (expected). Host flows require dev bypass (`dev.html` → Host Token / Login as Host); not fully exercised in this run.

3. **Network 500 on dashboard** — Mocked `/api/player/dashboard` 500 did not surface a user-visible toast in quick probe; balance may stay stale silently (needs dedicated error banner).

### P2 (annoying)

1. **Odds highlight class drift** — Event delegation toggled `selected` but legacy paths used `sel`; deselect could leave stale highlight. **FIXED:** sync both classes + `aria-selected`.

2. **clearSlip uses native `confirm()`** — Blocks mobile UX on accidental clear (P2 polish).

3. **Preview My Bets shows dev grading tools** — “Simulate Grade Results”, “Grading Console” visible with `?preview=1` (intentional but noisy for beta screenshots).

4. **Invalid `?sport=` query ignored silently** — e.g. `?sport=notavalidsport` falls back to MLB with no toast (P3-adjacent).

5. **test-dashboard.html missing 400px breakpoint** — **FIXED** (mobile-390 test).

### P3 (polish)

1. **390px dev.html viewport preset is 430 not 390** — use browser resize for true 390 gate (`tests/mobile-390.test.js` covers CSS).

2. **Sport tab counts flicker on rapid NFL↔NBA switch** — recovers after ~1s; no crash.

3. **Notifications dropdown** — `#notif-dd.open` class toggles; empty state acceptable.

---

## FIXED

| Issue | Fix |
|-------|-----|
| Confirm bet double-submit UX gap | `_confirmBetInFlight` + early `CONFIRM_BET_DEDUPED` return in `confirmBet()` |
| Stale odds cell highlight after deselect | Remove/add both `selected` and `sel` (+ `aria-selected`) in odds-cell click handler |
| test-dashboard 390px breakpoint | `@media (max-width:400px)` wrap/header rules |

---

## NOT FIXED (by design)

- localStorage placement/cancel fallback paths (P0 financial)
- Settlement recording / payment terminology routes
- Host session bypass (requires authorized host fixture)
- Dashboard 500 user-facing error banner

---

## TESTS

| Command | Result |
|---------|--------|
| `node tests/beta-bug-hunt.test.js` | 2 passed |
| `node tests/mobile-390.test.js` | 11 passed |
| `node tests/player-dashboard.test.js` | 26 passed |
| `node tests/placement-gate.test.js` | 17 passed |
| `node tests/host-settlements-ui.test.js` | 24 passed |
| Browser: login/hard refresh/sport switch/odds spam | OK — slip dedupes, spam → 1 leg |
| Browser: parlay duplicate spread same game | OK — replacement → 1 leg |
| Browser: My Bets tab | OK — graded tickets render |
| Browser: 390×844 viewport | no horizontal overflow |
| Browser: malformed query params | no crash, silent sport fallback |
| **No real bets placed** | confirm path not executed against prod ledger |

---

## BRANCH

`cursor/beta-bug-hunt`

## SHA

`afb743a`
