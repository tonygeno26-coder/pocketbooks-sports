'use strict';

/**
 * Host Beta Ops — FE contract gates (source slicing).
 * No financial mutation paths; preview fixture must be localhost-only.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ops = fs.readFileSync(path.join(root, 'host-beta-ops.js'), 'utf8');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  OK ' + name);
    pass++;
  } catch (e) {
    console.error('  FAIL ' + name + '\n     ' + e.message);
    fail++;
  }
}

console.log('\n── Host Beta Ops FE contracts ──');

test('Beta Ops section + Ops nav integrated into Host dashboard', function () {
  assert.ok(html.includes('id="beta-ops-section"'), 'section');
  assert.ok(html.includes("setBN(this,'ops')") || html.includes('data-tab="ops"'), 'ops nav');
  assert.ok(html.includes('host-beta-ops.js'), 'script wired');
  assert.ok(html.includes("ops:1") || html.includes('ops: 1') || html.includes("ops:1,"), 'tab map');
  assert.ok(/ops:\s*4/.test(html) || html.includes('ops: 4'), 'switchHostTab index');
});

test('Home entry card + dark navy ops styles present', function () {
  assert.ok(html.includes('.hbo-wrap') || ops.includes('hbo-wrap'), 'ops styles');
  assert.ok(html.includes('hbo-home-card') || ops.includes('hbo-home-card'), 'home card');
  assert.ok(html.includes('--pb-bg:#070b12') || html.includes('--pb-card:#121a27'), 'host theme');
});

test('uses host feedback APIs only (GET list + PATCH status)', function () {
  assert.ok(ops.includes('/api/host/feedback'), 'list API');
  assert.ok(ops.includes("PATCH', '/api/host/feedback/") || ops.includes("'/api/host/feedback/'"), 'status API');
  assert.ok(!ops.includes("DELETE'), '/api/host/feedback"), 'no delete');
  assert.ok(!ops.includes('/api/feedback?'), 'no public listing');
});

test('join approve/decline reuse existing host handlers', function () {
  assert.ok(ops.includes('onApproveButtonClick'), 'approve via existing handler');
  assert.ok(ops.includes('onDenyRequestClick'), 'deny via existing handler');
  assert.ok(!/starting.?credit|setStartingBalance|balanceStart\s*=/i.test(ops)
    || ops.includes('display-only') || ops.includes('Bankroll is display-only'),
    'testers bankroll is display context');
});

test('active testers are read-only (no bankroll mutation APIs)', function () {
  assert.ok(!ops.includes('/api/club/members/approve'), 'ops module does not call approve RPC itself');
  assert.ok(!/grade_ticket|place_bet|cancel_bet|settle_player|ledger/i.test(ops));
  assert.ok(ops.includes('Available') || ops.includes('availableBalance'), 'balance display ok');
  assert.ok(ops.includes('no bankroll edits') || ops.includes('display-only')
    || ops.includes('Bankroll is display-only'));
});

test('feedback status triage new/reviewed/resolved only', function () {
  assert.ok(ops.includes("'reviewed'") && ops.includes("'resolved'") && ops.includes("'new'"));
  assert.ok(!ops.includes("status: 'deleted'") && !ops.includes("status:'deleted'"));
  assert.ok(!ops.includes('editMessage') && !ops.includes('updateMessage'));
  assert.ok(!ops.includes("PATCH', '/api/host/feedback/") || ops.includes('status: status')
    || ops.includes('{ status: status }') || ops.includes('body = { status: status }'));
  // Status update body must not rewrite message text
  assert.ok(/body\s*=\s*\{\s*status:\s*status\s*\}/.test(ops)
    || /status:\s*status/.test(ops));
});

test('filters: status, category, bet issues, search', function () {
  assert.ok(ops.includes('setFbStatus') && ops.includes('Bet Issues'));
  assert.ok(ops.includes('setFbCategory') && ops.includes('onSearch'));
  assert.ok(ops.includes('betIssues=1') || ops.includes('betIssues'));
});

test('bet issue ticket context is read-only', function () {
  assert.ok(ops.includes('no regrade / settle') || ops.includes('Read-only'));
  assert.ok(!ops.includes('grade_ticket_tx'));
  assert.ok(!ops.includes('place_bet_tx'));
  assert.ok(!ops.includes('/api/host/offer-cashout'));
});

test('local preview fixture is production-blocked', function () {
  assert.ok(ops.includes('_isLocalPreview') || ops.includes('localhost'));
  assert.ok(ops.includes("get('preview') === '1'"));
  assert.ok(ops.includes('_previewFixture') || ops.includes('LOCAL-ONLY'));
  assert.ok(ops.includes("h === 'localhost'") || ops.includes("=== 'localhost'"));
  // Must not arm preview from query flag alone without local host check
  assert.ok(!/preview.*===.*'1'[\s\S]{0,40}_previewFixture\(\)/.test(ops.replace(/\s+/g, ' '))
    || ops.includes('_isLocalPreview()'));
});

test('empty / loading / error states exist', function () {
  assert.ok(ops.includes('Loading feedback'));
  assert.ok(ops.includes('Couldn’t load feedback') || ops.includes("Couldn't load feedback")
    || ops.includes('Unable to load feedback'));
  assert.ok(ops.includes('No feedback yet'));
  assert.ok(ops.includes('No pending join requests'));
  assert.ok(ops.includes('No active testers'));
});

test('non-financial overview metrics only', function () {
  assert.ok(ops.includes('Join requests') && ops.includes('Active testers'));
  assert.ok(ops.includes('New feedback') && ops.includes('Bet issues'));
  assert.ok(!ops.includes('stat-profit') && !ops.includes('Credit Position'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('host beta ops FE: PASS');
