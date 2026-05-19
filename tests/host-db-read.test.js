/**
 * PocketBooks Sports — Host Dashboard DB Read Tests (Phase C Step 2)
 * Run: node tests/host-db-read.test.js
 * Tests host stats derivation from DB ticket/ledger data. No network calls.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }
function assertApprox(a, b, m) { if (Math.abs(a-b) > 0.02) throw new Error((m||'') + ' — got '+a+' expected ~'+b); }

// ── Pure host stats engine (mirrors backend) ──────────────────────────────────

function calcHostStatsFromDb(tickets, ledgerEntries) {
  var handle = 0, activeRisk = 0, hostAtRisk = 0;
  var settledGain = 0, settledLoss = 0;
  var activeBetCount = 0, gradedCount = 0, canceledCount = 0;

  (tickets || []).forEach(function(t) {
    var s      = (t.status || t.ticket_status || '').toLowerCase();
    var risk   = parseFloat(t.risk_amount   || t.riskAmount   || 0);
    var profit = parseFloat(t.potential_profit || t.potentialProfit || 0);

    if (s === 'canceled' || s === 'voided' || s === 'deleted') {
      canceledCount++;
      return; // never affects any stats
    }
    if (s === 'active' || s === 'open') {
      handle       += risk;
      activeRisk   += risk;
      hostAtRisk   += profit; // host exposure = potential profit owed to player
      activeBetCount++;
    } else if (s === 'won') {
      handle       += risk;
      settledLoss  += profit; // host paid out profit
      gradedCount++;
    } else if (s === 'lost') {
      handle       += risk;
      settledGain  += risk;   // host kept risk
      gradedCount++;
    } else if (s === 'push' || s === 'pushed') {
      handle       += risk;
      gradedCount++;
      // push: no net gain or loss
    }
  });

  var settledHandle = handle - activeRisk;
  var profit        = Math.round((settledGain - settledLoss) * 100) / 100;
  var holdPct       = settledHandle > 0 ? Math.round((profit / settledHandle) * 10000) / 100 : null;

  // Safety: never NaN
  function safe(v) { return (isNaN(v) || v == null) ? 0 : Math.round(v * 100) / 100; }

  return {
    handle:         safe(handle),
    activeRisk:     safe(activeRisk),
    hostAtRisk:     safe(hostAtRisk),
    settledGain:    safe(settledGain),
    settledLoss:    safe(settledLoss),
    profit:         safe(profit),
    holdPct:        holdPct,
    activeBetCount: activeBetCount,
    gradedCount:    gradedCount,
    canceledCount:  canceledCount
  };
}

// Safety validator
function validateHostStats(stats) {
  var warnings = [];
  if (isNaN(stats.handle))         warnings.push('handle_is_NaN');
  if (isNaN(stats.activeRisk))     warnings.push('activeRisk_is_NaN');
  if (stats.activeRisk < 0)        warnings.push('activeRisk_negative');
  if (stats.hostAtRisk < 0)        warnings.push('hostAtRisk_negative');
  if (isNaN(stats.profit))         warnings.push('profit_is_NaN');
  return { safe: warnings.length === 0, warnings };
}

// ── Test data helpers ─────────────────────────────────────────────────────────
function t(id, status, risk, profit) {
  return { id, status, risk_amount: risk||100, potential_profit: profit||90.91 };
}

// ── Basic stats derivation ────────────────────────────────────────────────────
console.log('\n── Handle, risk, profit derivation ──');

test('empty tickets → all zeros, no NaN', function() {
  var s = calcHostStatsFromDb([]);
  assertEq(s.handle, 0, 'handle=0');
  assertEq(s.activeRisk, 0, 'activeRisk=0');
  assertEq(s.profit, 0, 'profit=0');
  assertEq(s.activeBetCount, 0, 'activeBetCount=0');
  var v = validateHostStats(s);
  assert(v.safe, 'no warnings: '+v.warnings.join(','));
});

test('active ticket: adds to handle, activeRisk, hostAtRisk', function() {
  var s = calcHostStatsFromDb([t('T1','active',100,90.91)]);
  assertEq(s.handle, 100, 'handle=100');
  assertEq(s.activeRisk, 100, 'activeRisk=100');
  assertApprox(s.hostAtRisk, 90.91, 'hostAtRisk=90.91');
  assertEq(s.activeBetCount, 1, 'activeBetCount=1');
  assertEq(s.profit, 0, 'profit=0 (no settled)');
});

test('won ticket: host pays profit (settledLoss), profit negative for host', function() {
  var s = calcHostStatsFromDb([t('T1','won',100,90.91)]);
  assertEq(s.handle, 100, 'handle');
  assertApprox(s.settledLoss, 90.91, 'settledLoss=90.91');
  assertEq(s.settledGain, 0, 'settledGain=0');
  assertApprox(s.profit, -90.91, 'profit=-90.91 (host lost)');
  assertEq(s.activeRisk, 0, 'no openRisk');
});

test('lost ticket: host keeps risk (settledGain), profit positive', function() {
  var s = calcHostStatsFromDb([t('T1','lost',100,90.91)]);
  assertEq(s.settledGain, 100, 'settledGain=100');
  assertEq(s.settledLoss, 0, 'settledLoss=0');
  assertEq(s.profit, 100, 'profit=100');
});

test('push ticket: handle includes risk, no profit change', function() {
  var s = calcHostStatsFromDb([t('T1','push',100,90.91)]);
  assertEq(s.handle, 100, 'handle=100');
  assertEq(s.profit, 0, 'profit=0 on push');
  assertEq(s.settledGain, 0, 'no gain');
  assertEq(s.settledLoss, 0, 'no loss');
});

test('canceled ticket: excluded from all stats', function() {
  var s = calcHostStatsFromDb([t('T1','canceled',100,90.91)]);
  assertEq(s.handle, 0, 'canceled excluded from handle');
  assertEq(s.activeRisk, 0, 'excluded from activeRisk');
  assertEq(s.canceledCount, 1, 'canceledCount=1');
  assertEq(s.profit, 0, 'excluded from profit');
});

test('voided ticket: excluded same as canceled', function() {
  var s = calcHostStatsFromDb([t('T1','voided',100,90.91)]);
  assertEq(s.handle, 0, 'voided excluded');
  assertEq(s.canceledCount, 1, 'canceledCount=1');
});

test('mixed: active+won+lost+canceled → correct totals', function() {
  var tickets = [
    t('T1','active',100,90.91),   // active
    t('T2','won',50,45.45),       // host lost 45.45
    t('T3','lost',75,68.18),      // host gained 75
    t('T4','canceled',200,180),   // excluded
    t('T5','active',100,90.91)    // active
  ];
  var s = calcHostStatsFromDb(tickets);
  assertEq(s.handle, 100+50+75+100, 'handle=325 (active+won+lost, not canceled)');
  assertEq(s.activeRisk, 200, 'activeRisk=200 (2 active)');
  assertEq(s.activeBetCount, 2, 'activeBetCount=2');
  assertApprox(s.settledGain, 75, 'settledGain=75');
  assertApprox(s.settledLoss, 45.45, 'settledLoss=45.45');
  assertApprox(s.profit, 75-45.45, 'profit=29.55');
  assertEq(s.canceledCount, 1, 'canceledCount=1');
});

// ── Hold % calculation ────────────────────────────────────────────────────────
console.log('\n── Hold % ──');

test('holdPct: no settled → null', function() {
  var s = calcHostStatsFromDb([t('T1','active',100,90.91)]);
  assert(s.holdPct === null, 'holdPct=null when no settled');
});

test('holdPct: $100 lost → 100% hold', function() {
  var s = calcHostStatsFromDb([t('T1','lost',100,90.91)]);
  assertApprox(s.holdPct, 100, 'holdPct=100%');
});

test('holdPct: $100 won (host lost) → -90.91% hold', function() {
  var s = calcHostStatsFromDb([t('T1','won',100,90.91)]);
  assert(s.holdPct !== null, 'holdPct not null');
  assert(s.holdPct < 0, 'holdPct negative when host lost');
});

test('holdPct: 2 lost, 1 won → positive hold', function() {
  var tickets = [t('T1','lost',100,90.91), t('T2','lost',100,90.91), t('T3','won',100,90.91)];
  var s = calcHostStatsFromDb(tickets);
  assert(s.holdPct !== null, 'holdPct present');
  assert(s.holdPct > 0, 'positive hold: host profit > 0');
});

// ── Safety validation ─────────────────────────────────────────────────────────
console.log('\n── Safety validation ──');

test('validateHostStats: clean stats pass', function() {
  var s = calcHostStatsFromDb([t('T1','lost',100,90.91)]);
  var v = validateHostStats(s);
  assert(v.safe, 'clean stats: '+v.warnings.join(','));
});

test('validateHostStats: NaN in handle detected', function() {
  var bad = { handle:NaN, activeRisk:0, hostAtRisk:0, profit:0 };
  var v = validateHostStats(bad);
  assert(!v.safe, 'NaN detected');
  assert(v.warnings.includes('handle_is_NaN'), 'correct warning');
});

test('validateHostStats: negative activeRisk detected', function() {
  var bad = { handle:100, activeRisk:-50, hostAtRisk:0, profit:0 };
  var v = validateHostStats(bad);
  assert(!v.safe, 'negative detected');
  assert(v.warnings.includes('activeRisk_negative'), 'correct warning');
});

test('safe() coercion: NaN values become 0', function() {
  // Simulate calcHostStatsFromDb receiving bad data
  var s = calcHostStatsFromDb([{ status:'active', risk_amount:'bad_value', potential_profit:null }]);
  assert(!isNaN(s.handle), 'handle not NaN');
  assert(!isNaN(s.activeRisk), 'activeRisk not NaN');
  assertEq(s.activeBetCount, 1, 'ticket still counted');
});

// ── activeBetCount matches activeTickets.length ───────────────────────────────
console.log('\n── activeBetCount consistency ──');

test('activeBetCount === activeTickets.length', function() {
  var tickets = [t('T1','active'), t('T2','active'), t('T3','lost'), t('T4','canceled')];
  var s = calcHostStatsFromDb(tickets);
  var activeCount = tickets.filter(function(t){ var s=(t.status||'').toLowerCase(); return s==='active'||s==='open'; }).length;
  assertEq(s.activeBetCount, activeCount, 'counts match');
  assertEq(s.activeBetCount, 2, 'exactly 2 active');
});

// ── Fallback trigger ──────────────────────────────────────────────────────────
console.log('\n── Fallback decision ──');

function shouldFallback(dbResponse) {
  if (!dbResponse || !dbResponse.ok) return { fallback: true, reason: 'db_error_or_null' };
  var s = dbResponse.stats;
  if (!s) return { fallback: true, reason: 'missing_stats' };
  var v = validateHostStats(s);
  if (!v.safe) return { fallback: true, reason: 'invalid_stats:'+v.warnings.join(',') };
  return { fallback: false };
}

test('null response → fallback', function() {
  var r = shouldFallback(null);
  assert(r.fallback, 'null → fallback');
  assertEq(r.reason, 'db_error_or_null', 'reason');
});

test('ok=false → fallback', function() {
  var r = shouldFallback({ ok:false, error:'connection refused' });
  assert(r.fallback, 'ok=false → fallback');
});

test('missing stats → fallback', function() {
  var r = shouldFallback({ ok:true }); // no stats
  assert(r.fallback, 'missing stats → fallback');
});

test('NaN in stats → fallback', function() {
  var r = shouldFallback({ ok:true, stats:{ handle:NaN, activeRisk:0, hostAtRisk:0, profit:0 } });
  assert(r.fallback, 'NaN → fallback');
});

test('valid response → no fallback', function() {
  var s = calcHostStatsFromDb([t('T1','lost',100,90.91)]);
  var r = shouldFallback({ ok:true, stats:s });
  assert(!r.fallback, 'valid → no fallback');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Host DB read tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ HOST DB READ TESTS FAILED'); process.exit(1); }
else console.log('✅ All host DB read rules verified');
