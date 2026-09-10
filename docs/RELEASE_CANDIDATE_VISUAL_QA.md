# Release Candidate — Visual QA

**Date:** 2026-09-09  
**Branch:** `cursor/pre-beta-host-rc`  
**Method:** Chrome headless (puppeteer) + static `?preview=1` at `http://127.0.0.1:8765`  
**Artifacts:** `docs/visual-qa/host-rc/` (screenshots + `metrics.json`)  
**Grades:** PASS | MINOR | BLOCKER | BLOCKED | NOT TESTED

---

## HOST (tabs × widths)

Tabs: Home (Risk Console) · Bets · Players · Settle · Crypto  

| Width | Home | Bets | Players | Settle | Crypto | Notes |
|------:|:----:|:----:|:------:|:------:|:------:|---|
| 390 | PASS | PASS | PASS | PASS | PASS | Settle tab visible; no X overflow; modal ≤ viewport; recording off |
| 430 | PASS | PASS | PASS | PASS | PASS | Same |
| 768 | PASS | PASS | PASS | PASS | PASS | Same |
| 1280 | PASS | PASS | PASS | PASS | PASS | Same |
| 1440 | PASS | PASS | PASS | PASS | PASS | Players/Bets max-width containment |

### Host checklist detail

| Check | Grade | Evidence |
|---|---|---|
| Overflow-x at 390–1440 | PASS | `metrics.json` `overflowX:false` |
| Five-tab bnav / Settle not cropped | PASS | `settleVisible` + `bnavFits` |
| Modal / sheet containment | PASS | probe `max-width:min(430px,100%)` |
| Players betting vs settlement ledger separation | PASS | CSS/helpers `hpd-zone-*`; unit tests |
| Settlement recording disabled | PASS | gate + **Record · off** |
| Bets mobile cards (not table) | PASS | `.hbo-ticket` + search |
| Live host JWT session (non-preview) | BLOCKED | Preview escape only; harness bounce known |
| Settlement write actions | NOT TESTED | Intentionally not exercised |

**Host residual (MINOR, not width blockers):** empty backend banners / truncated cosmetic notes in preview.

---

## PLAYER (surfaces × widths)

Surfaces: Home · Recent Bets · Results · Props · Slip · Notifs  

| Width | Home | Recent Bets | Results | Props | Slip | Notifs |
|------:|:----:|:-----------:|:-------:|:----:|:----:|:------:|
| 390 | PASS | PASS* | PASS | PASS | MINOR | PASS |
| 430 | PASS | PASS* | PASS | PASS | MINOR | PASS |
| 768 | PASS | PASS* | PASS | PASS | MINOR | PASS |
| 1280 | PASS | PASS* | PASS | PASS | MINOR | PASS |
| 1440 | PASS | PASS* | PASS | PASS | MINOR | PASS |

\* **Recent Bets:** graded PASS on **My Bets** presence/layout. Dedicated Recent Bets feed may still be in flight on `cursor/recent-bets-feed` — treat dedicated feed as **NOT TESTED** on this tip.

| Check | Grade | Notes |
|---|---|---|
| Home sportsbook shell | PASS | No X overflow in preview |
| My Bets / Recent Bets | PASS* / NOT TESTED | See above |
| Results | PASS | Section/nav present |
| Props | PASS | Props surface markers present |
| Slip | MINOR | Cold preview did not expose mounted slip chrome without open action |
| Notifs | PASS | Notification markers present |
| Player JWT / lobby bounce | NOT TESTED | `?preview=1` path only this pass |

---

## Verdict

| Area | Verdict |
|---|---|
| HOST visual RC | **PASS** for preview layout/actions containment + Players/Bets polish |
| PLAYER visual RC | **PASS with MINOR** (Slip cold-load); Recent Bets feed follow-up on other branch |
| Beta ship | **Not green** — host JWT BLOCKED historically; settlement recording stays OFF; no settlement merge to `main` |
