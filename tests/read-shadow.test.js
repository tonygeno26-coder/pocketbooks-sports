/**
 * PocketBooks Sports — Read Shadow Mode Tests (Phase B Step 1)
 * Run: node tests/read-shadow.test.js
 * Tests comparison logic only — no real network calls.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}

// ── Pure comparison logic (mirrors what we add to player.html) ────────────────

function compareTicketSets(localTickets, dbTickets) {
  var localIds = new Set(localTickets.map(function(t){ return t.id; }));
  var dbIds    = new Set(dbTickets.map(function(t){ return t.id; }));

  var missingInDb    = localTickets.filter(function(t){ return !dbIds.has(t.id); });
  var missingInLocal = dbTickets.filter(function(t){ return !localIds.has(t.id); });

  // Check status mismatches for tickets that exist in both
  var mismatched = [];
  localTickets.forEach(function(lt) {
    var dt = dbTickets.find(function(d){ return d.id === lt.id; });
    if (!dt) return;
    var ls = (lt.status||'').toLowerCase();
    var ds = (dt.status||'').toLowerCase();
    // Only flag if settled-vs-active mismatch (ignore minor status label differences)
    var lSettled = ls === 'won' || ls === 'lost' || ls === 'push';
    var dSettled = ds === 'won' || ds === 'lost' || ds === 'push';
    if (lSettled !== dSettled) {
      mismatched.push({ id: lt.id, localStatus: ls, dbStatus: ds });
    }
  });

  var inSync = missingInDb.length === 0 && missingInLocal.length === 0 && mismatched.length === 0;

  return {
    localCount:    localTickets.length,
    dbCount:       dbTickets.length,
    missingInDb:   missingInDb.map(function(t){ return t.id; }),
    missingInLocal:missingInLocal.map(function(t){ return t.id; }),
    mismatched:    mismatched,
    inSync:        inSync,
    status:        inSync ? 'in_sync' : 'gap_detected'
  };
}

// ── Test data ─────────────────────────────────────────────────────────────────
function t(id, status) { return { id: id, status: status || 'active' }; }

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Basic Comparison ──');

test('identical sets: inSync=true', function() {
  var local = [t('T1','active'), t('T2','won')];
  var db    = [t('T1','active'), t('T2','won')];
  var r = compareTicketSets(local, db);
  assert(r.inSync, 'in sync');
  assertEq(r.missingInDb.length, 0, 'nothing missing in db');
  assertEq(r.missingInLocal.length, 0, 'nothing missing locally');
  assertEq(r.mismatched.length, 0, 'no mismatches');
});

test('local has ticket not in DB: missingInDb=[T3]', function() {
  var local = [t('T1'), t('T2'), t('T3')];
  var db    = [t('T1'), t('T2')];
  var r = compareTicketSets(local, db);
  assert(!r.inSync, 'not in sync');
  assertEq(r.missingInDb.length, 1, '1 missing in db');
  assertEq(r.missingInDb[0], 'T3', 'T3 missing in db');
});

test('DB has ticket not in local: missingInLocal=[T4]', function() {
  var local = [t('T1'), t('T2')];
  var db    = [t('T1'), t('T2'), t('T4')];
  var r = compareTicketSets(local, db);
  assert(!r.inSync, 'not in sync');
  assertEq(r.missingInLocal.length, 1, '1 missing locally');
  assertEq(r.missingInLocal[0], 'T4', 'T4 missing locally');
});

test('both empty: inSync=true', function() {
  var r = compareTicketSets([], []);
  assert(r.inSync, 'empty sets are in sync');
  assertEq(r.localCount, 0, 'localCount=0');
  assertEq(r.dbCount, 0, 'dbCount=0');
});

test('local empty, DB has tickets: all missingInLocal', function() {
  var db = [t('T1'), t('T2')];
  var r = compareTicketSets([], db);
  assert(!r.inSync, 'not in sync');
  assertEq(r.missingInLocal.length, 2, 'both missing locally');
});

console.log('\n── Status Mismatch Detection ──');

test('local=active, db=active: no mismatch', function() {
  var r = compareTicketSets([t('T1','active')], [t('T1','active')]);
  assertEq(r.mismatched.length, 0, 'no mismatch same status');
});

test('local=won, db=won: no mismatch', function() {
  var r = compareTicketSets([t('T1','won')], [t('T1','won')]);
  assertEq(r.mismatched.length, 0, 'no mismatch both settled');
});

test('local=won (settled), db=active: mismatch flagged', function() {
  var r = compareTicketSets([t('T1','won')], [t('T1','active')]);
  assertEq(r.mismatched.length, 1, '1 mismatch');
  assertEq(r.mismatched[0].id, 'T1', 'T1 mismatched');
  assertEq(r.mismatched[0].localStatus, 'won', 'local=won');
  assertEq(r.mismatched[0].dbStatus, 'active', 'db=active');
});

test('local=active, db=lost: mismatch flagged', function() {
  var r = compareTicketSets([t('T1','active')], [t('T1','lost')]);
  assertEq(r.mismatched.length, 1, '1 mismatch');
});

test('local=canceled, db=active: NOT flagged (canceled not settled)', function() {
  // canceled is neither settled nor active in our classification
  var r = compareTicketSets([t('T1','canceled')], [t('T1','active')]);
  // canceled is not won/lost/push so lSettled=false, dSettled=false → no mismatch
  assertEq(r.mismatched.length, 0, 'canceled vs active not flagged as settled mismatch');
});

console.log('\n── Edge Cases ──');

test('empty DB response (offline): missingInDb = all local', function() {
  var local = [t('T1'), t('T2'), t('T3')];
  var r = compareTicketSets(local, []);
  assertEq(r.missingInDb.length, 3, 'all 3 missing in db');
  assertEq(r.dbCount, 0, 'dbCount=0');
  // UI still works: local data unaffected
  assertEq(r.localCount, 3, 'localCount=3');
});

test('null db response handled: treat as empty', function() {
  var local = [t('T1')];
  var dbRaw = null;
  var db = Array.isArray(dbRaw) ? dbRaw : [];
  var r = compareTicketSets(local, db);
  assertEq(r.dbCount, 0, 'null treated as empty');
  assertEq(r.missingInDb.length, 1, 'T1 not in db');
});

test('large sets: performance — 100 tickets each', function() {
  var local = [], db = [];
  for (var i = 0; i < 100; i++) { local.push(t('T'+i,'active')); db.push(t('T'+i,'active')); }
  var r = compareTicketSets(local, db);
  assert(r.inSync, '100 matching tickets in sync');
  assertEq(r.localCount, 100, 'localCount=100');
  assertEq(r.dbCount, 100, 'dbCount=100');
});

test('duplicate IDs in local are ignored (Set deduplication)', function() {
  var local = [t('T1'), t('T1'), t('T2')]; // duplicate T1
  var db    = [t('T1'), t('T2')];
  // Set deduplication means localIds = {T1,T2}, missingInDb should be 0
  var localIds = new Set(local.map(function(t){ return t.id; }));
  assertEq(localIds.size, 2, 'Set deduplicates T1');
  var r = compareTicketSets(local, db);
  assertEq(r.missingInDb.length, 0, 'no missing after dedup');
});

console.log('\n── Status output format ──');

test('status field is "in_sync" when matching', function() {
  var r = compareTicketSets([t('T1')], [t('T1')]);
  assertEq(r.status, 'in_sync', 'status string correct');
});

test('status field is "gap_detected" when mismatch', function() {
  var r = compareTicketSets([t('T1'), t('T2')], [t('T1')]);
  assertEq(r.status, 'gap_detected', 'status string correct');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Read shadow tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ READ SHADOW TESTS FAILED'); process.exit(1); }
else console.log('✅ All read shadow rules verified');
