'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ops = fs.readFileSync(path.join(__dirname, '..', 'host-beta-ops.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (error) {
    console.error('  ❌ ' + name + '\n     ' + error.message);
    process.exitCode = 1;
  }
}

console.log('\n── Host username identity standard ──');

test('identity helper: username primary, Player #id secondary', function () {
  assert(html.includes('function _identityParts'));
  assert(html.includes("Player #'"));
  assert(html.includes('window._identityParts = _identityParts'));
  assert(!html.includes("displayName = id ? String(id).slice(0, 8)"),
    'must not truncate raw id as primary label');
});

test('approval modal shows Starting Betting Balance and clears silent 1000', function () {
  const start = html.indexOf('id="modal-approve-player"');
  const end = html.indexOf('<!-- ADD PLAYER MODAL -->', start);
  const modal = html.slice(start, end);
  assert(modal.includes('Starting Betting Balance'));
  assert(!/value="1000"/.test(modal));
  const openStart = html.indexOf('async function openApprovePlayerModal');
  const openEnd = html.indexOf('function closeApprovePlayerModal', openStart);
  const open = html.slice(openStart, openEnd);
  assert(open.includes("bal.value = ''") || open.includes('bal.value = ""'));
});

test('Host Players and join requests use identity.primary', function () {
  assert(html.includes('var displayName = identity.primary'));
  assert(html.includes("function requestRow(r)"));
  assert(html.includes('identity.primary'));
});

test('Host Bets accordion prefers username via _identityParts', function () {
  assert(html.includes('var primaryName = identity.primary'));
  assert(html.includes('g.username || g.playerUsername'));
});

test('Beta Ops requests/testers/feedback show username primary', function () {
  assert(ops.includes('_identityParts') || ops.includes('global._identityParts'));
  assert(ops.includes('identity.primary') || ops.includes('it.username || it.playerLabel'));
  assert(ops.includes('Player #'));
  assert(!/Player\s*"\s*\+\s*p\.playerId/.test(ops));
});

if (!process.exitCode) {
  console.log('✅ ' + passed + ' host username identity tests passed');
}
