/**
 * PocketBooks Sports — Auth/session resilience static checks
 * Run: node tests/auth-resilience.test.js
 * Pure logic — no network.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var _pass = 0, _fail = 0;

function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch (e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function read(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

console.log('\n── Auth guard markers ──');

['player.html', 'lobby.html', 'index.html', 'survivor.html'].forEach(function(file) {
  test(file + ' defines _AUTH_MAX_RETRIES = 3', function() {
    var html = read(file);
    assert(/var _AUTH_MAX_RETRIES = 3/.test(html), '_AUTH_MAX_RETRIES missing in ' + file);
  });
  test(file + ' defines _authGiveUp guard', function() {
    assert(/var _authGiveUp = false/.test(read(file)), '_authGiveUp missing in ' + file);
  });
  test(file + ' defines exponential backoff cap', function() {
    assert(/function _authBackoffMs\(n\) \{ return Math\.min\(1000 \* Math\.pow\(2, n\), 4000\); \}/.test(read(file)),
      '_authBackoffMs missing in ' + file);
  });
});

console.log('\n── Token endpoint safety ──');

test('player boot recovery does not retry on 429', function() {
  var html = read('player.html');
  assert(html.includes('TOKEN_RECOVERY_RATE_LIMITED — not retrying'), 'missing 429 no-retry marker');
  assert(html.includes('window._bootTokenRecoveryInFlight = true'), 'missing boot recovery flag');
});

test('player _verifyOrRefreshSession skips during boot recovery', function() {
  var html = read('player.html');
  assert(html.includes("reason:'boot_recovery_in_flight'"), 'verify should defer during boot recovery');
});

test('player _pbFetch only counts auth 429 toward auth guard', function() {
  var html = read('player.html');
  var idx = html.indexOf('if (resp.status === 429 && _isAuthApiPath(path))');
  assert(idx !== -1, '429 must be gated by _isAuthApiPath in player _pbFetch');
});

test('lobby _acquireClubToken uses _authFetchOnce + guard', function() {
  var html = read('lobby.html');
  assert(html.includes('async function _acquireClubToken'), 'missing _acquireClubToken');
  assert(/_authFetchOnce\(API \+ '\/api\/auth\/token'/.test(html), 'club token must use guarded fetch');
  assert(html.includes("error:'too_many_requests'"), 'human-readable too_many_requests path');
});

console.log('\n── Malformed JWT rejection ──');

test('player session gate rejects malformed JWT', function() {
  var html = read('player.html');
  assert(html.includes("missing.push('token_malformed')"), 'player gate must flag malformed token');
});

test('index boot rejects malformed JWT', function() {
  var html = read('index.html');
  assert(html.includes('_bootParts.length !== 3'), 'index boot must reject non-3-part JWT');
});

test('survivor init rejects malformed JWT', function() {
  var html = read('survivor.html');
  assert(html.includes('_tokParts.length !== 3'), 'survivor init must reject malformed JWT');
});

console.log('\n── Host dashboard apiCall ──');

test('index.html defines apiCall for club/member APIs', function() {
  var html = read('index.html');
  assert(/async function apiCall\(method, path, body, _retried\)/.test(html), 'apiCall missing in index.html');
  assert(/async function _pbFetch\(url, opts\)/.test(html), '_pbFetch missing in index.html');
  assert(html.includes('_ensureFreshToken'), 'index must proactively refresh tokens');
});

console.log('\n── Session token storage parity ──');

test('lobby _storeAuthToken writes pb-session-token', function() {
  var html = read('lobby.html');
  var fn = html.slice(html.indexOf('function _storeAuthToken'), html.indexOf('function _storedActorClub'));
  assert(fn.includes("localStorage.setItem('pb-session-token', token)"), 'lobby must store pb-session-token');
});

test('player verify clears pb-sports-token on hard session errors', function() {
  var html = read('player.html');
  assert(html.includes("localStorage.removeItem('pb-sports-token')"), 'verify must clear sports token on hard errors');
});

console.log('\n── Retry policy invariants ──');

function assertSingleRetryMarker(file, fnName) {
  test(file + ' ' + fnName + ' uses _retried single-retry flag', function() {
    var html = read(file);
    var hasMarker = html.includes('_retried: true') || html.includes('_retried:true')
      || /apiCall\([^)]*,\s*true\)/.test(html);
    assert(hasMarker, file + ' missing single retry marker');
  });
}

assertSingleRetryMarker('player.html', '_pbFetch');
assertSingleRetryMarker('index.html', '_pbFetch');
assertSingleRetryMarker('lobby.html', 'apiCall');

console.log('\n' + '─'.repeat(56));
if (_fail === 0) {
  console.log('  🟢 PASS — ' + _pass + ' auth resilience checks');
  process.exit(0);
} else {
  console.log('  🔴 FAIL — ' + _fail + ' failed, ' + _pass + ' passed');
  process.exit(1);
}
