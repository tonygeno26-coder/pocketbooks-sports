/**
 * PocketBooks Sports — Conflict Prevention Tests
 * Run: node tests/conflict.test.js
 * All conflict rules must pass before implementation ships.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }

// ── Pure conflict engine (mirrors what we'll add to player.html) ─────────────

function canonicalGameKey(leg) {
  return leg.canonicalGameKey || leg.gameKey || null;
}

// Normalize pick to a conflict token for comparison.
// Two picks conflict if they are on opposite sides of the same game/market.
function pickConflictToken(leg) {
  var market = (leg.market || '').toLowerCase();
  var pick   = (leg.pick   || '').toLowerCase();
  var key    = canonicalGameKey(leg);
  if (!key) return null;

  // Totals: normalize to "total:<line>" — over and under share the same token
  if (market.includes('total') || market.includes('over') || market.includes('under')) {
    var m = pick.match(/(\d+\.?\d*)/);
    var line = m ? m[1] : 'x';
    return key + '|total|' + line;
  }
  // Run line / spread: both sides of +/- share the same token
  if (market.includes('run line') || market.includes('spread')) {
    var m2 = pick.match(/(\d+\.?\d*)/);
    var absLine = m2 ? m2[1] : 'x';
    return key + '|spread|' + absLine;
  }
  // Moneyline: both teams share the same token
  if (market.includes('moneyline') || market.includes('to win') || market.includes(' ml')) {
    return key + '|moneyline';
  }
  return key + '|' + market;
}

// Returns { conflict: true|false, reason, existingLeg } 
function checkConflict(newLeg, slipLegs, activeTickets) {
  var newToken = pickConflictToken(newLeg);
  var newKey   = canonicalGameKey(newLeg);
  if (!newToken || !newKey) return { conflict: false };

  // Check slip legs
  for (var i = 0; i < slipLegs.length; i++) {
    var existing = slipLegs[i];
    if (existing.cellId === newLeg.cellId) continue; // same cell = duplicate, not conflict
    var existToken = pickConflictToken(existing);
    if (existToken && existToken === newToken) {
      return { conflict: true, reason: 'slip_conflict', existingLeg: existing,
               message: 'Conflicting bet: you already have action on the opposite side of this game.' };
    }
  }

  // Check active tickets
  for (var j = 0; j < activeTickets.length; j++) {
    var ticket = activeTickets[j];
    if ((ticket.status||'').toLowerCase() !== 'active' && (ticket.status||'').toLowerCase() !== 'open') continue;
    var sels = ticket.selections || [];
    for (var k = 0; k < sels.length; k++) {
      var sel = sels[k];
      var selToken = pickConflictToken(sel);
      if (selToken && selToken === newToken) {
        return { conflict: true, reason: 'active_ticket_conflict', existingLeg: sel, ticketId: ticket.id,
                 message: 'Conflicting bet: you already have action on the opposite side of this game.' };
      }
    }
  }

  return { conflict: false };
}

// ── Test data helpers ─────────────────────────────────────────────────────────

var GAME_KEY_1 = 'MLB|reds|guardians|2026-05-17';
var GAME_KEY_DH1 = 'MLB|reds|guardians|2026-05-17-game1';
var GAME_KEY_DH2 = 'MLB|reds|guardians|2026-05-17-game2';

function leg(pick, market, gameKey, cellId) {
  return { pick: pick, market: market, canonicalGameKey: gameKey, cellId: cellId || pick+market };
}
function activeTx(pick, market, gameKey) {
  return { id: 'T_'+pick, status: 'active', selections: [leg(pick, market, gameKey)] };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Moneyline Conflicts ──');

test('same team ML duplicate in slip blocked', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-A2'), slip, []);
  assert(r.conflict, 'duplicate ML blocked');
});

test('opposite team ML in slip blocked', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Reds To Win', 'Moneyline', GAME_KEY_1, 'cell-B'), slip, []);
  assert(r.conflict, 'opposite ML blocked');
  assertEq(r.reason, 'slip_conflict', 'slip_conflict reason');
});

test('ML: active ticket on opposite side blocks new bet', function() {
  var active = [activeTx('Guardians To Win', 'Moneyline', GAME_KEY_1)];
  var r = checkConflict(leg('Reds To Win', 'Moneyline', GAME_KEY_1, 'cell-B'), [], active);
  assert(r.conflict, 'active ticket conflict blocked');
  assertEq(r.reason, 'active_ticket_conflict', 'active_ticket_conflict reason');
});

test('ML: different game (different canonicalGameKey) does NOT conflict', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', 'MLB|reds|guardians|2026-05-16', 'cell-A')];
  var r = checkConflict(leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-B'), slip, []);
  assert(!r.conflict, 'different game key = no conflict');
});

console.log('\n── Run Line / Spread Conflicts ──');

test('Team A +1.5 and Team B -1.5 same game blocked', function() {
  var slip = [leg('Guardians +1.5', 'Run Line', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Reds -1.5', 'Run Line', GAME_KEY_1, 'cell-B'), slip, []);
  assert(r.conflict, 'opposite spread blocked');
});

test('same spread pick twice (same cellId) = not a conflict', function() {
  var slip = [leg('Guardians +1.5', 'Run Line', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Guardians +1.5', 'Run Line', GAME_KEY_1, 'cell-A'), slip, []);
  assert(!r.conflict, 'same cellId = duplicate not conflict');
});

console.log('\n── Total / Over-Under Conflicts ──');

test('Over 8.5 and Under 8.5 same game blocked', function() {
  var slip = [leg('Over 8.5', 'Total', GAME_KEY_1, 'cell-over')];
  var r = checkConflict(leg('Under 8.5', 'Total', GAME_KEY_1, 'cell-under'), slip, []);
  assert(r.conflict, 'over/under conflict blocked');
  assertEq(r.reason, 'slip_conflict', 'reason correct');
});

test('Over 8.5 and Under 9 (different line) same game NOT blocked', function() {
  var slip = [leg('Over 8.5', 'Total', GAME_KEY_1, 'cell-over')];
  var r = checkConflict(leg('Under 9', 'Total', GAME_KEY_1, 'cell-under2'), slip, []);
  assert(!r.conflict, 'different total line = no conflict');
});

test('Over 8.5 active ticket blocks Under 8.5 new bet', function() {
  var active = [activeTx('Over 8.5', 'Total', GAME_KEY_1)];
  var r = checkConflict(leg('Under 8.5', 'Total', GAME_KEY_1, 'cell-under'), [], active);
  assert(r.conflict, 'active over blocks under');
  assertEq(r.reason, 'active_ticket_conflict', 'reason correct');
});

console.log('\n── Parlay / Multi-leg Conflicts ──');

test('parlay with opposing legs on same game blocked at second leg', function() {
  // First leg already in slip
  var slip = [leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-A')];
  // Trying to add opposing leg to parlay
  var r = checkConflict(leg('Reds To Win', 'Moneyline', GAME_KEY_1, 'cell-B'), slip, []);
  assert(r.conflict, 'parlay opposing legs blocked');
});

console.log('\n── Doubleheader Allowance ──');

test('same teams different canonicalGameKey (doubleheader) NOT blocked', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', GAME_KEY_DH1, 'cell-A')];
  var r = checkConflict(leg('Guardians To Win', 'Moneyline', GAME_KEY_DH2, 'cell-B'), slip, []);
  assert(!r.conflict, 'doubleheader game 2 = different key = allowed');
});

test('same teams same canonicalGameKey (same game) IS blocked', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', GAME_KEY_DH1, 'cell-A')];
  var r = checkConflict(leg('Reds To Win', 'Moneyline', GAME_KEY_DH1, 'cell-B'), slip, []);
  assert(r.conflict, 'same doubleheader game opposite side = blocked');
});

console.log('\n── No canonicalGameKey (legacy) ──');

test('leg with no canonicalGameKey is never blocked (safe fallback)', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', null, 'cell-A')];
  var r = checkConflict(leg('Reds To Win', 'Moneyline', null, 'cell-B'), slip, []);
  assert(!r.conflict, 'no key = no conflict check = allowed');
});

console.log('\n── Warning message ──');

test('conflict returns correct user-facing message', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Reds To Win', 'Moneyline', GAME_KEY_1, 'cell-B'), slip, []);
  assert(r.message.includes('Conflicting bet'), 'message contains "Conflicting bet"');
  assert(r.message.includes('opposite side'), 'message mentions "opposite side"');
});

console.log('\n── Different game same team: NOT blocked ──');

test('Guardians today vs Guardians tomorrow: different date key → NOT blocked', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', 'MLB|reds|guardians|2026-05-17', 'c1')];
  var r = checkConflict(leg('Guardians To Win', 'Moneyline', 'MLB|reds|guardians|2026-05-18', 'c2'), slip, []);
  assert(!r.conflict, 'different date key = different game = not blocked');
});

test('Same team, different opponent, different key → NOT blocked', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', 'MLB|reds|guardians|2026-05-17', 'c1')];
  var r = checkConflict(leg('Guardians To Win', 'Moneyline', 'MLB|tigers|guardians|2026-05-18', 'c2'), slip, []);
  assert(!r.conflict, 'different opponent+date = not blocked');
});

test('Empty canonicalGameKey → no conflict check (safe fallback)', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', '', 'c1')];
  var r = checkConflict(leg('Reds To Win', 'Moneyline', '', 'c2'), slip, []);
  assert(!r.conflict, 'empty key = null token = no block');
});

test('Settled ticket (won) does NOT block new opposite-side bet', function() {
  var active = [{ id:'T_won', status:'won', selections:[leg('Guardians To Win','Moneyline','MLB|reds|guardians|2026-05-17')] }];
  var r = checkConflict(leg('Reds To Win','Moneyline','MLB|reds|guardians|2026-05-17', 'c2'), [], active);
  assert(!r.conflict, 'settled won ticket — ignored for conflict');
});

test('Canceled ticket does NOT block new bet', function() {
  var active = [{ id:'T_can', status:'canceled', selections:[leg('Guardians To Win','Moneyline','MLB|reds|guardians|2026-05-17')] }];
  var r = checkConflict(leg('Reds To Win','Moneyline','MLB|reds|guardians|2026-05-17', 'c2'), [], active);
  assert(!r.conflict, 'canceled ticket — ignored for conflict');
});

test('Active ticket same game DOES block', function() {
  var active = [{ id:'T_act', status:'active', selections:[leg('Guardians To Win','Moneyline','MLB|reds|guardians|2026-05-17')] }];
  var r = checkConflict(leg('Reds To Win','Moneyline','MLB|reds|guardians|2026-05-17', 'c2'), [], active);
  assert(r.conflict, 'active ticket same game conflicts');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log(`Conflict tests: ${_pass} passed, ${_fail} failed`);
if (_fail > 0) { console.error('\u274c CONFLICT TESTS FAILED'); process.exit(1); }
else console.log('\u2705 All conflict rules verified');
