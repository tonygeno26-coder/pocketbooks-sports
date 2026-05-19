-- Migration 016: Risk/abuse signal alerts (Phase V)

CREATE TABLE IF NOT EXISTS risk_alerts (
  alert_id       TEXT PRIMARY KEY,
  club_id        TEXT NOT NULL,
  actor_id       TEXT,
  player_id      TEXT,
  type           TEXT NOT NULL
                   CHECK (type IN (
                     'rapid_bet_velocity','repeated_rate_limit','repeated_failed_auth',
                     'odds_change_rejections','stale_line_attempts','large_payout_attempt',
                     'over_limit_attempt','repeated_cancel_attempts',
                     'settlement_overpayment_attempt','manual_override_used'
                   )),
  severity       TEXT NOT NULL DEFAULT 'low'
                   CHECK (severity IN ('low','medium','high')),
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','acknowledged','dismissed')),
  count          INTEGER NOT NULL DEFAULT 1,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json  JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One open alert per (club, actor, type) — coalesce via UPDATE on existing
  UNIQUE (club_id, actor_id, type, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS risk_alerts_club_status
  ON risk_alerts(club_id, status, severity DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS risk_alerts_actor
  ON risk_alerts(actor_id, type, last_seen_at DESC)
  WHERE actor_id IS NOT NULL;
