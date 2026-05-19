-- Migration 011: Result snapshots + trusted grading (Phase M)

CREATE TABLE IF NOT EXISTS result_snapshots (
  result_snapshot_id  TEXT PRIMARY KEY,
  sport               TEXT NOT NULL,
  event_id            TEXT,
  canonical_game_key  TEXT NOT NULL UNIQUE,
  home_team           TEXT,
  away_team           TEXT,
  commence_time       TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','live','final','postponed','canceled')),
  home_score          INTEGER,
  away_score          INTEGER,
  winner              TEXT CHECK (winner IN ('home','away','tie',NULL)),
  final_at            TIMESTAMPTZ,
  source              TEXT NOT NULL DEFAULT 'odds-api',
  fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_json            JSONB
);

CREATE INDEX IF NOT EXISTS result_snapshots_ckey
  ON result_snapshots(canonical_game_key);
CREATE INDEX IF NOT EXISTS result_snapshots_status
  ON result_snapshots(status, fetched_at DESC);

-- Manual grade override audit table
CREATE TABLE IF NOT EXISTS grade_overrides (
  id            BIGSERIAL PRIMARY KEY,
  ticket_id     TEXT NOT NULL,
  player_id     TEXT,
  club_id       TEXT,
  result        TEXT NOT NULL CHECK (result IN ('won','lost','push')),
  override_code TEXT NOT NULL,
  reason        TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  actor_role    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS grade_overrides_ticket ON grade_overrides(ticket_id);
