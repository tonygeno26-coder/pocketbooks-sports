'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'expected true'); }

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

console.log('\n-- 390px mobile layout --');

[
  'lobby.html',
  'player.html',
  'index.html',
  'admin-diamonds.html',
  'unresolved-grading.html',
  'test-dashboard.html',
  'survivor.html',
  'diamonds.js'
].forEach(function(file) {
  test(file + ' has a 390/400px breakpoint', function() {
    const src = read(file);
    assert(/@media\s*\(\s*max-width:\s*400px\s*\)/.test(src), 'missing max-width:400px');
  });
});

test('player sportsbook shrinks odds columns at 390px', function() {
  const src = read('player.html');
  assert(src.includes('minmax(0,72px) minmax(0,72px) minmax(0,72px)'));
  assert(src.includes('min-height:44px'));
});

test('login/auth and diamonds modal stay full-width at 390px', function() {
  assert(read('lobby.html').includes('max-width:100vw'));
  assert(read('diamonds.js').includes("bd-pkgs{grid-template-columns:1fr}"));
});

test('admin diamond tables remain scrollable, not redesigned', function() {
  const src = read('admin-diamonds.html');
  assert(src.includes('.table-wrap{max-width:100%'));
  assert(src.includes('grid-template-columns:1fr}'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
