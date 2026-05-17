/**
 * PocketBooks Sports — Player Sport Access Gate Tests
 * Run: node tests/sport-access.test.js
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }

// ── Pure sport access engine (mirrors player.html implementation) ─────────────

// Player limits shape: { sportAccess: { mlb: true, nba: true, nhl: false, ... } }
// Absence of a key = allowed (default open, host must explicitly block)
var DEFAULT_ALLOWED_SPORTS = ['mlb','nba','nhl','nfl','soccer','ufl','ncaaf','ncaab','tennis','golf'];

function getSportAccess(limits) {
  // Returns object: { mlb: true, nba: false, ... }
  if (!limits || !limits.sportAccess) return null; // no restrictions set = all allowed
  return limits.sportAccess;
}

function isSportAllowed(sport, limits) {
  var access = getSportAccess(limits);
  if (!access) return true; // no restrictions = all allowed
  var s = (sport || '').toLowerCase();
  // If key missing from sportAccess, default to allowed
  if (!(s in access)) return true;
  return access[s] === true;
}

function checkSportAccessGate(sport, limits, playerId, clubId) {
  var allowed = isSportAllowed(sport, limits);
  var access = getSportAccess(limits);
  return {
    allowed: allowed,
    sport: (sport||'').toUpperCase(),
    playerId: playerId || '?',
    clubId: clubId || '?',
    source: access ? 'host_limits' : 'default_open',
    blockedReason: allowed ? null : 'host_disabled_sport'
  };
}

function checkTicketSportAccess(legs, limits, playerId, clubId) {
  for (var i = 0; i < legs.length; i++) {
    var sport = (legs[i].sport || legs[i].league || '').toLowerCase();
    if (!sport) continue; // no sport tag = skip check
    var r = checkSportAccessGate(sport, limits, playerId, clubId);
    if (!r.allowed) return Object.assign({ legIndex: i }, r);
  }
  return { allowed: true };
}

// ── Test data ─────────────────────────────────────────────────────────────────

var LIMITS_MLB_BLOCKED = { sportAccess: { mlb: false, nba: true, nhl: true, nfl: true, soccer: true } };
var LIMITS_ALL_OPEN    = { sportAccess: { mlb: true,  nba: true, nhl: true, nfl: true, soccer: true } };
var LIMITS_NONE        = null; // no limits set at all
var LIMITS_PARTIAL     = { sportAccess: { mlb: false } }; // only MLB blocked, others default open

function leg(sport) { return { pick: 'Team ML', market: 'Moneyline', sport: sport, odds: -110 }; }

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Host disables MLB ──');

test('host disables MLB → player cannot bet MLB', function() {
  var r = checkSportAccessGate('mlb', LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(!r.allowed, 'MLB blocked');
  assertEq(r.blockedReason, 'host_disabled_sport', 'reason correct');
  assertEq(r.source, 'host_limits', 'source: host_limits');
});

test('host enables MLB → player can bet MLB', function() {
  var r = checkSportAccessGate('mlb', LIMITS_ALL_OPEN, 'P001', 'C001');
  assert(r.allowed, 'MLB allowed when enabled');
});

test('host disables MLB but NBA still works', function() {
  var rMlb = checkSportAccessGate('mlb', LIMITS_MLB_BLOCKED, 'P001', 'C001');
  var rNba = checkSportAccessGate('nba', LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(!rMlb.allowed, 'MLB blocked');
  assert(rNba.allowed,  'NBA still allowed');
});

test('no limits set → all sports allowed (default open)', function() {
  var r = checkSportAccessGate('mlb', LIMITS_NONE, 'P001', 'C001');
  assert(r.allowed, 'MLB allowed with no limits');
  assertEq(r.source, 'default_open', 'source: default_open');
});

test('partial limits (only MLB blocked) → other sports default open', function() {
  var rMlb = checkSportAccessGate('mlb', LIMITS_PARTIAL, 'P001', 'C001');
  var rNhl = checkSportAccessGate('nhl', LIMITS_PARTIAL, 'P001', 'C001');
  assert(!rMlb.allowed, 'MLB blocked');
  assert(rNhl.allowed,  'NHL defaults to allowed (key absent)');
});

console.log('\n── Ticket / Parlay Level ──');

test('single leg on disabled sport → blocked', function() {
  var r = checkTicketSportAccess([leg('mlb')], LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(!r.allowed, 'single MLB leg blocked');
  assertEq(r.legIndex, 0, 'leg 0 is blocked');
});

test('parlay: one disabled leg blocks whole ticket', function() {
  var legs = [leg('nba'), leg('mlb'), leg('nfl')];
  var r = checkTicketSportAccess(legs, LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(!r.allowed, 'parlay blocked due to MLB leg');
  assertEq(r.legIndex, 1, 'leg 1 (mlb) is the blocker');
});

test('parlay: all enabled sports → allowed', function() {
  var legs = [leg('nba'), leg('nfl'), leg('nhl')];
  var r = checkTicketSportAccess(legs, LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(r.allowed, 'parlay with all enabled sports passes');
});

test('leg with no sport tag → skip check (safe default)', function() {
  var legs = [{ pick: 'Team ML', market: 'Moneyline', odds: -110 }]; // no sport
  var r = checkTicketSportAccess(legs, LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(r.allowed, 'no sport tag = skip check = allowed');
});

console.log('\n── Console injection (direct confirmBet bypass) ──');

test('stale slip with disabled sport blocked at confirm re-check', function() {
  // snap built when sport was enabled, then host disables it before confirm
  var snap = { type: 'straight', legs: [leg('mlb')], risk: 100 };
  var r = checkTicketSportAccess(snap.legs, LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(!r.allowed, 'stale slip blocked at confirm');
  assertEq(r.blockedReason, 'host_disabled_sport', 'reason correct');
});

test('direct console injection with disabled sport → blocked', function() {
  var injectedLegs = [{ sport: 'mlb', pick: 'Cardinals ML', market: 'Moneyline', odds: -150 }];
  var r = checkTicketSportAccess(injectedLegs, LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(!r.allowed, 'console injection blocked');
});

console.log('\n── Audit log fields ──');

test('gate result includes all required audit fields', function() {
  var r = checkSportAccessGate('mlb', LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(r.sport      !== undefined, 'sport present');
  assert(r.playerId   !== undefined, 'playerId present');
  assert(r.clubId     !== undefined, 'clubId present');
  assert(r.source     !== undefined, 'source present');
  assert(r.blockedReason !== undefined, 'blockedReason present');
  assertEq(r.sport, 'MLB', 'sport uppercased');
});

test('allowed result has null blockedReason', function() {
  var r = checkSportAccessGate('nba', LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(r.allowed, 'NBA allowed');
  assert(r.blockedReason === null, 'blockedReason null when allowed');
});

console.log('\n── Case insensitive ──');

test('sport check is case insensitive (MLB uppercase → blocked)', function() {
  var r = checkSportAccessGate('MLB', LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(!r.allowed, 'uppercase MLB blocked');
});

test('sport check is case insensitive (Mlb mixed case → blocked)', function() {
  var r = checkSportAccessGate('Mlb', LIMITS_MLB_BLOCKED, 'P001', 'C001');
  assert(!r.allowed, 'mixed case Mlb blocked');
});

console.log('\n' + '─'.repeat(54));
console.log(`Sport access tests: ${_pass} passed, ${_fail} failed`);
if (_fail > 0) { console.error('❌ SPORT ACCESS TESTS FAILED'); process.exit(1); }
else console.log('✅ All sport access rules verified');
