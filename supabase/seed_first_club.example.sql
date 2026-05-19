-- Pocketbooks Sports — First Club Full Seed Template
-- Run in Supabase → SQL Editor AFTER all migrations 001–018 are applied.
--
-- BEFORE RUNNING:
--   Replace every placeholder below with your real values:
--   - 'your-club-id-001'    → your actual club ID (e.g. 'pb-club-vegas-01')
--   - 'owner_actor_001'     → the owner's actorId (e.g. their user UUID or a custom ID)
--   - 'admin_actor_001'     → full_admin actorId
--   - 'settle_actor_001'    → settlement manager actorId
--   - 'risk_actor_001'      → risk viewer actorId
--   - 'player_actor_001'    → first player actorId
--   - 'player_actor_002'    → second player actorId
--
-- All inserts use ON CONFLICT DO UPDATE — safe to re-run.

-- ── CLUB MEMBERSHIPS ─────────────────────────────────────────────────────────

-- Owner (rank 5 — full control, role changes, settlement, crypto confirm)
INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('owner_actor_001', 'your-club-id-001', 'owner', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE
  SET role = EXCLUDED.role, status = EXCLUDED.status;

-- Full admin (rank 4 — grade, manage members, close weeks, confirm crypto)
INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('admin_actor_001', 'your-club-id-001', 'full_admin', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE
  SET role = EXCLUDED.role, status = EXCLUDED.status;

-- Settlement manager (rank 3 — close weeks, record payments, view reconciliation)
INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('settle_actor_001', 'your-club-id-001', 'settlement_manager', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE
  SET role = EXCLUDED.role, status = EXCLUDED.status;

-- Risk viewer (rank 2 — read-only: exposure, markets status, risk settings)
INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('risk_actor_001', 'your-club-id-001', 'risk_viewer', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE
  SET role = EXCLUDED.role, status = EXCLUDED.status;

-- Players (rank 1 — place bets, submit crypto tx hashes, view own history)
INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('player_actor_001', 'your-club-id-001', 'player', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE
  SET role = EXCLUDED.role, status = EXCLUDED.status;

INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('player_actor_002', 'your-club-id-001', 'player', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE
  SET role = EXCLUDED.role, status = EXCLUDED.status;

-- ── CLUB RISK SETTINGS ────────────────────────────────────────────────────────
-- Conservative defaults. Adjust after launch.
-- All money values are in diamonds (virtual currency).

INSERT INTO club_risk_settings (
  club_id,
  max_stake_per_bet,
  max_payout_per_bet,
  max_parlay_legs,
  allow_live_betting,
  blocked_sports,
  created_at,
  updated_at
)
VALUES (
  'your-club-id-001',
  500,         -- max stake per bet (diamonds)
  5000,        -- max payout per bet (diamonds)
  4,           -- max parlay legs
  false,       -- live betting disabled by default
  '[]',        -- no sports blocked (JSON array of sport keys)
  NOW(),
  NOW()
)
ON CONFLICT (club_id) DO UPDATE
  SET
    max_stake_per_bet  = EXCLUDED.max_stake_per_bet,
    max_payout_per_bet = EXCLUDED.max_payout_per_bet,
    max_parlay_legs    = EXCLUDED.max_parlay_legs,
    allow_live_betting = EXCLUDED.allow_live_betting,
    blocked_sports     = EXCLUDED.blocked_sports,
    updated_at         = NOW();

-- ── PLAYER LIMITS ────────────────────────────────────────────────────────────
-- Per-player overrides. Set conservative starting limits.
-- Adjust per player as trust is established.

INSERT INTO player_limits (
  actor_id,
  club_id,
  max_stake_per_bet,
  max_open_bets,
  suspended,
  created_at,
  updated_at
)
VALUES (
  'player_actor_001',
  'your-club-id-001',
  200,     -- this player's max stake (diamonds, overrides club default if lower)
  10,      -- max open/active bets at once
  false,
  NOW(),
  NOW()
)
ON CONFLICT (actor_id, club_id) DO UPDATE
  SET
    max_stake_per_bet = EXCLUDED.max_stake_per_bet,
    max_open_bets     = EXCLUDED.max_open_bets,
    suspended         = EXCLUDED.suspended,
    updated_at        = NOW();

INSERT INTO player_limits (
  actor_id,
  club_id,
  max_stake_per_bet,
  max_open_bets,
  suspended,
  created_at,
  updated_at
)
VALUES (
  'player_actor_002',
  'your-club-id-001',
  200,
  10,
  false,
  NOW(),
  NOW()
)
ON CONFLICT (actor_id, club_id) DO UPDATE
  SET
    max_stake_per_bet = EXCLUDED.max_stake_per_bet,
    max_open_bets     = EXCLUDED.max_open_bets,
    suspended         = EXCLUDED.suspended,
    updated_at        = NOW();

-- ── VERIFICATION QUERIES ─────────────────────────────────────────────────────
-- Run these after seeding to confirm everything looks right.

-- 1. Check all members and their roles:
-- SELECT actor_id, club_id, role, status
-- FROM club_memberships
-- WHERE club_id = 'your-club-id-001'
-- ORDER BY
--   CASE role
--     WHEN 'owner'              THEN 5
--     WHEN 'full_admin'         THEN 4
--     WHEN 'settlement_manager' THEN 3
--     WHEN 'risk_viewer'        THEN 2
--     WHEN 'player'             THEN 1
--     WHEN 'view_only'          THEN 0
--   END DESC;

-- 2. Check club risk settings:
-- SELECT * FROM club_risk_settings WHERE club_id = 'your-club-id-001';

-- 3. Check player limits:
-- SELECT * FROM player_limits WHERE club_id = 'your-club-id-001';

-- ── EMERGENCY: DISABLE ALL BETTING ───────────────────────────────────────────
-- If you need to halt all betting immediately, run this:
-- UPDATE club_risk_settings
-- SET max_stake_per_bet = 0, updated_at = NOW()
-- WHERE club_id = 'your-club-id-001';

-- ── EMERGENCY: SUSPEND A PLAYER ──────────────────────────────────────────────
-- UPDATE club_memberships
-- SET status = 'suspended'
-- WHERE actor_id = 'player_actor_001' AND club_id = 'your-club-id-001';

-- ── EMERGENCY: REVOKE ALL SESSIONS FOR CLUB ──────────────────────────────────
-- UPDATE sessions
-- SET status = 'revoked', revoked_at = NOW()
-- WHERE club_id = 'your-club-id-001' AND status = 'active';
