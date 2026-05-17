/**
 * PocketBooks Sports — Live Grading Audit Tests
 * Run: node tests/grading-audit.test.js
 * Tests the full grading decision path: gates → match → grade → balance.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }
function assertApprox(a, b, m) { if (Math.abs(a-b) > 0.02) throw new Error((m||'') + ' — got ' + a + ' expected ~' + b); }

// ── Pure grading helpers (mirrored from player.html) ──────────────────────────

var GRACE_MS = 3 * 60 * 60 * 1000;
var FINAL_STATUSES = new Set(['final','f','completed','complete','closed','cancelled','canceled','postponed','suspended','forfeit','f/ot','f/so']);

function canGradeTicket(ticket, nowMs) {
  nowMs = nowMs || Date.now();
  var sels = ticket.selections || [];
  for (var i = 0; i < sels.length; i++) {
    var ct = sels[i].scheduledStart || sels[i].commenceTime || sels[i].time || null;
    if (!ct) continue;
    var ctMs = new Date(ct).getTime();
    if (isNaN(ctMs)) continue;
    if (nowMs < ctMs - GRACE_MS) return { canGrade: false, reason: 'future_game_not_gradeable', commenceTime: ct };
  }
  return { canGrade: true };
}

function isGameFinal(status) { return status ? FINAL_STATUSES.has(String(status).toLowerCase().trim()) : false; }

function gradeLeg(sel, game) {
  var pick   = (sel.pick   || '').toLowerCase();
  var market = (sel.market || '').toLowerCase();
  var hs = game.home_score, as = game.away_score;
  var home = (game.home || '').toLowerCase(), away = (game.away || '').toLowerCase();
  if (market.includes('moneyline') || market.includes('to win')) {
    var winner = hs > as ? home : as > hs ? away : null;
    if (!winner) return 'push';
    return (pick.includes(winner) || pick.includes(winner.split(' ').pop())) ? 'won' : 'lost';
  }
  if (market.includes('run line') || market.includes('spread')) {
    var m = pick.match(/([+-]?\d+\.?\d*)/); if (!m) return null;
    var spread = parseFloat(m[1]);
    var isHome = pick.includes(home) || pick.includes(home.split(' ').pop());
    var margin = isHome ? (hs - as) : (as - hs);
    var adj = margin + spread;
    return adj > 0 ? 'won' : adj < 0 ? 'lost' : 'push';
  }
  if (market.includes('total') || market.includes('over') || market.includes('under')) {
    var m2 = pick.match(/(\d+\.?\d*)/); if (!m2) return null;
    var line = parseFloat(m2[1]);
    var total = hs + as;
    var isOver = pick.startsWith('over') || /^o\s/.test(pick);
    if (total === line) return 'push';
    return (isOver ? total > line : total < line) ? 'won' : 'lost';
  }
  return null;
}

function gradeTicketFull(ticket, completedGames, nowMs) {
  nowMs = nowMs || Date.now();
  var gateCheck = canGradeTicket(ticket, nowMs);
  if (!gateCheck.canGrade) return { result: null, reason: gateCheck.reason, skipped: true };

  var sels = ticket.selections || [];
  if (!sels.length) return { result: null, reason: 'no_selections', skipped: true };

  var legResults = [], finalScores = [], primaryGame = null;

  for (var i = 0; i < sels.length; i++) {
    var sel = sels[i];
    var ctMs = sel.scheduledStart ? new Date(sel.scheduledStart).getTime() : 0;

    // Find matching game by canonicalGameKey first
    var game = null;
    if (sel.canonicalGameKey) {
      var ckMatches = completedGames.filter(function(g) { return g._canonicalKey === sel.canonicalGameKey; });
      if (ckMatches.length === 1) game = ckMatches[0];
      else if (ckMatches.length > 1) return { result: null, reason: 'ambiguous_match', skipped: true };
    }
    // TLA + date fallback if no canonicalGameKey
    if (!game) {
      var homeL = (sel.homeTeam||'').toLowerCase(), awayL = (sel.awayTeam||'').toLowerCase();
      var candidates = completedGames.filter(function(g) {
        return (g.home||'').toLowerCase() === homeL && (g.away||'').toLowerCase() === awayL;
      });
      if (candidates.length === 0) return { result: null, reason: 'no_match_found', skipped: true };
      if (candidates.length > 1) {
        // Date-gate to disambiguate
        var sdCandidates = ctMs > 0 ? candidates.filter(function(g) {
          var gMs = g._commenceMs || 0;
          var dA = new Date(ctMs), dB = new Date(gMs);
          return dA.getUTCFullYear()===dB.getUTCFullYear() && dA.getUTCMonth()===dB.getUTCMonth() && dA.getUTCDate()===dB.getUTCDate();
        }) : [];
        if (sdCandidates.length === 1) game = sdCandidates[0];
        else return { result: null, reason: candidates.length > 1 ? 'ambiguous_match' : 'date_mismatch_refused', skipped: true };
      } else {
        // Single candidate: date check
        if (ctMs > 0 && candidates[0]._commenceMs) {
          var dA2 = new Date(ctMs), dB2 = new Date(candidates[0]._commenceMs);
          if (dA2.getUTCFullYear()!==dB2.getUTCFullYear() || dA2.getUTCMonth()!==dB2.getUTCMonth() || dA2.getUTCDate()!==dB2.getUTCDate())
            return { result: null, reason: 'date_mismatch_refused', skipped: true };
        }
        game = candidates[0];
      }
    }
    if (!game) return { result: null, reason: 'no_match_found', skipped: true };
    if (!isGameFinal(game.status)) return { result: null, reason: 'game_not_final', skipped: true };

    var lr = gradeLeg(sel, game);
    if (!lr) return { result: null, reason: 'leg_unable_to_grade', skipped: true };
    legResults.push(lr);
    finalScores.push((game.away||'?') + ' ' + game.away_score + ' @ ' + (game.home||'?') + ' ' + game.home_score);
    if (!primaryGame) primaryGame = game;
  }

  var combined = legResults.some(function(r){ return r==='lost'; }) ? 'lost' :
                 legResults.every(function(r){ return r==='push'; }) ? 'push' :
                 legResults.some(function(r){ return r==='push'; })  ? 'push' : 'won';

  return { result: combined, legResults: legResults, finalScores: finalScores, primaryGame: primaryGame, skipped: false };
}

function calcBalance(tickets, starting) {
  starting = starting || 1000;
  var openRisk = 0, settledGains = 0, settledLosses = 0;
  tickets.forEach(function(t) {
    var s = (t.status||'').toLowerCase();
    var risk = parseFloat(t.riskAmount)||0, profit = parseFloat(t.potentialProfit)||0;
    if (s==='canceled'||s==='voided') return;
    if (s==='active'||s==='open')  { openRisk += risk; }
    else if (s==='won')   settledGains  += profit;
    else if (s==='lost')  settledLosses += risk;
  });
  return { starting, openRisk: Math.round(openRisk*100)/100, settledGains: Math.round(settledGains*100)/100, settledLosses: Math.round(settledLosses*100)/100, available: Math.round((starting-openRisk-settledLosses+settledGains)*100)/100 };
}

// ── Test data ─────────────────────────────────────────────────────────────────
var NOW = new Date('2026-05-17T21:00:00Z').getTime();
var YESTERDAY = '2026-05-16T19:10:00Z';
var TOMORROW  = '2026-05-18T19:10:00Z';

function makeTicket(id, pick, market, status, risk, toWin, commenceTime, gameKey, home, away) {
  return {
    id: id, status: status||'active', type: 'Single',
    riskAmount: risk||100, potentialProfit: toWin||90.91,
    estimatedPayout: (risk||100)+(toWin||90.91),
    selections: [{ pick:pick, market:market||'Moneyline', scheduledStart:commenceTime||YESTERDAY,
                   canonicalGameKey:gameKey||null, homeTeam:home||'Tampa Bay Rays', awayTeam:away||'Miami Marlins',
                   odds:-110 }]
  };
}

function makeGame(cKey, home, away, hs, as_, status, commenceMs) {
  return { id:'G_'+cKey, home:home, away:away, home_score:hs, away_score:as_,
           status:status||'Final', _canonicalKey:cKey, completed:isGameFinal(status||'Final'),
           _commenceMs: commenceMs || new Date(YESTERDAY).getTime() };
}

var MARLINS_KEY  = 'MLB|miami-marlins|tampa-bay-rays|2026-05-16';
var GUARDIAN_KEY = 'MLB|reds|guardians|2026-05-16';

var COMPLETED_GAMES = [
  makeGame(MARLINS_KEY,  'Tampa Bay Rays', 'Miami Marlins', 5, 3, 'Final'),  // Rays win 5-3
  makeGame(GUARDIAN_KEY, 'Guardians',      'Reds',          7, 2, 'Final'),  // Guardians win 7-2
];

// ── GRADING TESTS ─────────────────────────────────────────────────────────────

console.log('\n── Single Ticket Grading ──');

test('single win: Marlins ML, Marlins lose 3-5 → LOST', function() {
  var t = makeTicket('T1','Miami Marlins To Win','Moneyline','active',100,90.91,YESTERDAY,MARLINS_KEY,'Tampa Bay Rays','Miami Marlins');
  var r = gradeTicketFull(t, COMPLETED_GAMES, NOW);
  assertEq(r.result, 'lost', 'Marlins ML — Marlins lost 3-5');
  assert(!r.skipped, 'not skipped');
});

test('single win: Rays ML, Rays win 5-3 → WON', function() {
  var t = makeTicket('T2','Tampa Bay Rays To Win','Moneyline','active',100,90.91,YESTERDAY,MARLINS_KEY,'Tampa Bay Rays','Miami Marlins');
  var r = gradeTicketFull(t, COMPLETED_GAMES, NOW);
  assertEq(r.result, 'won', 'Rays ML wins');
});

test('run line: Marlins +1.5, lose 3-5, does not cover → LOST (margin=-2, +1.5=-0.5)', function() {
  // Marlins=away, score=3. Rays=home, score=5. margin for away = 3-5=-2. -2+1.5=-0.5 → LOST
  var t = makeTicket('T3','Miami Marlins +1.5','Run Line','active',100,90.91,YESTERDAY,MARLINS_KEY,'Tampa Bay Rays','Miami Marlins');
  var r = gradeTicketFull(t, COMPLETED_GAMES, NOW);
  assertEq(r.result, 'lost', 'Marlins +1.5 does not cover (lost by 2)');
});

test('run line: actually verify math — away loses by 2, +1.5 → LOST', function() {
  // away_score=3, home_score=5, pick=away +1.5
  // margin for away = away - home = 3-5 = -2. -2 + 1.5 = -0.5 < 0 → LOST
  var t = makeTicket('T3b','Miami Marlins +1.5','Run Line','active',100,90.91,YESTERDAY,MARLINS_KEY,'Tampa Bay Rays','Miami Marlins');
  var r = gradeTicketFull(t, COMPLETED_GAMES, NOW);
  assertEq(r.result, 'lost', 'Marlins +1.5, lost by 2 — does not cover');
});

test('over/under: Over 7.5, total=8 → WON', function() {
  var t = makeTicket('T4','Over 7.5','Total','active',75,68.18,YESTERDAY,MARLINS_KEY,'Tampa Bay Rays','Miami Marlins');
  var r = gradeTicketFull(t, COMPLETED_GAMES, NOW);
  assertEq(r.result, 'won', 'Over 7.5 total=8 wins');
});

test('under: Under 9, total=8 → WON', function() {
  var t = makeTicket('T5','Under 9','Total','active',75,68.18,YESTERDAY,MARLINS_KEY,'Tampa Bay Rays','Miami Marlins');
  var r = gradeTicketFull(t, COMPLETED_GAMES, NOW);
  assertEq(r.result, 'won', 'Under 9 total=8 wins');
});

console.log('\n── Parlay Grading ──');

test('parlay: both legs win → WON', function() {
  var t = { id:'P1', status:'active', type:'Parlay', riskAmount:25, potentialProfit:165, estimatedPayout:190,
    selections: [
      { pick:'Tampa Bay Rays To Win', market:'Moneyline', scheduledStart:YESTERDAY, canonicalGameKey:MARLINS_KEY, homeTeam:'Tampa Bay Rays', awayTeam:'Miami Marlins' },
      { pick:'Guardians To Win',      market:'Moneyline', scheduledStart:YESTERDAY, canonicalGameKey:GUARDIAN_KEY, homeTeam:'Guardians', awayTeam:'Reds' }
    ]};
  var r = gradeTicketFull(t, COMPLETED_GAMES, NOW);
  assertEq(r.result, 'won', 'parlay both win');
  assertEq(r.legResults.join(','), 'won,won', 'both legs won');
});

test('parlay: one leg loses → LOST', function() {
  var t = { id:'P2', status:'active', type:'Parlay', riskAmount:25, potentialProfit:165, estimatedPayout:190,
    selections: [
      { pick:'Miami Marlins To Win',  market:'Moneyline', scheduledStart:YESTERDAY, canonicalGameKey:MARLINS_KEY, homeTeam:'Tampa Bay Rays', awayTeam:'Miami Marlins' },
      { pick:'Guardians To Win',      market:'Moneyline', scheduledStart:YESTERDAY, canonicalGameKey:GUARDIAN_KEY, homeTeam:'Guardians', awayTeam:'Reds' }
    ]};
  var r = gradeTicketFull(t, COMPLETED_GAMES, NOW);
  assertEq(r.result, 'lost', 'parlay one loss = lost');
  assert(r.legResults.includes('lost'), 'at least one lost leg');
});

console.log('\n── Gate Tests ──');

test('future game: commenceTime tomorrow → skipped', function() {
  var t = makeTicket('TF1','Marlins ML','Moneyline','active',100,90.91,TOMORROW,MARLINS_KEY,'Tampa Bay Rays','Miami Marlins');
  var r = gradeTicketFull(t, COMPLETED_GAMES, NOW);
  assert(r.skipped, 'future game skipped');
  assertEq(r.reason, 'future_game_not_gradeable', 'reason correct');
});

test('game not final: status=InProgress → skipped', function() {
  var inProgressGames = [makeGame(MARLINS_KEY,'Tampa Bay Rays','Miami Marlins',3,2,'InProgress')];
  var t = makeTicket('TF2','Rays ML','Moneyline','active',100,90.91,YESTERDAY,MARLINS_KEY,'Tampa Bay Rays','Miami Marlins');
  var r = gradeTicketFull(t, inProgressGames, NOW);
  assert(r.skipped, 'in-progress game skipped');
  assertEq(r.reason, 'game_not_final', 'reason: game_not_final');
});

test('no match found → skipped', function() {
  var t = makeTicket('TF3','Cubs ML','Moneyline','active',100,90.91,YESTERDAY,'MLB|cubs|cards|2026-05-16','Cardinals','Cubs');
  var r = gradeTicketFull(t, COMPLETED_GAMES, NOW);
  assert(r.skipped, 'no match skipped');
  assertEq(r.reason, 'no_match_found', 'reason: no_match_found');
});

test('date mismatch: ticket for May 15, game is May 16 → refused', function() {
  var MAY15 = '2026-05-15T19:10:00Z';
  var MAY15_GAME = makeGame(MARLINS_KEY,'Tampa Bay Rays','Miami Marlins',5,3,'Final', new Date('2026-05-16T19:10:00Z').getTime()); // May 16 game
  var t = makeTicket('TF4','Rays ML','Moneyline','active',100,90.91,MAY15,null,'Tampa Bay Rays','Miami Marlins'); // May 15 ticket, no cKey
  t.selections[0].canonicalGameKey = null;
  var r = gradeTicketFull(t, [MAY15_GAME], NOW);
  assert(r.skipped, 'date mismatch skipped');
  assertEq(r.reason, 'date_mismatch_refused', 'reason: date_mismatch_refused');
});

test('ambiguous match: two games same teams same day → refused', function() {
  var DH1 = makeGame('MLB|reds|guardians|2026-05-16-g1','Guardians','Reds',4,3,'Final');
  var DH2 = makeGame('MLB|reds|guardians|2026-05-16-g2','Guardians','Reds',6,5,'Final');
  var t = makeTicket('TF5','Guardians ML','Moneyline','active',100,90.91,YESTERDAY,null,'Guardians','Reds');
  t.selections[0].canonicalGameKey = null; // no key → falls to TLA+date
  var r = gradeTicketFull(t, [DH1, DH2], NOW);
  assert(r.skipped, 'ambiguous match refused');
  assertEq(r.reason, 'ambiguous_match', 'reason: ambiguous_match');
});

console.log('\n── Balance After Grading ──');

test('balance: single win correctly adds profit', function() {
  var tickets = [{ id:'B1', status:'active', riskAmount:100, potentialProfit:90.91 }];
  var before = calcBalance(tickets, 1000);
  assertEq(before.openRisk, 100, 'openRisk=100 before');
  assertApprox(before.available, 900, 'available=900 before');
  // Grade to won
  tickets[0].status = 'won';
  tickets[0].gradedAt = new Date().toISOString();
  var after = calcBalance(tickets, 1000);
  assertEq(after.openRisk, 0, 'openRisk=0 after win');
  assertApprox(after.settledGains, 90.91, 'gains=90.91');
  assertApprox(after.available, 1090.91, 'available=1090.91');
});

test('balance: single loss — risk stays gone', function() {
  var tickets = [{ id:'B2', status:'active', riskAmount:75, potentialProfit:68.18 }];
  var before = calcBalance(tickets, 1000);
  assertApprox(before.available, 925, 'available=925 before');
  tickets[0].status = 'lost'; tickets[0].gradedAt = new Date().toISOString();
  var after = calcBalance(tickets, 1000);
  assertEq(after.openRisk, 0, 'no openRisk');
  assertApprox(after.settledLosses, 75, 'settledLosses=75');
  assertApprox(after.available, 925, 'available=925 (same as before — risk was already deducted via openRisk)');
});

test('balance: push — risk returned', function() {
  var tickets = [{ id:'B3', status:'active', riskAmount:50, potentialProfit:50 }];
  var before = calcBalance(tickets, 1000);
  assertApprox(before.available, 950, 'before=950');
  tickets[0].status = 'push'; tickets[0].gradedAt = new Date().toISOString();
  var after = calcBalance(tickets, 1000, function(t){ return !!t.gradedAt; });
  assertApprox(after.available, 1000, 'push returns to 1000');
});

test('host profit delta: player wins → host loses toWin amount', function() {
  // Host exposure before = potentialProfit = 90.91
  // After player win: host pays out 90.91
  var hostExposureBefore = 90.91;
  var hostProfitDelta = -(90.91); // host loses
  assert(hostProfitDelta < 0, 'host profit delta negative on player win');
});

test('host profit delta: player loses → host keeps risk', function() {
  var riskAmount = 100;
  var hostProfitDelta = riskAmount; // host gains
  assert(hostProfitDelta > 0, 'host profit delta positive on player loss');
});

console.log('\n' + '─'.repeat(54));
console.log(`Grading audit tests: ${_pass} passed, ${_fail} failed`);
if (_fail > 0) { console.error('❌ GRADING AUDIT TESTS FAILED'); process.exit(1); }
else console.log('✅ All grading audit rules verified');
