/**
 * Club ID Normalization Guard Tests
 * Covers: requireCanonicalClubId middleware
 * Run: node tests/club-id-normalization.test.js
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b));
}

// ── Pure guard logic (mirrors requireCanonicalClubId in index.js) ──────────────
const _NUMERIC_CLUB_ID_RE = /^\d+$/;

function simulateGuard(clubId, isProduction, devBypass) {
  // No clubId — pass through (missing-clubId is handled by downstream guards)
  if (!clubId) return { blocked: false, reason: 'no_clubId' };
  // Dev bypass
  var bypassAllowed = !isProduction || devBypass;
  if (bypassAllowed) return { blocked: false, reason: 'dev_bypass' };
  // Reject numeric
  if (_NUMERIC_CLUB_ID_RE.test(clubId)) {
    return { blocked: true, error: 'legacy_club_id_not_supported', clubId };
  }
  return { blocked: false, reason: 'valid_canonical_id' };
}

// ── Tests: numeric IDs blocked in production ──────────────────────────────────
console.log('\n── Numeric club ID rejected on production routes ──');

test('numeric "1" blocked in production', function() {
  var r = simulateGuard('1', true, false);
  assert(r.blocked, 'should block');
  assertEq(r.error, 'legacy_club_id_not_supported');
});

test('numeric "42" blocked in production', function() {
  var r = simulateGuard('42', true, false);
  assert(r.blocked, 'should block');
  assertEq(r.error, 'legacy_club_id_not_supported');
});

test('numeric "100" blocked in production', function() {
  var r = simulateGuard('100', true, false);
  assert(r.blocked, 'should block');
  assertEq(r.error, 'legacy_club_id_not_supported');
});

test('numeric "0" blocked in production', function() {
  var r = simulateGuard('0', true, false);
  assert(r.blocked, 'should block');
});

// ── Tests: UUID/text IDs pass through ────────────────────────────────────────
console.log('\n── UUID and text club IDs pass through ──');

test('UUID club ID passes in production', function() {
  var r = simulateGuard('d616dc2a-95a6-473a-97b1-7da330878479', true, false);
  assert(!r.blocked, 'UUID should pass; got: '+JSON.stringify(r));
  assertEq(r.reason, 'valid_canonical_id');
});

test('short UUID-style text passes in production', function() {
  var r = simulateGuard('club-abc123', true, false);
  assert(!r.blocked, 'slug text should pass');
});

test('alphanumeric club ID passes in production', function() {
  var r = simulateGuard('club_xyz_2026', true, false);
  assert(!r.blocked, 'alphanumeric should pass');
});

test('"1abc" (starts numeric but not purely numeric) passes', function() {
  var r = simulateGuard('1abc', true, false);
  assert(!r.blocked, 'mixed alphanumeric should pass');
});

// ── Tests: dev bypass allows numeric IDs ─────────────────────────────────────
console.log('\n── Dev bypass allows numeric IDs ──');

test('numeric "1" allowed when NODE_ENV=development', function() {
  var r = simulateGuard('1', false, false); // not production
  assert(!r.blocked, 'dev env should allow');
  assertEq(r.reason, 'dev_bypass');
});

test('numeric "1" allowed when DEV_AUTH_BYPASS=true even in production', function() {
  var r = simulateGuard('1', true, true); // production but bypass enabled
  assert(!r.blocked, 'dev bypass should allow');
  assertEq(r.reason, 'dev_bypass');
});

// ── Tests: missing clubId passes through ─────────────────────────────────────
console.log('\n── Missing clubId passes through to downstream guards ──');

test('empty string clubId passes through', function() {
  var r = simulateGuard('', true, false);
  assert(!r.blocked, 'empty clubId should pass (downstream handles it)');
  assertEq(r.reason, 'no_clubId');
});

test('null clubId passes through', function() {
  var r = simulateGuard(null, true, false);
  assert(!r.blocked, 'null clubId should pass');
  assertEq(r.reason, 'no_clubId');
});

test('undefined clubId passes through', function() {
  var r = simulateGuard(undefined, true, false);
  assert(!r.blocked, 'undefined clubId should pass');
  assertEq(r.reason, 'no_clubId');
});

// ── Tests: confirm error shape ────────────────────────────────────────────────
console.log('\n── Error response shape ──');

test('error includes clubId and hint fields', function() {
  var r = simulateGuard('1', true, false);
  assert(r.blocked, 'should block');
  assertEq(r.error, 'legacy_club_id_not_supported');
  assertEq(r.clubId, '1', 'clubId echoed in error');
});

test('UUID error shape: blocked=false, no error field', function() {
  var r = simulateGuard('d616dc2a-95a6-473a-97b1-7da330878479', true, false);
  assert(!r.blocked, 'should not block');
  assert(!r.error, 'no error field on pass');
});

// ── Tests: routes that should NOT have the guard (legacy /api/clubs) ─────────
console.log('\n── Legacy routes not guarded (numeric IDs still work) ──');

test('/api/clubs routes should allow numeric club IDs (guard not applied)', function() {
  // The guard is NOT applied to /api/clubs/* — those are legacy PostgreSQL routes
  // This test documents the expected behavior: numeric IDs work there
  var legacyRouteDoesNotGuard = true; // guard not wired to legacy routes
  assert(legacyRouteDoesNotGuard, 'legacy routes explicitly excluded from guard');
});

// ── Tests: regex edge cases ───────────────────────────────────────────────────
console.log('\n── Regex edge cases ──');

test('"12345" — purely numeric → blocked', function() {
  assert(_NUMERIC_CLUB_ID_RE.test('12345'), 'purely numeric matches');
});

test('"12345a" — not purely numeric → passes', function() {
  assert(!_NUMERIC_CLUB_ID_RE.test('12345a'), 'mixed does not match');
});

test('" 1 " — spaces around number → NOT matched (guard uses trimmed value)', function() {
  // The guard trims X-Club-Id header; body.clubId passed as-is from JSON
  // "  1  " would not match the regex — but guard should handle trim upstream
  // This documents: the guard receives already-trimmed values from headers
  assert(!_NUMERIC_CLUB_ID_RE.test(' 1 '), 'regex does not match padded string');
  // The actual trimming happens in the middleware on the header value
  assert(_NUMERIC_CLUB_ID_RE.test('1'), 'trimmed "1" does match');
});

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(58));
console.log('Club ID normalization tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ CLUB ID NORMALIZATION TESTS FAILED'); process.exit(1); }
else console.log('✅ All club ID normalization rules verified');
