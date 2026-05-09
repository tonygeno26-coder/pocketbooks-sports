// Run: node test/manual-grade.test.js
// Requires a local static server serving the repo root on http://127.0.0.1:8770
//   python3 -m http.server 8770 --bind 127.0.0.1
// And: npm i jsdom (or use the global /tmp/node_modules/jsdom mirror from CI).
//
// Locks the manual grading guardrails:
//   1. Manual Grade button only appears for active|open tickets
//   2. Already graded tickets cannot be manually graded again unless Regrade
//   3. Regrade preserves prior grade in t.regradeHistory
//   4. Manual final score persists on the ticket as t.manualFinalScore
//   5. Ledger row carries gradingSource: manual (note prefix 'manual ·')
//   6. Audit panel shows score, leg result, ticket result, payout, balance
//   7. Test cases: moneyline, run-line/spread, total, parlay-with-push,
//      cancelled/postponed.
const path = require('node:path');
const jsdom = (function(){
  try { return require('jsdom'); } catch (_e) { return require('/tmp/node_modules/jsdom'); }
})();
const { JSDOM, VirtualConsole } = jsdom;

const URL = process.env.PB_URL || 'http://127.0.0.1:8770/player.html?testmode=1';

let pass = 0, fail = 0;
function ok(name, cond, info) {
  if (cond) { pass++; console.log('  \u2713', name); }
  else { fail++; console.log('  \u2717', name, info != null ? ' :: ' + info : ''); }
}

(async () => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => console.warn('jsdom:', (e.message||'').slice(0,160)));
  const dom = await JSDOM.fromURL(URL, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  await new Promise(r => setTimeout(r, 1500));
  const w = dom.window;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function seed(tickets) {
    w.localStorage.setItem('pb-balance-start', '1000');
    w.localStorage.setItem('pb-tickets', JSON.stringify(tickets));
    w.localStorage.setItem('pb-ledger', JSON.stringify(
      tickets.map((t, i) => ({
        id: 'Lp' + (i+1), type: 'BET_PLACED', playerId: t.playerId || 'p1',
        ticketId: t.id, amount: -t.riskAmount,
        timestamp: t.placedAt,
        balanceBefore: 1000 - tickets.slice(0,i).reduce((s,x)=>s+x.riskAmount,0),
        balanceAfter:  1000 - tickets.slice(0,i+1).reduce((s,x)=>s+x.riskAmount,0),
        note: t.type
      }))
    ));
    w.eval(`if (typeof betTickets !== 'undefined') betTickets = JSON.parse(localStorage.getItem('pb-tickets')); if (typeof syncBalanceDisplays === 'function') syncBalanceDisplays();`);
  }
  function ticket(id, opts) {
    return Object.assign({
      id, playerId: 'p1', playerName: 'Test', source: 'player',
      placedAt: new Date(Date.now() - 60000).toISOString(),
      status: 'active', type: 'Single',
      odds: '-110', riskAmount: 100, estimatedPayout: 190.91, potentialProfit: 90.91,
    }, opts);
  }
  function getT(id) {
    const arr = JSON.parse(w.localStorage.getItem('pb-tickets'));
    return arr.find(x => x.id === id);
  }
  function ledgerFor(id) {
    return JSON.parse(w.localStorage.getItem('pb-ledger')).filter(e => e.ticketId === id);
  }

  // ── Guardrails ───────────────────────────────────────────────────────────
  console.log('\n[guardrails]');
  // (1) Manual Grade button only on pending; Regrade only on settled.
  seed([
    ticket('G-PEND', { status: 'active',
      selections: [{ pick:'Yankees ML', awayTeam:'Red Sox', homeTeam:'Yankees', side:'home', market:'moneyline', odds:-150 }] }),
    ticket('G-WON', { status: 'won', gradedAt:'2026-05-08T22:00:00Z', gradingSource:'manual',
      selections: [{ pick:'Mets ML', awayTeam:'Phillies', homeTeam:'Mets', side:'home', market:'moneyline', odds:-120, result:'win' }] }),
  ]);
  const consoleHtml = w.eval(`
    (function(){ openGradingConsole(); var b = document.getElementById('grading-console-body'); var html = b ? b.innerHTML : ''; var modal = document.getElementById('grading-console-modal'); if (modal) modal.remove(); return html; })();
  `);
  const pendRow = consoleHtml.split('<tr').find(s => s.includes('G-PEND'));
  const wonRow  = consoleHtml.split('<tr').find(s => s.includes('G-WON'));
  ok('pending row has Manual Grade button',  pendRow && pendRow.includes('Manual Grade'));
  ok('pending row has NO Regrade button',    pendRow && !pendRow.includes('>Regrade<'));
  ok('settled row has Regrade button',       wonRow  && wonRow.includes('>Regrade<'));
  ok('settled row has NO Manual Grade',      wonRow  && !wonRow.includes('Manual Grade'));

  // (2) Already graded ticket: openManualGrade is a no-op; gradeTicketByScores rejects.
  const before = getT('G-WON').status;
  w.openManualGrade('G-WON');
  const modalAfterAttempt = w.document.getElementById('manual-grade-modal');
  ok('openManualGrade refuses settled ticket (no modal)',  !modalAfterAttempt);
  const direct = w.gradeTicketByScores('G-WON', [{ away:0, home:0, status:'final' }]);
  ok('gradeTicketByScores refuses settled ticket', direct === 'ticket already settled', 'got: '+direct);
  ok('settled ticket status unchanged',   getT('G-WON').status === before);

  // (3) Regrade preserves prior grade as audit entry.
  // First run: simulate one grade, then regrade and check history kept.
  seed([ ticket('R-1', { status: 'active',
    selections: [{ pick:'Yankees ML', awayTeam:'Red Sox', homeTeam:'Yankees', side:'home', market:'moneyline', odds:-150 }] }) ]);
  w.gradeTicketByScores('R-1', [{ away:4, home:6, status:'final' }]);
  const afterFirst = getT('R-1');
  ok('first manual grade -> WON', afterFirst.status === 'won');
  ok('first manual grade has manualFinalScore', Array.isArray(afterFirst.manualFinalScore) && afterFirst.manualFinalScore.length === 1);
  // Regrade: reset and re-simulate
  let seq = [0.55]; // -> 'lose'
  let i = 0;
  const realRandom = w.Math.random;
  w.Math.random = function(){ return seq[i++ % seq.length]; };
  w.regradeTicket('R-1');
  w.Math.random = realRandom;
  const afterRegrade = getT('R-1');
  ok('regrade kept regradeHistory entry',           Array.isArray(afterRegrade.regradeHistory) && afterRegrade.regradeHistory.length === 1);
  ok('regradeHistory preserves prior status (won)', afterRegrade.regradeHistory[0].status === 'won');
  ok('regradeHistory preserves prior source',       afterRegrade.regradeHistory[0].gradingSource === 'manual');
  ok('regradeHistory preserves prior score',
     afterRegrade.regradeHistory[0].manualFinalScore &&
     afterRegrade.regradeHistory[0].manualFinalScore[0].away === 4 &&
     afterRegrade.regradeHistory[0].manualFinalScore[0].home === 6);

  // (5) Ledger row carries gradingSource: manual (we encode it via note prefix).
  const L1 = ledgerFor('R-1').filter(e => /BET_(WON|LOST|PUSH)/.test(e.type));
  ok('ledger has graded row for R-1',          L1.length >= 1);
  ok('first ledger note starts with "manual"', L1[L1.length-1].note && L1[L1.length-1].note.startsWith('manual'));

  // (6) Audit panel shows score / leg result / ticket result / payout / balance.
  //   regradeTicket() always re-runs the simulator so the ticket is now
  //   simulator-graded. Regrade again with the simulator stubbed to keep it
  //   active, then manually grade. After this we expect 2 entries in
  //   regradeHistory (the original manual + the simulator regrade).
  // Stub simulator so the second regrade leaves the ticket active for
  //   manual grading. Restore afterward.
  const _origSim = w.simulateGradeResults;
  w.simulateGradeResults = function(){};
  w.regradeTicket('R-1');
  w.simulateGradeResults = _origSim;
  // Now manually grade R-1 to a known WIN.
  const _r1Now = getT('R-1');
  ok('R-1 reset to active before manual grade', _r1Now.status === 'active', 'status='+_r1Now.status);
  w.gradeTicketByScores('R-1', [{ away:1, home:5, status:'final' }]);
  const r1Final = getT('R-1');
  ok('R-1 second grade -> WON',          r1Final.status === 'won', 'status='+r1Final.status);
  ok('R-1 second grade has manualFinalScore', Array.isArray(r1Final.manualFinalScore) && r1Final.manualFinalScore.length === 1);
  // Build the audit panel HTML directly (avoid JSDOM eval scoping quirks).
  const auditHTML = w.eval(`
    (function(){
      // Make sure no stale element exists first
      var prev = document.getElementById('audit-R-1'); if (prev) prev.remove();
      var div = document.createElement('div'); div.id='audit-R-1'; document.body.appendChild(div);
      toggleAuditPanel('R-1');
      return div.innerHTML || '';
    })();
  `);
  const auditText = auditHTML.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  if (process.env.PB_DEBUG) console.log('  [audit text]', auditText.slice(0,400));
  ok('audit shows final score',      /final score \(manual\) Red Sox 1 . Yankees 5/.test(auditText), auditText.slice(0,160));
  ok('audit shows leg result WIN',   /leg results .* WIN/.test(auditText));
  ok('audit shows ticket result',    /\bresult\b\s+(WIN|WON|LOSS|LOST|PUSH|CANCEL)/i.test(auditText));
  ok('audit shows payout',           /payout amount \$/.test(auditText));
  ok('audit shows balance before',   /balance before \$/.test(auditText));
  ok('audit shows balance after',    /balance after \$/.test(auditText));
  ok('audit shows grading source manual', /grading source manual/.test(auditText));
  ok('audit shows regrade history',  /regrade history #/.test(auditText));

  // ── Test cases ───────────────────────────────────────────────────────────
  console.log('\n[market grading cases]');

  // 7a. Moneyline
  seed([ ticket('TC-ML', {
    selections:[{ pick:'Yankees ML', awayTeam:'Red Sox', homeTeam:'Yankees', side:'home', market:'moneyline', odds:-150 }],
    riskAmount:150, estimatedPayout:250, potentialProfit:100, odds:'-150' }) ]);
  w.gradeTicketByScores('TC-ML', [{ away:4, home:6, status:'final' }]);
  ok('ML home wins (4-6) -> WON', getT('TC-ML').status === 'won');

  // 7b. Run line / spread
  seed([ ticket('TC-RL', {
    selections:[{ pick:'Dodgers -1.5', awayTeam:'Dodgers', homeTeam:'Giants', side:'away', market:'spread', odds:+125 }],
    riskAmount:80, estimatedPayout:180, potentialProfit:100, odds:'+125' }) ]);
  w.gradeTicketByScores('TC-RL', [{ away:5, home:3, status:'final' }]);
  ok('Spread away -1.5 covers (5-3) -> WON', getT('TC-RL').status === 'won');

  // 7c. Total over/under (lose case)
  seed([ ticket('TC-OU', {
    selections:[{ pick:'Over 8.5', awayTeam:'Mets', homeTeam:'Phillies', side:'over', market:'total', odds:-110 }],
    riskAmount:50, estimatedPayout:95.45, potentialProfit:45.45, odds:'-110' }) ]);
  w.gradeTicketByScores('TC-OU', [{ away:4, home:3, status:'final' }]);
  ok('Total Over 8.5 with 4-3 (=7) -> LOST', getT('TC-OU').status === 'lost');

  // 7d. Parlay with one push leg + one win leg -> WON
  seed([ ticket('TC-PAR', { type:'2-Team Parlay', odds:'+200',
    selections:[
      { pick:'Over 7',     awayTeam:'Mets',    homeTeam:'Phillies', side:'over', market:'total',     odds:-110 },
      { pick:'Yankees ML', awayTeam:'Red Sox', homeTeam:'Yankees',  side:'home', market:'moneyline', odds:-150 }
    ],
    riskAmount:50, estimatedPayout:150, potentialProfit:100 }) ]);
  w.gradeTicketByScores('TC-PAR', [
    { away:3, home:4, status:'final' },   // sum=7, exactly the line -> push
    { away:4, home:6, status:'final' }    // home wins -> win
  ]);
  const par = getT('TC-PAR');
  ok('Parlay push + win -> WON',                 par.status === 'won');
  ok('Parlay leg1 marked push',                  par.selections[0].result === 'push');
  ok('Parlay leg2 marked win',                   par.selections[1].result === 'win');

  // 7e. Cancelled / postponed -> push
  seed([ ticket('TC-CXL', {
    selections:[{ pick:'Rays ML', awayTeam:'Rays', homeTeam:'Astros', side:'away', market:'moneyline', odds:+120 }],
    riskAmount:25, estimatedPayout:55, potentialProfit:30, odds:'+120' }) ]);
  w.gradeTicketByScores('TC-CXL', [{ away:0, home:0, status:'cancelled' }]);
  ok('Cancelled -> PUSH', getT('TC-CXL').status === 'push');

  console.log('\n[result] pass=' + pass + ' fail=' + fail);
  dom.window.close();
  if (fail > 0) process.exit(1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
