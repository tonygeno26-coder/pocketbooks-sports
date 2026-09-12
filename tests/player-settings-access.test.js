'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const player = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');
const host = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const registry = fs.readFileSync(path.join(__dirname, '..', 'sport-registry.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (error) { process.exitCode = 1; console.error('  ❌ ' + name + '\n     ' + error.message); }
}

test('Host and player load one canonical sportsbook registry', function() {
  assert(host.includes('<script src="sport-registry.js"></script>'));
  assert(player.includes('<script src="sport-registry.js"></script>'));
  [
    'nfl','mlb','nba','nhl','ncaaf','ncaab','soccer',
    'tennis','golf','boxing','mma','nascar','rugby'
  ].forEach(id => assert(registry.includes("id:'" + id + "'"), id));
});

test('player access hydrates from the safe dashboard response only', function() {
  assert(player.includes('_applyPlayerBettingAccess(data.bettingAccess'));
  assert(player.includes('var _playerDisabledSports = Object.create(null)'));
  const start = player.indexOf('function getMyHostSportsAccess');
  const end = player.indexOf('function getPlayerLimitsClient', start);
  const access = player.slice(start, end);
  assert(!access.includes('localStorage'));
  assert(!player.includes('data.hostNotes'));
});

test('disabled tabs remain visible, disabled, and inaccessible', function() {
  const start = player.indexOf('function _updateSportTabs');
  const end = player.indexOf('async function _loadSportsCatalog', start);
  const tabs = player.slice(start, end);
  assert(tabs.includes("tab.style.display = ''"));
  assert(tabs.includes('tab.disabled = blocked'));
  assert(tabs.includes("tab.setAttribute('aria-disabled'"));
  assert(player.includes("if (!_sa.allowed)"));
});

test('normal slip add and stale placement checks use current server access', function() {
  assert(player.includes('var _saCheck = _checkPlayerSportAccess(sp)'));
  assert(player.includes('var _sportCheck = _checkTicketSportAccess(snap.legs || [])'));
});

if (!process.exitCode) console.log('✅ ' + passed + ' player settings/access UI tests passed');
