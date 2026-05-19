-- Migration 010: Odds snapshots + stale line protection (Phase K)

CREATE TABLE IF NOT EXISTS odds_snapshots (
  snapshot_id       TEXT PRIMARY KEY,
  club_id           TEXT,
  sport             TEXT NOT NULL,
  event_id          TEXT,
  canonical_game_key TEXT NOT NULL,
  market_key        TEXT NOT NULL,
  selection_key     TEXT NOT NULL,
  odds_american     INTEGER NOT NULL,
  odds_decimal      NUMERIC(8,4) NOT NULL,
  point_line        NUMERIC(6,2),
  source            TEXT NOT NULL DEFAULT 'odds-api',
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  commence_time     TIMESTAMPTZ,
  suspended         BOOLEAN NOT NULL DEFAULT false,
  raw_json          JSONB,
  -- Unique: one snapshot per game+market+selection (upserted on each poll)
  UNIQUE (canonical_game_key, market_key, selection_key)
);

CREATE INDEX IF NOT EXISTS odds_snapshots_ckey
  ON odds_snapshots(canonical_game_key, market_key, selection_key);

CREATE INDEX IF NOT EXISTS odds_snapshots_expires
  ON odds_snapshots(expires_at);

-- Extend ticket_legs to store accepted odds snapshot
ALTER TABLE ticket_legs
  ADD COLUMN IF NOT EXISTS accepted_odds_american INTEGER,
  ADD COLUMN IF NOT EXISTS accepted_odds_decimal  NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS accepted_point_line    NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS odds_snapshot_id       TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at            TIMESTAMPTZ;

-- Extend club_risk_settings with oddsChangePolicy
ALTER TABLE club_risk_settings
  ADD COLUMN IF NOT EXISTS odds_change_policy TEXT NOT NULL DEFAULT 'reject'
    CHECK (odds_change_policy IN ('reject','accept_better','accept_any_with_confirm'));
