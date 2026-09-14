# PocketBooks Public Betting Beta Readiness

**Audit date:** 2026-09-13
**Baseline:** frontend `066a511`, backend `d3c3a34`
**Mutation policy:** read-only production checks; no production wager,
membership, bankroll, grade, cancel, settlement, Diamond, schema, or other
financial mutation.

## Decision

**Safe for the bounded public betting beta: NO until the token-mint and
grade-status security fixes are reviewed and deployed.**

Financial placement, correlation, authorization, automated club isolation,
image fallback, props identity, and host-settlement-off controls otherwise fail
closed. Production club-token issuance currently lacks credential proof, and
the public grade-status route exposes the identifiers needed to exploit it.

## Counts

- P0: **2**
- P1: **2**
- P2: **5**
- P3: **2**

## P0 — release stop

1. **Club-scoped session tokens can be minted without credential proof.**
   Production `POST /api/auth/token` accepts public `actorId` + `clubId`,
   resolves membership, and issues a signed session without requiring a valid
   login/session credential. The frontend also retries token acquisition
   without its login bearer. This can become a financial authorization bypass
   for any known active member ID. Backend hardening is on
   `cursor/security-grade-status-redaction` at `845f908`; the companion frontend
   removal of the bearerless retry is on `cursor/security-token-mint-client`.
   Neither branch is merged.
2. **Unauthenticated grade status leaks cross-club identifiers.** Production
   `GET /api/grade/status` returned recent ticket IDs, player IDs, outcomes,
   audit payloads, and active-ticket count without authentication. A code-only
   redaction is pushed but intentionally unmerged:
   `cursor/security-grade-status-redaction` at `845f908`. It limits the public
   query to the latest timestamp and a head-only count. Merge/deploy only after
   owner security review.

## P1 — owner-controlled live verification

1. **Live A/B cross-club placement isolation is not exercised.** Automated
   source and fixture checks pass, but production A/B contexts were not mutated.
   Required matrix:
   - A token + A club → allow; A token + B club → deny.
   - B token + B club → allow; B token + A club → deny.
   - A/B cross-player and cross-club ticket read/cancel → 403/404 with no row,
     balance, or existence leakage.
   - Missing/nonexistent membership and spoofed player/club → fail closed with
     no phantom balance.
2. **Exact live place → grade → Results was not run.** Ticket grading is on
   while host settlement recording is independently off. Use one owner-approved
   designated account, the club-configured minimum stake, an authoritative
   currently available market, and a unique idempotency key. Verify ACTIVE,
   terminal WON/LOST/PUSH, authoritative balance, Recent Bets, and Results.

## P2 — beta quality and operational debt

1. **Backend test discovery:** baseline `npm test` mixes Jest suites,
   standalone scripts, and `.worktrees`. Branch `cursor/beta-test-hardening`
   (`e5a5120`) separates 14 Jest suites (123/123) from harnesses and ignores
   `.worktrees`. Standalone harnesses remain a separate explicit gate.
2. **Frontend migration ordering:** `tests/schema.test.js` reports
   `023_grade_ticket_tx_push_reduced.sql` where sequence 24 is expected. No
   migration was renamed or applied.
3. **Feed grading is bounded:** NCAAB and Boxing are empty; Rugby is empty and
   lacks a safe score path; NASCAR exposes unsupported futures and remains
   suppressed. Do not manufacture support.
4. **Image coverage is partial but safe:** unknown identities use text
   fallbacks; no fuzzy assignment was added.
5. **Historical fixture debt:** some frontend standalone financial fixtures
   still describe a missing membership as a `$1000` fallback, while current
   backend placement uses conservative zero/fail-closed behavior. Those fixtures
   are not authoritative release evidence until rewritten.

## Verified results

### Production read-only

- Backend health: `d3c3a34`, DB connected, odds/results healthy.
- Ticket grading: ON; host settlement recording: OFF.
- Browser ticket and ledger mirror writes: OFF.
- `/api/sports`: 20 live and 1,368 upcoming events at sample time.
- NCAAB, Boxing, and Rugby odds: empty.
- NASCAR: outright/futures inventory only; frontend suppression is correct.
- Golf value-bets: `502 owls_ev_http_error` with an empty list; Golf splits and
  ordinary odds remained available.
- No production A/B memberships, wagers, or balances were changed.

### Automated authorization and financial integrity

- Existing backend authz/IDOR: 9/9.
- Existing backend red-team authz: 18/18.
- Existing multi-club isolation: 8/8.
- New two-player/two-club matrix: 44/44 on
  `cursor/beta-test-hardening` (`8ae1dfd`). It covers place/read/cancel/grade,
  dashboard, Recent Bets, Results, Host Bets, props context, spoofing,
  nonexistent clubs, missing memberships, no mutation, no leakage, and no
  phantom `$1000`.
- Local place → won/lost/push/cancel lifecycle: 46/46.
- Correlation and unsupported same-event relationships fail closed; SGP remains
  off.
- Host settlement recording remains off; no settlement write occurred.

### Product and UX

- Unsupported sport UX: 7/7; empty markets are clean, unsafe/futures boards are
  suppressed, and no fake odds are generated.
- Bet placement/idempotency/fail-closed suites: 37/37, 25/25, and 19/19.
- Phantom ledger/balance fail-closed: 15/15 and 10/10.
- Premium props/progressive disclosure/identity: 20/20, 7/7, and 9/9 on main.
- 700+ props boundary: 11/11 on `cursor/beta-props-stress` (`d025d6e`).
- Accessibility: 5/5 modal/odds and 5/5 props/image checks.
- Dev Join Requests: 5/5 source/fixture checks. Approve/decline was not run
  live because it would mutate membership.
- Observability primitives: 27/27; public grade diagnostics still require the
  P0 redaction above. Preview query flags themselves remain localhost-gated,
  but the production token-mint route is not.

### Survivor

- Owner-review branch rebased mechanically onto `066a511`; SHA `ffc4ec8`.
- Build and regressions pass: Survivor 6/6, mobile 11/11, auth 25/25, authz
  19/19, lobby routing 14/14, open-beta lobby 7/7.
- Preview:
  `https://pocketbooks-sports-adb463sxd-tonygeno26-coders-projects.vercel.app/survivor.html`
  (Vercel build reports `ffc4ec8`; deployment protection remains enabled).
- Not merged. Owner visual review and ambiguous rule decisions remain required.

## Owner-controlled live test plans

### Cross-club A/B

Select two clearly test-only active members in different clubs with no real-user
contamination. Record IDs, starting balances, and active ticket sets read-only.
Use one current authoritative market and the configured minimum stake.

1. Snapshot A/B memberships, balances, and tickets.
2. A→A and B→B place requests should succeed once with unique idempotency keys.
3. A→B and B→A identical requests should return 403/404 and create no ticket,
   ledger row, or balance delta.
4. Repeat cross-ticket read/cancel and dashboard requests in both directions.
5. Verify no information leakage, no phantom membership fallback, and unchanged
   foreign balances/tickets.
6. Cancel/grade cleanup requires separate explicit owner authorization.

### Place → grade → Results

Use one clearly designated test account and club. Snapshot bankroll/tickets,
place one minimum-stake single on an authoritative market, verify ACTIVE and one
debit, grade through the normal authoritative mechanism after a deterministic
result, then verify exactly one terminal result, one grade ledger effect,
authoritative bankroll, Recent Bets, and Results. Retry the same idempotency key
to prove no duplicate. Keep host settlement recording off throughout.

## Next actions

1. Review both token-mint fixes, then merge/deploy together. Verify bearerless,
   forged-subject, and invalid-signature token requests fail before role lookup.
2. Verify public grade status contains no grade rows, ticket IDs, player IDs,
   or payloads after deploying backend `845f908`.
3. Approve uncontaminated A/B contexts and run the controlled cross-club test.
4. Approve one designated account and run place → grade → Results.
5. Review `cursor/beta-test-hardening` and adopt the separated test commands.
6. Resolve migration numbering through owner-reviewed, no-apply repository
   hygiene; keep unsupported sports fail closed.
