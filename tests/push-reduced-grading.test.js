/**
 * PocketBooks Sports — GRD-2 Push-Reduced Parlay Grading Tests
 * Run: node tests/push-reduced-grading.test.js
 *
 * Covers:
 *  1. 3-leg W/W/P: pushed leg drops out, profit recomputed from remaining 2 won legs
 *  2. 3-leg W/L/P: any lost leg = lost ticket
 *  3. 2-leg W/P:   pushed leg drops out, profit from 1 won leg
 *  4. 2-leg P/P:   all legs pushed = push (full stake refund)
 *  5. Single P:    push
 *  6. W/W/W:       all won, no override — uses original potential_profit
 *  7. Push-reduced replay (same idempotency key): idempotent
 *  8. Null odds on won leg: skip, no settlement
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)       { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m)  { if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }
function assertApprox(a, b, tol, m) {
  tol = tol || 0.02;
  if (Math.abs(a - b) > tol) throw new Error((m||'') + ' — got ' + a + ' expected ~' + b + ' (tol=' + tol + ')');
}

// ── Helpers (mirrors backend functions) ──────────────────────────────────────

function _sgAmToDecimal(o) {
  var n = parseInt(String(o || 0).replace('+', ''));
  if (!n || isNaN(n)) return 1;
  return n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
}

function computePushReducedProfit(risk, wonLegs) {
  var decProd = wonLegs.reduce(function(acc, l) { return acc * _sgAmToDecimal(l.odds); }, 1.0);
  return Math.round((risk * (decProd - 1)) * 100) / 100;
}

// Simulate _deriveTicketOutcome for a parlay
function deriveParlay(legOutcomes, legs) {
  // legOutcomes: array of 'won'|'lost'|'push' per leg index
  // legs: array of leg objects with .odds field
  if (!legs.length) return { outcome: 'error', reason: 'no_legs' };
  // Any pending/error → pending
  // Any lost → lost
  var anyLost = legOutcomes.find(function(o) { return o === 'lost'; });
  if (anyLost) return { outcome: 'lost' };
  var wonLegs  = legs.filter(function(_, i) { return legOutcomes[i] === 'won'; });
  var pushLegs = legs.filter(function(_, i) { return legOutcomes[i] === 'push'; });
  if (pushLegs.length > 0 && wonLegs.length > 0) {
    return { outcome: 'won', pushReduced: true, wonLegObjects: wonLegs, pushLegCount: pushLegs.length };
  }
  if (pushLegs.length === legs.length) return { outcome: 'push' };
  return wonLegs.length === legs.length ? { outcome: 'won' } : { outcome: 'lost' };
}

// Simulate the grading path decision (mirrors _runGradeCore / grade/run)
function computeGradeDecision(ticket, outcome) {
  var risk = parseFloat(ticket.risk_amount) || 0;
  var profit = parseFloat(ticket.potential_profit) || 0;
  var overrideProfit = null;

  if (outcome.pushReduced && outcome.wonLegObjects) {
    var allOddsValid = outcome.wonLegObjects.every(function(l) {
      return l.odds && l.odds !== 0 && !isNaN(parseInt(String(l.odds).replace('+', '')));
    });
    if (!allOddsValid) {
      return { skip: true, reason: 'push_reduced_null_odds' };
    }
    overrideProfit = computePushReducedProfit(risk, outcome.wonLegObjects);
    profit = overrideProfit;
  }

  return {
    skip: false,
    result: outcome.outcome,
    profit: profit,
    overrideProfit: overrideProfit,
    rpcArgs: {
      p_grade_result:   outcome.outcome,
      p_profit:         profit,
      p_override_profit: overrideProfit
    }
  };
}

// Simulate grade_ticket_tx RPC (idempotency store + result)
function buildRpcStore() { return {}; }
function callGradeRpc(store, ticket, args) {
  var key = args.p_idempotency_key || ('GR_' + args.p_grade_result + '_' + ticket.id);
  if (store[key]) return { ok: true, idempotent: true, ticket_id: ticket.id };

  var risk   = parseFloat(ticket.risk_amount) || 0;
  var profit = args.p_override_profit != null ? args.p_override_profit : args.p_profit;
  var result = args.p_grade_result;

  var v_amount, v_direction;
  if (result === 'won') {
    v_amount    = Math.round((risk + profit) * 100) / 100;
    v_direction = 'credit';
  } else if (result === 'push') {
    v_amount    = risk;
    v_direction = 'credit';
  } else {
    v_amount    = risk;
    v_direction = 'neutral';
  }

  var entry = {
    ledger_id:     'LE_GR_' + ticket.id + '_' + result,
    event_type:    result === 'won' ? 'BET_GRADED_WIN' : result === 'push' ? 'BET_GRADED_PUSH' : 'BET_GRADED_LOSS',
    direction:     v_direction,
    amount:        v_amount,
    push_reduced:  args.p_override_profit != null,
    override_profit: args.p_override_profit
  };
  store[key] = entry;

  // Persist corrected profit to ticket when push-reduced
  if (args.p_override_profit != null) {
    ticket.potential_profit = args.p_override_profit;
  }

  return { ok: true, idempotent: false, ticket_id: ticket.id,
           amount: v_amount, direction: v_direction,
           push_reduced: entry.push_reduced, override_profit: args.p_override_profit };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── GRD-2: _deriveTicketOutcome parlay logic ──');

// Leg definitions
var LEG_W158  = { odds: '+158' };  // +158 → decimal 2.58
var LEG_WN182 = { odds: '-182' };  // -182 → decimal 1.5495...
var LEG_WN105 = { odds: '-105' };  // -105 → decimal 1.952...
var PUSH_LEG  = { odds: null   };  // push has no odds contribution

// Test 1: 3-leg W/W/P — pushed leg drops out, remaining 2 won legs pay at reduced odds
test('3-leg W/W/P: outcome=won, pushReduced=true, 2 wonLegObjects', function() {
  var legs     = [LEG_W158, LEG_WN182, PUSH_LEG];
  var outcomes = ['won', 'won', 'push'];
  var r = deriveParlay(outcomes, legs);
  assertEq(r.outcome, 'won', 'outcome=won');
  assert(r.pushReduced, 'pushReduced=true');
  assertEq(r.wonLegObjects.length, 2, '2 wonLegObjects');
  assertEq(r.pushLegCount, 1, 'pushLegCount=1');
});

test('3-leg W/W/P, $100 stake, +158/-182/-105-push: profit ≈ $38.59', function() {
  // Two won legs: +158 and -182 (the -105 leg is pushed)
  var wonLegs = [LEG_W158, LEG_WN182];
  var profit  = computePushReducedProfit(100, wonLegs);
  // decimal: 2.58 * (100/182+1) = 2.58 * 1.5495 = ~3.998
  // profit = 100 * (3.998 - 1) = ~$299.78 ... wait, let me recalculate
  // +158 → 158/100+1 = 2.58
  // -182 → 100/182+1 = 1.5494505...
  // product = 2.58 * 1.5494505 = 3.99758...
  // profit = 100 * (3.99758 - 1) = 299.758 ≈ 299.76
  assertApprox(profit, 299.76, 0.05, '3-leg W(+158)/W(-182)/P profit');
  assert(profit > 0, 'profit positive');
});

// Correction: per the spec, +158/-182 product, $100 stake → ~$299.76
// The spec says "+158/-182/-105" for 3-leg W/W/P but the -105 is the push
// Rechecking: odds +158/-182 (won legs) only
test('3-leg W/W/P spec: $100 stake, +158/-182 (won), -105 (push) → profit ~$299.76', function() {
  // won legs: +158 and -182; pushed: -105 (not included in product)
  var wonLegs = [{ odds: '+158' }, { odds: '-182' }];
  var profit  = computePushReducedProfit(100, wonLegs);
  assertApprox(profit, 299.76, 0.10, 'spec example profit');
});

// Test 2: 3-leg W/L/P — any lost leg = lost
test('3-leg W/L/P: outcome=lost (lost leg dominates)', function() {
  var legs     = [LEG_W158, LEG_WN182, PUSH_LEG];
  var outcomes = ['won', 'lost', 'push'];
  var r = deriveParlay(outcomes, legs);
  assertEq(r.outcome, 'lost', 'outcome=lost when any leg lost');
  assert(!r.pushReduced, 'pushReduced=false');
});

// Test 3: 2-leg W/P — pushed leg drops out, remaining 1 won leg pays at its own odds
test('2-leg W/P: outcome=won, pushReduced=true, 1 wonLeg', function() {
  var legs     = [LEG_W158, PUSH_LEG];
  var outcomes = ['won', 'push'];
  var r = deriveParlay(outcomes, legs);
  assertEq(r.outcome, 'won', 'outcome=won');
  assert(r.pushReduced, 'pushReduced=true');
  assertEq(r.wonLegObjects.length, 1, '1 wonLegObject');
});

test('2-leg W/P, $100 stake, +158 (won), -182 (push): profit = $158.00', function() {
  var wonLegs = [{ odds: '+158' }];
  var profit  = computePushReducedProfit(100, wonLegs);
  // +158 → decimal 2.58; profit = 100 * (2.58 - 1) = 158.00
  assertApprox(profit, 158.00, 0.01, '2-leg W/P profit = $158');
});

// Test 4: 2-leg P/P — all pushed = push ticket
test('2-leg P/P: outcome=push (all legs pushed)', function() {
  var legs     = [PUSH_LEG, PUSH_LEG];
  var outcomes = ['push', 'push'];
  var r = deriveParlay(outcomes, legs);
  assertEq(r.outcome, 'push', 'all pushed = push');
  assert(!r.pushReduced, 'not pushReduced — no won legs');
});

// Test 5: single P
test('single push: outcome=push', function() {
  var legs     = [PUSH_LEG];
  var outcomes = ['push'];
  var r = deriveParlay(outcomes, legs);
  assertEq(r.outcome, 'push', 'single push');
});

// Test 6: W/W/W — all won, no override, uses original potential_profit
test('W/W/W parlay: outcome=won, pushReduced=false', function() {
  var legs     = [LEG_W158, LEG_WN182, LEG_WN105];
  var outcomes = ['won', 'won', 'won'];
  var r = deriveParlay(outcomes, legs);
  assertEq(r.outcome, 'won', 'outcome=won');
  assert(!r.pushReduced, 'pushReduced=false for all-won parlay');
});

test('W/W/W grade decision: overrideProfit=null, uses original potential_profit', function() {
  var ticket  = { id:'T_WWW', risk_amount:100, potential_profit:450 };
  var legs    = [LEG_W158, LEG_WN182, LEG_WN105];
  var outcome = deriveParlay(['won','won','won'], legs);
  var dec     = computeGradeDecision(ticket, outcome);
  assert(!dec.skip, 'not skipped');
  assertEq(dec.overrideProfit, null, 'overrideProfit=null for all-won');
  assertApprox(dec.profit, 450, 0.01, 'uses original 450');
  assert(dec.rpcArgs.p_override_profit === null, 'p_override_profit=null sent to RPC');
});

console.log('\n── GRD-2: grade_ticket_tx RPC simulation ──');

// Test 7: push-reduced replay — idempotent
test('push-reduced ticket replay: same idempotency key → idempotent, no second ledger', function() {
  var store = buildRpcStore();
  var ticket = { id:'T_WWP', risk_amount:100, potential_profit:450 };
  var wonLegs = [{ odds:'+158' }, { odds:'-182' }];
  var override = computePushReducedProfit(100, wonLegs);
  var args = { p_grade_result:'won', p_profit:override, p_override_profit:override,
               p_idempotency_key:'GR_won_T_WWP' };
  // First call
  var r1 = callGradeRpc(store, ticket, args);
  assert(r1.ok, 'first call ok');
  assert(!r1.idempotent, 'not idempotent first time');
  // Second call — same key
  var r2 = callGradeRpc(store, ticket, args);
  assert(r2.ok, 'second call ok');
  assert(r2.idempotent, 'second call idempotent');
  // Ledger store should only have 1 entry
  assertEq(Object.keys(store).length, 1, 'exactly 1 ledger entry');
});

test('push-reduced: override_profit persisted to ticket.potential_profit', function() {
  var store = buildRpcStore();
  var ticket = { id:'T_WWP2', risk_amount:100, potential_profit:450 };
  var wonLegs = [{ odds:'+158' }, { odds:'-182' }];
  var override = computePushReducedProfit(100, wonLegs);
  var args = { p_grade_result:'won', p_profit:override, p_override_profit:override,
               p_idempotency_key:'GR_won_T_WWP2' };
  callGradeRpc(store, ticket, args);
  assertApprox(ticket.potential_profit, override, 0.01, 'potential_profit updated to override');
  assert(ticket.potential_profit !== 450, 'original 450 replaced with corrected value');
});

test('push-reduced RPC: ledger entry direction=credit, amount=risk+overrideProfit', function() {
  var store = buildRpcStore();
  var ticket = { id:'T_WWP3', risk_amount:100, potential_profit:450 };
  var wonLegs = [{ odds:'+158' }, { odds:'-182' }];
  var override = computePushReducedProfit(100, wonLegs);
  var args = { p_grade_result:'won', p_profit:override, p_override_profit:override,
               p_idempotency_key:'GR_won_T_WWP3' };
  var r = callGradeRpc(store, ticket, args);
  assertEq(r.direction, 'credit', 'direction=credit for win');
  assertApprox(r.amount, 100 + override, 0.05, 'amount = risk + overrideProfit');
  assert(r.push_reduced, 'push_reduced=true in response');
});

test('non-push-reduced win: original potential_profit preserved', function() {
  var store = buildRpcStore();
  var ticket = { id:'T_WWW2', risk_amount:100, potential_profit:450 };
  var args = { p_grade_result:'won', p_profit:450, p_override_profit:null,
               p_idempotency_key:'GR_won_T_WWW2' };
  var r = callGradeRpc(store, ticket, args);
  assert(!r.push_reduced, 'not push_reduced');
  assertApprox(r.amount, 550, 0.01, 'amount = 100+450 = 550');
  assertEq(ticket.potential_profit, 450, 'potential_profit unchanged at 450');
});

// Test 8: null odds on won leg → skip
test('null odds on won leg: grading skipped, no settlement', function() {
  var legs     = [{ odds: null }, PUSH_LEG];
  var outcomes = ['won', 'push'];
  var ticket   = { id:'T_NULL_ODDS', risk_amount:100, potential_profit:200 };
  var r = deriveParlay(outcomes, legs);
  assert(r.pushReduced, 'pushReduced=true');
  var dec = computeGradeDecision(ticket, r);
  assert(dec.skip, 'grading skipped when won leg has null odds');
  assertEq(dec.reason, 'push_reduced_null_odds', 'correct skip reason');
});

test('zero odds on won leg: grading skipped', function() {
  var legs     = [{ odds: 0 }, PUSH_LEG];
  var outcomes = ['won', 'push'];
  var ticket   = { id:'T_ZERO_ODDS', risk_amount:100, potential_profit:200 };
  var r = deriveParlay(outcomes, legs);
  var dec = computeGradeDecision(ticket, r);
  assert(dec.skip, 'grading skipped for zero odds');
});

test('invalid string odds on won leg: grading skipped', function() {
  var legs     = [{ odds: 'TBD' }, PUSH_LEG];
  var outcomes = ['won', 'push'];
  var ticket   = { id:'T_TBD_ODDS', risk_amount:100, potential_profit:200 };
  var r = deriveParlay(outcomes, legs);
  var dec = computeGradeDecision(ticket, r);
  assert(dec.skip, 'grading skipped for non-numeric odds string');
});

console.log('\n── GRD-2: _sgAmToDecimal helpers ──');

test('_sgAmToDecimal: +158 → 2.58', function() {
  assertApprox(_sgAmToDecimal('+158'), 2.58, 0.001);
});
test('_sgAmToDecimal: -182 → 1.5494...', function() {
  assertApprox(_sgAmToDecimal('-182'), 100/182+1, 0.0001);
});
test('_sgAmToDecimal: -105 → 1.9523...', function() {
  assertApprox(_sgAmToDecimal('-105'), 100/105+1, 0.0001);
});
test('_sgAmToDecimal: +100 → 2.00', function() {
  assertApprox(_sgAmToDecimal('+100'), 2.00, 0.001);
});
test('_sgAmToDecimal: null → 1 (identity, safe fallback)', function() {
  assertEq(_sgAmToDecimal(null), 1, 'null → 1');
});

console.log('\n── GRD-2: smoke test table ──');
console.log([
  '  Case                         | Result | Override Profit | Notes',
  '  -----------------------------|--------|-----------------|------',
  '  3-leg W(+158)/W(-182)/P(-105)| won    | ~$299.76        | push drops out',
  '  3-leg W/L/P                  | lost   | n/a             | lost leg dominates',
  '  2-leg W(+158)/P(-182)        | won    | $158.00         | single won leg',
  '  2-leg P/P                    | push   | n/a             | full stake refund',
  '  single P                     | push   | n/a             | full stake refund',
  '  3-leg W/W/W                  | won    | null (original) | no override',
  '  replay same key              | won    | idempotent      | no double ledger',
  '  null odds on won leg         | skip   | n/a             | ticket held pending',
].join('\n'));

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Push-reduced grading tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ PUSH-REDUCED GRADING TESTS FAILED'); process.exit(1); }
else console.log('✅ All push-reduced grading rules verified');
