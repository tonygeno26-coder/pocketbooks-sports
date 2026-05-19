-- Migration 017: Crypto deposit intents + tx hash tracking (Phase W)

CREATE TABLE IF NOT EXISTS crypto_deposit_intents (
  intent_id              TEXT PRIMARY KEY,
  club_id                TEXT NOT NULL,
  player_id              TEXT NOT NULL,
  package_amount_diamonds NUMERIC(12,2) NOT NULL,
  expected_usd           NUMERIC(12,2) NOT NULL,
  crypto_symbol          TEXT NOT NULL CHECK (crypto_symbol IN ('USDT','USDC','ETH','BTC')),
  network                TEXT NOT NULL,
  assigned_wallet_address TEXT NOT NULL,
  qr_payload             TEXT,
  status                 TEXT NOT NULL DEFAULT 'created'
                           CHECK (status IN ('created','hash_submitted','pending_review',
                                             'confirmed','credited','rejected','expired')),
  tx_hash                TEXT,
  tx_hash_submitted_at   TIMESTAMPTZ,
  credited_at            TIMESTAMPTZ,
  credited_by            TEXT,
  reject_reason          TEXT,
  idempotency_key        TEXT,
  metadata_json          JSONB NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ NOT NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One pending intent per player at a time (only enforced in code, not DB — multiple coins allowed)
CREATE INDEX IF NOT EXISTS cdi_player_status
  ON crypto_deposit_intents(player_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS cdi_club_status
  ON crypto_deposit_intents(club_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS cdi_txhash_unique
  ON crypto_deposit_intents(tx_hash)
  WHERE tx_hash IS NOT NULL AND status NOT IN ('rejected','expired');
