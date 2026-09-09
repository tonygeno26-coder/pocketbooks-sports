'use strict';

/**
 * Host Players 2.0 + Host Bets operator view
 * Run: node tests/host-ops-players-bets.test.js
 */

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

console.log('\n-- Host Player Detail 2.0 --');

test('betting vs settlement ledger zones exist', function() {
  assert(hostHtml.includes('hpd-zone-betting'));
  assert(hostHtml.includes('hpd-zone-ledger'));
  assert(hostHtml.includes('data-hpd-zone="betting"'));
  assert(hostHtml.includes('data-hpd-zone="ledger"'));
  assert(hostHtml.includes('Settlement ledger'));
  assert(hostHtml.includes('Not bankroll or ticket exposure'));
});

test('player detail helper renders both zones', function() {
  assert(hostHtml.includes('function _hostPlayerDetailZonesHtml'));
  assert(hostHtml.includes('_hostPlayerDetailZonesHtml(pid'));
});

test('settlement recording default OFF + disabled control', function() {
  assert(hostHtml.includes('function _hostSettlementRecordingEnabled'));
  assert(hostHtml.includes("return false;"));
  assert(hostHtml.includes('Record settlement — disabled'));
  assert(hostHtml.includes("Settlement recording is disabled"));
  assert(hostHtml.includes('Record · off'));
});

test('settle ledger uses cached preview fields only (no bankroll mix)', function() {
  assert(hostHtml.includes('function _hostPlayerSettleLedger'));
  assert(hostHtml.includes('function _cacheHostSettlePlayers'));
  assert(hostHtml.includes('data-hpd-zone="betting"'));
  assert(hostHtml.includes('data-hpd-zone="ledger"'));
  assert(hostHtml.includes('Not bankroll or ticket exposure — settlement position only.'));
  // Ledger KPIs are settle-cache fields, not bankroll helpers
  assert(hostHtml.includes("led.owesYou"));
  assert(hostHtml.includes("led.youOwe"));
  assert(hostHtml.includes("led.outstanding"));
  assert(hostHtml.includes('_hostPlayerSettleLedger(pid)'));
});

test('390 / 768 / 1440 responsive hooks for player detail', function() {
  assert(/@media\s*\(\s*max-width:\s*400px\s*\)[\s\S]*\.hpd-kpi-grid/.test(hostHtml));
  assert(/@media\s*\(\s*min-width:\s*768px\s*\)[\s\S]*\.hpd-kpi-grid/.test(hostHtml));
  assert(/@media\s*\(\s*min-width:\s*1440px\s*\)[\s\S]*#players-section/.test(hostHtml));
});

console.log('\n-- Host Bets operator view --');

test('search player/ticket/event control present', function() {
  assert(hostHtml.includes('id="host-bets-search"'));
  assert(hostHtml.includes('_hostBetsSearch'));
  assert(hostHtml.includes('Search player, ticket ID, or event'));
});

test('status filters include ACTIVE/WON/LOST/PUSH/VOID', function() {
  assert(hostHtml.includes('value="active">ACTIVE</option>'));
  assert(hostHtml.includes('value="won">WON</option>'));
  assert(hostHtml.includes('value="lost">LOST</option>'));
  assert(hostHtml.includes('value="push">PUSH</option>'));
  assert(hostHtml.includes('value="void">VOID</option>'));
});

test('operator ticket cards with stake/potential/result/legs', function() {
  assert(hostHtml.includes('hbo-ticket'));
  assert(hostHtml.includes('hbo-metrics'));
  assert(hostHtml.includes('data-hbo-legs'));
  assert(hostHtml.includes('data-hbo-exposure'));
  assert(hostHtml.includes('Active exposure (host)'));
  assert(hostHtml.includes('Host exp.'));
});

test('VOID badge distinct from CANCELED', function() {
  assert(hostHtml.includes("label:'VOID'"));
  assert(hostHtml.includes("label:'CANCELED'"));
  assert(hostHtml.includes("if (s === 'void' || s === 'voided') return 'void';"));
});

test('payout label uses existing ticket fields only', function() {
  var fn = hostHtml.split('function _hostTicketPayoutLabel')[1].split('function ')[0];
  assert(fn.indexOf('riskAmount') !== -1);
  assert(fn.indexOf('potentialProfit') !== -1);
  assert(fn.indexOf('estimatedPayout') !== -1);
  // No invented alternate formulas
  assert(fn.indexOf('* 1.1') === -1);
  assert(fn.indexOf('/ 2') === -1);
});

test('mobile compact cards — no table layout for host bets list', function() {
  assert(hostHtml.includes('class="hbo-ticket'));
  var betsRender = hostHtml.split('function renderHostBets')[1].split('const SECTIONS')[0];
  assert(betsRender.indexOf('<table') === -1);
  assert(/@media\s*\(\s*max-width:\s*430px\s*\)[\s\S]*\.hbo-metrics/.test(hostHtml) ||
         /@media\s*\(\s*max-width:\s*400px\s*\)[\s\S]*\.hbo-metrics/.test(hostHtml));
});

test('openSettlePlayerModal gated when recording off', function() {
  var fn = hostHtml.split('async function openSettlePlayerModal')[1].slice(0, 400);
  assert(fn.indexOf('_hostSettlementRecordingEnabled()') !== -1);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
