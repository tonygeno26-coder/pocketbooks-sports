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

var html = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');

console.log('\n-- Live refresh infrastructure --');

test('visible-tab sportsbook refresh loop exists', function() {
  assert(html.indexOf('function _pbIsSportsbookVisible()') !== -1, 'missing visibility guard');
  assert(html.indexOf('document.hidden') !== -1, 'missing hidden-tab check');
  assert(html.indexOf('_pbScheduleSportsbookLiveRefresh') !== -1, 'missing refresh scheduler');
  assert(html.indexOf('setInterval(function()') !== -1, 'missing interval refresh');
});

test('live stale market state disables live odds cells and place button', function() {
  assert(html.indexOf('data-live-market=') !== -1, 'missing live market marker');
  assert(html.indexOf("cell.classList.toggle('live-stale', stale)") !== -1, 'missing stale cell class toggle');
  assert(html.indexOf('Refreshing live odds') !== -1, 'missing stale place-button label');
});

test('live refresh path uses backend status and no local market-status fallback', function() {
  assert(html.indexOf("API + '/api/markets/status'") !== -1, 'market status must use backend API base');
  assert(html.indexOf("API + '/api/odds/' + _sport") !== -1, 'odds fetch must use backend API base');
});

test('line movement animation is wired', function() {
  assert(html.indexOf('odds-move-up') !== -1, 'missing odds up animation class');
  assert(html.indexOf('odds-move-down') !== -1, 'missing odds down animation class');
  assert(html.indexOf('function _pbFlashLineMovements()') !== -1, 'missing movement detector');
});

test('live network failure cannot fall back to local ticket placement', function() {
  assert(html.indexOf('function _confirmBetHasLiveLeg') !== -1, 'missing live-leg detector in confirmBet');
  assert(html.indexOf('live_local_fallback_blocked') !== -1, 'missing local fallback block for live bets');
  assert(html.indexOf('Live bet not placed') !== -1, 'missing live failure message');
});

test('line_changed backend response asks user to review slip', function() {
  assert(html.indexOf("_dbData.code === 'line_changed'") !== -1, 'missing line_changed branch');
  assert(html.indexOf('function _showLineChangedReview') !== -1, 'missing line review UI');
  assert(html.indexOf('Review Slip') !== -1, 'missing review slip action');
});

console.log('\nLive refresh infrastructure tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
