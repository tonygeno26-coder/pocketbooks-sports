-- Migration 019: Host active-bettor diamond charging (Phase AA)

-- Host diamond balance per club
CREATE TABLE IF NOT EXISTS host_diamond_balances (
  club_id        TEXT PRIMARY KEY,
  host_actor_id  TEXT NOT NULL,
  balance_diamonds NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance_diamonds >= 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Weekly active bettors — one row per player per week per club
CREATE TABLE IF NOT EXISTS weekly_active_bettors (
  club_id          TEXT NOT NULL,
  player_id        TEXT NOT NULL,
  week_start       DATE NOT NULL,          -- Monday of the billing week (YYYY-MM-DD)
  first_ticket_id  TEXT,
  activated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  charged_diamonds NUMERIC(6,2) NOT NULL DEFAULT 15,
  charge_ledger_id TEXT,
  PRIMARY KEY (club_id, player_id, week_start)
);

CREATE INDEX IF NOT EXISTS wab_club_week
  ON weekly_active_bettors(club_id, week_start);
