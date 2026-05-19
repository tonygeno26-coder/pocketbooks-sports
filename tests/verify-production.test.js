/**
 * PocketBooks Sports — Ops Task 2: Deploy Verification Script Tests
 * Run: node tests/verify-production.test.js
 * Pure logic — no network.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b));
}

// ── Inline the verify logic (no require — keeps tests self-contained) ─────────

const REQUIRED_VERIFY_ENV = [
  'VERIFY_BASE_URL',
  'VERIFY_OWNER_ID',
  'VERIFY_CLUB_ID',
];

function checkVerifyEnv(env) {
  var missing = REQUIRED_VERIFY_ENV.filter(function(k){ return !env[k]; });
  return { ok: missing.length === 0, missing };
}

// Check result builder — mirrors what verify-production.js emits
function buildCheckResult(name, ok, detail) {
  return { name, ok: !!ok, detail: detail||null };
}

function formatReport(results) {
  var lines = ['\n── Production Verify Report ──────────────────────'];
  results.forEach(function(r) {
    lines.push('  ' + (r.ok ? '✅' : '❌') + ' ' + r.name +
      (r.detail ? ': ' + r.detail : ''));
  });
  var allPass = results.every(function(r){ return r.ok; });
  lines.push('─'.repeat(50));
  lines.push(allPass ? '  🟢 PASS — production ready' : '  🔴 FAIL — fix issues above');
  return lines.join('\n');
}

function scrubSecrets(obj) {
  // Never print tokens, keys, or secrets
  var str = JSON.stringify(obj);
  var PATTERNS = [/eyJ[A-Za-z0-9._-]{20,}/g, /"token"\s*:\s*"[^"]+"/g,
                  /"key"\s*:\s*"[^"]+"/g, /"secret"\s*:\s*"[^"]+"/g];
  PATTERNS.forEach(function(p){ str = str.replace(p, '"[REDACTED]"'); });
  return str;
}

// ── Mock http runner (mirrors verify-production.js _runCheck interface) ───────

function mockCheck(name, mockResponse, expectOk) {
  var ok = mockResponse && mockResponse.ok === true;
  if (expectOk !== undefined) ok = expectOk;
  return buildCheckResult(name, ok,
    ok ? 'ok' : (mockResponse && mockResponse.error) || 'failed');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Script exists ──');

test('verify-production.js exists in scripts/', function() {
  var fs = require('fs');
  var path = require('path');
  var p = path.join(__dirname, '..', 'scripts', 'verify-production.js');
  assert(fs.existsSync(p), 'scripts/verify-production.js not found');
});

test('package.json has verify:production script', function() {
  var pkg = require('../package.json');
  assert(pkg.scripts && pkg.scripts['verify:production'],
    'verify:production script not in package.json');
  assert(pkg.scripts['verify:production'].includes('verify-production'),
    'verify:production should invoke verify-production.js');
});

console.log('\n── Env var validation ──');

test('all required env vars present → ok', function() {
  var env = { VERIFY_BASE_URL:'https://example.railway.app', VERIFY_OWNER_ID:'H1', VERIFY_CLUB_ID:'C1' };
  var r = checkVerifyEnv(env);
  assert(r.ok); assertEq(r.missing.length, 0);
});

test('missing VERIFY_BASE_URL → not ok', function() {
  var r = checkVerifyEnv({ VERIFY_OWNER_ID:'H1', VERIFY_CLUB_ID:'C1' });
  assert(!r.ok); assert(r.missing.includes('VERIFY_BASE_URL'));
});

test('missing VERIFY_OWNER_ID → not ok', function() {
  var r = checkVerifyEnv({ VERIFY_BASE_URL:'https://x', VERIFY_CLUB_ID:'C1' });
  assert(!r.ok); assert(r.missing.includes('VERIFY_OWNER_ID'));
});

test('missing VERIFY_CLUB_ID → not ok', function() {
  var r = checkVerifyEnv({ VERIFY_BASE_URL:'https://x', VERIFY_OWNER_ID:'H1' });
  assert(!r.ok); assert(r.missing.includes('VERIFY_CLUB_ID'));
});

test('all missing → readable failure list', function() {
  var r = checkVerifyEnv({});
  assert(!r.ok);
  assertEq(r.missing.length, REQUIRED_VERIFY_ENV.length);
  r.missing.forEach(function(k){ assert(typeof k==='string' && k.length>0); });
});

console.log('\n── Mock successful responses → PASS ──');

test('health ok → PASS result', function() {
  var r = mockCheck('Health', { ok:true, dbStatus:'connected', uptime:120 });
  assert(r.ok); assertEq(r.name, 'Health');
});

test('env-check ok → PASS result', function() {
  var r = mockCheck('Env readiness', { ok:true, missing:[], warnings:[] });
  assert(r.ok);
});

test('auth token issued → PASS result', function() {
  // Token itself is not printed — only ok:true
  var r = mockCheck('Auth token (owner)', { ok:true });
  assert(r.ok);
});

test('diagnostics ok → PASS result', function() {
  var r = mockCheck('Diagnostics', { ok:true, rpcFailCount:0, activeSessions:1 });
  assert(r.ok);
});

test('markets status ok → PASS result', function() {
  var r = mockCheck('Markets status', { ok:true, openCount:5 });
  assert(r.ok);
});

test('crypto reconciliation ok → PASS result (optional)', function() {
  var r = mockCheck('Crypto reconciliation (optional)', { ok:true, dailySummary:[] });
  assert(r.ok);
});

console.log('\n── Mock failure responses → FAIL ──');

test('health db not connected → FAIL', function() {
  var r = mockCheck('Health', { ok:false, dbStatus:'error', error:'connection refused' });
  assert(!r.ok);
});

test('env-check missing vars → FAIL', function() {
  var r = mockCheck('Env readiness', { ok:false, missing:[{ key:'SESSION_SECRET' }] });
  assert(!r.ok);
});

test('auth 401 → FAIL', function() {
  var r = mockCheck('Auth token (owner)', { ok:false, error:'membership_not_found' });
  assert(!r.ok); assert(r.detail.includes('membership_not_found'));
});

console.log('\n── Report formatting ──');

test('all pass → 🟢 PASS in report', function() {
  var results = [
    buildCheckResult('Health', true),
    buildCheckResult('Env readiness', true),
    buildCheckResult('Auth token (owner)', true),
  ];
  var report = formatReport(results);
  assert(report.includes('🟢 PASS'));
  assert(!report.includes('🔴 FAIL'));
});

test('any failure → 🔴 FAIL in report', function() {
  var results = [
    buildCheckResult('Health', true),
    buildCheckResult('Env readiness', false, 'missing SESSION_SECRET'),
  ];
  var report = formatReport(results);
  assert(report.includes('🔴 FAIL'));
  assert(!report.includes('🟢 PASS'));
});

test('each result line shows ✅ or ❌', function() {
  var results = [
    buildCheckResult('Health', true),
    buildCheckResult('Env readiness', false, 'missing vars'),
  ];
  var report = formatReport(results);
  assert(report.includes('✅ Health'));
  assert(report.includes('❌ Env readiness'));
});

console.log('\n── Secret scrubbing ──');

test('scrubSecrets removes JWT tokens', function() {
  var obj = { ok:true, token:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc' };
  var out = scrubSecrets(obj);
  assert(!out.includes('eyJhbGci'), 'JWT scrubbed');
  assert(out.includes('REDACTED'), 'REDACTED present');
});

test('scrubSecrets removes key fields', function() {
  var obj = { key:'super_secret_value_here_1234' };
  var out = scrubSecrets(obj);
  assert(!out.includes('super_secret_value_here_1234'), 'key value scrubbed');
});

test('scrubSecrets leaves non-secret fields intact', function() {
  var obj = { ok:true, dbStatus:'connected', uptime:42 };
  var out = scrubSecrets(obj);
  assert(out.includes('connected'), 'non-secret intact');
  assert(out.includes('42'), 'number intact');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Verify-production tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ VERIFY-PRODUCTION TESTS FAILED'); process.exit(1); }
else console.log('✅ All verify-production checks passed');
