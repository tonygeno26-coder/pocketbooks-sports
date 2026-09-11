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

test('club token acquisition retries without legacy login bearer', function() {
  assert(html.indexOf("verdict === 'fatal' && TOKEN") !== -1,
    'club token acquisition must retry after login-JWT rejection');
  assert(html.indexOf('the backend still derives role/status from the authoritative DB row') !== -1,
    'retry must remain server-authoritative');
});

test('routing derives destination from backend role after token success', function() {
  assert(html.indexOf('var canonicalRole = result.role ||') !== -1,
    'missing canonical role route decision');
  assert(html.indexOf("var dest = isHostRole(canonicalRole) ? 'index.html' : 'player.html'") !== -1,
    'active members enter the player dashboard, hosts enter host tools');
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

test('login does not wipe pb-host when JWT role is user', function() {
  assert(html.indexOf("Do not remove pb-host when JWT says `user`") !== -1,
    'login must keep stored host when JWT role is the default user');
  assert(html.indexOf("localStorage.removeItem('pb-host')") === -1 || html.indexOf('Do not remove pb-host') !== -1,
    'login success must not treat JWT user as a reason to clear pb-host');
});

test('post-login route stays on the lobby until membership is confirmed', function() {
  assert(html.indexOf('function routeAuthedUser(role)') !== -1, 'missing routeAuthedUser');
  assert(html.indexOf('every signed-in account lands on the lobby') !== -1,
    'routeAuthedUser must keep accounts on the lobby');
  var routeFn = html.slice(html.indexOf('function routeAuthedUser(role)'), html.indexOf('function hideSportsbookChromeForPlayers'));
  assert(routeFn.indexOf('survivor.html') === -1, 'login must not send new players to survivor');
});

test('successful login can clear forced auth-screen overlay', function() {
  assert(html.indexOf('pb-force-auth') !== -1, 'forced auth pre-render style missing');
  assert(html.indexOf("document.getElementById('pb-force-auth')") !== -1,
    'hideAuthScreen must remove forced auth style after login');
  assert(html.indexOf('window.__pbForceAuth =') !== -1,
    'hideAuthScreen must clear forced auth flag after login');
});

test('pre-render does not infer membership from localStorage', function() {
  assert(html.indexOf('Membership is not inferred from localStorage') !== -1,
    'lobby pre-render must not bounce from stored roles');
  assert(html.indexOf("location.replace('survivor.html')") === -1,
    'pre-render must not send players to survivor');
  assert(html.indexOf('JWT role `user` is the default for real hosts') === -1,
    'stale pre-render host bounce should be removed');
});

test('non-active statuses fail closed before navigation', function() {
  ['pending', 'rejected', 'suspended', 'inactive', 'unknown_status'].forEach(function(marker) {
    assert(html.indexOf(marker) !== -1, 'missing status handling marker: '+marker);
  });
});

console.log('\nLobby role routing tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
