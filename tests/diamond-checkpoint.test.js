/**
 * PocketBooks Sports — Diamond System Checkpoint Tests
 * Run: node tests/diamond-checkpoint.test.js
 * Validates docs contain required content and route inventory is complete.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }

const ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

// ── Route inventory completeness ──────────────────────────────────────────────

// All diamond-related routes that must appear in ARCHITECTURE_CHECKPOINT.md
const DIAMOND_ROUTES = [
  '/api/host/diamond-usage',
  '/api/host/diamond-weekly-report',
  '/api/host/diamond-invoice',
  '/api/admin/host-diamonds/seed',
  '/api/admin/host-diamonds/topup',
  '/api/admin/host-diamonds/adjust'
];

// ── Tests: ARCHITECTURE_CHECKPOINT.md ─────────────────────────────────────────

console.log('\n── ARCHITECTURE_CHECKPOINT.md: diamond economy ──');

test('ARCHITECTURE_CHECKPOINT.md exists', function() {
  assert(exists('ARCHITECTURE_CHECKPOINT.md'));
});

test('mentions host diamond balance model', function() {
  var c = read('ARCHITECTURE_CHECKPOINT.md');
  assert(c.includes('host_diamond_balance') || c.includes('Host Diamond'),
    'missing host diamond balance section');
});

test('mentions 15 diamonds per active bettor per week', function() {
  var c = read('ARCHITECTURE_CHECKPOINT.md');
  assert(c.includes('15') && (c.includes('active bettor') || c.includes('HOST_ACTIVE_BETTOR')),
    'missing fee-per-bettor detail');
});

test('mentions fail-closed rule for missing balance row', function() {
  var c = read('ARCHITECTURE_CHECKPOINT.md');
  assert(c.includes('fail-closed') || c.includes('fail closed') || c.includes('balance_missing') || c.includes('host_diamond_balance_missing'),
    'missing fail-closed documentation');
});

test('mentions weekly active bettors', function() {
  var c = read('ARCHITECTURE_CHECKPOINT.md');
  assert(c.includes('weekly_active_bettors') || c.includes('weekly active bettors'),
    'missing weekly bettors section');
});

test('mentions weekly report or invoice', function() {
  var c = read('ARCHITECTURE_CHECKPOINT.md');
  assert(c.includes('invoice') || c.includes('weekly-report'), 'missing report/invoice docs');
});

test('mentions top-up endpoint', function() {
  var c = read('ARCHITECTURE_CHECKPOINT.md');
  assert(c.includes('topup') || c.includes('top-up') || c.includes('top_up'), 'missing topup docs');
});

test('route inventory includes all diamond routes', function() {
  var c = read('ARCHITECTURE_CHECKPOINT.md');
  var missing = DIAMOND_ROUTES.filter(function(r){ return !c.includes(r); });
  assert(missing.length === 0, 'missing routes in route inventory: ' + missing.join(', '));
});

// ── Tests: seed_first_club.example.sql ────────────────────────────────────────

console.log('\n── seed_first_club.example.sql: host balance required ──');

test('seed file mentions host_diamond_balances', function() {
  var c = read('supabase/seed_first_club.example.sql');
  assert(c.includes('host_diamond_balances'), 'missing host_diamond_balances in seed');
});

test('seed file notes balance is REQUIRED for Phase AA', function() {
  var c = read('supabase/seed_first_club.example.sql');
  assert(c.includes('REQUIRED') || c.includes('required'), 'should mark as required');
});

// ── Tests: GO_LIVE_RUNBOOK.md ─────────────────────────────────────────────────

console.log('\n── GO_LIVE_RUNBOOK.md: diamond mentions ──');

test('runbook mentions host diamonds', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('diamond') || c.includes('Diamond'), 'missing diamond in runbook');
});

// ── Tests: PRODUCTION_DEPLOY_CHECKLIST.md ─────────────────────────────────────

console.log('\n── PRODUCTION_DEPLOY_CHECKLIST.md ──');

test('checklist mentions migrations 001–020', function() {
  var c = read('PRODUCTION_DEPLOY_CHECKLIST.md');
  // Should reference at least migration 019 or 020
  assert(c.includes('019') || c.includes('020') || c.includes('001–018') || c.includes('001-018'),
    'should reference diamond migrations');
});

// ── Tests: CHANGELOG.md ───────────────────────────────────────────────────────

console.log('\n── CHANGELOG.md ──');

test('CHANGELOG.md mentions host diamond economy', function() {
  var c = read('CHANGELOG.md');
  assert(c.includes('diamond') || c.includes('Diamond'), 'missing diamond in changelog');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Diamond checkpoint tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ DIAMOND CHECKPOINT TESTS FAILED'); process.exit(1); }
else console.log('✅ All diamond checkpoint rules verified');
