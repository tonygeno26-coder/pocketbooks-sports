/**
 * PocketBooks Sports — Ops Task 4: Combined Deploy Verify Tests
 * Run: node tests/verify-deploy.test.js
 * Pure logic — no network, no child processes.
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

// ── Inline core logic mirroring verify-deploy.js ─────────────────────────────

function buildCombinedReport(backendCode, frontendCode, frontendSkipped) {
  var backendPass  = backendCode  === 0;
  var frontendPass = frontendSkipped ? null : frontendCode === 0;
  var overallPass  = backendPass && (frontendSkipped || frontendPass);
  return {
    backendPass,
    frontendPass,
    frontendSkipped: !!frontendSkipped,
    overallPass,
    exitCode: overallPass ? 0 : 1
  };
}

function formatCombinedReport(r) {
  var lines = ['\n══ Combined Deploy Verify Report ══════════════════'];
  lines.push('  Backend:  ' + (r.backendPass  ? '🟢 PASS' : '🔴 FAIL'));
  if (r.frontendSkipped) {
    lines.push('  Frontend: ⏭  SKIPPED (VERIFY_STOP_ON_FAIL=true + backend failed)');
  } else {
    lines.push('  Frontend: ' + (r.frontendPass ? '🟢 PASS' : '🔴 FAIL'));
  }
  lines.push('  ─────────────────────────────────────────────────');
  lines.push('  Overall:  ' + (r.overallPass  ? '🟢 PASS — deploy verified' : '🔴 FAIL — do not go live'));
  return lines.join('\n');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Script exists ──');

test('verify-deploy.js exists in scripts/', function() {
  var fs   = require('fs');
  var path = require('path');
  var p    = path.join(__dirname, '..', 'scripts', 'verify-deploy.js');
  assert(fs.existsSync(p), 'scripts/verify-deploy.js not found');
});

test('package.json has verify:deploy script', function() {
  var pkg = require('../package.json');
  assert(pkg.scripts && pkg.scripts['verify:deploy'],
    'verify:deploy not in package.json');
  assert(pkg.scripts['verify:deploy'].includes('verify-deploy'),
    'verify:deploy should invoke verify-deploy.js');
});

console.log('\n── buildCombinedReport ──');

test('both pass (0,0) → overallPass=true, exitCode=0', function() {
  var r = buildCombinedReport(0, 0, false);
  assert(r.overallPass, 'overall pass');
  assertEq(r.exitCode, 0);
  assert(r.backendPass);
  assert(r.frontendPass);
});

test('backend fail (1,0) → overallPass=false, exitCode=1', function() {
  var r = buildCombinedReport(1, 0, false);
  assert(!r.overallPass);
  assertEq(r.exitCode, 1);
  assert(!r.backendPass);
  assert(r.frontendPass);
});

test('frontend fail (0,1) → overallPass=false, exitCode=1', function() {
  var r = buildCombinedReport(0, 1, false);
  assert(!r.overallPass);
  assertEq(r.exitCode, 1);
  assert(r.backendPass);
  assert(!r.frontendPass);
});

test('both fail (1,1) → overallPass=false, exitCode=1', function() {
  var r = buildCombinedReport(1, 1, false);
  assert(!r.overallPass);
  assertEq(r.exitCode, 1);
});

test('stop-on-fail: backend fail + frontend skipped → exitCode=1', function() {
  var r = buildCombinedReport(1, null, true);
  assert(!r.overallPass);
  assertEq(r.exitCode, 1);
  assert(r.frontendSkipped);
});

test('stop-on-fail: backend pass + frontend not skipped → frontendSkipped=false', function() {
  var r = buildCombinedReport(0, 0, false);
  assert(!r.frontendSkipped, 'not skipped when backend passes');
});

console.log('\n── formatCombinedReport ──');

test('both pass → 🟢 PASS in all rows', function() {
  var r = formatCombinedReport(buildCombinedReport(0, 0, false));
  assert(r.includes('Backend:') && r.includes('🟢 PASS'), 'backend pass label');
  assert(r.includes('Frontend:') && !r.includes('🔴 FAIL'), 'no failures');
  assert(r.includes('Overall:') && r.includes('🟢 PASS — deploy verified'));
});

test('backend fail → 🔴 FAIL on backend and overall', function() {
  var r = formatCombinedReport(buildCombinedReport(1, 0, false));
  assert(r.includes('Backend:  🔴 FAIL'));
  assert(r.includes('Overall:  🔴 FAIL'));
  assert(r.includes('Frontend: 🟢 PASS'));
});

test('frontend fail → 🔴 FAIL on frontend and overall', function() {
  var r = formatCombinedReport(buildCombinedReport(0, 1, false));
  assert(r.includes('Frontend: 🔴 FAIL'));
  assert(r.includes('Overall:  🔴 FAIL'));
  assert(r.includes('Backend:  🟢 PASS'));
});

test('frontend skipped → SKIPPED label in report', function() {
  var r = formatCombinedReport(buildCombinedReport(1, null, true));
  assert(r.includes('SKIPPED'), 'shows skipped');
  assert(r.includes('VERIFY_STOP_ON_FAIL'), 'explains why');
});

test('overall pass message says deploy verified', function() {
  var r = formatCombinedReport(buildCombinedReport(0, 0, false));
  assert(r.includes('deploy verified'));
});

test('overall fail message says do not go live', function() {
  var r = formatCombinedReport(buildCombinedReport(1, 0, false));
  assert(r.includes('do not go live'));
});

// ── Exit code derivation ──────────────────────────────────────────────────────

console.log('\n── Exit code contract ──');

test('exit 0 only when backend=0 and frontend=0', function() {
  assertEq(buildCombinedReport(0, 0, false).exitCode, 0);
});
test('exit 1 when backend=1 frontend=0', function() {
  assertEq(buildCombinedReport(1, 0, false).exitCode, 1);
});
test('exit 1 when backend=0 frontend=1', function() {
  assertEq(buildCombinedReport(0, 1, false).exitCode, 1);
});
test('exit 1 when both fail', function() {
  assertEq(buildCombinedReport(1, 1, false).exitCode, 1);
});
test('exit 1 when backend fails and frontend skipped', function() {
  assertEq(buildCombinedReport(1, null, true).exitCode, 1);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Verify-deploy tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ VERIFY-DEPLOY TESTS FAILED'); process.exit(1); }
else console.log('✅ All verify-deploy checks passed');
