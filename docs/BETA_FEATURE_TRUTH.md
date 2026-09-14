# PocketBooks Beta Feature Truth

**Audited:** 2026-09-13
**Production frontend:** `066a511c05b2503c74b0b584eef1fa6f955ab9a2`
**Production backend:** `d3c3a34ad09104733308821783265a62e9aa631a`

This distinguishes production behavior from automated verification,
owner-review branches, and live-mutation gates.

## Live and supported

- Public signup/sign-in and bounded public player betting beta
- Private club membership with host/player role routing
- Server-authoritative singles, parlays, teasers, and round-robin placement
- Ticket grading and bankroll accounting
- Premium player props with curated discovery and stable selection identity
- Host bets, player management, and notifications
- NFL Survivor create/join/request/approve/pick/standings/runner workflows

## Live with bounded or partial coverage

- Scores are strongest for major US leagues; uncertain identity matching fails
  closed.
- Current read-only feed sample: NFL, MLB, NBA, NHL, NCAAF, Soccer, Tennis,
  Golf, and MMA have usable or bounded inventory. NCAAB and Boxing are empty.
  Rugby is empty and has no safe grading path. NASCAR inventory is unsupported
  outright/futures and is suppressed.
- Golf value-bets can return `502 owls_ev_http_error`; the UI must treat that as
  unavailable rather than invent value.
- Images render only verified mappings; unknown entities use text fallback.

## Explicitly off

- Same-game parlay pricing: **OFF**. Correlated or unknown same-event
  combinations fail closed.
- Host settlement recording: **OFF**.
- Automatic settlement closeout/payout: **OFF**.
- Browser ticket and ledger mirror writes: **OFF**.

Ticket grading is not host settlement. Legacy health fields named
`settlementEnabled`, `workerSettlementEnabled`, and `manualSettlementEnabled`
are aliases for ticket grading; `hostSettlementRecordingEnabled` is the
authoritative host-settlement flag.

## Automated verified

- Backend two-player/two-club attack matrix: 44/44 on
  `cursor/beta-test-hardening` at `8ae1dfd`.
- Existing backend authz/IDOR, multi-club, and red-team gates pass.
- Local place → ACTIVE → WON/LOST/PUSH and authoritative balance model passes.
- Fail-closed odds, idempotency, phantom-ledger, unsupported-sport, props,
  accessibility, auth, and mobile suites pass in the scoped runs documented in
  `BETA_READINESS_REPORT.md`.

## Production read-only verified

- Backend production SHA is `d3c3a34`; DB, odds, and result health report good.
- Ticket grading is on; host settlement recording is off.
- NCAAB, Boxing, and Rugby are empty; NASCAR is futures-only.
- Historical designated identities exist in frontend preview configuration:
  TestPlayer1 `2a3e6819-be2f-4df3-8112-54ce19d0929e`,
  TestRR `12bb68f1-bcca-4e63-8ae4-7065dbb19172`, and
  TestEdge `bc767309-6fc7-4585-9077-3de7b898df13`.
  Their suitability as uncontaminated cross-club A/B contexts is **not
  established** without owner-approved authenticated read-only inventory.

## Not yet live-mutation verified

- Two independent production A/B club contexts with allow/deny placement,
  cross-ticket, balance, and phantom-membership checks
- Exact current-SHA place → grade → Recent Bets → Results lifecycle
- Dev Join Request approve/decline after the `updated_at` fix

These remain owner-gated because they mutate memberships, tickets, grades, or
bankroll.

## Preview or owner-review only

- Survivor premium visual:
  `cursor/survivor-premium-visual` at `ffc4ec8`, rebased and unmerged.
  Preview:
  `https://pocketbooks-sports-adb463sxd-tonygeno26-coders-projects.vercel.app/survivor.html`
- Backend test-gate and cross-club matrix:
  `cursor/beta-test-hardening` at `8ae1dfd`
- 700+ props stress coverage:
  `cursor/beta-props-stress` at `d025d6e`
- Grade-status security redaction:
  `cursor/security-grade-status-redaction` at `845f908`
- Frontend bearerless token retry removal:
  `cursor/security-token-mint-client` (owner-review branch)

## Known release stop

Production `POST /api/auth/token` currently mints a club-scoped session from
`actorId` + `clubId` without proving possession of a valid login/session
credential. Production `GET /api/grade/status` also exposes recent cross-club
ticket/player identifiers and grade payloads without authentication. Backend
fixes are together on `cursor/security-grade-status-redaction`; the companion
frontend retry removal is separate. They are deliberately unmerged pending
owner security review.

## Safety invariants

- Client state is not authoritative for bankroll, tickets, club scope, grading,
  or settlement.
- Missing membership never creates a phantom bankroll.
- Unknown image identity falls back to text.
- Unsupported odds, correlation, and grading identity fail closed.
- Host settlement recording remains independently gated from ticket grading.
- Preview/dev mocks may run only in local development and must never authorize
  production financial or membership actions.
