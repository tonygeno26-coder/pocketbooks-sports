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

const hostHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

console.log('\n-- Host Risk Console overview --');

test('home uses host-risk-console wrapper', function() {
  assert(hostHtml.includes('id="home-content" class="host-risk-console"'));
});

test('header reads Host Risk Console', function() {
  assert(hostHtml.includes('Host <span>Risk Console</span>'));
});

test('ticket P&L KPI ids preserved for stats refresh', function() {
  ['total-owes-you', 'total-you-owe', 'settle-week-net', 'settle-all-net',
   'stat-active-risk', 'stat-hold', 'stat-active-bets', 'stat-handle', 'stat-profit'
  ].forEach(function(id) {
    assert(hostHtml.includes('id="' + id + '"'), 'missing #' + id);
  });
});

test('ticket P&L labeled distinctly from bankroll and ledger', function() {
  assert(hostHtml.includes('Ticket P&amp;L Position'));
  assert(hostHtml.includes('hrc-bankroll-tag'));
  assert(hostHtml.includes('Weekly settlement ledger'));
  assert(hostHtml.includes('not ticket P&amp;L or betting bankroll'));
});

test('operator sections present on overview', function() {
  assert(hostHtml.includes('id="hrc-attention-list"'));
  assert(hostHtml.includes('id="hrc-active-list"'));
  assert(hostHtml.includes('id="hrc-exposure-list"'));
  assert(hostHtml.includes('id="hrc-tickets-list"'));
  assert(hostHtml.includes('id="hrc-settlement-status"'));
  assert(hostHtml.includes('Player Risk'));
});

test('renderHostRiskConsole is wired', function() {
  assert(hostHtml.includes('function renderHostRiskConsole'));
  assert(hostHtml.includes('window.renderHostRiskConsole'));
  assert(hostHtml.includes('renderHostRiskConsole()'));
});

test('overview has no settlement recording controls', function() {
  var homeChunk = hostHtml.split('id="home-content"')[1].split('id="modal-limits"')[0];
  assert(homeChunk.indexOf('/api/host/record-settlement') === -1);
  assert(homeChunk.indexOf('recordSettlement') === -1);
  assert(homeChunk.indexOf('data-settle-input') === -1);
});

test('expandable player risk cards on overview', function() {
  assert(hostHtml.includes('hrc-player-card'));
  assert(hostHtml.includes('togglePlayerExpand'));
  assert(hostHtml.includes('hrc-player-body'));
});

test('390px mobile rules for risk console', function() {
  assert(/@media\s*\(\s*max-width:\s*400px\s*\)[\s\S]*\.hrc-metrics-grid/.test(hostHtml));
  assert(/@media\s*\(\s*max-width:\s*400px\s*\)[\s\S]*\.hrc-owe-grid/.test(hostHtml));
});

test('switchHostTab helper for section links', function() {
  assert(hostHtml.includes('function switchHostTab'));
  assert(hostHtml.includes("switchHostTab('bets')"));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
