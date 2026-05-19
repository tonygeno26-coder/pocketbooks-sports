/**
 * PocketBooks Sports — Settlement Reconciliation Tests
 * Run: node tests/reconciliation.test.js
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }
function assertApprox(a, b, m) { if (Math.abs(a-b)>0.02) throw new Error((m||'')+' — got '+a+' expected ~'+b); }

// ── Pure reconciliation engine ────────────────────────────────────────────────

function rnd(v) { return Math.round((isNaN(v)?0:v)*100)/100; }

function calcTicketTotals(tickets) {
  var activeRisk=0, settledGain=0, settledLoss=0;
  (tickets||[]).forEach(function(t) {
    var s=t.status.toLowerCase(), r=parseFloat(t.risk_amount)||0, p=parseFloat(t.potential_profit)||0;
    if (s==='canceled'||s==='voided'||s==='push'||s==='pushed') return;
    if (s==='active'||s==='open')  activeRisk   += r;
    else if (s==='lost')           settledGain  += r;  // host gained
    else if (s==='won')            settledLoss  += p;  // host paid
  });
  return { activeRisk:rnd(activeRisk), settledGain:rnd(settledGain), settledLoss:rnd(settledLoss),
           profit:rnd(settledGain-settledLoss) };
}

function calcLedgerTotals(ledger) {
  var totals = { bet_placed:0, bet_won:0, bet_lost:0, bet_push:0, bet_canceled:0, settlement:0, admin_adjustment:0 };
  (ledger||[]).forEach(function(e) {
    var t = e.type||'';
    if (totals[t] !== undefined) totals[t] += parseFloat(e.amount)||0;
    else totals.admin_adjustment += parseFloat(e.amount)||0;
  });
  var net = Object.values(totals).reduce(function(s,v){ return s+v; }, 0);
  return Object.assign({ net:rnd(net) }, Object.fromEntries(Object.entries(totals).map(function(kv){ return [kv[0], rnd(kv[1])]; })));
}

function reconcile(ticketTotals, ledgerTotals, previewTotals, latestSnapshot) {
  var mismatches = [];

  // Rule 1: ticket profit should equal ledger bet_won + bet_lost net
  // bet_won = positive (player credited), bet_lost = 0 amount (risk already deducted at placement)
  // Actually: from host perspective, profit = settledGain - settledLoss
  // Ledger: bet_won entries are 0 or negative from host POV; we check ticket vs preview
  var tProfit  = ticketTotals.profit;
  var pNet     = previewTotals ? previewTotals.net : null; // host net = playersOwe - hostOwes

  if (pNet !== null && Math.abs(tProfit - pNet) > 0.02) {
    mismatches.push({ category:'ticket_vs_preview', delta:rnd(tProfit-pNet),
      detail:'ticketProfit='+tProfit+' previewNet='+pNet });
  }

  // Rule 2: latest snapshot should match preview (if snapshot exists)
  if (latestSnapshot && previewTotals) {
    var sNet = parseFloat(latestSnapshot.net)||0;
    // Snapshot is from end of prior week so may differ — only flag if same week
    // We just check snapshot internal consistency: playersOwe - hostOwes === net
    var snapCalcNet = rnd((latestSnapshot.playersOwe||0) - (latestSnapshot.hostOwes||0));
    if (Math.abs(snapCalcNet - sNet) > 0.02) {
      mismatches.push({ category:'snapshot_internal', delta:rnd(snapCalcNet-sNet),
        detail:'snapCalcNet='+snapCalcNet+' snapshotNet='+sNet });
    }
  }

  // Rule 3: canceled/push tickets contribute zero to profit
  // (enforced by calcTicketTotals — tested via ticket input)

  return {
    status: mismatches.length === 0 ? 'balanced' : 'mismatch',
    mismatches
  };
}

// ── Test data ─────────────────────────────────────────────────────────────────
function t(id, status, risk, profit) {
  return { id, status, risk_amount:risk||100, potential_profit:profit||90.91 };
}
function le(id, type, amount) {
  return { id, type, amount };
}

// ── Ticket totals ─────────────────────────────────────────────────────────────
console.log('\n── Ticket totals ──');

test('empty tickets → zero totals', function() {
  var r = calcTicketTotals([]);
  assertEq(r.activeRisk, 0); assertEq(r.profit, 0);
});
test('active ticket → openRisk only', function() {
  var r = calcTicketTotals([t('T1','active',100,90)]);
  assertEq(r.activeRisk, 100); assertEq(r.profit, 0);
});
test('lost ticket → settledGain (host kept risk)', function() {
  var r = calcTicketTotals([t('T1','lost',100,90)]);
  assertEq(r.settledGain, 100); assertEq(r.profit, 100);
});
test('won ticket → settledLoss (host paid profit)', function() {
  var r = calcTicketTotals([t('T1','won',100,90.91)]);
  assertApprox(r.settledLoss, 90.91); assertApprox(r.profit, -90.91);
});
test('canceled/push → zero everywhere', function() {
  var r = calcTicketTotals([t('T1','canceled',100,90), t('T2','push',50,45)]);
  assertEq(r.activeRisk, 0); assertEq(r.profit, 0);
  assertEq(r.settledGain, 0); assertEq(r.settledLoss, 0);
});
test('mixed → correct net', function() {
  var tickets = [t('T1','lost',100,90),t('T2','won',50,45.45),t('T3','active',200,180),t('T4','canceled',300,270)];
  var r = calcTicketTotals(tickets);
  assertEq(r.activeRisk, 200);
  assertApprox(r.profit, 100-45.45, 'profit=54.55');
});

// ── Ledger totals ─────────────────────────────────────────────────────────────
console.log('\n── Ledger totals ──');

test('empty ledger → zero net', function() {
  var r = calcLedgerTotals([]);
  assertEq(r.net, 0);
});
test('bet_placed entries sum correctly', function() {
  var r = calcLedgerTotals([le('L1','bet_placed',-100),le('L2','bet_placed',-50)]);
  assertEq(r.bet_placed, -150);
});
test('settlement entries tracked separately', function() {
  var r = calcLedgerTotals([le('L1','settlement',-100),le('L2','settlement',50)]);
  assertEq(r.settlement, -50);
});
test('net = sum of all amounts', function() {
  var r = calcLedgerTotals([le('L1','bet_placed',-100),le('L2','bet_won',90.91),le('L3','settlement',-90.91)]);
  assertApprox(r.net, -100, 'net=-100');
});

// ── Reconciliation ────────────────────────────────────────────────────────────
console.log('\n── Reconciliation ──');

test('matching ticket profit and preview net → balanced', function() {
  var tt = { profit:54.55, activeRisk:200, settledGain:100, settledLoss:45.45 };
  var lt = calcLedgerTotals([]);
  var pt = { playersOwe:100, hostOwes:45.45, net:54.55 };
  var r  = reconcile(tt, lt, pt, null);
  assertEq(r.status, 'balanced', 'balanced: '+JSON.stringify(r.mismatches));
});

test('ticket profit ≠ preview net → mismatch', function() {
  var tt = { profit:100, activeRisk:0, settledGain:100, settledLoss:0 };
  var pt = { playersOwe:50, hostOwes:0, net:50 }; // preview says 50, tickets say 100
  var r  = reconcile(tt, calcLedgerTotals([]), pt, null);
  assertEq(r.status, 'mismatch', 'mismatch detected');
  assertEq(r.mismatches.length, 1, '1 mismatch');
  assertEq(r.mismatches[0].category, 'ticket_vs_preview', 'category');
  assertApprox(r.mismatches[0].delta, 50, 'delta=50');
});

test('snapshot internal consistency passes', function() {
  var snap = { playersOwe:100, hostOwes:45.45, net:54.55 };
  var r = reconcile({ profit:54.55 }, {}, { net:54.55 }, snap);
  assertEq(r.status, 'balanced', 'balanced with consistent snapshot');
});

test('snapshot internal mismatch detected', function() {
  var badSnap = { playersOwe:100, hostOwes:45.45, net:99 }; // net should be 54.55
  var r = reconcile({ profit:54.55 }, {}, { net:54.55 }, badSnap);
  assert(r.mismatches.some(function(m){ return m.category==='snapshot_internal'; }), 'snapshot mismatch');
});

test('no preview → no ticket_vs_preview check', function() {
  var tt = { profit:100 };
  var r  = reconcile(tt, {}, null, null); // no preview
  assertEq(r.status, 'balanced', 'no preview = skip check');
});

// ── Active ticket open risk ───────────────────────────────────────────────────
console.log('\n── Active ticket isolation ──');

test('active tickets never appear in profit', function() {
  var tickets = Array.from({length:5}, function(_,i){ return t('T'+i,'active',100,90); });
  var r = calcTicketTotals(tickets);
  assertEq(r.profit, 0, 'active tickets = zero profit');
  assertEq(r.activeRisk, 500, 'activeRisk=500');
});

test('reconcile: active-only club is balanced', function() {
  var tt = { profit:0, activeRisk:500 };
  var pt = { playersOwe:0, hostOwes:0, net:0 };
  var r  = reconcile(tt, {}, pt, null);
  assertEq(r.status, 'balanced', 'active-only = balanced');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Reconciliation tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ RECONCILIATION TESTS FAILED'); process.exit(1); }
else console.log('✅ All reconciliation rules verified');
