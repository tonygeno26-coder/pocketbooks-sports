-- Migration 012: Settlement periods + immutable snapshots (Phase N)

CREATE TABLE IF NOT EXISTS settlement_periods (
  period_id    TEXT PRIMARY KEY,
  club_id      TEXT NOT NULL,
  week_start   DATE NOT NULL,
  week_end     DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','closing','closed','reopened')),
  revision     INTEGER NOT NULL DEFAULT 0,
  closed_at    TIMESTAMPTZ,
  closed_by    TEXT,
  reopened_at  TIMESTAMPTZ,
  reopened_by  TEXT,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, week_start)
);

CREATE INDEX IF NOT EXISTS settlement_periods_club
  ON settlement_periods(club_id, week_start DESC);

-- Immutable per-player snapshots (one set per period per close action)
CREATE TABLE IF NOT EXISTS settlement_snapshots (
  id                    BIGSERIAL PRIMARY KEY,
  period_id             TEXT NOT NULL REFERENCES settlement_periods(period_id),
  revision              INTEGER NOT NULL DEFAULT 0,
  club_id               TEXT NOT NULL,
  player_id             TEXT NOT NULL,
  starting_limit        NUMERIC(12,2) NOT NULL DEFAULT 1000,
  ledger_credits        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ledger_debits         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ledger_balance        NUMERIC(12,2) NOT NULL,
  open_risk             NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_result            NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_balance         NUMERIC(12,2) NOT NULL,
  amount_owed_by_player NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_owed_to_player NUMERIC(12,2) NOT NULL DEFAULT 0,
  ticket_count          INTEGER NOT NULL DEFAULT 0,
  closed_ticket_count   INTEGER NOT NULL DEFAULT 0,
  open_ticket_count     INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast period+player lookup
CREATE INDEX IF NOT EXISTS settlement_snapshots_period
  ON settlement_snapshots(period_id, revision, player_id);

-- Trigger: prevent UPDATE on settlement_snapshots (immutable rows)
CREATE OR REPLACE FUNCTION _settlement_snapshot_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'settlement_snapshots are immutable — insert only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settlement_snapshots_no_update
  BEFORE UPDATE ON settlement_snapshots
  FOR EACH ROW EXECUTE FUNCTION _settlement_snapshot_immutable();

-- Helper: ensure current period exists for a club+week
CREATE OR REPLACE FUNCTION _pb_ensure_period(p_club_id TEXT, p_week_start DATE)
RETURNS TEXT AS $$
DECLARE
  v_id TEXT;
BEGIN
  SELECT period_id INTO v_id FROM settlement_periods
  WHERE club_id=p_club_id AND week_start=p_week_start LIMIT 1;
  IF NOT FOUND THEN
    v_id := 'SP_'||p_club_id||'_'||p_week_start;
    INSERT INTO settlement_periods(period_id,club_id,week_start,week_end)
    VALUES(v_id, p_club_id, p_week_start, p_week_start + INTERVAL '6 days')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
