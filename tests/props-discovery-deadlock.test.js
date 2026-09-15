/**
 * P1 props discovery deadlock — FE gates + cold-cache discoverability.
 * Run: node tests/props-discovery-deadlock.test.js
 * No financial / settlement logic.
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

function extractFn(name) {
  var re = new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}');
  var m = html.match(re);
  assert(m, 'missing function ' + name);
  return m[0];
}

console.log('\n-- props discovery deadlock --\n');

test('three-state UI constants present', function() {
  assert(html.indexOf("_PB_PROPS_UI") >= 0);
  assert(html.indexOf("UNKNOWN: 'UNKNOWN'") >= 0);
  assert(html.indexOf("LOADING: 'LOADING'") >= 0);
  assert(html.indexOf("AVAILABLE: 'AVAILABLE'") >= 0);
  assert(html.indexOf("UNAVAILABLE: 'UNAVAILABLE'") >= 0);
  assert(html.indexOf("ERROR: 'ERROR'") >= 0);
  assert(html.indexOf('function _pbSportPropsStatus') >= 0);
});

test('PLAYER PROPS stays discoverable on unknown / legacy empty', function() {
  var fn = extractFn('_pbSportHasProps');
  assert(fn.indexOf('_PB_PROPS_UI.AVAILABLE') >= 0);
  assert(fn.indexOf('_PB_PROPS_UI.UNKNOWN') >= 0);
  assert(fn.indexOf('hasProps === false') < 0 || html.indexOf('function _pbSportPropsStatus') >= 0);
  var statusFn = extractFn('_pbSportPropsStatus');
  assert(statusFn.indexOf("st === 'unknown'") >= 0);
  assert(statusFn.indexOf("st === 'empty'") >= 0, 'legacy empty treated as discoverable');
  assert(statusFn.indexOf('_PB_PROPS_UI.UNKNOWN') >= 0);
});

test('API failure never maps to No props available', function() {
  assert(html.indexOf('Unable to load props') >= 0);
  var openSlice = html.slice(
    html.indexOf('async function _pbOpenDedicatedProps'),
    html.indexOf('function _pbRenderInlinePropsHtml')
  );
  assert(openSlice.indexOf('Unable to load props') >= 0);
  assert(openSlice.indexOf('!res.ok') >= 0);
  // Failure path must not use the empty inventory copy.
  var failBlock = openSlice.slice(openSlice.indexOf('if (!res.ok)'), openSlice.indexOf('if (!data || !data.props'));
  assert(failBlock.indexOf('Unable to load props') >= 0);
  assert(failBlock.indexOf('No props for this game') < 0);
  assert(!/No props available/i.test(failBlock.replace(/\/\/[^\n]*/g, '')));
});

test('on-demand fetch query prefers eventId + home/away', function() {
  var fn = extractFn('_pbPropsQueryString');
  assert(fn.indexOf('data-event-id') >= 0);
  assert(fn.indexOf('data-home') >= 0);
  assert(fn.indexOf('data-away') >= 0);
  assert(fn.indexOf('canonicalGameKey') >= 0);
});

test('market cards carry event identity attrs', function() {
  assert(html.indexOf('data-event-id="') >= 0);
  assert(html.indexOf('data-canonical-key="') >= 0);
  assert(html.indexOf('cardIdentityAttrs') >= 0);
});

test('progressive disclosure still present', function() {
  assert(html.indexOf('_PB_POPULAR_PROP_TYPES') >= 0);
  assert(html.indexOf('_pbToggleDedicatedPlayerMore') >= 0);
  assert(html.indexOf('_pbToggleDedicatedAlts') >= 0);
  assert(html.indexOf('_pbDedicatedPropsSearch') >= 0);
  assert(html.indexOf("id: 'all'") >= 0);
});

test('executable discovery semantics via vm', function() {
  var vm = require('vm');
  var src =
    'var window = { _sportsCatalog: null };\n' +
    extractFn('_pbNormalizePropSport') + '\n' +
    'var _PB_PROPS_SUPPORTED_SPORTS = ["mlb","nba","nfl","nhl","ncaab","ncaaf","wnba"];\n' +
    'function _pbSportSupportsProps(sport){ return _PB_PROPS_SUPPORTED_SPORTS.indexOf(String(sport||"").toLowerCase())>=0; }\n' +
    extractFn('_pbSportCatalogEntry') + '\n' +
    html.match(/var _PB_PROPS_UI = Object\.freeze\(\{[\s\S]*?\}\);/)[0] + '\n' +
    extractFn('_pbSportPropsStatus') + '\n' +
    extractFn('_pbSportHasProps') + '\n' +
    'this._pbSportPropsStatus = _pbSportPropsStatus;\n' +
    'this._pbSportHasProps = _pbSportHasProps;\n' +
    'this.window = window;\n';
  var sandbox = {};
  vm.runInNewContext(src, sandbox);

  // Catalog not loaded → known live sports discoverable
  assert.strictEqual(sandbox._pbSportHasProps('nfl'), true);
  assert.strictEqual(sandbox._pbSportPropsStatus('nfl'), 'UNKNOWN');

  // Cold legacy empty + capable → UNKNOWN (deadlock break)
  sandbox.window._sportsCatalog = {
    sports: [{ key: 'nfl', hasProps: false, propsStatus: 'empty', propsCapable: true, propsCount: 0 }]
  };
  assert.strictEqual(sandbox._pbSportPropsStatus('nfl'), 'UNKNOWN');
  assert.strictEqual(sandbox._pbSportHasProps('nfl'), true);

  // New cold unknown + hasProps null
  sandbox.window._sportsCatalog.sports[0] = {
    key: 'nfl', hasProps: null, propsStatus: 'unknown', propsCapable: true, propsCount: 0
  };
  assert.strictEqual(sandbox._pbSportPropsStatus('nfl'), 'UNKNOWN');
  assert.strictEqual(sandbox._pbSportHasProps('nfl'), true);

  // Warm available
  sandbox.window._sportsCatalog.sports[0] = {
    key: 'nfl', hasProps: true, propsStatus: 'available', propsCapable: true, propsCount: 383
  };
  assert.strictEqual(sandbox._pbSportPropsStatus('nfl'), 'AVAILABLE');
  assert.strictEqual(sandbox._pbSportHasProps('nfl'), true);

  // Warm unavailable
  sandbox.window._sportsCatalog.sports[0] = {
    key: 'nhl', hasProps: false, propsStatus: 'unavailable', propsCapable: true, propsCount: 0
  };
  assert.strictEqual(sandbox._pbSportPropsStatus('nhl'), 'UNAVAILABLE');
  assert.strictEqual(sandbox._pbSportHasProps('nhl'), false);

  // Unsupported sport
  assert.strictEqual(sandbox._pbSportHasProps('soccer'), false);
  assert.strictEqual(sandbox._pbSportPropsStatus('tennis'), 'UNAVAILABLE');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
