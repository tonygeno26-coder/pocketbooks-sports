/**
 * P0.5 — Dashboard balance fail-closed (no local $1000 / derived bankroll)
 * Run: node tests/dashboard-balance-failclosed.test.js
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

const dashFn = extractFn(playerSrc, 'loadPlayerDashboardFromDb');
const syncFn = extractFn(playerSrc, 'syncBalanceDisplays');
const liveFn = extractFn(playerSrc, '_liveAvailableBalance');
const unavailFn = extractFn(playerSrc, 'applyBalanceUnavailable');
const confirmFn = extractFn(playerSrc, 'confirmBet');

console.log('\n-- P0.5 dashboard balance fail-closed --');

test('applyBalanceUnavailable paints em dash and clears playerBalance', function() {
  assert(unavailFn.includes('\\u2014') || unavailFn.includes('\u2014'),
    'must paint em dash');
  assert(/playerBalance\s*=\s*null/.test(unavailFn), 'must null playerBalance');
  assert(playerSrc.includes('Unable to refresh balance'),
    'refresh / unable UX required');
});

test('dashboard catch must NOT fall back to localStorage bankroll', function() {
  assert(!/fallback to localStorage/.test(dashFn), 'legacy fallback log must be gone');
  assert(dashFn.includes('applyBalanceUnavailable'), 'catch must call applyBalanceUnavailable');
  assert(dashFn.includes('balanceUnavailable:true') || dashFn.includes('balanceUnavailable: true'),
    'must flag balanceUnavailable');
  var catchIdx = dashFn.indexOf('catch(e)');
  assert(catchIdx !== -1, 'missing catch');
  var catchBody = dashFn.slice(catchIdx);
  assert(!/syncBalanceDisplays\s*\(/.test(catchBody), 'catch must not syncBalanceDisplays local fallback');
});

test('HTTP non-2xx statuses fail closed before inventing balance', function() {
  assert(dashFn.includes('dashboard_http_'), 'must classify HTTP errors');
  assert(/if\s*\(\s*!resp\.ok\s*\)/.test(dashFn), 'must check resp.ok');
  assert(dashFn.includes('dashboard_malformed_json'), 'malformed JSON covered');
});

test('missing balance on ok response fails closed (no $1000)', function() {
  assert(dashFn.includes("applyBalanceUnavailable('missing_balance')"),
    'missing_balance path required');
});

test('DB-primary syncBalanceDisplays never paints calcAvailableBalance as authority', function() {
  assert(syncFn.includes('_DB_PRIMARY_READS_ENABLED'), 'DB-primary gate required');
  assert(syncFn.includes('applyBalanceUnavailable'), 'must fail closed when no server balance');
});

test('_liveAvailableBalance returns NaN under DB-primary without server', function() {
  assert(liveFn.includes('return NaN'), 'NaN fail-closed');
});

test('confirmBet blocks placement when balance unavailable', function() {
  assert(confirmFn.includes('balance_unavailable') || confirmFn.includes('Unable to refresh balance'),
    'placement must block without authoritative balance');
});

test('failure matrix status codes are classified via resp.ok / http_ status', function() {
  assert(dashFn.includes('availableBalance'), '200 path uses availableBalance');
  assert(/dashboard_http_/.test(dashFn) && /resp\.status/.test(dashFn),
    'status embedded in error');
  assert(/dashboard_unreachable/.test(dashFn), 'timeout/offline mapped');
});

test('player.html has no catch that logs fallback to localStorage for dashboard', function() {
  assert(!/\[player dashboard db\] fallback to localStorage/.test(playerSrc));
});

test('refresh control present for unavailable balance', function() {
  assert(playerSrc.includes('player-balance-refresh'), 'refresh button id');
  assert(playerSrc.includes('Unable to refresh balance'), 'unable copy');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
