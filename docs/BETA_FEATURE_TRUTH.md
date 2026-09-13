# PocketBooks Beta Feature Truth

**Audited:** 2026-09-13  
**Frontend baseline:** `b57b52b8618f3bb6cc25eff078f70f52add83318`  
**Backend baseline:** `00bc0cede9bec6e7100c3ad8973e926e255d10bb`

This is the public-beta truth source. It distinguishes what is live from what is
only present in code, preview-only, incomplete, or intentionally disabled.

## Live and supported

- Public signup and sign-in
- Public player betting beta
- Private club membership and host/player role routing
- Singles, parlays, teasers, and round-robin placement through server-authoritative paths
- Ticket grading (environment-controlled; currently reported ON by the release state)
- Bankroll accounting
- Premium player props with curated discovery and stable selection identity
- Host bets and player management
- Player notifications
- NFL Survivor pools: create, request access, approve/deny, per-entry weekly picks,
  standings, hidden pre-deadline picks, and runner grading

## Live with bounded or partial coverage

- Live score overlays: strongest for major US leagues; soccer and tennis are
  identity-matched and fail closed when uncertain.
- Sports feeds: NFL, MLB, NBA, NHL, NCAAF, soccer, tennis, golf, and MMA have
  usable current inventory. NCAAB is seasonal. Boxing is empty. Rugby inventory
  is thin and lacks a safe score/grading path. NASCAR currently exposes futures,
  which the frontend suppresses rather than presenting as gradeable matchups.
- Images: verified mappings render images. Unknown or ambiguous entities render
  text-only fallbacks. Current live-map gaps are concentrated in soccer, rugby,
  NFL/MLB props, golf, tennis, and NASCAR futures.
- Survivor uses ESPN schedule fallback when the odds cache is empty. Server
  authorization remains authoritative for all pool mutations.

## Explicitly off

- Same-game parlay pricing: **OFF**. Correlated same-event combinations fail
  closed; no synthetic correlation multiplier is used.
- Host settlement recording: **OFF**. No settlement bootstrap, migration, or
  activation was performed in this audit.
- Automatic settlement closeout / payout: **OFF**.

## Preview or owner-review only

- Survivor premium visual pass:
  `cursor/survivor-premium-visual` (`a95df8010da71dffc71c82ba0e08b245c16a3791`).
  It is not merged to `main`.
- Major visual redesigns remain owner-review work and are not beta truth until merged.

## Not claimed

- Guaranteed logo/headshot coverage for every live entity
- Gradeable boxing, rugby, or NASCAR wagering
- SGP pricing
- Production settlement
- A completed live cross-club financial mutation test during this audit
- A real-money end-to-end wager placed by the overnight worker

## Safety invariants

- Client state is not authoritative for bankroll, tickets, club scope, grading,
  or settlement.
- Unknown image identity falls back to text.
- Unsupported correlation and unsupported grading identity fail closed.
- Settlement remains independently gated from ticket grading.
