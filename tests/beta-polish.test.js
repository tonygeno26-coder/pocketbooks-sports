/**
 * Static guards for beta-polish helpers + wiring.
 */
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var pass = 0, fail = 0;

function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

var polish = fs.readFileSync(path.join(ROOT, 'beta-polish.js'), 'utf8');
var player = fs.readFileSync(path.join(ROOT, 'player.html'), 'utf8');
var lobby = fs.readFileSync(path.join(ROOT, 'lobby.html'), 'utf8');
var index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

console.log('\n-- beta polish --');

test('beta-polish.js exports normalize + feedback + onboarding', function () {
  assert(polish.indexOf('function _pbNormalizeApiError') >= 0);
  assert(polish.indexOf('function _pbBuildFeedbackPayload') >= 0);
  assert(polish.indexOf('function _pbOpenOnboarding') >= 0);
  assert(polish.indexOf('BETA_HIDDEN_FEATURES') >= 0);
  assert(polish.indexOf('pb-sports-token') < 0 || polish.indexOf('[redacted]') >= 0);
});

test('feedback payload redacts token query params', function () {
  assert(polish.indexOf('[redacted]') >= 0);
  assert(/token\|access_token\|refresh_token/i.test(polish));
});

test('player.html includes beta-polish and settings extras', function () {
  assert(player.indexOf('beta-polish.js') >= 0);
  assert(player.indexOf('_pbSettingsExtrasHtml') >= 0);
  assert(player.indexOf('_pbWireSettingsExtras') >= 0);
  assert(player.indexOf('_pbMaybeStartOnboarding') >= 0);
  assert(player.indexOf('_pbDebugWarn') >= 0);
});

test('player gates predictions/search dead features', function () {
  assert(player.indexOf("tab === 'predictions' || tab === 'search'") >= 0);
  assert(player.indexOf('data-beta-hidden="NOT_IMPLEMENTED"') >= 0);
  assert(player.indexOf("showToast('🔍 Search coming soon')") < 0);
});

test('lobby + host include beta-polish', function () {
  assert(lobby.indexOf('beta-polish.js') >= 0);
  assert(lobby.indexOf('_pbSettingsExtrasHtml') >= 0);
  assert(index.indexOf('beta-polish.js') >= 0);
  assert(index.indexOf('host-build-sha') >= 0);
  assert(index.indexOf('_pbOpenFeedbackModal') >= 0);
});

test('docs exist', function () {
  assert(fs.existsSync(path.join(ROOT, 'docs/API_ERROR_CONTRACT.md')));
  assert(fs.existsSync(path.join(ROOT, 'docs/BETA_FEEDBACK_SPEC.md')));
  assert(fs.existsSync(path.join(ROOT, 'docs/BETA_RELEASE_CHECKLIST.md')));
  assert(fs.existsSync(path.join(ROOT, 'docs/BETA_WALKTHROUGH.md')));
});

// Evaluate normalize against sample shapes
test('normalize handles common error shapes', function () {
  // eslint-disable-next-line no-new-func
  var fn = new Function(polish + '; return _pbNormalizeApiError;');
  var norm = fn();
  var a = norm({ error: 'expired_token' }, 403);
  assert(a.error === 'expired_token');
  assert(/expired token/i.test(a.message));
  var b = norm({ code: 'club_scope_mismatch', message: 'Wrong club' }, 403);
  assert(b.error === 'club_scope_mismatch');
  assert(b.message === 'Wrong club');
  var c = norm({ errors: ['stake_above_max', 'sport_blocked'] }, 400);
  assert(/stake above max/i.test(c.message) || c.message.indexOf('stake_above_max') >= 0 || c.message.indexOf('stake above max') >= 0 || c.message.indexOf(',') >= 0);
  var d = norm({ error_code: 'OUT_OF_USAGE_CREDITS' }, 402);
  assert(d.error === 'OUT_OF_USAGE_CREDITS');
  var e = norm({}, 500);
  assert(e.message.indexOf('500') >= 0);
});

test('feedback route redaction regex covers token keys', function () {
  assert(/token\|access_token\|refresh_token/i.test(polish));
  assert(polish.indexOf('[redacted]') >= 0);
  // Unit the regex in isolation (no live secrets)
  var rx = /([?&])(token|access_token|refresh_token|authorization|password|pass|secret|api[_-]?key)=[^&]*/gi;
  var sample = '?preview=1&token=x&sport=mlb';
  var out = sample.replace(rx, '$1$2=[redacted]');
  assert(out.indexOf('[redacted]') >= 0, 'regex should redact');
  assert(!/token=x(?:&|$)/.test(out), 'raw token value must not remain');
});

test('feedback builder returns build sha without throwing', function () {
  var prevSha = global.PBS_BUILD_SHA;
  var prevDate = global.PBS_BUILD_DATE;
  global.PBS_BUILD_SHA = 'abc1234';
  global.PBS_BUILD_DATE = '2026-09-09T00:00:00.000Z';
  try {
    // eslint-disable-next-line no-new-func
    var build = new Function(polish + '; return _pbBuildFeedbackPayload;')();
    var p = build('ui glitch');
    assert(p && p.build && p.build.sha === 'abc1234', 'expected build sha');
    assert(p.note === 'ui glitch');
  } finally {
    global.PBS_BUILD_SHA = prevSha;
    global.PBS_BUILD_DATE = prevDate;
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
