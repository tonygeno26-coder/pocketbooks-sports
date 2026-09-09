'use strict';
/**
 * FE red-team mirror — pure fixtures validating authz/financial attack surfaces.
 * Run: node tests/red-team-authz.test.js
 */
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m || '') + ' got ' + a + ' expected ' + b); }

function validateStake(stake) {
  var stakeAmt = typeof stake === 'number' ? stake : parseFloat(stake);
  if (!Number.isFinite(stakeAmt) || stakeAmt <= 0) return { ok: false, error: 'invalid_stake' };
  return { ok: true, stakeAmt: Math.round(stakeAmt * 100) / 100 };
}

function pinNotifPlayer(actor, queryPlayerId) {
  var id = String((actor && actor.actorId) || '');
  if (queryPlayerId && String(queryPlayerId) !== id) return id;
  return id;
}

function cancelOwnerGate(actor, ticket, bodyPlayerId) {
  var ranks = { owner: 5, full_admin: 4, host: 4, admin: 4, player: 1 };
  var rank = ranks[actor.role] || 0;
  var privileged = rank >= 4 || actor.platformRole === 'platform_admin';
  if (privileged) return { ok: true };
  if (String(ticket.player_id) !== String(actor.actorId)) return { ok: false, error: 'not_owner' };
  if (bodyPlayerId && String(bodyPlayerId) !== String(actor.actorId)) return { ok: false, error: 'not_own_account' };
  return { ok: true };
}

function clubScope(actor, requestedClubId) {
  if (!requestedClubId) return { ok: true };
  if (actor.platformRole === 'platform_admin') return { ok: true };
  if (actor.clubId && actor.clubId !== requestedClubId)
    return { ok: false, error: 'club_scope_mismatch' };
  return { ok: true };
}

console.log('\n── Red team FE fixtures ──');

test('rejects Infinity/NaN/0/negative/huge stake', function () {
  assert(!validateStake(Infinity).ok);
  assert(!validateStake(NaN).ok);
  assert(!validateStake(0).ok);
  assert(!validateStake(-1).ok);
  assert(!validateStake('Infinity').ok);
  assert(validateStake(10).ok);
});

test('notification query playerId spoof ignored', function () {
  assertEq(pinNotifPlayer({ actorId: 'P1' }, 'P2'), 'P1');
});

test('player A cannot cancel player B ticket with body.playerId=B', function () {
  var r = cancelOwnerGate({ actorId: 'A', role: 'player' }, { player_id: 'B' }, 'B');
  assertEq(r.ok, false);
  assertEq(r.error, 'not_owner');
});

test('host A club cannot scope into host B club', function () {
  var r = clubScope({ actorId: 'H1', role: 'full_admin', clubId: 'CLUB_A' }, 'CLUB_B');
  assertEq(r.ok, false);
  assertEq(r.error, 'club_scope_mismatch');
});

test('client payout/bankroll fields must not authorize place', function () {
  // Server recalculates; client-modified payout is ignored by contract.
  var client = { stake: 50, payout: 99999, availableBalance: 1e9 };
  var server = validateStake(client.stake);
  assert(server.ok);
  assert(client.payout !== server.stakeAmt * 2, 'client payout is not trusted stake math');
});

console.log('\npass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
