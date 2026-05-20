-- Migration 020: Host diamond ledger (Phase AB)

CREATE TABLE IF NOT EXISTS host_diamond_ledger (
  ledger_id        TEXT PRIMARY KEY,
  club_id          TEXT NOT NULL,
  host_actor_id    TEXT NOT NULL,
  event_type       TEXT NOT NULL CHECK (event_type IN (
                     'HOST_DIAMOND_TOPUP','HOST_ACTIVE_BETTOR_CHARGE',
                     'HOST_DIAMOND_ADJUSTMENT','HOST_DIAMOND_REFUND')),
  amount_diamonds  NUMERIC(12,2) NOT NULL CHECK (amount_diamonds > 0),
  direction        TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  balance_before   NUMERIC(12,2) NOT NULL,
  balance_after    NUMERIC(12,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       TEXT NOT NULL,
  reason           TEXT,
  idempotency_key  TEXT UNIQUE,
  metadata_json    JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS hdl_club_created
  ON host_diamond_ledger(club_id, created_at DESC);
