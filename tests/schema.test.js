/**
 * PocketBooks Sports — Schema Validation Tests
 * Run: node tests/schema.test.js
 * Checks that schema.sql and migration files are structurally correct.
 * Does NOT connect to Supabase — pure file/text validation.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertIncludes(str, substr, m) { if (!str.includes(substr)) throw new Error((m||'') + ' — missing: ' + substr); }

const ROOT    = path.resolve(__dirname, '..');
const SCHEMA  = fs.readFileSync(path.join(ROOT, 'supabase/schema.sql'), 'utf8');
const MIG_DIR = path.join(ROOT, 'supabase/migrations');
const MIGS    = fs.readdirSync(MIG_DIR).filter(function(f){ return f.endsWith('.sql'); }).sort();

// ── schema.sql completeness ───────────────────────────────────────────────────
console.log('\n── schema.sql: required tables ──');

var REQUIRED_TABLES = [
  'users', 'clubs', 'club_members', 'player_limits',
  'tickets', 'ticket_legs', 'ledger_entries', 'settlements',
  'cancel_requests', 'audit_events',
  'weekly_rollovers', 'weekly_player_snapshots'
];

REQUIRED_TABLES.forEach(function(tbl) {
  test('table '+tbl+' defined', function() {
    assertIncludes(SCHEMA, 'CREATE TABLE IF NOT EXISTS '+tbl, 'table: '+tbl);
  });
});

console.log('\n── schema.sql: key constraints ──');

test('tickets has status CHECK constraint', function() {
  assertIncludes(SCHEMA, "CHECK (status IN", 'status CHECK on tickets');
});
test('ledger_entries has type CHECK constraint', function() {
  assertIncludes(SCHEMA, "'bet_placed','bet_won','bet_lost'", 'type CHECK on ledger_entries');
});
test('weekly_rollovers has UNIQUE(club_id, rollover_week)', function() {
  assertIncludes(SCHEMA, 'UNIQUE(club_id, rollover_week)', 'rollover UNIQUE');
});
test('weekly_player_snapshots has UNIQUE per player per week', function() {
  assertIncludes(SCHEMA, 'UNIQUE(club_id, rollover_week, player_id)', 'snapshot UNIQUE');
});
test('ledger ticket_id is TEXT (no FK in Phase A)', function() {
  // Ensure ticket_id in ledger_entries does NOT have REFERENCES tickets
  var ledgerSection = SCHEMA.substring(
    SCHEMA.indexOf('CREATE TABLE IF NOT EXISTS ledger_entries'),
    SCHEMA.indexOf('CREATE INDEX IF NOT EXISTS idx_ledger_player')
  );
  assert(!ledgerSection.includes('REFERENCES tickets'), 'ticket_id FK removed (Phase A compat)');
});

console.log('\n── schema.sql: indexes ──');

var REQUIRED_INDEXES = [
  'idx_tickets_player', 'idx_tickets_status',
  'idx_legs_canonical_key', 'idx_ledger_player',
  'idx_rollovers_club', 'idx_snapshots_week'
];
REQUIRED_INDEXES.forEach(function(idx) {
  test('index '+idx+' defined', function() {
    assertIncludes(SCHEMA, idx, 'index: '+idx);
  });
});

// ── migrations ────────────────────────────────────────────────────────────────
console.log('\n── migrations/ ──');

test('migration files exist', function() {
  assert(MIGS.length >= 2, 'at least 2 migration files, got: '+MIGS.length);
});
test('migration 001_fix_ledger_constraints.sql exists', function() {
  assert(MIGS.includes('001_fix_ledger_constraints.sql'), 'migration 001 present');
});
test('migration 002_weekly_rollover_tables.sql exists', function() {
  assert(MIGS.includes('002_weekly_rollover_tables.sql'), 'migration 002 present');
});
test('migration 002 creates both rollover tables', function() {
  var m2 = fs.readFileSync(path.join(MIG_DIR, '002_weekly_rollover_tables.sql'), 'utf8');
  assertIncludes(m2, 'weekly_rollovers', '002 has weekly_rollovers');
  assertIncludes(m2, 'weekly_player_snapshots', '002 has weekly_player_snapshots');
});
test('migration 001 fixes ledger player_id nullability', function() {
  var m1 = fs.readFileSync(path.join(MIG_DIR, '001_fix_ledger_constraints.sql'), 'utf8');
  assertIncludes(m1, 'DROP NOT NULL', '001 drops NOT NULL');
});
test('migrations are in sequential order', function() {
  for (var i = 0; i < MIGS.length; i++) {
    var num = parseInt(MIGS[i].slice(0,3));
    assert(num === i+1, 'migration '+MIGS[i]+' is out of sequence (expected '+(i+1)+')');
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Schema tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ SCHEMA TESTS FAILED'); process.exit(1); }
else console.log('✅ schema.sql and migrations verified');
