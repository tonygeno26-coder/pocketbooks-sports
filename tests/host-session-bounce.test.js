/**
 * P1 — Host session bounce / notifications soft-auth
 * Run: node tests/host-session-bounce.test.js
 * Pure static checks — no network.
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

console.log('\n── Host boot gate ──');

test('index.html skips lobby bounce when ?preview=1', function() {
  var html = read('index.html');
  var boot = html.slice(0, html.indexOf('</script>'));
  assert(boot.includes("get('preview') === '1'"), 'preview escape missing');
  assert(/if \(_hPrev\) return/.test(boot), 'preview early return missing');
});

test('index.html boot accepts pb-session-token fallback', function() {
  var boot = read('index.html').slice(0, 2500);
  assert(boot.includes("localStorage.getItem('pb-session-token')"), 'boot must read pb-session-token');
  assert(boot.includes("localStorage.getItem('pb-sports-token') || localStorage.getItem('pb-session-token')"),
    'boot token must OR both keys');
});

test('index.html boot still rejects malformed JWT (non-preview)', function() {
  var boot = read('index.html').slice(0, 2500);
  assert(boot.includes('_bootParts.length !== 3'), 'malformed JWT gate missing');
});

console.log('\n── Refresh-before-redirect (no fatal-401 spiral) ──');

['index.html', 'player.html'].forEach(function(file) {
  test(file + ' refreshes on 401 before redirect', function() {
    var html = read(file);
    var marker = file === 'player.html'
      ? '// _pbFetch: wraps fetch()'
      : 'async function _pbFetch(url, opts)';
    var fnStart = html.indexOf(marker);
    assert(fnStart !== -1, '_pbFetch missing');
    var fn = html.slice(fnStart, fnStart + 4500);
    // Old bug: treat every 401 as immediately fatal before refresh.
    assert(!/var fatal = resp\.status === 401/.test(fn),
      file + ' still has fatal=401-before-refresh bug');
    assert(fn.includes('_refreshAuthToken()'), file + ' must attempt refresh');
    assert(fn.includes('_retried: true') || fn.includes('_retried:true'),
      file + ' must single-retry after refresh');
  });
});

test('index.html apiCall refreshes before redirect on 401', function() {
  var html = read('index.html');
  var idx = html.indexOf('async function apiCall');
  var fn = html.slice(idx, idx + 2500);
  assert(fn.includes('_refreshAuthToken()'), 'apiCall must refresh');
  // Must not redirect on first 401 before attempting refresh.
  var redirectIdx = fn.indexOf("_authRedirectToLogin('Session invalid");
  var refreshIdx = fn.indexOf('_refreshAuthToken()');
  assert(refreshIdx !== -1 && (redirectIdx === -1 || refreshIdx < redirectIdx),
    'apiCall must call refresh before Session invalid redirect');
});

test('lobby apiCall refreshes before redirect on 401', function() {
  var html = read('lobby.html');
  var idx = html.indexOf('async function apiCall');
  var fn = html.slice(idx, idx + 2200);
  assert(fn.includes('_refreshAuthToken()'), 'lobby apiCall must refresh');
  var redirectIdx = fn.indexOf("_authRedirectToLogin('Session invalid");
  var refreshIdx = fn.indexOf('_refreshAuthToken()');
  assert(refreshIdx !== -1 && (redirectIdx === -1 || refreshIdx < redirectIdx),
    'lobby apiCall must refresh before Session invalid redirect');
});

console.log('\n── Soft-auth notifications ──');

['index.html', 'player.html'].forEach(function(file) {
  test(file + ' defines soft-auth path for notifications', function() {
    var html = read(file);
    assert(html.includes('function _isSoftAuthPath'), '_isSoftAuthPath missing in ' + file);
    var body = html.match(/function _isSoftAuthPath[\s\S]{0,220}/);
    assert(body && body[0].indexOf('notifications') !== -1,
      'notifications must be soft-auth in ' + file);
  });
});

test('player _pbFetch soft-fails notification 401 without redirect', function() {
  var html = read('player.html');
  var marker = '// _pbFetch: wraps fetch()';
  var fn = html.slice(html.indexOf(marker), html.indexOf(marker) + 5000);
  assert(fn.includes('_isSoftAuthPath(path)'), 'soft path gate missing');
  assert(/Soft-fail notifications|never session-nuke|never wipe/.test(fn),
    'soft-fail comment/marker missing');
});

console.log('\n── Auth classify-only (no redirect in handleResponse) ──');

['index.html', 'player.html', 'lobby.html'].forEach(function(file) {
  test(file + ' _authHandleResponse does not redirect', function() {
    var html = read(file);
    var idx = html.indexOf('function _authHandleResponse');
    assert(idx !== -1, '_authHandleResponse missing');
    var fn = html.slice(idx, idx + 500);
    assert(!fn.includes('_authRedirectToLogin'),
      file + ' _authHandleResponse must not redirect (breaks refresh)');
    assert(fn.includes("return 'fatal'"), 'must still classify fatal');
  });
});

console.log('\n── No settlement Option A contamination ──');

test('branch diff vs main has no settlement-option-a payment mutation helpers', function() {
  var html = read('index.html');
  // Ported auth stack only — do not require Option A carry UI markers.
  assert(!html.includes('SETTLEMENT_PARTIAL_CARRY'), 'settlement partial carry docs must not leak into FE');
});

console.log('\n' + '─'.repeat(56));
if (_fail === 0) {
  console.log('  🟢 PASS — ' + _pass + ' host session bounce checks');
  process.exit(0);
} else {
  console.log('  🔴 FAIL — ' + _fail + ' failed, ' + _pass + ' passed');
  process.exit(1);
}
