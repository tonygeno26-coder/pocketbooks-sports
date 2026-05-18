/**
 * PocketBooks Sports — DB Primary Read Tests (Phase B Step 1)
 * Run: node tests/db-primary-read.test.js
 * Tests the read-source decision logic. No network calls.
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

// ── Pure read-source decision engine ─────────────────────────────────────────

var SAFE_STATUSES = new Set(['active','open','won','lost','push','canceled','voided','deleted']);

function hydrateTicketFromDb(dbTicket, dbLegs) {
  // Convert DB row shape → localStorage ticket shape
  var legs = (dbLegs || [])
    .filter(function(l){ return l.ticket_id === dbTicket.id; })
    .sort(function(a,b){ return (a.leg_index||0) - (b.leg_index||0); })
    .map(function(l){
      return {
        legId:            l.id,
        pick:             l.pick || '',
        market:           l.market || '',
        odds:             l.odds,
        line:             l.line,
        sport:            l.sport || '',
        homeTeam:         l.home_team || '',
        awayTeam:         l.away_team || '',
        canonicalGameKey: l.canonical_game_key || '',
        scheduledStart:   l.scheduled_start || null,
        providerGameId:   l.provider_game_id || null,
        gameStatus:       l.game_status || '',
        result:           l.leg_result || null
      };
    });
  return {
    id:               dbTicket.id,
    type:             dbTicket.type || 'Single',
    status:           dbTicket.status || 'active',
    riskAmount:       parseFloat(dbTicket.risk_amount) || 0,
    potentialProfit:  parseFloat(dbTicket.potential_profit) || 0,
    estimatedPayout:  parseFloat(dbTicket.estimated_payout) || 0,
    placedAt:         dbTicket.placed_at || new Date().toISOString(),
    gradedAt:         dbTicket.graded_at || null,
    gradingSource:    dbTicket.grading_source || null,
    selections:       legs,
    _source:          'db'
  };
}

function isTicketShapeSafe(t) {
  if (!t || typeof t !== 'object') return false;
  if (!t.id || typeof t.id !== 'string') return false;
  if (!SAFE_STATUSES.has((t.status||'').toLowerCase())) return false;
  if (typeof t.riskAmount !== 'number' || t.riskAmount < 0) return false;
  return true;
}

function chooseReadSource(opts) {
  // opts: { flagEnabled, localTickets, dbTickets, dbLegs, dbError, dbEnabled }
  // dbTickets are raw DB rows; they get hydrated before safety checks.
  var flag  = !!opts.flagEnabled;
  var local = Array.isArray(opts.localTickets) ? opts.localTickets : [];
  var dbRaw = Array.isArray(opts.dbTickets)    ? opts.dbTickets    : [];
  var legs  = Array.isArray(opts.dbLegs)       ? opts.dbLegs       : [];
  var dbErr = opts.dbError  || null;
  var dbOn  = opts.dbEnabled !== false;

  if (!flag) {
    return { source: 'localStorage', tickets: local, fallbackReason: 'feature_flag_off', cacheUpdate: false };
  }
  if (!dbOn || dbErr) {
    return { source: 'localStorage', tickets: local, fallbackReason: dbErr ? 'db_error:'+dbErr : 'db_disabled', cacheUpdate: false };
  }
  if (!dbRaw.length && local.length > 0) {
    return { source: 'localStorage', tickets: local, fallbackReason: 'db_empty_local_has_data', cacheUpdate: false };
  }

  // Hydrate DB rows → localStorage ticket shape before any safety check
  var db = dbRaw.map(function(r){ return hydrateTicketFromDb(r, legs); });

  // Validate hydrated tickets
  var malformed = db.filter(function(t){ return !isTicketShapeSafe(t); });
  if (malformed.length > 0) {
    return { source: 'localStorage', tickets: local, fallbackReason: 'db_malformed_rows:'+malformed.length, cacheUpdate: false };
  }

  // Duplicate ID check
  var idCounts = {}; db.forEach(function(t){ idCounts[t.id] = (idCounts[t.id]||0)+1; });
  var dupeIds = Object.keys(idCounts).filter(function(k){ return idCounts[k]>1; });
  if (dupeIds.length > 0) {
    return { source: 'localStorage', tickets: local, fallbackReason: 'db_duplicate_ids:'+dupeIds.join(','), cacheUpdate: false };
  }

  // Malformed legs check
  var badLegs = legs.filter(function(l){ return !l.id || !l.ticket_id || l.leg_index == null; });
  if (badLegs.length > 0) {
    return { source: 'localStorage', tickets: local, fallbackReason: 'db_malformed_legs:'+badLegs.length, cacheUpdate: false };
  }

  // Safety: never drop active local tickets
  var localActiveIds = new Set(local.filter(function(t){ return t.status==='active'||t.status==='open'; }).map(function(t){ return t.id; }));
  var dbIds = new Set(db.map(function(t){ return t.id; }));
  var droppedActive = [];
  localActiveIds.forEach(function(id){ if (!dbIds.has(id)) droppedActive.push(id); });
  if (droppedActive.length > 0) {
    return { source: 'localStorage', tickets: local, fallbackReason: 'db_missing_active_tickets:'+droppedActive.join(','), cacheUpdate: false };
  }

  // Gap: DB has fewer total tickets than local
  if (db.length < local.length) {
    var missingIds = local.filter(function(t){ return !dbIds.has(t.id); }).map(function(t){ return t.id; });
    return { source: 'localStorage', tickets: local, fallbackReason: 'gap_detected:db_has_fewer', cacheUpdate: false, remirror: missingIds };
  }

  // DB is safe and complete → use DB, update cache
  return { source: 'db', tickets: db, fallbackReason: null, cacheUpdate: true };
}

// ── Test data ─────────────────────────────────────────────────────────────────
function lt(id, status) { return { id:id, status:status||'active', riskAmount:100, potentialProfit:90, estimatedPayout:190, type:'Single', selections:[] }; }
function dt(id, status) { return { id:id, status:status||'active', risk_amount:100, potential_profit:90, estimated_payout:190, type:'Single' }; }

// ── Feature flag tests ────────────────────────────────────────────────────────
console.log('\n── Feature Flag ──');

test('flag off → always localStorage regardless of DB', function() {
  var r = chooseReadSource({ flagEnabled:false, localTickets:[lt('T1')], dbTickets:[dt('T1')], dbEnabled:true });
  assertEq(r.source, 'localStorage', 'source=localStorage when flag off');
  assertEq(r.fallbackReason, 'feature_flag_off', 'reason correct');
  assert(!r.cacheUpdate, 'no cache update');
});

test('flag on, DB in sync → use DB', function() {
  var r = chooseReadSource({ flagEnabled:true, localTickets:[lt('T1')], dbTickets:[dt('T1')], dbEnabled:true });
  assertEq(r.source, 'db', 'source=db');
  assert(r.cacheUpdate, 'cache should be updated');
  assert(!r.fallbackReason, 'no fallback reason');
});

// ── DB unavailable / error ────────────────────────────────────────────────────
console.log('\n── DB Unavailable ──');

test('DB offline (error) → fallback localStorage', function() {
  var r = chooseReadSource({ flagEnabled:true, localTickets:[lt('T1')], dbTickets:[], dbEnabled:true, dbError:'connection refused' });
  assertEq(r.source, 'localStorage', 'fallback on error');
  assert(r.fallbackReason.includes('db_error'), 'reason includes db_error');
});

test('DB disabled (env missing) → fallback localStorage', function() {
  var r = chooseReadSource({ flagEnabled:true, localTickets:[lt('T1')], dbTickets:[], dbEnabled:false });
  assertEq(r.source, 'localStorage', 'fallback when db disabled');
  assertEq(r.fallbackReason, 'db_disabled', 'reason=db_disabled');
});

// ── DB empty / gap handling ───────────────────────────────────────────────────
console.log('\n── DB Empty / Gap ──');

test('DB empty but local has tickets → fallback localStorage', function() {
  var r = chooseReadSource({ flagEnabled:true, localTickets:[lt('T1'),lt('T2')], dbTickets:[], dbEnabled:true });
  assertEq(r.source, 'localStorage', 'local wins when DB empty');
  assertEq(r.fallbackReason, 'db_empty_local_has_data', 'reason correct');
});

test('local empty + DB has tickets → use DB (hydrate cache)', function() {
  var r = chooseReadSource({ flagEnabled:true, localTickets:[], dbTickets:[dt('T1'),dt('T2')], dbEnabled:true });
  assertEq(r.source, 'db', 'DB used when local empty');
  assert(r.cacheUpdate, 'cache should be updated');
});

test('DB count < local count (settled) → fallback localStorage + remirror flag', function() {
  // Use settled tickets so active-ticket-safety check does not fire first
  var r = chooseReadSource({ flagEnabled:true,
    localTickets:[lt('T1','won'), lt('T2','lost'), lt('T3','lost')],
    dbTickets:[dt('T1','won')], dbEnabled:true });
  assertEq(r.source, 'localStorage', 'local wins when DB has fewer');
  assert(r.fallbackReason.includes('gap_detected'), 'gap_detected in reason');
  assert(Array.isArray(r.remirror), 'remirror list provided');
  assertEq(r.remirror.length, 2, '2 tickets queued for re-mirror');
});

// ── Never drop active tickets ─────────────────────────────────────────────────
console.log('\n── Active Ticket Safety ──');

test('DB missing an active ticket → fallback localStorage', function() {
  var r = chooseReadSource({ flagEnabled:true, localTickets:[lt('T1','active'),lt('T2','active')], dbTickets:[dt('T1','active')], dbEnabled:true });
  assertEq(r.source, 'localStorage', 'fallback when active ticket missing from DB');
  assert(r.fallbackReason.includes('db_missing_active_tickets'), 'reason mentions missing active');
});

test('DB has all active tickets → DB allowed', function() {
  var r = chooseReadSource({ flagEnabled:true, localTickets:[lt('T1','active')], dbTickets:[dt('T1','active'),dt('T2','won')], dbEnabled:true });
  assertEq(r.source, 'db', 'DB used when all active present');
});

test('settled/canceled tickets preserved from DB', function() {
  var r = chooseReadSource({ flagEnabled:true, localTickets:[lt('T1','won')], dbTickets:[dt('T1','won'),dt('T2','canceled')], dbEnabled:true });
  assertEq(r.source, 'db', 'settled/canceled from DB preserved');
  assertEq(r.tickets.length, 2, '2 tickets from DB');
});

// ── Malformed data ────────────────────────────────────────────────────────────
console.log('\n── Malformed DB Data ──');

test('DB row with missing id → fallback localStorage', function() {
  var badRow = { id:null, status:'active', risk_amount:100, potential_profit:90, estimated_payout:190 };
  var r = chooseReadSource({ flagEnabled:true, localTickets:[lt('T1')], dbTickets:[badRow], dbEnabled:true });
  assertEq(r.source, 'localStorage', 'fallback on malformed id');
  assert(r.fallbackReason.includes('malformed'), 'reason mentions malformed');
});

test('DB row with invalid status → fallback localStorage', function() {
  var badRow = { id:'T1', status:'INVALID_STATUS', risk_amount:100, potential_profit:90, estimated_payout:190 };
  var r = chooseReadSource({ flagEnabled:true, localTickets:[lt('T1')], dbTickets:[badRow], dbEnabled:true });
  assertEq(r.source, 'localStorage', 'fallback on invalid status');
});

test('DB row with negative risk → fallback localStorage', function() {
  var badRow = { id:'T1', status:'active', risk_amount:-50, potential_profit:90, estimated_payout:190 };
  var r = chooseReadSource({ flagEnabled:true, localTickets:[lt('T1')], dbTickets:[badRow], dbEnabled:true });
  assertEq(r.source, 'localStorage', 'fallback on negative risk');
});

// ── Hydration ─────────────────────────────────────────────────────────────────
console.log('\n── DB Ticket Hydration ──');

test('hydrateTicketFromDb: basic shape correct', function() {
  var dbT = { id:'T1', type:'Single', status:'active', risk_amount:100, potential_profit:90.91, estimated_payout:190.91, placed_at:'2026-05-17T19:00:00Z' };
  var dbLegs = [{ id:'LEG1', ticket_id:'T1', leg_index:0, pick:'Guardians ML', market:'Moneyline', canonical_game_key:'MLB|reds|guardians|2026-05-17', odds:-110, sport:'mlb', home_team:'Guardians', away_team:'Reds', scheduled_start:'2026-05-17T19:10:00Z' }];
  var t = hydrateTicketFromDb(dbT, dbLegs);
  assertEq(t.id, 'T1', 'id');
  assertEq(t.status, 'active', 'status');
  assertEq(t.riskAmount, 100, 'riskAmount');
  assertEq(t.selections.length, 1, '1 selection');
  assertEq(t.selections[0].pick, 'Guardians ML', 'pick');
  assertEq(t.selections[0].canonicalGameKey, 'MLB|reds|guardians|2026-05-17', 'cKey');
  assertEq(t._source, 'db', '_source=db');
});

test('hydrateTicketFromDb: parlay with multiple legs ordered by leg_index', function() {
  var dbT = { id:'T2', type:'Parlay', status:'active', risk_amount:25, potential_profit:165, estimated_payout:190 };
  var dbLegs = [
    { id:'L2', ticket_id:'T2', leg_index:1, pick:'Over 8.5', market:'Total', canonical_game_key:'MLB|cubs|cardinals|2026-05-17', odds:-110 },
    { id:'L1', ticket_id:'T2', leg_index:0, pick:'Rays ML',  market:'Moneyline', canonical_game_key:'MLB|marlins|rays|2026-05-17', odds:-120 }
  ];
  var t = hydrateTicketFromDb(dbT, dbLegs);
  assertEq(t.selections.length, 2, '2 legs');
  assertEq(t.selections[0].pick, 'Rays ML', 'leg 0 first (sorted by leg_index)');
  assertEq(t.selections[1].pick, 'Over 8.5', 'leg 1 second');
});

test('hydrateTicketFromDb: leg with no legs array → empty selections', function() {
  var dbT = { id:'T3', type:'Single', status:'active', risk_amount:50, potential_profit:45, estimated_payout:95 };
  var t = hydrateTicketFromDb(dbT, []);
  assertEq(t.selections.length, 0, 'empty selections when no legs');
});

// ── No duplicates ─────────────────────────────────────────────────────────────
console.log('\n── No Duplicate Rendering ──');

test('DB source tickets have no duplicate IDs', function() {
  var dbTickets = [dt('T1'), dt('T2'), dt('T3')];
  var ids = dbTickets.map(function(t){ return t.id; });
  var uniqueIds = new Set(ids);
  assertEq(uniqueIds.size, ids.length, 'no duplicates in DB set');
});

test('chooseReadSource never returns duplicates', function() {
  var r = chooseReadSource({ flagEnabled:true, localTickets:[lt('T1'),lt('T2')], dbTickets:[dt('T1'),dt('T2'),dt('T3')], dbEnabled:true });
  var ids = r.tickets.map(function(t){ return t.id; });
  assertEq(new Set(ids).size, ids.length, 'no duplicate IDs in result');
});


console.log('\n\u2500\u2500 New Safety Gates \u2500\u2500');

test('DB duplicate IDs in response → fallback localStorage', function() {
  // When DB returns same ID twice, duplicate gate fires
  var r = chooseReadSource({ flagEnabled:true,
    localTickets:[lt('T1','active')],
    dbTickets:[dt('T1','active'), dt('T1','active')],
    dbEnabled:true });
  assertEq(r.source, 'localStorage', 'duplicate DB ID → fallback');
  assert(r.fallbackReason && r.fallbackReason.includes('duplicate'), 'reason mentions duplicate: got ' + r.fallbackReason);
});

test('malformed DB leg (no id) → fallback localStorage', function() {
  var r = chooseReadSource({ flagEnabled:true,
    localTickets:[lt('T1','active')],
    dbTickets:[dt('T1','active')],
    dbLegs:[{ id:null, ticket_id:null, leg_index:0 }],
    dbEnabled:true });
  assertEq(r.source, 'localStorage', 'malformed leg → fallback');
  assert(r.fallbackReason && r.fallbackReason.includes('malformed_leg'), 'reason mentions malformed_leg: got ' + r.fallbackReason);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('DB primary read tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ DB PRIMARY READ TESTS FAILED'); process.exit(1); }
else console.log('✅ All DB primary read rules verified');
