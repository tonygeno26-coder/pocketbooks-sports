-- Pocketbooks Sports — club_memberships seed template
-- Replace fake IDs with your real actor_id and club_id values.
-- Run in Supabase → SQL Editor AFTER migration 006 has been applied.
--
-- Role hierarchy:
--   owner (5) > full_admin (4) > settlement_manager (3) > risk_viewer (2) > player (1) > view_only (0)
--
-- Every actor who needs to log in must have a row here for their club.
-- Tokens are issued based on this table only — client role claims are ignored.

-- ── EXAMPLE CLUB ─────────────────────────────────────────────────────────────
-- Replace 'demo-club-001' with your actual club ID.
-- Replace actor IDs with your actual player/host IDs.

-- Owner (club creator, rank 5 — full control including role changes)
INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('host_owner_001', 'demo-club-001', 'owner', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

-- Full admin (rank 4 — can grade, close weeks, manage members, confirm crypto)
INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('host_admin_001', 'demo-club-001', 'full_admin', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

-- Settlement manager (rank 3 — can close weeks, record payments, view reconciliation)
INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('staff_settle_001', 'demo-club-001', 'settlement_manager', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

-- Risk viewer (rank 2 — read-only: exposure, risk settings, markets status)
INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('staff_risk_001', 'demo-club-001', 'risk_viewer', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

-- Players (rank 1 — can place bets, submit crypto hashes, view own history)
INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('player_001', 'demo-club-001', 'player', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('player_002', 'demo-club-001', 'player', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('player_003', 'demo-club-001', 'player', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

-- View only (rank 0 — read-only spectator, no betting)
INSERT INTO club_memberships (actor_id, club_id, role, status)
VALUES ('spectator_001', 'demo-club-001', 'view_only', 'active')
ON CONFLICT (actor_id, club_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

-- ── VERIFICATION QUERY ────────────────────────────────────────────────────────
-- Run this after seeding to confirm rows were inserted correctly:
--
-- SELECT actor_id, club_id, role, status
-- FROM club_memberships
-- WHERE club_id = 'demo-club-001'
-- ORDER BY
--   CASE role
--     WHEN 'owner'              THEN 5
--     WHEN 'full_admin'         THEN 4
--     WHEN 'settlement_manager' THEN 3
--     WHEN 'risk_viewer'        THEN 2
--     WHEN 'player'             THEN 1
--     WHEN 'view_only'          THEN 0
--   END DESC;

-- ── SUSPEND A PLAYER ─────────────────────────────────────────────────────────
-- To suspend a player (blocks token issuance, invalidates existing sessions):
--
-- UPDATE club_memberships
-- SET status = 'suspended'
-- WHERE actor_id = 'player_001' AND club_id = 'demo-club-001';

-- ── REMOVE A MEMBER ──────────────────────────────────────────────────────────
-- To remove a member (use 'removed' status, do not DELETE — preserves audit trail):
--
-- UPDATE club_memberships
-- SET status = 'removed'
-- WHERE actor_id = 'player_003' AND club_id = 'demo-club-001';
