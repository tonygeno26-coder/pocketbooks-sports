/**
 * Bet placement UX flow gate — Confirm Wager → Bet Confirmed.
 * Place Bet must NOT submit; only Confirm Bet posts.
 * Run: node tests/bet-placement-ux-flow.test.js
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

const html = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');

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

const bsPlace = extractFn(html, 'bsPlaceBet');
const openConfirm = extractFn(html, 'openBetConfirm');
const confirmBet = extractFn(html, 'confirmBet');
const receipt = extractFn(html, '_showBetConfirmedReceipt');

console.log('\n-- Bet placement UX flow --');

test('Place Bet opens confirm only — does not POST', function() {
  assert(bsPlace.indexOf('openBetConfirm()') !== -1, 'bsPlaceBet must open confirm');
  assert(bsPlace.indexOf('/api/bets/place') === -1, 'bsPlaceBet must not post place');
  assert(bsPlace.indexOf('confirmBet(') === -1, 'bsPlaceBet must not call confirmBet');
});

test('Confirm Wager sheet copy and CTAs', function() {
  assert(openConfirm.indexOf('Confirm Wager') !== -1);
  assert(openConfirm.indexOf('Back to Bet Slip') !== -1);
  assert(openConfirm.indexOf('Confirm Bet —') !== -1 || openConfirm.indexOf('Confirm Bet') !== -1);
  assert(openConfirm.indexOf('To Win') !== -1);
  assert(openConfirm.indexOf('Total Return') !== -1 || openConfirm.indexOf('Stake') !== -1);
  assert(openConfirm.indexOf('id="bs-confirm-btn"') !== -1, 'confirm CTA must be addressable for busy state');
});

test('Confirm Bet is the only submit path', function() {
  assert(confirmBet.indexOf('/api/bets/place') !== -1);
  assert(confirmBet.indexOf('Placing Bet') !== -1, 'busy label must be Placing Bet…');
  assert(confirmBet.indexOf('_confirmBetInFlight') !== -1, 'double-submit guard required');
  assert(confirmBet.indexOf('Checking bet status') !== -1);
});

test('Odds/line movement lives on confirmation sheet', function() {
  assert(html.indexOf('function _showOddsUpdatedInConfirm') !== -1);
  assert(html.indexOf('Odds Updated') !== -1);
  assert(html.indexOf('Line Changed') !== -1);
  assert(html.indexOf('linePending') !== -1);
  assert(confirmBet.indexOf('_showOddsUpdatedInConfirm(_dbData)') !== -1);
  assert(confirmBet.indexOf('_showLineChangedReview(_dbData)') !== -1);
  assert(confirmBet.indexOf("id = 'odds-changed-modal'") === -1,
    'must not open separate odds-changed modal loop');
});

test('confirmationQuote is module-scoped for accept round-trip', function() {
  var idx = html.indexOf('var _pendingConfirmationQuote = null');
  assert(idx !== -1);
  // Must appear before confirmBet (module scope), not only inside it
  var confirmIdx = html.indexOf('async function confirmBet');
  assert(idx < confirmIdx, 'quote store must be outside confirmBet');
  assert(html.indexOf('confirmationQuote: _pendingConfirmationQuote') !== -1);
});

test('Bet Confirmed receipt uses authoritative accepted odds', function() {
  assert(html.indexOf('function _showBetConfirmedReceipt') !== -1);
  assert(html.indexOf('function _acceptedOddsFromPlaceLeg') !== -1);
  assert(receipt.indexOf('Bet Confirmed') !== -1);
  assert(receipt.indexOf('View My Bets') !== -1);
  assert(receipt.indexOf('Done') !== -1);
  assert(html.indexOf('accepted_odds_american') !== -1,
    'receipt must read accepted_odds_american from place response');
  assert(confirmBet.indexOf('_showBetConfirmedReceipt') !== -1,
    'success path must show receipt, not toast-only');
});

test('Done / View My Bets clear slip only on exit — not on success', function() {
  assert(receipt.indexOf('clearSlip(true)') !== -1,
    'Bet Confirmed exit must force-clear entire slip');
  assert(receipt.indexOf("setBNav") !== -1 && receipt.indexOf("'home'") !== -1,
    'Done must navigate to Home/Dashboard');
  assert(receipt.indexOf("'mybets'") !== -1,
    'View My Bets must navigate to existing mybets route');
  var successIdx = confirmBet.indexOf('_showBetConfirmedReceipt(_okData');
  assert(successIdx !== -1, 'DB success must show receipt');
  var applyToReceipt = confirmBet.slice(Math.max(0, successIdx - 800), successIdx);
  assert(applyToReceipt.indexOf('clearSlip(') === -1,
    'must not clearSlip immediately before showing Bet Confirmed receipt');
});

test('financial safety: open/back clears quote and does not invent tickets', function() {
  var closeFn = extractFn(html, 'closeBetConfirm');
  assert(closeFn.indexOf('_clearConfirmationQuote') !== -1);
  assert(closeFn.indexOf('_confirmMarketAlert = null') !== -1);
  assert(closeFn.indexOf('_pendingSnapshot = null') !== -1);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
