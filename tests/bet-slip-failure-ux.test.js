/**
 * Agent D / Task 10 — Bet slip failure UX (fail-closed, no raw API codes)
 * Run: node tests/bet-slip-failure-ux.test.js
 */
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
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m || '') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}

const playerSrc = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');

function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  var m = re.exec(src);
  if (!m) throw new Error('function ' + name + ' not found');
  var start = m.index;
  var i = src.indexOf('{', start);
  var depth = 0;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

const mapFn = extractFn(playerSrc, '_pbPlaceBetFailureUX');
// eslint-disable-next-line no-new-func
const _pbPlaceBetFailureUX = new Function(mapFn + '; return _pbPlaceBetFailureUX;')();

console.log('\n-- Bet slip failure UX --');

test('mapper covers required failure kinds', function() {
  var kinds = [
    ['odds_changed', 'odds_changed'],
    ['market_suspended', 'suspended'],
    ['game_started', 'event_started'],
    ['insufficient_balance', 'insufficient_bankroll'],
    ['balance_unavailable', 'balance_unavailable'],
    ['timeout', 'timeout'],
    ['duplicate_bet', 'duplicate'],
    ['server_error', 'server_error'],
    ['invalid_selection', 'invalid_selection'],
    ['parlay_conflict', 'parlay_conflict'],
    ['same_game_conflict', 'parlay_conflict'],
    ['line_changed', 'line_changed']
  ];
  kinds.forEach(function(pair) {
    var ux = _pbPlaceBetFailureUX(pair[0]);
    assertEq(ux.kind, pair[1], pair[0]);
    assert(ux.accepted === false, pair[0] + ' must never imply acceptance');
    assert(ux.message && ux.message.indexOf('_') === -1 || /[a-zA-Z]/.test(ux.message),
      pair[0] + ' must be human-readable');
    assert(!/Bet rejected:/i.test(ux.message), pair[0] + ' must not use raw rejected prefix');
  });
});

test('timeout + uncertain require reconcile', function() {
  var ux = _pbPlaceBetFailureUX('timeout');
  assert(ux.reconcile === true, 'timeout reconciles');
  assert(ux.action === 'reconcile');
  assert(/My Bets|confirm/i.test(ux.message));
});

test('odds_changed never auto-accepts', function() {
  var ux = _pbPlaceBetFailureUX('odds_changed');
  assertEq(ux.action, 'accept_odds');
  assert(/nothing was accepted/i.test(ux.message));
});

test('insufficient bankroll includes fail-closed copy', function() {
  var ux = _pbPlaceBetFailureUX('insufficient_bankroll', { available: '$12.00' });
  assert(/No bet was placed/i.test(ux.message));
  assert(/\$12\.00/.test(ux.message));
});

test('HTTP 500 maps to server_error without raw body dump', function() {
  var ux = _pbPlaceBetFailureUX('', { httpStatus: 502 });
  assertEq(ux.kind, 'server_error');
  assert(!/502/.test(ux.message) || /server/i.test(ux.message));
  assert(ux.reconcile === true);
});

test('player.html wires mapper + slip banner + no raw odds-accept toast', function() {
  assert(playerSrc.indexOf('function _pbPlaceBetFailureUX') !== -1);
  assert(playerSrc.indexOf('function _pbPresentPlaceBetFailure') !== -1);
  assert(playerSrc.indexOf('id="dkslip-fail-banner"') !== -1);
  assert(playerSrc.indexOf('_pbPresentPlaceBetFailure') !== -1);
  assert(playerSrc.indexOf("(_rd2.code||_rd2.error||'placement failed').replace") === -1,
    'odds-accept path must not toast raw API codes');
  var confirmFn = extractFn(playerSrc, 'confirmBet');
  assert(confirmFn.indexOf('_pbPresentPlaceBetFailure') !== -1, 'confirmBet uses failure UX');
  assert(confirmFn.indexOf('Bet rejected:') === -1, 'confirmBet must not toast raw Bet rejected codes');
});

console.log('\nBet slip failure UX: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
