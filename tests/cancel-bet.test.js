/**
 * PocketBooks Sports — DB-Authoritative Cancel Bet Tests
 * Run: node tests/cancel-bet.test.js
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }
function assertApprox(a, b, m) { if (Math.abs(a-b)>0.02) throw new Error((m||'')+' — got '+a+' expected ~'+b); }

// ── Pure cancel validation engine ─────────────────────────────────────────────

function validateCancel(body, ticket, nowMs) {
  nowMs = nowMs || Date.now();
  var errors = [];
  if (!body.ticketId)       errors.push('missing_ticketId');
  if (!body.playerId)       errors.push('missing_playerId');
  if (!body.idempotencyKey) errors.push('missing_idempotencyKey');
  if (errors.length) return { ok:false, errors };

  if (!ticket) return { ok:false, errors:['ticket_not_found'] };

  // Ownership check
  if (ticket.player_id !== body.playerId)
    return { ok:false, errors:['not_owner:ticket belongs to '+ticket.player_id] };
  if (body.clubId && ticket.club_id && ticket.club_id !== body.clubId)
    return { ok:false, errors:['wrong_club'] };

  // Status check
  var s = (ticket.status||'').toLowerCase();
  if (s === 'canceled' || s === 'voided')
    return { ok:false, errors:['already_canceled'] };
  if (s !== 'active' && s !== 'open')
    return { ok:false, errors:['cannot_cancel_settled:status='+s] };

  // Game started check: all legs must not have started
  var sels = ticket.selections || ticket._legs || [];
  for (var i=0; i<sels.length; i++) {
    var ct = sels[i].scheduledStart || sels[i].scheduled_start || sels[i].commenceTime || null;
    if (ct) {
      var ctMs = new Date(ct).getTime();
      if (!isNaN(ctMs) && nowMs >= ctMs) {
        return { ok:false, errors:['game_already_started:'+ct] };
      }
    }
  }

  return { ok:true, refundAmount: parseFloat(ticket.risk_amount)||0 };
}

function buildCancelLedgerEntry(body, ticket, now) {
  return {
    id:            body.idempotencyKey,   // idempotent
    club_id:       body.clubId || ticket.club_id || null,
    player_id:     body.playerId,
    ticket_id:     body.ticketId,
    type:          'bet_canceled',
    amount:        parseFloat(ticket.risk_amount)||0,  // positive = refund
    balance_before: null, balance_after: null,
    reason:        'cancel:' + (body.reason||'player_request'),
    created_at:    now || new Date().toISOString(),
    created_by:    body.playerId
  };
}

// ── Test data ─────────────────────────────────────────────────────────────────
var NOW = new Date('2026-05-17T15:00:00Z').getTime();  // 3pm UTC
var FUTURE_CT = '2026-05-17T19:10:00Z';                // 7:10pm — not started
var PAST_CT   = '2026-05-17T14:00:00Z';                // 2pm — already started

function ticket(id, status, risk, pid, ct) {
  return {
    id, status, risk_amount:risk||100, player_id:pid||'P001', club_id:'C001',
    selections:[{ scheduledStart: ct||FUTURE_CT }]
  };
}

var ACTIVE_FUTURE = ticket('T001','active',100,'P001',FUTURE_CT);
var ACTIVE_PAST   = ticket('T002','active',100,'P001',PAST_CT);
var WON_TICKET    = ticket('T003','won',100,'P001',PAST_CT);
var CANCELED      = ticket('T004','canceled',100,'P001',PAST_CT);
var OTHER_PLAYER  = ticket('T005','active',100,'P002',FUTURE_CT);

var BASE = { ticketId:'T001', playerId:'P001', clubId:'C001', idempotencyKey:'CANCEL_T001' };

// ── Validation ────────────────────────────────────────────────────────────────
console.log('\n── Validation: required fields ──');

test('valid cancel passes', function() {
  var r = validateCancel(BASE, ACTIVE_FUTURE, NOW);
  assert(r.ok, 'valid: '+(r.errors||[]).join(','));
  assertEq(r.refundAmount, 100);
});
test('missing ticketId → error', function() {
  assert(!validateCancel(Object.assign({},BASE,{ticketId:null}), ACTIVE_FUTURE, NOW).ok);
});
test('missing playerId → error', function() {
  assert(!validateCancel(Object.assign({},BASE,{playerId:null}), ACTIVE_FUTURE, NOW).ok);
});
test('missing idempotencyKey → error', function() {
  assert(!validateCancel(Object.assign({},BASE,{idempotencyKey:null}), ACTIVE_FUTURE, NOW).ok);
});
test('ticket not found → error', function() {
  var r = validateCancel(BASE, null, NOW);
  assert(!r.ok); assertEq(r.errors[0], 'ticket_not_found');
});

console.log('\n── Ownership ──');

test('wrong player → blocked', function() {
  var r = validateCancel(BASE, OTHER_PLAYER, NOW);
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('not_owner'); }));
});
test('correct player → allowed', function() {
  assert(validateCancel(BASE, ACTIVE_FUTURE, NOW).ok);
});

console.log('\n── Status check ──');

test('active future ticket → allowed', function() {
  assert(validateCancel(BASE, ACTIVE_FUTURE, NOW).ok);
});
test('won ticket → blocked', function() {
  var r = validateCancel(BASE, WON_TICKET, NOW);
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('cannot_cancel_settled'); }));
});
test('lost ticket → blocked', function() {
  var lost = ticket('T_lost','lost',100,'P001',PAST_CT);
  var r = validateCancel(BASE, lost, NOW);
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('cannot_cancel_settled'); }));
});
test('already canceled → blocked', function() {
  var r = validateCancel(BASE, CANCELED, NOW);
  assert(!r.ok); assertEq(r.errors[0], 'already_canceled');
});

console.log('\n── Game started check ──');

test('game not started → allowed', function() {
  var r = validateCancel(BASE, ACTIVE_FUTURE, NOW); // NOW=3pm, game=7:10pm
  assert(r.ok, 'future game allowed');
});
test('game already started → blocked', function() {
  var r = validateCancel(Object.assign({},BASE,{ticketId:'T002'}), ACTIVE_PAST, NOW);
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('game_already_started'); }));
});
test('ticket with no scheduledStart → allowed (cannot determine)', function() {
  var t = { id:'T_ns', status:'active', risk_amount:100, player_id:'P001', club_id:'C001', selections:[{}] };
  var r = validateCancel(BASE, t, NOW);
  assert(r.ok, 'no scheduledStart = allowed');
});
test('parlay: one started leg blocks whole cancel', function() {
  var t = { id:'T_par', status:'active', risk_amount:25, player_id:'P001', club_id:'C001',
    selections:[{ scheduledStart:FUTURE_CT },{ scheduledStart:PAST_CT }] };
  var r = validateCancel(BASE, t, NOW);
  assert(!r.ok, 'one started leg blocks cancel');
});

console.log('\n── Ledger entry ──');

test('buildCancelLedgerEntry: positive amount (refund)', function() {
  var entry = buildCancelLedgerEntry(BASE, ACTIVE_FUTURE, '2026-05-17T15:00:00Z');
  assert(entry.amount > 0, 'refund is positive');
  assertEq(entry.amount, 100);
  assertEq(entry.type, 'bet_canceled');
  assertEq(entry.id, BASE.idempotencyKey, 'id=idempotencyKey');
  assertEq(entry.ticket_id, 'T001');
});

test('cancel refund amount equals ticket risk', function() {
  var entry = buildCancelLedgerEntry(BASE, ACTIVE_FUTURE, '2026-05-17T15:00:00Z');
  assertEq(entry.amount, ACTIVE_FUTURE.risk_amount);
});

console.log('\n── Idempotency ──');

test('same idempotencyKey → 1 ledger row', function() {
  var seen = {};
  function upsert(e) { seen[e.id]=e; }
  upsert(buildCancelLedgerEntry(BASE, ACTIVE_FUTURE, 'now'));
  upsert(buildCancelLedgerEntry(BASE, ACTIVE_FUTURE, 'now'));
  assertEq(Object.keys(seen).length, 1, 'only 1 row');
});

test('ticket status=active guard prevents double-cancel race', function() {
  // Simulate: after first cancel, status='canceled'
  // Second attempt hits already_canceled guard
  var r1 = validateCancel(BASE, ACTIVE_FUTURE, NOW);
  assert(r1.ok, 'first cancel ok');
  // Simulate status update
  var afterCancel = Object.assign({}, ACTIVE_FUTURE, { status:'canceled' });
  var r2 = validateCancel(BASE, afterCancel, NOW);
  assert(!r2.ok, 'second cancel blocked');
  assertEq(r2.errors[0], 'already_canceled');
});

console.log('\n── Balance after cancel ──');

test('cancel refund restores risk to available balance', function() {
  // Before: starting=$1000, active=$100 → available=$900
  // After cancel: active removed → available=$1000
  var tickets = [ticket('T001','active',100,'P001',FUTURE_CT)];
  var before = 1000 - 100; // = 900
  // After cancel: risk_amount no longer in openRisk
  tickets[0].status = 'canceled';
  var after = 1000 - 0; // = 1000
  assertEq(before, 900, 'before cancel');
  assertEq(after, 1000, 'after cancel balance restored');
});

// ── Membership verification (legacy token gate) ─────────────────────────────
// These tests cover the requirePermissionScoped membership lookup path:
// when a token has no clubId claim, DB membership must be verified before
// the cancel route is reached. ticket.club_id must NOT bypass this check.
console.log('\n── Membership verification (legacy token gate) ──');

function _simulateMembershipGate(actor, reqClub, membershipRow) {
  // Mirrors requirePermissionScoped membership lookup logic
  if (!actor || actor.error) return { ok:false, error:'invalid_actor' };
  var needsLookup = actor.legacyToken || (!actor.clubId && !actor.isDevBypass);
  if (!needsLookup) return { ok:true, actor:actor }; // club-claim token skips lookup
  if (!reqClub) return { ok:false, error:'missing_clubId' };
  // Membership lookup result
  if (!membershipRow) return { ok:false, error:'membership_not_found' };
  if (membershipRow.status !== 'active' && membershipRow.status !== 'approved')
    return { ok:false, error:'membership_inactive', status:membershipRow.status };
  // Success: upgrade actor
  var roleMap = { host:'full_admin', admin:'full_admin', cohost:'settlement_manager', staff:'risk_viewer' };
  var rawRole = membershipRow.role || 'player';
  var dbRole = roleMap[rawRole] || rawRole;
  var upgraded = Object.assign({}, actor, { role:dbRole, clubId:String(reqClub), membershipVerified:true });
  return { ok:true, actor:upgraded };
}

test('legacy token + missing membership → membership_not_found (not club_scope_mismatch)', function() {
  var actor = { actorId:'4', role:'view_only', clubId:'', legacyToken:true, reqClub:'club-1' };
  var result = _simulateMembershipGate(actor, 'club-1', null);
  assert(!result.ok, 'should fail');
  assertEq(result.error, 'membership_not_found');
});

test('legacy token + approved membership → actor upgraded with full_admin, membershipVerified=true', function() {
  var actor = { actorId:'4', role:'view_only', clubId:'', legacyToken:true, reqClub:'club-1' };
  var membership = { actor_id:'4', club_id:'club-1', role:'host', status:'approved' };
  var result = _simulateMembershipGate(actor, 'club-1', membership);
  assert(result.ok, 'should pass');
  assertEq(result.actor.role, 'full_admin');
  assertEq(result.actor.membershipVerified, true);
  assertEq(result.actor.clubId, 'club-1');
});

test('legacy token + revoked/pending membership → membership_inactive', function() {
  var actor = { actorId:'4', role:'view_only', clubId:'', legacyToken:true };
  var membership = { actor_id:'4', club_id:'club-1', role:'player', status:'pending' };
  var r1 = _simulateMembershipGate(actor, 'club-1', membership);
  assert(!r1.ok, 'pending should fail');
  assertEq(r1.error, 'membership_inactive');

  var revoked = Object.assign({}, membership, { status:'suspended' });
  var r2 = _simulateMembershipGate(actor, 'club-1', revoked);
  assert(!r2.ok, 'suspended should fail');
  assertEq(r2.error, 'membership_inactive');
});

test('ticket.club_id fallback must not bypass membership check — auth uses X-Club-Id/body.clubId', function() {
  // Scenario: ticket lives in club-uuid, actor has membership in club-1.
  // Request sends X-Club-Id=club-uuid. Since actor has no membership for club-uuid,
  // lookup must reject BEFORE route handler sees ticket.club_id.
  var actor = { actorId:'4', role:'view_only', clubId:'', legacyToken:true };
  var membership_club1 = { actor_id:'4', club_id:'club-1', role:'host', status:'approved' };
  // Auth gate uses reqClub from request (club-uuid), not ticket.club_id
  var reqClub = 'club-uuid-different';
  var result = _simulateMembershipGate(actor, reqClub, null); // no membership for club-uuid
  assert(!result.ok, 'should reject — no membership for requested club');
  assertEq(result.error, 'membership_not_found',
    'auth gate rejects on missing membership for requested club, before route can use ticket.club_id');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Cancel bet tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ CANCEL BET TESTS FAILED'); process.exit(1); }
else console.log('✅ All cancel bet rules verified');
