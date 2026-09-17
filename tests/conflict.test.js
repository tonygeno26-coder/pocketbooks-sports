/**
 * PocketBooks Sports — Conflict Prevention Tests
 * Exact-duplicate active/slip identity: event + market + selection + line.
 * Run: node tests/conflict.test.js
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }

function canonicalGameKey(leg) {
  return leg.canonicalGameKey || leg.gameKey || null;
}

// Exact duplicate token (mirrors player.html _pickConflictToken)
function pickConflictToken(leg) {
  var market = (leg.market || '').toLowerCase();
  var pick   = (leg.pick   || '').toLowerCase();
  var key    = canonicalGameKey(leg);
  if (!key) return null;
  var sel = String(leg.canonicalSelectionKey || leg.canonical_selection_key || leg.side || pick || '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
  var lineRaw = leg.acceptedPointLine != null ? leg.acceptedPointLine
    : (leg.accepted_point_line != null ? leg.accepted_point_line
      : (leg.line != null ? leg.line : ''));
  var line = (lineRaw === '' || lineRaw == null) ? '' : String(Number(lineRaw));
  if (market.includes('total') || market.includes('over') || market.includes('under')) {
    return key + '|total|' + (sel || pick) + '|' + (line || (pick.match(/(\d+\.?\d*)/) || [])[1] || 'x');
  }
  if (market.includes('run line') || market.includes('spread')) {
    return key + '|spread|' + (sel || pick) + '|' + (line || (pick.match(/(\d+\.?\d*)/) || [])[1] || 'x');
  }
  if (market.includes('moneyline') || market.includes('to win') || / ml$/.test(pick)) {
    return key + '|moneyline|' + (sel || pick) + '|';
  }
  return key + '|' + market + '|' + (sel || pick) + '|' + line;
}

function checkConflict(newLeg, slipLegs, activeTickets) {
  var newToken = pickConflictToken(newLeg);
  var newKey   = canonicalGameKey(newLeg);
  if (!newToken || !newKey) return { conflict: false };

  for (var i = 0; i < slipLegs.length; i++) {
    var existing = slipLegs[i];
    if (existing.cellId === newLeg.cellId) continue;
    var existToken = pickConflictToken(existing);
    if (existToken && existToken === newToken) {
      return { conflict: true, reason: 'slip_conflict', existingLeg: existing,
               message: 'You already have this wager active.' };
    }
  }

  for (var j = 0; j < activeTickets.length; j++) {
    var ticket = activeTickets[j];
    if ((ticket.status||'').toLowerCase() !== 'active' && (ticket.status||'').toLowerCase() !== 'open') continue;
    var sels = ticket.selections || [];
    for (var k = 0; k < sels.length; k++) {
      var sel = sels[k];
      var selToken = pickConflictToken(sel);
      if (selToken && selToken === newToken) {
        return { conflict: true, reason: 'active_ticket_conflict', existingLeg: sel, ticketId: ticket.id,
                 message: 'You already have this wager active.' };
      }
    }
  }

  return { conflict: false };
}

var GAME_KEY_1 = 'MLB|reds|guardians|2026-05-17';
var GAME_KEY_DH1 = 'MLB|reds|guardians|2026-05-17-game1';
var GAME_KEY_DH2 = 'MLB|reds|guardians|2026-05-17-game2';

function leg(pick, market, gameKey, cellId) {
  return { pick: pick, market: market, canonicalGameKey: gameKey, cellId: cellId || pick+market };
}
function activeTx(pick, market, gameKey) {
  return { id: 'T_'+pick, status: 'active', selections: [leg(pick, market, gameKey)] };
}

console.log('\n── Moneyline Conflicts ──');

test('same team ML duplicate in slip blocked', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-A2'), slip, []);
  assert(r.conflict, 'duplicate ML blocked');
});

test('opposite team ML in slip allowed (not exact duplicate)', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Reds To Win', 'Moneyline', GAME_KEY_1, 'cell-B'), slip, []);
  assert(!r.conflict, 'opposite ML is distinct selection');
});

test('ML: active ticket on opposite side does NOT block', function() {
  var active = [activeTx('Guardians To Win', 'Moneyline', GAME_KEY_1)];
  var r = checkConflict(leg('Reds To Win', 'Moneyline', GAME_KEY_1, 'cell-B'), [], active);
  assert(!r.conflict, 'opposite active ML allowed');
});

test('ML: active ticket exact same selection blocks', function() {
  var active = [activeTx('Guardians To Win', 'Moneyline', GAME_KEY_1)];
  var r = checkConflict(leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-B'), [], active);
  assert(r.conflict, 'exact active ML blocked');
  assertEq(r.reason, 'active_ticket_conflict', 'active_ticket_conflict reason');
});

test('ML: different game (different canonicalGameKey) does NOT conflict', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', 'MLB|reds|guardians|2026-05-16', 'cell-A')];
  var r = checkConflict(leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-B'), slip, []);
  assert(!r.conflict, 'different game key = no conflict');
});

console.log('\n── Run Line / Spread Conflicts ──');

test('Team A +1.5 and Team B -1.5 same game allowed (distinct selections)', function() {
  var slip = [leg('Guardians +1.5', 'Run Line', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Reds -1.5', 'Run Line', GAME_KEY_1, 'cell-B'), slip, []);
  assert(!r.conflict, 'opposite spread is distinct selection');
});

test('exact same spread pick twice (different cellId) blocked', function() {
  var slip = [leg('Guardians +1.5', 'Run Line', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Guardians +1.5', 'Run Line', GAME_KEY_1, 'cell-A2'), slip, []);
  assert(r.conflict, 'exact spread duplicate blocked');
});

test('same spread pick twice (same cellId) = not a conflict', function() {
  var slip = [leg('Guardians +1.5', 'Run Line', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Guardians +1.5', 'Run Line', GAME_KEY_1, 'cell-A'), slip, []);
  assert(!r.conflict, 'same cellId = duplicate not conflict');
});

console.log('\n── Total / Over-Under Conflicts ──');

test('Over 8.5 and Under 8.5 same game allowed (distinct selections)', function() {
  var slip = [leg('Over 8.5', 'Total', GAME_KEY_1, 'cell-over')];
  var r = checkConflict(leg('Under 8.5', 'Total', GAME_KEY_1, 'cell-under'), slip, []);
  assert(!r.conflict, 'over/under are distinct selections');
});

test('Over 8.5 and Under 9 (different line) same game NOT blocked', function() {
  var slip = [leg('Over 8.5', 'Total', GAME_KEY_1, 'cell-over')];
  var r = checkConflict(leg('Under 9', 'Total', GAME_KEY_1, 'cell-under2'), slip, []);
  assert(!r.conflict, 'different total line = no conflict');
});

test('exact Over 8.5 active ticket blocks same Over 8.5', function() {
  var active = [activeTx('Over 8.5', 'Total', GAME_KEY_1)];
  var r = checkConflict(leg('Over 8.5', 'Total', GAME_KEY_1, 'cell-over2'), [], active);
  assert(r.conflict, 'exact total duplicate blocked');
  assertEq(r.reason, 'active_ticket_conflict', 'reason correct');
});

console.log('\n── Distinct markets same event ──');

test('ML + Total same game NOT blocked', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Over 8.5', 'Total', GAME_KEY_1, 'cell-over'), slip, []);
  assert(!r.conflict, 'distinct markets allowed');
});

test('ML + Run Line same game NOT blocked', function() {
  var active = [activeTx('Guardians To Win', 'Moneyline', GAME_KEY_1)];
  var r = checkConflict(leg('Guardians +1.5', 'Run Line', GAME_KEY_1, 'cell-rl'), [], active);
  assert(!r.conflict, 'ML + RL distinct markets');
});

console.log('\n── Doubleheader Allowance ──');

test('same teams different canonicalGameKey (doubleheader) NOT blocked', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', GAME_KEY_DH1, 'cell-A')];
  var r = checkConflict(leg('Guardians To Win', 'Moneyline', GAME_KEY_DH2, 'cell-B'), slip, []);
  assert(!r.conflict, 'doubleheader game 2 = different key = allowed');
});

console.log('\n── No canonicalGameKey (legacy) ──');

test('leg with no canonicalGameKey is never blocked (safe fallback)', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', null, 'cell-A')];
  var r = checkConflict(leg('Reds To Win', 'Moneyline', null, 'cell-B'), slip, []);
  assert(!r.conflict, 'no key = no conflict check = allowed');
});

console.log('\n── Warning message ──');

test('conflict returns clean user-facing message', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-A')];
  var r = checkConflict(leg('Guardians To Win', 'Moneyline', GAME_KEY_1, 'cell-B'), slip, []);
  assert(r.message.includes('already have this wager'), 'clean duplicate message');
});

console.log('\n── Different game same team: NOT blocked ──');

test('Guardians today vs Guardians tomorrow: different date key → NOT blocked', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', 'MLB|reds|guardians|2026-05-17', 'c1')];
  var r = checkConflict(leg('Guardians To Win', 'Moneyline', 'MLB|reds|guardians|2026-05-18', 'c2'), slip, []);
  assert(!r.conflict, 'different date key = different game = not blocked');
});

test('Empty canonicalGameKey → no conflict check (safe fallback)', function() {
  var slip = [leg('Guardians To Win', 'Moneyline', '', 'c1')];
  var r = checkConflict(leg('Reds To Win', 'Moneyline', '', 'c2'), slip, []);
  assert(!r.conflict, 'empty key = null token = no block');
});

test('Settled ticket (won) does NOT block new exact same bet', function() {
  var active = [{ id:'T_won', status:'won', selections:[leg('Guardians To Win','Moneyline','MLB|reds|guardians|2026-05-17')] }];
  var r = checkConflict(leg('Guardians To Win','Moneyline','MLB|reds|guardians|2026-05-17', 'c2'), [], active);
  assert(!r.conflict, 'settled won ticket — ignored for conflict');
});

test('Canceled ticket does NOT block new bet', function() {
  var active = [{ id:'T_can', status:'canceled', selections:[leg('Guardians To Win','Moneyline','MLB|reds|guardians|2026-05-17')] }];
  var r = checkConflict(leg('Guardians To Win','Moneyline','MLB|reds|guardians|2026-05-17', 'c2'), [], active);
  assert(!r.conflict, 'canceled ticket — ignored for conflict');
});

test('Active ticket exact same selection DOES block', function() {
  var active = [{ id:'T_act', status:'active', selections:[leg('Guardians To Win','Moneyline','MLB|reds|guardians|2026-05-17')] }];
  var r = checkConflict(leg('Guardians To Win','Moneyline','MLB|reds|guardians|2026-05-17', 'c2'), [], active);
  assert(r.conflict, 'active ticket exact duplicate conflicts');
});

console.log('\n' + '─'.repeat(54));
console.log(`Conflict tests: ${_pass} passed, ${_fail} failed`);
if (_fail > 0) { console.error('\u274c CONFLICT TESTS FAILED'); process.exit(1); }
else console.log('\u2705 All conflict rules verified');
