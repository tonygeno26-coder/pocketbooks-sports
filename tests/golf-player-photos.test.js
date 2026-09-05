/**
 * Golf lobby player photos — verified ESPN IDs + img markup.
 * Run: node tests/golf-player-photos.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');
var playerHtml = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
var photosJs = fs.readFileSync(path.join(root, 'player-photos.js'), 'utf8');
var logosJs = fs.readFileSync(path.join(root, 'team-logos.js'), 'utf8');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.error('  ❌ ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

console.log('\n⛳ Golf player photos\n');

test('player.html loads player-photos.js before team-logos.js', function () {
  var a = playerHtml.indexOf('src="player-photos.js"');
  var b = playerHtml.indexOf('src="team-logos.js"');
  assert(a >= 0 && b >= 0, 'both scripts present');
  assert(a < b, 'player-photos.js must load before team-logos.js');
});

test('player.html prefers getGolfPlayerPhotoImg for golf headshots', function () {
  var idx = playerHtml.indexOf('function _pbPlayerHeadshotImg');
  assert(idx >= 0, '_pbPlayerHeadshotImg missing');
  var slice = playerHtml.slice(idx, idx + 700);
  var golfIdx = slice.indexOf("sport === 'golf' && typeof getGolfPlayerPhotoImg");
  var genericIdx = slice.indexOf('typeof getPlayerPhotoImg === \'function\'');
  assert(golfIdx >= 0, 'golf helper branch missing');
  assert(genericIdx >= 0, 'generic getPlayerPhotoImg branch missing');
  assert(golfIdx < genericIdx, 'golf helper must run before generic getPlayerPhotoImg');
});

test('player-photos.js has verified golf ESPN IDs including Scheffler', function () {
  assert(/golf:\s*\{/.test(photosJs), 'VERIFIED_PLAYER_IDS.golf missing');
  assert(/'Scottie Scheffler':\s*9478/.test(photosJs), 'Scheffler ID missing');
  assert(/'Rory McIlroy':\s*3470/.test(photosJs), 'McIlroy ID missing');
});

test('getGolfPlayerPhoto / getGolfPlayerPhotoImg return Scheffler headshot img', function () {
  var sandbox = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    document: { createElement: function () { return {}; }, querySelectorAll: function () { return []; } },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, key: function () { return null; }, length: 0 },
    fetch: async function () { return { ok: false }; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(photosJs, sandbox);
  vm.runInContext(logosJs, sandbox);

  var url = sandbox.getGolfPlayerPhoto('Scottie Scheffler');
  assert(url === 'https://a.espncdn.com/i/headshots/golf/players/full/9478.png', 'unexpected url: ' + url);

  var fromPhotos = sandbox.getPlayerHeadshotUrl('Scottie Scheffler', 'golf');
  assert(fromPhotos === url, 'player-photos map should match: ' + fromPhotos);

  var img = sandbox.getGolfPlayerPhotoImg('Scottie Scheffler', 52);
  assert(img.indexOf('<img') === 0, 'expected <img>, got: ' + img.slice(0, 120));
  assert(img.indexOf(url) >= 0, 'img missing ESPN src');
  assert(/onerror=/.test(img), 'img missing onerror initials fallback');
});

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
