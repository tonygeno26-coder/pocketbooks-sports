-- Migration 003: Club staff permissions
-- Adds staff role to club_members, creates club_staff_permissions view
-- Run in Supabase SQL editor

-- Add staff_role column to club_members (preserves existing data)
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS staff_role TEXT
  DEFAULT 'view_only'
  CHECK (staff_role IN ('owner','full_admin','settlement_manager','risk_viewer','view_only'));

-- Index for fast permission lookups
CREATE INDEX IF NOT EXISTS idx_members_staff_role ON club_members(club_id, player_id, staff_role);

-- club_staff_tokens table: API tokens for cohost/staff access
CREATE TABLE IF NOT EXISTS club_staff_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  staff_role   TEXT NOT NULL
               CHECK (staff_role IN ('owner','full_admin','settlement_manager','risk_viewer','view_only')),
  token_hash   TEXT UNIQUE NOT NULL,  -- bcrypt hash of the token
  label        TEXT,                  -- e.g. "John's iPad"
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked      BOOLEAN DEFAULT FALSE,
  UNIQUE(club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_tokens_club   ON club_staff_tokens(club_id);
CREATE INDEX IF NOT EXISTS idx_staff_tokens_hash   ON club_staff_tokens(token_hash) WHERE NOT revoked;
