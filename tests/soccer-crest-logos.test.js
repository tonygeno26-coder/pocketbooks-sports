/**
 * Soccer crest presentation + strict client lookup (no betting logic).
 * Run: node tests/soccer-crest-logos.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'team-logos.js'), 'utf8');
const sandbox = { console, window: {}, global: {} };
sandbox.global = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

console.log('\n-- soccer crest strict lookup --');
test('exports warmSoccerTeamLogosFromApi', function () {
  assert(typeof sandbox.warmSoccerTeamLogosFromApi === 'function');
  assert(typeof sandbox.getSoccerTeamLogo === 'function');
  assert(typeof sandbox.getSoccerTeamLogoImg === 'function');
});
test('Draw never resolves to a crest URL', function () {
  assert(sandbox.getSoccerTeamLogo('Draw') === '');
  assert(sandbox.getSoccerTeamLogo('draw') === '');
});
test('no loose substring matching Inter Milan vs Inter Miami', function () {
  var milan = sandbox.getSoccerTeamLogo('Inter Milan');
  var miami = sandbox.getSoccerTeamLogo('Inter Miami');
  if (milan && miami) {
    assert(milan !== miami, 'Inter Milan and Inter Miami must use different crest URLs');
  }
});
test('getSoccerTeamLogoImg uses contain + no forced circle tile', function () {
  var html = sandbox.getSoccerTeamLogoImg('Bayern Munich', 52);
  if (html.indexOf('<img') >= 0) {
    assert(html.indexOf('object-fit:contain') >= 0);
    assert(html.indexOf('border-radius:50%') < 0);
  }
});

console.log('\n-- player.html Draw + soccer wiring --');
const player = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');
test('teamAvatar prefers soccer homeLogoUrl when provided', function () {
  assert(player.indexOf("kind === 'soccer' && opts.logoUrl") >= 0);
});
test('Draw slip visual present', function () {
  assert(player.indexOf('_slipIsDrawSelection') >= 0);
  assert(player.indexOf('dkslip-draw') >= 0);
  assert(player.indexOf('dkslip-draw-x') >= 0);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('✅ Soccer crest client checks verified');
