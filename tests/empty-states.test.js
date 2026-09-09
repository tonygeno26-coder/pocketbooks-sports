/**
 * Empty / loading / error state chrome — player + host.
 * Presentation only; no settlement or odds math changes.
 * Run: node tests/empty-states.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var playerHtml = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
var hostHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

console.log('\n-- empty / loading / error states --\n');

test('player shared state helpers + CSS', function () {
  assert(playerHtml.indexOf('function _pbStateHtml') !== -1, '_pbStateHtml');
  assert(playerHtml.indexOf('function _pbNoEventsHtml') !== -1, '_pbNoEventsHtml');
  assert(playerHtml.indexOf('function _pbNoMarketsHtml') !== -1, '_pbNoMarketsHtml');
  assert(playerHtml.indexOf('.pb-empty{') !== -1, '.pb-empty css');
  assert(playerHtml.indexOf('.pb-loading{') !== -1, '.pb-loading css');
  assert(playerHtml.indexOf('.pb-error{') !== -1, '.pb-error css');
});

test('player no-events / no-markets / live empty use shared chrome', function () {
  assert(playerHtml.indexOf('_pbNoEventsHtml()') !== -1, 'no events wired');
  assert(playerHtml.indexOf('_pbNoMarketsHtml()') !== -1, 'no markets wired');
  assert(playerHtml.indexOf('_pbLiveEmptyStateHtml') !== -1, 'live empty helper');
  assert(playerHtml.indexOf('No events scheduled') !== -1, 'events copy');
  assert(playerHtml.indexOf('No markets posted') !== -1, 'markets copy');
  assert(playerHtml.indexOf('No live events') !== -1, 'live copy');
  assert(playerHtml.indexOf('padding:60px 20px;text-align:center;color:#888">No games') === -1, 'no giant gray empty');
});

test('player props / bets / notifications empties are compact', function () {
  assert(playerHtml.indexOf('No props for this game') !== -1, 'props empty');
  assert(playerHtml.indexOf('Props unavailable') !== -1, 'props error');
  assert(playerHtml.indexOf("title: 'No bets yet'") !== -1 || playerHtml.indexOf('No bets yet') !== -1, 'bets empty');
  assert(playerHtml.indexOf('No notifications') !== -1, 'notif empty');
  assert(playerHtml.indexOf('Loading notifications') !== -1, 'notif loading');
});

test('player API loading + error avoid raw exception dumps', function () {
  assert(playerHtml.indexOf("kind: 'loading', title: 'Loading events") !== -1, 'events loading');
  assert(playerHtml.indexOf("title: 'Couldn’t load events'") !== -1 || playerHtml.indexOf("title: 'Couldn't load events'") !== -1, 'events error title');
  assert(playerHtml.indexOf("el.innerHTML='<div class=\"empty\" style=\"color:#ff4444\">'+e.message") === -1, 'no raw e.message dump');
  assert(playerHtml.indexOf("title: 'Odds failed to load'") !== -1, 'watchdog error');
  assert(playerHtml.indexOf('🔄 Retry') === -1, 'no emoji retry button');
});

test('host shared state helpers + CSS', function () {
  assert(hostHtml.indexOf('function _hostStateHtml') !== -1, '_hostStateHtml');
  assert(hostHtml.indexOf('.host-state{') !== -1, '.host-state css');
  assert(hostHtml.indexOf('.host-state-loading') !== -1, 'loading css');
  assert(hostHtml.indexOf('.host-state-error') !== -1, 'error css');
});

test('host players / requests / bets / settlements states', function () {
  assert(hostHtml.indexOf("title: 'No players yet'") !== -1, 'no players');
  assert(hostHtml.indexOf("title: 'Loading players") !== -1, 'loading players');
  assert(hostHtml.indexOf("title: 'No pending requests'") !== -1, 'no requests');
  assert(hostHtml.indexOf('_hostStateHtml({ title: emptyMsg') !== -1, 'bets empty uses helper');
  assert(hostHtml.indexOf("title: 'No settlements due'") !== -1, 'settlements empty');
  assert(hostHtml.indexOf("title: 'Loading settlements") !== -1, 'settlements loading');
  assert(hostHtml.indexOf("title: 'Settlements unavailable'") !== -1, 'settlements error');
  assert(hostHtml.indexOf('font-size:2.5rem;margin-bottom:12px">👥') === -1, 'no giant emoji empty');
});

test('does not alter settlement recording entry points', function () {
  assert(hostHtml.indexOf('function recordSettlement') !== -1 || hostHtml.indexOf('Record Settlement') !== -1, 'record UI still present');
  assert(hostHtml.indexOf('/api/host/settlements') !== -1 || hostHtml.indexOf('settlements-preview') !== -1, 'settlement APIs untouched in wiring');
  // Helper is presentation-only — must not rewrite amount math helpers nearby falsely.
  assert(hostHtml.indexOf('function _computeSettleAfter') !== -1 || hostHtml.indexOf('maxAmt') !== -1, 'settle amount logic still present');
});

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
