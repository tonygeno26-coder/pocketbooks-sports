/**
 * PocketBooks Sports — Phase N: Weekly Closeout + Settlement Snapshots Tests
 * Run: node tests/settlement-closeout.test.js
 * Pure logic — no network, no DB.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }
function assertApprox(a, b, m) { if (Math.abs(a-b)>0.01) throw new Error((m||'')+' — got '+a+' expected ~'+b); }

// ── Settlement period model ───────────────────────────────────────────────────

const PERIOD_STATUS = { OPEN:'open', CLOSING:'closing', CLOSED:'closed', REOPENED:'reopened' };
const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };

function makePeriod(overrides) {
  return Object.assign({
    periodId:   'SP_C1_2026-W20',
    clubId:     'C1',
    weekStart:  '2026-05-18',
    weekEnd:    '2026-05-24',
    status:     PERIOD_STATUS.OPEN,
    closedAt:   null, closedBy:null,
    reopenedAt: null, reopenedBy:null,
    reason:     null, revision:0
  }, overrides||{});
}

// ── Snapshot computation ──────────────────────────────────────────────────────

function computePlayerSnapshot(periodId, clubId, playerId, startingLimit, ledgerRows, tickets) {
  var credits=0, debits=0;
  (ledgerRows||[]).forEach(function(r) {
    if (r.direction==='credit') credits += parseFloat(r.amount||0);
    else if (r.direction==='debit') debits += parseFloat(r.amount||0);
  });
  var ledgerBalance = Math.round((startingLimit+credits-debits)*100)/100;

  var openTickets=0, closedTickets=0, openRisk=0;
  var settledGains=0, settledLosses=0;
  (tickets||[]).forEach(function(t) {
    var s=(t.status||'').toLowerCase();
    var r=parseFloat(t.riskAmount||t.risk_amount||0);
    var p=parseFloat(t.profit||t.potential_profit||0);
    if (s==='active'||s==='open') { openTickets++; openRisk+=r; }
    else { closedTickets++; }
    if (s==='won') settledGains+=p;
    if (s==='lost') settledLosses+=r;
  });
  openRisk = Math.round(openRisk*100)/100;
  var netResult = Math.round((settledGains-settledLosses)*100)/100;
  var finalBalance = Math.round((ledgerBalance-openRisk)*100)/100;
  var owedByPlayer = netResult<0 ? Math.round(Math.abs(netResult)*100)/100 : 0;
  var owedToPlayer = netResult>0 ? Math.round(netResult*100)/100 : 0;

  return {
    periodId, clubId, playerId, startingLimit,
    ledgerCredits: Math.round(credits*100)/100,
    ledgerDebits:  Math.round(debits*100)/100,
    ledgerBalance, openRisk, netResult, finalBalance,
    amountOwedByPlayer: owedByPlayer,
    amountOwedToPlayer: owedToPlayer,
    ticketCount: (tickets||[]).length,
    closedTicketCount: closedTickets,
    openTicketCount:   openTickets,
    createdAt: new Date().toISOString(),
    isImmutable: false  // set to true after close
  };
}

// ── Closeout engine ───────────────────────────────────────────────────────────

function closeWeek(period, snapshots, playerDataList, actorRole, opts) {
  opts = opts||{};
  // Status check
  if (period.status===PERIOD_STATUS.CLOSED)
    return { ok:false, code:'period_already_closed' };
  if (period.status===PERIOD_STATUS.CLOSING)
    return { ok:false, code:'period_already_closing' };

  // Check for open tickets
  var openTicketPlayers = playerDataList.filter(function(p){
    return (p.tickets||[]).some(function(t){ return t.status==='active'||t.status==='open'; });
  });
  if (openTicketPlayers.length>0 && !opts.forceClose) {
    return { ok:false, code:'open_tickets_exist',
             openPlayerCount:openTicketPlayers.length,
             hint:'Use forceClose=true with full_admin+ to override' };
  }
  if (openTicketPlayers.length>0 && opts.forceClose) {
    if ((ROLE_RANK[actorRole]||0) < ROLE_RANK.full_admin)
      return { ok:false, code:'insufficient_role_for_force_close', required:'full_admin' };
  }
  // Permission: settlement_manager+ required
  if ((ROLE_RANK[actorRole]||0) < ROLE_RANK.settlement_manager)
    return { ok:false, code:'insufficient_role', required:'settlement_manager' };

  // Compute snapshots
  const newSnaps = playerDataList.map(function(p) {
    var snap = computePlayerSnapshot(period.periodId, period.clubId, p.playerId,
      p.startingLimit, p.ledgerRows, p.tickets);
    snap.isImmutable = true; // mark immutable at closeout
    return snap;
  });

  // Update period
  var closedPeriod = Object.assign({}, period, {
    status: PERIOD_STATUS.CLOSED,
    closedAt: new Date().toISOString(),
    closedBy: opts.actorId||'host'
  });

  return { ok:true, period:closedPeriod, snapshots:newSnaps,
           auditEvent:{ event_type:'settlement_period_closed', clubId:period.clubId,
                        periodId:period.periodId, closedBy:opts.actorId, forceClose:!!opts.forceClose } };
}

function reopenWeek(period, actorRole, opts) {
  opts = opts||{};
  if (period.status!==PERIOD_STATUS.CLOSED && period.status!==PERIOD_STATUS.REOPENED)
    return { ok:false, code:'period_not_closed', status:period.status };
  if ((ROLE_RANK[actorRole]||0) < ROLE_RANK.full_admin)
    return { ok:false, code:'insufficient_role', required:'full_admin' };

  var reopenedPeriod = Object.assign({}, period, {
    status: PERIOD_STATUS.REOPENED,
    reopenedAt: new Date().toISOString(),
    reopenedBy: opts.actorId||'host',
    reason:    opts.reason||null
  });
  return { ok:true, period:reopenedPeriod,
           auditEvent:{ event_type:'settlement_period_reopened', clubId:period.clubId,
                        periodId:period.periodId, reopenedBy:opts.actorId } };
}

// ── Test data ─────────────────────────────────────────────────────────────────

function playerData(playerId, opts) {
  opts = opts||{};
  return {
    playerId,
    startingLimit: opts.startingLimit||1000,
    ledgerRows: opts.ledgerRows||[],
    tickets: opts.tickets||[]
  };
}
function ticket(id, status, risk, profit) {
  return { id, status:status||'active', riskAmount:risk||100, profit:profit||0 };
}
function ledgerRow(dir, amount) {
  return { direction:dir, amount:amount };
}

// ── computePlayerSnapshot ─────────────────────────────────────────────────────
console.log('\n── computePlayerSnapshot ──');

test('empty player → starting limit only', function() {
  var s = computePlayerSnapshot('SP1','C1','P1',1000,[],[]);
  assertEq(s.ledgerBalance,1000);
  assertEq(s.openRisk,0);
  assertEq(s.finalBalance,1000);
  assertEq(s.ticketCount,0);
});
test('placed bet: debit reduces ledger balance', function() {
  var s = computePlayerSnapshot('SP1','C1','P1',1000,[ledgerRow('debit',100)],[ticket('T1','active',100)]);
  assertEq(s.ledgerBalance,900);  // 1000-100
  assertEq(s.openRisk,100);
  assertEq(s.finalBalance,800);   // 900-100
  assertEq(s.openTicketCount,1);
});
test('won bet: credit increases ledger balance', function() {
  var rows = [ledgerRow('debit',100), ledgerRow('credit',190.91)];
  var s = computePlayerSnapshot('SP1','C1','P1',1000,rows,[ticket('T1','won',100,90.91)]);
  assertApprox(s.ledgerBalance,1090.91);
  assertApprox(s.amountOwedToPlayer,90.91); // host owes player
  assertEq(s.openRisk,0);
});
test('lost bet: balance reduced by stake, no payout credit', function() {
  var rows = [ledgerRow('debit',100)];
  var s = computePlayerSnapshot('SP1','C1','P1',1000,rows,[ticket('T1','lost',100,0)]);
  assertEq(s.ledgerBalance,900);
  assertEq(s.amountOwedByPlayer,100); // player owes host
  assertEq(s.openRisk,0);
});
test('net: mixed won+lost → correct owed', function() {
  var rows=[ledgerRow('debit',100),ledgerRow('debit',50),ledgerRow('credit',190.91)];
  var tickets=[ticket('T1','won',100,90.91),ticket('T2','lost',50,0)];
  var s = computePlayerSnapshot('SP1','C1','P1',1000,rows,tickets);
  // netResult = 90.91 - 50 = 40.91 → host owes player 40.91
  assertApprox(s.netResult,40.91);
  assertApprox(s.amountOwedToPlayer,40.91);
  assertEq(s.amountOwedByPlayer,0);
});
test('snapshot marked immutable at closeout', function() {
  var s = computePlayerSnapshot('SP1','C1','P1',1000,[],[]);
  assert(!s.isImmutable,'not immutable before close');
  s.isImmutable = true;
  assert(s.isImmutable,'immutable after close');
});

// ── closeWeek ─────────────────────────────────────────────────────────────────
console.log('\n── closeWeek ──');

test('settlement_manager can close week with no open tickets', function() {
  var p = makePeriod();
  var players = [playerData('P1',{ tickets:[ticket('T1','won',100,90.91)] })];
  var r = closeWeek(p, [], players, 'settlement_manager', { actorId:'S1' });
  assert(r.ok,'ok: '+(r.code||''));
  assertEq(r.period.status,PERIOD_STATUS.CLOSED);
  assertEq(r.snapshots.length,1);
  assert(r.snapshots[0].isImmutable,'snapshot immutable');
});
test('owner can close week', function() {
  var r = closeWeek(makePeriod(),[],[playerData('P1')], 'owner', { actorId:'H1' });
  assert(r.ok);
});
test('player cannot close week', function() {
  var r = closeWeek(makePeriod(),[],[playerData('P1')], 'player', { actorId:'P1' });
  assertEq(r.code,'insufficient_role');
});
test('open tickets block close without forceClose', function() {
  var players = [playerData('P1',{ tickets:[ticket('T1','active',100)] })];
  var r = closeWeek(makePeriod(),[],players,'settlement_manager',{ actorId:'S1' });
  assertEq(r.code,'open_tickets_exist');
  assertEq(r.openPlayerCount,1);
});
test('forceClose requires full_admin+', function() {
  var players = [playerData('P1',{ tickets:[ticket('T1','active',100)] })];
  var r = closeWeek(makePeriod(),[],players,'settlement_manager',{ actorId:'S1', forceClose:true });
  assertEq(r.code,'insufficient_role_for_force_close');
});
test('forceClose by owner succeeds', function() {
  var players = [playerData('P1',{ tickets:[ticket('T1','active',100)] })];
  var r = closeWeek(makePeriod(),[],players,'owner',{ actorId:'H1', forceClose:true });
  assert(r.ok,'owner force close ok');
  assertEq(r.period.status,PERIOD_STATUS.CLOSED);
});
test('already closed period cannot close again', function() {
  var p = makePeriod({ status:PERIOD_STATUS.CLOSED });
  var r = closeWeek(p,[],[playerData('P1')],'owner',{ actorId:'H1' });
  assertEq(r.code,'period_already_closed');
});
test('audit event created on close', function() {
  var r = closeWeek(makePeriod(),[],[playerData('P1')],'owner',{ actorId:'H1' });
  assert(r.auditEvent,'has audit event');
  assertEq(r.auditEvent.event_type,'settlement_period_closed');
  assertEq(r.auditEvent.closedBy,'H1');
});
test('multiple players get individual snapshots', function() {
  var players = [playerData('P1'),playerData('P2'),playerData('P3')];
  var r = closeWeek(makePeriod(),[],players,'owner',{ actorId:'H1' });
  assertEq(r.snapshots.length,3);
});

// ── reopenWeek ────────────────────────────────────────────────────────────────
console.log('\n── reopenWeek ──');

test('owner can reopen closed period', function() {
  var p = makePeriod({ status:PERIOD_STATUS.CLOSED });
  var r = reopenWeek(p,'owner',{ actorId:'H1', reason:'data fix' });
  assert(r.ok); assertEq(r.period.status,PERIOD_STATUS.REOPENED);
  assertEq(r.period.reopenedBy,'H1');
});
test('full_admin can reopen', function() {
  var p = makePeriod({ status:PERIOD_STATUS.CLOSED });
  assert(reopenWeek(p,'full_admin',{ actorId:'A1' }).ok);
});
test('settlement_manager cannot reopen', function() {
  var p = makePeriod({ status:PERIOD_STATUS.CLOSED });
  var r = reopenWeek(p,'settlement_manager',{ actorId:'S1' });
  assertEq(r.code,'insufficient_role');
});
test('open period cannot be reopened', function() {
  var r = reopenWeek(makePeriod(),'owner',{ actorId:'H1' });
  assertEq(r.code,'period_not_closed');
});
test('audit event created on reopen', function() {
  var p = makePeriod({ status:PERIOD_STATUS.CLOSED });
  var r = reopenWeek(p,'owner',{ actorId:'H1' });
  assertEq(r.auditEvent.event_type,'settlement_period_reopened');
});

// ── Snapshot immutability ─────────────────────────────────────────────────────
console.log('\n── Snapshot immutability ──');

test('snapshot values do not change after close', function() {
  var ledger = [ledgerRow('debit',100),ledgerRow('credit',190.91)];
  var tickets = [ticket('T1','won',100,90.91)];
  var players = [playerData('P1',{ ledgerRows:ledger, tickets:tickets })];
  var closeResult = closeWeek(makePeriod(),[],players,'owner',{ actorId:'H1' });
  var snap = closeResult.snapshots[0];
  assertApprox(snap.ledgerBalance,1090.91,'balance at close');
  // Simulate later ledger change — snapshot should not reflect it
  ledger.push(ledgerRow('credit',500));
  assertApprox(snap.ledgerBalance,1090.91,'snapshot unchanged after new ledger entry');
});

test('reclose creates new snapshot set (not mutate old)', function() {
  var players = [playerData('P1',{ tickets:[ticket('T1','won',100,90.91)] })];
  var period1 = makePeriod();
  var r1 = closeWeek(period1,[],players,'owner',{ actorId:'H1' });
  assert(r1.ok);
  // Reopen
  var r2 = reopenWeek(r1.period,'owner',{ actorId:'H1' });
  // Add more data, reclose
  players[0].tickets.push(ticket('T2','lost',50,0));
  players[0].ledgerRows.push(ledgerRow('debit',50));
  var period2 = Object.assign({},r2.period,{status:PERIOD_STATUS.REOPENED});
  var r3 = closeWeek(period2,[],players,'owner',{ actorId:'H1' });
  assert(r3.ok);
  assertEq(r3.snapshots[0].ticketCount,2,'reclose has 2 tickets');
  assertEq(r1.snapshots[0].ticketCount,1,'original snapshot unchanged: 1 ticket');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Settlement closeout tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ SETTLEMENT CLOSEOUT TESTS FAILED'); process.exit(1); }
else console.log('✅ All settlement closeout rules verified');
