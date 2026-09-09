/**
 * Agent D / Task 11 — My Bets live refresh (server hydrate only; no client-grade)
 * Run: node tests/my-bets-live-refresh.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m || '') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}

const playerSrc = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');

function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  var m = re.exec(src);
  if (!m) throw new Error('function ' + name + ' not found');
  var start = m.index;
  var i = src.indexOf('{', start);
  var depth = 0;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

const findFn = extractFn(playerSrc, '_pbFindNewlyGradedTickets');
// eslint-disable-next-line no-new-func
const _pbFindNewlyGradedTickets = new Function(findFn + '; return _pbFindNewlyGradedTickets;')();

function ticket(id, status, extras) {
  return Object.assign({
    id: id,
    status: status,
    potential_profit: 90.91,
    estimated_payout: 190.91,
    risk_amount: 100,
    selections: [{ pick: 'Team A ML' }]
  }, extras || {});
}

console.log('\n-- My Bets live refresh --');

test('ACTIVE → WON detected from server settled list', function() {
  var prev = { T1: true };
  var active = {};
  var settled = [ticket('T1', 'won')];
  var newly = _pbFindNewlyGradedTickets(prev, active, settled);
  assertEq(newly.length, 1);
  assertEq(newly[0].status, 'won');
  assertEq(newly[0].potential_profit, 90.91);
});

test('ACTIVE → LOST / PUSH / VOID transitions', function() {
  var prev = { A: true, B: true, C: true, D: true };
  var active = {};
  var settled = [
    ticket('A', 'lost'),
    ticket('B', 'push'),
    ticket('C', 'voided'),
    ticket('D', 'won', { potential_profit: 12.5, estimated_payout: 112.5 })
  ];
  var newly = _pbFindNewlyGradedTickets(prev, active, settled);
  assertEq(newly.length, 4);
  var byId = {};
  newly.forEach(function(t){ byId[t.id] = t; });
  assertEq(byId.A.status, 'lost');
  assertEq(byId.B.status, 'push');
  assertEq(byId.C.status, 'voided');
  assertEq(byId.D.status, 'won');
  assertEq(byId.D.estimated_payout, 112.5);
});

test('still-active tickets are not treated as graded', function() {
  var prev = { T1: true, T2: true };
  var active = { T1: true };
  var settled = [ticket('T2', 'won')];
  var newly = _pbFindNewlyGradedTickets(prev, active, settled);
  assertEq(newly.length, 1);
  assertEq(newly[0].id, 'T2');
});

test('null prev map yields no phantom grades', function() {
  assertEq(_pbFindNewlyGradedTickets(null, {}, [ticket('T1', 'won')]).length, 0);
});

test('player.html polls dashboard (no client grader) and refreshes My Bets', function() {
  var pollFn = extractFn(playerSrc, '_pollPlayerDashboardForGrades');
  assert(pollFn.indexOf('loadPlayerDashboardFromDb') !== -1, 'must hydrate from dashboard');
  assert(pollFn.indexOf('renderMyBets') !== -1, 'must re-render My Bets');
  assert(pollFn.indexOf('_pbFindNewlyGradedTickets') !== -1, 'must diff via pure helper');
  assert(pollFn.indexOf('_gradeTicket') === -1, 'must not client-grade in poll');
  assert(playerSrc.indexOf('_PB_GRADE_POLL_MYBETS_MS') !== -1, 'faster poll when My Bets visible');
  assert(playerSrc.indexOf('_pbRescheduleGradePoll') !== -1);
  var notifyFn = extractFn(playerSrc, '_pbNotifyGradedTicket');
  assert(/voided|VOID/i.test(notifyFn), 'VOID toast path');
  assert(/WON|won/i.test(notifyFn) && /lost/i.test(notifyFn) && /push/i.test(notifyFn));
  // setBNav should trigger reconcile when opening My Bets
  assert(playerSrc.indexOf("_pollPlayerDashboardForGrades === 'function') _pollPlayerDashboardForGrades()") !== -1
    || playerSrc.indexOf('_pollPlayerDashboardForGrades()') !== -1);
});

test('home polish tokens preserved (selected odds + LIVE + empty/loading)', function() {
  assert(playerSrc.indexOf('.odds-box.sel,.odds-cell.selected') !== -1);
  assert(playerSrc.indexOf('.mc-live-badge') !== -1);
  assert(playerSrc.indexOf('.pb-empty') !== -1);
  assert(playerSrc.indexOf('.pb-loading') !== -1);
  assert(playerSrc.indexOf('dkslip-fail-banner') !== -1);
});

console.log('\nMy Bets live refresh: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
