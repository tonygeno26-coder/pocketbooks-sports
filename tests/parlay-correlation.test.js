'use strict';
/**
 * PocketBooks Sports — Parlay correlation protection tests (FE mirror).
 * Run: node tests/parlay-correlation.test.js
 */
const corr = require('../parlay-correlation');

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch (e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m || '') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}

const GAME = 'mlb|Cleveland Guardians|Pittsburgh Pirates|2026-05-21';
const GAME2 = 'mlb|Miami Marlins|New York Mets|2026-05-21';
const NFL = 'nfl|Kansas City Chiefs|Baltimore Ravens|2026-09-10';

function leg(pick, market, game, extra) {
  return Object.assign({
    pick: pick, market: market, canonicalGameKey: game || GAME, odds: -110,
    sport: (game || GAME).split('|')[0]
  }, extra || {});
}

console.log('\n── FE parlay correlation matrix ──');

test('different events INDEPENDENT', function() {
  assertEq(corr.classifyLegRelationship(
    leg('Cleveland Guardians', 'moneyline', GAME),
    leg('Miami Marlins', 'moneyline', GAME2)
  ).relationship, 'INDEPENDENT');
});

test('duplicate ML', function() {
  assertEq(corr.classifyLegRelationship(
    leg('Cleveland Guardians', 'moneyline', GAME),
    leg('Cleveland Guardians', 'moneyline', GAME)
  ).relationship, 'DUPLICATE');
});

test('mutually exclusive MLs', function() {
  assertEq(corr.classifyLegRelationship(
    leg('Cleveland Guardians', 'moneyline', GAME),
    leg('Pittsburgh Pirates', 'moneyline', GAME)
  ).relationship, 'MUTUALLY_EXCLUSIVE');
});

test('overlapping alt spreads', function() {
  assertEq(corr.classifyLegRelationship(
    leg('Chiefs -3.5', 'spread', NFL),
    leg('Chiefs -7.5', 'spread', NFL)
  ).relationship, 'CORRELATED_SGP_REQUIRED');
});

test('ML + spread same game', function() {
  assertEq(corr.classifyLegRelationship(
    leg('Cleveland Guardians', 'moneyline', GAME),
    leg('Cleveland Guardians -1.5', 'spread', GAME)
  ).relationship, 'CORRELATED_SGP_REQUIRED');
});

test('total + team total', function() {
  assertEq(corr.classifyLegRelationship(
    leg('Over 7.5', 'total', GAME),
    leg('Guardians Over 3.5', 'team_total', GAME)
  ).relationship, 'CORRELATED_SGP_REQUIRED');
});

test('player prop + ML', function() {
  assertEq(corr.classifyLegRelationship(
    leg('Jose Ramirez Over 1.5', 'player_prop', GAME, { playerName: 'Jose Ramirez' }),
    leg('Cleveland Guardians', 'moneyline', GAME)
  ).relationship, 'CORRELATED_SGP_REQUIRED');
});

test('unknown same-event fail closed', function() {
  assertEq(corr.classifyLegRelationship(
    { pick: 'A', market: 'weird_x', canonicalGameKey: GAME },
    { pick: 'B', market: 'weird_y', canonicalGameKey: GAME }
  ).relationship, 'UNSUPPORTED_CORRELATION');
});

test('ML + Over blocked without SGP engine', function() {
  var g = corr.assertParlayCorrelationAllowed([
    leg('Cleveland Guardians', 'moneyline', GAME),
    leg('Over 7.5', 'total', GAME)
  ], { betType: 'Parlay' });
  assert(!g.ok);
  assertEq(g.financialMutation, 'NONE');
});

test('multi-game parlay allowed', function() {
  var g = corr.assertParlayCorrelationAllowed([
    leg('Cleveland Guardians', 'moneyline', GAME),
    leg('Miami Marlins', 'moneyline', GAME2),
    leg('Kansas City Chiefs', 'moneyline', NFL)
  ], { betType: 'Parlay' });
  assert(g.ok);
});

test('futures DEPENDENT_FUTURE', function() {
  assertEq(corr.classifyLegRelationship(
    leg('Chiefs', 'futures', NFL),
    leg('Miami Marlins', 'moneyline', GAME2)
  ).relationship, 'DEPENDENT_FUTURE');
});

test('sgpEngineSupportsCombination is false', function() {
  assert(corr.sgpEngineSupportsCombination() === false);
});

console.log('\n' + '─'.repeat(54));
console.log('FE parlay-correlation tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ FE PARLAY CORRELATION TESTS FAILED'); process.exit(1); }
console.log('✅ FE parlay correlation verified');
