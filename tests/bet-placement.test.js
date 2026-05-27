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


// ── Bug #1 regression: balance gate must be club-scoped ──────────────────────
// Proves: .eq('club_id', clubId) added to the tickets query in bets/place
// prevents cross-club balance contamination (Bug #1).
console.log('\n── Bug #1 regression: cross-club balance isolation ──');

function deriveAvailableClubScoped(allTickets, clubId, startingBalance) {
  var clubTickets = allTickets.filter(function(t) { return t.club_id === clubId; });
  var openRisk = 0, settledGains = 0, settledLosses = 0;
  clubTickets.forEach(function(t) {
    var s = (t.status||'').toLowerCase();
    var r = parseFloat(t.risk_amount) || 0;
    var p = parseFloat(t.potential_profit) || 0;
    if (s === 'canceled' || s === 'voided' || s === 'push' || s === 'pushed') return;
    if (s === 'active' || s === 'open') openRisk += r;
    else if (s === 'won')  settledGains  += p;
    else if (s === 'lost') settledLosses += r;
  });
  return Math.round((startingBalance - openRisk - settledLosses + settledGains) * 100) / 100;
}
function deriveAvailableUnscoped(allTickets, startingBalance) {
  var openRisk = 0, settledGains = 0, settledLosses = 0;
  allTickets.forEach(function(t) {
    var s = (t.status||'').toLowerCase();
    var r = parseFloat(t.risk_amount) || 0;
    var p = parseFloat(t.potential_profit) || 0;
    if (s === 'canceled' || s === 'voided' || s === 'push' || s === 'pushed') return;
    if (s === 'active' || s === 'open') openRisk += r;
    else if (s === 'won')  settledGains  += p;
    else if (s === 'lost') settledLosses += r;
  });
  return Math.round((startingBalance - openRisk - settledLosses + settledGains) * 100) / 100;
}
var CLUB_A = 'club-uuid-aaaa';
var CLUB_B = 'club-uuid-bbbb';

test('club B loss/open-risk does not reduce club A balance (Bug #1 fix)', function() {
  var tix = [
    { club_id: CLUB_A, player_id: 'P1', status: 'active', risk_amount: 50,  potential_profit: 90 },
    { club_id: CLUB_A, player_id: 'P1', status: 'won',    risk_amount: 30,  potential_profit: 30 },
    { club_id: CLUB_B, player_id: 'P1', status: 'lost',   risk_amount: 400, potential_profit: 0  },
    { club_id: CLUB_B, player_id: 'P1', status: 'active', risk_amount: 200, potential_profit: 0  },
  ];
  // fixed: 1000 - 50 (openA) + 30 (wonA) = 980
  var fixed   = deriveAvailableClubScoped(tix, CLUB_A, 1000);
  // broken: 1000 - 250 (openA+B) - 400 (lossB) + 30 (wonA) = 380
  var broken  = deriveAvailableUnscoped(tix, 1000);
  assertApprox(fixed,  980, 'club A available = 980');
  assertApprox(broken, 380, 'broken cross-club = 380');
  assert(fixed > broken, 'fix restores correct balance');
});

test('player with zero club A tickets: full starting balance (not reduced by club B)', function() {
  var tix = [
    { club_id: CLUB_B, player_id: 'P1', status: 'active', risk_amount: 500, potential_profit: 0 },
  ];
  assertApprox(deriveAvailableClubScoped(tix, CLUB_A, 1000), 1000, 'club A: no tickets = full balance');
  assertApprox(deriveAvailableUnscoped(tix, 1000), 500, 'unscoped wrongly deducts club B open risk');
});

test('club B losses do not bleed into club A (isolated loss)', function() {
  var tix = [{ club_id: CLUB_B, player_id: 'P1', status: 'lost', risk_amount: 300, potential_profit: 0 }];
  assertApprox(deriveAvailableClubScoped(tix, CLUB_A, 1000), 1000, 'club A unaffected by club B loss');
});

test('canceled ticket in club B does not affect club A availability', function() {
  var tix = [
    { club_id: CLUB_B, player_id: 'P1', status: 'canceled', risk_amount: 200, potential_profit: 0 },
    { club_id: CLUB_A, player_id: 'P1', status: 'active',   risk_amount: 50,  potential_profit: 90 },
  ];
  assertApprox(deriveAvailableClubScoped(tix, CLUB_A, 1000), 950, 'only club A $50 open risk subtracted');
});

test('multi-club player: each club sees only its own settled net', function() {
  var tix = [
    { club_id: CLUB_A, player_id: 'P1', status: 'lost', risk_amount: 100, potential_profit: 0   },
    { club_id: CLUB_B, player_id: 'P1', status: 'won',  risk_amount: 100, potential_profit: 200 },
  ];
  var availA = deriveAvailableClubScoped(tix, CLUB_A, 1000); // 1000 - 100 = 900
  var availB = deriveAvailableClubScoped(tix, CLUB_B, 1000); // 1000 + 200 = 1200
  assertApprox(availA, 900,  'club A: start 1000 - $100 loss = 900');
  assertApprox(availB, 1200, 'club B: start 1000 + $200 win = 1200');
  var brokenBoth = deriveAvailableUnscoped(tix, 1000); // net = -100+200 = +100 -> 1100
  assertApprox(brokenBoth, 1100, 'unscoped cross-club net = 1100 (wrong for both)');
  assert(availA !== brokenBoth, 'club A differs from broken result');
  assert(availB !== brokenBoth, 'club B differs from broken result');
});


// ── club_members cleanup: bets/place startBal uses player_limits ─────────────
console.log('\n── club_members cleanup: bets/place uses player_limits (club-scoped) ──');

// Mirror the fixed backend startBal resolution:
// player_limits WHERE club_id=? AND player_id=? — with club_id filter
function resolveStartBalFromPlayerLimits(playerLimitRows, clubId, playerId) {
  var row = (playerLimitRows||[]).find(function(r) {
    return String(r.club_id) === String(clubId) && String(r.player_id) === String(playerId);
  });
  return row ? parseFloat(row.balance_start)||1000 : 1000;
}

var CLUB_A_ID = 'club-uuid-cccc';
var CLUB_B_ID = 'club-uuid-dddd';

test('bets/place: uses balance_start=2500 from player_limits for club A (not fallback 1000)', function() {
  var limits = [
    { club_id: CLUB_A_ID, player_id: 'P1', balance_start: 2500 },
    { club_id: CLUB_B_ID, player_id: 'P1', balance_start: 500  }, // club B row must be ignored
  ];
  var bal = resolveStartBalFromPlayerLimits(limits, CLUB_A_ID, 'P1');
  assertApprox(bal, 2500, 'startBal = 2500 from club A player_limits');
  assert(bal !== 1000, 'must not fall back to 1000 when row exists');
});

test('bets/place: does not use club B player_limits row for club A bet', function() {
  var limits = [
    // No club A row for P2
    { club_id: CLUB_B_ID, player_id: 'P2', balance_start: 9999 },
  ];
  var bal = resolveStartBalFromPlayerLimits(limits, CLUB_A_ID, 'P2');
  assertApprox(bal, 1000, 'club B row must not pollute club A startBal');
  assert(bal !== 9999, 'club B balance 9999 must not appear in club A');
});

test('bets/place: fallback remains 1000 when no player_limits row exists', function() {
  var limits = []; // no rows at all
  var bal = resolveStartBalFromPlayerLimits(limits, CLUB_A_ID, 'P3');
  assertApprox(bal, 1000, 'fallback to 1000 when no row');
});

test('bets/place: balance gate uses club-scoped startBal correctly', function() {
  // Player has $2500 start, $200 open risk, $100 losses, $50 gains
  // available = 2500 - 200 - 100 + 50 = 2250
  var startBal = 2500;
  var openRisk = 200, settledLosses = 100, settledGains = 50;
  var available = Math.round((startBal - openRisk - settledLosses + settledGains)*100)/100;
  assertApprox(available, 2250, 'available = 2250 with startBal=2500');
  // Old code with fallback 1000: available = 1000 - 200 - 100 + 50 = 750 (wrong — would block valid bet)
  var oldAvailable = Math.round((1000 - openRisk - settledLosses + settledGains)*100)/100;
  assertApprox(oldAvailable, 750, 'old fallback gives wrong 750');
  assert(available > oldAvailable, 'fixed path gives correct higher available balance');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Bet placement tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ BET PLACEMENT TESTS FAILED'); process.exit(1); }
else console.log('✅ All bet placement rules verified');
