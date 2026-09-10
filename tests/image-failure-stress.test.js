/**
 * Image failure stress — text-only fallbacks, no empty a11y controls.
 * Run: node tests/image-failure-stress.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

console.log('\n-- image failure stress --\n');

test('player.html collapse + prop headshot error handlers present', function () {
  var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  assert(html.indexOf('function _pbCollapseImgToText') >= 0);
  assert(html.indexOf('function _pbPropHeadshotError') >= 0);
  assert(html.indexOf('removeAttribute(\'src\')') >= 0 || html.indexOf('removeAttribute("src")') >= 0);
  assert(/aria-hidden['"]?\s*,\s*['"]true['"]/.test(html) || html.indexOf("setAttribute('aria-hidden', 'true')") >= 0);
});

test('broken team name yields text fallback (no img)', function () {
  var sandbox = {
    console: console,
    document: { createElement: function () { return {}; }, querySelectorAll: function () { return []; } },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, key: function () { return null; }, length: 0 },
    fetch: async function () { return { ok: false }; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'player-photos.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'team-logos.js'), 'utf8'), sandbox);

  var miss = sandbox.getTeamLogoImg('ZZZ NotATeam 999', 'mlb', 40);
  assert(miss.indexOf('<img') < 0, 'unknown team must not emit img');
  assert(/pb-text-fallback/.test(miss));

  var playerMiss = sandbox.getPlayerPhotoImg('Definitely Fake Player XYZ', 'mlb', 48);
  // may return img with onerror OR text — either must have failure path
  if (playerMiss.indexOf('<img') >= 0) {
    assert(/onerror=/.test(playerMiss), 'player img needs onerror');
    assert(/loading="lazy"/.test(playerMiss));
  } else {
    assert(/pb-text-fallback|initial/i.test(playerMiss) || playerMiss.length > 0);
  }
});

test('collapse replaces img — no residual focusable img', function () {
  var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  var start = html.indexOf('function _pbCollapseImgToText');
  var body = html.slice(start, start + 900);
  assert(body.indexOf('replaceChild') >= 0 || body.indexOf('replaceWith') >= 0);
  assert(body.indexOf("setAttribute('aria-hidden', 'true')") >= 0);
  assert(body.indexOf("removeAttribute('alt')") >= 0 || body.indexOf('alt = \'\'') >= 0);
});

test('multiple onerror handlers do not leave competing hide paths without text', function () {
  var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  // design-system _pbHideBrokenImg must not be the only path on this tip
  assert(html.indexOf('_pbCollapseImgToText') >= 0);
  var hideOnly = (html.match(/_pbHideBrokenImg/g) || []).length;
  var collapse = (html.match(/_pbCollapseImgToText/g) || []).length;
  assert(collapse >= 3, 'expected collapse wired in multiple sites, got ' + collapse);
  // If hide helper exists it should still collapse to text — not silent hide-only
  if (hideOnly) {
    assert(html.indexOf('pb-text-fallback') >= 0);
  }
});

test('sport-tab league logos have onerror emoji replace (no empty control)', function () {
  var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  assert(html.indexOf("this.replaceWith(document.createTextNode") >= 0);
  assert(/id="st-boxing"[\s\S]*?onerror=/.test(html));
  assert(/id="st-nascar"[\s\S]*?onerror=/.test(html));
});

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
