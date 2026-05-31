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

// RA-2: UPPER_CASE canonical ledger event_type → snake_case reconciliation key
var LEDGER_TYPE_MAP = {
  'BET_PLACED':          'bet_placed',
  'BET_CANCELED_REFUND': 'bet_canceled',
  'BET_GRADED_WIN':      'bet_won',
  'BET_GRADED_LOSS':     'bet_lost',
  'BET_GRADED_PUSH':     'bet_push',
  'SETTLEMENT_APPLIED':  'settlement',
  'WEEKLY_ROLLOVER':     'weekly_rollover',
  'BALANCE_ADJUSTMENT':  'admin_adjustment'
};

function calcTicketTotals(tickets) {
  var activeRisk=0, settledGain=0, settledLoss=0, wonPayout=0, totalStaked=0;
  (tickets||[]).forEach(function(t) {
    var s=t.status.toLowerCase(), r=parseFloat(t.risk_amount)||0, p=parseFloat(t.potential_profit)||0;
    if (s==='voided') return;         // voided without placement — no ledger entry expected
    totalStaked += r;                 // includes canceled + push (they have BET_PLACED entries)
    if (s==='canceled'||s==='push'||s==='pushed') return;
    if (s==='active'||s==='open')  activeRisk  += r;
    else if (s==='lost')           settledGain += r;  // host kept stake
    else if (s==='won') {
      settledLoss += p;               // host paid profit (host net loss)
      wonPayout   += (r + p);        // total credited back to player (Rule 3 cross-check)
    }
  });
  return {
    activeRisk:rnd(activeRisk), settledGain:rnd(settledGain), settledLoss:rnd(settledLoss),
    profit:rnd(settledGain-settledLoss), wonPayout:rnd(wonPayout), totalStaked:rnd(totalStaked)
  };
}

// RA-2: handles both ledger_entries (snake_case type, signed amount) and
// canonical ledger (UPPER_CASE event_type, positive amount + direction field).
// Returns per-category signed totals, plus placedDebits and winCredits for
// Rule 3 / Rule 4 cross-checks.
function calcLedgerTotals(ledger) {
  var totals = {
    bet_placed:0, bet_won:0, bet_lost:0, bet_push:0,
    bet_canceled:0, settlement:0, admin_adjustment:0, weekly_rollover:0
  };
  var placedDebits=0, winCredits=0;

  (ledger||[]).forEach(function(e) {
    var rawType  = e.event_type || e.type || '';
    var normType = LEDGER_TYPE_MAP[rawType] || rawType;
    var amt      = parseFloat(e.amount) || 0;

    // Canonical ledger has a direction field; ledger_entries uses signed amounts
    var signed;
    if (e.direction) {
      signed = e.direction === 'credit' ? amt : e.direction === 'debit' ? -amt : 0;
    } else {
      signed = amt;
    }

    if (totals[normType] !== undefined) totals[normType] += signed;
    else totals.admin_adjustment += signed;

    // Cross-check accumulators (unsigned, regardless of how sign was conveyed)
    if (normType === 'bet_placed') placedDebits += Math.abs(amt);
    if (normType === 'bet_won')    winCredits   += (e.direction === 'credit' ? amt : Math.max(0, signed));
  });

  var net = Object.values(totals).reduce(function(s,v){ return s+v; }, 0);
  return Object.assign(
    { net:rnd(net), placedDebits:rnd(placedDebits), winCredits:rnd(winCredits) },
    Object.fromEntries(Object.entries(totals).map(function(kv){ return [kv[0], rnd(kv[1])]; }))
  );
}

// RA-3: reconcile now performs four rules, including real ledger cross-checks.
function reconcile(ticketTotals, ledgerTotals, previewTotals, latestSnapshot) {
  var mismatches = [];
  var hasLedger  = ledgerTotals && ledgerTotals.placedDebits !== undefined;

  // Rule 1: ticket-derived profit vs settlement preview net
  var tProfit = ticketTotals.profit;
  var pNet    = previewTotals ? previewTotals.net : null;
  if (pNet !== null && Math.abs(tProfit - pNet) > 0.02) {
    mismatches.push({ category:'ticket_vs_preview', delta:rnd(tProfit-pNet),
      detail:'ticketProfit='+tProfit+' previewNet='+pNet });
  }

  // Rule 2: snapshot internal consistency (playersOwe - hostOwes === net)
  if (latestSnapshot && previewTotals) {
    var snapCalcNet = rnd((latestSnapshot.playersOwe||0) - (latestSnapshot.hostOwes||0));
    var sNet = parseFloat(latestSnapshot.net)||0;
    if (Math.abs(snapCalcNet - sNet) > 0.02) {
      mismatches.push({ category:'snapshot_internal', delta:rnd(snapCalcNet-sNet),
        detail:'snapCalcNet='+snapCalcNet+' snapshotNet='+sNet });
    }
  }

  // Rule 3: ledger win credits should equal ticket won payouts (risk + profit)
  // Catches grading bugs where player was credited wrong amount
  if (hasLedger && ledgerTotals.winCredits > 0 && ticketTotals.wonPayout !== undefined) {
    if (Math.abs(ledgerTotals.winCredits - ticketTotals.wonPayout) > 0.02) {
      mismatches.push({ category:'ledger_wins_vs_ticket_payouts',
        delta: rnd(ledgerTotals.winCredits - ticketTotals.wonPayout),
        detail: 'ledgerWinCredits='+ledgerTotals.winCredits+' wonPayout='+ticketTotals.wonPayout });
    }
  }

  // Rule 4: ledger placement debits should equal total risk staked
  // Catches phantom placements, orphan tickets, or missing ledger entries
  if (hasLedger && ledgerTotals.placedDebits > 0 && ticketTotals.totalStaked !== undefined) {
    if (Math.abs(ledgerTotals.placedDebits - ticketTotals.totalStaked) > 0.02) {
      mismatches.push({ category:'ledger_placements_vs_ticket_stakes',
        delta: rnd(ledgerTotals.placedDebits - ticketTotals.totalStaked),
        detail: 'ledgerPlacedDebits='+ledgerTotals.placedDebits+' totalStaked='+ticketTotals.totalStaked });
    }
  }

  return { status: mismatches.length === 0 ? 'balanced' : 'mismatch', mismatches };
}

// ── Test data ─────────────────────────────────────────────────────────────────
function t(id, status, risk, profit) {
  return { id, status, risk_amount:risk||100, potential_profit:profit||90.91 };
}
// snake_case ledger entry (ledger_entries table style)
function le(id, type, amount) {
  return { id, type, amount };
}
// UPPER_CASE canonical ledger entry (ledger table style)
function cle(id, eventType, amount, direction) {
  return { ledger_id:id, event_type:eventType, amount, direction: direction||'neutral' };
}

// ── Ticket totals ─────────────────────────────────────────────────────────────
console.log('\n── Ticket totals ──');

test('empty tickets → zero totals', function() {
  var r = calcTicketTotals([]);
  assertEq(r.activeRisk, 0); assertEq(r.profit, 0);
  assertEq(r.totalStaked, 0); assertEq(r.wonPayout, 0);
});
test('active ticket → openRisk only', function() {
  var r = calcTicketTotals([t('T1','active',100,90)]);
  assertEq(r.activeRisk, 100); assertEq(r.profit, 0);
  assertEq(r.totalStaked, 100); assertEq(r.wonPayout, 0);
});
test('lost ticket → settledGain (host kept risk)', function() {
  var r = calcTicketTotals([t('T1','lost',100,90)]);
  assertEq(r.settledGain, 100); assertEq(r.profit, 100);
  assertEq(r.totalStaked, 100); assertEq(r.wonPayout, 0);
});
test('won ticket → settledLoss + wonPayout', function() {
  var r = calcTicketTotals([t('T1','won',100,90.91)]);
  assertApprox(r.settledLoss, 90.91, 'settledLoss');
  assertApprox(r.profit, -90.91, 'profit');
  assertApprox(r.wonPayout, 190.91, 'wonPayout=risk+profit');
  assertEq(r.totalStaked, 100);
});
test('canceled/push → zero in profit but counted in totalStaked', function() {
  var r = calcTicketTotals([t('T1','canceled',100,90), t('T2','push',50,45)]);
  assertEq(r.activeRisk, 0); assertEq(r.profit, 0);
  assertEq(r.settledGain, 0); assertEq(r.settledLoss, 0);
  assertEq(r.totalStaked, 150, 'canceled+push stakes appear in totalStaked');
});
test('voided → excluded entirely (no BET_PLACED expected)', function() {
  var r = calcTicketTotals([t('T1','voided',100,90)]);
  assertEq(r.totalStaked, 0, 'voided not staked');
});
test('mixed → correct net', function() {
  var tickets = [t('T1','lost',100,90),t('T2','won',50,45.45),t('T3','active',200,180),t('T4','canceled',300,270)];
  var r = calcTicketTotals(tickets);
  assertEq(r.activeRisk, 200);
  assertApprox(r.profit, 100-45.45, 'profit=54.55');
  assertApprox(r.wonPayout, 50+45.45, 'wonPayout=95.45');
  assertEq(r.totalStaked, 650, 'lost+won+active+canceled all staked');
});

// ── Ledger totals — snake_case (ledger_entries) ───────────────────────────────
console.log('\n── Ledger totals (snake_case) ──');

test('empty ledger → zero net', function() {
  var r = calcLedgerTotals([]);
  assertEq(r.net, 0); assertEq(r.placedDebits, 0); assertEq(r.winCredits, 0);
});
test('bet_placed entries sum correctly', function() {
  var r = calcLedgerTotals([le('L1','bet_placed',-100),le('L2','bet_placed',-50)]);
  assertEq(r.bet_placed, -150);
  assertEq(r.placedDebits, 150, 'placedDebits = abs sum');
});
test('settlement entries tracked separately', function() {
  var r = calcLedgerTotals([le('L1','settlement',-100),le('L2','settlement',50)]);
  assertEq(r.settlement, -50);
});
test('net = sum of all amounts', function() {
  var r = calcLedgerTotals([le('L1','bet_placed',-100),le('L2','bet_won',90.91),le('L3','settlement',-90.91)]);
  assertApprox(r.net, -100, 'net=-100');
  assertApprox(r.winCredits, 90.91, 'winCredits from positive bet_won');
});

// ── Ledger totals — UPPER_CASE canonical (ledger table) ── RA-2 ───────────────
console.log('\n── Ledger totals (UPPER_CASE canonical, RA-2) ──');

test('BET_PLACED → bet_placed with debit direction', function() {
  var r = calcLedgerTotals([cle('L1','BET_PLACED',100,'debit')]);
  assertEq(r.bet_placed, -100, 'debit = negative signed');
  assertEq(r.placedDebits, 100, 'placedDebits = 100');
});
test('BET_GRADED_WIN → bet_won with credit direction', function() {
  var r = calcLedgerTotals([cle('L1','BET_GRADED_WIN',190.91,'credit')]);
  assertEq(r.bet_won, 190.91, 'credit = positive');
  assertEq(r.winCredits, 190.91);
});
test('BET_GRADED_LOSS → bet_lost with neutral direction', function() {
  var r = calcLedgerTotals([cle('L1','BET_GRADED_LOSS',100,'neutral')]);
  assertEq(r.bet_lost, 0, 'neutral = 0 signed');
  assertEq(r.winCredits, 0);
});
test('BET_GRADED_PUSH → bet_push credit', function() {
  var r = calcLedgerTotals([cle('L1','BET_GRADED_PUSH',100,'credit')]);
  assertEq(r.bet_push, 100);
});
test('BET_CANCELED_REFUND → bet_canceled credit', function() {
  var r = calcLedgerTotals([cle('L1','BET_CANCELED_REFUND',100,'credit')]);
  assertEq(r.bet_canceled, 100);
});
test('SETTLEMENT_APPLIED → settlement debit', function() {
  var r = calcLedgerTotals([cle('L1','SETTLEMENT_APPLIED',50,'debit')]);
  assertEq(r.settlement, -50);
});
test('mixed canonical entries → correct net', function() {
  // place 100, win 190.91 (100 stake + 90.91 profit), settle 90.91 from player
  var r = calcLedgerTotals([
    cle('L1','BET_PLACED',100,'debit'),
    cle('L2','BET_GRADED_WIN',190.91,'credit'),
    cle('L3','SETTLEMENT_APPLIED',90.91,'debit')
  ]);
  assertApprox(r.net, -100 + 190.91 - 90.91, 'net=0');
  assertEq(r.placedDebits, 100);
  assertEq(r.winCredits, 190.91);
});
test('both snake_case and UPPER_CASE in same array', function() {
  var r = calcLedgerTotals([
    le('L1','bet_placed',-100),
    cle('L2','BET_GRADED_WIN',190.91,'credit')
  ]);
  assertEq(r.bet_placed, -100);
  assertEq(r.bet_won, 190.91);
  assertEq(r.placedDebits, 100);
  assertEq(r.winCredits, 190.91);
});

// ── Reconciliation — existing rules ──────────────────────────────────────────
console.log('\n── Reconciliation (existing rules) ──');

test('matching ticket profit and preview net → balanced', function() {
  var tt = { profit:54.55, activeRisk:200, settledGain:100, settledLoss:45.45 };
  var lt = calcLedgerTotals([]);
  var pt = { playersOwe:100, hostOwes:45.45, net:54.55 };
  var r  = reconcile(tt, lt, pt, null);
  assertEq(r.status, 'balanced', JSON.stringify(r.mismatches));
});
test('ticket profit ≠ preview net → mismatch', function() {
  var tt = { profit:100, activeRisk:0, settledGain:100, settledLoss:0 };
  var pt = { playersOwe:50, hostOwes:0, net:50 };
  var r  = reconcile(tt, calcLedgerTotals([]), pt, null);
  assertEq(r.status, 'mismatch');
  assertEq(r.mismatches.length, 1);
  assertEq(r.mismatches[0].category, 'ticket_vs_preview');
  assertApprox(r.mismatches[0].delta, 50);
});
test('snapshot internal consistency passes', function() {
  var snap = { playersOwe:100, hostOwes:45.45, net:54.55 };
  var r = reconcile({ profit:54.55 }, {}, { net:54.55 }, snap);
  assertEq(r.status, 'balanced');
});
test('snapshot internal mismatch detected', function() {
  var badSnap = { playersOwe:100, hostOwes:45.45, net:99 };
  var r = reconcile({ profit:54.55 }, {}, { net:54.55 }, badSnap);
  assert(r.mismatches.some(function(m){ return m.category==='snapshot_internal'; }));
});
test('no preview → no ticket_vs_preview check', function() {
  var r = reconcile({ profit:100 }, {}, null, null);
  assertEq(r.status, 'balanced');
});

// ── Reconciliation — Rule 3: ledger wins vs ticket payouts (RA-3) ─────────────
console.log('\n── Reconciliation Rule 3: ledger wins vs ticket payouts (RA-3) ──');

test('ledger win credits match ticket wonPayout → balanced', function() {
  // won ticket: risk=100, profit=90.91 → player gets back 190.91
  var tt = calcTicketTotals([t('T1','won',100,90.91)]);
  var lt = calcLedgerTotals([cle('L1','BET_GRADED_WIN',190.91,'credit')]);
  var r  = reconcile(tt, lt, null, null);
  assertEq(r.status, 'balanced', JSON.stringify(r.mismatches));
});
test('ledger win credits exceed ticket wonPayout → mismatch (overpaid)', function() {
  var tt = calcTicketTotals([t('T1','won',100,90.91)]);
  var lt = calcLedgerTotals([cle('L1','BET_GRADED_WIN',250,'credit')]); // should be 190.91
  var r  = reconcile(tt, lt, null, null);
  assertEq(r.status, 'mismatch');
  assert(r.mismatches.some(function(m){ return m.category==='ledger_wins_vs_ticket_payouts'; }));
  assertApprox(r.mismatches.find(function(m){ return m.category==='ledger_wins_vs_ticket_payouts'; }).delta, 250-190.91);
});
test('ledger win credits below ticket wonPayout → mismatch (underpaid)', function() {
  var tt = calcTicketTotals([t('T1','won',100,90.91)]);
  var lt = calcLedgerTotals([cle('L1','BET_GRADED_WIN',100,'credit')]); // should be 190.91
  var r  = reconcile(tt, lt, null, null);
  assertEq(r.status, 'mismatch');
  assert(r.mismatches.some(function(m){ return m.category==='ledger_wins_vs_ticket_payouts'; }));
});
test('no ledger (empty object) → Rule 3 skipped', function() {
  var tt = calcTicketTotals([t('T1','won',100,90.91)]);
  var r  = reconcile(tt, {}, null, null); // {} has no placedDebits field
  assertEq(r.status, 'balanced', 'no ledger data = skip cross-checks');
});
test('zero winCredits (no wins graded yet) → Rule 3 skipped', function() {
  var tt = calcTicketTotals([t('T1','active',100,90)]);
  var lt = calcLedgerTotals([cle('L1','BET_PLACED',100,'debit')]);
  var r  = reconcile(tt, lt, null, null);
  assertEq(r.status, 'balanced');
});

// ── Reconciliation — Rule 4: ledger placements vs ticket stakes (RA-3) ────────
console.log('\n── Reconciliation Rule 4: ledger placements vs ticket stakes (RA-3) ──');

test('ledger placed debits match ticket totalStaked → balanced', function() {
  var tt = calcTicketTotals([t('T1','active',100,90), t('T2','lost',200,180)]);
  var lt = calcLedgerTotals([
    cle('L1','BET_PLACED',100,'debit'),
    cle('L2','BET_PLACED',200,'debit')
  ]);
  var r  = reconcile(tt, lt, null, null);
  assertEq(r.status, 'balanced', JSON.stringify(r.mismatches));
});
test('orphan ticket (no ledger entry) → mismatch', function() {
  // 2 tickets staked but only 1 has a ledger entry
  var tt = calcTicketTotals([t('T1','active',100,90), t('T2','active',100,90)]);
  var lt = calcLedgerTotals([cle('L1','BET_PLACED',100,'debit')]); // only 1 placement
  var r  = reconcile(tt, lt, null, null);
  assertEq(r.status, 'mismatch');
  assert(r.mismatches.some(function(m){ return m.category==='ledger_placements_vs_ticket_stakes'; }));
  assertApprox(r.mismatches.find(function(m){ return m.category==='ledger_placements_vs_ticket_stakes'; }).delta, -100);
});
test('canceled ticket stake still appears in totalStaked', function() {
  var tt = calcTicketTotals([t('T1','canceled',100,90)]);
  var lt = calcLedgerTotals([
    cle('L1','BET_PLACED',100,'debit'),
    cle('L2','BET_CANCELED_REFUND',100,'credit')
  ]);
  var r  = reconcile(tt, lt, null, null);
  assertEq(r.status, 'balanced', 'canceled stake+refund = balanced');
});
test('phantom ledger placement with no ticket → mismatch', function() {
  var tt = calcTicketTotals([]); // no tickets
  var lt = calcLedgerTotals([cle('L1','BET_PLACED',100,'debit')]); // stray debit
  var r  = reconcile(tt, lt, null, null);
  assertEq(r.status, 'mismatch');
  assert(r.mismatches.some(function(m){ return m.category==='ledger_placements_vs_ticket_stakes'; }));
});

// ── Active ticket open risk ───────────────────────────────────────────────────
console.log('\n── Active ticket isolation ──');

test('active tickets never appear in profit', function() {
  var tickets = Array.from({length:5}, function(_,i){ return t('T'+i,'active',100,90); });
  var r = calcTicketTotals(tickets);
  assertEq(r.profit, 0, 'active tickets = zero profit');
  assertEq(r.activeRisk, 500, 'activeRisk=500');
  assertEq(r.totalStaked, 500);
});
test('reconcile: active-only club is balanced', function() {
  var tt = calcTicketTotals([t('T1','active',100,90), t('T2','active',200,180)]);
  var lt = calcLedgerTotals([cle('L1','BET_PLACED',100,'debit'), cle('L2','BET_PLACED',200,'debit')]);
  var pt = { playersOwe:0, hostOwes:0, net:0 };
  var r  = reconcile(tt, lt, pt, null);
  assertEq(r.status, 'balanced', JSON.stringify(r.mismatches));
});


// ── Bug #11 regression: real ledger cross-check (ticket net vs canonical ledger net) ──
console.log('\n── Bug #11: settlement-reconciliation ledger cross-check ──');

// Mirror the fixed backend cross-check logic.
// ticketNetByPlayer: from tickets (won=+profit, lost=-risk, skip canceled/voided/push/active/open)
// ledgerNetByPlayer: from canonical ledger (credit=+, debit=-, only settlement event types)
// Returns array of { playerId, ticketNet, ledgerNet, delta } for delta > 0.02

var SETTLEMENT_CREDIT_EVENTS = new Set(['BET_GRADED_WIN','BET_GRADED_PUSH','BET_CANCELED_REFUND','SETTLEMENT_APPLIED']);
var SETTLEMENT_DEBIT_EVENTS  = new Set(['BET_PLACED','BET_GRADED_LOSS']);

function buildTicketNetByPlayer(tickets) {
  var map = {};
  (tickets||[]).forEach(function(t) {
    var s = (t.status||'').toLowerCase();
    if (s==='canceled'||s==='voided'||s==='push'||s==='pushed'||s==='active'||s==='open') return;
    var pid = t.player_id||'unknown';
    if (!map[pid]) map[pid] = 0;
    if (s==='won')  map[pid] += parseFloat(t.potential_profit)||0;
    if (s==='lost') map[pid] -= parseFloat(t.risk_amount)||0;
  });
  return map;
}

function buildLedgerNetByPlayer(ledgerRows) {
  var map = {};
  (ledgerRows||[]).forEach(function(r) {
    var et = (r.event_type||'').toUpperCase();
    if (!SETTLEMENT_CREDIT_EVENTS.has(et) && !SETTLEMENT_DEBIT_EVENTS.has(et)) return;
    var pid = r.player_id||'unknown';
    if (!map[pid]) map[pid] = 0;
    var amt = parseFloat(r.amount||0);
    if (r.direction==='credit') map[pid] += amt;
    else if (r.direction==='debit') map[pid] -= amt;
  });
  return map;
}

function runLedgerXCheck(tickets, ledgerRows) {
  var rnd = function(v){ return Math.round((isNaN(v)?0:v)*100)/100; };
  var ticketNet = buildTicketNetByPlayer(tickets);
  var ledgerNet = buildLedgerNetByPlayer(ledgerRows);
  var allPids = new Set(Object.keys(ticketNet).concat(Object.keys(ledgerNet)));
  var mismatches = [];
  allPids.forEach(function(pid) {
    var tNet = rnd(ticketNet[pid]||0);
    var lNet = rnd(ledgerNet[pid]||0);
    var delta = rnd(tNet - lNet);
    if (Math.abs(delta) > 0.02) {
      mismatches.push({ playerId:pid, ticketNet:tNet, ledgerNet:lNet, delta:delta });
    }
  });
  return { mismatches, status: mismatches.length===0 ? 'balanced' : 'mismatch' };
}

// ── Test data helpers ─────────────────────────────────────────────────────────
var CLUB = 'club-uuid-test-11';

function ticket(pid, status, risk, profit, id) {
  return { id:id||('T_'+pid+'_'+status), player_id:pid, club_id:CLUB,
           status:status, risk_amount:risk, potential_profit:profit };
}

function ledger(pid, eventType, direction, amount, id) {
  return { ledger_id:id||('LE_'+pid+'_'+eventType), player_id:pid, club_id:CLUB,
           event_type:eventType, direction:direction, amount:amount };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('Bug #11: balanced tickets+ledger returns ok/balanced', function() {
  // P1 won $100 profit → ticket: +100; ledger: BET_GRADED_WIN credit 100
  var tickets = [ ticket('P1','won',80,100) ];
  var rows    = [ ledger('P1','BET_GRADED_WIN','credit',100) ];
  var r = runLedgerXCheck(tickets, rows);
  assertEq(r.status, 'balanced', 'should be balanced');
  assertEq(r.mismatches.length, 0, '0 mismatches');
});

test('Bug #11: missing ledger entry is detected', function() {
  // Ticket shows P1 won $200 but no ledger entry exists
  var tickets = [ ticket('P1','won',150,200) ];
  var rows    = []; // no ledger
  var r = runLedgerXCheck(tickets, rows);
  assertEq(r.status, 'mismatch', 'missing ledger should be mismatch');
  assertEq(r.mismatches.length, 1, '1 mismatch');
  assertEq(r.mismatches[0].playerId, 'P1', 'mismatch for P1');
  assertApprox(r.mismatches[0].ticketNet,  200, 'ticketNet=200');
  assertApprox(r.mismatches[0].ledgerNet,    0, 'ledgerNet=0');
  assertApprox(r.mismatches[0].delta,      200, 'delta=200');
});

test('Bug #11: extra ledger entry (no matching ticket) is detected', function() {
  // Ledger has a BET_GRADED_WIN for P2 but no won ticket exists
  var tickets = [];
  var rows    = [ ledger('P2','BET_GRADED_WIN','credit',150) ];
  var r = runLedgerXCheck(tickets, rows);
  assertEq(r.status, 'mismatch', 'extra ledger entry should be mismatch');
  assertEq(r.mismatches[0].playerId, 'P2', 'mismatch for P2');
  assertApprox(r.mismatches[0].ticketNet,    0, 'ticketNet=0');
  assertApprox(r.mismatches[0].ledgerNet,  150, 'ledgerNet=150');
  assertApprox(r.mismatches[0].delta,     -150, 'delta=-150');
});

test('Bug #11: wrong amount ledger entry is detected', function() {
  // Ticket won $100 but ledger only credited $60
  var tickets = [ ticket('P3','won',80,100) ];
  var rows    = [ ledger('P3','BET_GRADED_WIN','credit',60) ];
  var r = runLedgerXCheck(tickets, rows);
  assertEq(r.status, 'mismatch', 'wrong amount should be mismatch');
  assertApprox(r.mismatches[0].ticketNet, 100, 'ticketNet=100');
  assertApprox(r.mismatches[0].ledgerNet,  60, 'ledgerNet=60');
  assertApprox(r.mismatches[0].delta,      40, 'delta=40');
});

test('Bug #11: canceled tickets excluded from ticket-side net', function() {
  // Canceled ticket with large risk should have zero contribution to ticketNet
  var tickets = [
    ticket('P4','canceled',500,900),  // must be excluded
    ticket('P4','won',80,100)         // only this counts
  ];
  var rows = [ ledger('P4','BET_GRADED_WIN','credit',100) ];
  var r = runLedgerXCheck(tickets, rows);
  assertEq(r.status, 'balanced', 'canceled ticket excluded → balanced');
});

test('Bug #11: voided and push tickets excluded', function() {
  var tickets = [
    ticket('P5','voided',200,300),
    ticket('P5','push',100,100),
    ticket('P5','pushed',100,100),
    ticket('P5','lost',50,0)      // only this counts: -50
  ];
  var rows = [ ledger('P5','BET_PLACED','debit',50) ];  // debit=loss risk at placement
  var r = runLedgerXCheck(tickets, rows);
  // ticketNet[P5] = -50; ledgerNet[P5] = -50 (BET_PLACED debit)
  assertEq(r.status, 'balanced', 'voided/push excluded → balanced');
});

test('Bug #11: active/open tickets excluded from ticket-side net', function() {
  var tickets = [
    ticket('P6','active',200,360),   // excluded — still in play
    ticket('P6','won',50,50)         // only settled counts
  ];
  var rows = [ ledger('P6','BET_GRADED_WIN','credit',50) ];
  var r = runLedgerXCheck(tickets, rows);
  assertEq(r.status, 'balanced', 'active ticket excluded → balanced');
});

test('Bug #11: non-settlement ledger event types excluded from ledger net', function() {
  // WEEKLY_ROLLOVER and BALANCE_ADJUSTMENT are not settlement events — must not skew comparison
  var tickets = [ ticket('P7','won',80,100) ];
  var rows = [
    ledger('P7','BET_GRADED_WIN','credit',100),
    ledger('P7','WEEKLY_ROLLOVER','neutral',999),   // must be excluded
    ledger('P7','BALANCE_ADJUSTMENT','credit',500), // must be excluded
  ];
  var r = runLedgerXCheck(tickets, rows);
  assertEq(r.status, 'balanced', 'non-settlement ledger events excluded → balanced');
});

test('Bug #11: multi-player — only diverging player flagged', function() {
  var tickets = [
    ticket('PA','won',80,100),
    ticket('PB','lost',50,0),
    ticket('PC','won',200,200)
  ];
  var rows = [
    ledger('PA','BET_GRADED_WIN','credit',100),  // PA balanced
    ledger('PB','BET_PLACED','debit',50),        // PB balanced
    ledger('PC','BET_GRADED_WIN','credit',150),  // PC mismatch: ticket=200, ledger=150
  ];
  var r = runLedgerXCheck(tickets, rows);
  assertEq(r.status, 'mismatch', 'one diverging player = mismatch');
  assertEq(r.mismatches.length, 1, 'only 1 mismatch');
  assertEq(r.mismatches[0].playerId, 'PC', 'mismatch for PC');
  assertApprox(r.mismatches[0].delta, 50, 'delta=50 (200-150)');
});

test('Bug #11: within 0.02 tolerance is not flagged as mismatch', function() {
  // 0.01 rounding difference should not trigger alert
  var tickets = [ ticket('PD','won',80,100.01) ];
  var rows    = [ ledger('PD','BET_GRADED_WIN','credit',100.00) ];
  var r = runLedgerXCheck(tickets, rows);
  assertEq(r.status, 'balanced', '0.01 delta within tolerance → balanced');
});

test('Bug #11: old code would show balanced even with mismatch (regression proof)', function() {
  // OLD CODE: compared ticketTotals.profit vs previewTotals.net
  // Both were derived from the SAME tickets array → always matched.
  // This test proves the old approach was blind to ledger divergence.
  var tickets = [ ticket('PE','won',80,200) ];
  // Old code: ticketTotals.profit = +200, previewTotals.net = +200 → "balanced"
  // Even though ledger has wrong amount:
  var rows = [ ledger('PE','BET_GRADED_WIN','credit',50) ]; // WRONG: should be 200
  var r = runLedgerXCheck(tickets, rows);
  // New code catches this
  assertEq(r.status, 'mismatch', 'new code detects ledger divergence');
  assertApprox(r.mismatches[0].delta, 150, 'delta=150 (200-50)');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Reconciliation tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ RECONCILIATION TESTS FAILED'); process.exit(1); }
else console.log('✅ All reconciliation rules verified');
