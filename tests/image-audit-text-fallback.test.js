/**
 * Image audit policy — text-only fallbacks + MLS/NCAAB numeric ESPN IDs.
 * Run: node tests/image-audit-text-fallback.test.js
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

console.log('\n-- image audit / text-only fallback --\n');

test('scripts/image-audit.js exists', function () {
  assert(fs.existsSync(path.join(root, 'scripts/image-audit.js')));
});

test('team-logos text fallback has no initials circle', function () {
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

  var unknown = sandbox.getTeamLogoImg('Definitely Not A Real Team XYZ', 'mlb', 40);
  assert(unknown.indexOf('<img') < 0, 'unknown team should not render img, got: ' + unknown.slice(0, 160));
  assert(/pb-text-fallback/.test(unknown), 'expected pb-text-fallback class');
  assert(unknown.indexOf('Definitely Not A Real Team XYZ') >= 0, 'should show full name text');

  // Invented abbrevs must not be used
  assert(!sandbox.getTeamAbbrev('Definitely Not A Real Team XYZ', 'mlb'), 'must not invent abbrev');

  var mls = sandbox.getTeamLogoDirect('Inter Miami CF', 'mls');
  assert(mls.indexOf('/soccer/500/20232.png') >= 0, 'MLS must use ESPN numeric id, got ' + mls);

  var ncaab = sandbox.getTeamLogoDirect('Duke Blue Devils', 'ncaab');
  assert(ncaab.indexOf('/ncaa/500/150.png') >= 0, 'NCAAB must use ESPN numeric id, got ' + ncaab);

  var photoMiss = sandbox.getPlayerPhotoImg('Unknown Player ZZZ', 'mlb', 40);
  assert(/pb-text-fallback/.test(photoMiss), 'player miss → text fallback');
  assert(photoMiss.indexOf('Unknown Player ZZZ') >= 0);
});

test('player.html uses text fallback helpers / collapse-to-text', function () {
  var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  assert(html.indexOf('_pbCollapseImgToText') >= 0);
  assert(html.indexOf('mc-prop-text-fallback') >= 0);
  assert(html.indexOf('pb-text-fallback') >= 0);
  assert(html.indexOf('dkslip-player-fallback pb-text-fallback') >= 0);
});

test('onerror handlers hide broken img before text fallback', function () {
  var teamSrc = fs.readFileSync(path.join(root, 'team-logos.js'), 'utf8');
  var photoSrc = fs.readFileSync(path.join(root, 'player-photos.js'), 'utf8');
  var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  assert(teamSrc.indexOf("img.style.display = 'none'") >= 0, 'team logo error should hide img');
  assert(photoSrc.indexOf("img.style.display = 'none'") >= 0, 'player photo error should hide img');
  assert(html.indexOf("img.style.display = 'none'") >= 0, '_pbCollapseImgToText should hide img');

  var sandbox = {
    console: console,
    document: {
      createElement: function (tag) {
        return { tagName: tag, style: {}, setAttribute: function () {}, textContent: '', parentNode: null };
      }
    },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, key: function () { return null; }, length: 0 },
    fetch: async function () { return { ok: false }; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'player-photos.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'team-logos.js'), 'utf8'), sandbox);

  var img = {
    style: {},
    onerror: function () {},
    setAttribute: function (k, v) { img[k] = v; },
    getAttribute: function (k) {
      if (k === 'data-photo-step') return '1';
      if (k === 'data-player-name') return 'Test Player';
      if (k === 'data-player-sport') return 'mlb';
      return '';
    },
    outerHTML: ''
  };
  Object.defineProperty(img, 'outerHTML', {
    set: function (v) { img._replaced = v; },
    get: function () { return img._replaced || ''; }
  });
  sandbox.handlePlayerPhotoError(img);
  assert(img.style.display === 'none', 'handlePlayerPhotoError should hide img');
  assert(/pb-text-fallback/.test(img._replaced || ''), 'should replace with text fallback');
});

test('bet-slip O/U/Draw hierarchy preserved', function () {
  var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  var idxProp = html.indexOf('if (_slipIsPlayerProp(b))');
  var idxOu = html.indexOf("if (ou === 'over')");
  var idxDraw = html.indexOf('if (_slipIsDrawSelection(b))');
  assert(idxProp >= 0 && idxOu > idxProp && idxDraw > idxOu);
});

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
