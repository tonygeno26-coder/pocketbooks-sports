/**
 * Beta P1 — Insufficient funds must NOT clear session / redirect to login.
 * Run: node tests/insufficient-funds-session.test.js
 * Pure static + pure-function checks — no network.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var _pass = 0, _fail = 0;

function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch (e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m || '') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}
function read(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function extractFn(html, name) {
  var re = new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}');
  var m = html.match(re);
  if (!m) throw new Error(name + ' not found');
  return m[0];
}

console.log('\n── Insufficient funds / session misclassification ──');

test('player.html defines _isBettingBusinessDenial', function() {
  var html = read('player.html');
  assert(html.indexOf('function _isBettingBusinessDenial') !== -1, 'helper missing');
  assert(html.indexOf('insufficient_balance') !== -1, 'must mention insufficient_balance');
});

test('_isBettingBusinessDenial: insufficient_balance at 400', function() {
  var html = read('player.html');
  var src = extractFn(html, '_bettingDenialCode') + '\n' + extractFn(html, '_isBettingBusinessDenial');
  var sandbox = {};
  vm.runInNewContext(src, sandbox);
  assert(sandbox._isBettingBusinessDenial(400, { ok: false, error: 'insufficient_balance', available: 12, stake: 50 }),
    '400 insufficient_balance must be business denial');
});

test('_isBettingBusinessDenial: insufficient_balance even if mis-statused 403', function() {
  var html = read('player.html');
  var src = extractFn(html, '_bettingDenialCode') + '\n' + extractFn(html, '_isBettingBusinessDenial');
  var sandbox = {};
  vm.runInNewContext(src, sandbox);
  assert(sandbox._isBettingBusinessDenial(403, { ok: false, error: 'insufficient_balance' }),
    'mis-statused insufficient_balance must still be business denial');
});

test('_isBettingBusinessDenial: player_suspended is business (not auth)', function() {
  var html = read('player.html');
  var src = extractFn(html, '_bettingDenialCode') + '\n' + extractFn(html, '_isBettingBusinessDenial');
  var sandbox = {};
  vm.runInNewContext(src, sandbox);
  assert(sandbox._isBettingBusinessDenial(403, { ok: false, code: 'player_suspended' }),
    'player_suspended must not be treated as session invalid');
  assert(sandbox._isBettingBusinessDenial(422, { ok: false, code: 'player_suspended' }),
    'player_suspended 422 must be business denial');
});

test('_isBettingBusinessDenial: expired_token is NOT a business denial', function() {
  var html = read('player.html');
  var src = extractFn(html, '_bettingDenialCode') + '\n' + extractFn(html, '_isBettingBusinessDenial');
  var sandbox = {};
  vm.runInNewContext(src, sandbox);
  assert(!sandbox._isBettingBusinessDenial(403, { error: 'expired_token' }),
    'expired_token must remain auth-path');
});

test('_pbFetch skips hard-403 redirect for betting business denials', function() {
  var html = read('player.html');
  var marker = '// _pbFetch: wraps fetch()';
  var fn = html.slice(html.indexOf(marker), html.indexOf(marker) + 6500);
  assert(fn.indexOf('_isBettingBusinessDenial') !== -1, '_pbFetch must consult business denial helper');
  assert(fn.indexOf("Session invalid — please sign in again") !== -1, 'auth redirect still present for real hard 403');
});

test('confirmBet never scope-wipes on insufficient_balance', function() {
  var html = read('player.html');
  var idx = html.indexOf('async function confirmBet');
  assert(idx !== -1, 'confirmBet missing');
  // confirmBet is large — cover through BACKEND_REJECTION / insufficient sync.
  var fn = html.slice(idx, idx + 90000);
  assert(fn.indexOf('Insufficient balance') !== -1, 'must show Insufficient balance copy');
  assert(fn.indexOf('applyDisplayedBalance(Number(_dbData.available))') !== -1,
    'must sync displayed balance from server available on insufficient_balance');
  assert(fn.indexOf('_isBettingBusinessDenial') !== -1,
    'confirmBet 401/403 path must skip wipe for business denials');
  assert(fn.indexOf("_authRedirectToLogin") === -1,
    'confirmBet must not call auth redirect (session wipe belongs to _pbFetch only)');
});

test('client precheck toast stays on insufficient — no logout', function() {
  var html = read('player.html');
  var idx = html.indexOf("reason=insufficient_balance avail=");
  assert(idx !== -1, 'client insufficient gate missing');
  var slice = html.slice(idx - 400, idx + 200);
  assert(slice.indexOf('showToast') !== -1, 'must toast');
  assert(slice.indexOf('_authRedirectToLogin') === -1, 'client gate must not logout');
  assert(slice.indexOf('_handleScopeFailure') === -1, 'client gate must not wipe scope');
});

test('PbBetaUx maps insufficient_balance to clear balance copy', function() {
  var ux = read('pb-beta-ux.js');
  assert(/insufficient_balance:\s*'Insufficient balance/i.test(ux),
    'map entry must say Insufficient balance');
  var sandbox = { window: {} };
  vm.runInNewContext(ux, sandbox);
  var PbBetaUx = sandbox.window.PbBetaUx;
  assert(PbBetaUx && typeof PbBetaUx.mapBetRejectMessage === 'function', 'PbBetaUx missing');
  var msg = PbBetaUx.mapBetRejectMessage('insufficient_balance');
  assert(/insufficient balance/i.test(msg), 'map must say Insufficient balance — got: ' + msg);
  assert(!/session|expired|sign in|timeout/i.test(msg), 'must not sound like session timeout');
});

test('confirm modal disables place when stake exceeds displayed balance', function() {
  var html = read('player.html');
  var idx = html.indexOf('Insufficient Balance');
  assert(idx !== -1, 'confirm label missing');
  assert(html.indexOf("insufficient?'disabled':'')") !== -1 ||
         html.indexOf('insufficient?\'disabled\':\'\'') !== -1 ||
         /insufficient\s*\?\s*['"]disabled['"]/.test(html),
    'confirm button must disable when insufficient');
});

console.log('\n' + '─'.repeat(56));
if (_fail === 0) {
  console.log('  🟢 PASS — ' + _pass + ' insufficient-funds session checks');
  process.exit(0);
} else {
  console.log('  🔴 FAIL — ' + _fail + ' failed, ' + _pass + ' passed');
  process.exit(1);
}
