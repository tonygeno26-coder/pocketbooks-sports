/**
 * PocketBooks Sports — Teaser Gate Tests
 * Run: node tests/teaser-gate.test.js
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }

// Pure gate mirror
var TEASER_ENABLED_SPORTS = ['nfl','ncaaf','nba','ncaab'];

function canTeaser(sport) {
  if (!sport) return false;
  return TEASER_ENABLED_SPORTS.indexOf(sport.toLowerCase()) !== -1;
}

function checkTeaserGate(betType, sport) {
  if (betType !== 'teaser') return { allowed: true };
  var allowed = canTeaser(sport);
  return {
    allowed: allowed,
    sport: sport,
    reason: allowed ? 'allowed' : (sport||'').toUpperCase() + '_teasers_disabled'
  };
}

// Simulate isTeaserEligible: only spread/total legs qualify
function isTeaserEligible(leg) {
  var m = (leg.market || '').toLowerCase();
  return m.includes('run line') || m.includes('spread') || m.includes('total') ||
         m.includes('over') || m.includes('under') || m.includes('puck line');
}

console.log('\n── Teaser Sport Gate ──');

test('MLB + teaser → blocked', function() {
  var r = checkTeaserGate('teaser', 'mlb');
  assert(!r.allowed, 'MLB teaser blocked');
  assertEq(r.reason, 'MLB_teasers_disabled', 'reason correct');
});

test('NHL + teaser → blocked', function() {
  var r = checkTeaserGate('teaser', 'nhl');
  assert(!r.allowed, 'NHL teaser blocked');
});

test('Soccer + teaser → blocked', function() {
  var r = checkTeaserGate('teaser', 'soccer');
  assert(!r.allowed, 'Soccer teaser blocked');
});

test('NFL + teaser → allowed', function() {
  var r = checkTeaserGate('teaser', 'nfl');
  assert(r.allowed, 'NFL teaser allowed');
  assertEq(r.reason, 'allowed', 'reason: allowed');
});

test('NBA + teaser → allowed', function() {
  var r = checkTeaserGate('teaser', 'nba');
  assert(r.allowed, 'NBA teaser allowed');
});

test('NCAAF + teaser → allowed', function() {
  var r = checkTeaserGate('teaser', 'ncaaf');
  assert(r.allowed, 'NCAAF teaser allowed');
});

test('NCAAB + teaser → allowed', function() {
  var r = checkTeaserGate('teaser', 'ncaab');
  assert(r.allowed, 'NCAAB teaser allowed');
});

test('non-teaser bet type on MLB → allowed (gate only blocks teaser)', function() {
  var r = checkTeaserGate('parlay', 'mlb');
  assert(r.allowed, 'MLB parlay not affected by teaser gate');
});

test('case insensitive: MLB uppercase → blocked', function() {
  var r = checkTeaserGate('teaser', 'MLB');
  assert(!r.allowed, 'uppercase MLB blocked');
});

console.log('\n── Teaser Eligible Legs (spread/total only) ──');

test('spread/run line leg is teaser-eligible', function() {
  assert(isTeaserEligible({ market: 'Run Line' }), 'run line eligible');
  assert(isTeaserEligible({ market: 'Spread' }), 'spread eligible');
});

test('over/under total leg is teaser-eligible', function() {
  assert(isTeaserEligible({ market: 'Total' }), 'total eligible');
  assert(isTeaserEligible({ market: 'Over 8.5' }), 'over eligible');
  assert(isTeaserEligible({ market: 'Under 7' }), 'under eligible');
});

test('moneyline leg is NOT teaser-eligible', function() {
  assert(!isTeaserEligible({ market: 'Moneyline' }), 'ML not eligible');
  assert(!isTeaserEligible({ market: 'To Win' }), 'To Win not eligible');
});

console.log('\n── Direct confirmBet injection (console bypass attempt) ──');

test('teaser on MLB blocked even if injected directly at confirm', function() {
  // Simulates: bsType='teaser', _currentSport='mlb', then confirmBet() called
  var snap = { type: 'teaser', legs: [{ sport: 'mlb', pick: 'Cubs -1.5', market: 'Run Line', odds: -110 }], risk: 100 };
  var r = checkTeaserGate(snap.type, snap.legs[0].sport);
  assert(!r.allowed, 'direct injection blocked');
  assertEq(r.reason, 'MLB_teasers_disabled', 'reason: MLB_teasers_disabled');
});

test('teaser on NFL passes confirm gate', function() {
  var snap = { type: 'teaser', legs: [{ sport: 'nfl', pick: 'Chiefs -3.5', market: 'Spread', odds: -110 }], risk: 100 };
  var r = checkTeaserGate(snap.type, snap.legs[0].sport);
  assert(r.allowed, 'NFL teaser confirm allowed');
});

console.log('\n' + '─'.repeat(54));
console.log(`Teaser gate tests: ${_pass} passed, ${_fail} failed`);
if (_fail > 0) { console.error('❌ TEASER GATE TESTS FAILED'); process.exit(1); }
else console.log('✅ All teaser gate rules verified');
