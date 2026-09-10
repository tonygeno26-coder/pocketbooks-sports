/**
 * PocketBooks Sports — SGP / same-game rules (superseded by parlay-correlation).
 * Run: node tests/sgp-leg-rules.test.js
 *
 * Pre-beta: fail closed. Side+total same game is CORRELATED_SGP_REQUIRED and
 * blocked until a real SGP pricing engine exists. Never invent SGP odds.
 */
'use strict';

const corr = require('../parlay-correlation');

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b));
}

var GAME_CLE = 'mlb|Cleveland Guardians|Pittsburgh Pirates|2026-05-21';
var GAME_MIA = 'mlb|Miami Marlins|New York Mets|2026-05-21';
var GAME_NFL = 'nfl|Kansas City Chiefs|Baltimore Ravens|2026-09-10';

function leg(pick, market, game) {
  return { pick:pick, market:market, canonicalGameKey:game||GAME_CLE, odds:-110, sport:(game||GAME_CLE).split('|')[0] };
}

var CLE_ML     = leg('Cleveland Guardians',      'Moneyline',       GAME_CLE);
var CLE_SPREAD = leg('Cleveland Guardians -1.5', 'Run Line',        GAME_CLE);
var PIT_SPREAD = leg('Pittsburgh Pirates +1.5',  'Run Line',        GAME_CLE);
var PIT_ML     = leg('Pittsburgh Pirates',       'Moneyline',       GAME_CLE);
var OVER_75    = leg('Over 7.5',                 'Totals',          GAME_CLE);
var UNDER_75   = leg('Under 7.5',                'Totals',          GAME_CLE);
var MIA_ML     = leg('Miami Marlins',            'Moneyline',       GAME_MIA);
var CHIEFS_ML  = leg('Kansas City Chiefs',       'Moneyline',       GAME_NFL);

console.log('\n── Blocked same-game (fail-closed / SGP required) ──');

test('Guardians ML + Guardians Run Line → CORRELATED_SGP_REQUIRED', function() {
  assertEq(corr.classifyLegRelationship(CLE_ML, CLE_SPREAD).relationship, 'CORRELATED_SGP_REQUIRED');
});
test('Guardians ML + Pirates ML → MUTUALLY_EXCLUSIVE', function() {
  assertEq(corr.classifyLegRelationship(CLE_ML, PIT_ML).relationship, 'MUTUALLY_EXCLUSIVE');
});
test('two spreads → MUTUALLY_EXCLUSIVE', function() {
  assertEq(corr.classifyLegRelationship(CLE_SPREAD, PIT_SPREAD).relationship, 'MUTUALLY_EXCLUSIVE');
});
test('Over + Under → MUTUALLY_EXCLUSIVE', function() {
  assertEq(corr.classifyLegRelationship(OVER_75, UNDER_75).relationship, 'MUTUALLY_EXCLUSIVE');
});
test('ML + Over same game blocked (no SGP engine)', function() {
  var g = corr.assertParlayCorrelationAllowed([CLE_ML, OVER_75], { betType:'Parlay' });
  assert(!g.ok);
  assertEq(g.financialMutation, 'NONE');
});

console.log('\n── Multi-game allowed ──');
test('3 different games → allowed', function() {
  var g = corr.assertParlayCorrelationAllowed([CLE_ML, MIA_ML, CHIEFS_ML], { betType:'Parlay' });
  assert(g.ok);
});

console.log('\n'+'─'.repeat(54));
console.log('SGP leg rules tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ SGP LEG RULES TESTS FAILED'); process.exit(1); }
else console.log('✅ All SGP leg rules verified (fail-closed)');
