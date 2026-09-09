/**
 * Host Settlements UI — partial carry modal & labels
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

test('modal shows Current Balance / Amount to Apply / Preview / Apply Settlement', function() {
  assert.ok(src.indexOf('Current Balance') !== -1);
  assert.ok(src.indexOf('Amount to Apply') !== -1);
  assert.ok(src.indexOf('Preview:') !== -1);
  assert.ok(src.indexOf('Apply Settlement') !== -1);
});

test('blank/$0 disables Apply; overpay blocked client-side', function() {
  assert.ok(src.indexOf('blank/$0 disables Apply') !== -1 || src.indexOf('disables Apply') !== -1);
  assert.ok(src.indexOf('_setApplyEnabled(false)') !== -1);
  assert.ok(src.indexOf('Cannot cross zero') !== -1);
});

test('double-click / busy guard on Apply', function() {
  assert.ok(src.indexOf("btn.dataset.busy") !== -1 || src.indexOf('if (btn.disabled) return') !== -1);
});

test('modal shows Current / Amount / New Balance grid', function() {
  assert.ok(src.indexOf('Current Balance') !== -1);
  assert.ok(src.indexOf('New Balance') !== -1);
  assert.ok(src.indexOf('_settle_new') !== -1);
});

test('idempotency key includes clubId', function() {
  assert.ok(src.indexOf("return 'SETTLE_'+clubId+'_'+playerId+'_'") !== -1);
});

test('modal refresh after settle calls renderSettlementPreviewFromDb', function() {
  const modal = src.slice(src.indexOf('async function openSettlePlayerModal'), src.indexOf('window.openSettlePlayerModal'));
  assert.ok(modal.indexOf('renderSettlementPreviewFromDb') !== -1);
  assert.ok(modal.indexOf('loadHostDashboardFromDb') !== -1);
});

test('cards show Settlement carry label', function() {
  assert.ok(src.indexOf('Settlement:') !== -1);
  assert.ok(src.indexOf('settlementBalance') !== -1);
});

test('idempotency key still sent', function() {
  const modal = src.slice(src.indexOf('async function openSettlePlayerModal'), src.indexOf('window.openSettlePlayerModal'));
  assert.ok(modal.indexOf('Idempotency-Key') !== -1);
  assert.ok(modal.indexOf('idempotencyKey') !== -1);
});

test('FE sign convention: − owes host, + host owes; no inversion', function() {
  const modal = src.slice(src.indexOf('async function openSettlePlayerModal'), src.indexOf('window.openSettlePlayerModal'));
  // Signed settlementBalance preferred; owesHost → negative
  assert.ok(modal.indexOf('owesHost > 0 ? -Math.round') !== -1 ||
            modal.indexOf('owesHost > 0 ? -') !== -1);
  assert.ok(modal.indexOf("before < 0 ? 'player_paid_host' : 'host_paid_player'") !== -1);
  // Must not negate settlementBalance when provided
  assert.ok(modal.indexOf('-parseFloat(settlementBalance)') === -1);
  assert.ok(modal.indexOf('overpay_blocked') !== -1);
});

console.log('\n── Results: ' + pass + ' passed, ' + fail + ' failed ──');
process.exit(fail ? 1 : 0);
