/**
 * Premium dedicated Props experience — presentation rules (no financial logic).
 * Run: node tests/premium-props-experience.test.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');

var pass = 0;
var fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  OK  ' + name);
    pass++;
  } catch (e) {
    console.log('  FAIL  ' + name + ' — ' + (e && e.message));
    fail++;
  }
}

console.log('\n-- premium props experience --\n');

test('dedicated props shell + CSS present', function() {
  assert(html.indexOf('id="pb-dedicated-props"') >= 0);
  assert(html.indexOf('.pb-dprops{') >= 0 || html.indexOf('.pb-dprops{position:fixed') >= 0);
  assert(html.indexOf('PLAYER PROPS') >= 0);
  assert(html.indexOf('_pbOpenDedicatedProps') >= 0);
  assert(html.indexOf('_pbCloseDedicatedProps') >= 0);
});

test('hasProps gates entry (not sport-capable alone)', function() {
  assert(html.indexOf('var showPropsBtn = _pbSportHasProps(sportRoute);') >= 0);
  assert(html.indexOf('function _pbSportHasProps') >= 0);
});

test('SGP not advertised in category tabs', function() {
  var m = html.match(/var _PB_PROP_TAB_DEFS = \{[\s\S]*?\n\};/);
  assert(m, 'tab defs');
  assert(m[0].indexOf("id: 'sgp'") < 0, 'no SGP tab id');
  assert(!/\{\s*id:\s*'sgp'/.test(m[0]), 'no SGP tab object');
});

test('sport-specific category tabs documented', function() {
  var m = html.match(/var _PB_PROP_TAB_DEFS = \{[\s\S]*?\n\};/)[0];
  assert(m.indexOf('passing') >= 0 && m.indexOf('rushing') >= 0 && m.indexOf('receiving') >= 0);
  assert(m.indexOf('batters') >= 0 && m.indexOf('pitchers') >= 0 && m.indexOf('hr_rbi') >= 0);
  assert(m.indexOf('threes') >= 0 && m.indexOf('combos') >= 0);
});

test('Popular allowlist is deterministic core markets', function() {
  var m = html.match(/var _PB_POPULAR_PROP_TYPES = \{[\s\S]*?\n\};/);
  assert(m, 'popular map');
  assert(m[0].indexOf("'Passing Yards':1") >= 0);
  assert(m[0].indexOf("'Hits':1") >= 0);
  assert(m[0].indexOf("'Points':1") >= 0);
  assert(m[0].indexOf("'Strikeouts':1") >= 0);
});

test('alternate lines collapsible (no dump)', function() {
  assert(html.indexOf('ALTERNATE LINES') >= 0);
  assert(html.indexOf('_pbToggleDedicatedAlts') >= 0);
  assert(html.indexOf('_pbPickPrimaryLineGroup') >= 0);
});

test('player-grouped dedicated render', function() {
  assert(html.indexOf('_pbGroupPropsByPlayer') >= 0);
  assert(html.indexOf('pb-dprops-player') >= 0);
  assert(html.indexOf('_pbRenderDedicatedMarketHtml') >= 0);
});

test('lazy load on open + session cache', function() {
  assert(html.indexOf('/api/props/') >= 0);
  assert(html.indexOf('90000') >= 0); // 90s session cache
  assert(html.indexOf('_pbOpenDedicatedProps') >= 0);
});

test('search control present', function() {
  assert(html.indexOf('pb-dprops-search') >= 0);
  assert(html.indexOf('_pbDedicatedPropsSearch') >= 0);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
if (fail) process.exit(1);
