-- Migration 025: persist read-only diamond audit run results (never auto-fix)
CREATE TABLE IF NOT EXISTS diamond_audit_runs (
  id              TEXT PRIMARY KEY,
  run_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_by          TEXT NOT NULL,
  summary_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  mismatch_count  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS diamond_audit_runs_run_at
  ON diamond_audit_runs(run_at DESC);

ALTER TABLE diamond_audit_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE diamond_audit_runs FROM anon, authenticated;
GRANT ALL ON TABLE diamond_audit_runs TO service_role;
