-- Migration 005: Sessions table for token revocation + rotation (Phase F)
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS sessions (
  jti              TEXT PRIMARY KEY,
  actor_id         TEXT NOT NULL,
  club_id          TEXT NOT NULL DEFAULT '',
  role             TEXT NOT NULL,
  platform_role    TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','revoked','expired')),
  issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ,
  revoke_reason    TEXT,
  last_seen_at     TIMESTAMPTZ,
  user_agent       TEXT,
  ip_hash          TEXT
);

CREATE INDEX IF NOT EXISTS sessions_actor_club
  ON sessions(actor_id, club_id, status);

CREATE INDEX IF NOT EXISTS sessions_expires_at
  ON sessions(expires_at);

-- Auto-expire: mark sessions past expires_at as expired
-- (run periodically or via pg_cron)
-- UPDATE sessions SET status='expired' WHERE expires_at < NOW() AND status='active';
