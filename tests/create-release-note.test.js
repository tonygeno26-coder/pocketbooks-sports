/**
 * PocketBooks Sports — Ops Task 5: Release Tagging + Changelog Tests
 * Run: node tests/create-release-note.test.js
 * Pure logic — minimal FS, no network.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b));
}

// ── Inline core logic mirroring create-release-note.js ───────────────────────

const REQUIRED_VARS = ['RELEASE_VERSION','FRONTEND_SHA','BACKEND_SHA','TEST_COUNT','VERIFY_STATUS'];

function checkEnv(env) {
  var missing = REQUIRED_VARS.filter(function(k){ return !env[k]; });
  return { ok: missing.length === 0, missing };
}

function buildReleaseNote(env) {
  var now = new Date().toISOString().slice(0, 10);
  var verifyBadge = env.VERIFY_STATUS === 'PASS' ? '🟢 PASS' : '🔴 FAIL';
  var lines = [
    '## v' + env.RELEASE_VERSION + ' — ' + now,
    '',
    '| Field | Value |',
    '|---|---|',
    '| Frontend SHA | `' + env.FRONTEND_SHA + '` |',
    '| Backend SHA  | `' + env.BACKEND_SHA  + '` |',
    '| Test count   | ' + env.TEST_COUNT + ' |',
    '| Verify status | ' + verifyBadge + ' |',
  ];
  if (env.NOTES && env.NOTES.trim()) {
    lines.push('| Notes | ' + env.NOTES.trim() + ' |');
  }
  lines.push('');
  return lines.join('\n');
}

function safeAppend(changelogPath, note) {
  // Read existing content, prepend the new note after the first H1 line (if present)
  var existing = '';
  try { existing = fs.readFileSync(changelogPath, 'utf8'); } catch(_) {}
  var h1end = existing.indexOf('\n');
  var header = h1end > -1 && existing.startsWith('#')
    ? existing.slice(0, h1end + 1) + '\n'
    : '';
  var rest   = h1end > -1 && existing.startsWith('#')
    ? existing.slice(h1end + 1)
    : existing;
  var updated = header + note + rest;
  fs.writeFileSync(changelogPath, updated, 'utf8');
  return updated;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Script + file exists ──');

test('create-release-note.js exists in scripts/', function() {
  var p = path.join(__dirname, '..', 'scripts', 'create-release-note.js');
  assert(fs.existsSync(p), 'scripts/create-release-note.js not found');
});

test('package.json has release:note script', function() {
  var pkg = require('../package.json');
  assert(pkg.scripts && pkg.scripts['release:note'],
    'release:note not in package.json');
  assert(pkg.scripts['release:note'].includes('create-release-note'),
    'release:note should invoke create-release-note.js');
});

test('CHANGELOG.md exists at repo root', function() {
  var p = path.join(__dirname, '..', 'CHANGELOG.md');
  assert(fs.existsSync(p), 'CHANGELOG.md not found');
  var content = fs.readFileSync(p, 'utf8');
  assert(content.includes('#'), 'CHANGELOG.md has content');
});

console.log('\n── checkEnv ──');

test('all required vars present → ok', function() {
  var env = { RELEASE_VERSION:'1.0.0', FRONTEND_SHA:'abc123', BACKEND_SHA:'def456',
              TEST_COUNT:'1288', VERIFY_STATUS:'PASS' };
  var r = checkEnv(env); assert(r.ok); assertEq(r.missing.length, 0);
});

test('missing RELEASE_VERSION → not ok', function() {
  var env = { FRONTEND_SHA:'abc123', BACKEND_SHA:'def456',
              TEST_COUNT:'1288', VERIFY_STATUS:'PASS' };
  var r = checkEnv(env); assert(!r.ok);
  assert(r.missing.includes('RELEASE_VERSION'));
});

test('missing VERIFY_STATUS → not ok', function() {
  var env = { RELEASE_VERSION:'1.0.0', FRONTEND_SHA:'abc123',
              BACKEND_SHA:'def456', TEST_COUNT:'1288' };
  var r = checkEnv(env); assert(!r.ok);
  assert(r.missing.includes('VERIFY_STATUS'));
});

test('all missing → full missing list', function() {
  var r = checkEnv({});
  assertEq(r.missing.length, REQUIRED_VARS.length);
});

console.log('\n── buildReleaseNote ──');

var goodEnv = {
  RELEASE_VERSION:'1.2.0', FRONTEND_SHA:'8e9f035', BACKEND_SHA:'4f5996b',
  TEST_COUNT:'1288', VERIFY_STATUS:'PASS', NOTES:'Phases A-Z complete'
};

test('note includes version', function() {
  var note = buildReleaseNote(goodEnv);
  assert(note.includes('v1.2.0'), 'version present');
});

test('note includes frontend SHA', function() {
  var note = buildReleaseNote(goodEnv);
  assert(note.includes('8e9f035'));
});

test('note includes backend SHA', function() {
  var note = buildReleaseNote(goodEnv);
  assert(note.includes('4f5996b'));
});

test('note includes test count', function() {
  var note = buildReleaseNote(goodEnv);
  assert(note.includes('1288'));
});

test('VERIFY_STATUS PASS → 🟢 PASS badge', function() {
  var note = buildReleaseNote(goodEnv);
  assert(note.includes('🟢 PASS'));
});

test('VERIFY_STATUS FAIL → 🔴 FAIL badge', function() {
  var note = buildReleaseNote(Object.assign({}, goodEnv, { VERIFY_STATUS:'FAIL' }));
  assert(note.includes('🔴 FAIL'));
});

test('NOTES included when provided', function() {
  var note = buildReleaseNote(goodEnv);
  assert(note.includes('Phases A-Z complete'));
});

test('NOTES omitted when empty', function() {
  var note = buildReleaseNote(Object.assign({}, goodEnv, { NOTES:'' }));
  assert(!note.includes('Notes |'), 'no notes row when empty');
});

test('note includes today date (YYYY-MM-DD)', function() {
  var today = new Date().toISOString().slice(0,10);
  var note = buildReleaseNote(goodEnv);
  assert(note.includes(today), 'date present');
});

test('note is valid markdown table (has | chars)', function() {
  var note = buildReleaseNote(goodEnv);
  assert(note.includes('|'), 'markdown table present');
  assert(note.includes('## v'), 'H2 heading present');
});

test('no secret values in note output', function() {
  var env = Object.assign({}, goodEnv, { SESSION_SECRET:'DO_NOT_LEAK' });
  var note = buildReleaseNote(env);
  assert(!note.includes('DO_NOT_LEAK'), 'secret not in output');
});

console.log('\n── safeAppend ──');

test('append prepends note after H1 in existing changelog', function() {
  var tmp = path.join(os.tmpdir(), 'test-changelog-'+Date.now()+'.md');
  fs.writeFileSync(tmp, '# Changelog\n\n## v0.9.0 — 2026-01-01\n\nOld stuff\n');
  var note = buildReleaseNote(goodEnv);
  var updated = safeAppend(tmp, note);
  fs.unlinkSync(tmp);
  // New note should appear before old entry
  var newPos = updated.indexOf('v1.2.0');
  var oldPos = updated.indexOf('v0.9.0');
  assert(newPos < oldPos, 'new note before old; new='+newPos+' old='+oldPos);
  assert(updated.startsWith('# Changelog'), 'header preserved');
});

test('append to empty file writes note', function() {
  var tmp = path.join(os.tmpdir(), 'test-changelog-empty-'+Date.now()+'.md');
  fs.writeFileSync(tmp, '');
  var note = buildReleaseNote(goodEnv);
  safeAppend(tmp, note);
  var result = fs.readFileSync(tmp, 'utf8');
  fs.unlinkSync(tmp);
  assert(result.includes('v1.2.0'));
});

test('append does not lose existing content', function() {
  var tmp = path.join(os.tmpdir(), 'test-changelog-preserve-'+Date.now()+'.md');
  fs.writeFileSync(tmp, '# Changelog\n\n## v0.5.0 — 2026-01-01\n\nShould survive\n');
  safeAppend(tmp, buildReleaseNote(goodEnv));
  var result = fs.readFileSync(tmp, 'utf8');
  fs.unlinkSync(tmp);
  assert(result.includes('Should survive'), 'old content preserved');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Release-note tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ RELEASE-NOTE TESTS FAILED'); process.exit(1); }
else console.log('✅ All release-note checks passed');
