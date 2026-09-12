'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (error) {
    console.error('  ❌ ' + name + '\n     ' + error.message);
    process.exitCode = 1;
  }
}

function functionSlice(name, nextName) {
  const start = html.indexOf('function ' + name);
  const end = html.indexOf('function ' + nextName, start + 1);
  return html.slice(start, end < 0 ? html.length : end);
}

console.log('\n── Host player limit management ──');

test('Approve opens the normal Host limit setup modal', function() {
  assert(html.includes('id="modal-approve-player"'));
  assert(html.includes('id="approve-player-title"'));
  assert(html.includes('Approve Player'));
  assert(html.includes('function onApproveButtonClick'));
  assert(html.includes('openApprovePlayerModal(req)'));
});

test('approval modal exposes only enforced numeric fields', function() {
  const start = html.indexOf('id="modal-approve-player"');
  const end = html.indexOf('<!-- ADD PLAYER MODAL -->', start);
  const modal = html.slice(start, end);
  ['appr-maxbet', 'appr-payout', 'appr-openrisk'].forEach(function(id) {
    assert(modal.includes('id="' + id + '"'), id + ' missing');
  });
  assert(!modal.includes('appr-daily'), 'unenforced max daily risk must not be exposed');
  assert(!modal.includes('Max Parlay'), 'no player-specific parlay field exists');
});

test('approval displays display name and secondary username', function() {
  assert(html.includes('id="appr-display-name"'));
  assert(html.includes('id="appr-username"'));
  const open = functionSlice('openApprovePlayerModal', 'closeApprovePlayerModal');
  assert(open.includes("_identityParts(req)"));
  assert(open.includes("'@'+identity.username"));
});

test('approval loads server defaults before enabling submit', function() {
  const open = functionSlice('openApprovePlayerModal', 'closeApprovePlayerModal');
  assert(open.includes('_loadServerPlayerLimits(clubId, pid)'));
  assert(open.includes('effective.max_single_bet'));
  assert(open.includes('effective.max_payout'));
  assert(open.includes('_approvalLimitsReady = true'));
  assert(html.includes('id="appr-submit" type="button" disabled'));
});

test('approval has no optimistic or local success path', function() {
  const confirm = functionSlice('confirmApprovePlayerModal', 'denyApprovePlayerModal');
  assert(confirm.includes("apiCall('POST', '/api/club/members/approve'"));
  assert(confirm.includes("result.ok !== true || result.status !== 'approved' || !result.limits"));
  assert(confirm.includes("loadHostDashboardFromDb('player_approved')"));
  assert(!confirm.includes('localStorage'));
  assert(!confirm.includes('/api/clubs/'));
  assert(!confirm.includes("'/api/club/player-limits'"));
  assert(!confirm.includes('(local)'));
});

test('approved canonical player detail renders server player limits', function() {
  const render = functionSlice('renderPlayersTab', 'renderRequests');
  assert(render.includes('PLAYER LIMITS'));
  assert(render.includes('Edit Limits'));
  assert(render.includes('values.max_single_bet'));
  assert(render.includes('values.max_payout'));
  assert(render.includes('values.max_open_risk'));
});

test('editing saves, refetches, then displays server-confirmed values', function() {
  const save = functionSlice('saveLimits', 'loadClubs');
  assert(save.includes("apiCall('POST', '/api/club/player-limits'"));
  assert(save.includes('_loadServerPlayerLimits(clubId, playerId)'));
  assert(save.indexOf("apiCall('POST'") < save.indexOf('_loadServerPlayerLimits(clubId, playerId)'));
  assert(save.indexOf('_loadServerPlayerLimits(clubId, playerId)') < save.indexOf('renderPlayersTab()'));
});

test('client rejects negative and non-finite limit values', function() {
  const validator = functionSlice('_validLimitInput', '_loadServerPlayerLimits');
  assert(validator.includes('!Number.isFinite(value) || value < 0'));
});

test('authenticated request refresh cannot revive stale local applicants', function() {
  const load = functionSlice('loadRequests', 'handleRequest');
  assert(load.includes('var remoteLoaded = false'));
  assert(load.includes('saveJoinRequests([])'));
  assert(load.includes('pendingRequests = []'));
  const authenticatedPath = load.slice(load.indexOf('var remoteLoaded = false'));
  assert(!authenticatedPath.includes('pendingRequests = loadJoinRequests()'));
});

if (!process.exitCode) {
  console.log('✅ ' + passed + ' host player limit UI tests passed');
}
