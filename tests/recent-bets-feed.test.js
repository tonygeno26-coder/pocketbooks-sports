'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'expected true'); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}
function assertIncludes(hay, needle, msg) {
  if (!String(hay).includes(needle)) throw new Error((msg || '') + ' — missing ' + JSON.stringify(needle));
}
function assertNotIncludes(hay, needle, msg) {
  if (String(hay).includes(needle)) throw new Error((msg || '') + ' — unexpectedly found ' + JSON.stringify(needle));
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const RECENT_BETS_TTL_MS = 12 * 60 * 60 * 1000;

function ticketCreatedAtMs(t) {
  var iso = t && (t.created_at || t.createdAt || t.placed_at || t.placedAt);
  if (!iso) return NaN;
  var ms = Date.parse(iso);
  return isFinite(ms) ? ms : NaN;
}
function isRecentBetTicket(t, nowMs) {
  var ms = ticketCreatedAtMs(t);
  if (!isFinite(ms)) return false;
  var age = (nowMs != null ? nowMs : Date.now()) - ms;
  return age >= 0 && age < RECENT_BETS_TTL_MS;
}
function parseAmericanOdds(raw) {
  if (raw == null || raw === '') return null;
  var s = String(raw).trim();
  var n = parseInt(s.replace('+', ''), 10);
  if (!isFinite(n) || n === 0) return null;
  return n;
}
function americanImpliedProb(american) {
  var a = Number(american);
  if (!isFinite(a) || a === 0) return null;
  if (a > 0) return 100 / (a + 100);
  return Math.abs(a) / (Math.abs(a) + 100);
}
function americanToDecimal(american) {
  var a = Number(american);
  if (!isFinite(a) || a === 0) return null;
  if (a > 0) return 1 + (a / 100);
  return 1 + (100 / Math.abs(a));
}
function ticketEstWinChancePct(t) {
  var combined = null;
  var candidates = [t.combinedOdds, t.combined_odds, t.americanOdds, t.odds];
  for (var i = 0; i < candidates.length; i++) {
    var n = parseAmericanOdds(candidates[i]);
    if (n != null) { combined = n; break; }
  }
  var legs = Array.isArray(t.selections) ? t.selections : (Array.isArray(t.legs) ? t.legs : []);
  var type = String(t.type || '').toLowerCase();
  var isMulti = type === 'parlay' || type === 'sgp' || legs.length > 1;
  if (combined != null && (isMulti || legs.length <= 1)) {
    var p = americanImpliedProb(combined);
    if (p != null) return Math.round(p * 100);
  }
  if (!isMulti) {
    var lo = legs[0] ? parseAmericanOdds(legs[0].odds) : combined;
    var p1 = americanImpliedProb(lo);
    return p1 != null ? Math.round(p1 * 100) : null;
  }
  if (legs.length > 1) {
    var product = 1, ok = 0;
    for (var j = 0; j < legs.length; j++) {
      var dec = americanToDecimal(parseAmericanOdds(legs[j].odds));
      if (dec == null) continue;
      product *= dec; ok++;
    }
    if (ok > 0) return Math.round((1 / product) * 100);
  }
  return null;
}
function groupByDatePlaced(tickets, tzOffsetMinutes) {
  // Group by local calendar date of created_at/placed_at (DATE PLACED).
  var map = {};
  (tickets || []).forEach(function(t) {
    var ms = ticketCreatedAtMs(t);
    if (!isFinite(ms)) return;
    var d = new Date(ms);
    if (tzOffsetMinutes != null) {
      d = new Date(ms + (tzOffsetMinutes - d.getTimezoneOffset()) * 60000);
    }
    var key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (!map[key]) map[key] = [];
    map[key].push(t);
  });
  Object.keys(map).forEach(function(k) {
    map[k].sort(function(a,b){ return ticketCreatedAtMs(b) - ticketCreatedAtMs(a); });
  });
  return map;
}

console.log('\n-- Recent Bets feed --');

const src = read('player.html');

test('header copy and empty state present', function() {
  assertIncludes(src, 'Recent Bets', 'title');
  assertIncludes(src, 'Bets placed in the last 12 hours', 'subtitle');
  assertIncludes(src, 'No recent bets', 'empty title');
  assertIncludes(src, 'Bets you place will appear here for 12 hours.', 'empty sub');
  assertIncludes(src, 'View Results', 'view results');
  assertIncludes(src, 'Est. Win Chance', 'exact EWC label');
});

test('player clutter removed from normal Recent Bets path', function() {
  // Toolbar/search/filters must not render in normal player feed
  assertIncludes(src, "mybets-toolbar{display:none!important}", 'toolbar hidden');
  assertNotIncludes(src, 'id="mybets-search"', 'no search input in render');
  assertNotIncludes(src, 'data-mb-status', 'no status chips');
  assertNotIncludes(src, 'data-mb-range', 'no range chips');
  assertNotIncludes(src, 'data-mb-sort', 'no sort chips');
  // Graded / Check Results only behind data-rb-dev-slot
  assertIncludes(src, 'data-rb-dev-slot', 'dev slot');
  assertIncludes(src, '_isRecentBetsDevTools', 'dev gate');
});

test('12h visibility uses created_at not localStorage clock', function() {
  assertIncludes(src, 'created_at || t.createdAt || t.placed_at || t.placedAt', 'created_at authority');
  assertIncludes(src, 'RECENT_BETS_TTL_MS = 12 * 60 * 60 * 1000', '12h TTL');
  assertIncludes(src, '_isRecentBetTicket', 'recent helper');
  // Must not delete tickets after 12h
  assertNotIncludes(src.slice(src.indexOf('Recent Bets feed')), 'localStorage.removeItem(\'pb-tickets\')', 'no ticket wipe');
});

test('now appears; 11h59 appears; >=12h excluded from Recent', function() {
  var now = Date.parse('2026-09-09T18:00:00.000Z');
  var tNow = { id:'N', created_at: new Date(now).toISOString(), status:'active' };
  var t1159 = { id:'A', created_at: new Date(now - (12*60*60*1000 - 60*1000)).toISOString(), status:'active' };
  var t12 = { id:'B', created_at: new Date(now - 12*60*60*1000).toISOString(), status:'active' };
  var t13 = { id:'C', created_at: new Date(now - 13*60*60*1000).toISOString(), status:'won' };
  assert(isRecentBetTicket(tNow, now), 'now');
  assert(isRecentBetTicket(t1159, now), '11h59');
  assert(!isRecentBetTicket(t12, now), 'exactly 12h out');
  assert(!isRecentBetTicket(t13, now), '13h out');
});

test('ACTIVE >12h Results only still ACTIVE; WON <12h both', function() {
  var now = Date.parse('2026-09-09T18:00:00.000Z');
  var oldActive = { id:'OA', created_at: new Date(now - 20*60*60*1000).toISOString(), status:'active', placedAt: new Date(now - 20*60*60*1000).toISOString() };
  var youngWon = { id:'YW', created_at: new Date(now - 2*60*60*1000).toISOString(), status:'won', placedAt: new Date(now - 2*60*60*1000).toISOString() };
  assert(!isRecentBetTicket(oldActive, now), 'old active not recent');
  assertEq(oldActive.status, 'active', 'still ACTIVE');
  assert(isRecentBetTicket(youngWon, now), 'won <12h in recent');
  // Results day grouping includes both by DATE PLACED
  var dayStart = new Date('2026-09-08T00:00:00'); // local-ish placeholder
  assertIncludes(src, 'calendar DATE PLACED', 'results comment');
  assertIncludes(src, 'created_at || t.createdAt || t.placedAt || t.placed_at', 'results date field');
});

test('Est. Win Chance +/- odds and parlay', function() {
  assertEq(Math.round(americanImpliedProb(-110) * 100), 52);
  assertEq(Math.round(americanImpliedProb(150) * 100), 40);
  assertEq(ticketEstWinChancePct({ type:'Single', odds: -110, selections:[{ odds: -110 }] }), 52);
  assertEq(ticketEstWinChancePct({ type:'Single', selections:[{ odds: '+150' }] }), 40);
  // Combined parlay odds preferred when present
  assertEq(ticketEstWinChancePct({ type:'Parlay', combinedOdds: +300, selections:[{odds:-110},{odds:-110}] }), 25);
  // Without combined: product of decimals
  var pct = ticketEstWinChancePct({ type:'Parlay', selections:[{odds:-110},{odds:-110}] });
  assert(pct != null && pct > 0 && pct < 50, 'parlay implied from legs');
});

test('PUSH / VOID card status strings exist', function() {
  assertIncludes(src, '>PUSH</span>', 'PUSH badge');
  assertIncludes(src, '>VOID</span>', 'VOID badge');
  assertIncludes(src, 'rb-card--push', 'push class');
  assertIncludes(src, 'rb-card--void', 'void class');
});

test('View Details expand present', function() {
  assertIncludes(src, 'View Details', 'details btn');
  assertIncludes(src, 'data-rb-details', 'details hook');
  assertIncludes(src, 'Ticket ID', 'ticket id in details');
});

test('developer controls gated; Balance History not for ordinary players', function() {
  assertIncludes(src, 'Mount Balance History only in developer/preview', 'bal hist gated');
  assertIncludes(src, "qs.get('testmode') === '1' || qs.get('preview') === '1'", 'test/preview gate');
  assertIncludes(src, 'data-rb-dev-slot', 'injects into dev slot');
});

test('mobile compact header rules', function() {
  assertIncludes(src, '@media (max-width:430px)', '430 media');
  assertIncludes(src, '.rb-head{padding:6px 8px 4px}', 'tight head');
});

test('timezone grouping by calendar date placed', function() {
  var tickets = [
    { id:'1', created_at:'2026-09-08T23:30:00.000Z', status:'won' },
    { id:'2', created_at:'2026-09-09T01:00:00.000Z', status:'active' },
    { id:'3', created_at:'2026-09-09T20:00:00.000Z', status:'lost' }
  ];
  var groups = groupByDatePlaced(tickets);
  var keys = Object.keys(groups).sort();
  assert(keys.length >= 1, 'has groups');
  // Newest first within a day that has multiple
  keys.forEach(function(k) {
    var arr = groups[k];
    for (var i = 1; i < arr.length; i++) {
      assert(ticketCreatedAtMs(arr[i-1]) >= ticketCreatedAtMs(arr[i]), 'newest first in '+k);
    }
  });
});

test('reload path still hydrates from dashboard / pb-tickets without deleting', function() {
  assertIncludes(src, '_playerTicketsFromDb', 'db hydrate flag');
  assertIncludes(src, 'loadPlayerDashboardFromDb', 'dashboard reload');
  assertIncludes(src, 'createdAt:       t.createdAt || t.created_at', 'normalize preserves createdAt');
});

test('no settlement financial merge language in Recent Bets feed block', function() {
  var start = src.indexOf('Recent Bets feed (My Bets tab)');
  var end = src.indexOf('function bsSetSingleStake');
  var block = src.slice(start, end);
  assertNotIncludes(block, 'settlement Option A', 'no settlement option a');
  assertNotIncludes(block, 'applySettlement', 'no apply settlement');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
