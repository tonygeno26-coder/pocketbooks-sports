/**
 * PocketBooks Sports — Supabase Mirror Tests (Phase A)
 * Run: node tests/supabase-mirror.test.js
 * Tests mirror payload shape, idempotency key generation, ledger entry types.
 * No actual Supabase calls — pure function tests.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }

// ── Mirror helpers (mirrored from backend) ────────────────────────────────────

var LEDGER_TYPES = new Set([
  'bet_placed','bet_won','bet_lost','bet_push','bet_canceled',
  'deposit','withdrawal','admin_adjustment',
  'invalid_grade_reversal','future_grade_blocked_revert'
]);

function buildTicketRow(ticket) {
  var sels = Array.isArray(ticket.selections) ? ticket.selections : [];
  return {
    id:               ticket.id,
    club_id:          ticket.clubId || ticket.club_id || null,
    player_id:        ticket.playerId || ticket.player_id || null,
    player_username:  ticket.playerUsername || null,
    type:             ticket.type || 'Single',
    status:           ticket.status || 'active',
    risk_amount:      parseFloat(ticket.riskAmount) || 0,
    potential_profit: parseFloat(ticket.potentialProfit) || 0,
    estimated_payout: parseFloat(ticket.estimatedPayout) || 0,
    placed_at:        ticket.placedAt || new Date().toISOString(),
    mirrored_at:      new Date().toISOString()
  };
}

function buildLegRows(ticket) {
  var sels = Array.isArray(ticket.selections) ? ticket.selections : [];
  return sels.map(function(sel, i) {
    return {
      id:                 sel.legId || (ticket.id + '_leg' + i),
      ticket_id:          ticket.id,
      leg_index:          i,
      provider_name:      sel.providerName || 'odds-api',
      provider_game_id:   sel.providerGameId || sel.gameId || null,
      canonical_game_key: sel.canonicalGameKey || '',
      sport:              sel.sport || null,
      home_team:          sel.homeTeam || null,
      away_team:          sel.awayTeam || null,
      scheduled_start:    sel.scheduledStart || sel.commenceTime || null,
      market:             sel.market || '',
      pick:               sel.pick || '',
      odds:               typeof sel.odds === 'number' ? sel.odds : null,
      line:               sel.line != null ? parseFloat(sel.line) : null,
      side:               sel.side || null,
      game_status:        sel.gameStatus || null,
      leg_result:         sel.result || null
    };
  });
}

function buildLedgerRow(opts) {
  // opts: { ticket, type, amount, balanceBefore, balanceAfter, reason, finalScore }
  var t = opts.ticket || {};
  var idempotencyKey = 'L_' + opts.type + '_' + (t.id||'?') + '_' + (opts.ts || Date.now());
  return {
    id:             idempotencyKey,
    club_id:        t.clubId || t.club_id || null,
    player_id:      t.playerId || t.player_id || null,
    ticket_id:      t.id || null,
    type:           opts.type,
    amount:         opts.amount,
    balance_before: opts.balanceBefore != null ? opts.balanceBefore : null,
    balance_after:  opts.balanceAfter  != null ? opts.balanceAfter  : null,
    reason:         opts.reason || opts.type,
    final_score:    opts.finalScore || null,
    created_at:     new Date().toISOString(),
    created_by:     opts.createdBy || 'system'
  };
}

// ── Test data ─────────────────────────────────────────────────────────────────
function makeTicket(id, type, legs) {
  return {
    id: id, type: type||'Single', status:'active',
    riskAmount:100, potentialProfit:90.91, estimatedPayout:190.91,
    playerId:'P001', playerUsername:'brody', clubId:'C001',
    placedAt: new Date().toISOString(),
    selections: legs || [{
      legId:'LEG-001', pick:'Guardians ML', market:'Moneyline',
      canonicalGameKey:'MLB|reds|guardians|2026-05-17',
      sport:'mlb', homeTeam:'Guardians', awayTeam:'Reds',
      scheduledStart:'2026-05-17T19:10:00Z', odds:-110,
      providerGameId:'game-abc-123', providerName:'odds-api'
    }]
  };
}

// ── Ticket row tests ──────────────────────────────────────────────────────────
console.log('\n── Ticket Mirror Row ──');

test('buildTicketRow: required fields present', function() {
  var t = makeTicket('T001','Single');
  var row = buildTicketRow(t);
  assert(row.id === 'T001', 'id');
  assert(row.risk_amount === 100, 'risk_amount');
  assert(row.potential_profit === 90.91, 'potential_profit');
  assert(row.type === 'Single', 'type');
  assert(row.status === 'active', 'status');
  assert(row.player_id === 'P001', 'player_id');
  assert(row.club_id === 'C001', 'club_id');
});

test('buildTicketRow: missing optional fields default gracefully', function() {
  var row = buildTicketRow({ id:'T002', riskAmount:50 });
  assertEq(row.club_id, null, 'club_id null');
  assertEq(row.player_id, null, 'player_id null');
  assertEq(row.type, 'Single', 'type defaults');
  assertEq(row.status, 'active', 'status defaults');
});

// ── Leg row tests ─────────────────────────────────────────────────────────────
console.log('\n── Ticket Leg Mirror Rows ──');

test('buildLegRows: single ticket produces 1 leg row', function() {
  var t = makeTicket('T001','Single');
  var rows = buildLegRows(t);
  assertEq(rows.length, 1, '1 leg row');
  assertEq(rows[0].ticket_id, 'T001', 'ticket_id');
  assertEq(rows[0].leg_index, 0, 'leg_index=0');
  assertEq(rows[0].canonical_game_key, 'MLB|reds|guardians|2026-05-17', 'cKey');
  assertEq(rows[0].pick, 'Guardians ML', 'pick');
  assertEq(rows[0].market, 'Moneyline', 'market');
  assertEq(rows[0].odds, -110, 'odds');
  assertEq(rows[0].sport, 'mlb', 'sport');
  assertEq(rows[0].home_team, 'Guardians', 'home_team');
  assertEq(rows[0].away_team, 'Reds', 'away_team');
  assertEq(rows[0].provider_game_id, 'game-abc-123', 'provider_game_id');
});

test('buildLegRows: parlay produces correct leg count', function() {
  var t = makeTicket('T002','Parlay', [
    { pick:'Rays ML', market:'Moneyline', canonicalGameKey:'MLB|marlins|rays|2026-05-17', odds:-120 },
    { pick:'Over 8.5', market:'Total', canonicalGameKey:'MLB|cubs|cardinals|2026-05-17', odds:-110 }
  ]);
  var rows = buildLegRows(t);
  assertEq(rows.length, 2, '2 leg rows for parlay');
  assertEq(rows[0].leg_index, 0, 'leg 0');
  assertEq(rows[1].leg_index, 1, 'leg 1');
  assertEq(rows[0].ticket_id, 'T002', 'both reference same ticket');
  assertEq(rows[1].ticket_id, 'T002', 'both reference same ticket');
});

test('buildLegRows: legId used when present', function() {
  var t = makeTicket('T003','Single',[{ legId:'LEG-xyz', pick:'Cubs ML', market:'Moneyline', canonicalGameKey:'MLB|cubs|cardinals|2026-05-17', odds:-115 }]);
  var rows = buildLegRows(t);
  assertEq(rows[0].id, 'LEG-xyz', 'legId used as row id');
});

test('buildLegRows: fallback id when legId absent', function() {
  var t = makeTicket('T004','Single',[{ pick:'Cubs ML', market:'Moneyline', canonicalGameKey:'MLB|cubs|cardinals|2026-05-17', odds:-115 }]);
  var rows = buildLegRows(t);
  assert(rows[0].id.startsWith('T004_leg'), 'fallback id starts with ticketId_leg');
});

// ── Ledger row tests ──────────────────────────────────────────────────────────
console.log('\n── Ledger Entry Mirror Rows ──');

test('buildLedgerRow: bet_placed row has correct shape', function() {
  var t = makeTicket('T001');
  var ts = 1747600000000;
  var row = buildLedgerRow({ ticket:t, type:'bet_placed', amount:-100, balanceBefore:1000, balanceAfter:900, reason:'bet_placed', ts:ts });
  assert(row.id.startsWith('L_bet_placed_T001'), 'idempotency key starts correctly');
  assertEq(row.type, 'bet_placed', 'type');
  assertEq(row.amount, -100, 'amount negative for placement');
  assertEq(row.balance_before, 1000, 'balance_before');
  assertEq(row.balance_after, 900, 'balance_after');
  assertEq(row.ticket_id, 'T001', 'ticket_id');
});

test('buildLedgerRow: bet_won row has positive amount', function() {
  var t = makeTicket('T001');
  var row = buildLedgerRow({ ticket:t, type:'bet_won', amount:90.91, balanceBefore:900, balanceAfter:990.91, ts:123 });
  assertEq(row.type, 'bet_won', 'type');
  assert(row.amount > 0, 'amount positive for win');
});

test('buildLedgerRow: idempotency key is deterministic for same ts', function() {
  var t = makeTicket('T001');
  var r1 = buildLedgerRow({ ticket:t, type:'bet_placed', amount:-100, ts:99999 });
  var r2 = buildLedgerRow({ ticket:t, type:'bet_placed', amount:-100, ts:99999 });
  assertEq(r1.id, r2.id, 'same ts → same idempotency key');
});

test('buildLedgerRow: different ts → different idempotency key', function() {
  var t = makeTicket('T001');
  var r1 = buildLedgerRow({ ticket:t, type:'bet_placed', amount:-100, ts:1000 });
  var r2 = buildLedgerRow({ ticket:t, type:'bet_placed', amount:-100, ts:2000 });
  assert(r1.id !== r2.id, 'different ts → different key (no duplicate)');
});

test('buildLedgerRow: all valid types accepted', function() {
  var t = makeTicket('T001');
  var types = ['bet_placed','bet_won','bet_lost','bet_push','bet_canceled','invalid_grade_reversal'];
  types.forEach(function(type) {
    var row = buildLedgerRow({ ticket:t, type:type, amount:0, ts:1 });
    assert(LEDGER_TYPES.has(row.type), 'type valid: ' + type);
  });
});

// ── Cancel/refund tests ───────────────────────────────────────────────────────
console.log('\n── Cancel / Refund Ledger ──');

test('canceled ticket: ledger row is bet_canceled with positive amount (refund)', function() {
  var t = makeTicket('T001'); t.status = 'canceled';
  var row = buildLedgerRow({ ticket:t, type:'bet_canceled', amount:100, balanceBefore:900, balanceAfter:1000, reason:'player_cancel', ts:1 });
  assertEq(row.type, 'bet_canceled', 'type');
  assert(row.amount > 0, 'refund is positive credit');
});

// ── Deduplication guard ───────────────────────────────────────────────────────
console.log('\n── Idempotency (no duplicate rows) ──');

test('upsert by id prevents duplicate ledger rows', function() {
  // Simulate upsert: same id → same row, not two rows
  var seen = {};
  var t = makeTicket('T001');
  function fakeUpsert(row) {
    if (seen[row.id]) return { duplicate: true };
    seen[row.id] = row;
    return { inserted: true };
  }
  var r1 = buildLedgerRow({ ticket:t, type:'bet_placed', amount:-100, ts:5000 });
  var r2 = buildLedgerRow({ ticket:t, type:'bet_placed', amount:-100, ts:5000 });
  fakeUpsert(r1);
  var result = fakeUpsert(r2);
  assert(result.duplicate, 'same idempotency key → duplicate detected');
  assertEq(Object.keys(seen).length, 1, 'only 1 row stored');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Supabase mirror tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ MIRROR TESTS FAILED'); process.exit(1); }
else console.log('✅ All mirror rules verified');
