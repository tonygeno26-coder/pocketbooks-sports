# Authorization Audit — OWNER-AWAY Task 18

**Date:** 2026-09-09  
**Branches:** FE+BE `cursor/away-authz-survivor`  
**Constraint:** No destructive prod requests. No prod pick changes. Fixtures/tests only.

## Verdict

Cross-club host mutations and player self-scoping on `/api/player/dashboard` / place / cancel were already gated by `requirePermissionScoped` + club scope. Two **P0 IDORs** were open and are hardened on this branch.

## P0 findings

| ID | Issue | Status |
|----|--------|--------|
| **P0-AUTHZ-1** | `GET /api/mirror/tickets` and `/api/mirror/tickets-with-legs` had **no auth** — any client could pass `playerId` and read another player's tickets/legs | **FIXED** — `requireActor` + pin non-privileged actors to `actor.actorId` |
| **P0-AUTHZ-2** | `GET /api/notifications` allowed `host`/`admin`/`owner` to pass foreign `playerId` without club scope | **FIXED** — always pin to authenticated actor |
| **P0-AUTHZ-3** | `_survivorIsHost` treated any `full_admin`/`owner` as pool runner → Host A could approve/grade Host B pools | **FIXED** — creator + `platform_admin` only |

## Verified OK (fixtures)

- Host A token `clubId=CLUB_A` + settle/dashboard for `CLUB_B` → `club_scope_mismatch`
- Player A `view_player_dashboard` / `place_bet` / `cancel_bet` for Player B → `not_own_account`
- Cancel handler also checks `ticket.player_id` vs body playerId (`not_owner`)

## FE hardening

- `loadPlayerDashboardFromDb` prefers JWT `sub`/`actorId` over `pb-player` localStorage (blocks client ID swap before server 403)

## Tests

- FE: `node tests/authz-idor.test.js`
- BE: `node tests/authz-idor.test.js`

## Residual / owner notes

- Privileged `full_admin` in-club may still view another member's dashboard (intentional host ops).
- `platform_admin` remains cross-club escape hatch.
- Mirror admin tooling (`admin.html`) must send a session token after this change.

## Wave follow-up (`cursor/idor-audit-wave`)

This branch carries deferred FE authz (JWT-preferred playerId + fixtures). Backend companion at BE `cursor/idor-audit-wave` / `docs/IDOR_AUDIT_WAVE.md`: cash-out club bind, dashboard fail-closed, join-queue host gate, settlement period IDOR, mirror audit auth.
