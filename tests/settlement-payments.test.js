/**
 * PocketBooks Sports — Phase O: Settlement Payments + Receipts Tests
 * Run: node tests/settlement-payments.test.js
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

// ── Models ────────────────────────────────────────────────────────────────────

const PAYMENT_STATUS  = { PENDING:'pending', CONFIRMED:'confirmed', VOIDED:'voided' };
const PERIOD_STATUS   = { OPEN:'open', CLOSED:'closed', REOPENED:'reopened' };
const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };
const VALID_METHODS   = new Set(['cash','zelle','venmo','cashapp','crypto','other']);
const VALID_DIRECTIONS= new Set(['player_paid_host','host_paid_player']);

// ── Payment store (in-memory) ─────────────────────────────────────────────────
function makePaymentStore() {
  const rows = {};
  const ledger = [];
  return {
    get:    function(id)    { return rows[id]||null; },
    set:    function(p)     { rows[p.paymentId]=p; },
    list:   function(pid,pl){ return Object.values(rows).filter(function(p){ return p.periodId===pid&&p.playerId===pl; }); },
    ledger: function()      { return ledger.slice(); },
    appendLedger: function(row) { ledger.push(row); return { ok:true }; }
  };
}

// ── Payment creation ──────────────────────────────────────────────────────────

function createPayment(store, params, actorRole, snapshot) {
  const { periodId, revision, clubId, playerId, direction, amount, method, note, createdBy } = params;
  const now = new Date().toISOString();

  // Permission
  if ((ROLE_RANK[actorRole]||0) < ROLE_RANK.settlement_manager)
    return { ok:false, code:'insufficient_role', required:'settlement_manager' };

  // Field validation
  if (!periodId||!clubId||!playerId) return { ok:false, code:'missing_required_field' };
  if (!VALID_DIRECTIONS.has(direction)) return { ok:false, code:'invalid_direction' };
  if (!VALID_METHODS.has(method||'cash')) return { ok:false, code:'invalid_method' };
  const amt = parseFloat(amount);
  if (isNaN(amt)||amt<=0) return { ok:false, code:'invalid_amount' };

  // Period must be closed or reopened (payments only on closed periods)
  if (!params.periodStatus||params.periodStatus===PERIOD_STATUS.OPEN)
    return { ok:false, code:'period_not_closed', hint:'Close the week first' };

  // Overpayment check
  const amountOwed = direction==='player_paid_host'
    ? parseFloat(snapshot&&snapshot.amountOwedByPlayer||0)
    : parseFloat(snapshot&&snapshot.amountOwedToPlayer||0);
  const alreadyPaid = _calcTotalPaid(store.list(periodId, playerId), direction);
  const remaining   = Math.round((amountOwed-alreadyPaid)*100)/100;
  if (amt > remaining+0.005 && !params.adminOverride) {
    return { ok:false, code:'overpayment_blocked',
             amountOwed, alreadyPaid, remaining, attempted:amt };
  }
  if (amt > remaining+0.005 && params.adminOverride) {
    if ((ROLE_RANK[actorRole]||0) < ROLE_RANK.full_admin)
      return { ok:false, code:'insufficient_role_for_override', required:'full_admin' };
  }

  const paymentId = 'PAY_'+clubId+'_'+playerId+'_'+Date.now();
  const payment = {
    paymentId, periodId, revision:revision||0, clubId, playerId,
    direction, amount:amt, method:method||'cash',
    status:PAYMENT_STATUS.PENDING, note:note||null, receiptUrl:null,
    createdAt:now, createdBy:createdBy||actorRole,
    confirmedAt:null, confirmedBy:null,
    voidedAt:null, voidedBy:null, voidReason:null,
    ledgerWritten:false
  };
  store.set(payment);
  return { ok:true, payment };
}

// ── Confirm ───────────────────────────────────────────────────────────────────

function confirmPayment(store, paymentId, actorId, actorRole) {
  if ((ROLE_RANK[actorRole]||0) < ROLE_RANK.settlement_manager)
    return { ok:false, code:'insufficient_role' };
  const p = store.get(paymentId);
  if (!p) return { ok:false, code:'payment_not_found' };
  if (p.status===PAYMENT_STATUS.CONFIRMED) return { ok:true, idempotent:true };
  if (p.status===PAYMENT_STATUS.VOIDED)    return { ok:false, code:'payment_voided' };
  // Write ledger
  const dir = p.direction==='player_paid_host'?'debit':'credit';
  const ledRow = {
    ledgerId: 'LE_PAY_'+paymentId, clubId:p.clubId, playerId:p.playerId,
    eventType:'SETTLEMENT_APPLIED', amount:p.amount, direction:dir,
    idempotencyKey:'CONFIRM_'+paymentId, createdAt:new Date().toISOString()
  };
  const lr = store.appendLedger(ledRow);
  if (!lr.ok) return { ok:false, code:'ledger_write_failed' };
  p.status       = PAYMENT_STATUS.CONFIRMED;
  p.confirmedAt  = new Date().toISOString();
  p.confirmedBy  = actorId;
  p.ledgerWritten= true;
  store.set(p);
  return { ok:true, paymentId, ledgerId:ledRow.ledgerId };
}

// ── Void ──────────────────────────────────────────────────────────────────────

function voidPayment(store, paymentId, actorId, actorRole, voidReason) {
  if ((ROLE_RANK[actorRole]||0) < ROLE_RANK.full_admin)
    return { ok:false, code:'insufficient_role', required:'full_admin' };
  const p = store.get(paymentId);
  if (!p) return { ok:false, code:'payment_not_found' };
  if (p.status===PAYMENT_STATUS.VOIDED) return { ok:true, idempotent:true };
  // If ledger was written, write reversal
  let reversalLedgerId = null;
  if (p.ledgerWritten) {
    const revDir = p.direction==='player_paid_host'?'credit':'debit'; // reverse
    const revRow = {
      ledgerId:'LE_REV_'+paymentId, clubId:p.clubId, playerId:p.playerId,
      eventType:'BALANCE_ADJUSTMENT', amount:p.amount, direction:revDir,
      idempotencyKey:'VOID_'+paymentId, reason:'void_reversal:'+paymentId,
      createdAt:new Date().toISOString()
    };
    store.appendLedger(revRow);
    reversalLedgerId = revRow.ledgerId;
  }
  p.status   = PAYMENT_STATUS.VOIDED;
  p.voidedAt = new Date().toISOString();
  p.voidedBy = actorId;
  p.voidReason = voidReason||null;
  store.set(p);
  return { ok:true, paymentId, reversalLedgerId };
}

// ── Settlement balance view ───────────────────────────────────────────────────

function _calcTotalPaid(payments, direction) {
  return Math.round(
    (payments||[])
      .filter(function(p){ return p.status===PAYMENT_STATUS.CONFIRMED && p.direction===direction; })
      .reduce(function(s,p){ return s+parseFloat(p.amount||0); }, 0)
    *100)/100;
}

function calcSettlementBalance(periodId, playerId, snapshot, payments) {
  const snap = snapshot||{};
  const owedByPlayer = parseFloat(snap.amountOwedByPlayer||0);
  const owedToPlayer = parseFloat(snap.amountOwedToPlayer||0);
  const allPay = payments||[];
  const paidByPlayer = _calcTotalPaid(allPay,'player_paid_host');
  const paidToPlayer = _calcTotalPaid(allPay,'host_paid_player');
  const remByPlayer  = Math.round((owedByPlayer-paidByPlayer)*100)/100;
  const remToPlayer  = Math.round((owedToPlayer-paidToPlayer)*100)/100;

  const status = (function() {
    if (owedByPlayer>0) {
      if (paidByPlayer<=0)               return 'unpaid';
      if (paidByPlayer<owedByPlayer-0.005) return 'partial';
      if (paidByPlayer>owedByPlayer+0.005) return 'overpaid';
      return 'paid';
    }
    if (owedToPlayer>0) {
      if (paidToPlayer<=0)               return 'unpaid';
      if (paidToPlayer<owedToPlayer-0.005) return 'partial';
      if (paidToPlayer>owedToPlayer+0.005) return 'overpaid';
      return 'paid';
    }
    return 'even';
  })();

  return {
    periodId, playerId,
    owedByPlayer, owedToPlayer, paidByPlayer, paidToPlayer,
    remainingByPlayer:remByPlayer, remainingToPlayer:remToPlayer,
    status, paymentHistory:allPay
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function snap(owedBy, owedTo) {
  return { amountOwedByPlayer:owedBy||0, amountOwedToPlayer:owedTo||0 };
}
function baseParams(overrides) {
  return Object.assign({
    periodId:'SP_C1_2026-05-18', revision:1, clubId:'C1', playerId:'P001',
    direction:'player_paid_host', amount:100, method:'cash',
    periodStatus:'closed', createdBy:'H1'
  }, overrides||{});
}

console.log('\n── createPayment ──');

test('settlement_manager creates pending payment', function() {
  var store = makePaymentStore();
  var r = createPayment(store, baseParams(), 'settlement_manager', snap(100,0));
  assert(r.ok,'ok: '+(r.code||''));
  assertEq(r.payment.status, PAYMENT_STATUS.PENDING);
  assertEq(r.payment.amount, 100);
});
test('player cannot create payment', function() {
  var r = createPayment(makePaymentStore(), baseParams(), 'player', snap(100,0));
  assertEq(r.code, 'insufficient_role');
});
test('open period rejects payment', function() {
  var r = createPayment(makePaymentStore(), baseParams({ periodStatus:'open' }), 'settlement_manager', snap(100,0));
  assertEq(r.code, 'period_not_closed');
});
test('invalid amount rejected', function() {
  assertEq(createPayment(makePaymentStore(),baseParams({amount:0}),'settlement_manager',snap(100,0)).code,'invalid_amount');
  assertEq(createPayment(makePaymentStore(),baseParams({amount:-5}),'settlement_manager',snap(100,0)).code,'invalid_amount');
});
test('invalid direction rejected', function() {
  var r = createPayment(makePaymentStore(), baseParams({direction:'mystery'}), 'settlement_manager', snap(100,0));
  assertEq(r.code, 'invalid_direction');
});
test('overpayment blocked by default', function() {
  var r = createPayment(makePaymentStore(), baseParams({amount:150}), 'settlement_manager', snap(100,0));
  assertEq(r.code, 'overpayment_blocked');
  assertEq(r.remaining, 100);
});
test('overpayment allowed with adminOverride + full_admin', function() {
  var r = createPayment(makePaymentStore(), baseParams({amount:150, adminOverride:true}), 'full_admin', snap(100,0));
  assert(r.ok,'admin override ok');
});
test('adminOverride requires full_admin+', function() {
  var r = createPayment(makePaymentStore(), baseParams({amount:150, adminOverride:true}), 'settlement_manager', snap(100,0));
  assertEq(r.code, 'insufficient_role_for_override');
});
test('partial payment: already paid reduces remaining', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams({amount:60}), 'settlement_manager', snap(100,0));
  confirmPayment(store, r1.payment.paymentId, 'H1', 'settlement_manager');
  // Now $40 remaining
  var r2 = createPayment(store, baseParams({amount:50}), 'settlement_manager', snap(100,0));
  assertEq(r2.code, 'overpayment_blocked');
  assertApprox(r2.remaining, 40);
});
test('exact remaining amount allowed', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams({amount:60}), 'settlement_manager', snap(100,0));
  confirmPayment(store, r1.payment.paymentId, 'H1', 'settlement_manager');
  var r2 = createPayment(store, baseParams({amount:40}), 'settlement_manager', snap(100,0));
  assert(r2.ok,'exact remaining ok');
});

console.log('\n── confirmPayment ──');

test('confirm pending payment writes ledger', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams(), 'settlement_manager', snap(100,0));
  var r2 = confirmPayment(store, r1.payment.paymentId, 'H1', 'settlement_manager');
  assert(r2.ok,'confirm ok');
  assert(r2.ledgerId,'has ledgerId');
  assertEq(store.get(r1.payment.paymentId).status, PAYMENT_STATUS.CONFIRMED);
  assertEq(store.ledger().length, 1);
});
test('confirm is idempotent', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams(), 'settlement_manager', snap(100,0));
  confirmPayment(store, r1.payment.paymentId, 'H1', 'settlement_manager');
  var r2 = confirmPayment(store, r1.payment.paymentId, 'H1', 'settlement_manager');
  assert(r2.idempotent,'idempotent');
  assertEq(store.ledger().length, 1, 'still 1 ledger row');
});
test('player_paid_host confirm writes debit', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams({direction:'player_paid_host'}), 'settlement_manager', snap(100,0));
  confirmPayment(store, r1.payment.paymentId, 'H1', 'settlement_manager');
  assertEq(store.ledger()[0].direction, 'debit');
});
test('host_paid_player confirm writes credit', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams({direction:'host_paid_player',amount:50}), 'settlement_manager', snap(0,50));
  confirmPayment(store, r1.payment.paymentId, 'H1', 'settlement_manager');
  assertEq(store.ledger()[0].direction, 'credit');
});
test('confirm voided payment fails', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams(), 'settlement_manager', snap(100,0));
  voidPayment(store, r1.payment.paymentId, 'H1', 'full_admin', 'test');
  var r2 = confirmPayment(store, r1.payment.paymentId, 'H1', 'settlement_manager');
  assertEq(r2.code, 'payment_voided');
});

console.log('\n── voidPayment ──');

test('full_admin can void pending payment', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams(), 'settlement_manager', snap(100,0));
  var r2 = voidPayment(store, r1.payment.paymentId, 'H1', 'full_admin', 'mistake');
  assert(r2.ok);
  assertEq(store.get(r1.payment.paymentId).status, PAYMENT_STATUS.VOIDED);
});
test('settlement_manager cannot void', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams(), 'settlement_manager', snap(100,0));
  assertEq(voidPayment(store, r1.payment.paymentId, 'S1', 'settlement_manager', 'x').code, 'insufficient_role');
});
test('void confirmed payment writes reversal ledger row', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams(), 'settlement_manager', snap(100,0));
  confirmPayment(store, r1.payment.paymentId, 'H1', 'settlement_manager');
  var r2 = voidPayment(store, r1.payment.paymentId, 'H1', 'full_admin', 'error');
  assert(r2.reversalLedgerId,'has reversal');
  assertEq(store.ledger().length, 2); // debit + reversal credit
  assertEq(store.ledger()[1].direction, 'credit'); // reversal is credit
});
test('void pending payment writes no reversal', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams(), 'settlement_manager', snap(100,0));
  var r2 = voidPayment(store, r1.payment.paymentId, 'H1', 'full_admin', 'error');
  assert(!r2.reversalLedgerId,'no reversal for pending');
  assertEq(store.ledger().length, 0);
});
test('void is idempotent', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams(), 'settlement_manager', snap(100,0));
  voidPayment(store, r1.payment.paymentId, 'H1', 'full_admin', 'test');
  var r2 = voidPayment(store, r1.payment.paymentId, 'H1', 'full_admin', 'test');
  assert(r2.idempotent,'idempotent');
});

console.log('\n── calcSettlementBalance ──');

test('unpaid: no payments → unpaid', function() {
  var b = calcSettlementBalance('SP1','P1',snap(100,0),[]);
  assertEq(b.status,'unpaid');
  assertEq(b.remainingByPlayer,100);
});
test('partial: $60 paid of $100 → partial', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams({amount:60}), 'settlement_manager', snap(100,0));
  confirmPayment(store, r1.payment.paymentId, 'H1', 'settlement_manager');
  var b = calcSettlementBalance('SP1','P1',snap(100,0), store.list('SP_C1_2026-05-18','P001'));
  assertEq(b.status,'partial');
  assertApprox(b.paidByPlayer,60);
  assertApprox(b.remainingByPlayer,40);
});
test('fully paid → paid', function() {
  var store = makePaymentStore();
  var r1 = createPayment(store, baseParams({amount:100}), 'settlement_manager', snap(100,0));
  confirmPayment(store, r1.payment.paymentId, 'H1', 'settlement_manager');
  var b = calcSettlementBalance('SP1','P1',snap(100,0), store.list('SP_C1_2026-05-18','P001'));
  assertEq(b.status,'paid');
  assertApprox(b.remainingByPlayer,0);
});
test('payment does not modify snapshot', function() {
  var s = snap(100,0);
  var store = makePaymentStore();
  createPayment(store, baseParams(), 'settlement_manager', s);
  assertEq(s.amountOwedByPlayer,100,'snapshot unchanged');
});
test('even players (owe nothing) → even', function() {
  assertEq(calcSettlementBalance('SP1','P1',snap(0,0),[]).status,'even');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Settlement payment tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ SETTLEMENT PAYMENT TESTS FAILED'); process.exit(1); }
else console.log('✅ All settlement payment rules verified');
