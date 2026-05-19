-- Migration 014: Background job queue (Phase S)

CREATE TABLE IF NOT EXISTS jobs (
  job_id          TEXT PRIMARY KEY,
  type            TEXT NOT NULL
                    CHECK (type IN ('odds_refresh','result_refresh','grade_run',
                                    'settlement_close_check','payment_reconciliation')),
  club_id         TEXT,
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','succeeded','failed','dead')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  run_after       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at       TIMESTAMPTZ,
  locked_by       TEXT,
  last_error      TEXT,
  payload_json    JSONB NOT NULL DEFAULT '{}',
  idempotency_key TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key) -- null values don't violate this
);

CREATE INDEX IF NOT EXISTS jobs_claimable
  ON jobs(status, run_after)
  WHERE status='queued' AND locked_at IS NULL;

CREATE INDEX IF NOT EXISTS jobs_type_status
  ON jobs(type, status, updated_at DESC);

-- Partial unique index: one active job per idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS jobs_idem_active
  ON jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status IN ('queued','running');
