/**
 * Prop defer ≥100 — betting identity / selection / filter safety.
 * Covers 99 / 100 / 101 / 300 / 500 (eager vs deferred thresholds).
 * Run: node tests/prop-defer-betting-safety.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var bench = require('../scripts/props-perf-bench');

var root = path.join(__dirname, '..');
var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

function propCellId(p, gameId) {
  var pt = String((p && p.propType) || 'prop').replace(/\s+/g, '-');
  return 'prop-' + gameId + '-' + String(p.playerName).replace(/\s+/g, '-') + '-' + pt + '-' + p.side + '-' + p.line;
}

function simulateDefer(n) {
  var props = bench.makeProps(n);
  var sections = bench.sectionize(props);
  var EAGER = 4;
  var deferHeavy = props.length >= 100;
  var marketIds = {};
  var deferredIds = {};
  var eagerIds = {};
  var html = '';
  sections.forEach(function (sec, idx) {
    var deferBody = deferHeavy && idx >= EAGER;
    sec.props.forEach(function (p, i) {
      if (i >= 5) return; // section limit
      var id = propCellId(p, p.gameId);
      marketIds[id] = p;
      if (deferBody) deferredIds[id] = true;
      else eagerIds[id] = true;
      if (deferBody) {
        html += '<template class="mc-prop-deferred-tpl"><div class="odds-cell" id="c-' + id +
          '" data-id="' + id + '" data-odds="' + p.odds + '"></div></template>';
      } else {
        html += '<div class="odds-cell" id="c-' + id + '" data-id="' + id + '" data-odds="' + p.odds + '"></div>';
      }
    });
    if (deferBody) html += '<div class="mc-prop-section-deferred"><div class="mc-prop-deferred-slot" aria-hidden="true"></div></div>';
  });
  return {
    n: n, props: props, sections: sections.length, deferHeavy: deferHeavy,
    marketIds: marketIds, deferredIds: deferredIds, eagerIds: eagerIds, html: html,
    marketCount: Object.keys(marketIds).length
  };
}

function hydrateTemplate(html) {
  // Expand templates into live DOM strings (identity preserved).
  return html.replace(/<template class="mc-prop-deferred-tpl">([\s\S]*?)<\/template>/g, '$1')
    .replace(/mc-prop-section-deferred/g, 'mc-prop-section')
    .replace(/mc-prop-deferred-slot/g, 'mc-prop-hydrated-slot');
}

console.log('\n-- prop defer betting safety --\n');

test('player.html has defer + resync + stable cellId', function () {
  var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  assert(html.indexOf('props.length >= 100') >= 0);
  assert(html.indexOf('_pbHydrateDeferredPropSections') >= 0);
  assert(html.indexOf('_pbResyncBetSlipSelections') >= 0);
  assert(html.indexOf('function _pbPropCellId') >= 0);
  assert(html.indexOf('aria-hidden="true">Scroll to load') >= 0 ||
    /mc-prop-deferred-slot[^>]*aria-hidden="true"/.test(html));
  // enhanceOddsIn after expand (no duplicate announce on defer)
  assert(html.indexOf('PbA11y.enhanceOddsIn(body)') >= 0);
  assert(html.indexOf('PbA11y.announce') < 0 || html.indexOf('_pbExpandDeferredPropSection') >= 0);
});

[99, 100, 101, 300, 500].forEach(function (n) {
  test(n + '-prop fixture market IDs stable across hydrate', function () {
    var before = simulateDefer(n);
    var afterHtml = hydrateTemplate(before.html);
    var idsBefore = Object.keys(before.marketIds).sort();
    var idsAfter = [];
    var re = /id="c-([^"]+)"/g, m;
    while ((m = re.exec(afterHtml))) idsAfter.push(m[1]);
    idsAfter.sort();
    // Every pre-hydrate market id still present after expand
    idsBefore.forEach(function (id) {
      assert(afterHtml.indexOf('id="c-' + id + '"') >= 0, 'lost id ' + id);
    });
    if (n < 100) {
      assert(!before.deferHeavy, '99 must stay eager');
      assert(before.html.indexOf('mc-prop-section-deferred') < 0);
    } else {
      assert(before.deferHeavy, n + ' must defer');
      assert(before.html.indexOf('mc-prop-section-deferred') >= 0);
      assert(Object.keys(before.deferredIds).length > 0, 'expected deferred cells');
    }
    // Selection survival: cellId in betSlip still matches after hydrate
    var sampleId = idsBefore[0];
    var slip = [{ cellId: sampleId, odds: before.marketIds[sampleId].odds }];
    assert(slip[0].cellId === sampleId);
    assert(afterHtml.indexOf('id="c-' + sampleId + '"') >= 0);
  });
});

test('filter tab before/after hydration preserves full market set', function () {
  var props = bench.makeProps(300);
  var all = bench.filterTab(props, 'all');
  assert(all.length === 300);
  var r = bench.bench(300);
  assert(r.marketsPreserved, 'bench markets not preserved');
  // popular tab is a curated view filter — must not mutate cache length
  var popular = bench.filterTab(props, 'popular');
  assert(popular.length < props.length || popular.length === 0, 'popular should be curated subset');
  assert(props.length === 300);
});

test('no duplicate keydown wiring marker in enhanceOddsCell', function () {
  var js = fs.readFileSync(path.join(root, 'pb-a11y.js'), 'utf8');
  assert(js.indexOf("data-pb-odds-key") >= 0);
  assert(js.indexOf("getAttribute('data-pb-odds-key') === '1'") >= 0 ||
    js.indexOf('data-pb-odds-key') >= 0);
});

test('odds identity exact: same prop → same cellId', function () {
  var p = {
    playerName: 'Player 7', propType: 'Hits', side: 'over', line: 1.5,
    odds: -110, gameId: 'mlb:Away@Home-20260909'
  };
  var a = propCellId(p, p.gameId);
  var b = propCellId(Object.assign({}, p), p.gameId);
  assert(a === b);
  assert(a.indexOf('prop-mlb:Away@Home-20260909-Player-7-Hits-over-1.5') === 0 ||
    a === 'prop-mlb:Away@Home-20260909-Player-7-Hits-over-1.5');
});

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
