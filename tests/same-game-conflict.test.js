/**
 * PocketBooks Sports — Same-Game Conflict Detection Tests
 * Run: node tests/same-game-conflict.test.js
 * Pure logic — no network.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b));
}

// ── Game ID extraction ────────────────────────────────────────────────────────

function extractGameId(leg) {
  // Priority: canonicalGameKey > providerGameId > eventId > gameId
  return leg.canonicalGameKey || leg.providerGameId || leg.eventId || leg.gameId || null;
}

// ── Conflict checker ──────────────────────────────────────────────────────────

/**
 * Check if adding newLeg to existingLegs creates a same-game conflict.
 * Returns { conflict: bool, conflictingLeg: leg|null }
 */
function checkSameGameConflict(existingLegs, newLeg) {
  var newGameId = extractGameId(newLeg);
  if (!newGameId) return { conflict: false, conflictingLeg: null };

  for (var i = 0; i < existingLegs.length; i++) {
    var existing = existingLegs[i];
    var existingGameId = extractGameId(existing);
    if (existingGameId && existingGameId === newGameId) {
      return { conflict: true, conflictingLeg: existing };
    }
  }
  return { conflict: false, conflictingLeg: null };
}

/**
 * Check if a set of legs (already in slip) contains any same-game duplicates.
 */
function findSlipConflicts(legs) {
  var seen = {};
  var conflicts = [];
  legs.forEach(function(leg) {
    var gid = extractGameId(leg);
    if (!gid) return;
    if (seen[gid]) {
      conflicts.push({ leg1: seen[gid], leg2: leg, gameId: gid });
    } else {
      seen[gid] = leg;
    }
  });
  return conflicts;
}

/**
 * Whether a bet type requires conflict-free legs.
 * Singles can share a game (separate tickets); Parlay/RR cannot.
 */
function betTypeRequiresConflictCheck(betType) {
  return betType === 'Parlay' || betType === 'RoundRobin';
}

// ── Sample legs ───────────────────────────────────────────────────────────────

var GAME_1 = 'mlb|Pittsburgh Pirates|St. Louis Cardinals|2026-05-21';
var GAME_2 = 'mlb|Chicago Cubs|Milwaukee Brewers|2026-05-21';
var GAME_3 = 'nfl|Kansas City Chiefs|Baltimore Ravens|2026-09-10';

var LEG_PIRATES_ML = { pick:'Pittsburgh Pirates', market:'moneyline', canonicalGameKey:GAME_1, odds:-120 };
var LEG_CARDS_SP   = { pick:'St. Louis Cardinals', market:'spread', canonicalGameKey:GAME_1, odds:-110 };
var LEG_PIRATES_SP = { pick:'Pittsburgh Pirates', market:'spread', canonicalGameKey:GAME_1, odds:-115 };
var LEG_CUBS_ML    = { pick:'Chicago Cubs', market:'moneyline', canonicalGameKey:GAME_2, odds:+130 };
var LEG_CHIEFS_ML  = { pick:'Kansas City Chiefs', market:'moneyline', canonicalGameKey:GAME_3, odds:-160 };

// Using providerGameId instead of canonicalGameKey
var LEG_PROVIDER_A = { pick:'Team A', market:'moneyline', providerGameId:'OI_MLB_999', odds:-110 };
var LEG_PROVIDER_B = { pick:'Team B', market:'spread',    providerGameId:'OI_MLB_999', odds:-110 };

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── extractGameId ──');

test('canonicalGameKey used first', function() {
  assertEq(extractGameId({ canonicalGameKey:'A', providerGameId:'B' }), 'A');
});
test('providerGameId used when no canonicalGameKey', function() {
  assertEq(extractGameId({ providerGameId:'B', eventId:'C' }), 'B');
});
test('eventId as fallback', function() {
  assertEq(extractGameId({ eventId:'C' }), 'C');
});
test('null when no id fields', function() {
  assert(extractGameId({}) === null);
});

console.log('\n── checkSameGameConflict ──');

test('Pirates ML + Cardinals spread = conflict (same GAME_1)', function() {
  var r = checkSameGameConflict([LEG_PIRATES_ML], LEG_CARDS_SP);
  assert(r.conflict, 'should conflict');
  assert(r.conflictingLeg === LEG_PIRATES_ML, 'conflictingLeg is Pirates ML');
});

test('Pirates ML + Cardinals spread (opposite sides, same game) = conflict', function() {
  var r = checkSameGameConflict([LEG_CARDS_SP], LEG_PIRATES_ML);
  assert(r.conflict);
});

test('Pirates ML + Pirates spread = conflict (same game, same team different market)', function() {
  var r = checkSameGameConflict([LEG_PIRATES_ML], LEG_PIRATES_SP);
  assert(r.conflict);
});

test('Pirates ML + Cubs ML = no conflict (different games)', function() {
  var r = checkSameGameConflict([LEG_PIRATES_ML], LEG_CUBS_ML);
  assert(!r.conflict);
});

test('multi-leg slip, adding third different game = no conflict', function() {
  var r = checkSameGameConflict([LEG_PIRATES_ML, LEG_CUBS_ML], LEG_CHIEFS_ML);
  assert(!r.conflict);
});

test('empty slip + any leg = no conflict', function() {
  assert(!checkSameGameConflict([], LEG_PIRATES_ML).conflict);
});

test('providerGameId match detected', function() {
  var r = checkSameGameConflict([LEG_PROVIDER_A], LEG_PROVIDER_B);
  assert(r.conflict, 'providerGameId conflict');
});

test('conflictingLeg is null when no conflict', function() {
  assert(checkSameGameConflict([LEG_CUBS_ML], LEG_CHIEFS_ML).conflictingLeg === null);
});

console.log('\n── findSlipConflicts ──');

test('slip with Pirates+Cardinals from same game = 1 conflict', function() {
  var conflicts = findSlipConflicts([LEG_PIRATES_ML, LEG_CUBS_ML, LEG_CARDS_SP]);
  assertEq(conflicts.length, 1);
  assertEq(conflicts[0].gameId, GAME_1);
});

test('clean 3-leg slip = 0 conflicts', function() {
  var conflicts = findSlipConflicts([LEG_PIRATES_ML, LEG_CUBS_ML, LEG_CHIEFS_ML]);
  assertEq(conflicts.length, 0);
});

test('two same-game pairs = 2 conflicts', function() {
  var LEG_BREWERS = { pick:'Milwaukee Brewers', market:'moneyline', canonicalGameKey:GAME_2, odds:+110 };
  var conflicts   = findSlipConflicts([LEG_PIRATES_ML, LEG_CARDS_SP, LEG_CUBS_ML, LEG_BREWERS]);
  assertEq(conflicts.length, 2);
});

test('empty slip = 0 conflicts', function() {
  assertEq(findSlipConflicts([]).length, 0);
});

test('single leg = 0 conflicts', function() {
  assertEq(findSlipConflicts([LEG_PIRATES_ML]).length, 0);
});

console.log('\n── betTypeRequiresConflictCheck ──');

test('Parlay requires conflict check', function() {
  assert(betTypeRequiresConflictCheck('Parlay'));
});
test('RoundRobin requires conflict check', function() {
  assert(betTypeRequiresConflictCheck('RoundRobin'));
});
test('Single does not require conflict check', function() {
  assert(!betTypeRequiresConflictCheck('Single'));
});
test('Teaser does not require conflict check', function() {
  assert(!betTypeRequiresConflictCheck('Teaser'));
});

console.log('\n── End-to-end gate: add leg to slip ──');

function tryAddLeg(slip, newLeg, betType) {
  if (!betTypeRequiresConflictCheck(betType)) return { ok:true };
  var check = checkSameGameConflict(slip.legs, newLeg);
  if (check.conflict) {
    return {
      ok:      false,
      error:   'same_game_conflict',
      message: 'Same-game parlays are not supported yet. Remove the existing leg from this game first.',
      conflictingLeg: check.conflictingLeg
    };
  }
  return { ok:true };
}

test('Parlay: adding same-game second leg blocked', function() {
  var slip = { legs:[LEG_PIRATES_ML], betType:'Parlay' };
  var r    = tryAddLeg(slip, LEG_CARDS_SP, 'Parlay');
  assert(!r.ok);
  assertEq(r.error, 'same_game_conflict');
  assert(r.message.includes('Same-game parlays'));
});

test('Parlay: adding different-game leg allowed', function() {
  var slip = { legs:[LEG_PIRATES_ML], betType:'Parlay' };
  assert(tryAddLeg(slip, LEG_CUBS_ML, 'Parlay').ok);
});

test('RoundRobin: same-game second leg blocked', function() {
  var slip = { legs:[LEG_PIRATES_ML], betType:'RoundRobin' };
  assert(!tryAddLeg(slip, LEG_CARDS_SP, 'RoundRobin').ok);
});

test('Single: same-game leg allowed (separate tickets)', function() {
  var slip = { legs:[LEG_PIRATES_ML], betType:'Single' };
  assert(tryAddLeg(slip, LEG_CARDS_SP, 'Single').ok);
});

test('Parlay: 3-game clean parlay builds correctly', function() {
  var slip = { legs:[], betType:'Parlay' };
  assert(tryAddLeg(slip, LEG_PIRATES_ML, 'Parlay').ok);
  slip.legs.push(LEG_PIRATES_ML);
  assert(tryAddLeg(slip, LEG_CUBS_ML, 'Parlay').ok);
  slip.legs.push(LEG_CUBS_ML);
  assert(tryAddLeg(slip, LEG_CHIEFS_ML, 'Parlay').ok);
});

test('error message mentions removing existing leg', function() {
  var r = tryAddLeg({ legs:[LEG_PIRATES_ML] }, LEG_CARDS_SP, 'Parlay');
  assert(r.message.includes('Remove the existing leg'));
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Same-game conflict tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ SAME-GAME CONFLICT TESTS FAILED'); process.exit(1); }
else console.log('✅ All same-game conflict rules verified');
