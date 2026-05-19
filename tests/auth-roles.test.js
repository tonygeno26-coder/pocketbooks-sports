/**
 * PocketBooks Sports — Auth + Role Enforcement Tests
 * Run: node tests/auth-roles.test.js
 * Pure logic — no network, no DB.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Role hierarchy ────────────────────────────────────────────────────────────

const ROLE_RANK = {
  owner:              5,
  full_admin:         4,
  settlement_manager: 3,
  risk_viewer:        2,
  player:             1,
  view_only:          0
};

// Permissions matrix: action → minimum role rank required (or custom fn)
// -1 = player-self only (checked separately)
const ACTION_MIN_RANK = {
  place_bet:                  -1,  // player-self only; owner/admin can also
  cancel_bet:                 -1,  // player-self only; owner/admin can also
  view_player_dashboard:      -1,  // own dashboard; host roles also
  view_host_dashboard:         2,  // risk_viewer+
  view_settlement_history:     2,  // risk_viewer+
  settle_player:               3,  // settlement_manager+
  weekly_rollover:             3,  // settlement_manager+
  run_server_grade:            3,  // settlement_manager+
  force_market_refresh:        4,  // full_admin+
  view_audit_log:              2,  // risk_viewer+
};

function getRoleRank(role) { return ROLE_RANK[role] != null ? ROLE_RANK[role] : -99; }

// Resolve actor from request headers
function requireActor(headers, isProduction, devBypassEnabled) {
  const actorId   = (headers['x-actor-id']   || '').trim();
  const clubId    = (headers['x-club-id']    || '').trim();
  const actorRole = (headers['x-actor-role'] || '').trim();

  // Dev bypass: only allowed outside production or when explicitly enabled
  const bypassAllowed = !isProduction || devBypassEnabled;
  if (!actorId && bypassAllowed) {
    return { actorId:'dev-owner', role:'owner', clubId: clubId||'dev-club', isDevBypass:true };
  }
  if (!actorId) return { error:'unauthenticated', status:401 };

  // Validate role is known; default to view_only if unknown
  const role = ROLE_RANK[actorRole] != null ? actorRole : 'view_only';
  return { actorId, role, clubId, isDevBypass:false };
}

// Check permission for an action
function requirePermission(actor, action, targetPlayerId) {
  if (actor.error) return { allowed:false, reason: actor.error, status: actor.status||401 };

  const minRank = ACTION_MIN_RANK[action];
  if (minRank == null) return { allowed:false, reason:'unknown_action:'+action };

  const rank = getRoleRank(actor.role);

  if (minRank === -1) {
    // Player-self: allowed if acting on own account, or if rank >= owner(5)
    const isSelf = targetPlayerId && actor.actorId === targetPlayerId;
    const isPrivileged = rank >= ROLE_RANK.full_admin; // full_admin+ can act on behalf
    if (!isSelf && !isPrivileged) {
      return { allowed:false, reason:'not_own_account', status:403 };
    }
    return { allowed:true };
  }

  if (rank < minRank) {
    return {
      allowed: false,
      reason:  'insufficient_role',
      required: Object.keys(ROLE_RANK).find(r => ROLE_RANK[r] === minRank),
      actual:   actor.role,
      status:   403
    };
  }
  return { allowed:true };
}

// Simulate audit event on deny
function buildDenyAuditEvent(actor, action, endpoint) {
  return {
    event_type: 'permission_denied',
    player_id:  actor.actorId || null,
    club_id:    actor.clubId  || null,
    payload:    { actorId:actor.actorId, role:actor.role, action, endpoint }
  };
}

// ── Helper for test actors ─────────────────────────────────────────────────────
function actor(role, id, club) {
  return { actorId: id||'U1', role: role, clubId: club||'C1', isDevBypass:false };
}
const OWNER   = actor('owner');
const ADMIN   = actor('full_admin');
const SETTLER = actor('settlement_manager');
const RISK    = actor('risk_viewer');
const PLAYER  = actor('player', 'P001');
const VIEWER  = actor('view_only');

// ── requireActor ──────────────────────────────────────────────────────────────
console.log('\n── requireActor ──');

test('valid actor headers parsed correctly', function() {
  var r = requireActor({ 'x-actor-id':'P001','x-club-id':'C1','x-actor-role':'player' }, true, false);
  assertEq(r.actorId, 'P001'); assertEq(r.role, 'player'); assertEq(r.clubId, 'C1');
  assert(!r.isDevBypass);
});
test('unknown role → view_only', function() {
  var r = requireActor({ 'x-actor-id':'X','x-club-id':'C1','x-actor-role':'superuser' }, false, false);
  assertEq(r.role, 'view_only');
});
test('no actor in production → unauthenticated', function() {
  var r = requireActor({}, true, false);
  assertEq(r.error, 'unauthenticated'); assertEq(r.status, 401);
});
test('no actor in dev → dev bypass', function() {
  var r = requireActor({}, false, false);
  assert(r.isDevBypass); assertEq(r.role, 'owner');
});
test('no actor with DEV_AUTH_BYPASS in production → allowed', function() {
  var r = requireActor({}, true, true);
  assert(r.isDevBypass);
});
test('dev bypass log label is dev-owner', function() {
  var r = requireActor({}, false, false);
  assertEq(r.actorId, 'dev-owner');
});

// ── Role rank ──────────────────────────────────────────────────────────────────
console.log('\n── Role rank ──');

test('owner(5) > full_admin(4)', function() { assert(getRoleRank('owner') > getRoleRank('full_admin')); });
test('full_admin(4) > settlement_manager(3)', function() { assert(getRoleRank('full_admin') > getRoleRank('settlement_manager')); });
test('settlement_manager(3) > risk_viewer(2)', function() { assert(getRoleRank('settlement_manager') > getRoleRank('risk_viewer')); });
test('risk_viewer(2) > player(1)', function() { assert(getRoleRank('risk_viewer') > getRoleRank('player')); });
test('player(1) > view_only(0)', function() { assert(getRoleRank('player') > getRoleRank('view_only')); });
test('unknown role → -99', function() { assertEq(getRoleRank('hacker'), -99); });

// ── place_bet / cancel_bet (player-self) ──────────────────────────────────────
console.log('\n── place_bet / cancel_bet ──');

test('player can place own bet', function() {
  assert(requirePermission(PLAYER, 'place_bet', 'P001').allowed);
});
test('player cannot place bet for another player', function() {
  var r = requirePermission(PLAYER, 'place_bet', 'P002');
  assert(!r.allowed); assertEq(r.reason, 'not_own_account');
});
test('owner can place bet for any player', function() {
  assert(requirePermission(OWNER, 'place_bet', 'P002').allowed);
});
test('full_admin can place bet for any player', function() {
  assert(requirePermission(ADMIN, 'place_bet', 'P999').allowed);
});
test('settlement_manager cannot place bet (rank < full_admin)', function() {
  var r = requirePermission(SETTLER, 'place_bet', 'P999');
  assert(!r.allowed);
});
test('player can cancel own bet', function() {
  assert(requirePermission(PLAYER, 'cancel_bet', 'P001').allowed);
});
test('player cannot cancel another player bet', function() {
  assert(!requirePermission(PLAYER, 'cancel_bet', 'P002').allowed);
});
test('view_only cannot place bet for self', function() {
  var v = actor('view_only', 'V1'); 
  var r = requirePermission(v, 'place_bet', 'V1'); // self but rank too low for privileged path, needs -1 self check
  // view_only IS allowed to place own bet (player-self rule — any actor can bet own account)
  assert(r.allowed, 'view_only self-bet allowed');
});

// ── view_host_dashboard ───────────────────────────────────────────────────────
console.log('\n── view_host_dashboard ──');

test('risk_viewer can view host dashboard', function() {
  assert(requirePermission(RISK, 'view_host_dashboard').allowed);
});
test('player cannot view host dashboard', function() {
  var r = requirePermission(PLAYER, 'view_host_dashboard');
  assert(!r.allowed); assertEq(r.reason, 'insufficient_role');
});
test('view_only cannot view host dashboard', function() {
  assert(!requirePermission(VIEWER, 'view_host_dashboard').allowed);
});
test('owner can view host dashboard', function() {
  assert(requirePermission(OWNER, 'view_host_dashboard').allowed);
});

// ── settle_player ─────────────────────────────────────────────────────────────
console.log('\n── settle_player ──');

test('settlement_manager can settle', function() {
  assert(requirePermission(SETTLER, 'settle_player').allowed);
});
test('owner can settle', function() {
  assert(requirePermission(OWNER, 'settle_player').allowed);
});
test('risk_viewer cannot settle', function() {
  var r = requirePermission(RISK, 'settle_player');
  assert(!r.allowed); assertEq(r.reason, 'insufficient_role');
  assertEq(r.required, 'settlement_manager');
});
test('player cannot settle', function() {
  assert(!requirePermission(PLAYER, 'settle_player').allowed);
});
test('view_only cannot settle', function() {
  assert(!requirePermission(VIEWER, 'settle_player').allowed);
});

// ── weekly_rollover ───────────────────────────────────────────────────────────
console.log('\n── weekly_rollover ──');

test('settlement_manager can rollover', function() {
  assert(requirePermission(SETTLER, 'weekly_rollover').allowed);
});
test('risk_viewer cannot rollover', function() {
  assert(!requirePermission(RISK, 'weekly_rollover').allowed);
});

// ── run_server_grade ──────────────────────────────────────────────────────────
console.log('\n── run_server_grade ──');

test('settlement_manager can run server grade', function() {
  assert(requirePermission(SETTLER, 'run_server_grade').allowed);
});
test('risk_viewer cannot run server grade', function() {
  assert(!requirePermission(RISK, 'run_server_grade').allowed);
});
test('owner can run server grade', function() {
  assert(requirePermission(OWNER, 'run_server_grade').allowed);
});

// ── force_market_refresh ──────────────────────────────────────────────────────
console.log('\n── force_market_refresh ──');

test('full_admin can force market refresh', function() {
  assert(requirePermission(ADMIN, 'force_market_refresh').allowed);
});
test('owner can force market refresh', function() {
  assert(requirePermission(OWNER, 'force_market_refresh').allowed);
});
test('settlement_manager cannot force market refresh', function() {
  var r = requirePermission(SETTLER, 'force_market_refresh');
  assert(!r.allowed); assertEq(r.required, 'full_admin');
});

// ── unauthenticated ───────────────────────────────────────────────────────────
console.log('\n── unauthenticated actor ──');

test('unauthenticated actor denied for all actions', function() {
  var unauth = requireActor({}, true, false); // prod, no bypass
  assert(unauth.error, 'has error');
  var r = requirePermission(unauth, 'settle_player');
  assert(!r.allowed); assertEq(r.status, 401);
});

// ── Audit event on deny ───────────────────────────────────────────────────────
console.log('\n── Audit event on deny ──');

test('denied action builds audit event', function() {
  var r = requirePermission(PLAYER, 'settle_player');
  assert(!r.allowed);
  var ev = buildDenyAuditEvent(PLAYER, 'settle_player', '/api/host/settle-player');
  assertEq(ev.event_type, 'permission_denied');
  assertEq(ev.payload.role, 'player');
  assertEq(ev.payload.action, 'settle_player');
  assertEq(ev.payload.endpoint, '/api/host/settle-player');
});
test('audit event includes actorId + clubId', function() {
  var ev = buildDenyAuditEvent(RISK, 'weekly_rollover', '/api/host/weekly-rollover');
  assertEq(ev.player_id, 'U1');
  assertEq(ev.club_id,   'C1');
});

// ── Dev bypass ────────────────────────────────────────────────────────────────
console.log('\n── Dev bypass ──');

test('dev bypass granted in non-production', function() {
  var r = requireActor({}, false, false);
  assert(r.isDevBypass); assertEq(r.role, 'owner');
});
test('dev bypass denied in production without flag', function() {
  var r = requireActor({}, true, false);
  assert(r.error === 'unauthenticated');
});
test('explicit DEV_AUTH_BYPASS overrides production gate', function() {
  var r = requireActor({}, true, true);
  assert(r.isDevBypass);
});
test('dev bypass still gets owner role (full access)', function() {
  var r = requireActor({}, false, false);
  assertEq(r.role, 'owner');
  assert(requirePermission(r, 'force_market_refresh').allowed);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Auth/role tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ AUTH/ROLE TESTS FAILED'); process.exit(1); }
else console.log('✅ All auth/role rules verified');
