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
const RESULTS_TIMEZONE = 'America/Los_Angeles';

function ticketCreatedAtMs(t) {
  var iso = t && (t.created_at || t.createdAt || t.placed_at || t.placedAt);
  if (!iso) return NaN;
  var ms = Date.parse(iso);
  return isFinite(ms) ? ms : NaN;
}
function statusLower(t) { return String((t && t.status) || '').toLowerCase(); }
function isUnresolved(t) {
  var s = statusLower(t);
  return s === 'active' || s === 'open' || s === 'pending' || s === 'partial';
}
function isVoidCanceled(t) {
  var s = statusLower(t);
  return s === 'canceled' || s === 'cancelled' || s === 'voided' || s === 'void' || s === 'deleted';
}
function retentionClockMs(t) {
  var iso = null;
  if (isVoidCanceled(t)) iso = t.canceledAt || t.canceled_at || null;
  else iso = t.gradedAt || t.graded_at || null;
  if (!iso) return NaN;
  var ms = Date.parse(iso);
  return isFinite(ms) ? ms : NaN;
}
function isRecentBetTicket(t, nowMs) {
  if (!t) return false;
  if (isUnresolved(t)) return true;
  var clock = retentionClockMs(t);
  if (!isFinite(clock)) return false;
  var age = (nowMs != null ? nowMs : Date.now()) - clock;
  return age >= 0 && age < RECENT_BETS_TTL_MS;
}
function ticketEventStartMs(t) {
  var legs = (t && t.selections) || (t && t.legs) || [];
  var latest = NaN;
  for (var i = 0; i < legs.length; i++) {
    var l = legs[i];
    if (!l) continue;
    var iso = l.scheduled_start || l.scheduledStart || l.commenceTime || l.commence_time || null;
    var ms = iso ? Date.parse(iso) : NaN;
    if (isFinite(ms) && (!isFinite(latest) || ms > latest)) latest = ms;
  }
  return latest;
}
function resultsTzParts(ms) {
  var dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: RESULTS_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short'
  });
  var parts = dtf.formatToParts(new Date(ms));
  var map = {};
  parts.forEach(function(p){ if (p.type !== 'literal') map[p.type] = p.value; });
  var hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: +map.year, month: +map.month, day: +map.day,
    hour: hour, minute: +map.minute, second: +map.second, weekday: map.weekday
  };
}
function resultsDateKeyFromMs(ms) {
  if (!isFinite(ms)) return null;
  var p = resultsTzParts(ms);
  return p.year + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0');
}
function ticketResultsDateKey(t) {
  return resultsDateKeyFromMs(ticketEventStartMs(t));
}
function groupByEventDate(tickets) {
  var map = {};
  (tickets || []).forEach(function(t) {
    var key = ticketResultsDateKey(t);
    if (!key) return;
    if (!map[key]) map[key] = [];
    map[key].push(t);
  });
  Object.keys(map).forEach(function(k) {
    map[k].sort(function(a, b) { return ticketEventStartMs(b) - ticketEventStartMs(a); });
  });
  return map;
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

console.log('\n-- Recent Bets + Results event-day --');

const src = read('player.html');

test('header copy and empty state present', function() {
  assertIncludes(src, 'Recent Bets', 'title');
  assertIncludes(src, 'Open bets and graded results from the last 12 hours', 'subtitle');
  assertIncludes(src, 'No recent bets', 'empty title');
  assertIncludes(src, 'Open bets stay here until they grade', 'empty sub');
  assertIncludes(src, 'View Results', 'view results');
  assertIncludes(src, 'Est. Win Chance', 'exact EWC label');
});

test('player clutter removed from normal Recent Bets path', function() {
  assertIncludes(src, "mybets-toolbar{display:none!important}", 'toolbar hidden');
  assertNotIncludes(src, 'id="mybets-search"', 'no search input in render');
  assertNotIncludes(src, 'data-mb-status', 'no status chips');
  assertNotIncludes(src, 'data-mb-range', 'no range chips');
  assertNotIncludes(src, 'data-mb-sort', 'no sort chips');
  assertIncludes(src, 'data-rb-dev-slot', 'dev slot');
  assertIncludes(src, '_isRecentBetsDevTools', 'dev gate');
});

test('My Bets uses graded_at / canceled_at retention not place clock', function() {
  assertIncludes(src, 'RESULTS_TIMEZONE = \'America/Los_Angeles\'', 'LA Results TZ');
  assertIncludes(src, '_ticketRetentionClockMs', 'retention clock helper');
  assertIncludes(src, '_isUnresolvedTicket', 'unresolved helper');
  assertIncludes(src, 'canceledAt || t.canceled_at', 'V1 canceled_at clock');
  assertIncludes(src, 'gradedAt || t.graded_at', 'graded_at clock');
  assertIncludes(src, 'RECENT_BETS_TTL_MS = 12 * 60 * 60 * 1000', '12h TTL');
  assertNotIncludes(src.slice(src.indexOf('Recent Bets feed')), 'localStorage.removeItem(\'pb-tickets\')', 'no ticket wipe');
});

test('Results groups by event day helpers', function() {
  assertIncludes(src, '_ticketEventStartMs', 'event start helper');
  assertIncludes(src, '_ticketResultsDateKey', 'results date key');
  assertIncludes(src, 'RESULTS_TIMEZONE', 'tz constant');
  assertIncludes(src, '_resultsZonedLocalToUtcMs', 'DST-safe converter');
  assertIncludes(src, 'Latest scheduled event start among legs', 'parlay latest comment');
});

test('ACTIVE unresolved always in My Bets even after 20h since place', function() {
  var now = Date.parse('2026-09-09T18:00:00.000Z');
  var oldActive = {
    id: 'OA', status: 'active',
    placed_at: new Date(now - 20 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(now - 20 * 60 * 60 * 1000).toISOString()
  };
  assert(isRecentBetTicket(oldActive, now), 'old active still in My Bets');
});

test('WON/LOST/PUSH: 11h59 visible; 12h00 out; Results independent', function() {
  var now = Date.parse('2026-09-09T18:00:00.000Z');
  var graded1159 = new Date(now - (12 * 60 * 60 * 1000 - 60 * 1000)).toISOString();
  var graded12 = new Date(now - 12 * 60 * 60 * 1000).toISOString();
  var graded13 = new Date(now - 13 * 60 * 60 * 1000).toISOString();
  ['won', 'lost', 'push'].forEach(function(st) {
    assert(isRecentBetTicket({ id: st + '1159', status: st, graded_at: graded1159 }, now), st + ' 11h59');
    assert(!isRecentBetTicket({ id: st + '12', status: st, graded_at: graded12 }, now), st + ' exactly 12h out');
    assert(!isRecentBetTicket({ id: st + '13', status: st, graded_at: graded13 }, now), st + ' 13h out');
  });
});

test('VOID/canceled uses canceled_at V1 clock', function() {
  var now = Date.parse('2026-09-09T18:00:00.000Z');
  var c1159 = new Date(now - (12 * 60 * 60 * 1000 - 60 * 1000)).toISOString();
  var c12 = new Date(now - 12 * 60 * 60 * 1000).toISOString();
  assert(isRecentBetTicket({ id: 'V1', status: 'canceled', canceled_at: c1159 }, now), 'void 11h59');
  assert(!isRecentBetTicket({ id: 'V2', status: 'canceled', canceled_at: c12 }, now), 'void 12h00 out');
  assert(!isRecentBetTicket({ id: 'V3', status: 'canceled' }, now), 'void without canceled_at out');
});

test('place clock alone does not keep graded ticket', function() {
  var now = Date.parse('2026-09-09T18:00:00.000Z');
  var t = {
    id: 'P', status: 'won',
    placed_at: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
    graded_at: new Date(now - 13 * 60 * 60 * 1000).toISOString()
  };
  assert(!isRecentBetTicket(t, now), 'young place but old grade → out of My Bets');
});

test('Thu place Fri event → Results Friday in America/Los_Angeles', function() {
  // Fri 2026-09-26 11:30 PM PDT = 2026-09-26T06:30:00Z → calendar Fri Sep 25? 
  // Owner example: 2026-09-26T06:30:00Z → LA 2026-09-25 11:30 PM → Friday Sep 25
  var t = {
    id: 'TF', status: 'active',
    placed_at: '2026-09-24T03:00:00.000Z', // Thu evening PDT
    selections: [{ scheduled_start: '2026-09-26T06:30:00.000Z' }]
  };
  assertEq(ticketResultsDateKey(t), '2026-09-25', 'owner Fri 11:30pm PDT example');
  assert(isRecentBetTicket(t, Date.parse('2026-09-25T12:00:00.000Z')), 'still in My Bets while unresolved');
});

test('UTC midnight must not flip LA calendar day', function() {
  // 2026-09-26T07:00:00Z = Sep 26 12:00 AM PDT → Saturday Sep 26
  assertEq(resultsDateKeyFromMs(Date.parse('2026-09-26T07:00:00.000Z')), '2026-09-26', 'LA midnight Saturday');
  // 2026-09-26T06:59:00Z = Sep 25 11:59 PM PDT → Friday Sep 25
  assertEq(resultsDateKeyFromMs(Date.parse('2026-09-26T06:59:00.000Z')), '2026-09-25', 'still Friday');
});

test('parlay multi-day uses LATEST leg start', function() {
  var t = {
    id: 'PL', status: 'won', graded_at: '2026-09-28T02:00:00.000Z',
    selections: [
      { scheduled_start: '2026-09-26T02:00:00.000Z' }, // Thu night PDT / Fri early
      { scheduled_start: '2026-09-27T02:00:00.000Z' }  // Fri night PDT / Sat early
    ]
  };
  var latest = ticketEventStartMs(t);
  assertEq(latest, Date.parse('2026-09-27T02:00:00.000Z'), 'max leg start');
  assertEq(ticketResultsDateKey(t), resultsDateKeyFromMs(latest), 'Results day from latest');
});

test('missing event start excluded from Results grouping (no fabricate)', function() {
  var t = { id: 'M', status: 'won', graded_at: '2026-09-09T01:00:00.000Z', selections: [{ pick: 'A' }] };
  assertEq(ticketResultsDateKey(t), null, 'null key');
  var groups = groupByEventDate([t]);
  assertEq(Object.keys(groups).length, 0, 'not fabricated into a day');
});

test('groupByEventDate newest event first within day', function() {
  var tickets = [
    { id: '1', selections: [{ scheduled_start: '2026-09-26T06:30:00.000Z' }] },
    { id: '2', selections: [{ scheduled_start: '2026-09-26T02:00:00.000Z' }] },
    { id: '3', selections: [{ scheduled_start: '2026-09-27T02:00:00.000Z' }] }
  ];
  var groups = groupByEventDate(tickets);
  assert(groups['2026-09-25'], 'sep 25 group');
  assertEq(groups['2026-09-25'][0].id, '1', 'later event first on Sep 25');
});

test('Est. Win Chance +/- odds and parlay', function() {
  assertEq(Math.round(americanImpliedProb(-110) * 100), 52);
  assertEq(Math.round(americanImpliedProb(150) * 100), 40);
  assertEq(ticketEstWinChancePct({ type: 'Single', odds: -110, selections: [{ odds: -110 }] }), 52);
  assertEq(ticketEstWinChancePct({ type: 'Single', selections: [{ odds: '+150' }] }), 40);
  assertEq(ticketEstWinChancePct({ type: 'Parlay', combinedOdds: +300, selections: [{ odds: -110 }, { odds: -110 }] }), 25);
  var pct = ticketEstWinChancePct({ type: 'Parlay', selections: [{ odds: -110 }, { odds: -110 }] });
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
  assertIncludes(src, '@media (max-width:390px)', '390 media');
  assertIncludes(src, '.rb-head{padding:4px 8px 2px}', 'tight head 430');
  assertIncludes(src, '.rb-head{padding:2px 6px 0}', 'tight head 390');
  assertIncludes(src, 'STATUS+TYPE', 'hierarchy comment');
  assertIncludes(src, 'rb-card-head', 'status+type head row');
  assertIncludes(src, 'rb-leg--compact', 'compact parlay legs');
  assertIncludes(src, 'prefers-reduced-motion', 'reduced motion');
});

test('reload path still hydrates from dashboard / pb-tickets without deleting', function() {
  assertIncludes(src, '_playerTicketsFromDb', 'db hydrate flag');
  assertIncludes(src, 'loadPlayerDashboardFromDb', 'dashboard reload');
  assertIncludes(src, 'createdAt:       t.createdAt || t.created_at', 'normalize preserves createdAt');
  assertIncludes(src, 'canceledAt:', 'normalize canceledAt');
});

test('BE dashboard selects canceled_at for V1 retention', function() {
  var be = fs.readFileSync(path.join(__dirname, '..', '..', 'pocketbooks-sports-backend', 'index.js'), 'utf8');
  assertIncludes(be, 'placed_at,graded_at,canceled_at,grading_source', 'dashboard select');
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
