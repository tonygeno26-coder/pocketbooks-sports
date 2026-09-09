# BETA RELEASE CHECKLIST

**Date:** 2026-09-09  
**Branch:** `cursor/away-beta-polish`  
**Grading:** PASS | FAIL | BLOCKED | NOT TESTED — no inflated scores.

Legend: **P0** ship-stopper · **P1** beta-blocker · **P2** polish

---

## P0

| Item | Status | Evidence |
|---|---|---|
| No production financial writes during beta polish | PASS | Walkthrough skipped confirm/cancel/settle writes |
| Settlement recording remains OFF | PASS | Flag not enabled; hard stop honored |
| No cancel SQL / settlement migrate applied | PASS | Not applied |
| Player bankroll fail-closed (no invented local $1000) | PASS | Dashboard balance shown from server path |
| Auth does not infinite-retry on 401/403 | PASS | Retry caps present; no spiral in walkthrough |
| Phantom localStorage bet success after DB primary failure | BLOCKED | Known P0 from `docs/BETA_BUG_HUNT.md` — owner decision; not “fixed” here |

## P1

| Item | Status | Evidence |
|---|---|---|
| Player sportsbook loads lines | PASS | MLB cards + live |
| My Bets tab usable | PASS | Walkthrough |
| Beta onboarding (lightweight) | PASS | Player overlay |
| Report a Problem (no tokens) | PASS | Settings + feedback spec; clipboard FE-only |
| Release SHA visible in Settings/About | PASS | `#ps-about-box` / host header |
| Dead/NOT IMPLEMENTED surfaces hidden | PASS | Predictions gated; lobby messages hidden; search toast removed |
| Host dashboard session in beta harness | BLOCKED | Token → sign-in bounce in walkthrough |
| API error contract documented + FE normalize | PASS | `docs/API_ERROR_CONTRACT.md` + `_pbNormalizeApiError` |
| `/api/notifications` 401 on player load | FAIL | Console 401; needs BE/FE auth alignment |
| Console cleanliness (no session-gate spam) | PASS | Debug-gated; residual ESPN/CORS/404 noise remains |

## P2

| Item | Status | Evidence |
|---|---|---|
| ESPN soccer logo CORS noise | FAIL | Browser CORS from localhost |
| Nascar CDN logo 404 | FAIL | Asset URL |
| Viewport CDP resize fidelity in walkthrough | BLOCKED | Tool kept ~768 CSS px; mobile-390 CSS tests still exist separately |
| Host Settle ledger UX at 390 | NOT TESTED | Host session blocked |
| Feedback backend inbox | NOT TESTED | Spec-only (`docs/BETA_FEEDBACK_SPEC.md`) |

---

## Automated checks run

| Check | Result |
|---|---|
| `node tests/beta-polish.test.js` | PASS (9) |
| Manual PLAYER walkthrough | PASS (non-financial) |
| Manual HOST walkthrough | BLOCKED |

---

## Ship recommendation

**Not a full green beta.** Player polish items for Tasks 15–24 are largely in place. **Do not** claim host walkthrough PASS. **Do not** enable settlement recording. Resolve notifications 401 + host session bounce before calling beta “ready.”
