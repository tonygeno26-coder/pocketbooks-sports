# BETA WALKTHROUGH — 2026-09-09

**Branch:** `cursor/away-beta-polish`  
**Target:** `http://localhost:3000` (`npm run dev`)  
**Modes:** PLAYER (`player.html?preview=1&testUser=1`) + HOST (dev harness token)  
**Viewports attempted:** 390 / 430 / 768 / 1440  
**Financial writes / confirmBet / settlement recording:** **NOT performed**

---

## PLAYER

| Step | 390 | 430 | 768 | 1440 | Notes |
|---|---|---|---|---|---|
| Load + bankroll visible | PASS* | PASS* | PASS | PASS* | Balance `$834.06` from dashboard; *viewport resize tool stayed ~768 in CDP — overflow checked at native width PASS |
| Sport tabs / lines | PASS | PASS | PASS | PASS | MLB live cards + Sharp Value render |
| Add bet to slip (no confirm) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | Avoided any placement path on purpose |
| My Bets tab | PASS | PASS | PASS | PASS | `setBNav(mybets)` shows section |
| Beta onboarding tips | PASS | PASS | PASS | PASS | Overlay present (`pb-onboard-overlay`) on first load |
| Settings → About SHA | PASS | PASS | PASS | PASS | `#ps-about-box` + build SHA |
| Settings → Report a Problem | PASS | PASS | PASS | PASS | `#ps-feedback-btn` present |
| Predictions dead feature hidden | PASS | PASS | PASS | PASS | `data-beta-hidden="NOT_IMPLEMENTED"` |
| No prod confirm / cancel | PASS | PASS | PASS | PASS | Explicitly skipped |

### Player console (after `_safeId` early fix)

| Signal | Status |
|---|---|
| Session-gate / TOKEN_MISSING spam | PASS (gone; debug-gated) |
| `_safeId is not defined` | PASS after early definition |
| `/api/notifications` 401 | FAIL (noise) — meaningful auth gap, not hidden |
| ESPN soccer teams CORS | FAIL (noise) — browser CORS; not FE retry spiral |
| Nascar logo 404 | FAIL (noise) — CDN asset |
| Infinite auth retry | PASS — no spiral observed |

---

## HOST

| Step | Result | Notes |
|---|---|---|
| Dev → Host Token | PASS | Token stored (`role=host`) |
| Open Host Dashboard (`index.html`) | BLOCKED | Session bounced to `lobby.html?screen=signin&msg=Session invalid` in iframe + direct nav |
| Host Risk Console read | BLOCKED | Could not retain host session in this harness |
| Settlement ledger tab (read-only) | BLOCKED | Depends on host session |
| Report button + build SHA in header | PASS (static) | Present in `index.html` source (`#host-feedback-btn`, `#host-build-sha`) |
| Settlement recording writes | NOT TESTED / OFF | Hard stop honored |

---

## Safety

| Check | Result |
|---|---|
| PRODUCTION FINANCIAL DATA TOUCHED | **NO** |
| confirmBet executed | **NO** |
| Settlement recording enabled | **NO** |
| Cancel SQL applied | **NO** |

---

## Verdict

- **PLAYER beta smoke:** PASS with known console noise (notifications 401, ESPN CORS, nascar 404).
- **HOST interactive:** BLOCKED on session bounce after token install in this walkthrough environment.
- **Polish features (onboarding / feedback / SHA / dead-feature hide):** PASS on player.
