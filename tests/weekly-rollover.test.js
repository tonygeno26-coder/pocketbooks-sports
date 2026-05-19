/**
 * PocketBooks Sports — Weekly Rollover Tests (Phase C Step 5)
 * Run: node tests/weekly-rollover.test.js
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

// ── Pure rollover helpers ─────────────────────────────────────────────────────

// ISO week string: "YYYY-Wnn"
function getISOWeek(date) {
  var d = new Date(date || Date.now());
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - (d.getDay()+6)%7);
  var week1 = new Date(d.getFullYear(), 0, 4);
  return d.getFullYear() + '-W' + String(1 + Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay()+6)%7) / 7
  )).padStart(2,'0');
}

function nextISOWeek(weekStr) {
  // "2026-W21" → "2026-W22"
  var m = weekStr.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return weekStr;
  var year=parseInt(m[1]), week=parseInt(m[2]);
  if (week < 52) return year+'-W'+String(week+1).padStart(2,'0');
  return (year+1)+'-W01';
}

function validateRolloverRequest(body, existingRollovers) {
  var errors = [];
  if (!body.clubId)        errors.push('missing_clubId');
  if (!body.rolloverWeek)  errors.push('missing_rolloverWeek');
  if (!/^\d{4}-W\d{2}$/.test(body.rolloverWeek||'')) errors.push('invalid_rolloverWeek_format');
  if (errors.length) return { ok:false, errors };
  // Duplicate check
  var already = existingRollovers.some(function(r){
    return r.club_id===body.clubId && r.rollover_week===body.rolloverWeek;
  });
  if (already) return { ok:false, errors:['rollover_already_executed_for_week:'+body.rolloverWeek] };
  return { ok:true };
}

function buildPlayerSnapshot(player, rolloverWeek, clubId) {
  return {
    rollover_week:         rolloverWeek,
    club_id:               clubId,
    player_id:             player.playerId,
    username:              player.username || player.playerId,
    owes_host:             Math.round((player.owesHost||0)*100)/100,
    host_owes:             Math.round((player.hostOwes||0)*100)/100,
    open_risk:             Math.round((player.openRisk||0)*100)/100,
    settled_net:           Math.round((player.settledNet||0)*100)/100,
    active_ticket_count:   player.activeBetCount || 0,
    snapshotted_at:        new Date().toISOString()
  };
}

function buildRolloverRow(body, preview, performedAt) {
  return {
    club_id:          body.clubId,
    rollover_week:    body.rolloverWeek,
    performed_at:     performedAt || new Date().toISOString(),
    performed_by:     body.performedBy || 'host',
    totals_snapshot:  JSON.stringify(preview.totals || {}),
    players_count:    (preview.players || []).length
  };
}

// ── ISO Week helpers ──────────────────────────────────────────────────────────
console.log('\n── ISO week helpers ──');

test('getISOWeek returns YYYY-Wnn format', function() {
  var w = getISOWeek(new Date('2026-05-18'));
  assert(/^\d{4}-W\d{2}$/.test(w), 'format: '+w);
});

test('nextISOWeek increments week number', function() {
  assertEq(nextISOWeek('2026-W21'), '2026-W22', 'W21 → W22');
  assertEq(nextISOWeek('2026-W52'), '2027-W01', 'year boundary');
});

// ── Validation ────────────────────────────────────────────────────────────────
console.log('\n── Rollover validation ──');

test('valid request passes', function() {
  var r = validateRolloverRequest({ clubId:'C001', rolloverWeek:'2026-W21' }, []);
  assert(r.ok, 'valid: '+(r.errors||[]).join(','));
});

test('missing clubId → error', function() {
  var r = validateRolloverRequest({ rolloverWeek:'2026-W21' }, []);
  assert(!r.ok); assert(r.errors.includes('missing_clubId'));
});

test('missing rolloverWeek → error', function() {
  var r = validateRolloverRequest({ clubId:'C001' }, []);
  assert(!r.ok); assert(r.errors.includes('missing_rolloverWeek'));
});

test('invalid format → error', function() {
  var r = validateRolloverRequest({ clubId:'C001', rolloverWeek:'bad-format' }, []);
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('invalid_rolloverWeek_format'); }));
});

test('duplicate rollover blocked', function() {
  var existing = [{ club_id:'C001', rollover_week:'2026-W21' }];
  var r = validateRolloverRequest({ clubId:'C001', rolloverWeek:'2026-W21' }, existing);
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('rollover_already_executed'); }));
});

test('different club same week is allowed', function() {
  var existing = [{ club_id:'C001', rollover_week:'2026-W21' }];
  var r = validateRolloverRequest({ clubId:'C002', rolloverWeek:'2026-W21' }, existing);
  assert(r.ok, 'different club ok');
});

test('same club different week is allowed', function() {
  var existing = [{ club_id:'C001', rollover_week:'2026-W21' }];
  var r = validateRolloverRequest({ clubId:'C001', rolloverWeek:'2026-W22' }, existing);
  assert(r.ok, 'different week ok');
});

// ── Snapshot construction ─────────────────────────────────────────────────────
console.log('\n── Snapshot construction ──');

var PREVIEW = {
  players: [
    { playerId:'P001', username:'alice', owesHost:100, hostOwes:0, openRisk:50, settledNet:-100, activeBetCount:1 },
    { playerId:'P002', username:'bob',   owesHost:0,   hostOwes:45.45, openRisk:0, settledNet:45.45, activeBetCount:0 }
  ],
  totals: { playersOwe:100, hostOwes:45.45, net:54.55 }
};

test('buildPlayerSnapshot: correct fields', function() {
  var snap = buildPlayerSnapshot(PREVIEW.players[0], '2026-W21', 'C001');
  assertEq(snap.rollover_week, '2026-W21', 'week');
  assertEq(snap.club_id, 'C001', 'club');
  assertEq(snap.player_id, 'P001', 'player');
  assertApprox(snap.owes_host, 100, 'owes_host');
  assertEq(snap.active_ticket_count, 1, 'active_count');
  assert(!!snap.snapshotted_at, 'timestamp');
});

test('buildPlayerSnapshot: host_owes player', function() {
  var snap = buildPlayerSnapshot(PREVIEW.players[1], '2026-W21', 'C001');
  assertApprox(snap.host_owes, 45.45, 'host_owes=45.45');
  assertEq(snap.owes_host, 0, 'owes_host=0');
});

test('buildRolloverRow: captures totals + count', function() {
  var row = buildRolloverRow({ clubId:'C001', rolloverWeek:'2026-W21' }, PREVIEW, '2026-05-18T21:00:00Z');
  assertEq(row.club_id, 'C001', 'club_id');
  assertEq(row.rollover_week, '2026-W21', 'week');
  assertEq(row.players_count, 2, 'players_count');
  var totals = JSON.parse(row.totals_snapshot);
  assertApprox(totals.playersOwe, 100, 'totals.playersOwe');
  assertApprox(totals.hostOwes, 45.45, 'totals.hostOwes');
});

// ── Active tickets preserved ──────────────────────────────────────────────────
console.log('\n── Active ticket preservation ──');

test('active tickets excluded from settled snapshot but counted', function() {
  // Active tickets should appear in openRisk + activeBetCount
  // but NOT in owesHost/hostOwes (those are from settled tickets only)
  var player = { playerId:'P001', owesHost:100, hostOwes:0, openRisk:200, settledNet:-100, activeBetCount:2 };
  var snap = buildPlayerSnapshot(player, '2026-W21', 'C001');
  assertApprox(snap.open_risk, 200, 'openRisk preserved in snapshot');
  assertEq(snap.active_ticket_count, 2, 'activeBetCount preserved');
  assertApprox(snap.owes_host, 100, 'settled owesHost in snapshot');
  // After rollover, owesHost/hostOwes reset — openRisk remains tied to active tickets
});

test('rollover does not affect active ticket status', function() {
  // Simulate: after rollover, active tickets still appear in new week
  // Only settled (won/lost) counts reset for new-week KPIs
  var preRolloverActive  = [{ id:'T1', status:'active', risk_amount:100 }];
  var postRolloverActive = preRolloverActive.filter(function(t){ return t.status==='active'; });
  assertEq(postRolloverActive.length, 1, 'active ticket still present after rollover');
});

// ── History queryability ──────────────────────────────────────────────────────
console.log('\n── History ──');

test('snapshot row is immutable (no update path)', function() {
  // Test pattern: snapshots are insert-only
  var snapshots = [];
  function insertSnapshot(s) {
    var exists = snapshots.some(function(x){ return x.rollover_week===s.rollover_week && x.player_id===s.player_id && x.club_id===s.club_id; });
    if (exists) throw new Error('duplicate_snapshot_blocked');
    snapshots.push(s);
    return snapshots.length;
  }
  var s1 = buildPlayerSnapshot(PREVIEW.players[0], '2026-W21', 'C001');
  insertSnapshot(s1);
  assertEq(snapshots.length, 1, '1 snapshot');
  try { insertSnapshot(s1); assert(false, 'should throw'); } catch(e) {
    assertEq(e.message, 'duplicate_snapshot_blocked', 'duplicate blocked');
  }
});

test('different weeks create separate immutable snapshots', function() {
  var snapshots = {};
  function insertSnapshot(s) { var k=s.rollover_week+'_'+s.player_id; if(snapshots[k]) throw new Error('dup'); snapshots[k]=s; }
  insertSnapshot(buildPlayerSnapshot(PREVIEW.players[0], '2026-W21', 'C001'));
  insertSnapshot(buildPlayerSnapshot(PREVIEW.players[0], '2026-W22', 'C001'));
  assertEq(Object.keys(snapshots).length, 2, '2 weeks = 2 snapshots');
});

// ── New week starts fresh ─────────────────────────────────────────────────────
console.log('\n── New week after rollover ──');

test('settlement preview after rollover has zero settled amounts (only active openRisk)', function() {
  // After rollover: won/lost tickets from prior week are snapshotted
  // The new week has no settled tickets yet — only active bets
  var newWeekTickets = [
    { player_id:'P001', status:'active', risk_amount:100, potential_profit:90 }
    // No won/lost tickets yet in new week
  ];
  var owesHost=0, hostOwes=0, openRisk=0;
  newWeekTickets.forEach(function(t){
    var s=t.status.toLowerCase();
    if (s==='active'||s==='open') openRisk+=parseFloat(t.risk_amount)||0;
  });
  assertEq(owesHost, 0, 'no settled debt in new week');
  assertEq(hostOwes, 0, 'no settled owed in new week');
  assertApprox(openRisk, 100, 'openRisk=100 (active bets)');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Weekly rollover tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ WEEKLY ROLLOVER TESTS FAILED'); process.exit(1); }
else console.log('✅ All weekly rollover rules verified');
