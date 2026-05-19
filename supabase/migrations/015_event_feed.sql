-- Migration 015: Event feed table for polling bus (Phase T)

CREATE TABLE IF NOT EXISTS event_feed (
  event_id    TEXT PRIMARY KEY,
  club_id     TEXT,
  actor_id    TEXT,
  player_id   TEXT,
  type        TEXT NOT NULL
                CHECK (type IN (
                  'ticket_placed','ticket_canceled','ticket_graded',
                  'balance_changed','odds_refreshed','result_refreshed',
                  'settlement_closed','payment_confirmed','payment_voided',
                  'job_completed','job_failed','risk_limit_changed'
                )),
  payload_json JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_feed_club_time
  ON event_feed(club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS event_feed_player
  ON event_feed(player_id, created_at DESC)
  WHERE player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_feed_type
  ON event_feed(type, created_at DESC);

-- Retention: auto-delete events older than 7 days
-- (run via pg_cron or cleanup job)
-- DELETE FROM event_feed WHERE created_at < NOW() - INTERVAL '7 days';
