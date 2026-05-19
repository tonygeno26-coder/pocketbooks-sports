/**
 * PocketBooks Sports — Phase P: Host Settlements UI Tests
 * Run: node tests/host-settlements-ui.test.js
 * Tests pure data-shaping/render logic (no DOM).
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

// ── View model builders ───────────────────────────────────────────────────────

function buildPeriodsViewModel(periods) {
  return (periods||[]).map(function(p) {
    var statusLabel = { open:'🟢 Open', closed:'🔒 Closed', reopened:'🔓 Reopened', closing:'⏳ Closing' }[p.status]||p.status;
    var canClose   = p.status==='open'||p.status==='reopened';
    var canReopen  = p.status==='closed'||p.status==='reopened';
    return {
      periodId:    p.period_id||p.periodId,
      weekStart:   p.week_start||p.weekStart,
      weekEnd:     p.week_end||p.weekEnd,
      status:      p.status,
      statusLabel,
      revision:    p.revision||0,
      canClose,
      canReopen
    };
  });
}

function buildPaymentRowViewModel(playerBalance, userRole) {
  var ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };
  var rank = ROLE_RANK[userRole]||0;
  var pb = playerBalance;
  var owedBy = parseFloat(pb.owedByPlayer||0);
  var owedTo = parseFloat(pb.owedToPlayer||0);
  var remBy  = parseFloat(pb.remainingByPlayer||0);
  var remTo  = parseFloat(pb.remainingToPlayer||0);
  var status = pb.status||'even';
  var statusLabel = { unpaid:'❌ Unpaid', partial:'⚠️ Partial', paid:'✅ Paid',
                      overpaid:'⚠️ Overpaid', even:'✔ Even' }[status]||status;
  var statusColor = { unpaid:'#ef4444', partial:'#f59e0b', paid:'#10b981',
                      overpaid:'#8b5cf6', even:'#6b7280' }[status]||'#fff';
  return {
    playerId:      pb.playerId,
    owedByPlayer:  owedBy,
    owedToPlayer:  owedTo,
    paidByPlayer:  parseFloat(pb.paidByPlayer||0),
    paidToPlayer:  parseFloat(pb.paidToPlayer||0),
    remainingByPlayer: remBy,
    remainingToPlayer: remTo,
    status, statusLabel, statusColor,
    canRecordPayment:  rank >= ROLE_RANK.settlement_manager,
    canConfirm:        rank >= ROLE_RANK.settlement_manager,
    canVoid:           rank >= ROLE_RANK.full_admin,
    paymentHistory:    pb.paymentHistory||[]
  };
}

function buildRecordPaymentPayload(params) {
  // Validate and build API payload for POST /api/host/settlements/payment
  var { periodId, playerId, clubId, direction, amount, method, note, adminOverride } = params||{};
  var errors = [];
  if (!periodId)  errors.push('missing_periodId');
  if (!playerId)  errors.push('missing_playerId');
  if (!clubId)    errors.push('missing_clubId');
  var VALID_DIR = new Set(['player_paid_host','host_paid_player']);
  var VALID_MET = new Set(['cash','zelle','venmo','cashapp','crypto','other']);
  if (!VALID_DIR.has(direction)) errors.push('invalid_direction:'+direction);
  var amt = parseFloat(amount);
  if (isNaN(amt)||amt<=0) errors.push('invalid_amount');
  if (!VALID_MET.has(method||'cash')) errors.push('invalid_method');
  if (errors.length) return { ok:false, errors };
  return {
    ok:true,
    payload: { periodId, playerId, clubId, direction, amount:amt,
               method:method||'cash', note:note||null, adminOverride:!!adminOverride }
  };
}

// Toast message mapping for server error codes
function mapSettlementErrorToToast(code, data) {
  var msgs = {
    period_already_closed:  '⚠️ This week is already closed.',
    open_tickets_exist:     '⚠️ ' + (data&&data.openCount||'Some') + ' players have open bets. Use force close or wait for grading.',
    period_not_closed:      '⚠️ Close the week first before recording payments.',
    overpayment_blocked:    '⚠️ Amount ($'+(data&&data.attempted||'?')+') exceeds remaining ($'+(data&&data.remaining||'?')+').',
    payment_voided:         '❌ Payment is already voided.',
    payment_not_found:      '❌ Payment not found.',
    insufficient_role:      '🔒 You don\'t have permission for this action.',
    insufficient_role_for_force_close: '🔒 Force close requires full admin access.',
    insufficient_role_for_override:    '🔒 Override requires full admin access.'
  };
  return msgs[code] || ('Error: '+(code||'unknown'));
}

// Pending vs confirmed payment rows styling
function classifyPaymentRow(payment) {
  return {
    paymentId:  payment.payment_id||payment.paymentId,
    amount:     parseFloat(payment.amount||0),
    direction:  payment.direction,
    method:     payment.method,
    status:     payment.status,
    isPending:  payment.status==='pending',
    isConfirmed:payment.status==='confirmed',
    isVoided:   payment.status==='voided',
    label:      { pending:'⏳ Pending', confirmed:'✅ Confirmed', voided:'🚫 Voided' }[payment.status]||payment.status,
    color:      { pending:'#f59e0b', confirmed:'#10b981', voided:'#6b7280' }[payment.status]||'#fff'
  };
}

// ── Tests: buildPeriodsViewModel ──────────────────────────────────────────────
console.log('\n── buildPeriodsViewModel ──');

test('open period: canClose=true, canReopen=false', function() {
  var rows = buildPeriodsViewModel([{ period_id:'SP1', week_start:'2026-05-18', status:'open', revision:0 }]);
  assertEq(rows[0].canClose,true); assertEq(rows[0].canReopen,false);
});
test('closed period: canClose=false, canReopen=true', function() {
  var rows = buildPeriodsViewModel([{ period_id:'SP1', week_start:'2026-05-18', status:'closed', revision:1 }]);
  assertEq(rows[0].canClose,false); assertEq(rows[0].canReopen,true);
  assertEq(rows[0].revision,1);
});
test('reopened period: canClose=true, canReopen=true', function() {
  var rows = buildPeriodsViewModel([{ period_id:'SP1', week_start:'2026-05-18', status:'reopened', revision:1 }]);
  assertEq(rows[0].canClose,true); assertEq(rows[0].canReopen,true);
});
test('multiple periods sorted/rendered', function() {
  var rows = buildPeriodsViewModel([
    { period_id:'SP1', week_start:'2026-05-18', status:'closed', revision:1 },
    { period_id:'SP2', week_start:'2026-05-11', status:'closed', revision:1 },
    { period_id:'SP3', week_start:'2026-05-25', status:'open',   revision:0 }
  ]);
  assertEq(rows.length,3);
  assertEq(rows[2].statusLabel,'🟢 Open');
});
test('statusLabel mapped correctly', function() {
  assertEq(buildPeriodsViewModel([{status:'closed',revision:0}])[0].statusLabel,'🔒 Closed');
  assertEq(buildPeriodsViewModel([{status:'reopened',revision:0}])[0].statusLabel,'🔓 Reopened');
});

// ── Tests: buildPaymentRowViewModel ──────────────────────────────────────────
console.log('\n── buildPaymentRowViewModel ──');

test('unpaid player shows correctly', function() {
  var vm = buildPaymentRowViewModel({ playerId:'P1', owedByPlayer:100, owedToPlayer:0,
    paidByPlayer:0, paidToPlayer:0, remainingByPlayer:100, remainingToPlayer:0, status:'unpaid' }, 'settlement_manager');
  assertEq(vm.status,'unpaid'); assertEq(vm.remainingByPlayer,100);
  assertEq(vm.statusLabel,'❌ Unpaid');
});
test('partial payment shows remaining', function() {
  var vm = buildPaymentRowViewModel({ playerId:'P1', owedByPlayer:100, paidByPlayer:60,
    remainingByPlayer:40, status:'partial' }, 'settlement_manager');
  assertEq(vm.status,'partial');
  assertApprox(vm.paidByPlayer,60);
  assertApprox(vm.remainingByPlayer,40);
  assertEq(vm.statusLabel,'⚠️ Partial');
});
test('paid player shows zero remaining', function() {
  var vm = buildPaymentRowViewModel({ playerId:'P1', owedByPlayer:100, paidByPlayer:100,
    remainingByPlayer:0, status:'paid' }, 'settlement_manager');
  assertEq(vm.remainingByPlayer,0);
  assertEq(vm.statusLabel,'✅ Paid');
});
test('settlement_manager can record + confirm but not void', function() {
  var vm = buildPaymentRowViewModel({ playerId:'P1', status:'unpaid' }, 'settlement_manager');
  assert(vm.canRecordPayment,'can record');
  assert(vm.canConfirm,'can confirm');
  assert(!vm.canVoid,'cannot void');
});
test('full_admin can void', function() {
  var vm = buildPaymentRowViewModel({ playerId:'P1', status:'unpaid' }, 'full_admin');
  assert(vm.canVoid,'full_admin can void');
});
test('risk_viewer cannot record or void', function() {
  var vm = buildPaymentRowViewModel({ playerId:'P1', status:'unpaid' }, 'risk_viewer');
  assert(!vm.canRecordPayment); assert(!vm.canVoid);
});

// ── Tests: buildRecordPaymentPayload ─────────────────────────────────────────
console.log('\n── buildRecordPaymentPayload ──');

test('valid payload built correctly', function() {
  var r = buildRecordPaymentPayload({ periodId:'SP1', playerId:'P1', clubId:'C1',
    direction:'player_paid_host', amount:100, method:'cash' });
  assert(r.ok,'ok: '+(r.errors||[]).join(','));
  assertEq(r.payload.amount,100);
  assertEq(r.payload.method,'cash');
  assert(!r.payload.adminOverride,'no override by default');
});
test('missing periodId → error', function() {
  var r = buildRecordPaymentPayload({ playerId:'P1', clubId:'C1', direction:'player_paid_host', amount:100 });
  assert(!r.ok); assert(r.errors.includes('missing_periodId'));
});
test('invalid direction → error', function() {
  var r = buildRecordPaymentPayload({ periodId:'SP1', playerId:'P1', clubId:'C1',
    direction:'backwards', amount:100 });
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('invalid_direction'); }));
});
test('zero amount → error', function() {
  var r = buildRecordPaymentPayload({ periodId:'SP1', playerId:'P1', clubId:'C1',
    direction:'player_paid_host', amount:0 });
  assert(!r.ok); assert(r.errors.includes('invalid_amount'));
});
test('default method is cash', function() {
  var r = buildRecordPaymentPayload({ periodId:'SP1', playerId:'P1', clubId:'C1',
    direction:'player_paid_host', amount:50 });
  assertEq(r.payload.method,'cash');
});
test('adminOverride flag forwarded', function() {
  var r = buildRecordPaymentPayload({ periodId:'SP1', playerId:'P1', clubId:'C1',
    direction:'player_paid_host', amount:200, adminOverride:true });
  assert(r.payload.adminOverride);
});

// ── Tests: toast message mapping ──────────────────────────────────────────────
console.log('\n── Toast message mapping ──');

test('period_already_closed toast correct', function() {
  assert(mapSettlementErrorToToast('period_already_closed').includes('already closed'));
});
test('open_tickets_exist toast includes count', function() {
  assert(mapSettlementErrorToToast('open_tickets_exist',{openCount:3}).includes('3'));
});
test('overpayment_blocked toast includes amounts', function() {
  var msg = mapSettlementErrorToToast('overpayment_blocked',{attempted:150,remaining:40});
  assert(msg.includes('150')&&msg.includes('40'), msg);
});
test('unknown code → fallback message', function() {
  assert(mapSettlementErrorToToast('some_weird_code').includes('some_weird_code'));
});

// ── Tests: classifyPaymentRow ─────────────────────────────────────────────────
console.log('\n── classifyPaymentRow ──');

test('pending payment: isPending=true', function() {
  var r = classifyPaymentRow({ status:'pending', amount:100, direction:'player_paid_host', method:'cash' });
  assert(r.isPending); assert(!r.isConfirmed); assert(!r.isVoided);
  assertEq(r.label,'⏳ Pending');
});
test('confirmed payment: isConfirmed=true', function() {
  var r = classifyPaymentRow({ status:'confirmed', amount:100, direction:'player_paid_host', method:'zelle' });
  assert(r.isConfirmed); assertEq(r.label,'✅ Confirmed');
});
test('voided payment: isVoided=true', function() {
  var r = classifyPaymentRow({ status:'voided', amount:100, direction:'player_paid_host', method:'cash' });
  assert(r.isVoided); assertEq(r.label,'🚫 Voided');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Host settlements UI tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ HOST SETTLEMENTS UI TESTS FAILED'); process.exit(1); }
else console.log('✅ All host settlements UI rules verified');
