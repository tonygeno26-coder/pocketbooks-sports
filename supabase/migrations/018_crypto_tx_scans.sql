-- Migration 018: Crypto transaction scan records (Phase X)

CREATE TABLE IF NOT EXISTS crypto_tx_scans (
  scan_id             TEXT PRIMARY KEY,
  tx_hash             TEXT NOT NULL,
  network             TEXT NOT NULL,
  crypto_symbol       TEXT,
  status              TEXT NOT NULL
                        CHECK (status IN ('not_found','found_pending','found_confirmed','mismatch','scan_error')),
  confirmations       INTEGER NOT NULL DEFAULT 0,
  amount_crypto       NUMERIC(18,8),
  amount_usd_estimate NUMERIC(12,2),
  from_address        TEXT,
  to_address          TEXT,
  matched_intent_id   TEXT REFERENCES crypto_deposit_intents(intent_id),
  matched_player_id   TEXT,
  matched_club_id     TEXT,
  scanned_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_json            JSONB,
  error_message       TEXT
);

CREATE INDEX IF NOT EXISTS crypto_tx_scans_hash
  ON crypto_tx_scans(tx_hash, scanned_at DESC);
CREATE INDEX IF NOT EXISTS crypto_tx_scans_intent
  ON crypto_tx_scans(matched_intent_id)
  WHERE matched_intent_id IS NOT NULL;
