-- Migration 013: Settlement payments + receipts (Phase O)

CREATE TABLE IF NOT EXISTS settlement_payments (
  payment_id    TEXT PRIMARY KEY,
  period_id     TEXT NOT NULL REFERENCES settlement_periods(period_id),
  revision      INTEGER NOT NULL DEFAULT 0,
  club_id       TEXT NOT NULL,
  player_id     TEXT NOT NULL,
  direction     TEXT NOT NULL CHECK (direction IN ('player_paid_host','host_paid_player')),
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method        TEXT NOT NULL DEFAULT 'cash'
                  CHECK (method IN ('cash','zelle','venmo','cashapp','crypto','other')),
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','voided')),
  note          TEXT,
  receipt_url   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    TEXT,
  confirmed_at  TIMESTAMPTZ,
  confirmed_by  TEXT,
  voided_at     TIMESTAMPTZ,
  voided_by     TEXT,
  void_reason   TEXT,
  ledger_written BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS settlement_payments_period_player
  ON settlement_payments(period_id, player_id, status);

-- Trigger: payments cannot be DELETEd (audit trail preservation)
CREATE OR REPLACE FUNCTION _settlement_payment_no_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'settlement_payments cannot be deleted — use void status instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settlement_payments_no_delete
  BEFORE DELETE ON settlement_payments
  FOR EACH ROW EXECUTE FUNCTION _settlement_payment_no_delete();
