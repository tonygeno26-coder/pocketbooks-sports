/**
 * P1 — Lost-response / placement-status-unknown UX contracts.
 * Run: node tests/lost-response-place.test.js
 *
 * CLIENT SENDS PLACE → SERVER MAY SUCCEED → response lost/timeout:
 * must NOT claim "Bet not placed" / "Nothing was charged".
 * Must show "Checking bet status…", reconcile, and recover via SAME sticky key.
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
const betaUxSrc = fs.readFileSync(path.join(__dirname, '..', 'pb-beta-ux.js'), 'utf8');

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
const catchSlice = confirmBetFn.slice(confirmBetFn.indexOf('} catch(_e)'));

console.log('\n-- Lost-response / unknown-status UX --');

test('sticky place key reused across timeout/uncertain retries', function() {
  assert(playerSrc.includes('var _pendingPlaceIdemKey = null;'), 'missing sticky key store');
  assert(confirmBetFn.includes('_pendingPlaceIdemKey || _generateIdemKey'),
    'place must reuse sticky key before minting');
  assert(confirmBetFn.includes('_pendingPlaceIdemKey = _iKey'), 'sticky key must be set on place');
});

test('unknown path shows Checking bet status (not definitive failure)', function() {
  assert(catchSlice.includes('Checking bet status'), 'missing Checking bet status toast');
  assert(catchSlice.includes('placement_status_unknown'), 'missing unknown-status reason');
  assert(catchSlice.includes('Placement status unknown'), 'missing still-unknown toast');
  // Unknown toast branch must not claim no charge / not placed.
  var unkIdx = catchSlice.indexOf('Placement status unknown');
  assert(unkIdx !== -1, 'still-unknown toast missing');
  var unkToast = catchSlice.slice(unkIdx, unkIdx + 220);
  assert(!/Nothing was charged/.test(unkToast), 'unknown toast must not say Nothing was charged');
  assert(!/Bet not placed/.test(unkToast), 'unknown toast must not say Bet not placed');
  assert(!/balance and tickets were not changed/.test(catchSlice.split('Placement status unknown')[0]),
    'pre-definitive unknown path must not assert no charge');
});

test('unknown path reconciles dashboard then recovers via same-key POST', function() {
  assert(/loadPlayerDashboardFromDb/.test(catchSlice), 'must reconcile dashboard');
  assert(catchSlice.includes('CONFIRM_BET_RECOVERY_POST'), 'must attempt sticky-key recovery POST');
  assert(catchSlice.includes('_applyDbPlaceSuccess'), 'recovery success must apply authoritative place');
  assert(catchSlice.includes('sticky_key_kept') || catchSlice.includes('_pendingPlaceIdemKey'),
    'must keep sticky key when still unknown');
  assert(!/_generateIdemKey\s*\(/.test(catchSlice), 'recovery must not mint a new key');
});

test('definitive rejection still clears sticky key (outside unknown catch)', function() {
  var rejIdx = confirmBetFn.indexOf('BACKEND_REJECTION');
  assert(rejIdx !== -1, 'backend rejection branch missing');
  var rejSlice = confirmBetFn.slice(rejIdx, confirmBetFn.indexOf('} catch(_e)'));
  assert(rejSlice.includes('_pendingPlaceIdemKey = null'),
    'definitive rejection must clear sticky key');
});

test('conflict maps to clean duplicate copy without fingerprint', function() {
  assert(betaUxSrc.includes("You already have this wager active."), 'clean conflict copy');
  assert(betaUxSrc.includes("conflict_active_bet"), 'conflict code mapped');
});

test('place abort timeout is 30s (not 10s alone as sole fix)', function() {
  assert(confirmBetFn.includes('fetch_timeout_30s') || confirmBetFn.includes('30000'),
    'place timeout should be 30s');
  assert(confirmBetFn.includes('Checking bet status'),
    '30s alone is insufficient — unknown-status UX required');
});

console.log('\n-- Results: ' + pass + ' passed, ' + fail + ' failed --');
process.exit(fail ? 1 : 0);
