/**
 * PocketBooks Sports — Settlement Execution Tests (Phase C Step 4)
 * Run: node tests/settlement-execution.test.js
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }
function assertApprox(a, b, m) { if (Math.abs(a-b)>0.02) throw new Error((m||'')+' — got '+a+' expected ~'+b); }

// ── Pure validation engine (mirrors backend) ──────────────────────────────────

var VALID_DIRECTIONS = new Set(['player_paid_host', 'host_paid_player']);

function validateSettlement(body, preview) {
  // body: { clubId, playerId, amount, direction, settlementWeek, idempotencyKey }
  // preview: { owesHost, hostOwes, openRisk, settledNet }
  var errors = [];

  if (!body.clubId)             errors.push('missing_clubId');
  if (!body.playerId)           errors.push('missing_playerId');
  if (!body.idempotencyKey)     errors.push('missing_idempotencyKey');
  if (!VALID_DIRECTIONS.has(body.direction)) errors.push('invalid_direction:'+body.direction);

  var amount = parseFloat(body.amount);
  if (isNaN(amount) || amount <= 0) errors.push('invalid_amount');

  if (errors.length) return { ok: false, errors };

  // Verify direction matches actual settlement state
  if (body.direction === 'player_paid_host' && preview.owesHost <= 0) {
    errors.push('player_does_not_owe_host (owesHost='+preview.owesHost+')');
  }
  if (body.direction === 'host_paid_player' && preview.hostOwes <= 0) {
    errors.push('host_does_not_owe_player (hostOwes='+preview.hostOwes+')');
  }

  // Overpay check
  var maxAmount = body.direction === 'player_paid_host' ? preview.owesHost : preview.hostOwes;
  if (amount > maxAmount + 0.01) {
    errors.push('overpay_blocked: amount='+amount+' max='+maxAmount);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, amount, maxAmount };
}

function buildSettlementLedgerEntry(body, amount, previewSnapshot) {
  // positive amount = credit to player; negative = debit from player
  var ledgerAmount = body.direction === 'host_paid_player' ? amount : -amount;
  return {
    id:              body.idempotencyKey,  // deterministic, prevents duplicates
    club_id:         body.clubId,
    player_id:       body.playerId,
    ticket_id:       null,
    type:            'settlement',
    amount:          Math.round(ledgerAmount * 100) / 100,
    balance_before:  null,
    balance_after:   null,
    reason:          body.direction + (body.note ? ': ' + body.note : ''),
    final_score:     null,
    created_at:      body.executedAt || new Date().toISOString(),
    created_by:      body.executedBy || 'host',
    settlement_week: body.settlementWeek || null,
    preview_snapshot: JSON.stringify(previewSnapshot)
  };
}

// ── Test data ─────────────────────────────────────────────────────────────────
var BASE_BODY = {
  clubId: 'C001', playerId: 'P001',
  direction: 'player_paid_host',
  amount: 100,
  settlementWeek: '2026-05-12',
  idempotencyKey: 'SETTLE_C001_P001_2026-05-12_playerPaid'
};

var PREVIEW_PLAYER_OWES = { owesHost: 100, hostOwes: 0, openRisk: 50, settledNet: -100 };
var PREVIEW_HOST_OWES   = { owesHost: 0, hostOwes: 90.91, openRisk: 0, settledNet: 90.91 };
var PREVIEW_EVEN        = { owesHost: 0, hostOwes: 0, openRisk: 0, settledNet: 0 };

// ── Validation: required fields ───────────────────────────────────────────────
console.log('\n── Validation: required fields ──');

test('valid player_paid_host passes', function() {
  var r = validateSettlement(BASE_BODY, PREVIEW_PLAYER_OWES);
  assert(r.ok, 'valid: '+JSON.stringify(r.errors));
  assertApprox(r.amount, 100, 'amount=100');
});

test('missing clubId → error', function() {
  var b = Object.assign({}, BASE_BODY, { clubId: null });
  var r = validateSettlement(b, PREVIEW_PLAYER_OWES);
  assert(!r.ok, 'invalid');
  assert(r.errors.includes('missing_clubId'), 'error: '+r.errors);
});

test('missing playerId → error', function() {
  var b = Object.assign({}, BASE_BODY, { playerId: null });
  var r = validateSettlement(b, PREVIEW_PLAYER_OWES);
  assert(!r.ok); assert(r.errors.includes('missing_playerId'));
});

test('missing idempotencyKey → error', function() {
  var b = Object.assign({}, BASE_BODY, { idempotencyKey: null });
  var r = validateSettlement(b, PREVIEW_PLAYER_OWES);
  assert(!r.ok); assert(r.errors.includes('missing_idempotencyKey'));
});

test('invalid direction → error', function() {
  var b = Object.assign({}, BASE_BODY, { direction: 'bad_direction' });
  var r = validateSettlement(b, PREVIEW_PLAYER_OWES);
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('invalid_direction'); }));
});

test('zero amount → error', function() {
  var b = Object.assign({}, BASE_BODY, { amount: 0 });
  var r = validateSettlement(b, PREVIEW_PLAYER_OWES);
  assert(!r.ok); assert(r.errors.includes('invalid_amount'));
});

test('negative amount → error', function() {
  var b = Object.assign({}, BASE_BODY, { amount: -50 });
  var r = validateSettlement(b, PREVIEW_PLAYER_OWES);
  assert(!r.ok); assert(r.errors.includes('invalid_amount'));
});

// ── Direction verification ────────────────────────────────────────────────────
console.log('\n── Direction verification ──');

test('player_paid_host when host owes → blocked', function() {
  var b = Object.assign({}, BASE_BODY, { direction: 'player_paid_host' });
  var r = validateSettlement(b, PREVIEW_HOST_OWES); // host owes, not player
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('player_does_not_owe_host'); }));
});

test('host_paid_player when player owes → blocked', function() {
  var b = Object.assign({}, BASE_BODY, { direction: 'host_paid_player', amount: 90.91,
    idempotencyKey: 'SETTLE_C001_P001_hostPaid' });
  var r = validateSettlement(b, PREVIEW_PLAYER_OWES); // player owes, not host
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('host_does_not_owe_player'); }));
});

test('both players even → both directions blocked', function() {
  var b1 = Object.assign({}, BASE_BODY, { direction: 'player_paid_host' });
  var b2 = Object.assign({}, BASE_BODY, { direction: 'host_paid_player', idempotencyKey:'K2' });
  assert(!validateSettlement(b1, PREVIEW_EVEN).ok, 'player_paid_host blocked when even');
  assert(!validateSettlement(b2, PREVIEW_EVEN).ok, 'host_paid_player blocked when even');
});

// ── Overpay protection ────────────────────────────────────────────────────────
console.log('\n── Overpay protection ──');

test('exact amount (full settle) allowed', function() {
  var b = Object.assign({}, BASE_BODY, { amount: 100 });
  var r = validateSettlement(b, PREVIEW_PLAYER_OWES);
  assert(r.ok, 'exact allowed');
  assertApprox(r.maxAmount, 100, 'maxAmount=100');
});

test('partial amount allowed', function() {
  var b = Object.assign({}, BASE_BODY, { amount: 50 });
  var r = validateSettlement(b, PREVIEW_PLAYER_OWES);
  assert(r.ok, 'partial allowed');
  assertApprox(r.amount, 50, 'amount=50');
});

test('overpay blocked (amount > owesHost)', function() {
  var b = Object.assign({}, BASE_BODY, { amount: 150 }); // owesHost=100
  var r = validateSettlement(b, PREVIEW_PLAYER_OWES);
  assert(!r.ok, 'overpay blocked');
  assert(r.errors.some(function(e){ return e.includes('overpay'); }));
});

test('host_paid_player partial allowed', function() {
  var b = Object.assign({}, BASE_BODY, { direction:'host_paid_player', amount:45,
    idempotencyKey:'K_host_partial' });
  var r = validateSettlement(b, PREVIEW_HOST_OWES); // hostOwes=90.91
  assert(r.ok, 'partial host payment allowed');
});

test('host_paid_player overpay blocked', function() {
  var b = Object.assign({}, BASE_BODY, { direction:'host_paid_player', amount:200,
    idempotencyKey:'K_host_over' }); // hostOwes=90.91
  var r = validateSettlement(b, PREVIEW_HOST_OWES);
  assert(!r.ok, 'overpay blocked');
});

// ── Ledger entry construction ─────────────────────────────────────────────────
console.log('\n── Ledger entry ──');

test('player_paid_host: ledger amount is negative (player debit)', function() {
  var entry = buildSettlementLedgerEntry(BASE_BODY, 100, PREVIEW_PLAYER_OWES);
  assert(entry.amount < 0, 'negative for player_paid_host');
  assertApprox(entry.amount, -100, 'amount=-100');
  assertEq(entry.type, 'settlement', 'type=settlement');
  assertEq(entry.id, BASE_BODY.idempotencyKey, 'id=idempotencyKey');
});

test('host_paid_player: ledger amount is positive (player credit)', function() {
  var b = Object.assign({}, BASE_BODY, { direction:'host_paid_player', idempotencyKey:'K2' });
  var entry = buildSettlementLedgerEntry(b, 90.91, PREVIEW_HOST_OWES);
  assert(entry.amount > 0, 'positive for host_paid_player');
  assertApprox(entry.amount, 90.91, 'amount=90.91');
});

test('ledger entry id === idempotencyKey (duplicate prevention)', function() {
  var entry = buildSettlementLedgerEntry(BASE_BODY, 100, PREVIEW_PLAYER_OWES);
  assertEq(entry.id, BASE_BODY.idempotencyKey, 'id matches idempotencyKey');
  // If called twice with same key, upsert onConflict=id prevents duplicate
});

test('ledger entry includes preview_snapshot', function() {
  var entry = buildSettlementLedgerEntry(BASE_BODY, 100, PREVIEW_PLAYER_OWES);
  assert(!!entry.preview_snapshot, 'snapshot present');
  var snap = JSON.parse(entry.preview_snapshot);
  assertEq(snap.owesHost, 100, 'snapshot.owesHost preserved');
});

test('ledger entry has settlement_week', function() {
  var entry = buildSettlementLedgerEntry(BASE_BODY, 100, PREVIEW_PLAYER_OWES);
  assertEq(entry.settlement_week, '2026-05-12', 'settlementWeek recorded');
});

// ── Idempotency ───────────────────────────────────────────────────────────────
console.log('\n── Idempotency ──');

test('same idempotencyKey → upsert produces 1 row (simulated)', function() {
  var seen = {};
  function fakeUpsert(entry) {
    seen[entry.id] = entry; // upsert: overwrite same id
    return Object.keys(seen).length;
  }
  var e1 = buildSettlementLedgerEntry(BASE_BODY, 100, PREVIEW_PLAYER_OWES);
  var e2 = buildSettlementLedgerEntry(BASE_BODY, 100, PREVIEW_PLAYER_OWES);
  fakeUpsert(e1); fakeUpsert(e2);
  assertEq(Object.keys(seen).length, 1, 'only 1 row after 2 upserts');
});

test('different idempotencyKeys → separate rows', function() {
  var seen = {};
  var b1 = Object.assign({}, BASE_BODY, { idempotencyKey:'K_partial1', amount:50 });
  var b2 = Object.assign({}, BASE_BODY, { idempotencyKey:'K_partial2', amount:50, settlementWeek:'2026-05-19' });
  seen[buildSettlementLedgerEntry(b1,50,PREVIEW_PLAYER_OWES).id] = 1;
  seen[buildSettlementLedgerEntry(b2,50,PREVIEW_PLAYER_OWES).id] = 1;
  assertEq(Object.keys(seen).length, 2, '2 separate keys = 2 rows');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Settlement execution tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ SETTLEMENT EXECUTION TESTS FAILED'); process.exit(1); }
else console.log('✅ All settlement execution rules verified');
