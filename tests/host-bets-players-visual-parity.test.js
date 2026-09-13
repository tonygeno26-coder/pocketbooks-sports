'use strict';

/**
 * Host Bets / Host Players visual parity — source gate.
 * Presentation-only markers; must not imply API / settlement / accounting changes.
 * Balance-first Host Players: large +/- from getLiveCreditPosition weeklyNet.
 */

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'expected true'); }
function assertIncludes(hay, needle, msg) {
  if (!String(hay).includes(needle)) throw new Error((msg || '') + ' — missing ' + JSON.stringify(needle));
}
function assertNotIncludes(hay, needle, msg) {
  if (String(hay).includes(needle)) throw new Error((msg || '') + ' — unexpectedly found ' + JSON.stringify(needle));
}

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const player = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');

console.log('\n── Host Bets / Players visual parity ──');

test('shares Recent Bets ticket language (rb-card / rb-status)', function () {
  assertIncludes(html, 'rb-card', 'rb-card class');
  assertIncludes(html, 'rb-card--won', 'won accent');
  assertIncludes(html, 'rb-card--lost', 'lost accent');
  assertIncludes(html, 'rb-card--push', 'push accent');
  assertIncludes(html, 'rb-card--void', 'void accent');
  assertIncludes(html, 'rb-status--active', 'active badge');
  assertIncludes(html, 'rb-status--won', 'won badge');
  assertIncludes(html, 'rb-status--lost', 'lost badge');
  assertIncludes(html, 'rb-status--push', 'push badge');
  assertIncludes(html, 'rb-status--muted', 'void/canceled badge');
});

test('preserves ACTIVE / SETTLED / ALL host bets filters', function () {
  assertIncludes(html, 'data-bets-tab="all"', 'ALL tab');
  assertIncludes(html, 'data-bets-tab="active"', 'ACTIVE tab');
  assertIncludes(html, 'data-bets-tab="settled"', 'SETTLED tab');
  assertIncludes(html, 'data-bets-tab="canceled"', 'CANCELED tab');
  assertIncludes(html, 'host-bets-filter-status', 'status filter');
  assertIncludes(html, 'host-bets-filter-player', 'player filter');
});

test('preserves host bet actions', function () {
  assertIncludes(html, 'data-host-cashout', 'cashout action');
  assertIncludes(html, 'data-host-cancel', 'cancel action');
  assertIncludes(html, 'Offer Cash Out', 'cashout label');
  assertIncludes(html, 'Cancel Bet', 'cancel label');
  assertIncludes(html, 'hostApproveDelete', 'approve delete fn');
  assertIncludes(html, 'hostOfferCashout', 'offer cashout fn');
});

test('Host Players premium rows + initials avatar', function () {
  assertIncludes(html, 'hp-row', 'premium row');
  assertIncludes(html, 'hp-avatar', 'avatar');
  assertIncludes(html, '_hpInitials', 'initials helper');
  assertIncludes(html, 'hp-badge--approved', 'status badge text');
  assertIncludes(html, 'Betting Bankroll', 'bankroll secondary label');
});

test('balance-first hierarchy uses authoritative getLiveCreditPosition weeklyNet', function () {
  assertIncludes(html, 'hp-host-pos', 'large host position class');
  assertIncludes(html, 'hp-rel-label', 'relationship label');
  assertIncludes(html, 'PLAYER OWES YOU', 'positive rel label');
  assertIncludes(html, 'YOU OWE PLAYER', 'negative rel label');
  assertIncludes(html, "return 'EVEN'", 'zero rel label');
  assertIncludes(html, 'getLiveCreditPosition', 'reuses existing credit position');
  assertIncludes(html, 'weeklyNet', 'authoritative signed field');
  assertIncludes(html, '_hostPositionForPlayer', 'position helper');
  assertIncludes(html, 'hp-pos-summary', 'top summary strip');
  assertIncludes(html, 'Players Owe You', 'owe you summary');
  assertIncludes(html, 'You Owe Players', 'you owe summary');
  assertIncludes(html, 'Net Position', 'net position summary');
  assertIncludes(html, 'largest absolute host position', 'sort documentation');
  assertIncludes(html, 'Math.abs(_hostPositionForPlayer', 'abs sort');
  // Bankroll must not dominate as blue accent primary metric
  assertNotIncludes(html, 'hp-metric-val--accent">\'+balTxt', 'bankroll not blue primary');
});

test('secondary ops metrics: Hold % / Active Bets / Active Exposure / Bankroll under +/-', function () {
  assertIncludes(html, 'hp-ops-grid', '2x2 ops grid');
  assertIncludes(html, 'Hold %', 'hold label');
  assertIncludes(html, 'Active Bets', 'active bets label');
  assertIncludes(html, 'Active Exposure', 'exposure label');
  assertIncludes(html, 'Betting Bankroll', 'bankroll in ops');
  assertIncludes(html, '_holdPctFromTickets', 'reuses Settled Hold formula');
  assertIncludes(html, '_playerHoldPct', 'per-player hold helper');
  assertIncludes(html, '_clubHoldPct', 'club hold from dashboard cache');
  assertIncludes(html, '_clubActiveBets', 'club active bets helper');
  assertIncludes(html, 'hp-ops-summary', 'top ops summary');
  assertIncludes(html, 'hp-summary-active-bets', 'summary active bets id');
  assertIncludes(html, 'hp-summary-hold', 'summary hold id');
  // Exposure only from authoritative openRisk — no FE stake sum for card
  assertIncludes(html, 'openRiskAuth', 'authoritative exposure gate');
  assertNotIncludes(html, 'getOpenRiskAmt(p.playerId)', 'no FE open-risk derivation in playerRow');
  assertIncludes(html, "return '—'", 'hold em-dash when unavailable');
});

test('separates betting vs settlement ledger visually without new formulas', function () {
  assertIncludes(html, 'Credit Position', 'home credit section');
  assertIncludes(html, 'Betting Ledger', 'home betting section');
  assertIncludes(html, 'hp-section--betting', 'players betting section');
  assertIncludes(html, 'hp-section--settlement', 'players settlement section');
  assertIncludes(html, 'settlement execution remains OFF', 'settlement still off notice');
  assertIncludes(html, 'No settlement actions', 'no settlement actions copy');
});

test('money semantics markers unchanged (green owe you / red you owe)', function () {
  assertIncludes(html, 'Players Owe You', 'owe you label');
  assertIncludes(html, 'You Owe Players', 'you owe label');
  assertIncludes(html, 'sc-green', 'green credit card');
  assertIncludes(html, 'sc-red', 'red credit card');
  assertIncludes(html, "_dirColor(playersOwe, 'in')", 'income color direction');
  assertIncludes(html, "_dirColor(hostOwes, 'out')", 'outflow color direction');
  assertIncludes(html, 'hp-host-pos--pos', 'positive green class');
  assertIncludes(html, 'hp-host-pos--neg', 'negative red class');
  assertIncludes(html, 'hp-host-pos--zero', 'zero muted class');
});

test('dark-native empty / loading states', function () {
  assertIncludes(html, 'hb-empty', 'bets empty');
  assertIncludes(html, 'hp-empty', 'players empty');
  assertIncludes(html, 'hp-loading', 'players loading');
});

test('responsive breakpoints present for 390/430/768/1280/1440', function () {
  assertIncludes(html, '@media (max-width:390px)', '390');
  assertIncludes(html, '@media (max-width:430px)', '430');
  assertIncludes(html, '@media (min-width:768px)', '768');
  assertIncludes(html, '@media (min-width:1280px)', '1280');
  assertIncludes(html, '@media (min-width:1440px)', '1440');
});

test('preview auth stays localhost/visual — production not weakened in script comment', function () {
  assertIncludes(html, "get('preview') === '1'", 'preview flag');
  // Top-of-file preview skip is for visual QA shell only; production token gate remains for non-preview.
  assertIncludes(html, 'Host dashboard requires a club-scoped host token', 'prod host gate comment');
});

test('Player Dashboard / Recent Bets source of truth still present', function () {
  assertIncludes(player, 'Premium digital ticket — shared Recent Bets + Results', 'player rb source');
  assertIncludes(player, 'rb-card--won', 'player won card');
  assertIncludes(player, 'function renderMyBets', 'renderMyBets intact');
});

test('no settlement execution enablement markers introduced', function () {
  assertNotIncludes(html, 'SETTLEMENT_ENABLED = true', 'must not force-enable settlement');
  assertNotIncludes(html, 'SGP_ENABLED = true', 'must not force-enable SGP');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('✅ Host bets/players visual parity gate verified');
