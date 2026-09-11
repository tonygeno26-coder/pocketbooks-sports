'use strict';

var fs = require('fs');
var path = require('path');

var pass = 0;
var fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  OK ' + name);
    pass++;
  } catch (e) {
    console.error('  FAIL ' + name + '\n     ' + e.message);
    fail++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'expected true');
}

var root = path.join(__dirname, '..');
var lobby = fs.readFileSync(path.join(root, 'lobby.html'), 'utf8');
var player = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
var host = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var BETA = 'd616dc2a-95a6-473a-97b1-7da330878479';

console.log('\n-- open player beta lobby --');

test('lobby copy and single beta club', function() {
  assert(lobby.indexOf('Join the PocketBooks beta club to start playing.') !== -1);
  assert(lobby.indexOf('Club creation is coming later.') !== -1);
  assert(lobby.indexOf("const PB_BETA_CLUB_ID = '" + BETA + "'") !== -1);
  assert(lobby.indexOf("apiCall('GET', '/api/player-beta')") !== -1);
  assert(lobby.indexOf("apiCall('GET', '/api/clubs')") === -1, 'lobby must not enumerate clubs');
  assert(lobby.indexOf(BETA) !== -1);
  assert(lobby.indexOf('id="beta-club-card"') !== -1);
});

test('create club UI is hidden and does not demo-create', function() {
  assert(lobby.indexOf('function openModal(id)') !== -1);
  assert(lobby.indexOf("if (id === 'modal-create')") !== -1);
  assert(lobby.indexOf('async function createClub()') !== -1);
  var createFn = lobby.slice(lobby.indexOf('async function createClub()'), lobby.indexOf('async function createClub()') + 220);
  assert(createFn.indexOf('Club creation is coming later.') !== -1);
  assert(createFn.indexOf('Date.now()') === -1, 'createClub must not mint a local club');
  assert(createFn.indexOf("POST', '/api/clubs'") === -1);
  assert(host.indexOf('id="create-club-btn"') !== -1);
  assert(host.indexOf('display:none') !== -1);
  var hostCreate = host.slice(host.indexOf('async function createClub()'), host.indexOf('async function createClub()') + 180);
  assert(hostCreate.indexOf('Club creation is coming later.') !== -1);
  assert(hostCreate.indexOf('demoClub') === -1);
});

test('join uses the server and does not invent a balance', function() {
  assert(lobby.indexOf("apiCall('POST', '/api/club/join-request'") !== -1);
  assert(lobby.indexOf('Request pending') !== -1);
  assert(lobby.indexOf('Request access') !== -1);
  assert(lobby.indexOf("pb-balance-start") === -1, 'lobby must not seed a starting balance');
  assert(lobby.indexOf('balance:1000') === -1);
  assert(lobby.indexOf('2,450') === -1);
});

test('player direct URL without club session returns to lobby', function() {
  assert(player.indexOf("reason:'no_club_membership'") !== -1);
  assert(player.indexOf("window.location.replace('lobby.html')") !== -1);
  assert(player.indexOf('Membership is a club-scoped token, not a localStorage club record.') !== -1);
});

test('host dashboard denies sessions that are not club-scoped host tokens', function() {
  assert(host.indexOf('Host dashboard requires a club-scoped host token.') !== -1);
  assert(host.indexOf("location.replace('lobby.html')") !== -1);
  assert(host.indexOf("location.replace('survivor.html')") === -1);
});

test('active member route is the player dashboard', function() {
  assert(lobby.indexOf("var dest = isHostRole(canonicalRole) ? 'index.html' : 'player.html'") !== -1);
  assert(lobby.indexOf('unknown_status') !== -1);
  assert(player.indexOf('location.replace(\'survivor.html\')') === -1,
    'player dashboard must not auto-redirect beta players to Survivor');
  assert(player.indexOf('Player beta sportsbook sessions stay on player.html') !== -1,
    'player dashboard should document the beta sportsbook default');
});

test('mobile lobby card stays within 390 and 430', function() {
  assert(lobby.indexOf('@media (max-width:430px)') !== -1);
  assert(lobby.indexOf('@media (max-width:390px)') !== -1);
  assert(lobby.indexOf('.beta-join{min-height:44px') !== -1);
  assert(lobby.indexOf('max-width:430px') !== -1);
});

console.log('\nOpen player beta lobby tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
