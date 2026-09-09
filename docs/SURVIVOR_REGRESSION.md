# Survivor Regression — OWNER-AWAY Task 19

**Date:** 2026-09-09  
**Branches:** FE+BE `cursor/away-authz-survivor`  
**Constraint:** No production survivor picks mutated.

## Flow audit

| Step | Behavior | Risk |
|------|----------|------|
| Create / join | Actor-scoped create; join by code → pending request | OK |
| Approve / deny | Pool **creator** only (was: any full_admin) | **P0 fixed** |
| Entries | 1–3 entries on approve; pick scoped to `player_id` + `entry_number` | OK |
| Pick | Alive only; week must match `current_week`; team reuse per phase | OK |
| Deadline / lock | Sunday 1pm ET default; server `picks_locked`; FE countdown + overlay | OK |
| ESPN grading | `_gradeSurvivorPool` via ESPN scores; no-pick → eliminated; W/L updates entry | Logic risk: ESPN miss → pending, no false elim for found incomplete games |
| Preseason / test | FE `isPreseasonTestMode`; browse-only weeks cannot submit picks | Safe UI fixed |
| Notifications | Join approved / pick submitted / grade / Wed reminder | Deduped in FE center |

## Logic risks (document only — no prod pick writes)

1. **ESPN unavailable** — grade returns `espn_scores_unavailable`; manual retry required.
2. **Game not found for pick** — treated as pending (entry stays alive) until matched.
3. **Tie** — counted as loss (`_survivorTeamWon`).
4. **Week advance** — only when `pendingRemain === 0`; incomplete slate stalls week.
5. **Pool visibility** — authenticated users who know `poolId` can read standings/entries (not money); mutations creator-scoped.
6. **TNF vs Sunday deadline** — TNF does not move Sunday 1pm ET lock (by design).

## Safe UI fixes this pass

- Block `selectMatchupTeam` / `submitPick` on browse-only (non-current) weeks
- Clarify preseason helper when schedule is browse-locked

## Tests

- FE: `node tests/survivor-regression.test.js`
