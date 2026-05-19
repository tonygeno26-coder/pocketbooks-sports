/**
 * PocketBooks Sports — Phase M: Result Snapshots + Trusted Grading Tests
 * Run: node tests/trusted-grading.test.js
 * Pure logic — no network, no DB.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Result snapshot model ─────────────────────────────────────────────────────

const RESULT_STATUS = { SCHEDULED:'scheduled', LIVE:'live', FINAL:'final',
                         POSTPONED:'postponed', CANCELED:'canceled' };

function makeResult(overrides) {
  return Object.assign({
    resultSnapshotId: 'RS_001',
    sport: 'mlb',
    eventId: 'G001',
    canonicalGameKey: 'MLB|reds|guardians|2026-05-17',
    homeTeam: 'Guardians',
    awayTeam: 'Reds',
    commenceTime: '2026-05-17T19:10:00Z',
    status: RESULT_STATUS.FINAL,
    homeScore: 5,
    awayScore: 2,
    winner: 'home',  // 'home' | 'away' | 'tie'
    finalAt: '2026-05-17T22:30:00Z',
    source: 'odds-api',
    fetchedAt: new Date().toISOString(),
    rawJson: null
  }, overrides||{});
}

// ── Grade derivation engine ───────────────────────────────────────────────────

// Resolve outcome for one leg based on result snapshot
function deriveLegOutcome(leg, result) {
  if (!result) return { outcome:'error', reason:'result_missing' };
  if (result.status !== RESULT_STATUS.FINAL)
    return { outcome:'pending', reason:'result_not_final', status:result.status };

  const market   = (leg.market||'moneyline').toLowerCase().replace('run line','spread').replace('puck line','spread');
  const pick     = (leg.pick||'').toLowerCase();
  const homeTeam = (result.homeTeam||'').toLowerCase();
  const awayTeam = (result.awayTeam||'').toLowerCase();
  const homeScore= parseInt(result.homeScore,10)||0;
  const awayScore= parseInt(result.awayScore,10)||0;

  // Moneyline / h2h
  if (market === 'moneyline' || market === 'h2h') {
    const pickedHome = pick.includes(homeTeam) || (result.winner==='home' && pick.includes('home'));
    const pickedAway = pick.includes(awayTeam) || (result.winner==='away' && pick.includes('away'));
    if (homeScore === awayScore)
      return { outcome:'push', reason:'tie' };
    if (result.winner==='home' && pickedHome) return { outcome:'won' };
    if (result.winner==='away' && pickedAway) return { outcome:'won' };
    return { outcome:'lost' };
  }

  // Spread
  if (market === 'spread' || market === 'run line') {
    const line   = parseFloat(leg.acceptedPointLine||leg.line||leg.odds||0);
    const pickedHome = pick.includes(homeTeam);
    const margin = homeScore - awayScore;
    const adjusted = pickedHome ? margin + line : awayScore - homeScore + line;
    if (Math.abs(adjusted) < 0.001) return { outcome:'push' };
    return adjusted > 0 ? { outcome:'won' } : { outcome:'lost' };
  }

  // Totals
  if (market === 'total' || market === 'totals') {
    const total = homeScore + awayScore;
    const line  = parseFloat(leg.acceptedPointLine||leg.line||0);
    const pickOver = pick.includes('over');
    if (Math.abs(total - line) < 0.001) return { outcome:'push' };
    return (pickOver ? total>line : total<line) ? { outcome:'won' } : { outcome:'lost' };
  }

  return { outcome:'error', reason:'unsupported_market:'+market };
}

// Derive combined outcome for a ticket (all-or-nothing for parlays)
function deriveTicketOutcome(ticket, results) {
  const legs   = ticket.legs||[];
  const type   = (ticket.type||'single').toLowerCase();
  if (!legs.length) return { outcome:'error', reason:'no_legs' };

  const legOutcomes = legs.map(function(leg) {
    const result = results[leg.canonicalGameKey];
    return Object.assign({ leg:leg.pick }, deriveLegOutcome(leg, result));
  });

  // Any pending or error → cannot grade
  const pending = legOutcomes.find(function(l){ return l.outcome==='pending'||l.outcome==='error'; });
  if (pending) return { outcome:pending.outcome, reason:pending.reason, leg:pending.leg };

  // Single / straight
  if (type === 'single' || type === 'straight') return legOutcomes[0];

  // Parlay: all must win
  const anyLost = legOutcomes.find(function(l){ return l.outcome==='lost'; });
  if (anyLost) return { outcome:'lost', legCount:legs.length };
  const anyPush = legOutcomes.find(function(l){ return l.outcome==='push'; });
  const allWon  = legOutcomes.every(function(l){ return l.outcome==='won'; });
  if (anyPush) return { outcome:'push' };
  if (allWon)  return { outcome:'won' };
  return { outcome:'lost' };
}

// Auto-grade engine: load result from store, never trust client
function autoGradeTicket(ticket, resultStore) {
  // Reject if ticket already settled
  if (['won','lost','push','canceled','voided'].includes(ticket.status))
    return { ok:false, code:'already_graded', status:ticket.status };

  const legs = ticket.legs||[];
  const results = {};
  for (var i=0; i<legs.length; i++) {
    const cKey = legs[i].canonicalGameKey;
    const result = resultStore[cKey]||null;
    results[cKey] = result;
    // If any result missing → cannot grade
    if (!result) return { ok:false, code:'result_missing', canonicalGameKey:cKey };
    if (result.status !== RESULT_STATUS.FINAL)
      return { ok:false, code:'result_not_final', status:result.status, canonicalGameKey:cKey };
  }

  const outcome = deriveTicketOutcome(ticket, results);
  if (outcome.outcome === 'error')
    return { ok:false, code:'result_conflict', reason:outcome.reason };
  if (outcome.outcome === 'pending')
    return { ok:false, code:'result_not_final', reason:outcome.reason };

  return { ok:true, ticketId:ticket.id, outcome:outcome.outcome };
}

// Manual override: requires elevated role + explicit audit fields
function manualGradeTicket(ticket, params, actorRole) {
  const REQUIRED_RANK = 4; // full_admin
  const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };
  if ((ROLE_RANK[actorRole]||0) < REQUIRED_RANK)
    return { ok:false, code:'insufficient_role', required:'full_admin' };
  if (['won','lost','push','canceled','voided'].includes(ticket.status))
    return { ok:false, code:'already_graded', status:ticket.status };
  const { result, reason, overrideCode, createdBy } = params||{};
  if (!result)       return { ok:false, code:'missing_result' };
  if (!reason)       return { ok:false, code:'missing_reason' };
  if (!overrideCode) return { ok:false, code:'missing_overrideCode' };
  if (!createdBy)    return { ok:false, code:'missing_createdBy' };
  if (!['won','lost','push'].includes(result))
    return { ok:false, code:'invalid_result:'+result };
  // Build audit event
  const auditEvent = {
    event_type: 'manual_grade_override',
    ticket_id:  ticket.id,
    player_id:  ticket.playerId||ticket.player_id,
    payload:    { result, reason, overrideCode, createdBy, actorRole }
  };
  return { ok:true, ticketId:ticket.id, outcome:result, auditEvent };
}

// ── Test data ─────────────────────────────────────────────────────────────────

var CKEY = 'MLB|reds|guardians|2026-05-17';
var FINAL_RESULT = makeResult(); // home wins 5-2
var LIVE_RESULT  = makeResult({ status:'live', winner:null });
var SCHED_RESULT = makeResult({ status:'scheduled', winner:null });

function ticket(id, legs, type, status) {
  return { id:id||'T1', legs:legs||[], type:type||'single', status:status||'active',
           playerId:'P001', player_id:'P001' };
}
function leg(pick, market, cKey, line) {
  return { pick:pick||'Guardians ML', market:market||'Moneyline',
           canonicalGameKey:cKey||CKEY, acceptedPointLine:line||null };
}

// ── deriveLegOutcome ──────────────────────────────────────────────────────────
console.log('\n── deriveLegOutcome: moneyline ──');

test('home team wins, picked home → won', function() {
  var r = deriveLegOutcome(leg('Guardians ML'), FINAL_RESULT);
  assertEq(r.outcome,'won');
});
test('home team wins, picked away → lost', function() {
  var r = deriveLegOutcome(leg('Reds ML'), FINAL_RESULT);
  assertEq(r.outcome,'lost');
});
test('tie game → push', function() {
  var tied = makeResult({ homeScore:3, awayScore:3, winner:'tie' });
  assertEq(deriveLegOutcome(leg('Guardians ML'), tied).outcome,'push');
});
test('result not final → pending', function() {
  var r = deriveLegOutcome(leg('Guardians ML'), LIVE_RESULT);
  assertEq(r.outcome,'pending'); assertEq(r.reason,'result_not_final');
});
test('result missing → error', function() {
  var r = deriveLegOutcome(leg('Guardians ML'), null);
  assertEq(r.outcome,'error'); assertEq(r.reason,'result_missing');
});

console.log('\n── deriveLegOutcome: totals ──');
test('total over 6.5: actual 7 → won', function() {
  var res = makeResult({ homeScore:5, awayScore:2 }); // total=7
  var r = deriveLegOutcome(leg('Over 6.5','Total',CKEY,6.5), res);
  assertEq(r.outcome,'won');
});
test('total under 6.5: actual 7 → lost', function() {
  var res = makeResult({ homeScore:5, awayScore:2 });
  var r = deriveLegOutcome(leg('Under 6.5','Total',CKEY,6.5), res);
  assertEq(r.outcome,'lost');
});
test('total push: actual equals line', function() {
  var res = makeResult({ homeScore:3, awayScore:4 }); // total=7
  var r = deriveLegOutcome(leg('Over 7','Total',CKEY,7), res);
  assertEq(r.outcome,'push');
});

console.log('\n── autoGradeTicket ──');
test('final result → auto-grades correctly', function() {
  var t = ticket('T1',[leg('Guardians ML')]);
  var store = {}; store[CKEY] = FINAL_RESULT;
  var r = autoGradeTicket(t, store);
  assert(r.ok,'ok: '+(r.code||'')); assertEq(r.outcome,'won');
});
test('live result → result_not_final', function() {
  var t = ticket('T1',[leg('Guardians ML')]);
  var store = {}; store[CKEY] = LIVE_RESULT;
  var r = autoGradeTicket(t, store);
  assert(!r.ok); assertEq(r.code,'result_not_final');
});
test('scheduled result → result_not_final', function() {
  var t = ticket('T1',[leg('Guardians ML')]);
  var store = {}; store[CKEY] = SCHED_RESULT;
  var r = autoGradeTicket(t, store);
  assert(!r.ok); assertEq(r.code,'result_not_final');
});
test('missing result → result_missing', function() {
  var t = ticket('T1',[leg('Guardians ML')]);
  var r = autoGradeTicket(t, {});
  assert(!r.ok); assertEq(r.code,'result_missing');
});
test('already graded ticket cannot regrade', function() {
  var t = ticket('T1',[leg('Guardians ML')],'single','won');
  var store = {}; store[CKEY] = FINAL_RESULT;
  var r = autoGradeTicket(t, store);
  assert(!r.ok); assertEq(r.code,'already_graded');
});
test('client-submitted result ignored: result comes from store only', function() {
  // Even if ticket has a result field, autoGradeTicket uses store
  var t = Object.assign(ticket('T1',[leg('Reds ML')]),'result','won'); // client says won
  var store = {}; store[CKEY] = FINAL_RESULT; // server says Guardians won
  var r = autoGradeTicket(t, store);
  assert(r.ok); assertEq(r.outcome,'lost','server result: Guardians win, player picked Reds');
});

console.log('\n── Parlay grading ──');
test('parlay: both legs won → won', function() {
  var CKEY2 = 'MLB|marlins|rays|2026-05-17';
  var res2 = makeResult({ canonicalGameKey:CKEY2, homeTeam:'Rays', awayTeam:'Marlins',
    homeScore:4, awayScore:1, winner:'home' });
  var t = ticket('T1',[leg('Guardians ML'), leg('Rays ML','Moneyline',CKEY2)], 'parlay');
  var store = {}; store[CKEY]=FINAL_RESULT; store[CKEY2]=res2;
  var r = autoGradeTicket(t, store);
  assert(r.ok); assertEq(r.outcome,'won');
});
test('parlay: one leg lost → lost', function() {
  var CKEY2 = 'MLB|marlins|rays|2026-05-17';
  var res2 = makeResult({ canonicalGameKey:CKEY2, homeTeam:'Rays', awayTeam:'Marlins',
    homeScore:1, awayScore:4, winner:'away' }); // Marlins win
  var t = ticket('T1',[leg('Guardians ML'), leg('Rays ML','Moneyline',CKEY2)], 'parlay');
  var store = {}; store[CKEY]=FINAL_RESULT; store[CKEY2]=res2;
  var r = autoGradeTicket(t, store);
  assert(r.ok); assertEq(r.outcome,'lost');
});
test('parlay: one leg still live → result_not_final blocks grade', function() {
  var CKEY2 = 'MLB|marlins|rays|2026-05-17';
  var t = ticket('T1',[leg('Guardians ML'), leg('Rays ML','Moneyline',CKEY2)], 'parlay');
  var store = {}; store[CKEY]=FINAL_RESULT; store[CKEY2]=LIVE_RESULT;
  var r = autoGradeTicket(t, store);
  assert(!r.ok); assertEq(r.code,'result_not_final');
});

console.log('\n── manualGradeTicket ──');
test('owner can manual grade', function() {
  var t = ticket('T1',[leg()]);
  var r = manualGradeTicket(t,{result:'won',reason:'API feed error',overrideCode:'OC_001',createdBy:'H1'},'owner');
  assert(r.ok); assertEq(r.outcome,'won');
  assert(r.auditEvent,'has audit event');
  assertEq(r.auditEvent.event_type,'manual_grade_override');
});
test('full_admin can manual grade', function() {
  var t = ticket('T1',[leg()]);
  assert(manualGradeTicket(t,{result:'lost',reason:'provider error',overrideCode:'OC_002',createdBy:'A1'},'full_admin').ok);
});
test('settlement_manager cannot manual grade', function() {
  var t = ticket('T1',[leg()]);
  var r = manualGradeTicket(t,{result:'won',reason:'test',overrideCode:'OC_003',createdBy:'S1'},'settlement_manager');
  assertEq(r.code,'insufficient_role');
});
test('player cannot manual grade', function() {
  assertEq(manualGradeTicket(ticket('T1',[leg()]),{result:'won',reason:'x',overrideCode:'y',createdBy:'p'},'player').code,'insufficient_role');
});
test('manual grade requires all audit fields', function() {
  var t = ticket('T1',[leg()]);
  assertEq(manualGradeTicket(t,{result:'won'},'owner').code,'missing_reason');
  assertEq(manualGradeTicket(t,{result:'won',reason:'x'},'owner').code,'missing_overrideCode');
  assertEq(manualGradeTicket(t,{result:'won',reason:'x',overrideCode:'y'},'owner').code,'missing_createdBy');
});
test('manual grade rejects invalid result', function() {
  var t = ticket('T1',[leg()]);
  var r = manualGradeTicket(t,{result:'canceled',reason:'x',overrideCode:'y',createdBy:'H1'},'owner');
  assert(r.code.includes('invalid_result'));
});
test('manual grade on already-graded ticket denied', function() {
  var t = ticket('T1',[leg()],'single','won');
  var r = manualGradeTicket(t,{result:'lost',reason:'fix',overrideCode:'OC_004',createdBy:'H1'},'owner');
  assertEq(r.code,'already_graded');
});
test('audit event contains required fields', function() {
  var t = ticket('T1',[leg()]);
  var r = manualGradeTicket(t,{result:'push',reason:'weather cancellation',overrideCode:'WX_001',createdBy:'H1'},'owner');
  assert(r.auditEvent.payload.overrideCode);
  assert(r.auditEvent.payload.reason);
  assertEq(r.auditEvent.payload.actorRole,'owner');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Trusted grading tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ TRUSTED GRADING TESTS FAILED'); process.exit(1); }
else console.log('✅ All trusted grading rules verified');
