-- Migration 023: Canonicalization pass
--
-- RA-1: Fix balance_start source — all money RPCs now read from club_members,
--       not player_limits (which has no balance_start column → was always NULL
--       → COALESCE(NULL,1000) produced phantom $1,000 balance for every player).
--       place_bet_tx and grade_ticket_tx hard-reject if club_members row missing.
--       cancel_bet_tx and settle_player_tx use soft fallback (0) so host ops
--       can still complete if membership data is somehow absent.
--
-- RA-6: Composite index covering the placement hot-path query predicate.
--
-- GRD-2: grade_ticket_tx SQL backport — adds p_override_profit parameter so
--        push-reduced parlays (stake * remaining_legs fraction) can be graded
--        with the correct credit amount without re-deriving it in SQL.

-- ── RA-6: Composite index ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_player_club_status
  ON tickets(player_id, club_id, status);

-- ── RA-1 + risk-limits: place_bet_tx ─────────────────────────────────────────
-- Replaces migration 009 version.
-- Changes vs 009:
--   • balance_start read from club_members FOR UPDATE (was player_limits, column absent)
--   • PERFORM lock moved to club_members (was player_limits — wrong row)
--   • Hard-reject when club_members row missing
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
  p_created_by       TEXT    DEFAULT NULL,
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
  WHERE club_id=p_club_id AND idempotency_key=p_idempotency_key AND event_type='BET_PLACED'
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'idempotent',true,'ticket_id',p_ticket_id);
  END IF;

  -- Risk limits check (before balance lock)
  v_risk_check := _pb_check_risk_limits(
    p_club_id, p_player_id, p_stake, p_estimated_payout,
    p_bet_type, p_leg_count, p_sports, p_markets, p_canonical_keys, p_is_live
  );
  IF v_risk_check IS NOT NULL THEN RETURN v_risk_check; END IF;

  -- Authoritative balance: club_members.balance_start (hard-reject if missing)
  SELECT balance_start INTO v_starting
  FROM club_members WHERE club_id=p_club_id AND player_id=p_player_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','club_member_not_found',
      'club_id',p_club_id,'player_id',p_player_id);
  END IF;

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

-- ── RA-1: cancel_bet_tx ───────────────────────────────────────────────────────
-- Replaces migration 008 version.
-- Changes vs 008:
--   • balance_start read from club_members (soft fallback to 0 if missing)
CREATE OR REPLACE FUNCTION cancel_bet_tx(
  p_ticket_id       TEXT,
  p_club_id         TEXT,
  p_player_id       TEXT,
  p_idempotency_key TEXT,
  p_reason          TEXT DEFAULT 'player_request',
  p_created_by      TEXT DEFAULT NULL
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

  -- Game started?
  PERFORM 1 FROM ticket_legs WHERE ticket_id=p_ticket_id AND scheduled_start <= NOW() LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('ok',false,'error','game_already_started'); END IF;

  -- Update ticket status
  UPDATE tickets SET status='canceled', canceled_at=NOW(), canceled_by=p_player_id,
    cancellation_reason=p_reason WHERE id=p_ticket_id;

  -- Authoritative balance: club_members.balance_start (soft fallback to 0)
  SELECT balance_start INTO v_starting
  FROM club_members WHERE club_id=p_club_id AND player_id=p_player_id;
  IF NOT FOUND THEN v_starting := 0; END IF;

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

-- ── RA-1 + GRD-2: grade_ticket_tx ────────────────────────────────────────────
-- Replaces migration 008 version.
-- Changes vs 008:
--   • balance_start read from club_members (hard-reject if missing)
--   • p_override_profit parameter: when provided, overrides p_profit as the
--     payout credit amount AND updates potential_profit on the ticket row
--     (backports Node-layer GRD-2 push-reduced parlay fix into SQL)
CREATE OR REPLACE FUNCTION grade_ticket_tx(
  p_ticket_id       TEXT,
  p_club_id         TEXT,
  p_player_id       TEXT,
  p_grade_result    TEXT,     -- 'won' | 'lost' | 'push'
  p_profit          NUMERIC   DEFAULT 0,
  p_idempotency_key TEXT      DEFAULT NULL,
  p_created_by      TEXT      DEFAULT 'server',
  p_override_profit NUMERIC   DEFAULT NULL  -- GRD-2: push-reduced parlay override
) RETURNS JSONB AS $$
DECLARE
  v_ticket        RECORD;
  v_starting      NUMERIC;
  v_ledger_bal    NUMERIC;
  v_event_type    TEXT;
  v_amount        NUMERIC;
  v_direction     TEXT;
  v_bal_after     NUMERIC;
  v_target_status TEXT;
  v_effective_profit NUMERIC;
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
    RETURN jsonb_build_object('ok',false,'error',
      'invalid_transition:'||v_ticket.status||'→'||v_target_status);
  END IF;

  -- Authoritative balance: club_members.balance_start (hard-reject if missing)
  SELECT balance_start INTO v_starting
  FROM club_members WHERE club_id=p_club_id AND player_id=p_player_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error','club_member_not_found',
      'club_id',p_club_id,'player_id',p_player_id);
  END IF;

  -- Effective profit: override wins (GRD-2 push-reduced parlay), else p_profit
  v_effective_profit := COALESCE(p_override_profit, p_profit);

  -- Update ticket — write potential_profit when override supplied
  UPDATE tickets
    SET status          = v_target_status,
        graded_at       = NOW(),
        potential_profit = CASE
          WHEN p_override_profit IS NOT NULL THEN p_override_profit
          ELSE potential_profit
        END
    WHERE id = p_ticket_id;

  -- Compute ledger amount + direction
  IF p_grade_result='won' THEN
    v_amount    := ROUND(v_ticket.risk_amount + v_effective_profit, 2);
    v_direction := 'credit';
  ELSIF p_grade_result='push' THEN
    v_amount    := v_ticket.risk_amount;
    v_direction := 'credit';
  ELSE -- lost
    v_amount    := v_ticket.risk_amount;
    v_direction := 'neutral';
  END IF;

  -- Balance stamp
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

-- ── RA-1: settle_player_tx ────────────────────────────────────────────────────
-- Replaces migration 008 version.
-- Changes vs 008:
--   • balance_start read from club_members (soft fallback to 0 if missing)
CREATE OR REPLACE FUNCTION settle_player_tx(
  p_settlement_id   TEXT,
  p_club_id         TEXT,
  p_player_id       TEXT,
  p_amount          NUMERIC,
  p_direction       TEXT,     -- 'player_owes_host' | 'host_owes_player'
  p_idempotency_key TEXT,
  p_created_by      TEXT DEFAULT 'host'
) RETURNS JSONB AS $$
DECLARE
  v_starting    NUMERIC;
  v_ledger_bal  NUMERIC;
  v_event_dir   TEXT;
  v_bal_after   NUMERIC;
BEGIN
  -- Idempotency
  PERFORM 1 FROM ledger
  WHERE settlement_id=p_settlement_id AND event_type='SETTLEMENT_APPLIED' LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok',true,'idempotent',true,'settlement_id',p_settlement_id);
  END IF;

  v_event_dir := CASE WHEN p_direction='player_owes_host' THEN 'debit' ELSE 'credit' END;

  -- Authoritative balance: club_members.balance_start (soft fallback to 0)
  SELECT balance_start INTO v_starting
  FROM club_members WHERE club_id=p_club_id AND player_id=p_player_id;
  IF NOT FOUND THEN v_starting := 0; END IF;

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
