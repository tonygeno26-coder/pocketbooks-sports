-- PocketBooks Sports — Supabase/PostgreSQL Schema
-- Phase A: passive mirror only. No app reads from this DB yet.
-- Run in Supabase SQL editor or via supabase db push.
-- All tables append-safe: migrations are additive only.

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'player'
                  CHECK (role IN ('player','host','admin')),
  email         TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ
);

-- ── clubs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clubs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id       UUID NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  code          TEXT UNIQUE NOT NULL,
  description   TEXT,
  max_bet       NUMERIC(12,2) DEFAULT 500,
  max_parlay    NUMERIC(12,2) DEFAULT 1000,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── club_members ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','suspended')),
  balance_start   NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
  credit_limit    NUMERIC(12,2) DEFAULT 0,
  approved_at     TIMESTAMPTZ,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  UNIQUE(club_id, player_id)
);

-- ── player_limits ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_limits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_bet         NUMERIC(12,2) DEFAULT 500,
  max_daily_risk  NUMERIC(12,2) DEFAULT 2000,
  max_payout      NUMERIC(12,2) DEFAULT 5000,
  sport_access    JSONB NOT NULL DEFAULT '{"mlb":true,"nba":true,"nhl":true,"nfl":true,"soccer":true,"ufl":true}',
  bet_types       JSONB NOT NULL DEFAULT '{"straight":true,"parlay":true,"teaser":false,"rr":false}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID REFERENCES users(id),
  UNIQUE(club_id, player_id)
);

-- ── tickets ───────────────────────────────────────────────────────────────────
-- Source of truth for every placed bet.
-- status transitions: active → won|lost|push|canceled
-- grading_snapshot is written once at grade time and never modified.
CREATE TABLE IF NOT EXISTS tickets (
  id                  TEXT PRIMARY KEY,   -- format: T_<timestamp>_<random>
  club_id             TEXT,               -- TEXT during Phase A (UUID in Phase B+)
  player_id           TEXT,               -- TEXT during Phase A
  player_username     TEXT,
  type                TEXT NOT NULL       -- 'Single'|'Parlay'|'RoundRobin'|'Teaser'
                        CHECK (type IN ('Single','Parlay','RoundRobin','Teaser')),
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','open','won','lost','push','canceled','voided')),
  risk_amount         NUMERIC(12,2) NOT NULL,
  potential_profit    NUMERIC(12,2) NOT NULL,
  estimated_payout    NUMERIC(12,2) NOT NULL,
  odds                TEXT,
  placed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  graded_at           TIMESTAMPTZ,
  grading_source      TEXT,
  final_score_text    TEXT,
  grading_snapshot    JSONB,              -- immutable once written
  canceled_at         TIMESTAMPTZ,
  canceled_by         TEXT,
  cancellation_reason TEXT,
  refund_amount       NUMERIC(12,2),
  raw_local           JSONB,              -- full localStorage ticket object (Phase A only)
  mirrored_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_player   ON tickets(player_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_club     ON tickets(club_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_placed   ON tickets(placed_at DESC);

-- ── ticket_legs ───────────────────────────────────────────────────────────────
-- One row per leg/selection per ticket.
-- canonical_game_key is the permanent game identity used for grading.
CREATE TABLE IF NOT EXISTS ticket_legs (
  id                  TEXT PRIMARY KEY,   -- format: LEG-<gameId>-<market>-<ts>
  ticket_id           TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  leg_index           SMALLINT NOT NULL,
  provider_name       TEXT DEFAULT 'odds-api',
  provider_game_id    TEXT,
  canonical_game_key  TEXT NOT NULL,
  sport               TEXT,
  home_team           TEXT,
  away_team           TEXT,
  scheduled_start     TIMESTAMPTZ,
  market              TEXT NOT NULL,
  pick                TEXT NOT NULL,
  odds                INTEGER,
  line                NUMERIC(6,1),
  side                TEXT,
  game_status         TEXT,
  leg_result          TEXT
                        CHECK (leg_result IN ('won','lost','push',NULL)),
  UNIQUE(ticket_id, leg_index)
);

CREATE INDEX IF NOT EXISTS idx_legs_ticket        ON ticket_legs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_legs_canonical_key ON ticket_legs(canonical_game_key);
CREATE INDEX IF NOT EXISTS idx_legs_scheduled     ON ticket_legs(scheduled_start);

-- ── ledger_entries ────────────────────────────────────────────────────────────
-- IMMUTABLE. Never UPDATE or DELETE rows. Append-only.
-- Balance = SUM(amount) per player+club. Positive = credit. Negative = debit.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id              TEXT PRIMARY KEY,
  club_id         TEXT,
  player_id       TEXT,              -- nullable: guest players may not have id yet
  ticket_id       TEXT,              -- no FK in Phase A (race condition: ledger arrives before ticket)
  type            TEXT NOT NULL
                    CHECK (type IN (
                      'bet_placed','bet_won','bet_lost','bet_push','bet_canceled',
                      'deposit','withdrawal','admin_adjustment',
                      'invalid_grade_reversal','future_grade_blocked_revert'
                    )),
  amount          NUMERIC(12,2) NOT NULL,
  balance_before  NUMERIC(12,2),
  balance_after   NUMERIC(12,2),
  reason          TEXT NOT NULL,
  final_score     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT                       -- user id or 'system'
);

CREATE INDEX IF NOT EXISTS idx_ledger_player  ON ledger_entries(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_ticket  ON ledger_entries(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ledger_club    ON ledger_entries(club_id, created_at DESC);

-- ── settlements ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         TEXT,
  player_id       TEXT NOT NULL,
  week_start      DATE NOT NULL,
  week_end        DATE NOT NULL,
  player_net      NUMERIC(12,2) NOT NULL,
  player_owes     NUMERIC(12,2) NOT NULL DEFAULT 0,
  host_owes       NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','settled','disputed')),
  settled_at      TIMESTAMPTZ,
  settled_by      TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(club_id, player_id, week_start)
);

-- ── cancel_requests ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cancel_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       TEXT NOT NULL REFERENCES tickets(id),
  requested_by    TEXT NOT NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','denied')),
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  reason          TEXT,
  denial_reason   TEXT
);

CREATE INDEX IF NOT EXISTS idx_cancel_ticket ON cancel_requests(ticket_id);

-- ── audit_events ──────────────────────────────────────────────────────────────
-- Append-only system log. Never modified after insert.
CREATE TABLE IF NOT EXISTS audit_events (
  id              BIGSERIAL PRIMARY KEY,
  event_type      TEXT NOT NULL,
  actor_id        TEXT,
  club_id         TEXT,
  ticket_id       TEXT,
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_ticket ON audit_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_club   ON audit_events(club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type   ON audit_events(event_type, created_at DESC);

-- ── Row Level Security (Phase D — not active yet) ──────────────────────────
-- Enable after JWT auth is wired:
-- ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY player_own_tickets ON tickets
--   FOR SELECT USING (player_id = auth.uid()::text);
-- CREATE POLICY ledger_no_delete ON ledger_entries
--   FOR DELETE USING (FALSE);  -- nobody can delete
-- CREATE POLICY ledger_no_update ON ledger_entries
--   FOR UPDATE USING (FALSE);  -- nobody can update
