# Stabilization Sprint

## Status

| Item | Status |
|------|--------|
| Version guard renders as visible text | ✅ Fixed (b375017) |
| Mock seeder runs on every load | ✅ Fixed (3f7373e) |
| `resetTicketStateForFreshTesting()` exists globally | ✅ (1fccff6) |
| `reconcileInvalidGrades()` exists globally | ✅ |
| Vercel webhook broken (serving stale builds) | ❌ Requires `npx vercel login` |
| Automated test suite | ⏳ In progress |
| Core logic extracted to modules | ⏳ Planned |

---

## Patch Contract

Every future patch MUST include:

```
Files touched: <list>
Test run: <command or manual steps>
Console proof: <expected log lines>
Deploy SHA: <git sha>
```

---

## Automated Test Suite

Run: `node tests/run.js`

Tests cover:
- [ ] Ticket placement (confirmBet writes to pb-tickets)
- [ ] Stake sync (bsAddStake → bsStakes hydrated)
- [ ] Balance deduction (active ticket reduces available)
- [ ] Cancel (canceled ticket = $0 impact)
- [ ] Results aggregation (12h filter, _displayStatus)
- [ ] Host mirror (hostActiveBets reflects pb-tickets)
- [ ] Game identity matching (canonicalGameKey, date gate)
- [ ] Future game guard (commenceTime > now → skip)

---

## Module Extraction Plan

| Module | File | Status |
|--------|------|--------|
| ticketStore | modules/ticketStore.js | ⏳ |
| balanceEngine | modules/balanceEngine.js | ⏳ |
| resultsAggregator | modules/resultsAggregator.js | ⏳ |
| gradingMatcher | modules/gradingMatcher.js | ⏳ |
| betSlipState | modules/betSlipState.js | ⏳ |

Extraction rule: Logic only. No DOM. Pure functions. Each module has its own test file.

---

## Stabilization Checklist

Before resuming feature work, ALL must be ✅:

- [ ] dev preview always serves latest build (Vercel webhook fixed)
- [ ] `document.body.innerText.includes("VERSION")` → false
- [ ] `resetTicketStateForFreshTesting()` → pb-tickets = 0 after reset
- [ ] No MK*/MOCK* tickets appear after fresh load
- [ ] `window.PBS_BUILD_SHA` matches build.json sha on prod
- [ ] Automated tests: all pass
- [ ] player.html < 8500 lines (currently 8459 — at limit)
