/**
 * Task 18 — Authorization / IDOR regression (PLAYER + HOST boundaries)
 * Run: node tests/authz-idor.test.js
 * Pure logic + FE source gates — no network, no prod.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch (e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m || '') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}

const ROOT = path.join(__dirname, '..');
const playerHtml = fs.readFileSync(path.join(ROOT, 'player.html'), 'utf8');
const BE = path.join(process.env.HOME || '', '.openclaw/workspace/pocketbooks-sports-backend/index.js');
const beSrc = fs.existsSync(BE) ? fs.readFileSync(BE, 'utf8') : '';

const ROLE_RANK = {
  owner: 5, full_admin: 4, settlement_manager: 3, risk_viewer: 2, player: 1, view_only: 0
};
const ACTION_MIN_RANK = {
  place_bet: -1, cancel_bet: -1, view_player_dashboard: -1,
  view_host_dashboard: 2, settle_player: 3
};

function checkClubScope(actor, requestedClubId) {
  if (actor.error) return { ok: false, reason: actor.error };
  if (!requestedClubId) return { ok: true };
  if (actor.platformRole === 'platform_admin') return { ok: true, crossClub: true };
  if (actor.isDevBypass) return { ok: true };
  if (actor.clubId && actor.clubId !== requestedClubId) {
    return { ok: false, reason: 'club_scope_mismatch', status: 403 };
  }
  return { ok: true };
}

function checkPermission(actor, action, targetPlayerId) {
  if (actor.error) return { allowed: false, reason: actor.error, status: 401 };
  const minRank = ACTION_MIN_RANK[action];
  if (minRank == null) return { allowed: false, reason: 'unknown_action' };
  const rank = ROLE_RANK[actor.role] != null ? ROLE_RANK[actor.role] : -99;
  if (minRank === -1) {
    const isSelf = targetPlayerId && String(actor.actorId) === String(targetPlayerId);
    if (action === 'place_bet') {
      if (!isSelf) return { allowed: false, reason: 'not_own_account', status: 403 };
      if (actor.role !== 'player') return { allowed: false, reason: 'host_betting_disabled', status: 403 };
      return { allowed: true };
    }
    const isPrivileged = rank >= ROLE_RANK.full_admin;
    if (!isSelf && !isPrivileged) return { allowed: false, reason: 'not_own_account', status: 403 };
    return { allowed: true };
  }
  if (rank < minRank) return { allowed: false, reason: 'insufficient_role', status: 403 };
  return { allowed: true };
}

function authorize(actor, action, clubId, targetPlayerId) {
  const scope = checkClubScope(actor, clubId);
  if (!scope.ok) return { allowed: false, reason: scope.reason, status: scope.status || 403 };
  return checkPermission(actor, action, targetPlayerId);
}

function resolveMirrorPlayerId(actor, queryPlayerId) {
  if (actor.error) return { error: actor.error, status: 401 };
  const rank = ROLE_RANK[actor.role] != null ? ROLE_RANK[actor.role] : -99;
  const privileged = rank >= ROLE_RANK.full_admin || actor.platformRole === 'platform_admin';
  if (!privileged) return { playerId: String(actor.actorId) };
  return { playerId: String(queryPlayerId || actor.actorId) };
}

function resolveNotifPlayerId(actor, queryPlayerId) {
  // Always pin to actor (post-fix behavior)
  return String(actor.actorId || '');
}

function survivorIsHost(actor, pool) {
  if (!actor || !pool) return false;
  if (String(pool.created_by) === String(actor.actorId)) return true;
  if (actor.platformRole === 'platform_admin') return true;
  return false;
}

const hostA = { actorId: 'HOST_A', role: 'owner', clubId: 'CLUB_A', fromToken: true };
const hostB = { actorId: 'HOST_B', role: 'owner', clubId: 'CLUB_B', fromToken: true };
const plyA = { actorId: 'PLY_A', role: 'player', clubId: 'CLUB_A', fromToken: true };
const plyB = { actorId: 'PLY_B', role: 'player', clubId: 'CLUB_A', fromToken: true };
const plyC = { actorId: 'PLY_C', role: 'player', clubId: 'CLUB_B', fromToken: true };

console.log('\n── Host cross-club mutations ──');
test('Host A cannot settle Host B club', function () {
  const r = authorize(hostA, 'settle_player', 'CLUB_B', 'PLY_C');
  assert(!r.allowed); assertEq(r.reason, 'club_scope_mismatch');
});
test('Host A cannot view Host B dashboard', function () {
  const r = authorize(hostA, 'view_host_dashboard', 'CLUB_B');
  assert(!r.allowed); assertEq(r.reason, 'club_scope_mismatch');
});
test('Host A can settle own club', function () {
  assert(authorize(hostA, 'settle_player', 'CLUB_A', 'PLY_A').allowed);
});

console.log('\n── Player ticket / balance IDOR ──');
test('Player A cannot view Player B dashboard (same club)', function () {
  const r = authorize(plyA, 'view_player_dashboard', 'CLUB_A', 'PLY_B');
  assert(!r.allowed); assertEq(r.reason, 'not_own_account');
});
test('Player A cannot place bet as Player B', function () {
  const r = authorize(plyA, 'place_bet', 'CLUB_A', 'PLY_B');
  assert(!r.allowed); assertEq(r.reason, 'not_own_account');
});
test('Player A cannot cancel as Player B', function () {
  const r = authorize(plyA, 'cancel_bet', 'CLUB_A', 'PLY_B');
  assert(!r.allowed); assertEq(r.reason, 'not_own_account');
});
test('Player A cannot view balance in Club B', function () {
  const r = authorize(plyA, 'view_player_dashboard', 'CLUB_B', 'PLY_A');
  assert(!r.allowed); assertEq(r.reason, 'club_scope_mismatch');
});
test('Player A can view own dashboard', function () {
  assert(authorize(plyA, 'view_player_dashboard', 'CLUB_A', 'PLY_A').allowed);
});

console.log('\n── Mirror ticket scoping ──');
test('mirror pins Player A when querying Player B id', function () {
  const r = resolveMirrorPlayerId(plyA, 'PLY_B');
  assertEq(r.playerId, 'PLY_A');
});
test('mirror unauthenticated rejected', function () {
  const r = resolveMirrorPlayerId({ error: 'unauthenticated' }, 'PLY_B');
  assert(r.error === 'unauthenticated');
});

console.log('\n── Notifications pin to self ──');
test('notif query playerId ignored for foreign id', function () {
  assertEq(resolveNotifPlayerId(plyA, 'PLY_B'), 'PLY_A');
});

console.log('\n── Survivor pool runner boundary ──');
test('Host B cannot mutate Host A survivor pool', function () {
  assert(!survivorIsHost(hostB, { created_by: 'HOST_A' }));
});
test('Creator can mutate own survivor pool', function () {
  assert(survivorIsHost(hostA, { created_by: 'HOST_A' }));
});
test('Sportsbook full_admin without creator id cannot mutate foreign pool', function () {
  assert(!survivorIsHost(
    { actorId: 'ADMIN_X', role: 'full_admin', clubId: 'CLUB_A' },
    { created_by: 'HOST_A' }
  ));
});

console.log('\n── FE / BE source gates ──');
test('FE prefers JWT subject for dashboard playerId', function () {
  assert(playerHtml.includes('_sessionActorIdFromToken'), 'token subject helper present');
  assert(/_sessionActorIdFromToken\(\)\s*\|\|/.test(playerHtml), 'JWT preferred over localStorage');
});
test('FE notification load never invents fake rows', function () {
  assert(playerHtml.includes('Server-backed only'), 'no fake notifications comment');
  assert(!/function\s+(pushFakeNotif|seedNotif|demoNotifications)/i.test(playerHtml),
    'no demo notif generators');
  assert(playerHtml.includes("API + '/api/notifications'") || playerHtml.includes('/api/notifications'),
    'loads from API');
});

if (beSrc) {
  test('BE mirror tickets require requireActor', function () {
    assert(/app\.get\('\/api\/mirror\/tickets'[\s\S]{0,400}requireActor/.test(beSrc),
      'mirror/tickets must call requireActor');
    assert(/app\.get\('\/api\/mirror\/tickets-with-legs'[\s\S]{0,400}requireActor/.test(beSrc),
      'mirror/tickets-with-legs must call requireActor');
  });
  test('BE notifications pin to actor.actorId', function () {
    assert(/app\.get\('\/api\/notifications'[\s\S]{0,500}Always pin to authenticated actor/.test(beSrc)
      || /app\.get\('\/api\/notifications'[\s\S]{0,350}actor\.actorId/.test(beSrc),
      'notifications GET must pin to actor');
  });
  test('BE survivorIsHost is creator-only (no full_admin bypass)', function () {
    const m = beSrc.match(/function _survivorIsHost\([\s\S]*?\n\}/);
    assert(m, '_survivorIsHost present');
    assert(!/ROLE_RANK\[actor\.role\].*full_admin/.test(m[0]), 'no full_admin role bypass');
    assert(/created_by/.test(m[0]), 'creator check present');
  });
} else {
  test('BE source available for gate checks', function () {
    assert(false, 'backend index.js not found at ' + BE);
  });
}

console.log('\n── Summary: ' + _pass + ' passed, ' + _fail + ' failed ──');
process.exit(_fail ? 1 : 0);
