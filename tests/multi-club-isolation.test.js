/**
 * FE multi-club isolation fixtures (complementary; no network).
 * Run: node tests/multi-club-isolation.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK  ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

function checkClubScope(actor, requestedClubId) {
  if (!requestedClubId) return { ok: false, reason: 'missing_clubId', status: 400 };
  if (actor.platformRole === 'platform_admin') return { ok: true };
  if (actor.clubId && String(actor.clubId) !== String(requestedClubId)) {
    return { ok: false, reason: 'club_scope_mismatch', status: 403 };
  }
  if (!actor.clubId) return { ok: false, reason: 'missing_clubId', status: 400 };
  return { ok: true };
}

function authorizeCashout(actor, ticket) {
  const club = checkClubScope(actor, ticket.club_id);
  if (!club.ok) return club;
  if (String(ticket.player_id) !== String(actor.actorId)
      && !['owner', 'full_admin'].includes(actor.role)
      && actor.platformRole !== 'platform_admin') {
    return { ok: false, reason: 'not_owner', status: 403 };
  }
  return { ok: true };
}

const plyMultiA = { actorId: 'PLY_MULTI', role: 'player', clubId: 'CLUB_A' };
const plyMultiB = { actorId: 'PLY_MULTI', role: 'player', clubId: 'CLUB_B' };
const hostA = { actorId: 'HOST_A', role: 'full_admin', clubId: 'CLUB_A' };
const ticketA = { id: 'T_A', player_id: 'PLY_MULTI', club_id: 'CLUB_A' };
const ticketB = { id: 'T_B', player_id: 'PLY_MULTI', club_id: 'CLUB_B' };

console.log('\n── Multi-club same player ──');
test('PLY_MULTI@A cannot cash-out Club B ticket', function () {
  const r = authorizeCashout(plyMultiA, ticketB);
  assert(!r.ok && r.reason === 'club_scope_mismatch');
});
test('PLY_MULTI@A can cash-out Club A ticket', function () {
  assert(authorizeCashout(plyMultiA, ticketA).ok);
});
test('PLY_MULTI@B dashboard club rejects Club A', function () {
  assert(!checkClubScope(plyMultiB, 'CLUB_A').ok);
  assert(checkClubScope(plyMultiB, 'CLUB_B').ok);
});
test('Host A cannot act on Club B ticket', function () {
  assert(!authorizeCashout(hostA, ticketB).ok);
});

console.log('\n── Docs present ──');
test('AUTHORIZATION_AUDIT.md exists', function () {
  assert(fs.existsSync(path.join(__dirname, '..', 'docs', 'AUTHORIZATION_AUDIT.md')));
});
test('CLUB_ISOLATION_AUDIT.md exists', function () {
  assert(fs.existsSync(path.join(__dirname, '..', 'docs', 'CLUB_ISOLATION_AUDIT.md')));
});

console.log('\n── Summary ──');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
