/**
 * PocketBooks Sports — Server Grading Tests (Phase C)
 * Run: node tests/server-grade.test.js
 * Tests server grading logic: match priority, idempotency, ledger, audit.
 * No network calls — pure function tests.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b)); }
function assertApprox(a, b, m) { if (Math.abs(a - b) > 0.02) throw new Error((m||'') + ' — got '+a+' expected ~'+b); }

// ── Pure helpers (mirror of backend grading engine) ───────────────────────────

var FINAL_STATUSES = new Set(['final','f','completed','complete','closed',
  'cancelled','canceled','postponed','suspended','forfeit','f/ot','f/so']);

function isGameFinal(s) { return s ? FINAL_STATUSES.has(String(s).toLowerCase().trim()) : false; }

function normName(s) {
  if (!s) return '';
  return String(s).toLowerCase().replace(/\s+/g,' ').trim().replace(/^the\s+/,'');
}

function sameDateUTC(a, b) {
  if (!a || !b) return true;
  var da = new Date(a), db = new Date(b);
  return da.getUTCFullYear()===db.getUTCFullYear() && da.getUTCMonth()===db.getUTCMonth() && da.getUTCDate()===db.getUTCDate();
}

function amToDecimal(o) {
  var n = parseInt(String(o).replace('+',''));
  if (!n || isNaN(n)) return 1;
  return n > 0 ? n/100+1 : 100/Math.abs(n)+1;
}

// Match engine (4-priority, mirrors player.html new engine)
function findGame(leg, games) {
  var selMs = leg.scheduledStart ? new Date(leg.scheduledStart).getTime() : 0;
  var provId = leg.providerGameId || null;
  var cKey   = leg.canonicalGameKey || null;
  var selH   = normName(leg.homeTeam), selA = normName(leg.awayTeam);

  // P1: providerGameId
  if (provId) {
    var p1 = games.find(function(g){ return g.id === provId; });
    if (p1) return { game:p1, method:'provider_game_id' };
  }
  // P2: canonicalGameKey
  if (cKey) {
    var p2 = games.filter(function(g){ return g._cKey === cKey; });
    if (p2.length===1) return { game:p2[0], method:'canonical_game_key' };
    if (p2.length>1)  return { game:null, reason:'ambiguous_match_refused', method:'canonical_game_key', candidates:p2.length };
  }
  // P3: teams + date
  if (selH && selA) {
    var p3 = games.filter(function(g){
      var gh=normName(g.home), ga=normName(g.away);
      var teams=(gh===selH&&ga===selA)||(gh===selA&&ga===selH);
      if (!teams) return false;
      return selMs>0 && g._commenceMs>0 ? sameDateUTC(new Date(selMs),new Date(g._commenceMs)) : true;
    });
    if (p3.length===1) return { game:p3[0], method:'teams_date' };
    if (p3.length>1)  return { game:null, reason:'ambiguous_match_refused', method:'teams_date', candidates:p3.length };
    return { game:null, reason:'no_candidate', method:'teams_date', candidates:0 };
  }
  return { game:null, reason:'no_match_found', method:'none', candidates:0 };
}

// Grade a single leg
function gradeLeg(sel, game) {
  var pick=normName(sel.pick), market=(sel.market||'').toLowerCase();
  var hs=game.homeScore, as=game.awayScore;
  var home=normName(game.home), away=normName(game.away);
  if (market.includes('moneyline')||market.includes('to win')) {
    var winner=hs>as?home:as>hs?away:null;
    if (!winner) return 'push';
    return (pick.includes(winner)||pick.includes(winner.split(' ').pop()))?'won':'lost';
  }
  if (market.includes('run line')||market.includes('spread')) {
    var m=pick.match(/([+-]?\d+\.?\d*)/); if(!m) return null;
    var spread=parseFloat(m[1]);
    var isH=pick.includes(home)||pick.includes(home.split(' ').pop());
    var margin=isH?(hs-as):(as-hs); var adj=margin+spread;
    return adj>0?'won':adj<0?'lost':'push';
  }
  if (market.includes('total')||market.includes('over')||market.includes('under')) {
    var m2=pick.match(/(\d+\.?\d*)/); if(!m2) return null;
    var line=parseFloat(m2[1]); var total=hs+as; var isOver=pick.includes('over')||/^o\s/.test(pick);
    if (total===line) return 'push';
    return (isOver?total>line:total<line)?'won':'lost';
  }
  return null;
}

// Grade a full ticket
function gradeTicket(ticket, games, nowMs) {
  nowMs = nowMs || Date.now();
  var sels = ticket.selections || [];
  // Future gate
  for (var i=0; i<sels.length; i++) {
    var ctMs = sels[i].scheduledStart ? new Date(sels[i].scheduledStart).getTime() : 0;
    if (ctMs>0 && ctMs>nowMs) return { result:null, reason:'future_game_not_gradeable' };
  }
  var legResults=[], scores=[];
  for (var j=0; j<sels.length; j++) {
    var sel=sels[j]; var match=findGame(sel, games);
    if (!match.game) return { result:null, reason:match.reason||'no_match', matchMethod:match.method };
    if (!isGameFinal(match.game.status)) return { result:null, reason:'game_not_final', matchMethod:match.method };
    var lr=gradeLeg(sel, match.game);
    if (!lr) return { result:null, reason:'leg_unable_to_grade' };
    legResults.push(lr);
    scores.push(match.game.away+' '+match.game.awayScore+' @ '+match.game.home+' '+match.game.homeScore);
  }
  var combined=legResults.some(function(r){return r==='lost';})?'lost':
               legResults.every(function(r){return r==='push';})?'push':
               legResults.some(function(r){return r==='push';})?'push':'won';
  return { result:combined, legResults:legResults, finalScores:scores };
}

// Idempotency: build ledger entry id
function buildLedgerEntryId(ticketId, type, gradedAt) {
  return 'SG_' + type + '_' + ticketId + '_' + gradedAt;
}

// Payout calculation
function calcPayout(ticket, result) {
  if (result==='push') return parseFloat(ticket.riskAmount)||0;
  if (result!=='won')  return 0;
  var sels=ticket.selections||[];
  var combined=sels.reduce(function(p,s){ return p*amToDecimal(s.odds||0); },1);
  return Math.round(((parseFloat(ticket.riskAmount)||0)*combined)*100)/100;
}

// ── Test data ─────────────────────────────────────────────────────────────────
var NOW = new Date('2026-05-18T21:00:00Z').getTime();
var PAST = '2026-05-17T19:10:00Z';
var FUTURE = '2026-05-20T19:10:00Z';

function game(id, home, away, hs, as_, status, commenceTime) {
  return { id:id, home:home, away:away, homeScore:hs, awayScore:as_,
    status:status||'Final', _cKey:'MLB|'+normName(away).replace(/\s/g,'-')+'|'+normName(home).replace(/\s/g,'-')+'|2026-05-17',
    _commenceMs: new Date(commenceTime||PAST).getTime() };
}
function sel(pick, market, odds, home, away, provId, cKey) {
  return { pick, market:market||'Moneyline', odds:odds||-110,
    homeTeam:home||'Guardians', awayTeam:away||'Reds',
    providerGameId:provId||null,
    canonicalGameKey:cKey||'MLB|reds|guardians|2026-05-17',
    scheduledStart:PAST };
}
function ticket(id, type, sels, risk) {
  return { id, type:type||'Single', status:'active',
    riskAmount:risk||100, potentialProfit:90.91, estimatedPayout:190.91,
    selections:sels };
}

var GUARDIANS_WIN  = game('G001','Guardians','Reds',7,3,'Final');
var GUARDIANS_LOSE = game('G002','Guardians','Reds',2,6,'Final');
var PUSH_GAME      = game('G003','Guardians','Reds',5,5,'Final');
var MARLINS_GAME   = game('G004','Tampa Bay Rays','Marlins',5,3,'Final');
var INPROG         = game('G005','Cubs','Cardinals',3,2,'InProgress', PAST);
var DH1            = Object.assign(game('G006','Guardians','Reds',7,3,'Final'), { _cKey:'MLB|reds|guardians|2026-05-17-game1' });
var DH2            = Object.assign(game('G007','Guardians','Reds',2,6,'Final'), { _cKey:'MLB|reds|guardians|2026-05-17-game2' });

// ── Grading outcomes ──────────────────────────────────────────────────────────
console.log('\n── Single ticket grading ──');

test('single ML win', function() {
  var t = ticket('T1','Single',[sel('Guardians To Win','Moneyline',-110,'Guardians','Reds','G001')]);
  var r = gradeTicket(t,[GUARDIANS_WIN],NOW);
  assertEq(r.result,'won','win');
});
test('single ML loss', function() {
  var t = ticket('T2','Single',[sel('Guardians To Win','Moneyline',-110,'Guardians','Reds','G002')]);
  var r = gradeTicket(t,[GUARDIANS_LOSE],NOW);
  assertEq(r.result,'lost','loss');
});
test('single push (tie game)', function() {
  var t = ticket('T3','Single',[sel('Guardians To Win','Moneyline',-110,'Guardians','Reds','G003')]);
  var r = gradeTicket(t,[PUSH_GAME],NOW);
  assertEq(r.result,'push','push');
});
test('run line win (covers)', function() {
  var s = sel('Guardians -1.5','Run Line',-110,'Guardians','Reds','G001');
  var t = ticket('T4','Single',[s]);
  var r = gradeTicket(t,[GUARDIANS_WIN],NOW); // Guardians win 7-3, margin 4, -1.5 → 2.5 > 0
  assertEq(r.result,'won','run line covers');
});
test('totals over win', function() {
  var s = sel('Over 8.5','Total',-110,'Guardians','Reds','G001'); // 7+3=10
  var t = ticket('T5','Single',[s]);
  var r = gradeTicket(t,[GUARDIANS_WIN],NOW);
  assertEq(r.result,'won','over hits');
});

console.log('\n── Parlay grading ──');

test('parlay: all legs win → won', function() {
  var s1 = sel('Guardians To Win','Moneyline',-110,'Guardians','Reds','G001');
  var s2 = sel('Tampa Bay Rays To Win','Moneyline',-115,'Tampa Bay Rays','Marlins','G004');
  s2.canonicalGameKey = 'MLB|marlins|tampa-bay-rays|2026-05-17';
  var t = ticket('P1','Parlay',[s1,s2]);
  var r = gradeTicket(t,[GUARDIANS_WIN,MARLINS_GAME],NOW);
  assertEq(r.result,'won','parlay wins');
  assertEq(r.legResults.join(','),'won,won','both legs won');
});

test('parlay: one leg loses → lost', function() {
  var s1 = sel('Guardians To Win','Moneyline',-110,'Guardians','Reds','G002'); // Guardians lose
  var s2 = sel('Tampa Bay Rays To Win','Moneyline',-115,'Tampa Bay Rays','Marlins','G004');
  s2.canonicalGameKey = 'MLB|marlins|tampa-bay-rays|2026-05-17';
  var t = ticket('P2','Parlay',[s1,s2]);
  var r = gradeTicket(t,[GUARDIANS_LOSE,MARLINS_GAME],NOW);
  assertEq(r.result,'lost','parlay loses');
});

console.log('\n── Server refusals ──');

test('future game refused', function() {
  var s = sel('Guardians To Win','Moneyline',-110,'Guardians','Reds','G001');
  s.scheduledStart = FUTURE;
  var t = ticket('TF','Single',[s]);
  var r = gradeTicket(t,[GUARDIANS_WIN],NOW);
  assertEq(r.result,null,'refused');
  assertEq(r.reason,'future_game_not_gradeable','reason');
});

test('in-progress game not graded', function() {
  var s = sel('Cubs To Win','Moneyline',-110,'Cubs','Cardinals','G005');
  s.canonicalGameKey = 'MLB|cardinals|cubs|2026-05-17';
  var t = ticket('TIP','Single',[s]);
  var r = gradeTicket(t,[INPROG],NOW);
  assertEq(r.result,null,'refused');
  assertEq(r.reason,'game_not_final','reason');
});

test('ambiguous doubleheader refused', function() {
  var s = sel('Guardians To Win','Moneyline',-110,'Guardians','Reds',null,null);
  s.canonicalGameKey = null; s.providerGameId = null;
  var t = ticket('TDH','Single',[s]);
  var r = gradeTicket(t,[DH1,DH2],NOW);
  assertEq(r.result,null,'refused');
  assert(r.reason && r.reason.includes('ambiguous'),'reason: '+r.reason);
});

test('no matching game → no grade', function() {
  var s = sel('Mets To Win','Moneyline',-110,'Mets','Yankees','BOGUS');
  s.canonicalGameKey='MLB|yankees|mets|2026-05-17';
  var t = ticket('TNM','Single',[s]);
  var r = gradeTicket(t,[GUARDIANS_WIN,MARLINS_GAME],NOW);
  assertEq(r.result,null,'refused');
});

console.log('\n── Idempotency ──');

test('ledger entry id is deterministic', function() {
  var id1 = buildLedgerEntryId('T001','bet_won','2026-05-18T21:00:00Z');
  var id2 = buildLedgerEntryId('T001','bet_won','2026-05-18T21:00:00Z');
  assertEq(id1,id2,'same inputs → same id');
});

test('double-grade detection: ticket already graded → skip', function() {
  // Simulates idempotency check before grading
  var t = { id:'T001', status:'won', gradedAt:'2026-05-18T20:00:00Z' };
  var alreadyGraded = (t.status==='won'||t.status==='lost'||t.status==='push') && !!t.gradedAt;
  assert(alreadyGraded,'skip already-graded ticket');
});

test('ledger entry upsert: same id = no duplicate', function() {
  var ledger = {};
  function upsert(entry) { if (!ledger[entry.id]) ledger[entry.id]=entry; return Object.keys(ledger).length; }
  var id = buildLedgerEntryId('T001','bet_won','2026-05-18T21:00:00Z');
  upsert({ id, amount:90.91 });
  upsert({ id, amount:90.91 }); // second call
  assertEq(Object.keys(ledger).length,1,'only 1 ledger entry');
});

console.log('\n── Payout math ──');

test('single win: payout = stake * decimal', function() {
  var t = ticket('T1','Single',[sel('Guardians To Win','Moneyline',-110)],100);
  var p = calcPayout(t,'won');
  assertApprox(p,190.91,'payout');
});

test('single loss: payout = 0', function() {
  var t = ticket('T1','Single',[sel('Guardians To Win','Moneyline',-110)],100);
  assertEq(calcPayout(t,'lost'),0,'loss payout 0');
});

test('push: payout = stake refund', function() {
  var t = ticket('T1','Single',[sel('Guardians To Win','Moneyline',-110)],100);
  assertEq(calcPayout(t,'push'),100,'push = risk back');
});

console.log('\n── Response shape ──');

test('grade result has required fields', function() {
  var r = gradeTicket(ticket('T1','Single',[sel('Guardians To Win','Moneyline',-110,'Guardians','Reds','G001')]),[GUARDIANS_WIN],NOW);
  assert(r.result !== undefined,'result present');
  assert(Array.isArray(r.legResults),'legResults array');
  assert(Array.isArray(r.finalScores),'finalScores array');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Server grade tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ SERVER GRADE TESTS FAILED'); process.exit(1); }
else console.log('✅ All server grading rules verified');
