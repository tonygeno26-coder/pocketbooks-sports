/**
 * PocketBooks Sports — Phase H: Atomic Ledger + Balance Invariants Tests
 * Run: node tests/atomic-ledger.test.js
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

// ── Ledger engine ─────────────────────────────────────────────────────────────

const EVENT_TYPES = new Set([
  'BET_PLACED','BET_CANCELED_REFUND',
  'BET_GRADED_WIN','BET_GRADED_LOSS','BET_GRADED_PUSH',
  'SETTLEMENT_APPLIED','WEEKLY_ROLLOVER','BALANCE_ADJUSTMENT'
]);

const DEBIT_EVENTS  = new Set(['BET_PLACED','SETTLEMENT_APPLIED']);
const CREDIT_EVENTS = new Set(['BET_CANCELED_REFUND','BET_GRADED_WIN','BET_GRADED_PUSH','BALANCE_ADJUSTMENT']);
const NEUTRAL_EVENTS= new Set(['BET_GRADED_LOSS','WEEKLY_ROLLOVER']);

function direction(eventType) {
  if (DEBIT_EVENTS.has(eventType))   return 'debit';
  if (CREDIT_EVENTS.has(eventType))  return 'credit';
  if (NEUTRAL_EVENTS.has(eventType)) return 'neutral';
  return 'unknown';
}

// In-memory ledger store
function makeLedgerStore() {
  const rows = [];
  const idemIndex = new Set(); // clubId+'|'+idempotencyKey+'|'+eventType
  return {
    append: function(row) {
      const key = (row.clubId||'')+'|'+(row.idempotencyKey||'')+'|'+row.eventType;
      if (row.idempotencyKey && idemIndex.has(key))
        return { error:'duplicate_ledger_entry', key };
      rows.push(row);
      if (row.idempotencyKey) idemIndex.add(key);
      return { ok:true };
    },
    forPlayer: function(clubId, playerId) {
      return rows.filter(function(r){ return r.clubId===clubId && r.playerId===playerId; });
    },
    forTicket: function(ticketId) {
      return rows.filter(function(r){ return r.ticketId===ticketId; });
    },
    all: function() { return rows.slice(); },
    count: function() { return rows.length; }
  };
}

// Ticket store
function makeTicketStore() {
  const rows = {};
  return {
    get: function(id) { return rows[id]||null; },
    set: function(t)  { rows[t.id]=t; },
    all: function()   { return Object.values(rows); }
  };
}

// ── Balance derivation ────────────────────────────────────────────────────────

function deriveBalance(startingLimit, ledgerRows) {
  var balance = parseFloat(startingLimit)||0;
  ledgerRows.forEach(function(row) {
    var amt = parseFloat(row.amount)||0;
    if (row.direction === 'credit') balance += amt;
    else if (row.direction === 'debit') balance -= amt;
    // neutral = no change
  });
  return Math.round(balance*100)/100;
}

function calcOpenRisk(tickets) {
  return tickets
    .filter(function(t){ return t.status==='active'||t.status==='open'; })
    .reduce(function(s,t){ return s+parseFloat(t.riskAmount||0); }, 0);
}

function calcAvailableBalance(startingLimit, ledgerRows, activeTickets) {
  var ledgerBal = deriveBalance(startingLimit, ledgerRows);
  var openRisk  = calcOpenRisk(activeTickets);
  return Math.round((ledgerBal - openRisk)*100)/100;
}

// ── Ledger write helpers ──────────────────────────────────────────────────────

let _ledgerSeq = 0;
function makeLedgerId(eventType) {
  return 'LE_'+eventType.slice(0,4)+'_'+(++_ledgerSeq)+'_'+Date.now();
}

function writeLedgerEntry(store, params) {
  var { clubId, playerId, ticketId, settlementId, eventType, amount,
        idempotencyKey, createdBy, reason, metadataJson } = params;
  if (!EVENT_TYPES.has(eventType)) return { error:'invalid_eventType:'+eventType };
  if (typeof amount !== 'number' || isNaN(amount) || amount < 0)
    return { error:'invalid_amount:'+amount };
  const dir = direction(eventType);
  const ledgerId = makeLedgerId(eventType);
  const row = {
    ledgerId, clubId: clubId||'', playerId: playerId||'',
    ticketId: ticketId||null, settlementId: settlementId||null,
    eventType, amount, direction:dir, currency:'diamonds',
    balanceBefore: null, balanceAfter: null, // set by atomic op
    idempotencyKey: idempotencyKey||null,
    createdAt: new Date().toISOString(),
    createdBy: createdBy||'system',
    reason: reason||eventType,
    metadataJson: metadataJson||null
  };
  return store.append(row);
}

// ── Atomic balance ops ────────────────────────────────────────────────────────

// Simulate atomic place bet: validate balance → write ticket → write ledger
function atomicPlaceBet(ledgerStore, ticketStore, params) {
  var { clubId, playerId, ticketId, stake, startingLimit, idempotencyKey } = params;
  stake = parseFloat(stake)||0;
  if (stake <= 0) return { error:'invalid_stake' };

  // Load current ledger + derive balance
  const playerLedger = ledgerStore.forPlayer(clubId, playerId);
  const activeTickets = ticketStore.all().filter(function(t){
    return t.playerId===playerId && (t.status==='active'||t.status==='open');
  });
  const available = calcAvailableBalance(startingLimit, playerLedger, activeTickets);
  if (stake > available + 0.005) return { error:'insufficient_balance', available, stake };

  // Write ticket
  ticketStore.set({ id:ticketId, playerId, clubId, status:'active', riskAmount:stake });

  // Write ledger debit
  const ledgerBalance = deriveBalance(startingLimit, playerLedger);
  const result = writeLedgerEntry(ledgerStore, {
    clubId, playerId, ticketId, eventType:'BET_PLACED', amount:stake,
    idempotencyKey, createdBy:playerId, reason:'bet_placed'
  });
  if (result.error) {
    if (result.error === 'duplicate_ledger_entry') return { ok:true, idempotent:true };
    return result;
  }
  // Stamp balance fields
  const lastRow = ledgerStore.forPlayer(clubId, playerId).slice(-1)[0];
  if (lastRow) { lastRow.balanceBefore=ledgerBalance; lastRow.balanceAfter=ledgerBalance-stake; }

  return { ok:true, ticketId, ledgerId:lastRow&&lastRow.ledgerId, balanceAfter:ledgerBalance-stake };
}

// Atomic cancel
function atomicCancelBet(ledgerStore, ticketStore, params) {
  var { clubId, playerId, ticketId, startingLimit, idempotencyKey } = params;
  const ticket = ticketStore.get(ticketId);
  if (!ticket) return { error:'ticket_not_found' };

  const stake = parseFloat(ticket.riskAmount)||0;

  // Idempotency: check prior refund BEFORE status check
  const priorCancel = ledgerStore.forTicket(ticketId)
    .find(function(r){ return r.eventType==='BET_CANCELED_REFUND'; });
  if (priorCancel) return { ok:true, idempotent:true };

  if (ticket.status !== 'active' && ticket.status !== 'open')
    return { error:'cannot_cancel:status='+ticket.status };

  // Update ticket status
  ticket.status = 'canceled';
  ticketStore.set(ticket);

  // Write ledger credit (refund)
  const ledgerBalance = deriveBalance(startingLimit, ledgerStore.forPlayer(clubId, playerId));
  const result = writeLedgerEntry(ledgerStore, {
    clubId, playerId, ticketId, eventType:'BET_CANCELED_REFUND', amount:stake,
    idempotencyKey, createdBy:playerId, reason:'cancel_refund'
  });
  if (result.error) return result;

  const lastRow = ledgerStore.forPlayer(clubId, playerId).slice(-1)[0];
  if (lastRow) { lastRow.balanceBefore=ledgerBalance; lastRow.balanceAfter=ledgerBalance+stake; }
  return { ok:true, ticketId, refund:stake, ledgerId:lastRow&&lastRow.ledgerId };
}

// Atomic grade
function atomicGrade(ledgerStore, ticketStore, params) {
  var { clubId, playerId, ticketId, result: gradeResult, profit, startingLimit, idempotencyKey } = params;
  const ticket = ticketStore.get(ticketId);
  if (!ticket) return { error:'ticket_not_found' };

  // Idempotency: check for existing grade event BEFORE status check
  const priorGrade = ledgerStore.forTicket(ticketId)
    .find(function(r){ return r.eventType==='BET_GRADED_WIN'||r.eventType==='BET_GRADED_LOSS'||r.eventType==='BET_GRADED_PUSH'; });
  if (priorGrade) return { ok:true, idempotent:true, eventType:priorGrade.eventType };

  if (ticket.status !== 'active' && ticket.status !== 'open')
    return { error:'already_graded:status='+ticket.status };

  const stake = parseFloat(ticket.riskAmount)||0;
  var eventType, creditAmount;
  if (gradeResult === 'won') {
    eventType = 'BET_GRADED_WIN'; creditAmount = stake + (parseFloat(profit)||0);
    ticket.status = 'won'; ticket.profit = parseFloat(profit)||0;
  } else if (gradeResult === 'lost') {
    eventType = 'BET_GRADED_LOSS'; creditAmount = 0;
    ticket.status = 'lost'; ticket.profit = 0;
  } else if (gradeResult === 'push') {
    eventType = 'BET_GRADED_PUSH'; creditAmount = stake;
    ticket.status = 'push'; ticket.profit = 0;
  } else {
    return { error:'invalid_grade_result:'+gradeResult };
  }
  ticketStore.set(ticket);

  const ledgerBalance = deriveBalance(startingLimit, ledgerStore.forPlayer(clubId, playerId));
  if (gradeResult !== 'lost') {
    const result = writeLedgerEntry(ledgerStore, {
      clubId, playerId, ticketId, eventType, amount:creditAmount,
      idempotencyKey, createdBy:'server', reason:'grade_'+gradeResult
    });
    if (result.error) return result;
    const lastRow = ledgerStore.forPlayer(clubId, playerId).slice(-1)[0];
    if (lastRow) { lastRow.balanceBefore=ledgerBalance; lastRow.balanceAfter=ledgerBalance+creditAmount; }
  } else {
    // Loss: write neutral entry (tracks event, no balance change)
    writeLedgerEntry(ledgerStore, {
      clubId, playerId, ticketId, eventType:'BET_GRADED_LOSS', amount:stake,
      idempotencyKey, createdBy:'server', reason:'grade_lost'
    });
  }
  return { ok:true, ticketId, gradeResult, eventType };
}

// Atomic settlement
function atomicSettle(ledgerStore, ticketStore, params) {
  var { clubId, playerId, settlementId, amount, direction:dir, startingLimit, idempotencyKey } = params;
  amount = parseFloat(amount)||0;

  // Check idempotency via ledger
  const priorSettle = ledgerStore.forPlayer(clubId, playerId)
    .find(function(r){ return r.settlementId===settlementId && r.eventType==='SETTLEMENT_APPLIED'; });
  if (priorSettle) return { ok:true, idempotent:true };

  const eventType = 'SETTLEMENT_APPLIED';
  const result = writeLedgerEntry(ledgerStore, {
    clubId, playerId, settlementId, eventType, amount,
    idempotencyKey, createdBy:'host', reason:'settlement'
  });
  if (result.error) return result;
  return { ok:true, settlementId };
}

// ── Invariant checks ──────────────────────────────────────────────────────────

function checkInvariants(ledgerRows) {
  var errs = [];
  ledgerRows.forEach(function(row, i) {
    if (row.balanceBefore !== null && row.balanceAfter !== null) {
      var diff = Math.round((row.balanceAfter - row.balanceBefore)*100)/100;
      var amt  = row.direction==='credit' ? row.amount : row.direction==='debit' ? -row.amount : 0;
      if (Math.abs(diff - amt) > 0.01) {
        errs.push('row '+i+' balanceBefore+amount≠balanceAfter: '+row.balanceBefore+'+'+amt+'≠'+row.balanceAfter);
      }
    }
    if (row.amount < 0) errs.push('row '+i+' negative amount: '+row.amount);
    if (!EVENT_TYPES.has(row.eventType)) errs.push('row '+i+' unknown eventType: '+row.eventType);
  });
  return { ok:errs.length===0, errors:errs };
}

// Reconciliation: ledger-derived vs ticket-derived balance
function reconcilePlayer(startingLimit, ledgerRows, tickets) {
  const ledgerBal = deriveBalance(startingLimit, ledgerRows);
  const openRisk  = calcOpenRisk(tickets);
  const ledgerAvail = Math.round((ledgerBal - openRisk)*100)/100;
  // Ticket-derived (old method)
  var settledGains = 0, settledLosses = 0;
  tickets.forEach(function(t) {
    var s = t.status;
    if (s==='won')  settledGains  += parseFloat(t.profit||0);
    if (s==='lost') settledLosses += parseFloat(t.riskAmount||0);
  });
  const ticketAvail = Math.round((startingLimit - openRisk - settledLosses + settledGains)*100)/100;
  const mismatch = Math.abs(ledgerAvail - ticketAvail) > 0.01;
  return { ledgerBal, ledgerAvail, ticketAvail, openRisk, mismatch };
}

// ── Test data ─────────────────────────────────────────────────────────────────
function freshState() {
  return { ledger: makeLedgerStore(), tickets: makeTicketStore() };
}
const C='C1', P='P001', START=1000;

// ── Ledger direction ──────────────────────────────────────────────────────────
console.log('\n── Ledger direction mapping ──');
test('BET_PLACED → debit',           function(){ assertEq(direction('BET_PLACED'),'debit'); });
test('BET_CANCELED_REFUND → credit', function(){ assertEq(direction('BET_CANCELED_REFUND'),'credit'); });
test('BET_GRADED_WIN → credit',      function(){ assertEq(direction('BET_GRADED_WIN'),'credit'); });
test('BET_GRADED_LOSS → neutral',    function(){ assertEq(direction('BET_GRADED_LOSS'),'neutral'); });
test('BET_GRADED_PUSH → credit',     function(){ assertEq(direction('BET_GRADED_PUSH'),'credit'); });
test('SETTLEMENT_APPLIED → debit',   function(){ assertEq(direction('SETTLEMENT_APPLIED'),'debit'); });
test('WEEKLY_ROLLOVER → neutral',    function(){ assertEq(direction('WEEKLY_ROLLOVER'),'neutral'); });

// ── Balance derivation ────────────────────────────────────────────────────────
console.log('\n── Balance derivation ──');
test('empty ledger = starting balance', function() {
  assertEq(deriveBalance(1000,[]),1000);
});
test('debit reduces balance', function() {
  var rows=[{direction:'debit',amount:100}];
  assertEq(deriveBalance(1000,rows),900);
});
test('credit increases balance', function() {
  var rows=[{direction:'credit',amount:200}];
  assertEq(deriveBalance(1000,rows),1200);
});
test('neutral has no effect', function() {
  var rows=[{direction:'neutral',amount:100}];
  assertEq(deriveBalance(1000,rows),1000);
});
test('multiple entries accumulated correctly', function() {
  var rows=[
    {direction:'debit',amount:100},   // 1000-100 = 900
    {direction:'credit',amount:90.91},// 900+90.91 = 990.91
    {direction:'neutral',amount:100}  // no change
  ];
  assertApprox(deriveBalance(1000,rows),990.91);
});

// ── Atomic place ──────────────────────────────────────────────────────────────
console.log('\n── Atomic place bet ──');
test('place bet writes one ledger debit', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  var rows = s.ledger.forPlayer(C,P);
  assertEq(rows.length,1); assertEq(rows[0].eventType,'BET_PLACED');
  assertEq(rows[0].amount,100);
});
test('place bet sets balanceBefore/After correctly', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  var row = s.ledger.forPlayer(C,P)[0];
  assertEq(row.balanceBefore,1000); assertEq(row.balanceAfter,900);
});
test('place bet is idempotent on same key', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  var r2 = atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  assert(r2.ok); assert(r2.idempotent,'second call is idempotent');
  assertEq(s.ledger.forPlayer(C,P).length,1,'only 1 ledger row');
});
test('insufficient balance blocks place', function() {
  var s = freshState();
  var r = atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:1500,startingLimit:START,idempotencyKey:'IK1'});
  assertEq(r.error,'insufficient_balance');
  assertEq(s.ledger.count(),0,'no ledger row on failure');
});
test('balance after two bets accounts for open risk', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  var r2=atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T2',stake:100,startingLimit:START,idempotencyKey:'IK2'});
  assert(r2.ok); assertEq(s.ledger.forPlayer(C,P).length,2);
  // ledgerBal = 1000 - 100 - 100 = 800
  var ledgerBal = deriveBalance(START, s.ledger.forPlayer(C,P));
  assertEq(ledgerBal,800,'ledger balance=800 after 2×$100 bets');
  // openRisk = 200 (both tickets active)
  var openRisk = calcOpenRisk(s.tickets.all());
  assertEq(openRisk,200,'open risk=200');
  // available = ledgerBal - openRisk = 600
  var available = calcAvailableBalance(START, s.ledger.forPlayer(C,P), s.tickets.all());
  assertEq(available,600,'available=600 (800 ledger - 200 open risk)');
});

// ── Atomic cancel ─────────────────────────────────────────────────────────────
console.log('\n── Atomic cancel ──');
test('cancel writes one BET_CANCELED_REFUND', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  atomicCancelBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',startingLimit:START,idempotencyKey:'CK1'});
  var rows = s.ledger.forPlayer(C,P);
  assertEq(rows.length,2);
  assertEq(rows[1].eventType,'BET_CANCELED_REFUND');
  assertEq(rows[1].amount,100);
});
test('double cancel is idempotent — only one refund row', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  atomicCancelBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',startingLimit:START,idempotencyKey:'CK1'});
  var r2 = atomicCancelBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',startingLimit:START,idempotencyKey:'CK1'});
  assert(r2.ok); assert(r2.idempotent,'second cancel idempotent');
  assertEq(s.ledger.forPlayer(C,P).length,2,'only 2 rows');
});
test('cancel of graded ticket denied', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  atomicGrade(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',result:'won',profit:90.91,startingLimit:START,idempotencyKey:'GK1'});
  var r = atomicCancelBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',startingLimit:START,idempotencyKey:'CK1'});
  assert(r.error,'should error'); assert(r.error.includes('cannot_cancel'),'got: '+r.error);
});

// ── Atomic grade ──────────────────────────────────────────────────────────────
console.log('\n── Atomic grade ──');
test('win grade writes BET_GRADED_WIN with stake+profit', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  atomicGrade(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',result:'won',profit:90.91,startingLimit:START,idempotencyKey:'GK1'});
  var gradeRow = s.ledger.forTicket('T1').find(function(r){return r.eventType==='BET_GRADED_WIN';});
  assert(gradeRow,'win row exists');
  assertApprox(gradeRow.amount,190.91,'stake+profit=190.91');
});
test('loss grade writes BET_GRADED_LOSS (neutral, amount=stake)', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  atomicGrade(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',result:'lost',profit:0,startingLimit:START,idempotencyKey:'GK1'});
  var lossRow = s.ledger.forTicket('T1').find(function(r){return r.eventType==='BET_GRADED_LOSS';});
  assert(lossRow,'loss row exists'); assertEq(lossRow.direction,'neutral');
});
test('push grade writes BET_GRADED_PUSH returning stake', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  atomicGrade(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',result:'push',profit:0,startingLimit:START,idempotencyKey:'GK1'});
  var pushRow = s.ledger.forTicket('T1').find(function(r){return r.eventType==='BET_GRADED_PUSH';});
  assert(pushRow,'push row exists'); assertEq(pushRow.amount,100,'stake returned');
});
test('graded ticket cannot grade twice', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  atomicGrade(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',result:'won',profit:90.91,startingLimit:START,idempotencyKey:'GK1'});
  var r2 = atomicGrade(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',result:'won',profit:90.91,startingLimit:START,idempotencyKey:'GK1'});
  assert(r2.ok); assert(r2.idempotent,'second grade idempotent');
  var gradeRows = s.ledger.forTicket('T1').filter(function(r){return r.eventType==='BET_GRADED_WIN';});
  assertEq(gradeRows.length,1,'only 1 grade row');
});

// ── Settlement ────────────────────────────────────────────────────────────────
console.log('\n── Settlement ──');
test('settlement writes SETTLEMENT_APPLIED once', function() {
  var s = freshState();
  atomicSettle(s.ledger,s.tickets,{clubId:C,playerId:P,settlementId:'S1',amount:150,direction:'debit',startingLimit:START,idempotencyKey:'SK1'});
  var rows=s.ledger.forPlayer(C,P).filter(function(r){return r.eventType==='SETTLEMENT_APPLIED';});
  assertEq(rows.length,1);
});
test('settlement is idempotent via settlementId', function() {
  var s = freshState();
  atomicSettle(s.ledger,s.tickets,{clubId:C,playerId:P,settlementId:'S1',amount:150,direction:'debit',startingLimit:START,idempotencyKey:'SK1'});
  var r2 = atomicSettle(s.ledger,s.tickets,{clubId:C,playerId:P,settlementId:'S1',amount:150,direction:'debit',startingLimit:START,idempotencyKey:'SK1'});
  assert(r2.ok); assert(r2.idempotent);
  var rows=s.ledger.forPlayer(C,P).filter(function(r){return r.eventType==='SETTLEMENT_APPLIED';});
  assertEq(rows.length,1,'still 1 row');
});

// ── Invariants ────────────────────────────────────────────────────────────────
console.log('\n── Invariants ──');
test('valid ledger passes invariant check', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  var chk = checkInvariants(s.ledger.all());
  assert(chk.ok,'invariant ok: '+(chk.errors||[]).join(', '));
});
test('tampered balanceAfter fails invariant', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  s.ledger.all()[0].balanceAfter = 999; // should be 900
  var chk = checkInvariants(s.ledger.all());
  assert(!chk.ok,'should fail'); assertEq(chk.errors.length,1);
});
test('negative amount fails invariant', function() {
  var s = freshState();
  var result = writeLedgerEntry(s.ledger,{clubId:C,playerId:P,eventType:'BET_PLACED',amount:-50});
  assert(result.error,'should error'); assert(result.error.includes('invalid_amount'));
});
test('invalid eventType rejected', function() {
  var s = freshState();
  var result = writeLedgerEntry(s.ledger,{clubId:C,playerId:P,eventType:'MAGIC_MONEY',amount:100});
  assert(result.error); assert(result.error.includes('invalid_eventType'));
});

// ── Reconciliation ────────────────────────────────────────────────────────────
console.log('\n── Reconciliation ──');
test('clean state: no mismatch', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  atomicGrade(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',result:'won',profit:90.91,startingLimit:START,idempotencyKey:'GK1'});
  var r = reconcilePlayer(START,s.ledger.forPlayer(C,P),s.tickets.all());
  assert(!r.mismatch,'no mismatch');
});
test('manual ledger insertion causes mismatch', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  atomicGrade(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',result:'lost',profit:0,startingLimit:START,idempotencyKey:'GK1'});
  // Manual injection: someone added extra credit outside normal flow
  s.ledger.append({ledgerId:'MANUAL',clubId:C,playerId:P,eventType:'BALANCE_ADJUSTMENT',amount:500,direction:'credit',idempotencyKey:null,createdAt:new Date().toISOString(),reason:'manual'});
  var r = reconcilePlayer(START,s.ledger.forPlayer(C,P),s.tickets.all());
  assert(r.mismatch,'should flag mismatch');
});
test('client-submitted balance is ignored: balance derived from ledger only', function() {
  var s = freshState();
  atomicPlaceBet(s.ledger,s.tickets,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  var clientClaimedBalance = 999999; // malicious
  var actualBal = deriveBalance(START, s.ledger.forPlayer(C,P));
  assertEq(actualBal,900,'actual ledger balance=900, not client claim');
  assert(actualBal !== clientClaimedBalance,'client balance ignored');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Atomic ledger tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ ATOMIC LEDGER TESTS FAILED'); process.exit(1); }
else console.log('✅ All atomic ledger rules verified');
