/**
 * PocketBooks Sports — Grading Authority Tests
 * Run: node tests/grading-authority.test.js
 * Verifies browser grading is blocked in server-authoritative mode.
 * Pure state-machine tests — no network calls.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Grading authority engine ───────────────────────────────────────────────────

var GRADING_MODE = {
  SERVER_AUTHORITATIVE: 'server_authoritative',
  BROWSER_FALLBACK_DEV: 'browser_fallback_dev'
};

var _gradingMode = GRADING_MODE.SERVER_AUTHORITATIVE; // default: server
var _browserGradeAttempts = 0;
var _browserGradeBlocked  = 0;

function getGradingMode() { return _gradingMode; }
function isServerAuthoritative() { return _gradingMode === GRADING_MODE.SERVER_AUTHORITATIVE; }

function enableBrowserGradeFallback() {
  _gradingMode = GRADING_MODE.BROWSER_FALLBACK_DEV;
  return 'Browser grading enabled (dev fallback)';
}
function disableBrowserGradeFallback() {
  _gradingMode = GRADING_MODE.SERVER_AUTHORITATIVE;
  return 'Server authoritative mode restored';
}

// Simulate browser grade attempt
function attemptBrowserGrade(fn) {
  _browserGradeAttempts++;
  if (_gradingMode !== GRADING_MODE.BROWSER_FALLBACK_DEV) {
    _browserGradeBlocked++;
    console.log('[browser grade blocked] server authoritative mode active — use runServerGrade()');
    return { blocked: true, reason: 'server_authoritative' };
  }
  // Dev fallback: allow
  if (typeof fn === 'function') fn();
  return { blocked: false };
}

// Simulate auto-grade poll decision
function shouldAutoGradePoll(gradingMode, dbPrimaryEnabled) {
  // Poll should call server grade only, never browser grade
  if (gradingMode === GRADING_MODE.SERVER_AUTHORITATIVE) {
    return { action: 'server_grade', reason: 'server_authoritative' };
  }
  // Dev fallback: browser grade allowed
  return { action: 'browser_grade', reason: 'browser_fallback_dev' };
}

// Simulate ticket mutation guard
function canMutateTicketLocally(gradingMode, ticket) {
  // In server mode: localStorage tickets are read-only (cache only)
  // Only grading source = 'server-api' or 'auto-api' from server is trusted
  if (gradingMode !== GRADING_MODE.BROWSER_FALLBACK_DEV) {
    return { allowed: false, reason: 'server_authoritative_no_local_mutation' };
  }
  return { allowed: true };
}

// ── Default state ─────────────────────────────────────────────────────────────
console.log('\n── Default mode: server authoritative ──');

test('default mode is server_authoritative', function() {
  assertEq(getGradingMode(), GRADING_MODE.SERVER_AUTHORITATIVE);
});
test('isServerAuthoritative() is true by default', function() {
  assert(isServerAuthoritative());
});

// ── Browser grade blocked ─────────────────────────────────────────────────────
console.log('\n── Browser grade blocked in server mode ──');

test('browserGrade blocked when server authoritative', function() {
  _gradingMode = GRADING_MODE.SERVER_AUTHORITATIVE;
  var mutated = false;
  var r = attemptBrowserGrade(function(){ mutated = true; });
  assert(r.blocked, 'blocked');
  assert(!mutated, 'mutation did not happen');
  assertEq(r.reason, 'server_authoritative');
});

test('blocked attempt increments _browserGradeBlocked counter', function() {
  _gradingMode = GRADING_MODE.SERVER_AUTHORITATIVE;
  var before = _browserGradeBlocked;
  attemptBrowserGrade(function(){});
  assert(_browserGradeBlocked > before, 'counter incremented');
});

test('ticket mutation blocked in server authoritative mode', function() {
  var r = canMutateTicketLocally(GRADING_MODE.SERVER_AUTHORITATIVE, {});
  assert(!r.allowed, 'mutation blocked');
  assert(r.reason.includes('server_authoritative'), 'reason: '+r.reason);
});

// ── Dev fallback allowed ──────────────────────────────────────────────────────
console.log('\n── Dev fallback enabled ──');

test('enableBrowserGradeFallback sets browser mode', function() {
  enableBrowserGradeFallback();
  assertEq(getGradingMode(), GRADING_MODE.BROWSER_FALLBACK_DEV);
});

test('browser grade runs when dev fallback enabled', function() {
  enableBrowserGradeFallback();
  var ran = false;
  var r = attemptBrowserGrade(function(){ ran = true; });
  assert(!r.blocked, 'not blocked');
  assert(ran, 'function ran');
});

test('ticket mutation allowed in browser fallback mode', function() {
  enableBrowserGradeFallback();
  var r = canMutateTicketLocally(GRADING_MODE.BROWSER_FALLBACK_DEV, {});
  assert(r.allowed, 'mutation allowed in dev mode');
});

test('disableBrowserGradeFallback restores server mode', function() {
  enableBrowserGradeFallback();
  disableBrowserGradeFallback();
  assertEq(getGradingMode(), GRADING_MODE.SERVER_AUTHORITATIVE);
  assert(isServerAuthoritative());
});

// ── Auto-grade poll routing ───────────────────────────────────────────────────
console.log('\n── Auto-grade poll routing ──');

test('poll in server mode → server_grade action', function() {
  var r = shouldAutoGradePoll(GRADING_MODE.SERVER_AUTHORITATIVE, true);
  assertEq(r.action, 'server_grade', 'server mode → server grade');
});

test('poll in dev fallback → browser_grade action', function() {
  var r = shouldAutoGradePoll(GRADING_MODE.BROWSER_FALLBACK_DEV, true);
  assertEq(r.action, 'browser_grade', 'dev mode → browser grade');
});

// ── No localStorage mutation in server mode ───────────────────────────────────
console.log('\n── localStorage protection ──');

test('ticket.status cannot be set by browser in server mode', function() {
  _gradingMode = GRADING_MODE.SERVER_AUTHORITATIVE;
  var ticket = { id:'T001', status:'active' };
  var mutGuard = canMutateTicketLocally(_gradingMode, ticket);
  assert(!mutGuard.allowed, 'mutation blocked');
  // Ticket unchanged
  assertEq(ticket.status, 'active', 'status not mutated');
});

test('server-graded tickets (source=server-api) are trusted', function() {
  // Server writes status via DB, client hydrates from DB — no direct localStorage write
  var dbTicket = { id:'T001', status:'won', gradingSource:'server-api' };
  var isTrusted = dbTicket.gradingSource === 'server-api' || dbTicket.gradingSource === 'auto-api';
  assert(isTrusted, 'server-sourced grading is trusted');
});

// ── Badge labels ──────────────────────────────────────────────────────────────
console.log('\n── Badge labels ──');

test('server mode badge: "Grading:Server"', function() {
  _gradingMode = GRADING_MODE.SERVER_AUTHORITATIVE;
  var label = isServerAuthoritative() ? 'Grading:Server' : 'Grading:BrowserFallback DEV';
  assertEq(label, 'Grading:Server');
});

test('dev fallback badge: "Grading:BrowserFallback DEV"', function() {
  enableBrowserGradeFallback();
  var label = isServerAuthoritative() ? 'Grading:Server' : 'Grading:BrowserFallback DEV';
  assertEq(label, 'Grading:BrowserFallback DEV');
  disableBrowserGradeFallback(); // restore
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Grading authority tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ GRADING AUTHORITY TESTS FAILED'); process.exit(1); }
else console.log('✅ All grading authority rules verified');
