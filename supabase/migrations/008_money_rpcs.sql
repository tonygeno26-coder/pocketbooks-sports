-- Migration 008: Transactional money RPCs (Phase I)
-- Run in Supabase SQL editor

-- ── Helpers ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _pb_ledger_direction(event_type TEXT)
RETURNS TEXT AS $$
BEGIN
  IF event_type IN ('BET_PLACED','SETTLEMENT_APPLIED') THEN RETURN 'debit'; END IF;
  IF event_type IN ('BET_CANCELED_REFUND','BET_GRADED_WIN','BET_GRADED_PUSH','BALANCE_ADJUSTMENT') THEN RETURN 'credit'; END IF;
  RETURN 'neutral';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Derive ledger balance for a player in a club
CREATE OR REPLACE FUNCTION _pb_ledger_balance(p_club_id TEXT, p_player_id TEXT, p_starting NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
  v_bal NUMERIC := p_starting;
BEGIN
  SELECT v_bal +
    COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN direction='debit'  THEN amount ELSE 0 END), 0)
  INTO v_bal
  FROM ledger
  WHERE club_id = p_club_id AND player_id = p_player_id;
  RETURN ROUND(v_bal, 2);
END;
$$ LANGUAGE plpgsql;

-- Open risk for a player
CREATE OR REPLACE FUNCTION _pb_open_risk(p_club_id TEXT, p_player_id TEXT)
RETURNS NUMERIC AS $$
DECLARE v_risk NUMERIC;
BEGIN
  SELECT COALESCE(SUM(risk_amount),0) INTO v_risk
  FROM tickets
  WHERE club_id=p_club_id AND player_id=p_player_id AND status IN ('active','open');
  RETURN ROUND(v_risk,2);
END;
$$ LANGUAGE plpgsql;

-- ── place_bet_tx ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION place_bet_tx(
  p_ticket_id      TEXT,
  p_club_id        TEXT,
  p_player_id      TEXT,
  p_player_username TEXT,
  p_bet_type       TEXT,
  p_stake          NUMERIC,
  p_potential_profit NUMERIC,
  p_estimated_payout NUMERIC,
  p_idempotency_key TEXT,
  p_created_by     TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_starting     NUMERIC;
  v_ledger_bal   NUMERIC;
  v_open_risk    NUMERIC;
  v_available    NUMERIC;
  v_bal_after    NUMERIC;
  v_existing_key TEXT;
BEGIN
  -- Idempotency: if ledger row with this key+event exists, return success
  SELECT ledger_id INTO v_existing_key FROM ledger
  WHERE club_id=p_club_id AND idempotency_key=p_idempotency_key AND event_type='BET_PLACED'
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'idempotent',true,'ticket_id',p_ticket_id);
  END IF;

  -- Get starting balance
  SELECT COALESCE(balance_start,1000) INTO v_starting
  FROM player_limits WHERE club_id=p_club_id AND player_id=p_player_id LIMIT 1;
  IF NOT FOUND THEN v_starting := 1000; END IF;

  -- Balance check (FOR UPDATE lock on player_limits)
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

  -- Write canonical ledger (BET_PLACED debit)
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

-- ── cancel_bet_tx ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_bet_tx(
  p_ticket_id      TEXT,
  p_club_id        TEXT,
  p_player_id      TEXT,
  p_idempotency_key TEXT,
  p_reason         TEXT DEFAULT 'player_request',
  p_created_by     TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_ticket       RECORD;
  v_starting     NUMERIC;
  v_ledger_bal   NUMERIC;
  v_bal_after    NUMERIC;
BEGIN
  -- Idempotency
  PERFORM 1 FROM ledger WHERE ticket_id=p_ticket_id AND event_type='BET_CANCELED_REFUND' LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'idempotent',true); END IF;

  -- Lock + load ticket
  SELECT * INTO v_ticket FROM tickets WHERE id=p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','ticket_not_found'); END IF;
  IF v_ticket.player_id <> p_player_id THEN
    RETURN jsonb_build_object('ok',false,'error','not_owner'); END IF;
  IF v_ticket.status NOT IN ('active','open') THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_transition:'||v_ticket.status||'→canceled'); END IF;

  -- Check game started (legs)
  PERFORM 1 FROM ticket_legs WHERE ticket_id=p_ticket_id AND scheduled_start <= NOW() LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('ok',false,'error','game_already_started'); END IF;

  -- Update ticket status
  UPDATE tickets SET status='canceled', canceled_at=NOW(), canceled_by=p_player_id,
    cancellation_reason=p_reason WHERE id=p_ticket_id;

  -- Derive balance for stamping
  SELECT COALESCE(balance_start,1000) INTO v_starting
  FROM player_limits WHERE club_id=p_club_id AND player_id=p_player_id LIMIT 1;
  IF NOT FOUND THEN v_starting := 1000; END IF;
  v_ledger_bal := _pb_ledger_balance(p_club_id, p_player_id, v_starting);
  v_bal_after  := ROUND(v_ledger_bal + v_ticket.risk_amount, 2);

  -- Write ledger (BET_CANCELED_REFUND credit)
  INSERT INTO ledger(ledger_id,club_id,player_id,ticket_id,event_type,amount,currency,
    direction,balance_before,balance_after,idempotency_key,created_by,reason)
  VALUES('LE_CA_'||p_ticket_id, p_club_id, p_player_id, p_ticket_id,
    'BET_CANCELED_REFUND', v_ticket.risk_amount,'diamonds','credit',
    v_ledger_bal, v_bal_after, p_idempotency_key,
    COALESCE(p_created_by,p_player_id),'cancel_refund:'||p_reason);

  RETURN jsonb_build_object('ok',true,'ticket_id',p_ticket_id,
    'refund',v_ticket.risk_amount,'balance_after',v_bal_after);
END;
$$ LANGUAGE plpgsql;

-- ── grade_ticket_tx ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION grade_ticket_tx(
  p_ticket_id      TEXT,
  p_club_id        TEXT,
  p_player_id      TEXT,
  p_grade_result   TEXT,  -- 'won' | 'lost' | 'push'
  p_profit         NUMERIC DEFAULT 0,
  p_idempotency_key TEXT DEFAULT NULL,
  p_created_by     TEXT DEFAULT 'server'
) RETURNS JSONB AS $$
DECLARE
  v_ticket       RECORD;
  v_starting     NUMERIC;
  v_ledger_bal   NUMERIC;
  v_event_type   TEXT;
  v_amount       NUMERIC;
  v_direction    TEXT;
  v_bal_after    NUMERIC;
  v_target_status TEXT;
BEGIN
  -- Map result to event type
  IF    p_grade_result='won'  THEN v_event_type:='BET_GRADED_WIN';  v_target_status:='won';
  ELSIF p_grade_result='lost' THEN v_event_type:='BET_GRADED_LOSS'; v_target_status:='lost';
  ELSIF p_grade_result='push' THEN v_event_type:='BET_GRADED_PUSH'; v_target_status:='push';
  ELSE RETURN jsonb_build_object('ok',false,'error','invalid_grade_result:'||p_grade_result);
  END IF;

  -- Prior grade idempotency
  PERFORM 1 FROM ledger WHERE ticket_id=p_ticket_id
    AND event_type IN ('BET_GRADED_WIN','BET_GRADED_LOSS','BET_GRADED_PUSH') LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'idempotent',true,'ticket_id',p_ticket_id); END IF;

  -- Lock + load ticket
  SELECT * INTO v_ticket FROM tickets WHERE id=p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','ticket_not_found'); END IF;
  IF v_ticket.status NOT IN ('active','open') THEN
    RETURN jsonb_build_object('ok',false,'error','invalid_transition:'||v_ticket.status||'→'||v_target_status);
  END IF;

  -- Update ticket
  UPDATE tickets SET status=v_target_status, graded_at=NOW() WHERE id=p_ticket_id;

  -- Compute ledger amount + direction
  IF p_grade_result='won' THEN
    v_amount    := ROUND(v_ticket.risk_amount + p_profit, 2);
    v_direction := 'credit';
  ELSIF p_grade_result='push' THEN
    v_amount    := v_ticket.risk_amount;
    v_direction := 'credit';
  ELSE -- lost
    v_amount    := v_ticket.risk_amount;
    v_direction := 'neutral';
  END IF;

  -- Balance stamp
  SELECT COALESCE(balance_start,1000) INTO v_starting
  FROM player_limits WHERE club_id=p_club_id AND player_id=p_player_id LIMIT 1;
  IF NOT FOUND THEN v_starting:=1000; END IF;
  v_ledger_bal := _pb_ledger_balance(p_club_id, p_player_id, v_starting);
  v_bal_after  := CASE WHEN v_direction='credit' THEN ROUND(v_ledger_bal+v_amount,2)
                        ELSE v_ledger_bal END;

  -- Write ledger
  INSERT INTO ledger(ledger_id,club_id,player_id,ticket_id,event_type,amount,currency,
    direction,balance_before,balance_after,idempotency_key,created_by,reason)
  VALUES('LE_GR_'||p_ticket_id||'_'||p_grade_result,
    p_club_id,p_player_id,p_ticket_id,v_event_type,v_amount,'diamonds',v_direction,
    v_ledger_bal,v_bal_after,p_idempotency_key,p_created_by,'grade_'||p_grade_result);

  RETURN jsonb_build_object('ok',true,'ticket_id',p_ticket_id,'grade_result',p_grade_result,
    'event_type',v_event_type,'amount',v_amount,'balance_after',v_bal_after);
END;
$$ LANGUAGE plpgsql;

-- ── settle_player_tx ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION settle_player_tx(
  p_settlement_id  TEXT,
  p_club_id        TEXT,
  p_player_id      TEXT,
  p_amount         NUMERIC,
  p_direction      TEXT,  -- 'player_owes_host' | 'host_owes_player'
  p_idempotency_key TEXT,
  p_created_by     TEXT DEFAULT 'host'
) RETURNS JSONB AS $$
DECLARE
  v_starting    NUMERIC;
  v_ledger_bal  NUMERIC;
  v_event_dir   TEXT;
  v_bal_after   NUMERIC;
BEGIN
  -- Idempotency
  PERFORM 1 FROM ledger WHERE settlement_id=p_settlement_id AND event_type='SETTLEMENT_APPLIED' LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'idempotent',true,'settlement_id',p_settlement_id); END IF;

  v_event_dir := CASE WHEN p_direction='player_owes_host' THEN 'debit' ELSE 'credit' END;

  SELECT COALESCE(balance_start,1000) INTO v_starting
  FROM player_limits WHERE club_id=p_club_id AND player_id=p_player_id LIMIT 1;
  IF NOT FOUND THEN v_starting:=1000; END IF;
  v_ledger_bal := _pb_ledger_balance(p_club_id, p_player_id, v_starting);
  v_bal_after  := CASE WHEN v_event_dir='debit'  THEN ROUND(v_ledger_bal-p_amount,2)
                        WHEN v_event_dir='credit' THEN ROUND(v_ledger_bal+p_amount,2)
                        ELSE v_ledger_bal END;

  INSERT INTO ledger(ledger_id,club_id,player_id,settlement_id,event_type,amount,currency,
    direction,balance_before,balance_after,idempotency_key,created_by,reason)
  VALUES('LE_SE_'||p_settlement_id, p_club_id, p_player_id, p_settlement_id,
    'SETTLEMENT_APPLIED', p_amount,'diamonds', v_event_dir,
    v_ledger_bal, v_bal_after, p_idempotency_key, p_created_by,
    'settlement:'||p_direction);

  RETURN jsonb_build_object('ok',true,'settlement_id',p_settlement_id,
    'direction',p_direction,'amount',p_amount,'balance_after',v_bal_after);
END;
$$ LANGUAGE plpgsql;

-- ── weekly_rollover_tx ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION weekly_rollover_tx(
  p_rollover_id    TEXT,
  p_club_id        TEXT,
  p_player_id      TEXT,
  p_week_start     TEXT,   -- ISO date e.g. '2026-05-18'
  p_starting_balance NUMERIC DEFAULT 1000,
  p_created_by     TEXT DEFAULT 'host'
) RETURNS JSONB AS $$
DECLARE
  v_existing TEXT;
BEGIN
  -- One rollover per player per week
  SELECT ledger_id INTO v_existing FROM ledger
  WHERE club_id=p_club_id AND player_id=p_player_id AND event_type='WEEKLY_ROLLOVER'
    AND metadata_json->>'week_start' = p_week_start LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'idempotent',true,'rollover_id',p_rollover_id); END IF;

  INSERT INTO ledger(ledger_id,club_id,player_id,event_type,amount,currency,direction,
    balance_before,balance_after,created_by,reason,metadata_json)
  VALUES(p_rollover_id,p_club_id,p_player_id,'WEEKLY_ROLLOVER',0,'diamonds','neutral',
    p_starting_balance,p_starting_balance,p_created_by,'weekly_rollover',
    jsonb_build_object('week_start',p_week_start));

  RETURN jsonb_build_object('ok',true,'rollover_id',p_rollover_id,'week_start',p_week_start);
END;
$$ LANGUAGE plpgsql;
