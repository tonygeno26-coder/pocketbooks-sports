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

console.log('\n-- Production debug cleanup --');

test('debug panel requires opt-in flag on host + player', function() {
  ['index.html', 'player.html'].forEach(function(file) {
    const src = read(file);
    assert(src.includes('function _pbsDebugEnabled'), file + ' missing gate');
    assert(src.includes("get('debug') === '1'"), file + ' missing ?debug=1 gate');
    assert(src.includes("if (!_pbsDebugEnabled()) return;"), file + ' openDebugPanel not gated');
  });
});

test('build-info footer is hidden by default', function() {
  ['index.html', 'player.html'].forEach(function(file) {
    const src = read(file);
    assert(src.includes('id="build-info"') && src.includes('display:none'),
      file + ' build-info should default to hidden');
    assert(!/onclick="openDebugPanel\(\)"/.test(src),
      file + ' must not expose openDebugPanel via always-on onclick');
  });
});

test('place-bet hit-test no longer mutates production DOM', function() {
  const src = read('player.html');
  assert(!src.includes('setTimeout(runPlaceBetHitTest'), 'hit-test must not auto-run');
  assert(src.includes('function runPlaceBetHitTest() { /* removed'),
    'hit-test body must be a no-op');
  assert(!src.includes('hit.style.pointerEvents = \'none\''),
    'must not auto pointer-events:none blockers');
});

test('TEMP DEBUG dumps removed from player My Bets path', function() {
  const src = read('player.html');
  assert(!src.includes('TEMP DEBUG — dump real persisted schema'));
  assert(!src.includes('TEMP DEBUG — ticket source audit'));
  assert(!src.includes('TEMP DEBUG — prove the rewrite'));
});

test('DB source badge is debug-gated', function() {
  const src = read('player.html');
  assert(src.includes("!_pbsDebugEnabled()") && src.includes('_db_source_badge'));
});

test('Test Center developer details remain available', function() {
  const src = read('test-dashboard.html');
  assert(src.includes('Developer Details'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
