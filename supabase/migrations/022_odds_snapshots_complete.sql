-- Migration 022: odds_snapshots — complete column set
-- Covers every column _buildSnapshotRow() writes.
-- All ADD COLUMN IF NOT EXISTS — safe to re-run.
-- Run in Supabase SQL Editor, then POST /api/markets/refresh to reload cache.

-- ── Base table (in case migration 010 was never applied) ─────────────────────
CREATE TABLE IF NOT EXISTS odds_snapshots (
  snapshot_id       TEXT PRIMARY KEY,
  sport             TEXT NOT NULL DEFAULT 'unknown',
  canonical_game_key TEXT NOT NULL,
  market_key        TEXT NOT NULL,
  selection_key     TEXT NOT NULL,
  odds_american     INTEGER NOT NULL DEFAULT 0,
  odds_decimal      NUMERIC(10,4) NOT NULL DEFAULT 1.0,
  point_line        NUMERIC(6,2),
  source            TEXT NOT NULL DEFAULT 'odds-api',
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Phase K columns (from migration 010) ─────────────────────────────────────
ALTER TABLE odds_snapshots
  ADD COLUMN IF NOT EXISTS event_id          TEXT,
  ADD COLUMN IF NOT EXISTS commence_time     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended         BOOLEAN NOT NULL DEFAULT false;

-- ── Canonical identity columns (priority #11 / migration auto-DDL) ───────────
ALTER TABLE odds_snapshots
  ADD COLUMN IF NOT EXISTS canonical_market_key     TEXT,
  ADD COLUMN IF NOT EXISTS canonical_selection_key  TEXT,
  ADD COLUMN IF NOT EXISTS market_type              TEXT;

-- ── Provider + event-state columns ───────────────────────────────────────────
ALTER TABLE odds_snapshots
  ADD COLUMN IF NOT EXISTS provider_game_id  TEXT,
  ADD COLUMN IF NOT EXISTS event_status      TEXT,
  ADD COLUMN IF NOT EXISTS market_status     TEXT,
  ADD COLUMN IF NOT EXISTS event_completed   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_canceled    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_live        BOOLEAN NOT NULL DEFAULT false;

-- ── Player-prop columns (set only when market_type = 'player_prop') ───────────
ALTER TABLE odds_snapshots
  ADD COLUMN IF NOT EXISTS player_name            TEXT,
  ADD COLUMN IF NOT EXISTS player_name_normalized TEXT,
  ADD COLUMN IF NOT EXISTS prop_type              TEXT,
  ADD COLUMN IF NOT EXISTS prop_type_normalized   TEXT,
  ADD COLUMN IF NOT EXISTS prop_side              TEXT,
  ADD COLUMN IF NOT EXISTS player_team            TEXT;

-- ── Unique constraint for upsert conflict target ──────────────────────────────
-- The upsert uses onConflict:'canonical_game_key,market_key,selection_key'
-- This constraint MUST exist or the upsert will error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'odds_snapshots_ckey_mkey_skey_unique'
  ) THEN
    ALTER TABLE odds_snapshots
      ADD CONSTRAINT odds_snapshots_ckey_mkey_skey_unique
      UNIQUE (canonical_game_key, market_key, selection_key);
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_ckey
  ON odds_snapshots(canonical_game_key, market_key, selection_key);

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_canonical
  ON odds_snapshots(canonical_market_key, canonical_selection_key);

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_expires
  ON odds_snapshots(expires_at);

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_sport
  ON odds_snapshots(sport);

-- ── PostgREST schema cache reload ────────────────────────────────────────────
-- Run this after executing the migration to pick up new columns immediately:
--   NOTIFY pgrst, 'reload schema';
-- Or via Supabase dashboard: Settings → API → Reload Schema
