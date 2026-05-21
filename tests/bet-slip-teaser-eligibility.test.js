/**
 * PocketBooks Sports — Bet-slip teaser eligibility tests
 *
 * Exercises the player-side isTeaserEligible(b) + isSlipTeaserEligible()
 * helpers in player.html. The helpers gate the Teaser tab in the bet slip
 * — getting them wrong means a player can build (and try to place) a
 * teaser the sportsbook would never accept (e.g. MLB run-line teaser).
 *
 * Run: node tests/bet-slip-teaser-eligibility.test.js
 *
 * Pure-logic test: extracts the JS block from player.html and evaluates
 * the helper function source directly. No DB, no network.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const PLAYER_HTML = path.join(__dirname, '..', 'player.html');
const src         = fs.readFileSync(PLAYER_HTML, 'utf8');

// Pull the inline JS block (script #2) that owns the slip code.
const scriptRx = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
const scripts  = [];
let m;
while ((m = scriptRx.exec(src)) !== null) scripts.push(m[1]);
if (scripts.length < 2) {
  console.error('FATAL: player.html script extraction failed (got ' + scripts.length + ' blocks).');
  process.exit(1);
}
const scriptBody = scripts[1];

function ext(startNeedle, endNeedle) {
  const s = scriptBody.indexOf(startNeedle);
  const e = scriptBody.indexOf(endNeedle, s + startNeedle.length);
  if (s < 0 || e < 0) {
    throw new Error('extract miss: ' + startNeedle + ' .. ' + endNeedle);
  }
  return scriptBody.slice(s, e);
}

// Build a tiny harness with synthetic globals + the real helpers.
let harness = '';
harness += '\'use strict\';\n';
harness += 'var _currentSport = "mlb";\n';
harness += 'var betSlip = [];\n';
harness += ext('// Markets that *could* be teased',  'function _teaserSportKey') + '\n';
harness += ext('function _teaserSportKey',           'function isTeaserEligible') + '\n';
harness += ext('function isTeaserEligible',          'function isSlipTeaserEligible') + '\n';
harness += ext('function isSlipTeaserEligible',      'function getTeaserLegs') + '\n';
harness += 'module.exports = {\n';
harness += '  isTeaserEligible: isTeaserEligible,\n';
harness += '  isSlipTeaserEligible: isSlipTeaserEligible,\n';
harness += '  setSport: function(s){ _currentSport = s; },\n';
harness += '  setSlip:  function(s){ betSlip = s; }\n';
harness += '};\n';

const tmp = path.join(require('os').tmpdir(), 'pbs_teaser_helpers_' + process.pid + '.js');
fs.writeFileSync(tmp, harness, 'utf8');

let h;
try { h = require(tmp); }
catch (e) {
  console.error('FATAL: harness eval failed: ' + (e.message || e));
  console.error(harness.slice(0, 1200));
  process.exit(1);
}

let pass = 0, fail = 0;
function test(name, got, want) {
  const ok = (got === want);
  if (ok) { console.log('  \u2705 ' + name); pass++; }
  else    { console.log('  \u274c ' + name + ' (got=' + got + ' want=' + want + ')'); fail++; }
}

// ── isTeaserEligible: per-leg ─────────────────────────────────────────────
console.log('\n── isTeaserEligible (per-leg) ──');
test('NFL spread eligible',           h.isTeaserEligible({sport:'nfl',   market:'spread',    pick:'CHI -3.5'}),      true);
test('NFL total eligible',            h.isTeaserEligible({sport:'nfl',   market:'total',     pick:'Over 47'}),       true);
test('NCAAF spread eligible',         h.isTeaserEligible({sport:'ncaaf', market:'spread',    pick:'TEX -7'}),        true);
test('NFL moneyline NOT eligible',    h.isTeaserEligible({sport:'nfl',   market:'moneyline', pick:'CHI ML'}),        false);
test('NBA spread eligible',           h.isTeaserEligible({sport:'nba',   market:'spread',    pick:'LAL -4'}),        true);
test('NBA total eligible',            h.isTeaserEligible({sport:'nba',   market:'total',     pick:'Over 220'}),      true);
test('NBA moneyline NOT eligible',    h.isTeaserEligible({sport:'nba',   market:'moneyline', pick:'LAL ML'}),        false);
test('NCAAB spread eligible',         h.isTeaserEligible({sport:'ncaab', market:'spread',    pick:'DUKE -4'}),       true);
test('MLB spread (run line) NOT',     h.isTeaserEligible({sport:'mlb',   market:'run line',  pick:'NYY -1.5'}),      false);
test('MLB total NOT',                 h.isTeaserEligible({sport:'mlb',   market:'total',     pick:'Over 8.5'}),      false);
test('MLB moneyline NOT',             h.isTeaserEligible({sport:'mlb',   market:'moneyline', pick:'NYY ML'}),        false);
test('NHL spread (puck line) NOT',    h.isTeaserEligible({sport:'nhl',   market:'spread',    pick:'BOS -1.5'}),      false);
test('NHL total NOT',                 h.isTeaserEligible({sport:'nhl',   market:'total',     pick:'Over 6.5'}),      false);
test('soccer spread NOT',             h.isTeaserEligible({sport:'soccer',market:'spread',    pick:'ARS -0.5'}),      false);
test('tennis spread NOT',             h.isTeaserEligible({sport:'tennis',market:'spread',    pick:'Alcaraz -1.5'}),  false);
test('golf NOT (no sport flag)',      h.isTeaserEligible({sport:'golf',  market:'spread',    pick:'whatever'}),      false);
test('null entry NOT',                h.isTeaserEligible(null),                                                       false);
test('empty market NOT',              h.isTeaserEligible({sport:'nfl', market:'', pick:''}),                          false);
test('long-form americanfootball_nfl eligible',
                                       h.isTeaserEligible({sport:'americanfootball_nfl', market:'spread', pick:'CHI -3.5'}), true);
test('long-form basketball_nba eligible',
                                       h.isTeaserEligible({sport:'basketball_nba',       market:'spread', pick:'LAL -4'}),   true);
test('UPPERCASE sport tolerated',     h.isTeaserEligible({sport:'NFL', market:'Spread', pick:'CHI'}),                  true);
test('missing sport falls back to _currentSport=mlb -> NOT',
                                       h.isTeaserEligible({market:'spread', pick:'NYY -1.5'}),                          false);

// ── isSlipTeaserEligible: whole slip ──────────────────────────────────────
console.log('\n── isSlipTeaserEligible (whole slip) ──');
h.setSlip([]);
test('empty slip NOT',                h.isSlipTeaserEligible(),                                                       false);
h.setSlip([{sport:'nfl',market:'spread',pick:'a'}]);
test('single NFL leg NOT (<2)',       h.isSlipTeaserEligible(),                                                       false);
h.setSlip([{sport:'nfl',market:'spread',pick:'a'},{sport:'nfl',market:'total',pick:'b'}]);
test('two NFL legs YES',              h.isSlipTeaserEligible(),                                                       true);
h.setSlip([{sport:'nfl',market:'spread',pick:'a'},{sport:'mlb',market:'run line',pick:'b'}]);
test('NFL + MLB mix NOT',             h.isSlipTeaserEligible(),                                                       false);
h.setSlip([{sport:'nba',market:'spread',pick:'a'},{sport:'ncaaf',market:'total',pick:'b'},{sport:'nfl',market:'spread',pick:'c'}]);
test('NBA+NCAAF+NFL all eligible YES',h.isSlipTeaserEligible(),                                                       true);
h.setSlip([{sport:'nba',market:'moneyline',pick:'a'},{sport:'nfl',market:'spread',pick:'b'}]);
test('NBA-moneyline pollutes slip',   h.isSlipTeaserEligible(),                                                       false);

// cleanup
try { fs.unlinkSync(tmp); } catch(_e){}

console.log('\n' + '\u2500'.repeat(54));
console.log('Bet-slip teaser eligibility tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\u274c FAIL'); process.exit(1); }
console.log('\u2705 All bet-slip teaser eligibility rules verified');
