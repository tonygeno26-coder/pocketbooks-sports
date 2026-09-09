/**
 * Props panel perf — 100/300 fixture smoke (no crash, defer markers)
 * Run: node tests/props-render-fixture.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

var PROP_TYPES = ['Points', 'Rebounds', 'Assists', 'Threes', 'Steals', 'Blocks', 'PRA', 'Turnovers'];

function makeProps(n) {
  var props = [];
  for (var i = 0; i < n; i++) {
    props.push({
      playerName: 'Player ' + i,
      propType: PROP_TYPES[i % PROP_TYPES.length],
      side: 'over',
      line: 20.5 + (i % 5),
      odds: -110 + (i % 20),
      pick: 'Player ' + i + ' Over',
      team: i % 2 ? 'LAL' : 'BOS'
    });
  }
  return props;
}

function sectionize(props) {
  var sections = {};
  var order = [];
  props.forEach(function (p) {
    var title = p.propType || 'Props';
    if (!sections[title]) { sections[title] = []; order.push(title); }
    sections[title].push(p);
  });
  return order.map(function (t) { return { title: t, props: sections[t] }; });
}

/** Mirrors player.html deferHeavy path (props.length >= 100, idx >= _PB_PROP_EAGER_SECTIONS). */
function simulatePropsRender(props) {
  var EAGER = 4;
  var SECTION_LIMIT = 5;
  var deferHeavy = props.length >= 100;
  var sections = sectionize(props);
  var htmlParts = [];
  var rowCount = 0;
  sections.forEach(function (sec, idx) {
    var deferBody = deferHeavy && idx >= EAGER;
    var rows = sec.props.length;
    rowCount += Math.min(rows, SECTION_LIMIT);
    if (deferBody) {
      htmlParts.push('<div class="mc-prop-section-deferred"><template>' +
        sec.props.slice(0, SECTION_LIMIT).map(function () { return '<div class="mc-prop-row"></div>'; }).join('') +
        '</template></div>');
    } else {
      htmlParts.push(sec.props.slice(0, SECTION_LIMIT).map(function () {
        return '<div class="mc-prop-row"></div>';
      }).join(''));
    }
  });
  return { html: htmlParts.join(''), deferHeavy: deferHeavy, rowCount: rowCount, sections: sections.length };
}

console.log('\n-- props render fixture --\n');

test('player.html documents defer threshold >= 100', function () {
  var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  assert(html.indexOf('props.length >= 100') >= 0, 'missing deferHeavy threshold');
  assert(html.indexOf('_pbHydrateDeferredPropSections') >= 0);
  assert(html.indexOf('_PB_PROP_EAGER_SECTIONS') >= 0);
});

test('100-prop fixture renders without crash', function () {
  var r = simulatePropsRender(makeProps(100));
  assert(r.html.length > 0);
  assert(r.deferHeavy);
  assert(r.html.indexOf('mc-prop-section-deferred') >= 0);
});

test('300-prop fixture renders without crash', function () {
  var r = simulatePropsRender(makeProps(300));
  assert(r.html.length > 0);
  assert(r.deferHeavy);
  assert(r.sections >= 3);
  var deferredCount = (r.html.match(/mc-prop-section-deferred/g) || []).length;
  assert(deferredCount >= 1, 'expected deferred sections for 300 props');
});

test('small prop list stays eager', function () {
  var r = simulatePropsRender(makeProps(40));
  assert(!r.deferHeavy);
  assert(r.html.indexOf('mc-prop-section-deferred') < 0);
});

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
