-- Migration 007: Canonical ledger table for atomic balance tracking (Phase H)
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS ledger (
  ledger_id        TEXT PRIMARY KEY,
  club_id          TEXT NOT NULL,
  actor_id         TEXT,
  player_id        TEXT NOT NULL,
  ticket_id        TEXT,
  settlement_id    TEXT,
  event_type       TEXT NOT NULL
                     CHECK (event_type IN (
                       'BET_PLACED','BET_CANCELED_REFUND',
                       'BET_GRADED_WIN','BET_GRADED_LOSS','BET_GRADED_PUSH',
                       'SETTLEMENT_APPLIED','WEEKLY_ROLLOVER','BALANCE_ADJUSTMENT'
                     )),
  amount           NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency         TEXT NOT NULL DEFAULT 'diamonds',
  direction        TEXT NOT NULL CHECK (direction IN ('debit','credit','neutral')),
  balance_before   NUMERIC(12,2),
  balance_after    NUMERIC(12,2),
  idempotency_key  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       TEXT,
  reason           TEXT,
  metadata_json    JSONB,
  -- Idempotency: same club + key + eventType can only appear once
  UNIQUE (club_id, idempotency_key, event_type)
);

-- Partial index (only rows with idempotency_key set)
CREATE UNIQUE INDEX IF NOT EXISTS ledger_idem_unique
  ON ledger(club_id, idempotency_key, event_type)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ledger_player ON ledger(club_id, player_id, created_at);
CREATE INDEX IF NOT EXISTS ledger_ticket ON ledger(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ledger_settlement ON ledger(settlement_id) WHERE settlement_id IS NOT NULL;

-- Invariant check function: balanceAfter = balanceBefore ± amount
CREATE OR REPLACE FUNCTION check_ledger_invariant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.balance_before IS NOT NULL AND NEW.balance_after IS NOT NULL THEN
    IF NEW.direction = 'credit'  AND ABS(NEW.balance_after - NEW.balance_before - NEW.amount)  > 0.01 THEN
      RAISE EXCEPTION 'ledger invariant violated: credit row balance_after != before + amount';
    END IF;
    IF NEW.direction = 'debit'   AND ABS(NEW.balance_after - NEW.balance_before + NEW.amount)  > 0.01 THEN
      RAISE EXCEPTION 'ledger invariant violated: debit row balance_after != before - amount';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_invariant_check
  BEFORE INSERT OR UPDATE ON ledger
  FOR EACH ROW EXECUTE FUNCTION check_ledger_invariant();
