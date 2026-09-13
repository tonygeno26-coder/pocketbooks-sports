# PocketBooks Public Betting Beta Readiness

**Audit date:** 2026-09-13  
**Scope:** frontend `b57b52b`, backend `00bc0ce`; read-only production spot checks;
local tests and static audits. No production wager or financial mutation.

## Decision

**Safe for the current bounded public betting beta: YES, with P1 follow-ups.**

The reviewed placement, correlation, authorization, club isolation, image
fallback, props identity, and settlement-off controls fail closed. No P0 was
found. Wider promotion should wait for the two P1 confidence gaps below.

## Counts

- P0: **0**
- P1: **2**
- P2: **4**
- P3: **2**

## P0 — release stop

None found in the audited scope.

## P1 — address before wider promotion

1. **Live cross-club placement isolation is not exercised by the current release
   checklist.** Source and local isolation regressions pass, but the existing
   backend checklist records the live A/B cross-club scenario as not tested.
   Run a designated non-production or explicitly approved test-account exercise.
2. **Full live place → grade → Results lifecycle was not run.** Ticket grading
   is on while settlement is independently off, but this exact current-SHA
   lifecycle remains an unverified release gate. Use designated test accounts
   and zero-impact fixtures; do not enable settlement.

## P2 — beta quality / operational debt

1. **Backend `npm test` is not a reliable one-command gate.** Jest discovers
   script-style tests (including `.worktrees`) that call `process.exit` or define
   no Jest tests. Targeted auth, isolation, correlation, settlement-off, and
   risk tests pass, but the aggregate command fails for harness reasons.
2. **Frontend aggregate verify is blocked by migration ordering hygiene.**
   `tests/schema.test.js` reports migration
   `023_grade_ticket_tx_push_reduced.sql` out of sequence (expected 24).
   No migration was renamed or applied during this audit.
3. **Feed grading coverage is intentionally incomplete.** Boxing is empty;
   rugby has thin odds without a safe score path; NASCAR inventory is futures
   and is suppressed. Keep these fail-closed until deterministic results exist.
4. **Image coverage is incomplete but safely presented.** Map/live audit found
   no broken mapped URLs in no-HTTP classification, but many unresolved live
   soccer and player-prop identities. Text fallback is the correct behavior.

## P3 — polish / maintenance

1. Survivor's premium landing treatment is available on
   `cursor/survivor-premium-visual` for owner review; it is intentionally not
   merged.
2. The Test Center had a malformed card CSS variable and lacked its explicit
   400px layout gate. Fixed on frontend `main` in `170bc6b`.

## Audit results by area

### Survivor

- Read-only source audit: escaped dynamic names, server-reported host gating,
  per-entry/per-phase used-team handling, deadline checks, and entry number in
  pick payload are present.
- Added six local regression assertions on the owner-review visual branch.
- Mobile visual shell was checked locally at the browser's 500px minimum with
  zero horizontal overflow; 390px media behavior is covered by source regression.

### Mobile product

- The 390px suite now passes 11/11 after the Test Center CSS-only fix.
- No owner-approved production screen was redesigned.

### Props and images

- Premium props: 20/20.
- Progressive disclosure: 7/7.
- Deferred selection identity: 9/9.
- Image failure/text fallback: 10/10.
- Dark-logo contrast: 7/7.
- Live map audit sampled 1,672 unique entities. All unknown identities remain
  text-only; no fuzzy image assignment was added.

### Feeds

- NFL: usable events/odds/scores/props.
- MLB: usable events/odds/scores/props.
- NBA: usable events/odds/props; score coverage partial.
- NHL: usable events/odds; props and scores partial.
- NCAAF: usable events/odds/scores/props.
- NCAAB: seasonal empty; wiring exists.
- Soccer: high event volume; deterministic score matching; image coverage partial.
- Tennis: high event volume; deterministic live matching; image coverage partial.
- Golf: usable odds; no supported score/props path.
- MMA: usable odds; no supported automatic result path.
- Boxing: empty and not advertised as gradeable.
- Rugby: one-event spot check; no safe score/grading path.
- NASCAR: futures-only inventory; frontend suppresses it.
- No feed architecture change was made.

### Authorization, betting, and settlement

- Backend authz/IDOR: 9/9.
- Multi-club isolation: 8/8.
- Red-team authz: 18/18.
- Correlation/SGP fail-closed: 29/29.
- Settlement-off decoupling: 6/6.
- No real production wager, ledger write, bankroll change, settlement write,
  schema mutation, or Diamond transaction was performed.

## Recommended next actions

1. Run the designated cross-club live isolation gate in a safe test environment.
2. Run the exact current-SHA place → grade → Results flow with settlement off.
3. Exclude `.worktrees` and script-style harnesses from Jest discovery; expose
   separate `test:unit` and `test:harness` commands.
4. Resolve migration numbering through an owner-reviewed, no-apply repository
   hygiene change.
5. Keep boxing/rugby/NASCAR wagering unavailable until deterministic grading
   sources and fixture coverage exist.
