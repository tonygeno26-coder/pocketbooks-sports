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

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const src = read('player.html');

console.log('\n-- Props Discovery 2.0 --');

// ── Pure filter logic (mirrors player.html) ──────────────────────────────────

function propRowHasSelection(row) {
  return !!(row.selected || row.cells && row.cells.some(function(c) { return c.selected; }));
}

function propRowMatchesFilter(row, playerQ, propQ) {
  if (propRowHasSelection(row)) return true;
  var name = String(row.playerName || '').toLowerCase();
  var pType = String(row.propType || '').toLowerCase();
  if (playerQ && name.indexOf(playerQ) === -1) return false;
  if (propQ && pType.indexOf(propQ) === -1) return false;
  return true;
}

function propsUsePlayerGrouping(ui, propCount) {
  return !!(ui && String(ui.playerQ || '').trim()) || (propCount >= 120 && ui && ui.tab !== 'popular');
}

function buildPlayerGroups(props) {
  var byPlayer = {};
  var order = [];
  (props || []).forEach(function(p) {
    var name = String(p.playerName || '').trim() || 'Unknown';
    if (!byPlayer[name]) { byPlayer[name] = { playerName: name, props: [] }; order.push(name); }
    byPlayer[name].props.push(p);
  });
  return order.map(function(n) { return byPlayer[n]; });
}

function filterVisible(props, ui) {
  var playerQ = String(ui.playerQ || '').trim().toLowerCase();
  var propQ = String(ui.propQ || '').trim().toLowerCase();
  return props.filter(function(p) {
    return propRowMatchesFilter({ playerName: p.playerName, propType: p.propType, selected: p.selected }, playerQ, propQ);
  });
}

function makeProps(n, playerPrefix) {
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push({
      playerName: (playerPrefix || 'Player') + ' ' + (i % 40),
      propType: i % 3 === 0 ? 'Passing Yards' : (i % 3 === 1 ? 'Passing TDs' : 'Rushing Yards'),
      line: 250 + (i % 5) * 0.5,
      side: i % 2 === 0 ? 'over' : 'under',
      odds: -110
    });
  }
  return out;
}

test('0 props: empty state helpers present in player.html', function() {
  assert(src.includes('_pbPropsEmptyHtml'));
  assert(src.includes('No player props yet'));
  assert(src.includes('No props in this category'));
});

test('20 props: category layout (no player grouping without search)', function() {
  var props = makeProps(20);
  var ui = { tab: 'passing', playerQ: '', propQ: '' };
  assert(!propsUsePlayerGrouping(ui, props.length));
  assert(buildPlayerGroups(props).length === 20);
});

test('300+ props: player grouping when tab is non-popular', function() {
  var props = makeProps(320, 'Athlete');
  var ui = { tab: 'passing', playerQ: '', propQ: '' };
  assert(propsUsePlayerGrouping(ui, props.length));
  assert(buildPlayerGroups(props).length <= 40);
});

test('player search filters to matching names', function() {
  var props = makeProps(50, 'Star');
  props.push({ playerName: 'Patrick Mahomes', propType: 'Passing Yards', selected: false });
  props.push({ playerName: 'Patrick Mahomes', propType: 'Passing TDs', selected: false });
  var ui = { playerQ: 'mahomes', propQ: '' };
  var visible = filterVisible(props, ui);
  assert(visible.length === 2);
  assert(visible.every(function(p) { return p.playerName.indexOf('Mahomes') >= 0; }));
});

test('prop type search filters markets', function() {
  var props = makeProps(30);
  var ui = { playerQ: '', propQ: 'passing yards' };
  var visible = filterVisible(props, ui);
  assert(visible.length > 0);
  assert(visible.every(function(p) { return p.propType.toLowerCase().indexOf('passing yards') >= 0; }));
});

test('selected prop survives filter (never hidden)', function() {
  var row = { playerName: 'Hidden Guy', propType: 'Steals', selected: true };
  assert(propRowMatchesFilter(row, 'zzz', 'zzz'));
});

test('dual search: player + prop type intersection', function() {
  var props = [
    { playerName: 'Patrick Mahomes', propType: 'Passing Yards' },
    { playerName: 'Patrick Mahomes', propType: 'Rushing Yards' },
    { playerName: 'Travis Kelce', propType: 'Passing Yards' }
  ];
  var ui = { playerQ: 'mahomes', propQ: 'passing' };
  var visible = filterVisible(props, ui);
  assert(visible.length === 1);
  assert(visible[0].propType === 'Passing Yards');
});

test('filter latency: 300 props under 5ms (client-side)', function() {
  var props = makeProps(300, 'Bench');
  props.forEach(function(p, i) { if (i === 42) p.selected = true; });
  var ui = { playerQ: 'bench 7', propQ: 'passing' };
  var t0 = Date.now();
  for (var r = 0; r < 50; r++) filterVisible(props, ui);
  var elapsed = Date.now() - t0;
  assert(elapsed < 50, '50 filter passes took ' + elapsed + 'ms (expected <50)');
});

test('player.html has dual search inputs', function() {
  assert(src.includes('mc-props-search-player'));
  assert(src.includes('mc-props-search-type'));
  assert(src.includes('placeholder="Search player"'));
  assert(src.includes('placeholder="Search prop type"'));
});

test('sticky filter bar + player grouping CSS', function() {
  assert(src.includes('.mc-props-sticky-bar'));
  assert(src.includes('position:sticky'));
  assert(src.includes('.mc-prop-player-group'));
  assert(src.includes('.mc-prop-type-block'));
});

test('selected row highlight + filter preserve logic', function() {
  assert(src.includes('_pbPropRowHasSelection'));
  assert(src.includes('has-selection'));
  assert(src.includes('_pbPropRowMatchesFilter'));
});

test('client-side filter uses rAF debounce (no rerender on type search)', function() {
  assert(src.includes('_pbSchedulePropsDiscoveryFilter'));
  assert(src.includes('requestAnimationFrame'));
  assert(src.includes('_pbApplyPropsDiscoveryFilter'));
});

test('keyboard: Escape clears search + aria labels', function() {
  assert(src.includes("e.key !== 'Escape'"));
  assert(src.includes('aria-label="Search player"'));
  assert(src.includes('aria-label="Search prop type"'));
  assert(src.includes('aria-live="polite"'));
});

test('mobile 390: props search stacks and touch targets', function() {
  assert(src.includes('@media (max-width:400px)'));
  assert(src.includes('.mc-props-search-row{flex-direction:column'));
  assert(src.includes('.mc-props-search{min-height:44px'));
});

test('market identity preserved (_pbPropCellId unchanged contract)', function() {
  assert(src.includes('function _pbPropCellId(p, gameId)'));
  assert(src.includes("'prop-' + gameId + '-'"));
  assert(src.includes('data-player-prop="1"'));
});

test('no duplicate grouping keys (player|propType|line)', function() {
  assert(src.includes("String(p.playerName || '') + '|' + String(p.propType || '') + '|' + String(p.line)"));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
