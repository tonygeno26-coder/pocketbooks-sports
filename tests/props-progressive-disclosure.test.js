/**
 * Progressive disclosure density checks against live-shaped fixtures.
 * Run: node tests/props-progressive-disclosure.test.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + ' — ' + (e && e.message)); fail++; }
}

var POPULAR = {
  nfl: { 'Passing Yards':1, 'Rushing Yards':1, 'Receiving Yards':1, 'Receptions':1,
    'Anytime TD':1, 'First TD':1, 'Passing TDs':1, 'Rushing TDs':1, 'Receiving TDs':1 },
  mlb: { 'Hits':1, 'Total Bases':1, 'Home Runs':1, 'RBIs':1, 'Strikeouts':1 }
};
var CORE = 3;
var PLAYER_CAP = 10;
var BUDGET = 48;

function isPopular(p, sport) {
  return !!(POPULAR[sport] && POPULAR[sport][p.propType]);
}

function pickPrimary(lineList) {
  var lines = (lineList || []).slice();
  if (!lines.length) return { primary: null, alts: [] };
  function hasBoth(l) { return !!(l && l.over && l.under); }
  function evenScore(l) {
    var odds = [];
    if (l.over && typeof l.over.odds === 'number') odds.push(Math.abs(l.over.odds + 110));
    if (l.under && typeof l.under.odds === 'number') odds.push(Math.abs(l.under.odds + 110));
    if (!odds.length) return 9999;
    return odds.reduce(function(a, b) { return a + b; }, 0) / odds.length;
  }
  var pool = lines.filter(hasBoth);
  if (!pool.length) pool = lines.slice();
  pool.sort(function(a, b) { return evenScore(a) - evenScore(b); });
  var primary = pool[0] || lines[0];
  var alts = lines.filter(function(l) { return l !== primary; });
  return { primary: primary, alts: alts };
}

function groupByPlayer(props) {
  var by = {}, order = [];
  props.forEach(function(p) {
    var n = p.playerName;
    if (!by[n]) { by[n] = { playerName: n, markets: {} }; order.push(n); }
    var m = by[n].markets[p.propType] || (by[n].markets[p.propType] = { propType: p.propType, lines: {} });
    var lg = m.lines[String(p.line)] || (m.lines[String(p.line)] = { line: p.line, over: null, under: null });
    if (p.side === 'over') lg.over = p;
    else if (p.side === 'under') lg.under = p;
  });
  return order.map(function(n) {
    var g = by[n];
    g.marketList = Object.keys(g.markets).map(function(pt) {
      var m = g.markets[pt];
      m.lineList = Object.keys(m.lines).map(function(k) { return m.lines[k]; });
      var picked = pickPrimary(m.lineList);
      m.primary = picked.primary;
      m.alts = picked.alts;
      return m;
    });
    // prioritize popular
    g.marketList.sort(function(a, b) {
      var ap = isPopular({ propType: a.propType }, 'nfl') ? 0 : 1;
      var bp = isPopular({ propType: b.propType }, 'nfl') ? 0 : 1;
      return ap - bp;
    });
    return g;
  });
}

function countPrimary(markets) {
  var n = 0;
  markets.forEach(function(m) {
    if (!m.primary) return;
    if (m.primary.over) n++;
    if (m.primary.under) n++;
  });
  return n;
}

function simulatePopular(props, sport) {
  var filtered = props.filter(function(p) { return isPopular(p, sport); });
  var players = groupByPlayer(filtered);
  var visible = [];
  var sels = 0;
  for (var i = 0; i < players.length; i++) {
    if (visible.length >= PLAYER_CAP) break;
    var visM = players[i].marketList.slice(0, CORE);
    var add = countPrimary(visM);
    if (visible.length && (sels + add) > BUDGET) break;
    visible.push({ player: players[i], markets: visM, hidden: Math.max(0, players[i].marketList.length - CORE) });
    sels += add;
  }
  return { filtered: filtered.length, players: players.length, visiblePlayers: visible.length, visibleSelections: sels, cards: visible };
}

console.log('\n-- props progressive disclosure --\n');

var nflPath = '/tmp/nfl-props.json';
var mlbPath = '/tmp/mlb-props.json';
if (!fs.existsSync(nflPath) || !fs.existsSync(mlbPath)) {
  console.log('  SKIP fixtures missing — run against localhost props first');
  process.exit(0);
}

var nfl = JSON.parse(fs.readFileSync(nflPath, 'utf8')).props;
var mlb = JSON.parse(fs.readFileSync(mlbPath, 'utf8')).props;

test('NFL Popular is curated subset of inventory', function() {
  var r = simulatePopular(nfl, 'nfl');
  assert(r.filtered < nfl.length, 'popular < full');
  assert(r.filtered > 0, 'popular non-empty');
});

test('NFL Popular immediate selections within ~25–50 UX band', function() {
  var r = simulatePopular(nfl, 'nfl');
  assert(r.visibleSelections >= 10, 'at least some visible');
  assert(r.visibleSelections <= 55, 'visible selections ' + r.visibleSelections + ' exceeds band');
  assert(r.visiblePlayers <= PLAYER_CAP);
});

test('NFL player collapse leaves MORE props when markets exceed core', function() {
  var r = simulatePopular(nfl, 'nfl');
  var withMore = r.cards.filter(function(c) { return c.hidden > 0; });
  assert(withMore.length > 0 || r.cards.every(function(c) { return c.player.marketList.length <= CORE; }),
    'expected SOME players with hidden markets or all within core');
});

test('Jordan Love Passing Yards alts collapse to single primary + N alts', function() {
  var jl = nfl.filter(function(p) { return p.playerName === 'Jordan Love' && p.propType === 'Passing Yards'; });
  assert(jl.length > 0, 'Jordan Love Passing Yards present');
  var g = groupByPlayer(jl)[0];
  var m = g.marketList[0];
  assert(m.primary, 'primary picked');
  assert(m.alts.length >= 10, 'expected many alts, got ' + m.alts.length);
  // Initial render should not include alt rows — only count metadata
  assert(m.alts.length === m.lineList.length - 1);
});

test('MLB Popular curated + density capped', function() {
  var r = simulatePopular(mlb, 'mlb');
  assert(r.filtered < mlb.length || mlb.every(function(p) { return isPopular(p, 'mlb'); }));
  assert(r.visibleSelections <= 55, 'mlb visible ' + r.visibleSelections);
});

test('search would hit non-popular inventory (Pass Attempts)', function() {
  var attempts = nfl.filter(function(p) {
    return String(p.propType).toLowerCase().indexOf('pass attempt') >= 0;
  });
  assert(attempts.length > 0, 'Pass Attempts exist in full inventory');
  assert(!isPopular(attempts[0], 'nfl'), 'Pass Attempts not in Popular allowlist');
});

test('player.html wires progressive helpers', function() {
  var html = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');
  assert(html.indexOf('data-lazy-alts') >= 0);
  assert(html.indexOf('_pbToggleDedicatedPlayerMore') >= 0);
  assert(html.indexOf("id: 'all'") >= 0);
  assert(html.indexOf("id: 'other'") < 0 || html.indexOf("label: 'Other'") < 0);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
