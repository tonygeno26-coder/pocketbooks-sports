/**
 * PocketBooks Sports — Ops Task 6: Go-Live Runbook + Seed Script Tests
 * Run: node tests/go-live-docs.test.js
 * Validates docs/templates exist and are clean — no network, no runtime changes.
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

// Known-bad strings that must never appear in committed docs/templates
const SECRET_PATTERNS = [
  /sk_live_[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{30,}/,
  /eyJ[A-Za-z0-9._-]{40,}/,          // JWT
  /AAH[A-Za-z0-9_-]{30,}/,           // Telegram token fragment
  /8682205963:/,                       // Telegram bot id
  /fc589327097f3ce5/,                  // Odds API key prefix
  /SUPABASE_SERVICE_ROLE_KEY=[^\n=]+[A-Za-z0-9]{20}/, // key with value
];

function containsSecret(text) {
  return SECRET_PATTERNS.some(function(p){ return p.test(text); });
}

// ── File existence ────────────────────────────────────────────────────────────

console.log('\n── Files exist ──');

test('GO_LIVE_RUNBOOK.md exists', function() {
  assert(exists('GO_LIVE_RUNBOOK.md'), 'GO_LIVE_RUNBOOK.md not found');
});

test('supabase/seed_first_club.example.sql exists', function() {
  assert(exists('supabase/seed_first_club.example.sql'),
    'supabase/seed_first_club.example.sql not found');
});

// ── Runbook content checks ────────────────────────────────────────────────────

console.log('\n── GO_LIVE_RUNBOOK.md content ──');

test('runbook has pre-launch checklist section', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('pre-launch') || c.includes('Pre-Launch') || c.includes('Pre-launch'),
    'missing pre-launch section');
});

test('runbook mentions Railway env vars', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('Railway') && c.includes('SESSION_SECRET'), 'missing Railway env section');
});

test('runbook mentions Supabase migrations', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('migration') || c.includes('Migration'), 'missing migration section');
});

test('runbook mentions first club setup', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('club') || c.includes('Club'), 'missing club setup section');
});

test('runbook mentions odds verification', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('odds') || c.includes('Odds'), 'missing odds verification');
});

test('runbook mentions grading verification', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('grad') || c.includes('Grad'), 'missing grading section');
});

test('runbook mentions settlement', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('settlement') || c.includes('Settlement'), 'missing settlement section');
});

test('runbook mentions crypto deposit', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('crypto') || c.includes('Crypto'), 'missing crypto section');
});

test('runbook has rollback plan', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('rollback') || c.includes('Rollback'), 'missing rollback plan');
});

test('runbook has emergency pause section', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('emergency') || c.includes('Emergency') || c.includes('pause') || c.includes('Pause'),
    'missing emergency pause section');
});

test('runbook mentions revoke session', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('revoke') || c.includes('session'), 'missing session revocation');
});

test('runbook mentions disabling betting / risk settings', function() {
  var c = read('GO_LIVE_RUNBOOK.md');
  assert(c.includes('risk') || c.includes('disable'), 'missing risk/disable betting section');
});

// ── Seed SQL content checks ───────────────────────────────────────────────────

console.log('\n── seed_first_club.example.sql content ──');

test('seed SQL has owner INSERT', function() {
  var c = read('supabase/seed_first_club.example.sql');
  assert(c.includes('owner'), 'missing owner row');
});

test('seed SQL has full_admin INSERT', function() {
  var c = read('supabase/seed_first_club.example.sql');
  assert(c.includes('full_admin'), 'missing full_admin row');
});

test('seed SQL has settlement_manager INSERT', function() {
  var c = read('supabase/seed_first_club.example.sql');
  assert(c.includes('settlement_manager'), 'missing settlement_manager row');
});

test('seed SQL has risk_viewer INSERT', function() {
  var c = read('supabase/seed_first_club.example.sql');
  assert(c.includes('risk_viewer'), 'missing risk_viewer row');
});

test('seed SQL has player INSERT', function() {
  var c = read('supabase/seed_first_club.example.sql');
  assert(c.includes("'player'"), 'missing player row');
});

test('seed SQL has player_limits or club_risk_settings', function() {
  var c = read('supabase/seed_first_club.example.sql');
  assert(c.includes('player_limits') || c.includes('club_risk_settings'),
    'missing limits seed');
});

test('seed SQL uses ON CONFLICT for safety', function() {
  var c = read('supabase/seed_first_club.example.sql');
  assert(c.includes('ON CONFLICT'), 'missing ON CONFLICT clause');
});

test('seed SQL uses fake/placeholder IDs not real values', function() {
  var c = read('supabase/seed_first_club.example.sql');
  // Should contain placeholder-style IDs
  assert(c.includes('your-') || c.includes('example') || c.includes('_001') || c.includes('REPLACE'),
    'should use clearly placeholder IDs');
});

// ── Secret scan ───────────────────────────────────────────────────────────────

console.log('\n── Secret scan ──');

test('GO_LIVE_RUNBOOK.md contains no secrets', function() {
  assert(!containsSecret(read('GO_LIVE_RUNBOOK.md')), 'secret detected in runbook');
});

test('seed_first_club.example.sql contains no secrets', function() {
  assert(!containsSecret(read('supabase/seed_first_club.example.sql')), 'secret detected in seed SQL');
});

test('CHANGELOG.md contains no secrets', function() {
  assert(!containsSecret(read('CHANGELOG.md')), 'secret in CHANGELOG.md');
});

test('PRODUCTION_DEPLOY_CHECKLIST.md contains no secrets', function() {
  assert(!containsSecret(read('PRODUCTION_DEPLOY_CHECKLIST.md')), 'secret in checklist');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Go-live docs tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ GO-LIVE DOCS TESTS FAILED'); process.exit(1); }
else console.log('✅ All go-live doc checks passed');
