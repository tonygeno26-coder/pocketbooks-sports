# BETA RELEASE CHECKLIST

**Date:** 2026-09-09  
**Branch:** `cursor/pre-beta-host-rc`  
**Base:** `cursor/host-preview-responsive` @ `365cc2e` + UI-only port of Host Players/Bets from `cursor/away-host-ops` @ `1849363` (not efa7ed7 trust stack)  
**Grading:** PASS | FAIL | BLOCKED | NOT TESTED — no inflated scores.

Legend: **P0** ship-stopper · **P1** beta-blocker · **P2** polish

---

## P0

| Item | Status | Evidence |
|---|---|---|
| No production financial writes during this RC pass | PASS | Visual QA / preview only; no confirm settle / place / cancel exercised |
| Settlement recording remains OFF | PASS | `_hostSettlementRecordingEnabled()` defaults false; Settle CTAs show **Record · off**; modal gated |
| No cancel SQL / settlement migrate applied from this branch | PASS | FE-only; no migrate applied in this pass |
| Player bankroll fail-closed (no invented local $1000) | NOT TESTED | Not re-audited on this RC tip; see trust-stack / bug-hunt owners |
| Auth does not infinite-retry on 401/403 | NOT TESTED | Not re-walked on this RC tip |
| Phantom localStorage bet success after DB primary failure | BLOCKED | Known P0 from `docs/BETA_BUG_HUNT.md` — owner decision; not claimed fixed here |
| Do not merge settlement Option A stack to `main` from this RC | PASS | Intentional: RC may carry HRC/settle *display* from preview lineage; **no main merge** |

## P1

| Item | Status | Evidence |
|---|---|---|
| Host preview shell 390–1440 (overflow / Settle / modal) | PASS | `tests/host-preview-responsive.test.js` + puppeteer metrics in `docs/visual-qa/host-rc/` |
| Host Players: betting vs settlement ledger visually separate | PASS | `hpd-zone-betting` / `hpd-zone-ledger`; `tests/host-ops-players-bets.test.js` |
| Host Bets: mobile operator cards + search/filters | PASS | `.hbo-ticket` cards; no table list; search control |
| Host dashboard session in real beta harness (JWT) | BLOCKED | `?preview=1` works for visual QA; live host token → sign-in bounce still unresolved from prior polish |
| Player sportsbook loads lines | NOT TESTED | Out of scope for this host RC pass |
| My Bets / Recent Bets usable | PASS / NOT TESTED | **My Bets** present on this tip (visual PASS). Dedicated **Recent Bets feed** may still be in flight on `cursor/recent-bets-feed` |
| Dead/NOT IMPLEMENTED surfaces hidden | NOT TESTED | Prior `away-beta-polish` claimed PASS; not re-verified here |
| `/api/notifications` 401 on player load | FAIL | Prior walkthrough; not fixed on this branch |
| Console cleanliness | NOT TESTED | Residual ESPN/CORS/404 noise expected |

## P2

| Item | Status | Evidence |
|---|---|---|
| Host Settle cosmetic empty banners / note ellipsis at 390 | MINOR | Acceptable residual per `docs/HOST_PREVIEW_RESPONSIVE.md` |
| Player Slip chrome in cold `?preview=1` without open action | MINOR | Structure may be lazy; not a layout BLOCKER in width matrix |
| ESPN soccer logo CORS / Nascar 404 | FAIL | Prior; asset/CORS noise |
| Feedback backend inbox | NOT TESTED | Spec-only if present on other branches |
| Device Safari spot-check | NOT TESTED | Chrome/puppeteer only this pass |

---

## Automated checks run (this branch)

| Check | Result |
|---|---|
| `node tests/host-preview-responsive.test.js` | PASS (7) |
| `node tests/host-ops-players-bets.test.js` | PASS (12) |
| `node tests/host-risk-console.test.js` | PASS (10) |
| Puppeteer HOST tabs @ 390/430/768/1280/1440 | PASS (see visual QA doc) |
| Puppeteer PLAYER surfaces @ same widths | PASS with Slip MINOR; Recent Bets = My Bets stand-in |
| Manual HOST JWT walkthrough | BLOCKED |
| Settlement write-path QA | NOT TESTED (intentionally off) |

---

## Ship recommendation

**Host UI RC is ready for visual review** (preview + Players/Bets polish + recording disabled).  
**Not a full green beta.** Do **not** enable settlement recording. Do **not** merge settlement accounting to `main` from this branch. Resolve host JWT session bounce + notifications 401 + phantom-ledger P0 before calling beta ready.
