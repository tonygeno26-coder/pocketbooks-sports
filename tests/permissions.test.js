/**
 * PocketBooks Sports — Cohost/Staff Permissions Tests
 * Run: node tests/permissions.test.js
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Permission model (mirrors backend) ───────────────────────────────────────

var ROLES = {
  owner:              { level:5, label:'Owner' },
  full_admin:         { level:4, label:'Full Admin' },
  settlement_manager: { level:3, label:'Settlement Manager' },
  risk_viewer:        { level:2, label:'Risk Viewer' },
  view_only:          { level:1, label:'View Only' }
};

// Permission map: action → minimum role level required
var ACTION_MIN_LEVEL = {
  // Mutations
  'settle_player':          3,  // settlement_manager+
  'weekly_rollover':        3,  // settlement_manager+
  'approve_cancel':         4,  // full_admin+
  'deny_cancel':            4,
  'set_player_limits':      4,
  'add_player':             4,
  'remove_player':          5,  // owner only
  'manage_staff':           5,  // owner only
  // Reads
  'view_host_dashboard':    1,
  'view_active_bets':       1,
  'view_exposure':          2,  // risk_viewer+
  'view_settlement_preview':2,
  'view_player_limits':     2,
  'view_history':           1,
  'grade_trigger':          4   // full_admin+
};

function canDo(role, action) {
  var roleInfo = ROLES[role];
  if (!roleInfo) return { allowed:false, reason:'unknown_role:'+role };
  var minLevel = ACTION_MIN_LEVEL[action];
  if (minLevel === undefined) return { allowed:false, reason:'unknown_action:'+action };
  var allowed = roleInfo.level >= minLevel;
  return {
    allowed,
    role, action,
    roleLevel: roleInfo.level,
    requiredLevel: minLevel,
    reason: allowed ? 'permitted' : 'insufficient_role:needs_'+_levelToRole(minLevel)+'+_have_'+role
  };
}

function _levelToRole(level) {
  return Object.keys(ROLES).find(function(r){ return ROLES[r].level===level; }) || 'unknown';
}

function checkPermission(staffEntry, action) {
  // staffEntry: { userId, role, clubId }
  if (!staffEntry || !staffEntry.role) return { allowed:false, reason:'no_staff_entry' };
  return canDo(staffEntry.role, action);
}

// ── Role definitions ──────────────────────────────────────────────────────────
console.log('\n── Role levels ──');

test('owner has highest level (5)', function() { assertEq(ROLES.owner.level, 5); });
test('full_admin level 4',         function() { assertEq(ROLES.full_admin.level, 4); });
test('settlement_manager level 3', function() { assertEq(ROLES.settlement_manager.level, 3); });
test('risk_viewer level 2',        function() { assertEq(ROLES.risk_viewer.level, 2); });
test('view_only level 1',          function() { assertEq(ROLES.view_only.level, 1); });

// ── Owner: can do everything ──────────────────────────────────────────────────
console.log('\n── Owner: unrestricted ──');

['settle_player','weekly_rollover','approve_cancel','set_player_limits',
 'remove_player','manage_staff','view_exposure','grade_trigger'].forEach(function(action) {
  test('owner can: '+action, function() {
    var r = canDo('owner', action);
    assert(r.allowed, 'owner blocked on: '+action+' reason:'+r.reason);
  });
});

// ── view_only: read-only ──────────────────────────────────────────────────────
console.log('\n── view_only: read-only ──');

test('view_only CAN view host dashboard', function() {
  assert(canDo('view_only','view_host_dashboard').allowed, 'view allowed');
});
test('view_only CAN view active bets',    function() { assert(canDo('view_only','view_active_bets').allowed); });
test('view_only CAN view history',        function() { assert(canDo('view_only','view_history').allowed); });
test('view_only CANNOT view exposure',    function() { assert(!canDo('view_only','view_exposure').allowed); });
test('view_only CANNOT settle',           function() { assert(!canDo('view_only','settle_player').allowed); });
test('view_only CANNOT rollover',         function() { assert(!canDo('view_only','weekly_rollover').allowed); });
test('view_only CANNOT set limits',       function() { assert(!canDo('view_only','set_player_limits').allowed); });
test('view_only CANNOT add player',       function() { assert(!canDo('view_only','add_player').allowed); });
test('view_only CANNOT grade',            function() { assert(!canDo('view_only','grade_trigger').allowed); });

// ── risk_viewer: read exposure, no mutations ──────────────────────────────────
console.log('\n── risk_viewer ──');

test('risk_viewer CAN view exposure',             function() { assert(canDo('risk_viewer','view_exposure').allowed); });
test('risk_viewer CAN view settlement preview',   function() { assert(canDo('risk_viewer','view_settlement_preview').allowed); });
test('risk_viewer CAN view player limits',        function() { assert(canDo('risk_viewer','view_player_limits').allowed); });
test('risk_viewer CANNOT settle',                 function() { assert(!canDo('risk_viewer','settle_player').allowed); });
test('risk_viewer CANNOT set limits',             function() { assert(!canDo('risk_viewer','set_player_limits').allowed); });
test('risk_viewer CANNOT approve cancel',         function() { assert(!canDo('risk_viewer','approve_cancel').allowed); });

// ── settlement_manager ────────────────────────────────────────────────────────
console.log('\n── settlement_manager ──');

test('settlement_manager CAN settle',         function() { assert(canDo('settlement_manager','settle_player').allowed); });
test('settlement_manager CAN rollover',       function() { assert(canDo('settlement_manager','weekly_rollover').allowed); });
test('settlement_manager CANNOT set limits',  function() { assert(!canDo('settlement_manager','set_player_limits').allowed); });
test('settlement_manager CANNOT add player',  function() { assert(!canDo('settlement_manager','add_player').allowed); });
test('settlement_manager CANNOT approve cancel',function(){ assert(!canDo('settlement_manager','approve_cancel').allowed); });
test('settlement_manager CANNOT remove player',function(){ assert(!canDo('settlement_manager','remove_player').allowed); });
test('settlement_manager CANNOT manage staff', function(){ assert(!canDo('settlement_manager','manage_staff').allowed); });

// ── full_admin ────────────────────────────────────────────────────────────────
console.log('\n── full_admin ──');

test('full_admin CAN settle',          function() { assert(canDo('full_admin','settle_player').allowed); });
test('full_admin CAN set limits',      function() { assert(canDo('full_admin','set_player_limits').allowed); });
test('full_admin CAN add player',      function() { assert(canDo('full_admin','add_player').allowed); });
test('full_admin CAN approve cancel',  function() { assert(canDo('full_admin','approve_cancel').allowed); });
test('full_admin CAN grade',           function() { assert(canDo('full_admin','grade_trigger').allowed); });
test('full_admin CANNOT remove player',function() { assert(!canDo('full_admin','remove_player').allowed); });
test('full_admin CANNOT manage staff', function() { assert(!canDo('full_admin','manage_staff').allowed); });

// ── Error cases ───────────────────────────────────────────────────────────────
console.log('\n── Error cases ──');

test('unknown role → denied', function() {
  var r = canDo('superadmin', 'settle_player');
  assert(!r.allowed); assert(r.reason.includes('unknown_role'));
});
test('unknown action → denied', function() {
  var r = canDo('owner', 'fly_a_plane');
  assert(!r.allowed); assert(r.reason.includes('unknown_action'));
});
test('null staff entry → denied', function() {
  var r = checkPermission(null, 'settle_player');
  assert(!r.allowed); assert(r.reason === 'no_staff_entry');
});
test('staff entry with no role → denied', function() {
  var r = checkPermission({ userId:'U1', clubId:'C1' }, 'settle_player');
  assert(!r.allowed);
});

// ── Audit trail ───────────────────────────────────────────────────────────────
console.log('\n── Audit trail ──');

test('denied action includes role and reason in result', function() {
  var r = canDo('view_only', 'settle_player');
  assert(!r.allowed);
  assert(r.role === 'view_only', 'role in result');
  assert(r.action === 'settle_player', 'action in result');
  assert(r.reason.includes('insufficient_role'), 'reason explains denial');
  assert(r.roleLevel !== undefined, 'roleLevel present');
  assert(r.requiredLevel !== undefined, 'requiredLevel present');
});

test('allowed action reason is "permitted"', function() {
  var r = canDo('owner', 'settle_player');
  assert(r.allowed); assertEq(r.reason, 'permitted');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Permission tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ PERMISSION TESTS FAILED'); process.exit(1); }
else console.log('✅ All permission rules verified');
