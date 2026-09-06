/**
 * MMA lobby fighter photos — verified ESPN IDs + img markup.
 * Run: node tests/mma-fighter-photos.test.js
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

console.log('\n🥊 MMA fighter photos\n');

test('player.html loads player-photos.js before team-logos.js', function () {
  var a = playerHtml.indexOf('src="player-photos.js"');
  var b = playerHtml.indexOf('src="team-logos.js"');
  assert(a >= 0 && b >= 0, 'both scripts present');
  assert(a < b, 'player-photos.js must load before team-logos.js');
});

test('player.html prefers getMMAFighterPhotoImg for MMA headshots', function () {
  var idx = playerHtml.indexOf('function _pbPlayerHeadshotImg');
  assert(idx >= 0, '_pbPlayerHeadshotImg missing');
  var slice = playerHtml.slice(idx, idx + 900);
  var mmaIdx = slice.indexOf("sport === 'mma' && typeof getMMAFighterPhotoImg");
  var genericIdx = slice.indexOf("typeof getPlayerPhotoImg === 'function'");
  assert(mmaIdx >= 0, 'mma helper branch missing');
  assert(genericIdx >= 0, 'generic getPlayerPhotoImg branch missing');
  assert(mmaIdx < genericIdx, 'mma helper must run before generic getPlayerPhotoImg');
});

test('teamAvatar wires getMMAFighterPhotoImg for MMA cards', function () {
  assert(playerHtml.indexOf("kind === 'mma' && typeof getMMAFighterPhotoImg") >= 0);
  assert(playerHtml.indexOf('mc-jersey-headshot') >= 0);
});

test('player-photos.js has verified MMA ESPN IDs including Jon Jones', function () {
  assert(/mma:\s*\{/.test(photosJs), 'VERIFIED_PLAYER_IDS.mma missing');
  assert(/'Jon Jones':\s*2335639/.test(photosJs), 'Jon Jones ID missing');
  assert(/'Islam Makhachev':\s*3332412/.test(photosJs), 'Makhachev ID missing');
  assert(/'Jamahal Hill':\s*4425355/.test(photosJs), 'Jamahal Hill ID missing');
  assert((photosJs.match(/'Jamahal Hill'/g) || []).length === 1, 'Jamahal Hill must be deduped');
});

test('getMMAFighterPhoto / getMMAFighterPhotoImg return Jones headshot img', function () {
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

  var url = sandbox.getMMAFighterPhoto('Jon Jones');
  assert(url === 'https://a.espncdn.com/i/headshots/mma/players/full/2335639.png', 'unexpected url: ' + url);

  var fromPhotos = sandbox.getPlayerHeadshotUrl('Jon Jones', 'mma');
  assert(fromPhotos === url, 'player-photos map should match: ' + fromPhotos);

  var img = sandbox.getMMAFighterPhotoImg('Jon Jones', 52);
  assert(img.indexOf('<img') === 0, 'expected <img>, got: ' + img.slice(0, 120));
  assert(img.indexOf(url) >= 0, 'img missing ESPN src');
  assert(/onerror=/.test(img), 'img missing onerror initials fallback');
});

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
