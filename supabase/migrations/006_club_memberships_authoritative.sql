-- Migration 006: Club memberships as authoritative role source (Phase G)
-- Run in Supabase SQL editor

-- Drop the old club_members table if exists and recreate with full schema
-- (club_members was Phase A schema; this replaces it as authoritative)

CREATE TABLE IF NOT EXISTS club_memberships (
  id              BIGSERIAL PRIMARY KEY,
  actor_id        TEXT NOT NULL,
  club_id         TEXT NOT NULL,
  role            TEXT NOT NULL
                    CHECK (role IN ('owner','full_admin','settlement_manager','risk_viewer','player','view_only')),
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','pending','suspended','removed')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      TEXT,
  limits_json     JSONB,
  permissions_json JSONB,
  UNIQUE (actor_id, club_id)
);

CREATE INDEX IF NOT EXISTS club_memberships_club_id ON club_memberships(club_id, status);
CREATE INDEX IF NOT EXISTS club_memberships_actor_id ON club_memberships(actor_id);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION _update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER club_memberships_updated_at
  BEFORE UPDATE ON club_memberships
  FOR EACH ROW EXECUTE FUNCTION _update_updated_at();
