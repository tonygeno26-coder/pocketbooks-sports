/**
 * Catalog completeness guards for BOXING / NASCAR / NCAAB / RUGBY.
 * FE-safe: empty slate over incomplete wagering; no grading enablement.
 * Run: node tests/sport-catalog-completeness.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var pass = 0;
var fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  OK ' + name);
    pass++;
  } catch (e) {
    console.error('  FAIL ' + name + '\n     ' + e.message);
    fail++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'expected true');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
}

var html = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');
var health = fs.readFileSync(path.join(__dirname, '..', 'docs', 'SPORT_FEED_HEALTH.md'), 'utf8');

console.log('\n-- Sport catalog completeness --');

test('FE tabs exist for boxing, nascar, ncaab, rugby', function() {
  ['boxing', 'nascar', 'ncaab', 'rugby'].forEach(function(s) {
    assert(html.indexOf("id=\"st-" + s + "\"") !== -1, 'missing tab ' + s);
    assert(html.indexOf("setSport(this,'" + s + "')") !== -1, 'missing setSport ' + s);
  });
});

test('odds routes map the four sports', function() {
  assert(/boxing_boxing:'boxing'/.test(html) || /boxing:'boxing'/.test(html), 'boxing route');
  assert(/nascar:'nascar'/.test(html), 'nascar route');
  assert(/ncaab:'ncaab'/.test(html), 'ncaab route');
  assert(/rugby:'rugby'/.test(html), 'rugby route');
});

test('empty copy prefers No events available', function() {
  assert(html.indexOf('No events available') !== -1);
});

test('NASCAR/golf outrights filtered via _pbIsOutrightBoard', function() {
  assert(html.indexOf('function _pbIsOutrightBoard') !== -1);
  assert(html.indexOf('_pbIsNascarSport') !== -1);
  assert(html.indexOf("games.filter(function(g){ return !_pbIsOutrightBoard(g); })") !== -1 ||
    html.indexOf('!_pbIsOutrightBoard(g)') !== -1);
});

test('outright board heuristic rejects NASCAR futures sample', function() {
  // Mirror player.html _pbIsOutrightBoard
  function isOutright(g) {
    var aw = String((g.away || g.away_team) || '');
    var hw = String((g.home || g.home_team) || '');
    if (/^outright$/i.test(hw.trim())) return true;
    if (/winner|championship|manufacturer|winning team|winning manufacturer/i.test(aw) ||
        /winner|championship|manufacturer/i.test(hw)) return true;
    var ml = Array.isArray(g.moneyline) ? g.moneyline : [];
    if (ml.length > 2) return true;
    return false;
  }
  assert(isOutright({
    away: 'Winner Nascar Enjoy Illinois 300',
    home: 'Outright',
    moneyline: [{ team: 'A', odds: 100 }, { team: 'B', odds: 200 }, { team: 'C', odds: 300 }]
  }), 'race winner board');
  assert(!isOutright({
    away: 'Driver A',
    home: 'Driver B',
    moneyline: [{ team: 'Driver A', odds: -110 }, { team: 'Driver B', odds: -110 }]
  }), 'true matchup kept');
});

test('SPORT_FEED_HEALTH documents 7-point audit for four sports', function() {
  ['BOXING', 'NASCAR', 'NCAAB', 'RUGBY'].forEach(function(s) {
    assert(health.toUpperCase().indexOf(s) !== -1, 'doc missing ' + s);
  });
  assert(/grading/i.test(health), 'doc must mention grading');
  assert(/No events available|empty slate|outright/i.test(health), 'doc must note empty-over-wager policy');
});

test('tennis removed from props allow-list (backend mismatch fix)', function() {
  var m = html.match(/_PB_PROPS_SUPPORTED_SPORTS\s*=\s*\[([^\]]+)\]/);
  assert(m, 'props list');
  assert(m[1].indexOf("'tennis'") === -1 && m[1].indexOf('"tennis"') === -1, 'tennis must not claim props');
});

console.log('\nCatalog completeness: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
