/**
 * PocketBooks Sports — DB-Authoritative Bet Placement Tests
 * Run: node tests/bet-placement.test.js
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }
function assertApprox(a, b, m) { if (Math.abs(a-b)>0.02) throw new Error((m||'')+' — got '+a+' expected ~'+b); }

// ── Pure validation engine (mirrors backend) ──────────────────────────────────

var VALID_BET_TYPES = new Set(['Single','Parlay','RoundRobin','Teaser']);
var VALID_MARKETS   = new Set(['Moneyline','Run Line','Spread','Total','Puck Line','Prop']);
var VALID_SPORTS    = new Set(['mlb','nba','nhl','nfl','soccer','ufl','ncaaf','ncaab','tennis','golf']);

function validateBetPlacement(body, playerBalance, existingActiveLegs) {
  var errors = [];

  // Required fields
  if (!body.playerId)      errors.push('missing_playerId');
  if (!body.idempotencyKey) errors.push('missing_idempotencyKey');
  if (!VALID_BET_TYPES.has(body.betType)) errors.push('invalid_betType:'+body.betType);

  var stake = parseFloat(body.stake);
  if (isNaN(stake)||stake<=0) errors.push('invalid_stake');

  var legs = Array.isArray(body.legs) ? body.legs : [];
  if (!legs.length) errors.push('no_legs');

  // Validate each leg
  legs.forEach(function(leg, i) {
    if (!leg.pick)               errors.push('leg'+i+'_missing_pick');
    if (!leg.market)             errors.push('leg'+i+'_missing_market');
    if (!leg.canonicalGameKey)   errors.push('leg'+i+'_missing_canonicalGameKey');
    if (typeof leg.odds !== 'number') errors.push('leg'+i+'_invalid_odds');
    if (!leg.scheduledStart)     errors.push('leg'+i+'_missing_scheduledStart');
    // Future gate: if scheduledStart in the past at placement time — check commenceTime
    // (full gate done in grading; here we just validate shape)
  });

  if (errors.length) return { ok:false, errors };

  // Balance check
  var available = parseFloat(playerBalance) || 0;
  if (stake > available + 0.005) {  // 0.005 tolerance for float rounding
    return { ok:false, errors:['insufficient_balance: need $'+stake+' have $'+available] };
  }

  // Conflict check (simplified: same canonicalGameKey + market)
  var newTokens = legs.map(function(leg) {
    return leg.canonicalGameKey + '|' + (leg.market||'').toLowerCase();
  });
  existingActiveLegs = existingActiveLegs || [];
  for (var i=0; i<existingActiveLegs.length; i++) {
    var existToken = existingActiveLegs[i].canonical_game_key + '|' + (existingActiveLegs[i].market||'').toLowerCase();
    if (newTokens.includes(existToken)) {
      return { ok:false, errors:['conflict_active_bet:'+existingActiveLegs[i].canonical_game_key] };
    }
  }

  return { ok:true, stake, legs };
}

function buildTicketRow(body, ticketId, now) {
  return {
    id:               ticketId,
    club_id:          body.clubId || null,
    player_id:        body.playerId,
    player_username:  body.playerUsername || null,
    type:             body.betType,
    status:           'active',
    risk_amount:      parseFloat(body.stake),
    potential_profit: parseFloat(body.potentialProfit)||0,
    estimated_payout: parseFloat(body.payout)||0,
    placed_at:        now,
    mirrored_at:      now
  };
}

function buildLegRows(ticketId, legs, now) {
  return legs.map(function(leg, i) {
    return {
      id:                 leg.legId || (ticketId+'_leg'+i),
      ticket_id:          ticketId,
      leg_index:          i,
      provider_name:      leg.providerName || 'odds-api',
      provider_game_id:   leg.providerGameId || null,
      canonical_game_key: leg.canonicalGameKey,
      sport:              leg.sport || null,
      home_team:          leg.homeTeam || null,
      away_team:          leg.awayTeam || null,
      scheduled_start:    leg.scheduledStart,
      market:             leg.market,
      pick:               leg.pick,
      odds:               leg.odds,
      line:               leg.line != null ? parseFloat(leg.line) : null,
      side:               leg.side || null
    };
  });
}

function buildBetPlacedLedgerEntry(ticketId, body, now) {
  return {
    id:            body.idempotencyKey,   // idempotent: same key = same row
    club_id:       body.clubId || null,
    player_id:     body.playerId,
    ticket_id:     ticketId,
    type:          'bet_placed',
    amount:        -(parseFloat(body.stake)),  // negative = player debit
    balance_before: null,
    balance_after:  null,
    reason:        'bet_placed:'+body.betType,
    created_at:    now,
    created_by:    body.playerId
  };
}

// ── Test data ─────────────────────────────────────────────────────────────────
var BASE_BODY = {
  playerId: 'P001', clubId: 'C001',
  betType: 'Single', stake: 100,
  potentialProfit: 90.91, payout: 190.91,
  idempotencyKey: 'BET_P001_C001_T001_'+Date.now(),
  legs: [{
    pick: 'Guardians ML', market: 'Moneyline', odds: -110,
    canonicalGameKey: 'MLB|reds|guardians|2026-05-17',
    sport: 'mlb', homeTeam: 'Guardians', awayTeam: 'Reds',
    scheduledStart: '2026-05-17T19:10:00Z'
  }]
};

// ── Validation ────────────────────────────────────────────────────────────────
console.log('\n── Validation ──');

test('valid single bet passes', function() {
  var r = validateBetPlacement(BASE_BODY, 1000, []);
  assert(r.ok, 'valid: '+(r.errors||[]).join(','));
  assertEq(r.stake, 100);
  assertEq(r.legs.length, 1);
});

test('missing playerId → error', function() {
  var b = Object.assign({}, BASE_BODY, { playerId:null });
  assert(!validateBetPlacement(b, 1000).ok);
});

test('missing idempotencyKey → error', function() {
  var b = Object.assign({}, BASE_BODY, { idempotencyKey:null });
  assert(!validateBetPlacement(b, 1000).ok);
});

test('invalid betType → error', function() {
  var b = Object.assign({}, BASE_BODY, { betType:'Unknown' });
  var r = validateBetPlacement(b, 1000);
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('invalid_betType'); }));
});

test('zero stake → error', function() {
  var b = Object.assign({}, BASE_BODY, { stake:0 });
  assert(!validateBetPlacement(b, 1000).ok);
});

test('negative stake → error', function() {
  var b = Object.assign({}, BASE_BODY, { stake:-50 });
  assert(!validateBetPlacement(b, 1000).ok);
});

test('no legs → error', function() {
  var b = Object.assign({}, BASE_BODY, { legs:[] });
  assert(!validateBetPlacement(b, 1000).ok);
});

test('leg missing pick → error', function() {
  var leg = Object.assign({}, BASE_BODY.legs[0], { pick:null });
  var b = Object.assign({}, BASE_BODY, { legs:[leg] });
  var r = validateBetPlacement(b, 1000);
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('missing_pick'); }));
});

test('leg missing canonicalGameKey → error', function() {
  var leg = Object.assign({}, BASE_BODY.legs[0], { canonicalGameKey:null });
  var b = Object.assign({}, BASE_BODY, { legs:[leg] });
  assert(!validateBetPlacement(b, 1000).ok);
});

test('leg missing scheduledStart → error', function() {
  var leg = Object.assign({}, BASE_BODY.legs[0], { scheduledStart:null });
  var b = Object.assign({}, BASE_BODY, { legs:[leg] });
  assert(!validateBetPlacement(b, 1000).ok);
});

// ── Balance check ─────────────────────────────────────────────────────────────
console.log('\n── Balance ──');

test('exact balance allowed', function() {
  var r = validateBetPlacement(BASE_BODY, 100, []);
  assert(r.ok, 'exact balance allowed');
});

test('insufficient balance → blocked', function() {
  var r = validateBetPlacement(BASE_BODY, 99.99, []);
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('insufficient_balance'); }));
});

test('zero balance → blocked', function() {
  assert(!validateBetPlacement(BASE_BODY, 0).ok);
});

// ── Conflict detection ────────────────────────────────────────────────────────
console.log('\n── Conflict ──');

test('no active legs → no conflict', function() {
  var r = validateBetPlacement(BASE_BODY, 1000, []);
  assert(r.ok, 'no conflict');
});

test('active leg same game+market → blocked', function() {
  var existing = [{ canonical_game_key:'MLB|reds|guardians|2026-05-17', market:'Moneyline' }];
  var r = validateBetPlacement(BASE_BODY, 1000, existing);
  assert(!r.ok); assert(r.errors.some(function(e){ return e.includes('conflict_active_bet'); }));
});

test('active leg different game → no conflict', function() {
  var existing = [{ canonical_game_key:'MLB|reds|guardians|2026-05-18', market:'Moneyline' }];
  var r = validateBetPlacement(BASE_BODY, 1000, existing);
  assert(r.ok, 'different game = no conflict');
});

test('active leg same game different market → no conflict', function() {
  var existing = [{ canonical_game_key:'MLB|reds|guardians|2026-05-17', market:'Total' }];
  var r = validateBetPlacement(BASE_BODY, 1000, existing);
  assert(r.ok, 'different market = no conflict');
});

// ── Row construction ──────────────────────────────────────────────────────────
console.log('\n── Row construction ──');

test('buildTicketRow: correct fields', function() {
  var row = buildTicketRow(BASE_BODY, 'T_001', '2026-05-17T19:00:00Z');
  assertEq(row.id, 'T_001');
  assertEq(row.status, 'active');
  assertEq(row.risk_amount, 100);
  assertEq(row.player_id, 'P001');
  assertEq(row.type, 'Single');
});

test('buildLegRows: 1 leg for single', function() {
  var rows = buildLegRows('T_001', BASE_BODY.legs, '2026-05-17T19:00:00Z');
  assertEq(rows.length, 1);
  assertEq(rows[0].ticket_id, 'T_001');
  assertEq(rows[0].canonical_game_key, 'MLB|reds|guardians|2026-05-17');
  assertEq(rows[0].pick, 'Guardians ML');
  assertEq(rows[0].odds, -110);
});

test('buildLegRows: parlay has N legs', function() {
  var legs2 = [
    Object.assign({}, BASE_BODY.legs[0]),
    { pick:'Rays ML', market:'Moneyline', odds:-120, canonicalGameKey:'MLB|marlins|rays|2026-05-17',
      sport:'mlb', homeTeam:'Rays', awayTeam:'Marlins', scheduledStart:'2026-05-17T19:10:00Z' }
  ];
  var rows = buildLegRows('P_001', legs2, '2026-05-17T19:00:00Z');
  assertEq(rows.length, 2);
  assertEq(rows[0].leg_index, 0);
  assertEq(rows[1].leg_index, 1);
});

test('buildBetPlacedLedgerEntry: negative amount, idempotencyKey as id', function() {
  var entry = buildBetPlacedLedgerEntry('T_001', BASE_BODY, '2026-05-17T19:00:00Z');
  assertEq(entry.id, BASE_BODY.idempotencyKey, 'id=idempotencyKey');
  assertEq(entry.amount, -100, 'amount=-100 (debit)');
  assertEq(entry.type, 'bet_placed');
  assertEq(entry.ticket_id, 'T_001');
});

// ── Idempotency ───────────────────────────────────────────────────────────────
console.log('\n── Idempotency ──');

test('same idempotencyKey → 1 ledger row (upsert)', function() {
  var seen = {};
  function upsert(row) { seen[row.id]=row; }
  var e1 = buildBetPlacedLedgerEntry('T_001', BASE_BODY, '2026-05-17T19:00:00Z');
  var e2 = buildBetPlacedLedgerEntry('T_001', BASE_BODY, '2026-05-17T19:00:00Z');
  upsert(e1); upsert(e2);
  assertEq(Object.keys(seen).length, 1, 'only 1 row');
});

test('different idempotencyKeys → separate rows', function() {
  var b1 = Object.assign({}, BASE_BODY, { idempotencyKey:'K1' });
  var b2 = Object.assign({}, BASE_BODY, { idempotencyKey:'K2' });
  var seen = {};
  [buildBetPlacedLedgerEntry('T1',b1,'now'), buildBetPlacedLedgerEntry('T2',b2,'now')].forEach(function(e){ seen[e.id]=e; });
  assertEq(Object.keys(seen).length, 2, '2 separate rows');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Bet placement tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ BET PLACEMENT TESTS FAILED'); process.exit(1); }
else console.log('✅ All bet placement rules verified');
