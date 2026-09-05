/**
 * MMA event-card / bet-slip presentation — pure string checks (no DOM).
 * Run: node tests/mma-fighter-presentation.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var playerHtml = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
var photosJs = fs.readFileSync(path.join(root, 'player-photos.js'), 'utf8');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); pass++; }
  catch (e) { console.error('  ❌ ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

console.log('\n🥋 MMA fighter presentation\n');

test('player.html routes MMA through headshot avatar path', function() {
  assert(playerHtml.indexOf("s === 'mma'") >= 0 || playerHtml.indexOf("kind === 'mma'") >= 0);
  assert(playerHtml.indexOf('_pbPlayerHeadshotImg') >= 0);
  assert(playerHtml.indexOf("kind === 'mma'") >= 0 || playerHtml.indexOf("|| kind === 'mma'") >= 0);
});

test('player.html shows promotion/league on MMA cards', function() {
  assert(playerHtml.indexOf('leagueLabel') >= 0);
  assert(playerHtml.indexOf('headerSport') >= 0);
  assert(playerHtml.indexOf('g.league') >= 0);
});

test('bet-slip logo helper still prefers O/U for totals', function() {
  assert(playerHtml.indexOf('_slipTotalSide') >= 0);
  assert(playerHtml.indexOf('dkslip-ou-o') >= 0);
  assert(playerHtml.indexOf('dkslip-ou-u') >= 0);
  assert(playerHtml.indexOf('_pbLobbyLogoImg') >= 0);
});

test('player-photos.js supports MMA ESPN search + exact-only matching', function() {
  assert(photosJs.indexOf("mma: 'mma'") >= 0);
  assert(photosJs.indexOf('mmaSearchQueries') >= 0);
  assert(photosJs.indexOf("sport === 'mma'") >= 0);
  assert(photosJs.indexOf('getMmaFighterPhotoImg') >= 0);
  assert(photosJs.indexOf('Ambiguous exact ties') >= 0 || photosJs.indexOf('ranked[0].score === ranked[1].score') >= 0);
});

test('MMA sport tab key unchanged', function() {
  assert(playerHtml.indexOf("setSport(this,'mma')") >= 0);
  assert(playerHtml.indexOf('id="st-mma"') >= 0);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
