-- Migration 009: Risk limits + exposure engine (Phase J)

-- Extend player_limits table with full limit set
ALTER TABLE player_limits
  ADD COLUMN IF NOT EXISTS max_single_bet     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS max_payout         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS max_open_risk      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS weekly_limit       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS allowed_sports     TEXT[],       -- null = all allowed
  ADD COLUMN IF NOT EXISTS blocked_sports     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_markets    TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suspended_until    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_reason      TEXT;

-- Club risk settings table
CREATE TABLE IF NOT EXISTS club_risk_settings (
  club_id               TEXT PRIMARY KEY,
  min_stake             NUMERIC(12,2) NOT NULL DEFAULT 1,
  max_stake             NUMERIC(12,2) NOT NULL DEFAULT 500,
  max_payout            NUMERIC(12,2) NOT NULL DEFAULT 5000,
  club_max_open_risk    NUMERIC(12,2),
  event_max_open_risk   NUMERIC(12,2),
  market_max_open_risk  NUMERIC(12,2),
  player_event_max_risk NUMERIC(12,2),
  max_parlay_legs       INTEGER NOT NULL DEFAULT 8,
  allow_live_betting    BOOLEAN NOT NULL DEFAULT true,
  allow_parlays         BOOLEAN NOT NULL DEFAULT true,
  allow_teasers         BOOLEAN NOT NULL DEFAULT true,
  allow_round_robins    BOOLEAN NOT NULL DEFAULT true,
  blocked_sports        TEXT[] DEFAULT '{}',
  blocked_markets       TEXT[] DEFAULT '{}',
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Exposure view: current open risk by player/event/market
CREATE OR REPLACE VIEW risk_exposure AS
SELECT
  t.club_id,
  t.player_id,
  tl.canonical_game_key,
  tl.sport,
  tl.market,
  COUNT(DISTINCT t.id)          AS open_tickets,
  SUM(t.risk_amount)            AS open_risk,
  SUM(t.estimated_payout)       AS potential_payout
FROM tickets t
JOIN ticket_legs tl ON tl.ticket_id = t.id
WHERE t.status IN ('active','open')
GROUP BY t.club_id, t.player_id, tl.canonical_game_key, tl.sport, tl.market;

-- Helper: validate risk limits for a bet (used inside place_bet_tx)
-- Returns NULL if ok, or a JSONB error object
CREATE OR REPLACE FUNCTION _pb_check_risk_limits(
  p_club_id        TEXT,
  p_player_id      TEXT,
  p_stake          NUMERIC,
  p_potential_payout NUMERIC,
  p_bet_type       TEXT,
  p_leg_count      INTEGER,
  p_sports         TEXT[],       -- array of sports in this bet
  p_markets        TEXT[],       -- array of markets in this bet
  p_canonical_keys TEXT[],       -- array of canonicalGameKey values
  p_is_live        BOOLEAN DEFAULT false
) RETURNS JSONB AS $$
DECLARE
  pl        RECORD;
  cs        RECORD;
  cur_risk  NUMERIC;
  ev_risk   NUMERIC;
  mk_risk   NUMERIC;
  club_risk NUMERIC;
  i         INTEGER;
  sport_val TEXT;
  market_val TEXT;
BEGIN
  -- Load player limits
  SELECT * INTO pl FROM player_limits
  WHERE club_id=p_club_id AND player_id=p_player_id LIMIT 1;

  -- Load club settings
  SELECT * INTO cs FROM club_risk_settings WHERE club_id=p_club_id LIMIT 1;

  -- Player suspended?
  IF FOUND AND pl.suspended_until IS NOT NULL AND NOW() < pl.suspended_until THEN
    RETURN jsonb_build_object('ok',false,'code','player_suspended',
      'suspendedUntil',pl.suspended_until);
  END IF;

  -- Stake bounds (club settings)
  IF FOUND AND cs.min_stake IS NOT NULL AND p_stake < cs.min_stake THEN
    RETURN jsonb_build_object('ok',false,'code','stake_below_min','min',cs.min_stake,'stake',p_stake);
  END IF;
  IF FOUND AND cs.max_stake IS NOT NULL AND p_stake > cs.max_stake THEN
    RETURN jsonb_build_object('ok',false,'code','stake_above_max','max',cs.max_stake,'stake',p_stake,'source','club_settings');
  END IF;

  -- Player single bet max
  IF FOUND AND pl.max_single_bet IS NOT NULL AND p_stake > pl.max_single_bet THEN
    RETURN jsonb_build_object('ok',false,'code','stake_above_max','max',pl.max_single_bet,'stake',p_stake,'source','player_limit');
  END IF;

  -- Payout cap
  IF FOUND THEN
    DECLARE
      eff_max_payout NUMERIC := LEAST(
        COALESCE(cs.max_payout, 999999),
        COALESCE(pl.max_payout, 999999)
      );
    BEGIN
      IF p_potential_payout > eff_max_payout THEN
        RETURN jsonb_build_object('ok',false,'code','payout_above_max','max',eff_max_payout,'payout',p_potential_payout);
      END IF;
    END;
  END IF;

  -- Bet type gates
  IF FOUND AND cs.allow_parlays IS NOT NULL THEN
    IF NOT cs.allow_parlays AND p_bet_type IN ('Parlay','RoundRobin') THEN
      RETURN jsonb_build_object('ok',false,'code','parlays_disabled');
    END IF;
    IF NOT cs.allow_teasers AND p_bet_type = 'Teaser' THEN
      RETURN jsonb_build_object('ok',false,'code','teasers_disabled');
    END IF;
    IF NOT cs.allow_round_robins AND p_bet_type = 'RoundRobin' THEN
      RETURN jsonb_build_object('ok',false,'code','round_robins_disabled');
    END IF;
    IF p_bet_type IN ('Parlay','RoundRobin') AND p_leg_count > cs.max_parlay_legs THEN
      RETURN jsonb_build_object('ok',false,'code','too_many_parlay_legs',
        'max',cs.max_parlay_legs,'legs',p_leg_count);
    END IF;
    IF NOT cs.allow_live_betting AND p_is_live THEN
      RETURN jsonb_build_object('ok',false,'code','live_betting_disabled');
    END IF;
  END IF;

  -- Sport / market blocks
  IF FOUND AND cs.blocked_sports IS NOT NULL THEN
    FOREACH sport_val IN ARRAY p_sports LOOP
      IF sport_val = ANY(cs.blocked_sports) THEN
        RETURN jsonb_build_object('ok',false,'code','sport_blocked','sport',sport_val,'source','club_settings');
      END IF;
    END LOOP;
  END IF;
  IF FOUND AND pl.blocked_sports IS NOT NULL THEN
    FOREACH sport_val IN ARRAY p_sports LOOP
      IF sport_val = ANY(pl.blocked_sports) THEN
        RETURN jsonb_build_object('ok',false,'code','sport_blocked','sport',sport_val,'source','player_limit');
      END IF;
    END LOOP;
  END IF;
  IF FOUND AND cs.blocked_markets IS NOT NULL THEN
    FOREACH market_val IN ARRAY p_markets LOOP
      IF market_val = ANY(cs.blocked_markets) THEN
        RETURN jsonb_build_object('ok',false,'code','market_blocked','market',market_val,'source','club_settings');
      END IF;
    END LOOP;
  END IF;

  -- Player open risk
  IF FOUND AND pl.max_open_risk IS NOT NULL THEN
    SELECT COALESCE(SUM(risk_amount),0) INTO cur_risk
    FROM tickets WHERE club_id=p_club_id AND player_id=p_player_id AND status IN ('active','open');
    IF cur_risk + p_stake > pl.max_open_risk THEN
      RETURN jsonb_build_object('ok',false,'code','player_open_risk_exceeded',
        'max',pl.max_open_risk,'current',cur_risk,'stake',p_stake);
    END IF;
  END IF;

  -- Club open risk
  IF FOUND AND cs.club_max_open_risk IS NOT NULL THEN
    SELECT COALESCE(SUM(risk_amount),0) INTO club_risk
    FROM tickets WHERE club_id=p_club_id AND status IN ('active','open');
    IF club_risk + p_stake > cs.club_max_open_risk THEN
      RETURN jsonb_build_object('ok',false,'code','club_open_risk_exceeded',
        'max',cs.club_max_open_risk,'current',club_risk,'stake',p_stake);
    END IF;
  END IF;

  -- Per-event / market exposure
  IF FOUND AND cs.event_max_open_risk IS NOT NULL AND p_canonical_keys IS NOT NULL THEN
    FOR i IN 1..array_length(p_canonical_keys,1) LOOP
      SELECT COALESCE(SUM(t.risk_amount),0) INTO ev_risk
      FROM tickets t JOIN ticket_legs tl ON tl.ticket_id=t.id
      WHERE t.club_id=p_club_id AND tl.canonical_game_key=p_canonical_keys[i]
        AND t.status IN ('active','open');
      IF ev_risk + p_stake > cs.event_max_open_risk THEN
        RETURN jsonb_build_object('ok',false,'code','event_risk_exceeded',
          'max',cs.event_max_open_risk,'current',ev_risk,'event',p_canonical_keys[i],'stake',p_stake);
      END IF;
    END LOOP;
  END IF;

  IF FOUND AND cs.market_max_open_risk IS NOT NULL THEN
    FOR i IN 1..array_length(p_markets,1) LOOP
      SELECT COALESCE(SUM(t.risk_amount),0) INTO mk_risk
      FROM tickets t JOIN ticket_legs tl ON tl.ticket_id=t.id
      WHERE t.club_id=p_club_id AND tl.market=p_markets[i]
        AND tl.canonical_game_key=p_canonical_keys[i]
        AND t.status IN ('active','open');
      IF mk_risk + p_stake > cs.market_max_open_risk THEN
        RETURN jsonb_build_object('ok',false,'code','market_risk_exceeded',
          'max',cs.market_max_open_risk,'current',mk_risk,'market',p_markets[i],'stake',p_stake);
      END IF;
    END LOOP;
  END IF;

  RETURN NULL; -- NULL = all checks passed
END;
$$ LANGUAGE plpgsql;

-- Patch place_bet_tx to call _pb_check_risk_limits
-- (adds risk check step before ticket INSERT)
CREATE OR REPLACE FUNCTION place_bet_tx(
  p_ticket_id        TEXT,
  p_club_id          TEXT,
  p_player_id        TEXT,
  p_player_username  TEXT,
  p_bet_type         TEXT,
  p_stake            NUMERIC,
  p_potential_profit NUMERIC,
  p_estimated_payout NUMERIC,
  p_idempotency_key  TEXT,
  p_created_by       TEXT DEFAULT NULL,
  -- New params for risk check
  p_leg_count        INTEGER DEFAULT 1,
  p_sports           TEXT[]  DEFAULT '{}',
  p_markets          TEXT[]  DEFAULT '{}',
  p_canonical_keys   TEXT[]  DEFAULT '{}',
  p_is_live          BOOLEAN DEFAULT false
) RETURNS JSONB AS $$
DECLARE
  v_starting     NUMERIC;
  v_ledger_bal   NUMERIC;
  v_open_risk    NUMERIC;
  v_available    NUMERIC;
  v_bal_after    NUMERIC;
  v_existing_key TEXT;
  v_risk_check   JSONB;
BEGIN
  -- Idempotency
  SELECT ledger_id INTO v_existing_key FROM ledger
  WHERE club_id=p_club_id AND idempotency_key=p_idempotency_key AND event_type='BET_PLACED' LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'idempotent',true,'ticket_id',p_ticket_id);
  END IF;

  -- Risk limits check (before balance lock)
  v_risk_check := _pb_check_risk_limits(
    p_club_id, p_player_id, p_stake, p_estimated_payout,
    p_bet_type, p_leg_count, p_sports, p_markets, p_canonical_keys, p_is_live
  );
  IF v_risk_check IS NOT NULL THEN RETURN v_risk_check; END IF;

  -- Balance
  SELECT COALESCE(balance_start,1000) INTO v_starting
  FROM player_limits WHERE club_id=p_club_id AND player_id=p_player_id LIMIT 1;
  IF NOT FOUND THEN v_starting := 1000; END IF;

  PERFORM 1 FROM player_limits WHERE club_id=p_club_id AND player_id=p_player_id FOR UPDATE;
  v_ledger_bal := _pb_ledger_balance(p_club_id, p_player_id, v_starting);
  v_open_risk  := _pb_open_risk(p_club_id, p_player_id);
  v_available  := v_ledger_bal - v_open_risk;
  IF p_stake > v_available + 0.005 THEN
    RETURN jsonb_build_object('ok',false,'error','insufficient_balance',
      'available',v_available,'stake',p_stake);
  END IF;

  -- Write ticket
  INSERT INTO tickets(id,club_id,player_id,player_username,type,status,
    risk_amount,potential_profit,estimated_payout,placed_at,mirrored_at)
  VALUES(p_ticket_id,p_club_id,p_player_id,p_player_username,p_bet_type,'active',
    p_stake,p_potential_profit,p_estimated_payout,NOW(),NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Write canonical ledger
  v_bal_after := ROUND(v_ledger_bal - p_stake, 2);
  INSERT INTO ledger(ledger_id,club_id,player_id,ticket_id,event_type,amount,currency,
    direction,balance_before,balance_after,idempotency_key,created_by,reason)
  VALUES('LE_PL_'||p_ticket_id, p_club_id, p_player_id, p_ticket_id, 'BET_PLACED',
    p_stake,'diamonds','debit', v_ledger_bal, v_bal_after, p_idempotency_key,
    COALESCE(p_created_by,p_player_id),'bet_placed:'||p_bet_type);

  RETURN jsonb_build_object('ok',true,'ticket_id',p_ticket_id,
    'balance_before',v_ledger_bal,'balance_after',v_bal_after);
END;
$$ LANGUAGE plpgsql;
