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

const playerSrc = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');

console.log('\n-- beta bug hunt presentation guards --');

test('confirmBet dedupes in-flight placement (_confirmBetInFlight + cbBusy guard)', function() {
  assert(playerSrc.includes('var _confirmBetInFlight = false;'), 'missing _confirmBetInFlight flag');
  assert(playerSrc.includes("CONFIRM_BET_DEDUPED"), 'missing dedupe log');
  assert(/_confirmBetInFlight\s*=\s*true/.test(playerSrc), 'missing in-flight set in _cbBtnBusy');
  assert(/function _cbBtnReady[\s\S]*?_confirmBetInFlight\s*=\s*false/.test(playerSrc),
    '_cbBtnReady must clear in-flight flag');
});

test('odds-cell deselect clears both selected and sel highlight classes', function() {
  assert(playerSrc.includes("cell.classList.remove('selected', 'sel');"),
    'deselect must remove both highlight classes');
  assert(playerSrc.includes("cell.classList.add('selected', 'sel');"),
    'select must add both highlight classes');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
