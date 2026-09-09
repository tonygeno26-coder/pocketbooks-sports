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
  if (!String(hay).includes(needle)) throw new Error((msg || '') + ' — missing ' + needle);
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

// Mirrors player.html helpers (pure logic only)
function ticketRiskAmount(t) {
  if (!t) return 0;
  var v = t.riskAmount != null ? t.riskAmount : t.risk_amount;
  return parseFloat(v) || 0;
}
function ticketProfitAmount(t) {
  if (!t) return 0;
  var v = t.potentialProfit != null ? t.potentialProfit : t.potential_profit;
  return parseFloat(v) || 0;
}
function ticketAuthoritativePayout(t, displayStatus) {
  if (!t) return 0;
  var settled = ['won', 'lost', 'push', 'pushed', 'canceled', 'cancelled', 'voided', 'deleted'].includes(displayStatus);
  if (settled) {
    var auth = (t.actualPayout != null) ? t.actualPayout :
               (t.actual_payout != null) ? t.actual_payout :
               (t.settledPayout != null) ? t.settledPayout :
               (t.settled_payout != null) ? t.settled_payout :
               (t.payout != null && displayStatus !== 'active' && displayStatus !== 'open') ? t.payout : null;
    if (auth != null && !isNaN(Number(auth))) return Number(auth);
  }
  if (displayStatus === 'lost') return 0;
  if (displayStatus === 'push' || displayStatus === 'pushed') return ticketRiskAmount(t);
  if (displayStatus === 'canceled' || displayStatus === 'cancelled' ||
      displayStatus === 'voided' || displayStatus === 'deleted') return ticketRiskAmount(t);
  var est = t.estimatedPayout != null ? t.estimatedPayout : t.estimated_payout;
  return parseFloat(est) || (ticketRiskAmount(t) + ticketProfitAmount(t));
}
function ticketMatchesStatus(ds, filterStatus, isParlay) {
  if (filterStatus === 'all') return true;
  if (filterStatus === 'active') return ds === 'active' || ds === 'open';
  if (filterStatus === 'won') return ds === 'won';
  if (filterStatus === 'lost') return ds === 'lost';
  if (filterStatus === 'push') return ds === 'push' || ds === 'pushed';
  if (filterStatus === 'void') return ds === 'voided' || ds === 'deleted';
  if (filterStatus === 'canceled') return ds === 'canceled' || ds === 'cancelled';
  if (filterStatus === 'parlays') return isParlay;
  if (filterStatus === 'singles') return !isParlay;
  return true;
}
function ticketStatusClass(displayStatus) {
  if (displayStatus === 'won') return 'won';
  if (displayStatus === 'lost') return 'lost';
  if (displayStatus === 'push' || displayStatus === 'pushed') return 'push';
  if (displayStatus === 'voided' || displayStatus === 'deleted' ||
      displayStatus === 'canceled' || displayStatus === 'cancelled') return 'void';
  return 'active';
}

console.log('\n-- My Bets / Bet History --');

test('renderMyBets exposes search, status, range, and sort controls', function() {
  const src = read('player.html');
  assertIncludes(src, 'id="mybets-search"', 'search input');
  assertIncludes(src, 'data-mb-status', 'status chips');
  assertIncludes(src, 'data-mb-range', 'range chips');
  assertIncludes(src, 'data-mb-sort', 'sort chips');
  assertIncludes(src, "['push','Push']", 'push filter chip');
  assertIncludes(src, "['void','Void']", 'void filter chip');
});

test('ticket cards use compact semantic status styling', function() {
  const src = read('player.html');
  assertIncludes(src, 'mb-ticket--active', 'active class');
  assertIncludes(src, 'mb-ticket--won', 'won class');
  assertIncludes(src, 'mb-ticket--lost', 'lost class');
  assertIncludes(src, 'mb-ticket--push', 'push class');
  assertIncludes(src, 'mb-ticket--void', 'void class');
  assertIncludes(src, 'mb-result-line', 'result explanation');
  assertIncludes(src, 'mb-exposure', 'active exposure banner');
});

test('authoritative payout prefers backend actualPayout', function() {
  assertEq(ticketAuthoritativePayout({ actual_payout: 88.5, riskAmount: 50, estimatedPayout: 95 }, 'won'), 88.5);
  assertEq(ticketAuthoritativePayout({ riskAmount: 30, estimatedPayout: 57.27 }, 'lost'), 0);
  assertEq(ticketAuthoritativePayout({ actualPayout: 30, riskAmount: 30 }, 'push'), 30);
});

test('does not invent payout when unsettled', function() {
  var est = ticketAuthoritativePayout({ riskAmount: 10, potentialProfit: 9.09, estimatedPayout: 19.09 }, 'active');
  assertEq(est, 19.09, 'active uses estimated payout only');
});

test('status filters distinguish push and void from loss', function() {
  assert(ticketMatchesStatus('push', 'push', false));
  assert(!ticketMatchesStatus('lost', 'push', false));
  assert(ticketMatchesStatus('voided', 'void', false));
  assert(!ticketMatchesStatus('voided', 'canceled', false));
  assert(ticketMatchesStatus('canceled', 'canceled', false));
});

test('status class keeps push and void separate from lost', function() {
  assertEq(ticketStatusClass('push'), 'push');
  assertEq(ticketStatusClass('voided'), 'void');
  assertEq(ticketStatusClass('lost'), 'lost');
});

test('preview fixtures are gated and cover required scenarios', function() {
  const src = read('player.html');
  assertIncludes(src, 'myBetsFixture', 'fixture query param');
  assertIncludes(src, 'MB-FIX-ACTIVE', 'active single');
  assertIncludes(src, 'MB-FIX-WON', 'won');
  assertIncludes(src, 'MB-FIX-LOST', 'lost');
  assertIncludes(src, 'MB-FIX-PUSH', 'push');
  assertIncludes(src, 'MB-FIX-VOID', 'void');
  assertIncludes(src, 'MB-FIX-PARLAY', 'parlay');
  assertIncludes(src, 'MB-FIX-LONG-PARLAY', 'long parlay');
  assertIncludes(src, 'MB-FIX-PROP', 'player prop');
  assertIncludes(src, "mode === 'empty'", 'empty tickets fixture');
  assertIncludes(src, 'Preview fixtures — no production bets', 'fixture banner');
});

test('parlay legs remain expandable', function() {
  const src = read('player.html');
  assertIncludes(src, 'data-expand-parlay', 'expand control');
  assertIncludes(src, 'Show all', 'leg count label');
});

test('loadPlayerDashboardFromDb skips remote read in fixture mode', function() {
  const src = read('player.html');
  assertIncludes(src, "return { ok:true, source:'mybets_fixture'", 'fixture short-circuit');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
