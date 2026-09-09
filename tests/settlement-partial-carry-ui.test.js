/**
 * Host Settlements UI — partial carry modal & recording labels
 * Run: node tests/settlement-partial-carry-ui.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.error('  ❌ ' + name + '\n     ' + e.message); fail++; }
}

console.log('\n── Settlements partial-carry UI ──');

test('modal shows Ledger Position / Amount Settled / Preview / Record Settlement', function() {
  assert.ok(src.indexOf('Ledger Position') !== -1);
  assert.ok(src.indexOf('Amount Settled') !== -1);
  assert.ok(src.indexOf('Preview:') !== -1);
  assert.ok(src.indexOf('Record Settlement') !== -1);
  assert.ok(src.indexOf('Apply Settlement') === -1);
  assert.ok(src.indexOf('Confirm Settlement') === -1);
});

test('blank/$0 disables Record; over-settlement blocked client-side', function() {
  assert.ok(src.indexOf('blank/$0 disables Record') !== -1 || src.indexOf('disables Record') !== -1);
  assert.ok(src.indexOf('_setApplyEnabled(false)') !== -1);
  assert.ok(src.indexOf('Cannot cross zero') !== -1);
});

test('double-click / busy guard on Record', function() {
  assert.ok(src.indexOf("btn.dataset.busy") !== -1 || src.indexOf('if (btn.disabled) return') !== -1);
});

test('modal shows Before/Settled/After flow grid with Outstanding', function() {
  assert.ok(src.indexOf('Ledger Position') !== -1);
  assert.ok(src.indexOf('Outstanding') !== -1);
  assert.ok(src.indexOf('_settle_new') !== -1);
  assert.ok(src.indexOf('_settle_flow_grid') !== -1);
});

test('idempotency key includes clubId', function() {
  assert.ok(src.indexOf("return 'SETTLE_'+clubId+'_'+playerId+'_'") !== -1);
});

test('modal refresh after record calls renderSettlementPreviewFromDb', function() {
  const modal = src.slice(src.indexOf('async function openSettlePlayerModal'), src.indexOf('window.openSettlePlayerModal'));
  assert.ok(modal.indexOf('renderSettlementPreviewFromDb') !== -1);
  assert.ok(modal.indexOf('loadHostDashboardFromDb') !== -1);
  assert.ok(modal.indexOf('loadSettlementRecords') !== -1);
});

test('cards show direction label and Ledger carry label', function() {
  assert.ok(src.indexOf('Player owes host') !== -1);
  assert.ok(src.indexOf('Host owes player') !== -1);
  assert.ok(src.indexOf('Ledger:') !== -1);
  assert.ok(src.indexOf('settlementBalance') !== -1);
  assert.ok(src.indexOf('data-settle-direction') !== -1);
});

test('posts to record-settlement API', function() {
  const modal = src.slice(src.indexOf('async function openSettlePlayerModal'), src.indexOf('window.openSettlePlayerModal'));
  assert.ok(modal.indexOf('/api/host/record-settlement') !== -1);
  assert.ok(modal.indexOf('Idempotency-Key') !== -1);
  assert.ok(modal.indexOf('idempotencyKey') !== -1);
  assert.ok(modal.indexOf('/api/host/settle-player') === -1);
});

test('exact off-platform disclaimer present', function() {
  assert.ok(src.indexOf('PocketBooks records settlements completed outside the app. No money is transferred through PocketBooks.') !== -1);
});

test('settlement history section fetches records API', function() {
  assert.ok(src.indexOf('/api/host/settlement-records') !== -1);
  assert.ok(src.indexOf('Settlement History') !== -1);
  assert.ok(src.indexOf('_settlement_records_section') !== -1);
});

test('FE sign convention: − owes host, + host owes; no inversion', function() {
  const modal = src.slice(src.indexOf('async function openSettlePlayerModal'), src.indexOf('window.openSettlePlayerModal'));
  assert.ok(modal.indexOf('owesHost > 0 ? -Math.round') !== -1 ||
            modal.indexOf('owesHost > 0 ? -') !== -1);
  assert.ok(modal.indexOf("before < 0 ? 'player_paid_host' : 'host_paid_player'") !== -1);
  assert.ok(modal.indexOf('-parseFloat(settlementBalance)') === -1);
  assert.ok(modal.indexOf('over_settlement_blocked') !== -1 || modal.indexOf('overpay_blocked') !== -1);
});

console.log('\n── Results: ' + pass + ' passed, ' + fail + ' failed ──');
process.exit(fail ? 1 : 0);
