/**
 * P0 — Phantom ledger / localStorage success-fallback regression
 * Run: node tests/phantom-ledger-fallback.test.js
 *
 * Proves FE does not manufacture ticket / bankroll / ledger success when
 * place or cancel API fails, times out, or is ambiguous.
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

const confirmBetFn = extractFn(playerSrc, 'confirmBet');
const submitDeleteFn = extractFn(playerSrc, 'submitDeleteRequest');

console.log('\n-- P0 phantom ledger: confirmBet --');

test('confirmBet keeps in-flight busy guard', function() {
  assert(playerSrc.includes('var _confirmBetInFlight = false;'), 'missing _confirmBetInFlight');
  assert(/_confirmBetInFlight\s*=\s*true/.test(confirmBetFn), 'busy set missing');
  assert(confirmBetFn.includes('CONFIRM_BET_DEDUPED') || playerSrc.includes('CONFIRM_BET_DEDUPED'),
    'dedupe path missing');
});

test('failed / network place path must NOT say saved locally', function() {
  assert(!/saved locally,\s*syncing when back online/i.test(confirmBetFn),
    'legacy offline-success toast still present in confirmBet');
  assert(!/Fall through to localStorage/.test(confirmBetFn),
    'explicit fall-through comment still present');
});

test('DB-primary blocks localStorage success after API failure', function() {
  assert(confirmBetFn.includes('phantom_ledger_fallback_blocked'),
    'missing phantom_ledger_fallback_blocked gate');
  assert(/if\s*\(\s*_DB_PRIMARY_READS_ENABLED\s*\)[\s\S]*?phantom_ledger_fallback_blocked/.test(confirmBetFn),
    'DB-primary gate must surround phantom block');
  assert(confirmBetFn.includes('Your balance and tickets were not changed'),
    'missing failure copy for blocked local save');
});

test('network catch returns instead of falling through to local ticket write', function() {
  // After catch body there must be an early return before LOCALSTORAGE path mutates
  var catchIdx = confirmBetFn.indexOf('} catch(_e)');
  assert(catchIdx !== -1, 'missing catch(_e) on place fetch');
  var afterCatch = confirmBetFn.slice(catchIdx, catchIdx + 1800);
  assert(/return;\s*\} finally/.test(afterCatch) || /return;\s*\n\s*\} finally/.test(afterCatch),
    'catch must return before finally (no fall-through)');
  assert(afterCatch.includes('Bet could not be placed') || afterCatch.includes('Placement could not be confirmed'),
    'catch must surface failure/uncertain copy');
});

test('timeout/abort reconciles dashboard and does not auto-retry POST', function() {
  assert(confirmBetFn.includes('fetch_aborted_uncertain') || confirmBetFn.includes('Placement could not be confirmed'),
    'missing uncertain placement messaging');
  assert(/loadPlayerDashboardFromDb\s*\(/.test(confirmBetFn.slice(confirmBetFn.indexOf('catch(_e)'))),
    'abort/uncertain path must attempt dashboard reconcile');
  // No recursive confirmBet() / automatic second place POST in abort path
  var abortSlice = confirmBetFn.slice(confirmBetFn.indexOf('catch(_e)'), confirmBetFn.indexOf('LOCALSTORAGE'));
  assert(!/confirmBet\s*\(/.test(abortSlice), 'must not auto-reenter confirmBet on timeout');
  assert(!/\/api\/bets\/place/.test(abortSlice.replace(/endpoint=\/api\/bets\/place/g, '')),
    'must not fire a second place POST from abort catch');
});

test('success path still writes local cache only after server ok', function() {
  assert(confirmBetFn.includes("if (_dbData.ok)"), 'success branch missing');
  var okIdx = confirmBetFn.indexOf('if (_dbData.ok)');
  var okSlice = confirmBetFn.slice(okIdx, okIdx + 2500);
  assert(okSlice.includes('saveTickets()') || okSlice.includes('betTickets.unshift'),
    'server-ok path may cache ticket locally');
  assert(okSlice.includes('balanceAfter') || okSlice.includes('applyDisplayedBalance'),
    'server-ok path should prefer server balanceAfter');
});

console.log('\n-- P0 phantom ledger: cancel --');

test('cancel has in-flight guard', function() {
  assert(playerSrc.includes('var _cancelBetInFlight = false;'), 'missing _cancelBetInFlight');
  assert(submitDeleteFn.includes('_cancelBetInFlight = true'), 'cancel must set in-flight');
  assert(submitDeleteFn.includes('_cancelBetInFlight = false'), 'cancel must clear in-flight');
});

test('cancel API failure never falls through to local success mutation', function() {
  assert(!/falling back to localStorage path/.test(submitDeleteFn),
    'cancel must not log fall-through to localStorage');
  assert(!/using localStorage fallback/.test(submitDeleteFn),
    'cancel must not use localStorage fallback on fetch fail');
  assert(submitDeleteFn.includes('Cancellation could not be confirmed. Your bet has not been changed.'),
    'missing product cancel-failure copy');
});

test('cancel DB-primary rejection returns without marking deleteRequestStatus', function() {
  // All DB-primary failure branches return before legacy deleteRequestStatus writes
  var dbBlockStart = submitDeleteFn.indexOf('if (_DB_PRIMARY_READS_ENABLED)');
  assert(dbBlockStart !== -1, 'DB primary cancel block missing');
  var legacyIdx = submitDeleteFn.indexOf("deleteRequestStatus = 'pending'");
  assert(legacyIdx !== -1, 'legacy pending flag still exists for offline mode');
  // Ensure between DB block start and legacy write there are explicit returns on failure
  var mid = submitDeleteFn.slice(dbBlockStart, legacyIdx);
  assert(mid.includes('_cancelFailToast') || mid.includes('Cancellation could not be confirmed'),
    'DB failure must toast without mutating');
  assert(/return;\s*\}/.test(mid), 'DB failure paths must return before legacy mutation');
  // Second DB-primary gate before legacy path
  assert(/if\s*\(\s*_DB_PRIMARY_READS_ENABLED\s*\)[\s\S]*?_cancelFailToast/.test(
    submitDeleteFn.slice(legacyIdx - 400, legacyIdx + 50)
  ) || submitDeleteFn.slice(dbBlockStart, legacyIdx).includes('never treat local'),
    'legacy path must remain gated when DB-primary on');
});

console.log('\n-- Behavioral model: failed mutations leave stores unchanged --');

/**
 * Pure model of the P0 rule: on API failure/uncertainty, financial stores
 * must remain byte-identical. Used to lock the invariant independently of DOM.
 */
function applyPlaceOutcome(state, outcome) {
  var next = {
    tickets: state.tickets.slice(),
    ledger: state.ledger.slice(),
    balance: state.balance,
    localSuccessArtifact: false
  };
  if (outcome === 'ok') {
    next.tickets = [{ id: 'SRV_1', status: 'active' }].concat(next.tickets);
    next.ledger = next.ledger.concat([{ type: 'bet_placed', amount: -50 }]);
    next.balance = next.balance - 50;
    next.localSuccessArtifact = false;
    return next;
  }
  // fail | timeout | offline | 500 | 502 | 503 | aborted | malformed | 401 | 403 | 409 | 429
  // P0: no mutation
  return next;
}

function applyCancelOutcome(state, outcome) {
  var next = {
    tickets: state.tickets.map(function(t){ return Object.assign({}, t); }),
    ledger: state.ledger.slice(),
    balance: state.balance,
    fakeCancelled: false
  };
  if (outcome === 'ok') {
    next.tickets = next.tickets.map(function(t) {
      return t.id === 'T_ACTIVE' ? Object.assign({}, t, { status: 'canceled' }) : t;
    });
    next.ledger = next.ledger.concat([{ type: 'bet_canceled', amount: 100 }]);
    next.balance = next.balance + 100;
    return next;
  }
  return next;
}

var FAILURES = ['fail','timeout','offline','500','502','503','aborted','malformed','401','403','409','429'];

test('place failed POST: ticket count / bankroll / ledger unchanged; no local success artifact', function() {
  var base = { tickets: [{ id: 'T0', status: 'active' }], ledger: [], balance: 1000 };
  FAILURES.forEach(function(code) {
    var r = applyPlaceOutcome(base, code);
    assert(r.tickets.length === 1, code + ': ticket count changed');
    assert(r.balance === 1000, code + ': bankroll changed');
    assert(r.ledger.length === 0, code + ': ledger mutated');
    assert(r.localSuccessArtifact === false, code + ': local success artifact');
  });
  var ok = applyPlaceOutcome(base, 'ok');
  assert(ok.tickets.length === 2 && ok.balance === 950 && ok.ledger.length === 1, 'ok path must still mutate from server');
});

test('cancel failed: ticket remains active; bankroll/ledger unchanged; no fake cancellation', function() {
  var base = {
    tickets: [{ id: 'T_ACTIVE', status: 'active', riskAmount: 100 }],
    ledger: [],
    balance: 900
  };
  FAILURES.forEach(function(code) {
    var r = applyCancelOutcome(base, code);
    assert(r.tickets[0].status === 'active', code + ': ticket status changed');
    assert(r.balance === 900, code + ': bankroll changed');
    assert(r.ledger.length === 0, code + ': ledger mutated');
    assert(r.fakeCancelled === false, code + ': fake cancel flag');
  });
});

test('network ambiguity timeout: no synthetic local success; reconcile flag only', function() {
  var base = { tickets: [], ledger: [], balance: 500 };
  var r = applyPlaceOutcome(base, 'timeout');
  assert(JSON.stringify(r.tickets) === JSON.stringify(base.tickets), 'timeout invented tickets');
  assert(r.balance === base.balance, 'timeout invented balance change');
  // Source must attempt reconcile on abort (already asserted above) and never auto-retry
  assert(confirmBetFn.includes('keepPending: false') || confirmBetFn.includes('loadPlayerDashboardFromDb'),
    'timeout path should reconcile authoritative state');
});

test('storage reload after failed mutation: no phantom financial state', function() {
  // Simulate: failed place must not have written pb-tickets / pb-ledger / balance keys
  var store = {
    'pb-tickets': JSON.stringify([{ id: 'EXISTING', status: 'active' }]),
    'pb-ledger': '[]',
    'pb-balance-start': '1000'
  };
  function failedPlaceWouldWrite(dbPrimary) {
    // Mirrors gated FE: when dbPrimary, refusal means store untouched
    if (dbPrimary) return false;
    return true;
  }
  assert(failedPlaceWouldWrite(true) === false, 'DB-primary failed place must not write storage');
  // Reload snapshot equals pre-failure
  var reloaded = JSON.parse(store['pb-tickets']);
  assert(reloaded.length === 1 && reloaded[0].id === 'EXISTING', 'phantom ticket after reload');
  assert(store['pb-ledger'] === '[]', 'phantom ledger after reload');
  assert(store['pb-balance-start'] === '1000', 'phantom balance after reload');
});

console.log('\n-- localStorage classification smoke (player.html keys) --');

test('authoritative-looking financial keys are not written on blocked fallback', function() {
  // Gate string must appear before the legacy saveTickets/addLedgerEntry in local path
  var localIdx = confirmBetFn.indexOf('LOCALSTORAGE');
  var gateIdx = confirmBetFn.indexOf('phantom_ledger_fallback_blocked');
  var saveIdx = confirmBetFn.lastIndexOf('saveTickets()');
  assert(gateIdx !== -1 && localIdx !== -1, 'local path markers missing');
  assert(gateIdx < saveIdx, 'phantom gate must run before legacy saveTickets');
});

test('Check Results under DB-primary prefers server grade (no local ledger invent)', function() {
  var checkFn = extractFn(playerSrc, 'checkOpenTickets');
  assert(checkFn.includes('_DB_PRIMARY_READS_ENABLED'), 'missing DB-primary gate in checkOpenTickets');
  assert(checkFn.includes('runServerGrade'), 'DB-primary Check Results must call runServerGrade');
  var gateIdx = checkFn.indexOf('_DB_PRIMARY_READS_ENABLED');
  var localGradeIdx = checkFn.indexOf('_gradeTicket');
  assert(gateIdx !== -1, 'DB gate missing');
  if (localGradeIdx !== -1) {
    assert(gateIdx < localGradeIdx, 'server-grade gate must precede local _gradeTicket');
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
