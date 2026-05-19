/**
 * PocketBooks Sports — Grading Match Priority Tests
 * Run: node tests/grading-match.test.js
 * Tests deterministic game matching. No network calls.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }

// ── Pure match engine (mirrors player.html implementation) ───────────────────

var FINAL_STATUSES = new Set(['final','f','completed','complete','closed',
  'cancelled','canceled','postponed','suspended','forfeit','f/ot','f/so']);

function isGameFinal(status) {
  if (!status) return false;
  return FINAL_STATUSES.has(String(status).toLowerCase().trim());
}

function normalizeName(s) {
  if (!s) return '';
  return String(s).toLowerCase()
    .replace(/\s+/g, ' ').trim()
    .replace(/^the\s+/, '');
}

function sameDateUTC(msA, msB) {
  if (!msA || !msB) return true;
  var a = new Date(msA), b = new Date(msB);
  return a.getUTCFullYear() === b.getUTCFullYear() &&
         a.getUTCMonth()    === b.getUTCMonth() &&
         a.getUTCDate()     === b.getUTCDate();
}

// Priority 1: providerGameId exact match
// Priority 2: canonicalGameKey exact match
// Priority 3: normalized home+away+date
// Priority 4: TLA-only if exactly one candidate (legacy)
function findGameForLeg(leg, games) {
  var selMs     = leg.scheduledStart ? new Date(leg.scheduledStart).getTime() : 0;
  var provId    = leg.providerGameId || leg.gameId || null;
  var cKey      = leg.canonicalGameKey || null;
  var selHome   = normalizeName(leg.homeTeam);
  var selAway   = normalizeName(leg.awayTeam);
  var candidates= [];

  // P1: provider_game_id
  if (provId) {
    var p1 = games.find(function(g){ return g.id === provId || g._providerGameId === provId; });
    if (p1) return { game: p1, method: 'provider_game_id', candidateCount: 1 };
  }

  // P2: canonicalGameKey
  if (cKey) {
    var p2matches = games.filter(function(g){ return g._canonicalKey === cKey; });
    if (p2matches.length === 1) return { game: p2matches[0], method: 'canonical_game_key', candidateCount: 1 };
    if (p2matches.length > 1)  return { game: null, reason: 'ambiguous_match_refused', method: 'canonical_game_key', candidateCount: p2matches.length };
  }

  // P3: normalized teams + date
  if (selHome && selAway) {
    candidates = games.filter(function(g) {
      var gHome = normalizeName(g.home); var gAway = normalizeName(g.away);
      var teamsMatch = (gHome === selHome && gAway === selAway) ||
                       (gHome === selAway && gAway === selHome);
      if (!teamsMatch) return false;
      if (selMs > 0 && g._commenceMs > 0) return sameDateUTC(selMs, g._commenceMs);
      return true;
    });
    if (candidates.length === 1) return { game: candidates[0], method: 'teams_date', candidateCount: 1 };
    if (candidates.length > 1)  return { game: null, reason: 'ambiguous_match_refused', method: 'teams_date', candidateCount: candidates.length, candidates: candidates.map(function(g){ return g.id; }) };
    return { game: null, reason: 'no_candidate', method: 'teams_date', candidateCount: 0 };
  }

  // P4: TLA fallback (legacy — only if exactly one candidate)
  candidates = games.filter(function(g) {
    if (selMs > 0 && g._commenceMs > 0 && !sameDateUTC(selMs, g._commenceMs)) return false;
    var hLast = normalizeName(g.home).split(' ').pop();
    var aLast = normalizeName(g.away).split(' ').pop();
    var matchup = (leg.matchup || '').toLowerCase();
    return matchup.includes(hLast) || matchup.includes(aLast);
  });
  if (candidates.length === 1) return { game: candidates[0], method: 'tla_fallback', candidateCount: 1 };
  if (candidates.length > 1)  return { game: null, reason: 'ambiguous_match_refused', method: 'tla_fallback', candidateCount: candidates.length };
  return { game: null, reason: 'no_match_found', method: 'none', candidateCount: 0 };
}

// ── Test data ─────────────────────────────────────────────────────────────────
var BASE_MS = new Date('2026-05-17T19:10:00Z').getTime();
var NEXT_MS = new Date('2026-05-18T19:10:00Z').getTime();

function game(id, home, away, status, commenceMs, extraOpts) {
  return Object.assign({
    id: id, home: home, away: away, status: status || 'Final',
    home_score: 5, away_score: 3, completed: isGameFinal(status||'Final'),
    _commenceMs: commenceMs || BASE_MS,
    _canonicalKey: 'MLB|' + away.toLowerCase().replace(/\s+/g,'-') + '|' + home.toLowerCase().replace(/\s+/g,'-') + '|' + new Date(commenceMs||BASE_MS).toISOString().slice(0,10),
    _providerGameId: id
  }, extraOpts||{});
}

function leg(opts) {
  return Object.assign({
    pick: 'Team ML', market: 'Moneyline', odds: -110
  }, opts);
}

var REDS_GUARDIANS   = game('G001', 'Guardians', 'Reds',          'Final', BASE_MS);
var MARLINS_RAYS     = game('G002', 'Tampa Bay Rays', 'Marlins',   'Final', BASE_MS);
var GUARDIANS_DH1    = game('G003', 'Guardians', 'Reds',          'Final', BASE_MS,   { _canonicalKey:'MLB|reds|guardians|2026-05-17-game1' });
var GUARDIANS_DH2    = game('G004', 'Guardians', 'Reds',          'Final', BASE_MS,   { _canonicalKey:'MLB|reds|guardians|2026-05-17-game2' });
var GUARDIANS_NEXT   = game('G005', 'Guardians', 'Reds',          'Final', NEXT_MS);
var INPROGRESS       = game('G006', 'Cubs', 'Cardinals',          'InProgress', BASE_MS, { completed: false });

// ── Priority 1: providerGameId ─────────────────────────────────────────────────
console.log('\n── Priority 1: providerGameId exact match ──');

test('P1: providerGameId matches → used immediately', function() {
  var l = leg({ providerGameId:'G001', scheduledStart:'2026-05-17T19:10:00Z' });
  var r = findGameForLeg(l, [REDS_GUARDIANS, MARLINS_RAYS, GUARDIANS_NEXT]);
  assertEq(r.method, 'provider_game_id', 'method');
  assertEq(r.game.id, 'G001', 'correct game');
});

test('P1: wrong providerGameId falls through to P2', function() {
  var l = leg({ providerGameId:'BOGUS', canonicalGameKey: REDS_GUARDIANS._canonicalKey, scheduledStart:'2026-05-17T19:10:00Z', homeTeam:'Guardians', awayTeam:'Reds' });
  var r = findGameForLeg(l, [REDS_GUARDIANS]);
  assertEq(r.method, 'canonical_game_key', 'falls through to P2');
  assertEq(r.game.id, 'G001', 'correct game');
});

// ── Priority 2: canonicalGameKey ──────────────────────────────────────────────
console.log('\n── Priority 2: canonicalGameKey ──');

test('P2: cKey exact match → used', function() {
  var l = leg({ canonicalGameKey: REDS_GUARDIANS._canonicalKey, scheduledStart:'2026-05-17T19:10:00Z' });
  var r = findGameForLeg(l, [REDS_GUARDIANS, MARLINS_RAYS]);
  assertEq(r.method, 'canonical_game_key', 'method');
  assertEq(r.game.id, 'G001', 'correct game');
});

test('P2: doubleheader — cKey picks game1 not game2', function() {
  var l = leg({ canonicalGameKey:'MLB|reds|guardians|2026-05-17-game1', scheduledStart:'2026-05-17T19:10:00Z' });
  var r = findGameForLeg(l, [GUARDIANS_DH1, GUARDIANS_DH2]);
  assertEq(r.method, 'canonical_game_key', 'method');
  assertEq(r.game.id, 'G003', 'game1 selected');
});

test('P2: two games same cKey → ambiguous_match_refused', function() {
  var g1 = Object.assign({}, REDS_GUARDIANS, { id:'DUP1' });
  var g2 = Object.assign({}, REDS_GUARDIANS, { id:'DUP2' });
  var l  = leg({ canonicalGameKey: REDS_GUARDIANS._canonicalKey });
  var r  = findGameForLeg(l, [g1, g2]);
  assert(!r.game, 'no game returned');
  assertEq(r.reason, 'ambiguous_match_refused', 'reason correct');
  assertEq(r.candidateCount, 2, '2 candidates');
});

// ── Priority 3: teams + date ───────────────────────────────────────────────────
console.log('\n── Priority 3: normalized teams + date ──');

test('P3: exact home/away + same date → matched', function() {
  var l = leg({ homeTeam:'Guardians', awayTeam:'Reds', scheduledStart:'2026-05-17T19:10:00Z' });
  var r = findGameForLeg(l, [REDS_GUARDIANS, MARLINS_RAYS]);
  assertEq(r.method, 'teams_date', 'method');
  assertEq(r.game.id, 'G001', 'correct game');
});

test('P3: doubleheader — same teams same date → ambiguous_match_refused', function() {
  var l = leg({ homeTeam:'Guardians', awayTeam:'Reds', scheduledStart:'2026-05-17T19:10:00Z' });
  // Both DH games have same home/away/date — no cKey to distinguish
  var dh1 = Object.assign({}, GUARDIANS_DH1, { _canonicalKey: null });
  var dh2 = Object.assign({}, GUARDIANS_DH2, { _canonicalKey: null });
  var r = findGameForLeg(l, [dh1, dh2]);
  assert(!r.game, 'no game returned');
  assertEq(r.reason, 'ambiguous_match_refused', 'doubleheader refused without cKey');
  assertEq(r.candidateCount, 2, '2 same-day candidates');
});

test('P3: wrong date → no candidate', function() {
  var l = leg({ homeTeam:'Guardians', awayTeam:'Reds', scheduledStart:'2026-05-18T19:10:00Z' });
  var r = findGameForLeg(l, [REDS_GUARDIANS]); // game is May 17, leg is May 18
  assertEq(r.candidateCount, 0, 'date mismatch → 0 candidates');
  assertEq(r.reason, 'no_candidate', 'reason: no_candidate');
});

test('P3: teams in reverse order (away/home swap) still matches', function() {
  var l = leg({ homeTeam:'Reds', awayTeam:'Guardians', scheduledStart:'2026-05-17T19:10:00Z' });
  var r = findGameForLeg(l, [REDS_GUARDIANS]);
  assertEq(r.method, 'teams_date', 'reverse match works');
  assertEq(r.game.id, 'G001', 'correct game');
});

// ── Priority 4: TLA fallback ───────────────────────────────────────────────────
console.log('\n── Priority 4: TLA fallback (legacy) ──');

test('P4: single candidate via matchup string → matched (legacy)', function() {
  var l = leg({ matchup:'Reds vs Guardians', scheduledStart:'2026-05-17T19:10:00Z' });
  var r = findGameForLeg(l, [REDS_GUARDIANS]);
  assertEq(r.method, 'tla_fallback', 'tla_fallback method');
  assertEq(r.game.id, 'G001', 'matched');
});

test('P4: two candidates via matchup → ambiguous_match_refused', function() {
  var l = leg({ matchup:'Reds vs Guardians', scheduledStart:'2026-05-17T19:10:00Z' });
  var r = findGameForLeg(l, [GUARDIANS_DH1, GUARDIANS_DH2]);
  assert(!r.game, 'no game returned');
  assertEq(r.reason, 'ambiguous_match_refused', 'reason correct');
});

// ── Safety: never grade ambiguous or future ────────────────────────────────────
console.log('\n── Safety checks ──');

test('in-progress game (not Final) → null game from findGameForLeg', function() {
  // findGameForLeg returns the game object regardless of status
  // Caller (gradeTicket) must check isGameFinal
  var l = leg({ providerGameId:'G006' });
  var r = findGameForLeg(l, [INPROGRESS]);
  assertEq(r.game.id, 'G006', 'game found');
  assert(!isGameFinal(r.game.status), 'game is not final — caller must check');
});

test('no candidates at all → no_match_found', function() {
  var l = leg({ homeTeam:'Mets', awayTeam:'Yankees', scheduledStart:'2026-05-17T19:10:00Z' });
  var r = findGameForLeg(l, [REDS_GUARDIANS, MARLINS_RAYS]);
  assertEq(r.reason, 'no_candidate', 'reason: no_candidate');
  assert(!r.game, 'no game');
});

// ── Ticket repair helper ──────────────────────────────────────────────────────
console.log('\n── repairTicketGameIdentity ──');

function repairTicketGameIdentity(ticket, gamesCache) {
  // Only repairs active/open tickets missing providerGameId
  var s = (ticket.status||'').toLowerCase();
  if (s !== 'active' && s !== 'open') return { repaired: false, reason: 'only_active_tickets' };
  var repaired = false;
  var sels = ticket.selections || [];
  sels.forEach(function(sel) {
    if (sel.providerGameId) return; // already set
    var r = findGameForLeg(sel, Object.values(gamesCache));
    if (r.game) {
      sel.providerGameId = r.game.id;
      sel._repaired = true;
      repaired = true;
    }
  });
  return { repaired: repaired, selectionsRepaired: sels.filter(function(s){ return s._repaired; }).length };
}

var CACHE = { 'G001': REDS_GUARDIANS, 'G002': MARLINS_RAYS };

test('repairTicketGameIdentity: fills missing providerGameId from cache', function() {
  var t = { id:'T_repair', status:'active', selections:[
    { homeTeam:'Guardians', awayTeam:'Reds', scheduledStart:'2026-05-17T19:10:00Z',
      canonicalGameKey: REDS_GUARDIANS._canonicalKey, pick:'Guardians ML', market:'Moneyline' }
  ]};
  var r = repairTicketGameIdentity(t, CACHE);
  assert(r.repaired, 'repaired');
  assertEq(r.selectionsRepaired, 1, '1 selection repaired');
  assertEq(t.selections[0].providerGameId, 'G001', 'providerGameId filled');
});

test('repairTicketGameIdentity: does not touch settled tickets', function() {
  var t = { id:'T_settled', status:'won', selections:[
    { homeTeam:'Guardians', awayTeam:'Reds', scheduledStart:'2026-05-17T19:10:00Z' }
  ]};
  var r = repairTicketGameIdentity(t, CACHE);
  assert(!r.repaired, 'settled ticket not repaired');
  assertEq(r.reason, 'only_active_tickets', 'reason correct');
  assert(!t.selections[0].providerGameId, 'providerGameId not set');
});

test('repairTicketGameIdentity: skips legs already having providerGameId', function() {
  var t = { id:'T_existing', status:'active', selections:[
    { homeTeam:'Guardians', awayTeam:'Reds', scheduledStart:'2026-05-17T19:10:00Z',
      providerGameId:'G001', canonicalGameKey: REDS_GUARDIANS._canonicalKey, pick:'ML', market:'Moneyline' }
  ]};
  var r = repairTicketGameIdentity(t, CACHE);
  assert(!r.repaired, 'no repair needed (already has id)');
  assertEq(r.selectionsRepaired, 0, '0 selections repaired');
});

test('repairTicketGameIdentity: ambiguous match not repaired', function() {
  var cache = { 'DH1': GUARDIANS_DH1, 'DH2': GUARDIANS_DH2 };
  var t = { id:'T_ambig', status:'active', selections:[
    { homeTeam:'Guardians', awayTeam:'Reds', scheduledStart:'2026-05-17T19:10:00Z', pick:'ML', market:'Moneyline' }
  ]};
  var r = repairTicketGameIdentity(t, cache);
  assert(!r.repaired, 'ambiguous match not auto-repaired');
  assert(!t.selections[0].providerGameId, 'providerGameId not set on ambiguous');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Grading match tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ GRADING MATCH TESTS FAILED'); process.exit(1); }
else console.log('✅ All grading match rules verified');
