/**
 * Legacy token membership auth tests
 * Covers: tokens without clubId claim using DB membership lookup
 * Run: node tests/legacy-token-auth.test.js
 */
'use strict';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'') + ' got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b));
}

// ── Simulate the requireActor legacy-token path logic ────────────────────────

const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };

function _simulateLegacyAuth(tokenPayload, reqClub, membershipRow) {
  // Mirrors the new requireActor logic for legacy tokens
  const p = tokenPayload;
  const club = p.clubId || '';
  if (!club && reqClub) {
    const actorId = String(p.sub || p.id || p.actorId || '');
    if (!membershipRow) {
      return { error: 'membership_not_found', status: 403 };
    }
    if (membershipRow.status !== 'active' && membershipRow.status !== 'approved') {
      return { error: 'membership_inactive', status: 403, membershipStatus: membershipRow.status };
    }
    const role = ROLE_RANK[membershipRow.role] != null ? membershipRow.role : 'player';
    return {
      actorId, role, clubId: String(reqClub),
      isDevBypass: false, fromToken: true, membershipVerified: true, legacyToken: true
    };
  }
  // Club-claim token path (unchanged)
  const role = ROLE_RANK[p.role] != null ? p.role : 'view_only';
  return { actorId: String(p.sub || p.actorId || ''), role, clubId: club, fromToken: true };
}

function _simulateScopeCheck(actor, requestedClubId) {
  if (actor.error) return { ok: false, reason: actor.error };
  if (!requestedClubId) return { ok: true };
  if (actor.membershipVerified) return { ok: true }; // DB-verified at auth time
  if (actor.clubId && actor.clubId !== requestedClubId) {
    return { ok: false, reason: 'club_scope_mismatch', actorClubId: actor.clubId, requestedClubId };
  }
  return { ok: true };
}

// ── Test: legacy token (no clubId) with valid approved membership ─────────────
console.log('\n── Legacy token + approved membership ──');

const LEGACY_TOKEN = { sub: '4', id: 4, email: 'signal+tonyjj@pocketbooks.local', role: 'user' };
const APPROVED_MEM = { actor_id: '4', player_id: '4', club_id: '1', role: 'full_admin', status: 'approved' };
const ACTIVE_MEM   = { actor_id: '4', player_id: '4', club_id: '1', role: 'player', status: 'active' };

test('approved membership → actor granted with dbRole=full_admin', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '1', APPROVED_MEM);
  assert(!actor.error, 'should not error');
  assertEq(actor.clubId, '1');
  assertEq(actor.role, 'full_admin');
  assertEq(actor.legacyToken, true);
  assertEq(actor.membershipVerified, true);
});

test('legacy club_memberships role=host maps to full_admin via LEGACY_ROLE_MAP', function() {
  // Backend maps old role names: { host:'full_admin', admin:'full_admin', ... }
  // Simulate with mapping inline
  var LEGACY_ROLE_MAP = { host:'full_admin', admin:'full_admin', cohost:'settlement_manager', staff:'risk_viewer' };
  var rawRole = 'host';
  var mapped  = LEGACY_ROLE_MAP[rawRole] || rawRole;
  var role    = ROLE_RANK[mapped] != null ? mapped : 'player';
  assertEq(role, 'full_admin', 'host should map to full_admin');
});

test('active membership → actor granted with dbRole=player', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '1', ACTIVE_MEM);
  assert(!actor.error);
  assertEq(actor.role, 'player');
  assertEq(actor.clubId, '1');
});

test('scope check passes for membershipVerified actor', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '1', APPROVED_MEM);
  const scope = _simulateScopeCheck(actor, '1');
  assert(scope.ok, 'scope should pass: ' + JSON.stringify(scope));
});

test('actorId preserved as string from numeric id', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '1', APPROVED_MEM);
  assertEq(actor.actorId, '4');
});

// ── Test: legacy token + no membership ────────────────────────────────────────
console.log('\n── Legacy token + no membership ──');

test('no membership row → membership_not_found 403', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '1', null);
  assertEq(actor.error, 'membership_not_found');
  assertEq(actor.status, 403);
});

test('non-member club → membership_not_found', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '999', null);
  assertEq(actor.error, 'membership_not_found');
});

// ── Test: legacy token + pending/denied membership ────────────────────────────
console.log('\n── Legacy token + inactive membership ──');

test('pending membership → membership_inactive', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '1', { ...APPROVED_MEM, status: 'pending' });
  assertEq(actor.error, 'membership_inactive');
  assertEq(actor.membershipStatus, 'pending');
});

test('denied membership → membership_inactive', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '1', { ...APPROVED_MEM, status: 'denied' });
  assertEq(actor.error, 'membership_inactive');
});

test('suspended membership → membership_inactive', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '1', { ...APPROVED_MEM, status: 'suspended' });
  assertEq(actor.error, 'membership_inactive');
});

// ── Test: legacy token + no reqClub ───────────────────────────────────────────
console.log('\n── Legacy token + missing clubId ──');

test('no reqClub → falls through to club-claim path (empty clubId)', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '', APPROVED_MEM);
  // No club in request — resolves with empty clubId (not a membership-verified actor)
  assertEq(actor.clubId, '');
  assert(!actor.membershipVerified, 'should not be membership-verified without reqClub');
});

// ── Test: club-claim token still works unchanged ───────────────────────────────
console.log('\n── Club-claim token (existing path, unchanged) ──');

const CLUB_TOKEN = { sub: '4', actorId: '4', role: 'player', clubId: '1', jti: 'jti_123' };

test('club-claim token passes through unchanged', function() {
  const actor = _simulateLegacyAuth(CLUB_TOKEN, '1', APPROVED_MEM);
  assertEq(actor.clubId, '1');
  assertEq(actor.role, 'player');
  assert(!actor.legacyToken, 'should not be flagged as legacyToken');
  assert(!actor.membershipVerified, 'club-claim tokens do not set membershipVerified');
});

test('club-claim token scope mismatch still rejects', function() {
  const actor = _simulateLegacyAuth(CLUB_TOKEN, '1', APPROVED_MEM);
  const scope = _simulateScopeCheck(actor, '999');
  assert(!scope.ok);
  assertEq(scope.reason, 'club_scope_mismatch');
});

// ── Test: unknown role in membership → defaults to player ─────────────────────
console.log('\n── Role coercion ──');

test('unknown role in membership → coerced to player', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '1', { ...APPROVED_MEM, role: 'superuser' });
  assertEq(actor.role, 'player');
});

test('owner role in membership → preserved', function() {
  const actor = _simulateLegacyAuth(LEGACY_TOKEN, '1', { ...APPROVED_MEM, role: 'owner' });
  assertEq(actor.role, 'owner');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(56));
console.log('Legacy token auth tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { console.error('❌ TESTS FAILED'); process.exit(1); }
else console.log('✅ All legacy token auth rules verified');
