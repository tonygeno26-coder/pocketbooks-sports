'use strict';

/**
 * Host Beta Ops — FE contract gates (source slicing).
 * No financial mutation paths; runtime fixtures forbidden — real / empty / error only.
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

test('no runtime Host Beta Ops fixtures or preview fake data', function () {
  assert.ok(!ops.includes('_previewFixture'), 'no preview fixture fn');
  assert.ok(!ops.includes('applyPreviewFixture'), 'no apply fixture');
  assert.ok(!ops.includes('bootPreview'), 'no bootPreview seed');
  assert.ok(!ops.includes('T_PREVIEW_DEMO'), 'no demo tickets');
  assert.ok(!ops.includes('Sam Applicant') && !ops.includes('Alex Tester'), 'no demo people');
  assert.ok(!ops.includes('preview_error_fixture'), 'no fixture error state');
  assert.ok(!ops.includes('opsState'), 'no opsState fixture switches');
  assert.ok(!ops.includes('Local preview: mutate fixture only'));
  assert.ok(ops.includes('Authoritative backend') || ops.includes('No runtime fixtures')
    || ops.includes('real, empty, or error'));
});

test('Host Beta Ops visual gate page removed', function () {
  assert.ok(!fs.existsSync(path.join(root, '_host-beta-ops-visual-gate.html')),
    'visual gate file must be deleted');
});

test('empty / loading / error states exist (fail closed)', function () {
  assert.ok(ops.includes('Loading feedback'));
  assert.ok(ops.includes('Unable to load feedback'));
  assert.ok(ops.includes('Retry'));
  assert.ok(ops.includes('No feedback yet'));
  assert.ok(ops.includes('No pending join requests'));
  assert.ok(ops.includes('No active testers'));
  // Fail closed: API catch must not fall back to fixtures
  assert.ok(ops.includes("_fbError = (e && e.message) || 'Unable to load feedback'")
    || (ops.includes('_fbError =') && ops.includes('Unable to load feedback')));
});

test('non-financial overview metrics only', function () {
  assert.ok(ops.includes('Join requests') && ops.includes('Active testers'));
  assert.ok(ops.includes('New feedback') && ops.includes('Bet issues'));
  assert.ok(!ops.includes('stat-profit') && !ops.includes('Credit Position'));
});

test('ops tab always loads live dashboard / requests', function () {
  assert.ok(html.includes("loadHostDashboardFromDb('beta_ops')"));
  assert.ok(html.includes('Always authoritative backend')
    || !html.includes('uses fixture data only'));
  assert.ok(!html.includes('PbHostBetaOps.isLocalPreview'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('host beta ops FE: PASS');
