/**
 * PocketBooks Sports — Phase G: DB-Backed Club Memberships Tests
 * Run: node tests/club-memberships.test.js
 * Pure logic — no network, no DB.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Membership store ──────────────────────────────────────────────────────────

const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };

function makeMembershipStore() {
  const rows = {};   // key = actorId+'|'+clubId
  return {
    key: function(a, c) { return a+'|'+c; },
    get: function(a, c) { return rows[this.key(a,c)] || null; },
    set: function(row)  { rows[this.key(row.actorId, row.clubId)] = row; },
    list: function(c)   { return Object.values(rows).filter(function(r){ return r.clubId===c; }); },
    all:  function()    { return Object.values(rows); }
  };
}

// Add a membership (used in management ops)
function createMembership(store, actorId, clubId, role, status, updatedBy) {
  const now = new Date().toISOString();
  if (!ROLE_RANK.hasOwnProperty(role)) return { error:'invalid_role:'+role };
  const row = {
    actorId, clubId, role,
    status: status || 'active',
    joinedAt: now, updatedAt: now,
    updatedBy: updatedBy || 'system',
    limitsJson: null, permissionsJson: null
  };
  store.set(row);
  return { ok:true, row };
}

// Resolve role for token issuance — production must use DB, never client claim
function resolveTokenRole(store, actorId, clubId, requestedRole, isProduction, platformAdminAllowlist) {
  if (!actorId) return { error:'missing_actorId' };
  if (!clubId)  return { error:'missing_clubId' };

  const membership = store.get(actorId, clubId);

  // Production: must have active membership, role comes from DB only
  if (isProduction) {
    if (!membership)                         return { error:'membership_not_found' };
    if (membership.status !== 'active')      return { error:'membership_inactive', status:membership.status };
    // platform_admin only from server allowlist; DB role is always used for club actions
    if (requestedRole === 'platform_admin') {
      const allowed = platformAdminAllowlist && platformAdminAllowlist.includes(actorId);
      if (!allowed) return { error:'cannot_self_issue_elevated_role', requestedRole };
    }
    return { ok:true, role:membership.role, membership };
  }

  // Dev: allow requested role or fall back to membership
  if (membership && membership.status === 'active') return { ok:true, role:membership.role, membership };
  if (requestedRole && ROLE_RANK.hasOwnProperty(requestedRole)) return { ok:true, role:requestedRole, membership:null };
  return { ok:true, role:'player', membership:null };
}

// Re-check membership freshness (called by requireActor each request)
function checkMembershipFreshness(store, actorId, clubId, tokenRole) {
  const m = store.get(actorId, clubId);
  if (!m) return { ok:false, reason:'membership_not_found' };
  if (m.status !== 'active') return { ok:false, reason:'membership_inactive', status:m.status };
  if (m.role !== tokenRole)  return { ok:false, reason:'membership_role_changed',
                                       tokenRole, dbRole:m.role };
  return { ok:true };
}

// ── Membership management ─────────────────────────────────────────────────────

function canManageMembers(actorRole) {
  return ROLE_RANK[actorRole] >= ROLE_RANK.full_admin; // owner or full_admin
}
function canViewMembers(actorRole) {
  return ROLE_RANK[actorRole] >= ROLE_RANK.settlement_manager; // settlement_manager+
}

function updateMemberRole(store, actorId, actorRole, targetActorId, clubId, newRole, sessionRevokeFn) {
  if (!canManageMembers(actorRole))
    return { error:'insufficient_role', required:'full_admin' };
  if (!ROLE_RANK.hasOwnProperty(newRole))
    return { error:'invalid_role:'+newRole };
  const m = store.get(targetActorId, clubId);
  if (!m) return { error:'membership_not_found' };
  const oldRole = m.role;
  m.role = newRole; m.updatedAt = new Date().toISOString(); m.updatedBy = actorId;
  store.set(m);
  // Revoke sessions so next request picks up new role from fresh token
  var revokedCount = 0;
  if (typeof sessionRevokeFn === 'function') revokedCount = sessionRevokeFn(targetActorId, clubId, 'role_changed');
  return { ok:true, oldRole, newRole, revokedCount };
}

function suspendMember(store, actorId, actorRole, targetActorId, clubId, sessionRevokeFn) {
  if (!canManageMembers(actorRole))
    return { error:'insufficient_role', required:'full_admin' };
  const m = store.get(targetActorId, clubId);
  if (!m) return { error:'membership_not_found' };
  m.status = 'suspended'; m.updatedAt = new Date().toISOString(); m.updatedBy = actorId;
  store.set(m);
  var revokedCount = 0;
  if (typeof sessionRevokeFn === 'function') revokedCount = sessionRevokeFn(targetActorId, clubId, 'suspended');
  return { ok:true, revokedCount };
}

function removeMember(store, actorId, actorRole, targetActorId, clubId, sessionRevokeFn) {
  if (!canManageMembers(actorRole))
    return { error:'insufficient_role', required:'full_admin' };
  const m = store.get(targetActorId, clubId);
  if (!m) return { error:'membership_not_found' };
  m.status = 'removed'; m.updatedAt = new Date().toISOString(); m.updatedBy = actorId;
  store.set(m);
  var revokedCount = 0;
  if (typeof sessionRevokeFn === 'function') revokedCount = sessionRevokeFn(targetActorId, clubId, 'removed');
  return { ok:true, revokedCount };
}

function approveMember(store, actorId, actorRole, targetActorId, clubId) {
  if (!canManageMembers(actorRole))
    return { error:'insufficient_role', required:'full_admin' };
  const m = store.get(targetActorId, clubId);
  if (!m) return { error:'membership_not_found' };
  if (m.status !== 'pending') return { error:'not_pending', status:m.status };
  m.status = 'active'; m.updatedAt = new Date().toISOString(); m.updatedBy = actorId;
  store.set(m);
  return { ok:true };
}

function listMembers(store, actorId, actorRole, clubId) {
  if (!canViewMembers(actorRole))
    return { error:'insufficient_role', required:'settlement_manager' };
  return { ok:true, members:store.list(clubId) };
}

// ── Tests: resolveTokenRole ───────────────────────────────────────────────────
console.log('\n── resolveTokenRole ──');

test('production: role comes from membership, not client request', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  var r = resolveTokenRole(store,'P1','C1','owner',true,[]);
  assert(r.ok); assertEq(r.role,'player','DB role wins');
});
test('production: missing membership → membership_not_found', function() {
  var store = makeMembershipStore();
  var r = resolveTokenRole(store,'P1','C1','player',true,[]);
  assertEq(r.error,'membership_not_found');
});
test('production: pending membership → membership_inactive', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player','pending');
  var r = resolveTokenRole(store,'P1','C1','player',true,[]);
  assertEq(r.error,'membership_inactive'); assertEq(r.status,'pending');
});
test('production: suspended membership → membership_inactive', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player','suspended');
  var r = resolveTokenRole(store,'P1','C1','player',true,[]);
  assertEq(r.error,'membership_inactive'); assertEq(r.status,'suspended');
});
test('production: removed membership → membership_inactive', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player','removed');
  var r = resolveTokenRole(store,'P1','C1','player',true,[]);
  assertEq(r.error,'membership_inactive'); assertEq(r.status,'removed');
});
test('production: client cannot self-issue owner role', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  // Even though membership is active, requesting owner + not on allowlist → DB role
  var r = resolveTokenRole(store,'P1','C1','owner',true,[]);
  assert(r.ok); assertEq(r.role,'player','DB role overrides client owner claim');
});
test('production: platform_admin from allowlist allowed', function() {
  var store = makeMembershipStore();
  createMembership(store,'ADMIN1','C1','owner');
  var r = resolveTokenRole(store,'ADMIN1','C1','owner',true,['ADMIN1']);
  assert(r.ok); assertEq(r.role,'owner');
});
test('dev: no membership falls back to requested role', function() {
  var store = makeMembershipStore();
  var r = resolveTokenRole(store,'P1','C1','settlement_manager',false,[]);
  assert(r.ok); assertEq(r.role,'settlement_manager');
});
test('dev: active membership role overrides requested', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  var r = resolveTokenRole(store,'P1','C1','owner',false,[]);
  assert(r.ok); assertEq(r.role,'player','DB wins in dev too');
});

// ── Tests: checkMembershipFreshness ──────────────────────────────────────────
console.log('\n── checkMembershipFreshness ──');

test('active membership, matching role → ok', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  assert(checkMembershipFreshness(store,'P1','C1','player').ok);
});
test('membership removed → membership_inactive', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  store.get('P1','C1').status = 'removed';
  var r = checkMembershipFreshness(store,'P1','C1','player');
  assert(!r.ok); assertEq(r.reason,'membership_inactive');
});
test('membership suspended → membership_inactive', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  store.get('P1','C1').status = 'suspended';
  var r = checkMembershipFreshness(store,'P1','C1','player');
  assert(!r.ok); assertEq(r.reason,'membership_inactive');
});
test('role changed in DB → membership_role_changed', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','settlement_manager');
  store.get('P1','C1').role = 'view_only'; // DB updated by admin
  var r = checkMembershipFreshness(store,'P1','C1','settlement_manager'); // token still says settlement_manager
  assert(!r.ok); assertEq(r.reason,'membership_role_changed');
  assertEq(r.tokenRole,'settlement_manager'); assertEq(r.dbRole,'view_only');
});
test('membership not found → membership_not_found', function() {
  var store = makeMembershipStore();
  var r = checkMembershipFreshness(store,'NOBODY','C1','player');
  assert(!r.ok); assertEq(r.reason,'membership_not_found');
});

// ── Tests: management ops ─────────────────────────────────────────────────────
console.log('\n── Management ops ──');

test('owner can update member role', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  var r = updateMemberRole(store,'H1','owner','P1','C1','risk_viewer',null);
  assert(r.ok); assertEq(r.oldRole,'player'); assertEq(r.newRole,'risk_viewer');
  assertEq(store.get('P1','C1').role,'risk_viewer');
});
test('full_admin can update member role', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  var r = updateMemberRole(store,'A1','full_admin','P1','C1','risk_viewer',null);
  assert(r.ok);
});
test('settlement_manager cannot update roles', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  var r = updateMemberRole(store,'S1','settlement_manager','P1','C1','risk_viewer',null);
  assertEq(r.error,'insufficient_role');
});
test('player cannot update roles', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  var r = updateMemberRole(store,'P1','player','P1','C1','owner',null);
  assertEq(r.error,'insufficient_role');
});
test('role update revokes sessions', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  var revoked = [];
  function fakeRevoke(a, c, reason) { revoked.push({a,c,reason}); return 1; }
  updateMemberRole(store,'H1','owner','P1','C1','view_only',fakeRevoke);
  assertEq(revoked.length,1,'revoke called');
  assertEq(revoked[0].reason,'role_changed');
});
test('owner can suspend member', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  var r = suspendMember(store,'H1','owner','P1','C1',null);
  assert(r.ok);
  assertEq(store.get('P1','C1').status,'suspended');
});
test('suspend revokes sessions', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  var revoked = [];
  function fakeRevoke(a,c,reason){ revoked.push(reason); return 1; }
  suspendMember(store,'H1','owner','P1','C1',fakeRevoke);
  assertEq(revoked[0],'suspended');
});
test('owner can remove member', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  removeMember(store,'H1','owner','P1','C1',null);
  assertEq(store.get('P1','C1').status,'removed');
});
test('owner can approve pending member', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player','pending');
  approveMember(store,'H1','owner','P1','C1');
  assertEq(store.get('P1','C1').status,'active');
});
test('approving non-pending member returns not_pending', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player','active');
  var r = approveMember(store,'H1','owner','P1','C1');
  assertEq(r.error,'not_pending');
});
test('settlement_manager can view members', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  var r = listMembers(store,'S1','settlement_manager','C1');
  assert(r.ok); assertEq(r.members.length,1);
});
test('player cannot list all members', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  var r = listMembers(store,'P1','player','C1');
  assertEq(r.error,'insufficient_role');
});
test('invalid role rejected on create', function() {
  var store = makeMembershipStore();
  var r = createMembership(store,'P1','C1','superadmin');
  assert(r.error, 'should error'); assert(r.error.includes('invalid_role'));
});

// ── Tests: Club A role does not bleed to Club B ───────────────────────────────
console.log('\n── Club isolation ──');

test('Club A settlement_manager has no membership in Club B', function() {
  var store = makeMembershipStore();
  createMembership(store,'S1','C1','settlement_manager');
  var r = resolveTokenRole(store,'S1','C2','settlement_manager',true,[]);
  assertEq(r.error,'membership_not_found','no C2 membership');
});
test('Player with Club A token cannot access Club B', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  // checkMembershipFreshness for C2 (different club)
  var r = checkMembershipFreshness(store,'P1','C2','player');
  assert(!r.ok); assertEq(r.reason,'membership_not_found');
});
test('Same actorId, different clubs can have different roles', function() {
  var store = makeMembershipStore();
  createMembership(store,'P1','C1','player');
  createMembership(store,'P1','C2','owner');
  assertEq(store.get('P1','C1').role,'player');
  assertEq(store.get('P1','C2').role,'owner');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Club membership tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ CLUB MEMBERSHIP TESTS FAILED'); process.exit(1); }
else console.log('✅ All club membership rules verified');
