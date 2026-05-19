-- Migration 002: Add weekly rollover tables
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS weekly_rollovers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          TEXT NOT NULL,
  rollover_week    TEXT NOT NULL,
  performed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  performed_by     TEXT,
  totals_snapshot  JSONB,
  players_count    INTEGER DEFAULT 0,
  UNIQUE(club_id, rollover_week)
);

CREATE TABLE IF NOT EXISTS weekly_player_snapshots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rollover_week        TEXT NOT NULL,
  club_id              TEXT NOT NULL,
  player_id            TEXT NOT NULL,
  username             TEXT,
  owes_host            NUMERIC(12,2) NOT NULL DEFAULT 0,
  host_owes            NUMERIC(12,2) NOT NULL DEFAULT 0,
  open_risk            NUMERIC(12,2) NOT NULL DEFAULT 0,
  settled_net          NUMERIC(12,2) NOT NULL DEFAULT 0,
  active_ticket_count  INTEGER DEFAULT 0,
  snapshotted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(club_id, rollover_week, player_id)
);

CREATE INDEX IF NOT EXISTS idx_rollovers_club   ON weekly_rollovers(club_id, rollover_week DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_week   ON weekly_player_snapshots(club_id, rollover_week);
CREATE INDEX IF NOT EXISTS idx_snapshots_player ON weekly_player_snapshots(player_id);
