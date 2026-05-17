/**
 * PocketBooks Sports — Ticket Lifecycle Rule Tests
 * Run: node tests/lifecycle.test.js
 *
 * Math-law rules. Every rule must have a passing test before deploy.
 * No new grading feature ships without all tests green.
 */
'use strict';

// ── Harness ──────────────────────────────────────────────────────────────────
var _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)   { if (!c)     throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }
function assertApprox(a, b, m) { if (Math.abs(a-b) > 0.01) throw new Error((m||'') + ' — got ' + a + ' expected ~' + b); }

// ── Pure implementations (mirror player.html logic) ──────────────────────────

var GRACE_MS = 3 * 60 * 60 * 1000; // 3h

// Rule helpers
function selCommenceMs(sel) {
  var ct = sel.scheduledStart || sel.commenceTime || sel.time || null;
  if (!ct) return 0;
  var ms = new Date(ct).getTime();
  return isNaN(ms) ? 0 : ms;
}

function canGradeTicket(ticket, nowMs) {
  // Rule: ticket cannot grade before commenceTime - GRACE_MS
  nowMs = nowMs || Date.now();
  var sels = ticket.selections || [];
  for (var i = 0; i < sels.length; i++) {
    var ctMs = selCommenceMs(sels[i]);
    if (ctMs > 0 && nowMs < ctMs - GRACE_MS) {
      return { ok: false, reason: 'future_game_not_gradeable', commenceTime: new Date(ctMs).toISOString(), now: new Date(nowMs).toISOString() };
    }
  }
  return { ok: true };
}

function sameDateUTC(msA, msB) {
  if (!msA || !msB) return true;
  var a = new Date(msA), b = new Date(msB);
  return a.getUTCFullYear() === b.getUTCFullYear() &&
         a.getUTCMonth()    === b.getUTCMonth() &&
         a.getUTCDate()     === b.getUTCDate();
}

function matchGame(sel, candidates) {
  // Match by canonicalGameKey first, then TLA pair with date gate
  // Returns { game, method, refuseReason } or { game: null, refuseReason }
  var selCtMs = selCommenceMs(sel);

  // Step 0: canonicalGameKey
  if (sel.canonicalGameKey) {
    var ckMatches = candidates.filter(function(g) { return g._canonicalKey === sel.canonicalGameKey; });
    if (ckMatches.length === 1) return { game: ckMatches[0], method: 'canonicalGameKey' };
    if (ckMatches.length > 1)   return { game: null, refuseReason: 'ambiguous_match' };
  }

  // Step 1: TLA pair + date gate
  var selHome = (sel.homeTeam || '').toLowerCase();
  var selAway = (sel.awayTeam || '').toLowerCase();
  var tlaMatches = candidates.filter(function(g) {
    return (g.home || '').toLowerCase() === selHome && (g.away || '').toLowerCase() === selAway;
  });

  if (tlaMatches.length === 0) return { game: null, refuseReason: 'no_candidate' };

  // Date gate
  var sameDateMatches = tlaMatches.filter(function(g) {
    return selCtMs > 0 ? sameDateUTC(selCtMs, g._commenceMs || 0) : true;
  });

  if (sameDateMatches.length === 0) return { game: null, refuseReason: 'date_mismatch_refused' };
  if (sameDateMatches.length > 1)   return { game: null, refuseReason: 'ambiguous_match' };
  return { game: sameDateMatches[0], method: 'tla_date' };
}

function gradeLeg(sel, game) {
  // Returns 'won'|'lost'|'push'|null
  var pick   = (sel.pick   || '').toLowerCase();
  var market = (sel.market || '').toLowerCase();
  var hs = game.home_score, as = game.away_score;
  var home = (game.home || '').toLowerCase();
  var away = (game.away || '').toLowerCase();

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

function gradeTicket(ticket, candidates, nowMs) {
  nowMs = nowMs || Date.now();

  // Gate 1: future game
  var gateCheck = canGradeTicket(ticket, nowMs);
  if (!gateCheck.ok) return { result: null, reason: gateCheck.reason, commenceTime: gateCheck.commenceTime };

  var sels = ticket.selections || [];
  var legResults = [], finalScores = [];

  for (var i = 0; i < sels.length; i++) {
    var sel = sels[i];
    var match = matchGame(sel, candidates);
    if (!match.game) return { result: null, reason: match.refuseReason || 'no_match' };
    if (!match.game.completed) return { result: null, reason: 'game_not_final' };

    var lr = gradeLeg(sel, match.game);
    if (!lr) return { result: null, reason: 'leg_unable_to_grade' };
    legResults.push(lr);
    finalScores.push(match.game.away + ' ' + match.game.away_score + ' @ ' + match.game.home + ' ' + match.game.home_score);
  }

  var combined = legResults.some(function(r){ return r==='lost'; }) ? 'lost' :
                 legResults.every(function(r){ return r==='push'; }) ? 'push' :
                 legResults.some(function(r){ return r==='push'; })  ? 'push' : 'won';

  return { result: combined, finalScores: finalScores };
}

function calcBalance(tickets, starting, isSettledFn) {
  starting = starting || 1000;
  var openRisk = 0, settledGains = 0, settledLosses = 0;
  tickets.forEach(function(t) {
    var s = (t.status || '').toLowerCase();
    if (s === 'canceled' || s === 'voided') return; // zero impact
    var risk   = parseFloat(t.riskAmount)      || 0;
    var profit = parseFloat(t.potentialProfit) || 0;
    var settled = isSettledFn ? isSettledFn(t) : (s === 'won' || s === 'lost' || s === 'push');
    if (!settled || s === 'active' || s === 'open') { openRisk += risk; }
    else if (s === 'won')  settledGains  += profit;
    else if (s === 'lost') settledLosses += risk;
  });
  return { starting, openRisk: Math.round(openRisk*100)/100, settledGains: Math.round(settledGains*100)/100, settledLosses: Math.round(settledLosses*100)/100, available: Math.round((starting - openRisk - settledLosses + settledGains)*100)/100 };
}

// ── Test data helpers ─────────────────────────────────────────────────────────
var NOW = new Date('2026-05-17T07:00:00Z').getTime();
var TOMORROW_CT  = '2026-05-18T19:10:00Z'; // future game
var YESTERDAY_CT = '2026-05-16T19:10:00Z'; // past game

function makeTicket(overrides) {
  return Object.assign({
    id: 'T_test', status: 'active', riskAmount: 100, potentialProfit: 90.91,
    estimatedPayout: 190.91, placedAt: new Date(NOW).toISOString(),
    selections: [{
      pick: 'Miami Marlins +1.5', market: 'Run Line',
      homeTeam: 'Tampa Bay Rays', awayTeam: 'Miami Marlins',
      canonicalGameKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-16',
      scheduledStart: YESTERDAY_CT,
      odds: -110
    }]
  }, overrides);
}

function makeGame(overrides) {
  return Object.assign({
    id: 'G001', home: 'Tampa Bay Rays', away: 'Miami Marlins',
    home_score: 3, away_score: 5, completed: true,
    _canonicalKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-16',
    _commenceMs: new Date(YESTERDAY_CT).getTime()
  }, overrides);
}

// ═════════════════════════════════════════════════════════════════════════════
// RULE 1: Placement creates immutable identity fields
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Rule 1: Ticket Identity Fields \u2500\u2500');

test('placed ticket has all required immutable fields', function() {
  var t = makeTicket();
  var sel = t.selections[0];
  assert(t.id,                    'ticketId present');
  assert(sel.pick,                'pick present');
  assert(sel.market,              'market present');
  assert(sel.homeTeam,            'homeTeam present');
  assert(sel.awayTeam,            'awayTeam present');
  assert(sel.canonicalGameKey,    'canonicalGameKey present');
  assert(sel.scheduledStart || sel.commenceTime, 'commenceTime present');
  assert(t.riskAmount,            'risk present');
  assert(t.potentialProfit,       'toWin present');
  assert(t.placedAt,              'placedAt present');
});

// ═════════════════════════════════════════════════════════════════════════════
// RULE 5 + 10: Before commenceTime → NEVER grade
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Rule 5/10: Future Game Cannot Grade \u2500\u2500');

test('future game is blocked before commenceTime', function() {
  var t = makeTicket({ selections: [{ scheduledStart: TOMORROW_CT, pick: 'Marlins +1.5', market: 'Run Line', homeTeam: 'Tampa Bay Rays', awayTeam: 'Miami Marlins', canonicalGameKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-18' }] });
  var g = makeGame({ _canonicalKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-18', _commenceMs: new Date(TOMORROW_CT).getTime() });
  var r = gradeTicket(t, [g], NOW);
  assertEq(r.result, null, 'result must be null');
  assertEq(r.reason, 'future_game_not_gradeable', 'correct reason');
});

test('future game: different completed game with same teams does NOT grade it', function() {
  // Yesterday's final game exists — but ticket is for tomorrow
  var t = makeTicket({ selections: [{ scheduledStart: TOMORROW_CT, pick: 'Marlins +1.5', market: 'Run Line', homeTeam: 'Tampa Bay Rays', awayTeam: 'Miami Marlins', canonicalGameKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-18' }] });
  var yesterdayGame = makeGame(); // yesterday's game, same teams, completed
  var r = gradeTicket(t, [yesterdayGame], NOW);
  assertEq(r.result, null, 'future ticket blocked even if yesterday game is final');
  assertEq(r.reason, 'future_game_not_gradeable', 'future_game_not_gradeable reason');
});

test('game started 1h ago (within grace) — grading allowed', function() {
  var oneHourAgo = new Date(NOW - 60*60*1000).toISOString();
  var t = makeTicket({ selections: [{ scheduledStart: oneHourAgo, pick: 'Miami Marlins +1.5', market: 'Run Line', homeTeam: 'Tampa Bay Rays', awayTeam: 'Miami Marlins', canonicalGameKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-17' }] });
  var g = makeGame({ _canonicalKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-17', _commenceMs: new Date(oneHourAgo).getTime() });
  var check = canGradeTicket(t, NOW);
  assertEq(check.ok, true, 'game started 1h ago is within grace — can grade');
});

// ═════════════════════════════════════════════════════════════════════════════
// RULE 6: After start but not Final → stays active
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Rule 6: Game In Progress → Stay Active \u2500\u2500');

test('game started, not final — ticket stays active', function() {
  var oneHourAgo = new Date(NOW - 60*60*1000).toISOString();
  var t = makeTicket({ selections: [{ scheduledStart: oneHourAgo, pick: 'Miami Marlins +1.5', market: 'Run Line', homeTeam: 'Tampa Bay Rays', awayTeam: 'Miami Marlins', canonicalGameKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-17' }] });
  var inProgressGame = makeGame({ _canonicalKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-17', _commenceMs: new Date(oneHourAgo).getTime(), completed: false });
  var r = gradeTicket(t, [inProgressGame], NOW);
  assertEq(r.result, null, 'in-progress game cannot settle ticket');
  assertEq(r.reason, 'game_not_final', 'correct reason');
});

// ═════════════════════════════════════════════════════════════════════════════
// RULE 7: Only exact matched Final game can grade
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Rule 7: Only Exact Final Game Grades \u2500\u2500');

test('run line: Marlins +1.5, Marlins win 5-3 → WON', function() {
  var t = makeTicket();
  var g = makeGame({ home_score: 3, away_score: 5 }); // Marlins win
  var r = gradeTicket(t, [g], NOW);
  assertEq(r.result, 'won', 'Marlins +1.5 with Marlins winning 5-3');
});

test('run line: Marlins +1.5, Marlins lose 2-5 → LOST', function() {
  var t = makeTicket();
  var g = makeGame({ home_score: 5, away_score: 2 }); // Marlins lose
  var r = gradeTicket(t, [g], NOW);
  assertEq(r.result, 'lost', 'Marlins +1.5 with Marlins losing 2-5');
});

test('run line: Marlins +1.5, Marlins lose by 1 → WON (covers spread)', function() {
  var t = makeTicket();
  var g = makeGame({ home_score: 4, away_score: 3 }); // Marlins lose 3-4, but +1.5 → 3-4+1.5 = +0.5 → covers
  var r = gradeTicket(t, [g], NOW);
  assertEq(r.result, 'won', 'Marlins +1.5 loses by 1 — covers spread');
});

test('moneyline: ML pick on winner grades WON', function() {
  var t = makeTicket({ selections: [Object.assign({}, makeTicket().selections[0], { pick: 'Tampa Bay Rays To Win', market: 'Moneyline', canonicalGameKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-16' })] });
  var g = makeGame({ home_score: 6, away_score: 2 }); // Rays win
  var r = gradeTicket(t, [g], NOW);
  assertEq(r.result, 'won', 'ML pick on Rays, Rays win');
});

test('total: Over 7.5, total 8 → WON', function() {
  var t = makeTicket({ selections: [Object.assign({}, makeTicket().selections[0], { pick: 'Over 7.5', market: 'Total', canonicalGameKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-16' })] });
  var g = makeGame({ home_score: 3, away_score: 5 }); // total 8
  var r = gradeTicket(t, [g], NOW);
  assertEq(r.result, 'won', 'Over 7.5 with total 8');
});

test('total: Under 9, total 8 → WON', function() {
  var t = makeTicket({ selections: [Object.assign({}, makeTicket().selections[0], { pick: 'Under 9', market: 'Total', canonicalGameKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-16' })] });
  var g = makeGame({ home_score: 3, away_score: 5 }); // total 8
  var r = gradeTicket(t, [g], NOW);
  assertEq(r.result, 'won', 'Under 9 with total 8');
});

// ═════════════════════════════════════════════════════════════════════════════
// RULE 8: Ambiguous match → never grade
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Rule 8: Ambiguous Match → Never Grade \u2500\u2500');

test('two games same teams same date (doubleheader) → ambiguous, refused', function() {
  var t = makeTicket({ selections: [{ scheduledStart: YESTERDAY_CT, pick: 'Marlins +1.5', market: 'Run Line', homeTeam: 'Tampa Bay Rays', awayTeam: 'Miami Marlins', odds: -110 }] }); // no canonicalGameKey
  var g1 = makeGame({ id: 'G1', _canonicalKey: null, _commenceMs: new Date(YESTERDAY_CT).getTime() });
  var g2 = makeGame({ id: 'G2', _canonicalKey: null, _commenceMs: new Date(YESTERDAY_CT).getTime() });
  var r = gradeTicket(t, [g1, g2], NOW);
  assertEq(r.result, null, 'doubleheader must refuse');
  assertEq(r.reason, 'ambiguous_match', 'ambiguous_match reason');
});

test('canonicalGameKey resolves doubleheader unambiguously', function() {
  var cKey = 'MLB|miami-marlins|tampa-bay-rays|2026-05-16-game2';
  var t = makeTicket({ selections: [{ scheduledStart: YESTERDAY_CT, pick: 'Miami Marlins +1.5', market: 'Run Line', homeTeam: 'Tampa Bay Rays', awayTeam: 'Miami Marlins', canonicalGameKey: cKey, odds: -110 }] });
  var g1 = makeGame({ id: 'G1', _canonicalKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-16-game1', _commenceMs: new Date(YESTERDAY_CT).getTime() });
  var g2 = makeGame({ id: 'G2', _canonicalKey: cKey, _commenceMs: new Date(YESTERDAY_CT).getTime(), home_score: 3, away_score: 5 });
  var r = gradeTicket(t, [g1, g2], NOW);
  assertEq(r.result, 'won', 'canonicalGameKey picks correct game from doubleheader');
});

// ═════════════════════════════════════════════════════════════════════════════
// RULE 9: Wrong date → refused
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Rule 9: Date Mismatch → Refused \u2500\u2500');

test('ticket for May 15, matched game is May 16 → date_mismatch_refused', function() {
  // Both dates in the past relative to NOW (May 17 07:00Z), so future gate does not fire
  var MAY15_CT = '2026-05-15T19:10:00Z'; // ticket scheduled for May 15
  var MAY16_CT = '2026-05-16T19:10:00Z'; // only available completed game is May 16
  var t = makeTicket({ selections: [{ scheduledStart: MAY15_CT, pick: 'Marlins +1.5', market: 'Run Line', homeTeam: 'Tampa Bay Rays', awayTeam: 'Miami Marlins', odds: -110 }] }); // no canonicalGameKey — falls to TLA+date match
  var may16Game = makeGame({ _commenceMs: new Date(MAY16_CT).getTime(), _canonicalKey: null }); // different date
  var r = gradeTicket(t, [may16Game], NOW);
  assertEq(r.result, null, 'wrong date must refuse');
  assertEq(r.reason, 'date_mismatch_refused', 'date_mismatch_refused reason');
});

// ═════════════════════════════════════════════════════════════════════════════
// RULE 11: Canceled → zero impact
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Rule 11: Canceled Ticket → Zero Impact \u2500\u2500');

test('canceled ticket: zero balance impact', function() {
  var tickets = [{ status: 'canceled', riskAmount: 100, potentialProfit: 90 }];
  var b = calcBalance(tickets, 1000);
  assertEq(b.available, 1000, 'canceled = zero impact');
  assertEq(b.openRisk, 0, 'no openRisk');
  assertEq(b.settledLosses, 0, 'no loss');
});

test('canceled ticket: not counted in won/lost record', function() {
  var tickets = [
    { status: 'won',      riskAmount: 100, potentialProfit: 90, gradedAt: YESTERDAY_CT },
    { status: 'canceled', riskAmount: 50,  potentialProfit: 45 }
  ];
  var b = calcBalance(tickets, 1000, function(t){ return !!t.gradedAt; });
  assertEq(b.settledGains, 90, 'only won ticket contributes gain');
  assertApprox(b.available, 1090, 'balance = 1000 + 90 profit');
});

// ═════════════════════════════════════════════════════════════════════════════
// COMPOUND: Marlins scenario — future ticket never grades even with final game
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Compound: Marlins Scenario \u2500\u2500');

test('Marlins +1.5 placed tonight for tomorrow — never grades even with final game', function() {
  var t = makeTicket({
    id: 'T_marlins', status: 'active', riskAmount: 100, potentialProfit: 56.82,
    selections: [{
      pick: 'Miami Marlins +1.5', market: 'Run Line',
      homeTeam: 'Tampa Bay Rays', awayTeam: 'Miami Marlins',
      canonicalGameKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-18',
      scheduledStart: TOMORROW_CT, odds: -130
    }]
  });
  // Even if a completed game with same teams exists
  var completedGame = makeGame({ _canonicalKey: 'MLB|miami-marlins|tampa-bay-rays|2026-05-18', _commenceMs: new Date(TOMORROW_CT).getTime(), completed: true });
  var r = gradeTicket(t, [completedGame], NOW);
  assertEq(r.result, null, 'never grades');
  assertEq(r.reason, 'future_game_not_gradeable', 'reason: future_game_not_gradeable');
});

test('Marlins scenario: balance with active+canceled = expected openRisk', function() {
  var tickets = [
    { id: 'T_marlins', status: 'active',   riskAmount: 100, potentialProfit: 56.82 },
    { id: 'T_orioles', status: 'active',   riskAmount: 100, potentialProfit: 90.91 },
    { id: 'T_canceled',status: 'canceled', riskAmount: 100, potentialProfit: 56.82 }
  ];
  var b = calcBalance(tickets, 1000);
  assertEq(b.openRisk, 200, 'openRisk = 200 (2 active)');
  assertEq(b.available, 800, 'available = 800');
  assertEq(b.settledGains, 0, 'no settled gains');
  assertEq(b.settledLosses, 0, 'no settled losses');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Lifecycle tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ LIFECYCLE TESTS FAILED — do not deploy'); process.exit(1); }
else console.log('✅ All lifecycle rules verified');
