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

var html = fs.readFileSync(path.join(__dirname, '..', 'lobby.html'), 'utf8');

console.log('\n-- Lobby role routing hardening --');

test('club token acquisition returns canonical role, status, club id, and token', function() {
  assert(html.indexOf('return { ok:true, token:data.token, role:data.role, status:data.status') !== -1,
    'token acquisition must return canonical role/status/token');
  assert(html.indexOf('club_id:data.club_id || data.clubId || clubId') !== -1,
    'token acquisition must return canonical club id');
});

test('routing derives destination from backend role after token success', function() {
  assert(html.indexOf('var canonicalRole = result.role ||') !== -1,
    'missing canonical role route decision');
  assert(html.indexOf("var dest = isHostRole(canonicalRole) ? 'index.html' : 'player.html'") !== -1,
    'destination must be derived from canonical backend role');
  assert(html.indexOf('window.location.href = dest +') !== -1,
    'navigation should use canonical destination');
});

test('token failure blocks navigation', function() {
  assert(html.indexOf('TOKEN_WRITE_FAILED — navigation blocked') !== -1,
    'token failure should explicitly block navigation');
  assert(html.indexOf('window.location.href = _dest +') === -1,
    'stale pre-token destination navigation should be removed');
});

test('host cards do not render sportsbook entry', function() {
  assert(html.indexOf('They cannot bet in their own hosted club') !== -1,
    'missing host betting product-rule comment');
  assert(html.indexOf("selectClub('${c.id}','player')\" style=\"padding:7px 12px") === -1,
    'host dual-button sportsbook entry still present');
});

test('selected club storage is synchronized', function() {
  assert(html.indexOf('function syncSelectedClubStorage(club)') !== -1,
    'missing synchronized storage helper');
  assert(html.indexOf("localStorage.setItem('pb-active-club', JSON.stringify(club))") !== -1,
    'missing pb-active-club write');
  assert(html.indexOf("localStorage.setItem('pb-club', JSON.stringify(club))") !== -1,
    'missing pb-club write');
});

test('non-active statuses fail closed before navigation', function() {
  ['pending', 'rejected', 'suspended', 'inactive', 'unknown_status'].forEach(function(marker) {
    assert(html.indexOf(marker) !== -1, 'missing status handling marker: '+marker);
  });
});

console.log('\nLobby role routing tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
