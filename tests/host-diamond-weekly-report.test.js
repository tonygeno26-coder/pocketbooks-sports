/**
 * PocketBooks Sports — Phase AC: Host Diamond Weekly Reporting Tests
 * Run: node tests/host-diamond-weekly-report.test.js
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

const FEE = 15;

// ── Week start helper ─────────────────────────────────────────────────────────

function getWeekStart(nowMs) {
  var d = new Date(nowMs || Date.now());
  var day = d.getUTCDay();
  var diff = day === 0 ? -6 : 1 - day;
  var mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  return mon.toISOString().slice(0, 10);
}

// ── Report builder (mirrors endpoint logic) ───────────────────────────────────

function buildWeeklyReport(weekStart, activeBettorRows, ledgerRows, endingBalance) {
  var weekEnd = new Date(weekStart + 'T00:00:00Z');
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  var weekEndStr = weekEnd.toISOString().slice(0, 10);

  // Filter to this week
  var bettors = (activeBettorRows || []).filter(function(r) {
    var w = r.week_start || r.weekStart;
    return w === weekStart;
  });
  var ledger = (ledgerRows || []).filter(function(r) {
    var at = r.created_at || r.createdAt || '';
    return at >= weekStart && at < weekEndStr;
  });

  var totalCharges     = ledger.filter(function(r){ return (r.event_type||r.eventType||'').includes('CHARGE'); })
    .reduce(function(s,r){ return s+(r.amount_diamonds||r.amountDiamonds||0); },0);
  var totalTopups      = ledger.filter(function(r){ return (r.event_type||r.eventType||'').includes('TOPUP'); })
    .reduce(function(s,r){ return s+(r.amount_diamonds||r.amountDiamonds||0); },0);
  var totalAdjustments = ledger.filter(function(r){ return (r.event_type||r.eventType||'').includes('ADJUSTMENT'); })
    .reduce(function(s,r){ return s+(r.amount_diamonds||r.amountDiamonds||0); },0);

  return {
    weekStart,
    weekEnd:             weekEndStr,
    feePerActiveBettor:  FEE,
    endingHostBalance:   endingBalance != null ? endingBalance : null,
    totalActiveBettors:  bettors.length,
    totalCharges,
    totalTopups,
    totalAdjustments,
    activeBettors: bettors.map(function(r) {
      return {
        playerId:        r.player_id  || r.playerId,
        firstTicketId:   r.first_ticket_id || r.firstTicketId || null,
        activatedAt:     r.activated_at || r.activatedAt,
        chargedDiamonds: r.charged_diamonds || r.chargedDiamonds || FEE,
        chargeLedgerId:  r.charge_ledger_id || r.chargeLedgerId || null
      };
    }),
    ledgerRows: ledger.map(function(r) {
      return {
        eventType:      r.event_type    || r.eventType,
        direction:      r.direction,
        amountDiamonds: r.amount_diamonds || r.amountDiamonds,
        balanceBefore:  r.balance_before  != null ? r.balance_before  : r.balanceBefore,
        balanceAfter:   r.balance_after   != null ? r.balance_after   : r.balanceAfter,
        createdAt:      r.created_at || r.createdAt,
        reason:         r.reason || null
      };
    })
  };
}

// ── RBAC check ────────────────────────────────────────────────────────────────

const ROLE_RANK = { owner:5,full_admin:4,settlement_manager:3,risk_viewer:2,player:1,view_only:0 };

function canViewWeeklyReport(role) {
  return (ROLE_RANK[role]||0) >= ROLE_RANK.settlement_manager;
}

// ── CSV export builder ────────────────────────────────────────────────────────

function buildActiveBettorCSV(weekStart, activeBettors) {
  var header = 'weekStart,playerId,firstTicketId,activatedAt,chargedDiamonds';
  var rows = (activeBettors || []).map(function(b) {
    return [
      weekStart,
      b.playerId || '',
      b.firstTicketId || '',
      b.activatedAt || '',
      b.chargedDiamonds || FEE
    ].join(',');
  });
  return [header].concat(rows).join('\n');
}

// ── Sample data ───────────────────────────────────────────────────────────────

var WEEK1 = '2026-05-18';  // Monday
var WEEK2 = '2026-05-25';  // following Monday

var sampleBettors = [
  { player_id:'P1', week_start:WEEK1, first_ticket_id:'T001',
    activated_at: WEEK1+'T10:00:00Z', charged_diamonds:15, charge_ledger_id:'HAB_C1_P1' },
  { player_id:'P2', week_start:WEEK1, first_ticket_id:'T005',
    activated_at: WEEK1+'T11:00:00Z', charged_diamonds:15, charge_ledger_id:'HAB_C1_P2' },
  { player_id:'P3', week_start:WEEK2, first_ticket_id:'T010',
    activated_at: WEEK2+'T09:00:00Z', charged_diamonds:15, charge_ledger_id:'HAB_C1_P3' },
];

var sampleLedger = [
  { event_type:'HOST_DIAMOND_TOPUP',         direction:'credit', amount_diamonds:300,
    balance_before:0,   balance_after:300,  created_at: WEEK1+'T08:00:00Z', reason:'initial fund' },
  { event_type:'HOST_ACTIVE_BETTOR_CHARGE',  direction:'debit',  amount_diamonds:15,
    balance_before:300, balance_after:285,  created_at: WEEK1+'T10:00:00Z', reason:'P1' },
  { event_type:'HOST_ACTIVE_BETTOR_CHARGE',  direction:'debit',  amount_diamonds:15,
    balance_before:285, balance_after:270,  created_at: WEEK1+'T11:00:00Z', reason:'P2' },
  { event_type:'HOST_DIAMOND_TOPUP',         direction:'credit', amount_diamonds:100,
    balance_before:270, balance_after:370,  created_at: WEEK2+'T08:00:00Z', reason:'week2 topup' },
  { event_type:'HOST_ACTIVE_BETTOR_CHARGE',  direction:'debit',  amount_diamonds:15,
    balance_before:370, balance_after:355,  created_at: WEEK2+'T09:00:00Z', reason:'P3' },
  { event_type:'HOST_DIAMOND_ADJUSTMENT',    direction:'credit', amount_diamonds:30,
    balance_before:355, balance_after:385,  created_at: WEEK2+'T12:00:00Z', reason:'promo credit' },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── buildWeeklyReport: current week ──');

test('report for WEEK1 shows only WEEK1 bettors', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  assertEq(r.totalActiveBettors, 2, 'only P1+P2 in WEEK1');
  assert(r.activeBettors.every(function(b){ return ['P1','P2'].includes(b.playerId); }));
});

test('report for WEEK2 shows only WEEK2 bettors', function() {
  var r = buildWeeklyReport(WEEK2, sampleBettors, sampleLedger, 385);
  assertEq(r.totalActiveBettors, 1, 'only P3 in WEEK2');
  assertEq(r.activeBettors[0].playerId, 'P3');
});

test('report defaults week-start correctly', function() {
  var nowMs = new Date(WEEK1+'T14:00:00Z').getTime();
  var ws = getWeekStart(nowMs);
  assertEq(ws, WEEK1, 'Monday returns itself');
});

test('report can fetch prior week (WEEK1)', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  assertEq(r.weekStart, WEEK1);
  assertEq(r.totalActiveBettors, 2);
});

test('totalCharges = sum of charge events in week', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  assertEq(r.totalCharges, 30, '2 × 15 = 30');
});

test('totalTopups = sum of topup events in week', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  assertEq(r.totalTopups, 300, 'initial fund 300d');
});

test('totalAdjustments = sum of adjustment events in week', function() {
  var r = buildWeeklyReport(WEEK2, sampleBettors, sampleLedger, 385);
  assertEq(r.totalAdjustments, 30, 'promo credit 30d');
});

console.log('\n── activeBettors[] matches weekly_active_bettors rows ──');

test('activeBettors list includes playerId, activatedAt, chargedDiamonds', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  var p1 = r.activeBettors.find(function(b){ return b.playerId==='P1'; });
  assert(p1, 'P1 present');
  assertEq(p1.chargedDiamonds, 15);
  assert(p1.activatedAt.includes(WEEK1));
  assertEq(p1.firstTicketId, 'T001');
  assert(p1.chargeLedgerId, 'ledger id present');
});

test('activeBettors count matches rows for that week only', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  assertEq(r.activeBettors.length, 2);
});

console.log('\n── ledgerRows match host_diamond_ledger rows ──');

test('ledgerRows only contain entries from the report week', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  assert(r.ledgerRows.every(function(l){ return l.createdAt>=WEEK1 && l.createdAt<WEEK2; }),
    'all rows in WEEK1 window');
});

test('ledgerRows include eventType, direction, amountDiamonds, balanceBefore, balanceAfter', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  var topup = r.ledgerRows.find(function(l){ return l.eventType==='HOST_DIAMOND_TOPUP'; });
  assert(topup, 'topup row present');
  assertEq(topup.direction, 'credit');
  assertEq(topup.amountDiamonds, 300);
  assertEq(topup.balanceBefore, 0);
  assertEq(topup.balanceAfter, 300);
  assert(topup.reason, 'reason present');
});

test('ledgerRows count matches filtered entries for week', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  // WEEK1 has: 1 topup + 2 charges = 3 rows
  assertEq(r.ledgerRows.length, 3);
});

console.log('\n── RBAC ──');

test('settlement_manager can view weekly report', function() {
  assert(canViewWeeklyReport('settlement_manager'), 'settlement_manager allowed');
});

test('full_admin can view weekly report', function() {
  assert(canViewWeeklyReport('full_admin'));
});

test('owner can view weekly report', function() {
  assert(canViewWeeklyReport('owner'));
});

test('player cannot view weekly report', function() {
  assert(!canViewWeeklyReport('player'), 'player blocked');
});

test('view_only cannot view weekly report', function() {
  assert(!canViewWeeklyReport('view_only'));
});

test('risk_viewer cannot view weekly report', function() {
  assert(!canViewWeeklyReport('risk_viewer'), 'risk_viewer below settlement_manager');
});

console.log('\n── CSV export ──');

test('CSV header contains expected columns', function() {
  var csv = buildActiveBettorCSV(WEEK1, []);
  assertEq(csv.trim(), 'weekStart,playerId,firstTicketId,activatedAt,chargedDiamonds');
});

test('CSV contains one row per active bettor', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  var csv = buildActiveBettorCSV(WEEK1, r.activeBettors);
  var lines = csv.split('\n').filter(function(l){ return l.trim(); });
  assertEq(lines.length, 3, 'header + 2 bettors');
});

test('CSV row contains correct weekStart', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  var csv = buildActiveBettorCSV(WEEK1, r.activeBettors);
  var lines = csv.split('\n');
  assert(lines[1].startsWith(WEEK1), 'weekStart in row');
});

test('CSV row contains playerId', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  var csv = buildActiveBettorCSV(WEEK1, r.activeBettors);
  assert(csv.includes('P1') && csv.includes('P2'), 'player IDs in CSV');
});

test('CSV row contains chargedDiamonds', function() {
  var r = buildWeeklyReport(WEEK1, sampleBettors, sampleLedger, 270);
  var csv = buildActiveBettorCSV(WEEK1, r.activeBettors);
  assert(csv.includes('15'), '15 diamonds in CSV');
});

test('empty activeBettors produces header-only CSV', function() {
  var csv = buildActiveBettorCSV(WEEK1, []);
  assertEq(csv.trim(), 'weekStart,playerId,firstTicketId,activatedAt,chargedDiamonds');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Host diamond weekly report tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ HOST DIAMOND WEEKLY REPORT TESTS FAILED'); process.exit(1); }
else console.log('✅ All host diamond weekly report rules verified');
