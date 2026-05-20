/**
 * PocketBooks Sports — Phase AB: Host Diamond Funding + Top-Up Flow Tests
 * Run: node tests/host-diamond-ledger.test.js
 * Pure logic — no network, no DB.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b));
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HOST_FEE = 15;
const VALID_EVENT_TYPES = new Set([
  'HOST_DIAMOND_TOPUP','HOST_ACTIVE_BETTOR_CHARGE',
  'HOST_DIAMOND_ADJUSTMENT','HOST_DIAMOND_REFUND'
]);
const VALID_DIRECTIONS = new Set(['credit','debit']);
const VALID_TOPUP_METHODS = new Set(['admin_credit','crypto','manual','promo','other']);

// ── In-memory stores ──────────────────────────────────────────────────────────

function makeHostBalanceStore() {
  var rows = {};
  return {
    get:    function(id)        { return rows[id]||null; },
    init:   function(id,ha,bal) { rows[id]={ clubId:id, hostActorId:ha, balanceDiamonds:bal }; },
    set:    function(id,bal)    { if(rows[id]) rows[id].balanceDiamonds=bal; },
  };
}

function makeHostLedgerStore() {
  var rows = [];
  var idem = {};
  return {
    write: function(entry) {
      // __checkOnly: peek without writing
      if (entry.__checkOnly) {
        return { idempotent: !!(entry.idempotencyKey && idem[entry.idempotencyKey]) };
      }
      if (entry.idempotencyKey && idem[entry.idempotencyKey]) return { idempotent:true };
      if (entry.idempotencyKey) idem[entry.idempotencyKey] = true;
      rows.push(entry);
      return { idempotent:false };
    },
    forClub:  function(clubId)  { return rows.filter(function(r){ return r.clubId===clubId; }); },
    thisWeek: function(clubId, weekStart) {
      return rows.filter(function(r){ return r.clubId===clubId && r.createdAt>=weekStart; });
    },
    all:      function()        { return rows.slice(); }
  };
}

// ── Business logic ────────────────────────────────────────────────────────────

function topupHostDiamonds(balStore, ledgerStore, params) {
  var clubId       = params.clubId;
  var hostActorId  = params.hostActorId;
  var amount       = parseFloat(params.amountDiamonds);
  var method       = params.method;
  var reason       = params.reason || '';
  var idempKey     = params.idempotencyKey;
  var createdBy    = params.createdBy || 'admin';

  if (!clubId)              return { ok:false, error:'missing_clubId' };
  if (!idempKey)            return { ok:false, error:'missing_idempotencyKey' };
  if (isNaN(amount)||amount<=0) return { ok:false, error:'invalid_amount' };
  if (!VALID_TOPUP_METHODS.has(method)) return { ok:false, error:'invalid_method:'+method };

  var ledgerId = idempKey;

  // Idempotency check first (before reading balance — balance may have changed)
  var _idemResult = ledgerStore.write({ __checkOnly:true, idempotencyKey:idempKey });
  if (_idemResult && _idemResult.idempotent) return { ok:true, idempotent:true };

  // Read current balance after idempotency confirmed clean
  var host = balStore.get(clubId);
  var balBefore = host ? host.balanceDiamonds : 0;
  var balAfter  = balBefore + amount;

  var entry = {
    ledgerId, clubId, hostActorId: hostActorId||'unknown',
    eventType:'HOST_DIAMOND_TOPUP', amountDiamonds:amount,
    direction:'credit', balanceBefore:balBefore, balanceAfter:balAfter,
    createdAt:new Date().toISOString(), createdBy, reason, idempotencyKey:idempKey,
    metadataJson:{ method }
  };
  ledgerStore.write(entry);

  // Update balance
  if (!host) {
    balStore.init(clubId, hostActorId||'unknown', amount);
  } else {
    balStore.set(clubId, balAfter);
  }

  return { ok:true, idempotent:false, balanceBefore:balBefore, balanceAfter:balAfter,
           amountDiamonds:amount, ledgerId };
}

function adjustHostDiamonds(balStore, ledgerStore, params, isPlatformAdmin) {
  var clubId    = params.clubId;
  var amount    = parseFloat(params.amountDiamonds);
  var direction = params.direction;
  var reason    = params.reason||'';
  var createdBy = params.createdBy||'admin';

  if (!clubId)                        return { ok:false, error:'missing_clubId' };
  if (!reason.trim())                 return { ok:false, error:'missing_reason' };
  if (isNaN(amount)||amount<=0)       return { ok:false, error:'invalid_amount' };
  if (!VALID_DIRECTIONS.has(direction)) return { ok:false, error:'invalid_direction' };

  var host = balStore.get(clubId);
  if (!host) return { ok:false, error:'host_balance_not_found' };

  var balBefore = host.balanceDiamonds;
  var balAfter  = direction==='credit' ? balBefore+amount : balBefore-amount;

  // No negative balance unless platform_admin override
  if (balAfter < 0 && !isPlatformAdmin)
    return { ok:false, error:'would_go_negative', balanceBefore:balBefore,
             wouldBe:balAfter };

  var ledgerId = 'ADJ_'+clubId+'_'+Date.now();
  ledgerStore.write({
    ledgerId, clubId, hostActorId:host.hostActorId,
    eventType:'HOST_DIAMOND_ADJUSTMENT', amountDiamonds:amount,
    direction, balanceBefore:balBefore, balanceAfter:balAfter,
    createdAt:new Date().toISOString(), createdBy, reason,
    idempotencyKey:null, metadataJson:{}
  });
  balStore.set(clubId, balAfter);
  return { ok:true, balanceBefore:balBefore, balanceAfter:balAfter, direction, ledgerId };
}

function writeActiveBettorChargeLedger(balStore, ledgerStore, clubId, playerId, weekStart, ledgerId) {
  var host = balStore.get(clubId);
  if (!host) return { ok:false, error:'host_not_found' };
  var balBefore = host.balanceDiamonds;
  var balAfter  = balBefore - HOST_FEE;
  ledgerStore.write({
    ledgerId, clubId, hostActorId:host.hostActorId,
    eventType:'HOST_ACTIVE_BETTOR_CHARGE', amountDiamonds:HOST_FEE,
    direction:'debit', balanceBefore:balBefore, balanceAfter:balAfter,
    createdAt:new Date().toISOString(), createdBy:'system',
    reason:'active_bettor_fee:'+playerId+':'+weekStart,
    idempotencyKey:ledgerId, metadataJson:{ playerId, weekStart }
  });
  return { ok:true };
}

function getHostDiamondUsage(balStore, ledgerStore, clubId, weekStart) {
  var host = balStore.get(clubId);
  var balance = host ? host.balanceDiamonds : 0;
  var allEntries = ledgerStore.forClub(clubId);
  var thisWeek   = allEntries.filter(function(e){ return e.createdAt >= weekStart; });
  var topupsThisWeek   = thisWeek.filter(function(e){ return e.eventType==='HOST_DIAMOND_TOPUP'; })
    .reduce(function(s,e){ return s+e.amountDiamonds; }, 0);
  var chargesThisWeek  = thisWeek.filter(function(e){ return e.eventType==='HOST_ACTIVE_BETTOR_CHARGE'; })
    .reduce(function(s,e){ return s+e.amountDiamonds; }, 0);
  var projectedRemaining = Math.floor(balance / HOST_FEE);
  return {
    balanceDiamonds: balance,
    projectedRemainingActiveBettors: projectedRemaining,
    totalTopupsThisWeek: topupsThisWeek,
    totalChargesThisWeek: chargesThisWeek,
    recentLedger: allEntries.slice(-10).reverse()
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── topupHostDiamonds ──');

test('topup credits host balance', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',100);
  var r = topupHostDiamonds(hs,ls,{ clubId:'C1',hostActorId:'H1',amountDiamonds:500,
    method:'admin_credit',reason:'initial topup',idempotencyKey:'TOP_001' });
  assert(r.ok && !r.idempotent,'ok');
  assertEq(r.balanceAfter,600);
  assertEq(hs.get('C1').balanceDiamonds,600);
});

test('topup creates HOST_DIAMOND_TOPUP ledger entry', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',0);
  topupHostDiamonds(hs,ls,{ clubId:'C1',hostActorId:'H1',amountDiamonds:300,
    method:'crypto',reason:'BTC deposit',idempotencyKey:'TOP_002' });
  var entries = ls.forClub('C1');
  assertEq(entries.length,1);
  assertEq(entries[0].eventType,'HOST_DIAMOND_TOPUP');
  assertEq(entries[0].direction,'credit');
  assertEq(entries[0].amountDiamonds,300);
});

test('topup sets balanceBefore and balanceAfter correctly', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',200);
  var r = topupHostDiamonds(hs,ls,{ clubId:'C1',hostActorId:'H1',amountDiamonds:100,
    method:'manual',reason:'test',idempotencyKey:'TOP_003' });
  assertEq(r.balanceBefore,200);
  assertEq(r.balanceAfter,300);
  assertEq(ls.forClub('C1')[0].balanceBefore,200);
  assertEq(ls.forClub('C1')[0].balanceAfter,300);
});

test('duplicate topup with same idempotency key is idempotent', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',100);
  topupHostDiamonds(hs,ls,{ clubId:'C1',hostActorId:'H1',amountDiamonds:500,
    method:'admin_credit',reason:'x',idempotencyKey:'TOP_IDEM' });
  var r2 = topupHostDiamonds(hs,ls,{ clubId:'C1',hostActorId:'H1',amountDiamonds:500,
    method:'admin_credit',reason:'x',idempotencyKey:'TOP_IDEM' });
  assert(r2.ok && r2.idempotent,'idempotent');
  assertEq(hs.get('C1').balanceDiamonds,600,'charged only once');
  assertEq(ls.forClub('C1').length,1,'only one ledger entry');
});

test('topup missing idempotency key → error', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',0);
  var r = topupHostDiamonds(hs,ls,{ clubId:'C1',amountDiamonds:100,method:'admin_credit' });
  assertEq(r.error,'missing_idempotencyKey');
});

test('topup invalid amount (0) → error', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',0);
  var r = topupHostDiamonds(hs,ls,{ clubId:'C1',amountDiamonds:0,
    method:'admin_credit',idempotencyKey:'T' });
  assertEq(r.error,'invalid_amount');
});

test('topup invalid method → error', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',0);
  var r = topupHostDiamonds(hs,ls,{ clubId:'C1',amountDiamonds:100,
    method:'FAKE_METHOD',idempotencyKey:'T' });
  assert(r.error.startsWith('invalid_method'));
});

test('topup creates balance row if none exists', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  // No hs.init — start with no row
  var r = topupHostDiamonds(hs,ls,{ clubId:'C1',hostActorId:'H1',amountDiamonds:500,
    method:'admin_credit',reason:'bootstrap',idempotencyKey:'TOP_NEW' });
  assert(r.ok);
  assertEq(hs.get('C1').balanceDiamonds,500,'balance row created');
});

console.log('\n── Active bettor charge writes to host diamond ledger ──');

test('active bettor charge writes HOST_ACTIVE_BETTOR_CHARGE debit entry', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',150);
  writeActiveBettorChargeLedger(hs,ls,'C1','P1','2026-05-19','HAB_001');
  var entries = ls.forClub('C1');
  assertEq(entries.length,1);
  assertEq(entries[0].eventType,'HOST_ACTIVE_BETTOR_CHARGE');
  assertEq(entries[0].direction,'debit');
  assertEq(entries[0].amountDiamonds,HOST_FEE);
});

test('charge entry has correct balanceBefore / balanceAfter', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',150);
  writeActiveBettorChargeLedger(hs,ls,'C1','P1','2026-05-19','HAB_001');
  var e = ls.forClub('C1')[0];
  assertEq(e.balanceBefore,150);
  assertEq(e.balanceAfter,135);
});

console.log('\n── adjustHostDiamonds ──');

test('adjustment requires reason', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',200);
  var r = adjustHostDiamonds(hs,ls,{ clubId:'C1',amountDiamonds:50,direction:'credit',reason:'' });
  assertEq(r.error,'missing_reason');
});

test('credit adjustment increases balance', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',100);
  var r = adjustHostDiamonds(hs,ls,{ clubId:'C1',amountDiamonds:50,direction:'credit',
    reason:'promo refund',createdBy:'admin' });
  assert(r.ok);
  assertEq(hs.get('C1').balanceDiamonds,150);
});

test('debit adjustment decreases balance', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',200);
  var r = adjustHostDiamonds(hs,ls,{ clubId:'C1',amountDiamonds:50,direction:'debit',
    reason:'correction',createdBy:'admin' });
  assert(r.ok);
  assertEq(hs.get('C1').balanceDiamonds,150);
});

test('negative balance blocked without platform_admin', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',10);
  var r = adjustHostDiamonds(hs,ls,{ clubId:'C1',amountDiamonds:50,direction:'debit',
    reason:'test' }, false);
  assertEq(r.error,'would_go_negative');
  assertEq(hs.get('C1').balanceDiamonds,10,'unchanged');
});

test('negative balance allowed for platform_admin', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',10);
  var r = adjustHostDiamonds(hs,ls,{ clubId:'C1',amountDiamonds:50,direction:'debit',
    reason:'admin correction' }, true);
  assert(r.ok);
  assertEq(hs.get('C1').balanceDiamonds,-40);
});

test('adjustment writes HOST_DIAMOND_ADJUSTMENT ledger entry', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',200);
  adjustHostDiamonds(hs,ls,{ clubId:'C1',amountDiamonds:30,direction:'credit',
    reason:'correction' });
  assertEq(ls.forClub('C1')[0].eventType,'HOST_DIAMOND_ADJUSTMENT');
});

console.log('\n── getHostDiamondUsage (upgraded) ──');

test('usage shows recentLedger', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',300);
  topupHostDiamonds(hs,ls,{ clubId:'C1',hostActorId:'H1',amountDiamonds:200,
    method:'admin_credit',reason:'t',idempotencyKey:'T1' });
  var u = getHostDiamondUsage(hs,ls,'C1','2026-05-18');
  assert(u.recentLedger.length>0,'has ledger entries');
  assertEq(u.recentLedger[0].eventType,'HOST_DIAMOND_TOPUP');
});

test('usage totalTopupsThisWeek sums credits in week', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',0);
  topupHostDiamonds(hs,ls,{ clubId:'C1',hostActorId:'H1',amountDiamonds:300,
    method:'admin_credit',reason:'t1',idempotencyKey:'T1' });
  topupHostDiamonds(hs,ls,{ clubId:'C1',hostActorId:'H1',amountDiamonds:200,
    method:'admin_credit',reason:'t2',idempotencyKey:'T2' });
  var u = getHostDiamondUsage(hs,ls,'C1','2000-01-01'); // wide window
  assertEq(u.totalTopupsThisWeek,500);
});

test('usage totalChargesThisWeek sums bettor charges', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',300);
  writeActiveBettorChargeLedger(hs,ls,'C1','P1','2026-05-19','HAB1');
  writeActiveBettorChargeLedger(hs,ls,'C1','P2','2026-05-19','HAB2');
  var u = getHostDiamondUsage(hs,ls,'C1','2000-01-01');
  assertEq(u.totalChargesThisWeek, HOST_FEE * 2);
});

test('usage projectedRemainingActiveBettors = floor(balance/15)', function() {
  var hs = makeHostBalanceStore(); var ls = makeHostLedgerStore();
  hs.init('C1','H1',100);
  var u = getHostDiamondUsage(hs,ls,'C1','2000-01-01');
  assertEq(u.projectedRemainingActiveBettors, Math.floor(100/HOST_FEE)); // 6
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Host diamond ledger tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ HOST DIAMOND LEDGER TESTS FAILED'); process.exit(1); }
else console.log('✅ All host diamond ledger rules verified');
