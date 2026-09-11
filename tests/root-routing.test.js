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
var vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
var lobby = fs.readFileSync(path.join(root, 'lobby.html'), 'utf8');
var host = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

console.log('\n-- public root routing --');

test('slash redirects to lobby before the host file can win', function() {
  var redirects = vercel.redirects || [];
  var rootRedirect = redirects.find(function(r) { return r.source === '/'; });
  assert(rootRedirect, 'vercel.json must redirect /');
  assert(rootRedirect.destination.indexOf('/lobby.html') === 0, 'public root must land on lobby');
  assert(rootRedirect.permanent === false, 'root redirect must not be a permanent cache of the host dashboard');
});

test('/host is the host shell and stays authorization gated', function() {
  var rewrites = vercel.rewrites || [];
  var hostRewrite = rewrites.find(function(r) { return r.source === '/host'; });
  assert(hostRewrite && hostRewrite.destination === '/index.html', '/host must serve the host shell');
  assert(host.indexOf('Host dashboard requires a club-scoped host token.') !== -1,
    'host shell must reject unauthenticated and non-host sessions');
  assert(host.indexOf("location.replace('lobby.html')") !== -1,
    'non-host /host visitors must return to lobby');
});

test('root landing sends active players to the player experience, not the host dashboard', function() {
  assert(lobby.indexOf('function _maybeEnterPlayerFromRoot()') !== -1);
  assert(lobby.indexOf("enterActiveClub('player')") !== -1,
    'active players from / enter the player experience');
  var fn = lobby.slice(lobby.indexOf('function _maybeEnterPlayerFromRoot()'), lobby.indexOf('function paintBetaCard'));
  assert(fn.indexOf('isHostRole') !== -1, 'hosts must not be auto-opened from public root');
  assert(fn.indexOf("enterActiveClub('host')") === -1, 'root must not open the host dashboard');
  assert(fn.indexOf("_membershipActive(_betaMembership)") !== -1, 'only confirmed active members auto-enter');
  assert(fn.indexOf("fromParam === 'player'") !== -1, 'player back-links stay on the lobby');
});

test('pending and signed-out visitors remain on the lobby', function() {
  assert(lobby.indexOf('Request pending') !== -1);
  assert(lobby.indexOf('function checkAuthGate()') !== -1);
  assert(lobby.indexOf("_setAuthScreenVisible(!isAuthed)") !== -1 ||
    lobby.indexOf('_setAuthScreenVisible(!isAuthed)') !== -1);
});

console.log('\nRoot routing tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
