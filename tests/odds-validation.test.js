/**
 * PocketBooks Sports — Backend Odds/Stale-Line Validation Tests
 * Run: node tests/odds-validation.test.js
 * Pure logic tests — no network calls.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Odds validation engine ────────────────────────────────────────────────────

var ODDS_TOLERANCE = 3;   // allow ±3 cents movement without rejection

// Normalize: American odds → decimal
function amToDecimal(am) {
  am = parseInt(am, 10);
  if (isNaN(am)) return 1;
  return am > 0 ? (am / 100) + 1 : (100 / Math.abs(am)) + 1;
}

// Pct change between two American odds (decimal space, %)
function oddsPctDrift(submitted, live) {
  var d1 = amToDecimal(submitted);
  var d2 = amToDecimal(live);
  if (d1 === 0) return 999;
  return Math.abs((d2 - d1) / d1) * 100;
}

// Validate a single leg against live market data
function validateLeg(leg, liveMarket, nowMs, tolerancePts) {
  tolerancePts = tolerancePts != null ? tolerancePts : ODDS_TOLERANCE;
  nowMs = nowMs || Date.now();

  // Game started?
  if (leg.scheduledStart) {
    var ct = new Date(leg.scheduledStart).getTime();
    if (!isNaN(ct) && nowMs >= ct) return { ok:false, code:'game_started', leg:leg.pick };
  }

  // Market not found?
  if (!liveMarket) return { ok:false, code:'market_closed', leg:leg.pick, reason:'not_found' };

  // Market suspended/closed?
  if (liveMarket.suspended || liveMarket.closed) {
    return { ok:false, code:'market_closed', leg:leg.pick, reason: liveMarket.suspended ? 'suspended' : 'closed' };
  }

  // Find matching outcome by pick label
  var outcome = (liveMarket.outcomes || []).find(function(o) {
    return o.name && leg.pick && o.name.toLowerCase() === leg.pick.toLowerCase();
  });
  if (!outcome) return { ok:false, code:'market_closed', leg:leg.pick, reason:'outcome_not_found' };

  // Odds drift check
  var drift = Math.abs(outcome.price - leg.odds);
  if (drift > tolerancePts) {
    return {
      ok: false, code: 'odds_changed',
      leg: leg.pick, oldOdds: leg.odds, newOdds: outcome.price, drift
    };
  }

  return { ok:true, liveOdds: outcome.price, leg: leg.pick };
}

// Validate all legs — first failure blocks whole ticket
function validateAllLegs(legs, liveMarkets, nowMs) {
  for (var i = 0; i < legs.length; i++) {
    var leg = legs[i];
    var market = liveMarkets[leg.canonicalGameKey + '|' + (leg.market||'').toLowerCase()];
    var r = validateLeg(leg, market, nowMs);
    if (!r.ok) return Object.assign(r, { legIndex: i });
  }
  return { ok: true };
}

// Build snapshot of accepted-new-odds for resubmit
function buildAcceptedOddsSnapshot(legs, liveMarkets) {
  return legs.map(function(leg) {
    var key = leg.canonicalGameKey + '|' + (leg.market||'').toLowerCase();
    var market = liveMarkets[key];
    var outcome = market && (market.outcomes||[]).find(function(o){ return o.name && o.name.toLowerCase() === (leg.pick||'').toLowerCase(); });
    return Object.assign({}, leg, { odds: outcome ? outcome.price : leg.odds, oddsAcceptedAt: new Date().toISOString() });
  });
}

// ── Test data ─────────────────────────────────────────────────────────────────

var NOW    = new Date('2026-05-17T15:00:00Z').getTime(); // 3 PM UTC
var FUTURE = '2026-05-17T19:10:00Z';  // 7:10 PM — not started
var PAST   = '2026-05-17T14:00:00Z';  // 2 PM — started

function leg(pick, odds, ct, market, cKey) {
  return {
    pick: pick, odds: odds, market: market||'Moneyline',
    scheduledStart: ct||FUTURE,
    canonicalGameKey: cKey||'MLB|reds|guardians|2026-05-17'
  };
}

function market(price, pick, suspended, closed) {
  return {
    suspended: !!suspended, closed: !!closed,
    outcomes: [{ name: pick||'Guardians ML', price: price }]
  };
}

var KEY = 'MLB|reds|guardians|2026-05-17|moneyline';
var LIVE_MARKETS_OK   = {}; LIVE_MARKETS_OK[KEY]   = market(-110, 'Guardians ML');
var LIVE_MARKETS_MOVED = {}; LIVE_MARKETS_MOVED[KEY] = market(-125, 'Guardians ML');
var LIVE_MARKETS_SUSP  = {}; LIVE_MARKETS_SUSP[KEY]  = market(-110, 'Guardians ML', true);
var LIVE_MARKETS_NONE  = {};

// ── Game started ──────────────────────────────────────────────────────────────
console.log('\n── Game started check ──');

test('future game → ok', function() {
  var r = validateLeg(leg('Guardians ML', -110, FUTURE), market(-110, 'Guardians ML'), NOW);
  assert(r.ok, 'future game ok: '+(r.code||''));
});
test('started game → game_started', function() {
  var r = validateLeg(leg('Guardians ML', -110, PAST), market(-110, 'Guardians ML'), NOW);
  assert(!r.ok); assertEq(r.code, 'game_started');
});
test('no scheduledStart → not blocked on started check', function() {
  var l = leg('Guardians ML', -110, null, 'Moneyline'); l.scheduledStart = null;
  var r = validateLeg(l, market(-110, 'Guardians ML'), NOW);
  assert(r.ok || r.code !== 'game_started', 'not blocked by started');
});

// ── Market state ──────────────────────────────────────────────────────────────
console.log('\n── Market state ──');

test('open market → ok', function() {
  var r = validateLeg(leg('Guardians ML', -110), market(-110, 'Guardians ML'), NOW);
  assert(r.ok);
});
test('suspended market → market_closed', function() {
  var r = validateLeg(leg('Guardians ML', -110), market(-110, 'Guardians ML', true), NOW);
  assert(!r.ok); assertEq(r.code, 'market_closed'); assertEq(r.reason, 'suspended');
});
test('closed market → market_closed', function() {
  var r = validateLeg(leg('Guardians ML', -110), market(-110, 'Guardians ML', false, true), NOW);
  assert(!r.ok); assertEq(r.code, 'market_closed'); assertEq(r.reason, 'closed');
});
test('market not found → market_closed', function() {
  var r = validateLeg(leg('Guardians ML', -110), null, NOW);
  assert(!r.ok); assertEq(r.code, 'market_closed'); assertEq(r.reason, 'not_found');
});
test('outcome not found in market → market_closed', function() {
  var m = { suspended:false, closed:false, outcomes:[{ name:'Reds ML', price:-110 }] };
  var r = validateLeg(leg('Guardians ML', -110), m, NOW);
  assert(!r.ok); assertEq(r.code, 'market_closed'); assertEq(r.reason, 'outcome_not_found');
});

// ── Odds drift ────────────────────────────────────────────────────────────────
console.log('\n── Odds drift ──');

test('exact same odds → ok', function() {
  var r = validateLeg(leg('Guardians ML', -110), market(-110, 'Guardians ML'), NOW);
  assert(r.ok); assertEq(r.liveOdds, -110);
});
test('within tolerance (±3) → ok', function() {
  // submitted -110, live -112 → drift=2 ≤ 3
  var r = validateLeg(leg('Guardians ML', -110), market(-112, 'Guardians ML'), NOW);
  assert(r.ok, 'drift=2 within tolerance');
});
test('at exact tolerance boundary → ok', function() {
  // submitted -110, live -113 → drift=3 ≤ 3
  var r = validateLeg(leg('Guardians ML', -110), market(-113, 'Guardians ML'), NOW);
  assert(r.ok, 'drift=3 at boundary ok');
});
test('beyond tolerance (drift=15) → odds_changed', function() {
  var r = validateLeg(leg('Guardians ML', -110), market(-125, 'Guardians ML'), NOW);
  assert(!r.ok); assertEq(r.code, 'odds_changed');
  assertEq(r.oldOdds, -110); assertEq(r.newOdds, -125);
  assert(r.drift > 3, 'drift='+r.drift+' > 3');
});
test('favorable line move (player gets better odds) → still rejected if beyond tolerance', function() {
  // submitted -125, live -110 (got better) → still beyond 3pt tolerance
  var r = validateLeg(leg('Guardians ML', -125), market(-110, 'Guardians ML'), NOW);
  assert(!r.ok); assertEq(r.code, 'odds_changed');
});
test('positive odds: within tolerance → ok', function() {
  var r = validateLeg(leg('Reds ML', +105), market(+107, 'Reds ML'), NOW);
  assert(r.ok, 'drift=2 on positive odds ok');
});
test('positive odds: moved → odds_changed', function() {
  var r = validateLeg(leg('Reds ML', +105), market(+125, 'Reds ML'), NOW);
  assert(!r.ok); assertEq(r.code, 'odds_changed');
  assertEq(r.oldOdds, 105); assertEq(r.newOdds, 125);
});

// ── Parlay: one bad leg blocks all ───────────────────────────────────────────
console.log('\n── Parlay block ──');

test('parlay: all legs ok → ok', function() {
  var KEY2 = 'MLB|marlins|rays|2026-05-17|moneyline';
  var legs2 = [
    leg('Guardians ML', -110, FUTURE, 'Moneyline', 'MLB|reds|guardians|2026-05-17'),
    leg('Rays ML', -115, FUTURE, 'Moneyline', 'MLB|marlins|rays|2026-05-17')
  ];
  var lm = {}; lm[KEY] = market(-110,'Guardians ML'); lm[KEY2] = market(-115,'Rays ML');
  var r = validateAllLegs(legs2, lm, NOW);
  assert(r.ok, 'all legs ok');
});
test('parlay: leg 1 ok, leg 2 started → game_started blocks ticket', function() {
  var KEY2 = 'MLB|marlins|rays|2026-05-17|moneyline';
  var legs2 = [
    leg('Guardians ML', -110, FUTURE, 'Moneyline', 'MLB|reds|guardians|2026-05-17'),
    leg('Rays ML', -115, PAST,   'Moneyline', 'MLB|marlins|rays|2026-05-17')
  ];
  var lm = {}; lm[KEY] = market(-110,'Guardians ML'); lm[KEY2] = market(-115,'Rays ML');
  var r = validateAllLegs(legs2, lm, NOW);
  assert(!r.ok); assertEq(r.code, 'game_started'); assertEq(r.legIndex, 1);
});
test('parlay: leg 2 odds moved → odds_changed at legIndex 1', function() {
  var KEY2 = 'MLB|marlins|rays|2026-05-17|moneyline';
  var legs2 = [
    leg('Guardians ML', -110, FUTURE, 'Moneyline', 'MLB|reds|guardians|2026-05-17'),
    leg('Rays ML', -115, FUTURE, 'Moneyline', 'MLB|marlins|rays|2026-05-17')
  ];
  var lm = {}; lm[KEY] = market(-110,'Guardians ML'); lm[KEY2] = market(-140,'Rays ML'); // big move
  var r = validateAllLegs(legs2, lm, NOW);
  assert(!r.ok); assertEq(r.code, 'odds_changed'); assertEq(r.legIndex, 1);
});

// ── Accept new odds snapshot ──────────────────────────────────────────────────
console.log('\n── Accept new odds snapshot ──');

test('buildAcceptedOddsSnapshot: updates odds to live value', function() {
  var lm = {}; lm[KEY] = market(-125, 'Guardians ML');
  var legs2 = [leg('Guardians ML', -110, FUTURE, 'Moneyline', 'MLB|reds|guardians|2026-05-17')];
  var snap = buildAcceptedOddsSnapshot(legs2, lm);
  assertEq(snap[0].odds, -125, 'updated to live odds');
  assert(snap[0].oddsAcceptedAt, 'has oddsAcceptedAt timestamp');
});
test('buildAcceptedOddsSnapshot: preserves all other leg fields', function() {
  var lm = {}; lm[KEY] = market(-125, 'Guardians ML');
  var legs2 = [leg('Guardians ML', -110, FUTURE, 'Moneyline', 'MLB|reds|guardians|2026-05-17')];
  var snap = buildAcceptedOddsSnapshot(legs2, lm);
  assertEq(snap[0].pick, 'Guardians ML');
  assertEq(snap[0].market, 'Moneyline');
  assertEq(snap[0].scheduledStart, FUTURE);
});
test('buildAcceptedOddsSnapshot: outcome not found → keeps original odds', function() {
  var lm = {}; lm[KEY] = market(-125, 'WrongTeam'); // outcome name mismatch
  var legs2 = [leg('Guardians ML', -110, FUTURE, 'Moneyline', 'MLB|reds|guardians|2026-05-17')];
  var snap = buildAcceptedOddsSnapshot(legs2, lm);
  assertEq(snap[0].odds, -110, 'falls back to submitted odds');
});

// ── amToDecimal ───────────────────────────────────────────────────────────────
console.log('\n── amToDecimal ──');

test('-110 → ~1.909', function() { assert(Math.abs(amToDecimal(-110)-1.9091)<0.001); });
test('+150 → 2.5',   function() { assertEq(amToDecimal(150), 2.5); });
test('-200 → 1.5',   function() { assertEq(amToDecimal(-200), 1.5); });
test('+100 → 2.0',   function() { assertEq(amToDecimal(100), 2.0); });

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Odds validation tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ ODDS VALIDATION TESTS FAILED'); process.exit(1); }
else console.log('✅ All odds validation rules verified');
