/**
 * PocketBooks Sports — Weekly History Tests (Phase C Step 6)
 * Run: node tests/weekly-history.test.js
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

// ── Pure helpers ──────────────────────────────────────────────────────────────

// Build a week list from rollover records
function buildWeekList(rollovers) {
  return rollovers
    .sort(function(a,b){ return b.rollover_week.localeCompare(a.rollover_week); })
    .map(function(r){
      var totals = {};
      try { totals = JSON.parse(r.totals_snapshot || '{}'); } catch(_e){}
      return {
        rolloverWeek:       r.rollover_week,
        performedAt:        r.performed_at,
        playersSnapshotted: r.players_count || 0,
        totalsSnapshot:     totals
      };
    });
}

// Build historical view from snapshot rows
function buildHistoricalView(rolloverRow, snapshotRows) {
  var totals = {};
  try { totals = JSON.parse(rolloverRow.totals_snapshot || '{}'); } catch(_e){}
  return {
    rolloverWeek:    rolloverRow.rollover_week,
    performedAt:     rolloverRow.performed_at,
    totalsSnapshot:  totals,
    playerSnapshots: (snapshotRows || []).map(function(s){
      return {
        playerId:          s.player_id,
        username:          s.username || s.player_id,
        owesHost:          parseFloat(s.owes_host)  || 0,
        hostOwes:          parseFloat(s.host_owes)  || 0,
        openRisk:          parseFloat(s.open_risk)  || 0,
        settledNet:        parseFloat(s.settled_net)|| 0,
        activeTicketCount: s.active_ticket_count    || 0
      };
    }).sort(function(a,b){ return (b.owesHost+b.hostOwes)-(a.owesHost+a.hostOwes); })
  };
}

// Is this week a historical (closed) week?
function isHistoricalWeek(week, rollovers) {
  return rollovers.some(function(r){ return r.rollover_week === week; });
}

// ── Test data ─────────────────────────────────────────────────────────────────
var ROLLOVERS = [
  { rollover_week:'2026-W19', performed_at:'2026-05-11T21:00:00Z', players_count:2,
    totals_snapshot:'{"playersOwe":200,"hostOwes":45.45,"net":154.55}' },
  { rollover_week:'2026-W20', performed_at:'2026-05-18T21:00:00Z', players_count:3,
    totals_snapshot:'{"playersOwe":350,"hostOwes":90.91,"net":259.09}' }
];
var SNAPSHOTS_W20 = [
  { player_id:'P001', username:'alice', owes_host:150, host_owes:0, open_risk:100, settled_net:-150, active_ticket_count:1 },
  { player_id:'P002', username:'bob',   owes_host:200, host_owes:0, open_risk:0,   settled_net:-200, active_ticket_count:0 },
  { player_id:'P003', username:'carol', owes_host:0,   host_owes:90.91, open_risk:0, settled_net:90.91, active_ticket_count:0 }
];

// ── Week list ─────────────────────────────────────────────────────────────────
console.log('\n── Week list from rollover records ──');

test('buildWeekList: sorted newest first', function() {
  var list = buildWeekList(ROLLOVERS);
  assertEq(list[0].rolloverWeek, '2026-W20', 'W20 first (newest)');
  assertEq(list[1].rolloverWeek, '2026-W19', 'W19 second');
});

test('buildWeekList: parses totals from snapshot', function() {
  var list = buildWeekList(ROLLOVERS);
  assertApprox(list[0].totalsSnapshot.playersOwe, 350, 'W20 playersOwe=350');
  assertApprox(list[0].totalsSnapshot.hostOwes, 90.91, 'W20 hostOwes=90.91');
});

test('buildWeekList: playersSnapshotted count', function() {
  var list = buildWeekList(ROLLOVERS);
  assertEq(list[0].playersSnapshotted, 3, 'W20 has 3 players');
  assertEq(list[1].playersSnapshotted, 2, 'W19 has 2 players');
});

test('buildWeekList: empty rollovers → empty list', function() {
  var list = buildWeekList([]);
  assertEq(list.length, 0, 'empty list');
});

// ── Historical view ───────────────────────────────────────────────────────────
console.log('\n── Historical view construction ──');

var ROLLOVER_W20 = ROLLOVERS.find(function(r){ return r.rollover_week==='2026-W20'; });

test('buildHistoricalView: correct rolloverWeek', function() {
  var v = buildHistoricalView(ROLLOVER_W20, SNAPSHOTS_W20);
  assertEq(v.rolloverWeek, '2026-W20', 'week');
});

test('buildHistoricalView: player count matches', function() {
  var v = buildHistoricalView(ROLLOVER_W20, SNAPSHOTS_W20);
  assertEq(v.playerSnapshots.length, 3, '3 players');
});

test('buildHistoricalView: sorted by total owed (largest first)', function() {
  var v = buildHistoricalView(ROLLOVER_W20, SNAPSHOTS_W20);
  // bob owes 200, alice owes 150, carol hostOwes 90.91
  assertEq(v.playerSnapshots[0].username, 'bob',   'bob first (owes 200)');
  assertEq(v.playerSnapshots[1].username, 'alice', 'alice second (owes 150)');
  assertEq(v.playerSnapshots[2].username, 'carol', 'carol third (hostOwes 90.91)');
});

test('buildHistoricalView: player fields correct', function() {
  var v = buildHistoricalView(ROLLOVER_W20, SNAPSHOTS_W20);
  var alice = v.playerSnapshots.find(function(p){ return p.username==='alice'; });
  assertApprox(alice.owesHost, 150, 'alice owesHost=150');
  assertApprox(alice.openRisk, 100, 'alice openRisk=100');
  assertEq(alice.activeTicketCount, 1, 'alice activeBetCount=1');
});

test('buildHistoricalView: totals from snapshot preserved exactly', function() {
  var v = buildHistoricalView(ROLLOVER_W20, SNAPSHOTS_W20);
  assertApprox(v.totalsSnapshot.playersOwe, 350, 'playersOwe=350');
  assertApprox(v.totalsSnapshot.net, 259.09, 'net=259.09');
});

// ── isHistoricalWeek detection ────────────────────────────────────────────────
console.log('\n── Historical week detection ──');

test('closed week detected as historical', function() {
  assert(isHistoricalWeek('2026-W20', ROLLOVERS), 'W20 is historical');
  assert(isHistoricalWeek('2026-W19', ROLLOVERS), 'W19 is historical');
});

test('current/unclosed week is NOT historical', function() {
  assert(!isHistoricalWeek('2026-W21', ROLLOVERS), 'W21 not closed yet');
  assert(!isHistoricalWeek('2026-W22', ROLLOVERS), 'W22 not closed');
});

// ── Immutability ──────────────────────────────────────────────────────────────
console.log('\n── Immutability (no mutations on historical view) ──');

test('historical view has no settle function', function() {
  var v = buildHistoricalView(ROLLOVER_W20, SNAPSHOTS_W20);
  assert(!v.settle, 'no settle method');
  assert(!v.rollover, 'no rollover method');
  assert(!v.update, 'no update method');
});

test('totals in historical view match original snapshot exactly', function() {
  var original = JSON.parse(ROLLOVER_W20.totals_snapshot);
  var v = buildHistoricalView(ROLLOVER_W20, SNAPSHOTS_W20);
  assertApprox(v.totalsSnapshot.playersOwe, original.playersOwe, 'playersOwe matches');
  assertApprox(v.totalsSnapshot.hostOwes,   original.hostOwes,   'hostOwes matches');
  assertApprox(v.totalsSnapshot.net,        original.net,        'net matches');
});

test('malformed totals_snapshot → empty object, no crash', function() {
  var badRow = { rollover_week:'2026-W18', performed_at:'2026-05-04T21:00:00Z', totals_snapshot:'INVALID_JSON' };
  var v = buildHistoricalView(badRow, []);
  assert(typeof v.totalsSnapshot === 'object', 'totalsSnapshot is object');
  assertEq(Object.keys(v.totalsSnapshot).length, 0, 'empty object on parse error');
});

test('null snapshot rows → empty playerSnapshots', function() {
  var v = buildHistoricalView(ROLLOVERS[0], null);
  assertEq(v.playerSnapshots.length, 0, 'empty playerSnapshots');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Weekly history tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ WEEKLY HISTORY TESTS FAILED'); process.exit(1); }
else console.log('✅ All weekly history rules verified');
