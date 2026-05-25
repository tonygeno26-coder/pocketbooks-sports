-- Migration 021: ticket_legs Phase K accepted-odds columns + canonical identity columns
-- Run AFTER 010_odds_snapshots.sql (which adds accepted_at etc. but may not have been applied).
-- All ADD COLUMN IF NOT EXISTS — safe to re-run.

-- Phase K: accepted odds snapshot fields (from migration 010; re-added here in case 010 wasn't run)
ALTER TABLE ticket_legs
  ADD COLUMN IF NOT EXISTS accepted_odds_american INTEGER,
  ADD COLUMN IF NOT EXISTS accepted_odds_decimal  NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS accepted_point_line    NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS odds_snapshot_id       TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at            TIMESTAMPTZ;

-- Canonical identity columns (priority #11 — leg grading + SGP identity)
ALTER TABLE ticket_legs
  ADD COLUMN IF NOT EXISTS market_type             TEXT,
  ADD COLUMN IF NOT EXISTS canonical_market_key    TEXT,
  ADD COLUMN IF NOT EXISTS canonical_selection_key TEXT,
  ADD COLUMN IF NOT EXISTS player_name_normalized  TEXT,
  ADD COLUMN IF NOT EXISTS prop_type_normalized    TEXT,
  ADD COLUMN IF NOT EXISTS prop_side               TEXT;

-- Index on canonical_game_key for grading lookups (if not already present)
CREATE INDEX IF NOT EXISTS ticket_legs_canonical_game_key
  ON ticket_legs(canonical_game_key);

-- Index on canonical_market_key for SGP conflict detection
CREATE INDEX IF NOT EXISTS ticket_legs_canonical_market_key
  ON ticket_legs(canonical_market_key)
  WHERE canonical_market_key IS NOT NULL;
