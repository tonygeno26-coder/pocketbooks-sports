/**
 * PocketBooks Sports — Bet Placement Gate Tests
 * Run: node tests/placement-gate.test.js
 * All placement gate rules must pass before implementation ships.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}

// ── Pure placement gate (mirrors what we add to player.html) ─────────────────

var FINAL_STATUSES = new Set([
  'final','f','completed','complete','closed','cancelled','canceled',
  'postponed','suspended','forfeit','f/ot','f/so'
]);

function isGameFinal(status) {
  if (!status) return false;
  return FINAL_STATUSES.has(String(status).toLowerCase().trim());
}

function checkPlacementGate(leg, nowMs) {
  nowMs = nowMs || Date.now();
  var ct = leg.scheduledStart || leg.commenceTime || leg.time || null;
  var ctMs = ct ? new Date(ct).getTime() : 0;
  var officialStatus = (leg.gameStatus || leg.status || '').toLowerCase().trim();

  // Gate 1: game already final/completed/closed
  if (isGameFinal(officialStatus)) {
    return {
      allowed: false,
      blockedReason: 'game_already_final',
      officialStatus: officialStatus,
      message: 'Bet unavailable: this game has already started or finalized.'
    };
  }

  // Gate 2: commenceTime in the past (game already started — pregame only)
  if (ctMs > 0 && nowMs >= ctMs) {
    return {
      allowed: false,
      blockedReason: 'game_already_started',
      commenceTime: ct,
      now: new Date(nowMs).toISOString(),
      message: 'Bet unavailable: this game has already started or finalized.'
    };
  }

  return { allowed: true };
}

function checkTicketPlacementGate(legs, nowMs) {
  // All legs must pass — one invalid leg blocks the whole ticket
  for (var i = 0; i < legs.length; i++) {
    var r = checkPlacementGate(legs[i], nowMs);
    if (!r.allowed) return Object.assign({ legIndex: i }, r);
  }
  return { allowed: true };
}

// ── Test data ─────────────────────────────────────────────────────────────────
var NOW = new Date('2026-05-17T15:00:00Z').getTime(); // 3pm UTC

function futureLeg(overrides) {
  return Object.assign({
    pick: 'Guardians ML', market: 'Moneyline',
    canonicalGameKey: 'MLB|reds|guardians|2026-05-17',
    scheduledStart: '2026-05-17T19:10:00Z',  // 7:10pm UTC — future
    gameStatus: ''
  }, overrides);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Gate 1: Final/Completed/Closed Status ──');

test('final game is never bettable', function() {
  var r = checkPlacementGate(futureLeg({ gameStatus: 'Final' }), NOW);
  assert(!r.allowed, 'Final blocked');
  assertEq(r.blockedReason, 'game_already_final', 'reason correct');
});

test('completed game is never bettable', function() {
  var r = checkPlacementGate(futureLeg({ gameStatus: 'Completed' }), NOW);
  assert(!r.allowed, 'Completed blocked');
  assertEq(r.blockedReason, 'game_already_final', 'reason correct');
});

test('closed status blocked', function() {
  var r = checkPlacementGate(futureLeg({ gameStatus: 'Closed' }), NOW);
  assert(!r.allowed, 'Closed blocked');
});

test('canceled/postponed blocked', function() {
  var r1 = checkPlacementGate(futureLeg({ gameStatus: 'Canceled' }), NOW);
  var r2 = checkPlacementGate(futureLeg({ gameStatus: 'Postponed' }), NOW);
  assert(!r1.allowed, 'Canceled blocked');
  assert(!r2.allowed, 'Postponed blocked');
});

test('F/OT (final overtime) blocked', function() {
  var r = checkPlacementGate(futureLeg({ gameStatus: 'F/OT' }), NOW);
  assert(!r.allowed, 'F/OT blocked');
});

console.log('\n── Gate 2: CommenceTime in the Past ──');

test('future game (commenceTime > now) is allowed', function() {
  var r = checkPlacementGate(futureLeg(), NOW); // 7:10pm UTC, NOW = 3pm
  assert(r.allowed, 'future game allowed');
});

test('game already started (commenceTime <= now) is blocked', function() {
  var r = checkPlacementGate(futureLeg({ scheduledStart: '2026-05-17T14:00:00Z' }), NOW); // 2pm UTC, NOW=3pm
  assert(!r.allowed, 'started game blocked');
  assertEq(r.blockedReason, 'game_already_started', 'reason correct');
});

test('game started exactly at NOW is blocked', function() {
  var r = checkPlacementGate(futureLeg({ scheduledStart: new Date(NOW).toISOString() }), NOW);
  assert(!r.allowed, 'exact start time blocked');
});

test('game with no commenceTime and no status is allowed (unknown = allow)', function() {
  var r = checkPlacementGate({ pick: 'Guardians ML', market: 'Moneyline', gameStatus: '' }, NOW);
  assert(r.allowed, 'no time, no status = allowed (safe default)');
});

console.log('\n── Gate 3: Full Ticket (all legs) ──');

test('parlay: all valid legs allowed', function() {
  var legs = [
    futureLeg({ canonicalGameKey: 'MLB|reds|guardians|2026-05-17' }),
    futureLeg({ canonicalGameKey: 'MLB|cubs|cardinals|2026-05-17', scheduledStart: '2026-05-17T20:10:00Z' })
  ];
  var r = checkTicketPlacementGate(legs, NOW);
  assert(r.allowed, 'all valid legs pass');
});

test('parlay: one final leg blocks entire ticket', function() {
  var legs = [
    futureLeg({ canonicalGameKey: 'MLB|reds|guardians|2026-05-17' }),
    futureLeg({ canonicalGameKey: 'MLB|cubs|cardinals|2026-05-17', gameStatus: 'Final' })
  ];
  var r = checkTicketPlacementGate(legs, NOW);
  assert(!r.allowed, 'one final leg blocks ticket');
  assertEq(r.legIndex, 1, 'correct leg index reported');
  assertEq(r.blockedReason, 'game_already_final', 'reason correct');
});

test('parlay: one started leg blocks entire ticket', function() {
  var legs = [
    futureLeg({ scheduledStart: '2026-05-17T14:00:00Z' }), // started
    futureLeg({ scheduledStart: '2026-05-17T20:10:00Z' })  // future
  ];
  var r = checkTicketPlacementGate(legs, NOW);
  assert(!r.allowed, 'started leg blocks parlay');
  assertEq(r.legIndex, 0, 'leg 0 is the problem');
});

console.log('\n── Gate 4: Stale Board at Confirm ──');

test('stale board: game finalized between slip add and confirm — blocked at re-check', function() {
  // At add time: game status was '' (allowed)
  // At confirm time: status updated to 'Final'
  var legAtAdd    = futureLeg({ gameStatus: '' });         // was allowed
  var legAtConfirm = futureLeg({ gameStatus: 'Final' });   // now final
  var addResult    = checkPlacementGate(legAtAdd, NOW);
  var confirmResult = checkPlacementGate(legAtConfirm, NOW);
  assert(addResult.allowed,    'allowed at add time');
  assert(!confirmResult.allowed, 'blocked at confirm time — stale board');
  assertEq(confirmResult.blockedReason, 'game_already_final', 'reason correct');
});

test('stale board: game started between add and confirm', function() {
  var FUTURE = new Date(NOW - 5 * 60 * 1000).toISOString(); // 5min ago
  var legAtAdd    = futureLeg({ scheduledStart: new Date(NOW + 60000).toISOString() }); // 1min future
  var legAtConfirm = futureLeg({ scheduledStart: FUTURE }); // now past
  assert(checkPlacementGate(legAtAdd, NOW).allowed, 'allowed at add');
  assert(!checkPlacementGate(legAtConfirm, NOW).allowed, 'blocked at confirm');
});

console.log('\n── Gate 5: Doubleheader ──');

test('doubleheader game 1 (not started) is bettable', function() {
  var r = checkPlacementGate(futureLeg({
    canonicalGameKey: 'MLB|reds|guardians|2026-05-17-game1',
    scheduledStart: '2026-05-17T17:10:00Z',
    gameStatus: ''
  }), NOW);
  assert(r.allowed, 'DH game1 future — allowed');
});

test('doubleheader game 1 (final) blocks, game 2 (future) still allowed independently', function() {
  var dh1 = checkPlacementGate(futureLeg({ canonicalGameKey: 'MLB|reds|guardians|2026-05-17-game1', gameStatus: 'Final' }), NOW);
  var dh2 = checkPlacementGate(futureLeg({ canonicalGameKey: 'MLB|reds|guardians|2026-05-17-game2', scheduledStart: '2026-05-17T19:10:00Z', gameStatus: '' }), NOW);
  assert(!dh1.allowed, 'DH game1 final — blocked');
  assert(dh2.allowed,  'DH game2 future — allowed independently');
});

console.log('\n── Gate 6: Message ──');

test('blocked bet shows correct user message', function() {
  var r = checkPlacementGate(futureLeg({ gameStatus: 'Final' }), NOW);
  assert(r.message.includes('Bet unavailable'), 'message correct');
  assert(r.message.includes('started or finalized'), 'message mentions finalized');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log(`Placement gate tests: ${_pass} passed, ${_fail} failed`);
if (_fail > 0) { console.error('❌ PLACEMENT GATE TESTS FAILED'); process.exit(1); }
else console.log('✅ All placement gate rules verified');
