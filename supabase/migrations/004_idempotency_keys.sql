-- Migration 004: Idempotency keys table for replay protection
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key  TEXT PRIMARY KEY,
  actor_id         TEXT NOT NULL,
  club_id          TEXT NOT NULL DEFAULT '',
  endpoint         TEXT NOT NULL,
  request_hash     TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','completed','failed')),
  response_status  INTEGER,
  response_body    JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ NOT NULL
);

-- Index for TTL cleanup job
CREATE INDEX IF NOT EXISTS idempotency_keys_expires_at
  ON idempotency_keys(expires_at);

-- Index for actor lookups (audit)
CREATE INDEX IF NOT EXISTS idempotency_keys_actor_id
  ON idempotency_keys(actor_id);

-- Auto-delete expired keys (pg_cron or manual batch)
-- DELETE FROM idempotency_keys WHERE expires_at < NOW();
