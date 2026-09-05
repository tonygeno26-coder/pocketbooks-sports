/**
 * PocketBooks Sports — Bet-slip logo-slot hierarchy
 *
 * 1) Player prop → player photo (beats O/U even when side is over/under)
 * 2) Team-based → team logo
 * 3) Game/event total → green O / red U
 * 4) Soccer Draw → neutral X/DRAW
 * 5) Unresolved → graceful fallback
 *
 * Uses structured market/side/presentation fields (not fragile matchup parsing).
 *
 * Run: node tests/bet-slip-ou-icons.test.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const PLAYER_HTML = path.join(__dirname, '..', 'player.html');
const src         = fs.readFileSync(PLAYER_HTML, 'utf8');

const scriptRx = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g;
const scripts  = [];
let m;
while ((m = scriptRx.exec(src)) !== null) scripts.push(m[1]);
const scriptBody = scripts.find(function(s) {
  return s.indexOf('function _slipTotalSide') >= 0 && s.indexOf('function _normalizeSlipMarket') >= 0;
});
if (!scriptBody) {
  console.error('FATAL: player.html script extraction failed (helpers not found in ' + scripts.length + ' blocks).');
  process.exit(1);
}

function ext(startNeedle, endNeedle) {
  const s = scriptBody.indexOf(startNeedle);
  const e = scriptBody.indexOf(endNeedle, s + startNeedle.length);
  if (s < 0 || e < 0) {
    throw new Error('extract miss: ' + startNeedle + ' .. ' + endNeedle);
  }
  return scriptBody.slice(s, e);
}

let harness = '';
harness += "'use strict';\n";
harness += 'var _currentSport = "mlb";\n';
harness += 'function getPlayerPhotoImg(name, sport, size, opts) {\n';
harness += '  opts = opts || {};\n';
harness += '  var fit = opts.objectFit || "cover";\n';
harness += '  var br = opts.borderRadius != null ? opts.borderRadius : "50%";\n';
harness += '  var cls = opts.className || "";\n';
harness += '  return \'<img class="\' + cls + \'" data-player-photo="\' + name +\n';
harness += '    \'" data-player-name="\' + name + \'" data-player-sport="\' + sport +\n';
harness += '    \'" src="https://example.test/\' + encodeURIComponent(name) + \'.png" \' +\n';
harness += '    \'style="object-fit:\' + fit + \';border-radius:\' + br + \'">\';\n';
harness += '}\n';
harness += ext('function _normalizeSlipMarket', 'function _resolveGameId') + '\n';
harness += ext('function bsTeamAbbr', 'function _slipTotalSide') + '\n';
harness += ext('function _slipTotalSide', 'function _slipIsPlayerProp') + '\n';
harness += ext('function _slipIsPlayerProp', 'function _slipIsDrawSelection') + '\n';
harness += ext('function _slipIsDrawSelection', 'function _slipPresentationFromCell') + '\n';
harness += ext('function _slipPresentationFromCell', 'function _slipPlayerPropPhotoHtml') + '\n';
harness += ext('function _slipPlayerPropPhotoHtml', 'function _slipLegLogoHtml') + '\n';
harness += ext('function _slipLegLogoHtml', 'function _hydrateSlipPlayerPhotos') + '\n';
harness += 'module.exports = {\n';
harness += '  _normalizeSlipMarket: _normalizeSlipMarket,\n';
harness += '  _slipTotalSide: _slipTotalSide,\n';
harness += '  _slipIsPlayerProp: _slipIsPlayerProp,\n';
harness += '  _slipIsDrawSelection: _slipIsDrawSelection,\n';
harness += '  _slipLegLogoHtml: _slipLegLogoHtml,\n';
harness += '  bsTeamAbbr: bsTeamAbbr\n';
harness += '};\n';

const h = eval('(function(){\n' + harness + '\nreturn module.exports;\n})()');

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'expected true'); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'assertEq') + ': got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}

console.log('\n-- TOTAL O/U detection --');

test('side=over wins over pick text', function() {
  assertEq(h._slipTotalSide({ side: 'over', market: 'total', pick: 'Under 9' }), 'over');
});
test('side=under wins', function() {
  assertEq(h._slipTotalSide({ side: 'under', market: 'total', pick: 'Over 9' }), 'under');
});
test('market=total + Over pick → over', function() {
  assertEq(h._slipTotalSide({ market: 'total', pick: 'Over 8.5' }), 'over');
});
test('market=Total (display) + Under pick → under', function() {
  assertEq(h._slipTotalSide({ market: 'Total', pick: 'Under 220.5' }), 'under');
});
test('market normalized from Totals', function() {
  assertEq(h._normalizeSlipMarket('Totals'), 'total');
  assertEq(h._slipTotalSide({ market: 'Totals', pick: 'Over 47' }), 'over');
});
test('Over/Under pick without market still detects', function() {
  assertEq(h._slipTotalSide({ pick: 'Over 6.5' }), 'over');
  assertEq(h._slipTotalSide({ pick: 'Under 5.5' }), 'under');
});
test('moneyline / spread → null (not O/U)', function() {
  assertEq(h._slipTotalSide({ market: 'moneyline', pick: 'Yankees' }), null);
  assertEq(h._slipTotalSide({ market: 'spread', pick: 'Yankees -1.5' }), null);
});
test('NFL/NBA/NHL/soccer total picks detect', function() {
  assertEq(h._slipTotalSide({ market: 'total', pick: 'Over 47.5', sport: 'nfl' }), 'over');
  assertEq(h._slipTotalSide({ market: 'total', pick: 'Under 224.5', sport: 'nba' }), 'under');
  assertEq(h._slipTotalSide({ market: 'total', pick: 'Over 6', sport: 'nhl' }), 'over');
  assertEq(h._slipTotalSide({ market: 'total', pick: 'Under 2.5', sport: 'soccer' }), 'under');
});
test('player-prop Over/Under must NOT be game-total O/U', function() {
  assertEq(h._slipTotalSide({
    market: 'prop', side: 'over',
    pick: 'Patrick Mahomes Over 275.5 Passing Yards',
    presentation: { kind: 'player_prop', playerName: 'Patrick Mahomes', side: 'over' },
    isPlayerProp: true
  }), null);
  assertEq(h._slipTotalSide({
    market: 'Prop', side: 'under',
    pick: 'LeBron James Under 25.5 Points',
    cellId: 'prop-g1-LeBron-James-Points-under-25.5',
    playerName: 'LeBron James'
  }), null);
});

console.log('\n-- player prop photo hierarchy --');

test('player prop Over renders photo not green O', function() {
  var html = h._slipLegLogoHtml({
    market: 'prop',
    side: 'over',
    pick: 'Patrick Mahomes Over 275.5 Passing Yards',
    sport: 'nfl',
    presentation: { kind: 'player_prop', playerName: 'Patrick Mahomes', side: 'over' },
    isPlayerProp: true,
    playerName: 'Patrick Mahomes'
  });
  assert(html.indexOf('dkslip-player-photo') >= 0 || html.indexOf('data-player-photo') >= 0, 'missing player photo');
  assert(html.indexOf('Patrick Mahomes') >= 0, 'missing player name on photo');
  assert(html.indexOf('dkslip-ou-o') < 0, 'must not show green O for player prop Over');
  assert(html.indexOf('dkslip-ou-u') < 0, 'must not show red U');
});
test('player prop Under renders photo not red U', function() {
  var html = h._slipLegLogoHtml({
    market: 'prop',
    side: 'under',
    pick: 'Shohei Ohtani Under 1.5 Hits',
    sport: 'mlb',
    presentation: { kind: 'player_prop', playerName: 'Shohei Ohtani', side: 'under' },
    isPlayerProp: true
  });
  assert(html.indexOf('dkslip-ou') < 0, 'player-prop Under must not use O/U icons');
  assert(html.indexOf('Shohei Ohtani') >= 0);
});
test('NFL/NBA/MLB/NHL/tennis/mma player props detected', function() {
  ['nfl', 'nba', 'mlb', 'nhl', 'tennis', 'mma'].forEach(function(sp) {
    assert(h._slipIsPlayerProp({
      market: 'prop', sport: sp,
      presentation: { kind: 'player_prop', playerName: 'Test Player' },
      isPlayerProp: true
    }) === true, sp + ' prop');
  });
});
test('cellId prop- prefix detects player prop', function() {
  assert(h._slipIsPlayerProp({
    market: 'prop',
    cellId: 'prop-abc-Player-Name-Yards-over-100',
    pick: 'Player Name Over 100 Yards'
  }) === true);
});

console.log('\n-- logo HTML --');

test('Over renders floating green O (no tile classes)', function() {
  var html = h._slipLegLogoHtml({ market: 'total', pick: 'Over 8.5' });
  assert(html.indexOf('dkslip-ou-o') >= 0, 'missing over class');
  assert(html.indexOf('>O</span>') >= 0, 'missing O glyph');
  assert(html.indexOf('dkslip-leg-logo') >= 0, 'missing logo slot');
  assert(html.indexOf('border-radius:50%') < 0, 'must not use circle tile');
  assert(html.indexOf('<img') < 0, 'totals must not use team logo img');
});
test('Under renders floating red U', function() {
  var html = h._slipLegLogoHtml({ market: 'total', pick: 'Under 8.5' });
  assert(html.indexOf('dkslip-ou-u') >= 0, 'missing under class');
  assert(html.indexOf('>U</span>') >= 0, 'missing U glyph');
});
test('soccer Draw renders neutral X/DRAW (not remove button, not club crest)', function() {
  assert(h._slipIsDrawSelection({ market: 'moneyline', pick: 'Draw' }) === true);
  assert(h._slipIsDrawSelection({ side: 'draw', market: 'moneyline', pick: 'Draw' }) === true);
  var html = h._slipLegLogoHtml({ market: 'moneyline', pick: 'Draw', sport: 'soccer', game: 'Napoli vs Inter Milan' });
  assert(html.indexOf('dkslip-draw') >= 0, 'missing draw class');
  assert(html.indexOf('dkslip-draw-x') >= 0, 'missing X glyph class');
  assert(html.indexOf('DRAW') >= 0, 'missing DRAW label');
  assert(html.indexOf('dkslip-ou') < 0, 'Draw must not use O/U classes');
  assert(html.indexOf('<img') < 0, 'Draw must not use club crest img');
  assert(html.indexOf('dkslip-close') < 0, 'must not reuse slip close control');
});
test('team ML falls through to abbr when no logo helper', function() {
  var html = h._slipLegLogoHtml({ market: 'moneyline', pick: 'Yankees', game: 'Red Sox vs Yankees' });
  assert(html.indexOf('dkslip-ou') < 0, 'ML must not show O/U');
  assert(html.indexOf('dkslip-leg-logo') >= 0);
});
test('confirm-modal style option preserved', function() {
  var html = h._slipLegLogoHtml({ market: 'total', pick: 'Over 9' }, { style: 'margin-right:10px' });
  assert(html.indexOf('margin-right:10px') >= 0);
});

console.log('\n-- CSS + wiring in player.html --');

test('CSS defines floating O/U (no box)', function() {
  assert(src.indexOf('.dkslip-ou{') >= 0);
  assert(src.indexOf('.dkslip-ou-o{') >= 0);
  assert(src.indexOf('.dkslip-ou-u{') >= 0);
  assert(src.indexOf('color:#00e676') >= 0, 'over green');
  assert(src.indexOf('color:#ff3b30') >= 0, 'under red');
  assert(/\.dkslip-ou\{[^}]*border:\s*none/.test(src), 'ou border none');
  assert(/\.dkslip-ou\{[^}]*border-radius:\s*0/.test(src), 'ou no radius tile');
  assert(/\.dkslip-ou\{[^}]*text-shadow:/.test(src) || src.indexOf('text-shadow:0 2px 4px') >= 0);
});
test('CSS defines Draw X/DRAW in same footprint', function() {
  assert(src.indexOf('.dkslip-draw{') >= 0);
  assert(src.indexOf('.dkslip-draw-x{') >= 0);
  assert(src.indexOf('.dkslip-draw-label{') >= 0);
  assert(src.indexOf('_slipIsDrawSelection') >= 0);
});
test('CSS defines player photo contain + drop-shadow', function() {
  assert(src.indexOf('.dkslip-player-photo') >= 0);
  assert(src.indexOf('object-fit:contain') >= 0);
  assert(src.indexOf('_slipIsPlayerProp') >= 0);
  assert(src.indexOf('_slipPlayerPropPhotoHtml') >= 0);
  assert(src.indexOf('_slipPresentationFromCell') >= 0);
  assert(src.indexOf('data-player-prop') >= 0);
});
test('logo footprint matches team logos (36 / 32 mobile)', function() {
  assert(/\.dkslip-leg-logo\{width:36px;height:36px/.test(src));
  assert(/\.dkslip-leg-logo\{width:32px;height:32px\}/.test(src));
  assert(src.indexOf('.dkslip-ou{font-size:1.5rem}') >= 0, 'mobile ou scale');
});
test('responsive breakpoints present (390/768/1280/1440)', function() {
  assert(/@media\s*\(\s*max-width:\s*400px\s*\)/.test(src) || /@media\s*\(\s*max-width:\s*375px\s*\)/.test(src));
  assert(/@media\s*\(\s*min-width:\s*768px\s*\)/.test(src));
  assert(/@media\s*\(\s*min-width:\s*1280px\s*\)/.test(src) || src.indexOf('min-width:1280px') >= 0);
  assert(/@media\s*\(\s*min-width:\s*1440px\s*\)/.test(src) || src.indexOf('min-width:1440px') >= 0);
});
test('singles + parlays + sgp + confirm use _slipLegLogoHtml', function() {
  var count = (src.match(/_slipLegLogoHtml\(/g) || []).length;
  assert(count >= 5, 'expected ≥5 call sites (def + 4 renders), got ' + count);
});
test('light slip color scheme preserved', function() {
  assert(src.indexOf('.dkslip-scroll{flex:1;overflow-y:auto') >= 0 || src.indexOf('background:#f2f2f2') >= 0);
  assert(src.indexOf('.dkslip-card{background:#fff') >= 0 || src.indexOf('background:#fff!important') >= 0);
  assert(src.indexOf('color:#00c853') >= 0);
});
test('unboxed team logo treatment preserved', function() {
  assert(src.indexOf('Unboxed floating logos') >= 0);
  assert(/\.dkslip-leg-logo\{[^}]*background:transparent/.test(src));
  assert(src.indexOf('filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))') >= 0);
});
test('presentation metadata does not alter contract place fields', function() {
  assert(src.indexOf('_buildContractPlaceLeg') >= 0);
  // Contract return still only pick/market/odds/line/keys — presentation not listed
  var contractFn = src.slice(src.indexOf('function _buildContractPlaceLeg'), src.indexOf('function _makeSelection'));
  assert(contractFn.indexOf('presentation') < 0, 'contract must not include presentation');
  assert(contractFn.indexOf('photoUrl') < 0, 'contract must not include photoUrl');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('\u2705 All bet-slip logo hierarchy rules verified');
