# Authorization Audit — PLAYER / HOST / CLUB (FE)

**Date:** 2026-09-09  
**Branch:** FE `cursor/pre-beta-authz-club`  
**BE companion:** `cursor/pre-beta-authz-club` / `cursor/idor-audit-wave`  
**Prior FE:** deferred `cursor/away-authz-survivor` (`docs/AUTHZ_IDOR_AUDIT.md`)  
**Constraint:** Fixtures/docs only here. No destructive prod. Settlement OFF.

---

## Verdict

Server is the authority for club isolation. FE must send scoped tokens and prefer JWT actor over `localStorage` player id. Survivor FE hardening remains deferred on `cursor/away-authz-survivor`; this branch documents + fixtures the contracts without regressing red-team tests.

---

## PLAYER

| Concern | Expectation | Status |
|---------|-------------|--------|
| Dashboard hydrate | Calls `/api/player/dashboard` with club from session; missing club → fail closed UI | Follows BE **FIXED** |
| Place / cancel | Idempotent money paths; no phantom local success | Trust-stack **OK** |
| Cash-out accept/decline | Ticket actions club-bound on BE | BE **FIXED** |
| JWT vs `pb-player` | Prefer token `sub`/`actorId` over LS swap | Deferred survivor FE |

---

## HOST

| Concern | Expectation | Status |
|---------|-------------|--------|
| Host dashboard / bets | Club from host session token | BE hard-scoped **FIXED** |
| Join requests | Host-only; cross-club denied | BE **FIXED** |
| Settlement UI | Recording OFF; preview club-scoped | Keep OFF |

---

## CLUB

| Concern | Status |
|---------|--------|
| Multi-club same player cannot see Club B money in Club A session | BE fixtures **OK** |
| Cross-club host settle/dashboard | `club_scope_mismatch` fixtures **OK** |
| Cancel RPC soft club | **OWNER-GATED** |

---

## P0 / owner-gated

| ID | Status |
|----|--------|
| FE mirror of BE IDOR P0s | Documented; enforcement on BE |
| Survivor FE JWT pin | Deferred `away-authz-survivor` |
| `cancel_bet_tx` SQL | **DO NOT APPLY** |

See also: `docs/CLUB_ISOLATION_AUDIT.md`, `docs/AUTHZ_IDOR_AUDIT.md`, BE `docs/AUTHORIZATION_AUDIT.md`.

## Tests

```bash
node tests/authz-idor.test.js
node tests/red-team-authz.test.js
node tests/multi-club-isolation.test.js
```
