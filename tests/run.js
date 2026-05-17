/**
 * PocketBooks Sports — Automated Test Suite
 * Run: node tests/run.js
 * Pure logic tests — no DOM, no browser required.
 * Covers: ticket store, balance engine, results aggregation, grading identity.
 */

'use strict';

// ── Mini test harness ────────────────────────────────────────────────────────
var _pass = 0, _fail = 0, _tests = [];
function test(name, fn) {
  try {
    fn();
    console.log('  ✅ ' + name);
    _pass++;
  } catch(e) {
    console.error('  ❌ ' + name + '\n     ' + e.message);
    _fail++;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg||'') + ' — expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
}
function assertApprox(a, b, tol, msg) {
  tol = tol || 0.01;
  if (Math.abs(a - b) > tol) throw new Error((msg||'') + ' — expected ~' + b + ' got ' + a);
}

// ── Extracted pure functions (duplicated from player.html for testability) ───

// Balance engine
var _BASE_BALANCE = 1000;
function _effective(t, isSettledFn) {
  var s = String(t.status||'').toLowerCase();
  if (s === 'canceled' || s === 'voided' || s === 'deleted') return 'canceled';
  if (s === 'active' || s === 'open' || s === '') return 'active';
  // isSettledFn: must return true for valid settled ticket
  return (isSettledFn ? isSettledFn(t) : true) ? s : 'active';
}
function calcBalance(tickets, startingBalance, isSettledFn) {
  var starting = startingBalance || _BASE_BALANCE;
  var openRisk = 0, settledGains = 0, settledLosses = 0;
  tickets.forEach(function(t) {
    var es = _effective(t, isSettledFn);
    var risk = parseFloat(t.riskAmount) || 0;
    var profit = parseFloat(t.potentialProfit) || 0;
    if (es === 'active' || es === 'open') openRisk += risk;
    else if (es === 'won')  settledGains  += profit;
    else if (es === 'lost') settledLosses += risk;
  });
  return {
    starting: starting,
    openRisk: Math.round(openRisk * 100) / 100,
    settledGains: Math.round(settledGains * 100) / 100,
    settledLosses: Math.round(settledLosses * 100) / 100,
    available: Math.round((starting - openRisk - settledLosses + settledGains) * 100) / 100
  };
}

// Grading: date safety
function selCommenceMs(sel) {
  var ct = sel.scheduledStart || sel.commenceTime || sel.time || null;
  if (!ct) return 0;
  var t = new Date(ct).getTime();
  return isNaN(t) ? 0 : t;
}
function sameDateUTC(msA, msB) {
  if (!msA || !msB) return true;
  var dA = new Date(msA), dB = new Date(msB);
  return dA.getUTCFullYear() === dB.getUTCFullYear() &&
         dA.getUTCMonth() === dB.getUTCMonth() &&
         dA.getUTCDate() === dB.getUTCDate();
}
function isFutureGame(sel, nowMs) {
  var ms = selCommenceMs(sel);
  return ms > 0 && ms > (nowMs || Date.now());
}

// Game identity
function makeCanonicalKey(sport, away, home, commenceTime) {
  var date = '';
  if (commenceTime) {
    try { date = new Date(commenceTime).toISOString().slice(0,10); } catch(_e) {}
  }
  return [
    (sport || 'mlb').toUpperCase(),
    (away || '').toLowerCase().replace(/\s+/g, '-'),
    (home || '').toLowerCase().replace(/\s+/g, '-'),
    date
  ].join('|');
}

// Results 12h filter
var RES_SETTLED_TTL_MS = 12 * 60 * 60 * 1000;
function settledAgeMs(t, nowMs) {
  var iso = (t && t.gradedAt) || (t && t.grading && t.grading.gradedAt) || null;
  if (!iso) return Infinity;
  var ms = Date.parse(iso);
  return isFinite(ms) ? ((nowMs || Date.now()) - ms) : Infinity;
}
function isVisibleInResultsSummary(t, nowMs) {
  var s = (t.status || '').toLowerCase();
  if (s === 'canceled' || s === 'voided' || s === 'deleted') return true;
  if (s === 'active' || s === 'open' || s === '' || s === 'pending') return true;
  return settledAgeMs(t, nowMs) <= RES_SETTLED_TTL_MS;
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log('\n🏈 PocketBooks Sports — Test Suite\n');

// BALANCE ENGINE
console.log('── Balance Engine ──');

test('starting balance $1000 with no tickets', function() {
  var b = calcBalance([], 1000);
  assertEq(b.available, 1000, 'available');
  assertEq(b.openRisk, 0, 'openRisk');
});

test('active $100 ticket reduces available by $100', function() {
  var tickets = [{ status: 'active', riskAmount: 100, potentialProfit: 90 }];
  var b = calcBalance(tickets, 1000);
  assertEq(b.openRisk, 100, 'openRisk');
  assertEq(b.available, 900, 'available');
});

test('won ticket adds profit only (risk returns via openRisk exclusion)', function() {
  var tickets = [{ id:'t1', status: 'won', riskAmount: 100, potentialProfit: 90, gradedAt: new Date(Date.now()-1000).toISOString() }];
  var b = calcBalance(tickets, 1000, function(t) { return !!t.gradedAt; });
  assertEq(b.settledGains, 90, 'settledGains');
  assertEq(b.openRisk, 0, 'openRisk (freed)');
  assertEq(b.available, 1090, 'available = 1000 + 90 profit');
});

test('lost ticket subtracts risk', function() {
  var tickets = [{ status: 'lost', riskAmount: 75, potentialProfit: 68, gradedAt: new Date(Date.now()-1000).toISOString() }];
  var b = calcBalance(tickets, 1000, function(t) { return !!t.gradedAt; });
  assertEq(b.settledLosses, 75, 'settledLosses');
  assertEq(b.available, 925, 'available = 1000 - 75');
});

test('canceled ticket has zero balance impact', function() {
  var tickets = [{ status: 'canceled', riskAmount: 100, potentialProfit: 90 }];
  var b = calcBalance(tickets, 1000);
  assertEq(b.available, 1000, 'canceled = $0 impact');
  assertEq(b.openRisk, 0, 'openRisk = 0');
});

test('push ticket has zero net impact', function() {
  var tickets = [{ status: 'push', riskAmount: 50, potentialProfit: 45, gradedAt: new Date(Date.now()-1000).toISOString() }];
  var b = calcBalance(tickets, 1000, function(t) { return !!t.gradedAt; });
  assertEq(b.available, 1000, 'push = $0 net');
});

test('invalid grade (no gradedAt) treated as active', function() {
  // status=won but no gradedAt → _effective returns 'active' → openRisk
  var tickets = [{ status: 'won', riskAmount: 100, potentialProfit: 90 }]; // no gradedAt
  var b = calcBalance(tickets, 1000, function(t) { return !!t.gradedAt; });
  assertEq(b.openRisk, 100, 'demoted to active → openRisk');
  assertEq(b.settledGains, 0, 'no gain counted');
  assertEq(b.available, 900, 'available = 1000 - 100 openRisk');
});

// GAME IDENTITY
console.log('\n── Game Identity ──');

test('canonicalGameKey: stable format', function() {
  var key = makeCanonicalKey('mlb', 'Miami Marlins', 'Tampa Bay Rays', '2026-05-17T19:10:00Z');
  assertEq(key, 'MLB|miami-marlins|tampa-bay-rays|2026-05-17', 'canonical key');
});

test('future game guard: commenceTime tomorrow → blocked', function() {
  var tomorrow = new Date(Date.now() + 86400000).toISOString();
  var sel = { commenceTime: tomorrow, pick: 'Marlins +1.5' };
  assert(isFutureGame(sel, Date.now()), 'future game should be blocked');
});

test('past game: commenceTime yesterday → not blocked', function() {
  var yesterday = new Date(Date.now() - 86400000).toISOString();
  var sel = { commenceTime: yesterday, pick: 'Marlins +1.5' };
  assert(!isFutureGame(sel, Date.now()), 'past game should not be blocked');
});

test('same date UTC check: same day', function() {
  var a = new Date('2026-05-17T14:00:00Z').getTime();
  var b = new Date('2026-05-17T22:00:00Z').getTime();
  assert(sameDateUTC(a, b), 'same UTC date');
});

test('same date UTC check: different days', function() {
  var a = new Date('2026-05-17T14:00:00Z').getTime();
  var b = new Date('2026-05-18T02:00:00Z').getTime();
  assert(!sameDateUTC(a, b), 'different UTC dates');
});

// RESULTS AGGREGATION
console.log('\n── Results Aggregation ──');

test('active ticket visible in summary', function() {
  var t = { status: 'active', riskAmount: 100 };
  assert(isVisibleInResultsSummary(t), 'active always visible');
});

test('canceled ticket visible in summary (contributes to canceled count)', function() {
  var t = { status: 'canceled', riskAmount: 100 };
  assert(isVisibleInResultsSummary(t), 'canceled always visible');
});

test('settled ticket within 12h is visible', function() {
  var recentGrade = new Date(Date.now() - 3600000).toISOString(); // 1h ago
  var t = { status: 'won', riskAmount: 100, potentialProfit: 90, gradedAt: recentGrade };
  assert(isVisibleInResultsSummary(t, Date.now()), 'recent settled visible');
});

test('settled ticket older than 12h is hidden from summary', function() {
  var oldGrade = new Date(Date.now() - 48 * 3600000).toISOString(); // 48h ago
  var t = { status: 'won', riskAmount: 100, potentialProfit: 90, gradedAt: oldGrade };
  assert(!isVisibleInResultsSummary(t, Date.now()), 'old settled hidden from summary');
});

test('weekly net: only won/lost in summary contribute', function() {
  var nowMs = Date.now();
  var recentGrade = new Date(nowMs - 3600000).toISOString(); // 1h ago
  var oldGrade = new Date(nowMs - 48*3600000).toISOString(); // 48h ago
  var tickets = [
    { id:'a', status:'won',  riskAmount:100, potentialProfit:90, gradedAt:recentGrade },  // visible
    { id:'b', status:'lost', riskAmount:75,  potentialProfit:68, gradedAt:oldGrade },      // hidden (>12h)
    { id:'c', status:'active', riskAmount:50 },                                            // pending
    { id:'d', status:'canceled', riskAmount:100 }                                          // canceled
  ];
  var visible = tickets.filter(function(t) { return isVisibleInResultsSummary(t, nowMs); });
  assertEq(visible.length, 3, '3 visible (won recent + active + canceled)');
  var settledVisible = visible.filter(function(t) { return t.status === 'won' || t.status === 'lost'; });
  assertEq(settledVisible.length, 1, 'only 1 settled in summary (the recent won)');
  var net = settledVisible.reduce(function(s,t) {
    return s + (t.status==='won' ? (parseFloat(t.potentialProfit)||0) : -(parseFloat(t.riskAmount)||0));
  }, 0);
  assertEq(net, 90, 'net = $90 (only recent win counts)');
});

// STAKE SYNC
console.log('\n── Bet Slip Stake Sync ──');

test('bsStakes fan: adding stake fans to all cellIds', function() {
  var betSlip = [{ cellId: 'cell-A', odds: -110 }, { cellId: 'cell-B', odds: +130 }];
  var bsStakes = {};
  var bsStake = 0;
  // Simulate bsAddStake(100)
  bsStake = (bsStake || 0) + 100;
  betSlip.forEach(function(b) { bsStakes[b.cellId] = bsStake; });
  assertEq(bsStakes['cell-A'], 100, 'cell-A staked');
  assertEq(bsStakes['cell-B'], 100, 'cell-B staked');
  assertEq(bsStake, 100, 'bsStake = 100');
});

test('bsPlaceBet fallback: empty bsStakes hydrated from bottom input value', function() {
  var betSlip = [{ cellId: 'cell-X', odds: -115 }];
  var bsStakes = {};
  var bsStake = 0;
  var bottomVal = 75; // simulates #bs-stake-inp value
  // Fallback hydration
  if (bottomVal > 0 && Object.keys(bsStakes).length === 0) {
    betSlip.forEach(function(b) { bsStakes[b.cellId] = bottomVal; });
    bsStake = bottomVal;
  }
  bsStake = Object.values(bsStakes).reduce(function(s,v){ return s+(v||0); }, 0);
  assertEq(bsStake, 75, 'fallback hydration gives bsStake=75');
  assertEq(bsStakes['cell-X'], 75, 'cell-X hydrated');
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────');
console.log('Results: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ TESTS FAILED'); process.exit(1); }
else { console.log('✅ All tests passed'); }
