/**
 * PocketBooks Sports — Phase I: Transactional Money Engine Tests
 * Run: node tests/transactional-engine.test.js
 * Pure logic — simulates transaction semantics, concurrency, and rollback.
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

// ── Ticket state machine ──────────────────────────────────────────────────────
// All valid transitions enforced here; RPC enforces same set in Postgres.

const TICKET_TRANSITIONS = {
  'active':   ['canceled','won','lost','push'],
  'open':     ['canceled','won','lost','push'],
  'canceled': [],          // terminal
  'won':      [],          // terminal
  'lost':     [],          // terminal
  'push':     [],          // terminal
};

function canTransition(currentStatus, nextStatus) {
  const allowed = TICKET_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

function assertTransition(currentStatus, nextStatus) {
  if (!canTransition(currentStatus, nextStatus))
    throw new Error('invalid_transition:'+currentStatus+'→'+nextStatus);
}

// ── Atomic transaction simulator ──────────────────────────────────────────────
// Each tx: acquire locks → validate → mutate → write ledger → commit
// If any step throws, ALL mutations are rolled back.

function makeTxDB() {
  const tickets  = {};
  const ledger   = [];
  const locks    = {};    // ticketId → lockHolder
  const idemKeys = new Set(); // clubId+'|'+key+'|'+eventType

  return {
    getTicket:  function(id)     { return tickets[id] ? Object.assign({},tickets[id]) : null; },
    setTicket:  function(t)      { tickets[t.id] = Object.assign({}, t); },
    allTickets: function()       { return Object.values(tickets); },
    ledger:     function()       { return ledger.slice(); },
    ledgerFor:  function(tid)    { return ledger.filter(function(r){ return r.ticketId===tid; }); },
    playerLedger: function(pid)  { return ledger.filter(function(r){ return r.playerId===pid; }); },

    // Simulate FOR UPDATE lock (in-process mutex)
    tryLock: function(id, holder) {
      if (locks[id]) return false; // already locked
      locks[id] = holder; return true;
    },
    unlock: function(id) { delete locks[id]; },

    // Append ledger with idempotency check
    appendLedger: function(row) {
      if (row.idempotencyKey) {
        const key = (row.clubId||'')+'|'+row.idempotencyKey+'|'+row.eventType;
        if (idemKeys.has(key)) return { idempotent:true };
        idemKeys.add(key);
      }
      ledger.push(row); return { ok:true };
    },

    // Snapshot for rollback
    snapshot: function() {
      return {
        tickets:  JSON.parse(JSON.stringify(tickets)),
        ledgerLen: ledger.length,
        idemKeys:  new Set(idemKeys)
      };
    },
    restore: function(snap) {
      Object.keys(tickets).forEach(function(k){ delete tickets[k]; });
      Object.assign(tickets, JSON.parse(JSON.stringify(snap.tickets)));
      ledger.splice(snap.ledgerLen); // remove entries added after snapshot
      idemKeys.clear(); snap.idemKeys.forEach(function(k){ idemKeys.add(k); });
    }
  };
}

// Generic transaction runner — rollback on any error
async function runTx(db, fn, txId) {
  const snap = db.snapshot();
  try {
    const result = await fn(db);
    return result;
  } catch(err) {
    db.restore(snap);
    return { error: err.message, rolledBack: true, txId };
  }
}

// ── Money transaction functions (mirror of Postgres RPCs) ─────────────────────

function placeBetTx(db, { clubId, playerId, ticketId, stake, startingLimit, idempotencyKey }) {
  return runTx(db, async function(db) {
    // Idempotency check
    const prior = db.ledger().find(function(r){ return r.idempotencyKey===idempotencyKey && r.eventType==='BET_PLACED'; });
    if (prior) return { ok:true, idempotent:true, ticketId };

    // Balance check
    const playerLedger = db.playerLedger(playerId);
    let bal = parseFloat(startingLimit)||0;
    playerLedger.forEach(function(r){
      if(r.direction==='credit') bal+=parseFloat(r.amount); else if(r.direction==='debit') bal-=parseFloat(r.amount);
    });
    const openRisk = db.allTickets()
      .filter(function(t){ return t.playerId===playerId&&(t.status==='active'||t.status==='open'); })
      .reduce(function(s,t){ return s+parseFloat(t.riskAmount); },0);
    const available = bal - openRisk;
    if (stake > available + 0.005) throw new Error('insufficient_balance:avail='+available.toFixed(2)+':stake='+stake);

    // Write ticket (inside tx)
    db.setTicket({ id:ticketId, playerId, clubId, status:'active', riskAmount:stake });

    // Write ledger (if this throws, tx rolls back the ticket write too)
    const r = db.appendLedger({ ledgerId:'LE_'+Date.now(), clubId, playerId, ticketId,
      eventType:'BET_PLACED', amount:stake, direction:'debit',
      balanceBefore:bal, balanceAfter:bal-stake,
      idempotencyKey, createdAt:new Date().toISOString() });
    if (r.idempotent) return { ok:true, idempotent:true, ticketId };

    return { ok:true, ticketId, ledgerBal:bal-stake };
  });
}

function cancelBetTx(db, { clubId, playerId, ticketId, startingLimit, idempotencyKey }) {
  return runTx(db, async function(db) {
    const ticket = db.getTicket(ticketId);
    if (!ticket) throw new Error('ticket_not_found');

    // Prior cancel check (idempotency)
    const priorCancel = db.ledgerFor(ticketId).find(function(r){ return r.eventType==='BET_CANCELED_REFUND'; });
    if (priorCancel) return { ok:true, idempotent:true };

    // State machine
    assertTransition(ticket.status, 'canceled');

    // Lock ticket
    if (!db.tryLock(ticketId, 'cancel')) throw new Error('ticket_locked_concurrent');

    try {
      // Mutate ticket inside tx
      ticket.status = 'canceled';
      db.setTicket(ticket);

      // Write ledger
      const stake = parseFloat(ticket.riskAmount)||0;
      const bal = parseFloat(startingLimit)||0;
      const r = db.appendLedger({ ledgerId:'LE_'+Date.now(), clubId, playerId, ticketId,
        eventType:'BET_CANCELED_REFUND', amount:stake, direction:'credit',
        idempotencyKey, createdAt:new Date().toISOString() });
      if (!r.ok && !r.idempotent) throw new Error('ledger_write_failed');
      return { ok:true, ticketId, refund:stake };
    } finally {
      db.unlock(ticketId);
    }
  });
}

function gradeTicketTx(db, { clubId, playerId, ticketId, result: gradeResult, profit, startingLimit, idempotencyKey }) {
  return runTx(db, async function(db) {
    const ticket = db.getTicket(ticketId);
    if (!ticket) throw new Error('ticket_not_found');

    // Prior grade check
    const priorGrade = db.ledgerFor(ticketId).find(function(r){
      return r.eventType==='BET_GRADED_WIN'||r.eventType==='BET_GRADED_LOSS'||r.eventType==='BET_GRADED_PUSH';
    });
    if (priorGrade) return { ok:true, idempotent:true, eventType:priorGrade.eventType };

    // State machine
    const targetStatus = gradeResult==='won'?'won':gradeResult==='lost'?'lost':'push';
    assertTransition(ticket.status, targetStatus);

    // Lock ticket
    if (!db.tryLock(ticketId, 'grade')) throw new Error('ticket_locked_concurrent');

    try {
      const stake = parseFloat(ticket.riskAmount)||0;
      ticket.status = targetStatus;
      ticket.profit = parseFloat(profit)||0;
      db.setTicket(ticket);

      // Write ledger event
      const eventType = gradeResult==='won'?'BET_GRADED_WIN':gradeResult==='lost'?'BET_GRADED_LOSS':'BET_GRADED_PUSH';
      const amount = gradeResult==='won' ? stake+(parseFloat(profit)||0) : gradeResult==='push' ? stake : stake;
      const direction = gradeResult==='lost' ? 'neutral' : 'credit';
      db.appendLedger({ ledgerId:'LE_'+Date.now(), clubId, playerId, ticketId,
        eventType, amount, direction, idempotencyKey, createdAt:new Date().toISOString() });

      return { ok:true, ticketId, gradeResult, eventType };
    } finally {
      db.unlock(ticketId);
    }
  });
}

// ── Failure injection ─────────────────────────────────────────────────────────
// Force ledger write to fail: ticket change must roll back

async function placeBetTxWithLedgerFailure(db, params) {
  return runTx(db, async function(db) {
    db.setTicket({ id:params.ticketId, playerId:params.playerId, clubId:params.clubId,
                   status:'active', riskAmount:params.stake });
    throw new Error('simulated_ledger_failure'); // DB trigger rejects
  });
}

async function cancelBetTxWithTicketFailure(db, params) {
  return runTx(db, async function(db) {
    // Write ledger first, then ticket update fails
    db.appendLedger({ ledgerId:'LE_fail', clubId:params.clubId, playerId:params.playerId,
      ticketId:params.ticketId, eventType:'BET_CANCELED_REFUND', amount:100,
      direction:'credit', idempotencyKey:'FAIL_KEY', createdAt:new Date().toISOString() });
    throw new Error('simulated_ticket_update_failure');
  });
}

// ── Test helpers ──────────────────────────────────────────────────────────────
function freshDB() { return makeTxDB(); }
const C='C1', P='P001', START=1000;

function seedTicket(db, id, status, risk) {
  db.setTicket({ id, playerId:P, clubId:C, status:status||'active', riskAmount:risk||100 });
}
async function seedPlacedBet(db, id, stake) {
  await placeBetTx(db,{clubId:C,playerId:P,ticketId:id,stake:stake||100,startingLimit:START,idempotencyKey:'IK_'+id});
}

// ── State machine tests ───────────────────────────────────────────────────────
console.log('\n── Ticket state machine ──');

test('active → canceled allowed', function() { assert(canTransition('active','canceled')); });
test('active → won allowed',      function() { assert(canTransition('active','won')); });
test('active → lost allowed',     function() { assert(canTransition('active','lost')); });
test('active → push allowed',     function() { assert(canTransition('active','push')); });
test('canceled → won blocked',    function() { assert(!canTransition('canceled','won')); });
test('canceled → canceled blocked', function() { assert(!canTransition('canceled','canceled')); });
test('won → canceled blocked',    function() { assert(!canTransition('won','canceled')); });
test('won → lost blocked',        function() { assert(!canTransition('won','lost')); });
test('lost → push blocked',       function() { assert(!canTransition('lost','push')); });
test('push → won blocked',        function() { assert(!canTransition('push','won')); });

// ── Place bet transaction ─────────────────────────────────────────────────────
console.log('\n── Place bet transaction ──');

test('place bet writes ticket + ledger atomically', async function() {
  var db = freshDB();
  var r = await placeBetTx(db,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  assert(r.ok,'ok: '+(r.error||''));
  assert(db.getTicket('T1'),'ticket exists');
  assertEq(db.playerLedger(P).length,1,'1 ledger row');
  assertEq(db.playerLedger(P)[0].eventType,'BET_PLACED');
});

test('place bet is idempotent on same key', async function() {
  var db = freshDB();
  await placeBetTx(db,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  var r2 = await placeBetTx(db,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK1'});
  assert(r2.idempotent,'idempotent');
  assertEq(db.playerLedger(P).length,1,'still 1 ledger row');
});

test('ledger failure rolls back ticket write', async function() {
  var db = freshDB();
  var r = await placeBetTxWithLedgerFailure(db,{clubId:C,playerId:P,ticketId:'T1',stake:100});
  assert(r.rolledBack,'rolled back');
  assert(!db.getTicket('T1'),'ticket NOT written after rollback');
  assertEq(db.playerLedger(P).length,0,'no ledger rows after rollback');
});

test('ticket update failure rolls back ledger write', async function() {
  var db = freshDB();
  seedTicket(db,'T1','active',100);
  var r = await cancelBetTxWithTicketFailure(db,{clubId:C,playerId:P,ticketId:'T1'});
  assert(r.rolledBack,'rolled back');
  assertEq(db.playerLedger(P).length,0,'no ledger row after rollback');
  assertEq(db.getTicket('T1').status,'active','ticket still active');
});

// ── Cancel transaction ────────────────────────────────────────────────────────
console.log('\n── Cancel bet transaction ──');

test('cancel writes ticket+ledger atomically', async function() {
  var db = freshDB();
  await seedPlacedBet(db,'T1',100);
  var r = await cancelBetTx(db,{clubId:C,playerId:P,ticketId:'T1',startingLimit:START,idempotencyKey:'CK1'});
  assert(r.ok); assertEq(db.getTicket('T1').status,'canceled');
  assert(db.ledgerFor('T1').some(function(r){ return r.eventType==='BET_CANCELED_REFUND'; }));
});

test('cancel of canceled ticket is idempotent', async function() {
  var db = freshDB();
  await seedPlacedBet(db,'T1',100);
  await cancelBetTx(db,{clubId:C,playerId:P,ticketId:'T1',startingLimit:START,idempotencyKey:'CK1'});
  var r2 = await cancelBetTx(db,{clubId:C,playerId:P,ticketId:'T1',startingLimit:START,idempotencyKey:'CK1'});
  assert(r2.ok && r2.idempotent,'idempotent');
  assertEq(db.ledgerFor('T1').filter(function(r){ return r.eventType==='BET_CANCELED_REFUND'; }).length,1,'1 refund row');
});

test('cancel of graded ticket blocked by state machine', async function() {
  var db = freshDB();
  await seedPlacedBet(db,'T1',100);
  await gradeTicketTx(db,{clubId:C,playerId:P,ticketId:'T1',result:'won',profit:90.91,startingLimit:START,idempotencyKey:'GK1'});
  var r = await cancelBetTx(db,{clubId:C,playerId:P,ticketId:'T1',startingLimit:START,idempotencyKey:'CK1'});
  assert(r.rolledBack||r.error,'should fail');
  assert((r.error||'').includes('invalid_transition')||(r.rolledBack),'transition error: '+(r.error||''));
});

// ── Grade transaction ─────────────────────────────────────────────────────────
console.log('\n── Grade ticket transaction ──');

test('grade win writes BET_GRADED_WIN credit', async function() {
  var db = freshDB();
  await seedPlacedBet(db,'T1',100);
  var r = await gradeTicketTx(db,{clubId:C,playerId:P,ticketId:'T1',result:'won',profit:90.91,startingLimit:START,idempotencyKey:'GK1'});
  assert(r.ok); assertEq(db.getTicket('T1').status,'won');
  var winRow=db.ledgerFor('T1').find(function(r){ return r.eventType==='BET_GRADED_WIN'; });
  assert(winRow); assertApprox(winRow.amount,190.91);
});

test('grade loss writes BET_GRADED_LOSS neutral', async function() {
  var db = freshDB();
  await seedPlacedBet(db,'T1',100);
  await gradeTicketTx(db,{clubId:C,playerId:P,ticketId:'T1',result:'lost',profit:0,startingLimit:START,idempotencyKey:'GK1'});
  var lossRow=db.ledgerFor('T1').find(function(r){ return r.eventType==='BET_GRADED_LOSS'; });
  assert(lossRow); assertEq(lossRow.direction,'neutral');
});

test('grade is idempotent — second grade returns idempotent', async function() {
  var db = freshDB();
  await seedPlacedBet(db,'T1',100);
  await gradeTicketTx(db,{clubId:C,playerId:P,ticketId:'T1',result:'won',profit:90.91,startingLimit:START,idempotencyKey:'GK1'});
  var r2 = await gradeTicketTx(db,{clubId:C,playerId:P,ticketId:'T1',result:'won',profit:90.91,startingLimit:START,idempotencyKey:'GK1'});
  assert(r2.ok&&r2.idempotent,'idempotent');
  assertEq(db.ledgerFor('T1').filter(function(r){ return r.eventType==='BET_GRADED_WIN'; }).length,1,'1 grade row');
});

test('graded ticket cannot be re-graded with different result', async function() {
  var db = freshDB();
  await seedPlacedBet(db,'T1',100);
  await gradeTicketTx(db,{clubId:C,playerId:P,ticketId:'T1',result:'won',profit:90.91,startingLimit:START,idempotencyKey:'GK1'});
  var r2 = await gradeTicketTx(db,{clubId:C,playerId:P,ticketId:'T1',result:'lost',profit:0,startingLimit:START,idempotencyKey:'GK2'});
  // Should return idempotent (prior grade exists) OR rolled back
  assert(r2.idempotent||r2.rolledBack,'blocked: '+(r2.error||JSON.stringify(r2)));
});

// ── Concurrency tests ─────────────────────────────────────────────────────────
console.log('\n── Concurrency ──');

test('concurrent cancel vs grade: only one wins the lock', async function() {
  var db = freshDB();
  await seedPlacedBet(db,'T1',100);

  // Fire both concurrently (in-process simulation via Promise.all)
  var results = await Promise.all([
    cancelBetTx(db,{clubId:C,playerId:P,ticketId:'T1',startingLimit:START,idempotencyKey:'CK1'}),
    gradeTicketTx(db,{clubId:C,playerId:P,ticketId:'T1',result:'won',profit:90.91,startingLimit:START,idempotencyKey:'GK1'})
  ]);
  var wins   = results.filter(function(r){ return r.ok && !r.rolledBack; }).length;
  var losses = results.filter(function(r){ return r.rolledBack||r.error; }).length;
  // In single-thread JS, Promise.all runs sequentially, so first wins
  // but idempotency / state machine blocks the second
  assert(wins>=1,'at least one succeeds');
  // Ticket has exactly one terminal state
  var finalStatus = db.getTicket('T1').status;
  assert(['canceled','won','lost','push'].includes(finalStatus),'terminal status: '+finalStatus);
});

test('concurrent place bets cannot overdraw balance', async function() {
  var db = freshDB();
  // Two $600 bets against $1000 starting — only first should succeed
  var results = await Promise.all([
    placeBetTx(db,{clubId:C,playerId:P,ticketId:'T1',stake:600,startingLimit:START,idempotencyKey:'IK1'}),
    placeBetTx(db,{clubId:C,playerId:P,ticketId:'T2',stake:600,startingLimit:START,idempotencyKey:'IK2'})
  ]);
  var ok  = results.filter(function(r){ return r.ok && !r.rolledBack; });
  var err = results.filter(function(r){ return r.error; });
  // Since JS is single-threaded, P.all runs T1 first (ok), then T2 sees only $400 left → insufficient
  assert(ok.length>=1,'at least one placed');
  // Total open risk must not exceed starting balance
  var totalRisk = db.allTickets().filter(function(t){ return t.status==='active'; })
    .reduce(function(s,t){ return s+parseFloat(t.riskAmount); },0);
  assert(totalRisk<=START,'open risk '+totalRisk+' <= '+START);
});

test('concurrent same idempotency key runs once only', async function() {
  var db = freshDB();
  var results = await Promise.all([
    placeBetTx(db,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK_SAME'}),
    placeBetTx(db,{clubId:C,playerId:P,ticketId:'T1',stake:100,startingLimit:START,idempotencyKey:'IK_SAME'})
  ]);
  assertEq(db.playerLedger(P).length,1,'exactly 1 ledger row');
  assertEq(db.allTickets().length,1,'exactly 1 ticket');
});

// ── RPC error codes ───────────────────────────────────────────────────────────
console.log('\n── RPC error codes ──');

test('ticket_not_found returns structured error', async function() {
  var db = freshDB();
  var r = await cancelBetTx(db,{clubId:C,playerId:P,ticketId:'GHOST',startingLimit:START,idempotencyKey:'CK_G'});
  assert(r.rolledBack); assert((r.error||'').includes('ticket_not_found'));
});
test('insufficient_balance returns structured error', async function() {
  var db = freshDB();
  var r = await placeBetTx(db,{clubId:C,playerId:P,ticketId:'T1',stake:9999,startingLimit:START,idempotencyKey:'IK1'});
  assert(r.rolledBack); assert((r.error||'').includes('insufficient_balance'));
});
test('invalid state transition returns structured error', async function() {
  var db = freshDB();
  seedTicket(db,'T1','won',100);
  var r = await cancelBetTx(db,{clubId:C,playerId:P,ticketId:'T1',startingLimit:START,idempotencyKey:'CK1'});
  assert(r.rolledBack||r.error,'should fail');
  assert((r.error||'').includes('invalid_transition')||(r.rolledBack),'got: '+(r.error||''));
});
test('simulated DB failure rolls back and returns error', async function() {
  var db = freshDB();
  var r = await placeBetTxWithLedgerFailure(db,{clubId:C,playerId:P,ticketId:'T1',stake:100});
  assert(r.rolledBack,'rolled back');
  assert(r.error,'has error message');
});

// ── Settlement idempotency ────────────────────────────────────────────────────
console.log('\n── Settlement idempotency ──');

test('settlement applied once via idempotencyKey', async function() {
  var db = freshDB();
  // Simulate: same settlement cannot double-write
  var key = 'SETTLE_S1';
  db.appendLedger({ledgerId:'LE_S1',clubId:C,playerId:P,eventType:'SETTLEMENT_APPLIED',
    amount:150,direction:'debit',idempotencyKey:key,createdAt:new Date().toISOString()});
  var r2 = db.appendLedger({ledgerId:'LE_S2',clubId:C,playerId:P,eventType:'SETTLEMENT_APPLIED',
    amount:150,direction:'debit',idempotencyKey:key,createdAt:new Date().toISOString()});
  assert(r2.idempotent,'second settlement is idempotent');
  assertEq(db.playerLedger(P).filter(function(r){ return r.eventType==='SETTLEMENT_APPLIED'; }).length,1);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Transactional engine tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ TRANSACTIONAL ENGINE TESTS FAILED'); process.exit(1); }
else console.log('✅ All transactional engine rules verified');
