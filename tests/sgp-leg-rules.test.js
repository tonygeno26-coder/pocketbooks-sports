/**
 * PocketBooks Sports — SGP Leg Validity Rules Tests
 * Run: node tests/sgp-leg-rules.test.js
 * Rules:
 *   1. SGP allowed — but only valid same-game combinations
 *   2. Block: same team ML + spread/run-line/puck-line (redundant)
 *   3. Block: both teams ML from same game
 *   4. Block: both sides of same spread (same line, opposite teams)
 *   5. Block: Over + Under same total
 *   6. Allow: side leg (ML or spread) + total leg from same game
 *   7. Multi-game parlays: no restriction
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

// ── Market classifiers ────────────────────────────────────────────────────────

function isMoneyline(market) {
  var m = (market||'').toLowerCase();
  return m.includes('moneyline') || m.includes('to win') || m.includes('h2h') || m === 'ml';
}
function isSpreadLine(market) {
  var m = (market||'').toLowerCase();
  return m.includes('spread') || m.includes('run line') || m.includes('puck line') ||
         m.includes('handicap') || m.includes('point spread');
}
function isTotal(market) {
  var m = (market||'').toLowerCase();
  return m.includes('total') || m.includes('over') || m.includes('under') ||
         m.includes('o/u') || m.includes('totals');
}
function isSideLeg(market) {
  return isMoneyline(market) || isSpreadLine(market);
}

// ── SGP combination validator ─────────────────────────────────────────────────

/**
 * Check if adding newLeg to existingLegs from the SAME GAME creates an invalid SGP combination.
 * Called only when newLeg.canonicalGameKey === existingLeg.canonicalGameKey.
 *
 * Returns { invalid: bool, reason: string|null }
 */
function checkSGPLegValidity(existingSameGameLegs, newLeg) {
  var nm = newLeg.market || '';
  var np = (newLeg.pick  || '').toLowerCase();
  var newIsML     = isMoneyline(nm);
  var newIsSpread = isSpreadLine(nm);
  var newIsTotal  = isTotal(nm);

  for (var i = 0; i < existingSameGameLegs.length; i++) {
    var ex  = existingSameGameLegs[i];
    var em  = ex.market || '';
    var ep  = (ex.pick  || '').toLowerCase();
    var exIsML     = isMoneyline(em);
    var exIsSpread = isSpreadLine(em);
    var exIsTotal  = isTotal(em);

    // Rule 1: Both teams ML (two side bets on winner) from same game
    if (newIsML && exIsML) {
      return { invalid:true, reason:'two_moneylines_same_game',
               message:'This same-game combination is not allowed.' };
    }

    // Rule 2: ML + spread/run-line (redundant side bets)
    // Block regardless of which team — any ML + any spread from same game is correlated
    if ((newIsML && exIsSpread) || (newIsSpread && exIsML)) {
      return { invalid:true, reason:'moneyline_plus_spread_same_game',
               message:'This same-game combination is not allowed.' };
    }

    // Rule 3: Two spread/run-line legs from same game (opposite or same team)
    if (newIsSpread && exIsSpread) {
      return { invalid:true, reason:'two_spreads_same_game',
               message:'This same-game combination is not allowed.' };
    }

    // Rule 4: Over + Under (opposite sides of same total)
    if (newIsTotal && exIsTotal) {
      var newIsOver  = np.includes('over');
      var newIsUnder = np.includes('under');
      var exIsOver   = ep.includes('over');
      var exIsUnder  = ep.includes('under');
      // Block any two total legs from same game (same or opposite sides)
      if ((newIsOver && exIsUnder) || (newIsUnder && exIsOver) ||
          (newIsOver && exIsOver)  || (newIsUnder && exIsUnder)) {
        return { invalid:true, reason:'two_totals_same_game',
                 message:'This same-game combination is not allowed.' };
      }
    }

    // Allow: side (ML or spread) + total from same game — falls through here
  }

  return { invalid: false, reason: null };
}

/**
 * Check a full slip for SGP validity. Returns array of violations.
 */
function validateSlipSGP(legs) {
  var byGame = {};
  legs.forEach(function(l) {
    var gk = l.canonicalGameKey || l.game || '__unknown';
    if (!byGame[gk]) byGame[gk] = [];
    byGame[gk].push(l);
  });
  var violations = [];
  Object.keys(byGame).forEach(function(gk) {
    var gLegs = byGame[gk];
    if (gLegs.length < 2) return; // single leg from this game = always fine
    for (var i = 0; i < gLegs.length; i++) {
      for (var j = i+1; j < gLegs.length; j++) {
        var r = checkSGPLegValidity([gLegs[i]], gLegs[j]);
        if (r.invalid) violations.push({ gameKey:gk, leg1:gLegs[i], leg2:gLegs[j], reason:r.reason });
      }
    }
  });
  return violations;
}

// ── Sample legs ───────────────────────────────────────────────────────────────

var GAME_CLE = 'mlb|Cleveland Guardians|Pittsburgh Pirates|2026-05-21';
var GAME_MIA = 'mlb|Miami Marlins|New York Mets|2026-05-21';
var GAME_NFL = 'nfl|Kansas City Chiefs|Baltimore Ravens|2026-09-10';

function leg(pick, market, game) {
  return { pick:pick, market:market, canonicalGameKey:game||GAME_CLE, odds:-110 };
}

var CLE_ML     = leg('Cleveland Guardians',      'Moneyline',       GAME_CLE);
var CLE_SPREAD = leg('Cleveland Guardians -1.5', 'Run Line',        GAME_CLE);
var PIT_SPREAD = leg('Pittsburgh Pirates +1.5',  'Run Line',        GAME_CLE);
var PIT_ML     = leg('Pittsburgh Pirates',       'Moneyline',       GAME_CLE);
var OVER_75    = leg('Over 7.5',                 'Totals',          GAME_CLE);
var UNDER_75   = leg('Under 7.5',                'Totals',          GAME_CLE);
var MIA_ML     = leg('Miami Marlins',            'Moneyline',       GAME_MIA);
var NYM_ML     = leg('New York Mets',            'Moneyline',       GAME_MIA);
var CHIEFS_ML  = leg('Kansas City Chiefs',       'Moneyline',       GAME_NFL);

// ── Tests: market classifiers ─────────────────────────────────────────────────

console.log('\n── Market classifiers ──');

test('Moneyline classified as ML', function(){ assert(isMoneyline('Moneyline')); });
test('"To Win" classified as ML', function(){ assert(isMoneyline('To Win')); });
test('Run Line classified as spread', function(){ assert(isSpreadLine('Run Line')); });
test('Puck Line classified as spread', function(){ assert(isSpreadLine('Puck Line')); });
test('Spread classified as spread', function(){ assert(isSpreadLine('Spread')); });
test('Totals classified as total', function(){ assert(isTotal('Totals')); });
test('Over 7.5 classified as total', function(){ assert(isTotal('Over 7.5')); });
test('Under classified as total', function(){ assert(isTotal('Under')); });
test('ML is a side leg', function(){ assert(isSideLeg('Moneyline')); });
test('Run Line is a side leg', function(){ assert(isSideLeg('Run Line')); });
test('Total is NOT a side leg', function(){ assert(!isSideLeg('Totals')); });

// ── Tests: checkSGPLegValidity ────────────────────────────────────────────────

console.log('\n── SGP combos: BLOCKED ──');

test('Guardians ML + Guardians Run Line → blocked (ML + spread same team)', function() {
  var r = checkSGPLegValidity([CLE_ML], CLE_SPREAD);
  assert(r.invalid); assertEq(r.reason, 'moneyline_plus_spread_same_game');
});

test('Guardians ML + Pirates Run Line → blocked (ML + opp spread same game)', function() {
  var r = checkSGPLegValidity([CLE_ML], PIT_SPREAD);
  assert(r.invalid); assertEq(r.reason, 'moneyline_plus_spread_same_game');
});

test('Pirates ML + Guardians Run Line → blocked (ML + spread any team)', function() {
  var r = checkSGPLegValidity([PIT_ML], CLE_SPREAD);
  assert(r.invalid); assertEq(r.reason, 'moneyline_plus_spread_same_game');
});

test('Guardians ML + Pirates ML → blocked (both teams ML)', function() {
  var r = checkSGPLegValidity([CLE_ML], PIT_ML);
  assert(r.invalid); assertEq(r.reason, 'two_moneylines_same_game');
});

test('Guardians Run Line + Pirates Run Line → blocked (two spreads)', function() {
  var r = checkSGPLegValidity([CLE_SPREAD], PIT_SPREAD);
  assert(r.invalid); assertEq(r.reason, 'two_spreads_same_game');
});

test('Over 7.5 + Under 7.5 → blocked (opposite totals)', function() {
  var r = checkSGPLegValidity([OVER_75], UNDER_75);
  assert(r.invalid); assertEq(r.reason, 'two_totals_same_game');
});

test('Over 7.5 + Over 7.5 (duplicate) → blocked (two totals)', function() {
  var r = checkSGPLegValidity([OVER_75], Object.assign({},OVER_75));
  assert(r.invalid); assertEq(r.reason, 'two_totals_same_game');
});

console.log('\n── SGP combos: ALLOWED ──');

test('Guardians ML + Over 7.5 → allowed (side + total)', function() {
  var r = checkSGPLegValidity([CLE_ML], OVER_75);
  assert(!r.invalid, 'should be allowed; got: '+(r.reason||'none'));
});

test('Guardians Run Line + Over 7.5 → allowed (spread + total)', function() {
  var r = checkSGPLegValidity([CLE_SPREAD], OVER_75);
  assert(!r.invalid);
});

test('Guardians ML + Under 7.5 → allowed (side + total)', function() {
  var r = checkSGPLegValidity([CLE_ML], UNDER_75);
  assert(!r.invalid);
});

test('Guardians Run Line + Under 7.5 → allowed (spread + total)', function() {
  var r = checkSGPLegValidity([CLE_SPREAD], UNDER_75);
  assert(!r.invalid);
});

test('empty existing legs → always allowed', function() {
  assert(!checkSGPLegValidity([], CLE_ML).invalid);
  assert(!checkSGPLegValidity([], OVER_75).invalid);
});

console.log('\n── Multi-game parlay: unrestricted ──');

test('Guardians ML (game1) + Marlins ML (game2) → allowed (different games)', function() {
  // Different canonicalGameKey → SGP check never applies
  var r = checkSGPLegValidity([], MIA_ML); // different game, no same-game legs
  assert(!r.invalid);
});

test('3 different games → no violations', function() {
  var violations = validateSlipSGP([CLE_ML, MIA_ML, CHIEFS_ML]);
  assertEq(violations.length, 0);
});

console.log('\n── validateSlipSGP: full slip scan ──');

test('slip with Guardians ML + Guardians RunLine → 1 violation', function() {
  var v = validateSlipSGP([CLE_ML, MIA_ML, CLE_SPREAD]);
  assertEq(v.length, 1);
  assertEq(v[0].reason, 'moneyline_plus_spread_same_game');
});

test('clean SGP slip (ML + Over) → 0 violations', function() {
  assertEq(validateSlipSGP([CLE_ML, OVER_75]).length, 0);
});

test('Over + Under same game in slip → 1 violation', function() {
  assertEq(validateSlipSGP([OVER_75, UNDER_75]).length, 1);
});

test('single leg from each game → 0 violations', function() {
  assertEq(validateSlipSGP([CLE_ML, MIA_ML]).length, 0);
});

test('two ML from same game in slip → 1 violation', function() {
  assertEq(validateSlipSGP([CLE_ML, PIT_ML]).length, 1);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('SGP leg rules tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ SGP LEG RULES TESTS FAILED'); process.exit(1); }
else console.log('✅ All SGP leg rules verified');
