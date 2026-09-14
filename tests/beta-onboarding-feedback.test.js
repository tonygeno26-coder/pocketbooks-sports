'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

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

function assertIncludes(src, needle, label) {
  assert(src.indexOf(needle) !== -1, (label || needle) + ' missing');
}

var root = path.join(__dirname, '..');
var lobby = fs.readFileSync(path.join(root, 'lobby.html'), 'utf8');
var player = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
var host = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var survivor = fs.readFileSync(path.join(root, 'survivor.html'), 'utf8');
var uxSrc = fs.readFileSync(path.join(root, 'pb-beta-ux.js'), 'utf8');

console.log('\n-- beta onboarding + feedback UX --');

test('pb-beta-ux.js loaded on player and lobby', function () {
  assertIncludes(player, 'pb-beta-ux.js', 'player script');
  assertIncludes(lobby, 'pb-beta-ux.js', 'lobby script');
  assertIncludes(player, 'PbBetaUx.initPlayerOnboarding', 'onboarding boot');
  assertIncludes(uxSrc, 'pb-onboard-tip', 'onboarding tip id');
  assertIncludes(uxSrc, 'Quick start', 'onboarding copy');
});

test('pending membership guidance on lobby', function () {
  assertIncludes(lobby, 'beta-pending-guide', 'pending guide');
  assertIncludes(lobby, 'Check status', 'refresh CTA');
  assertIncludes(lobby, 'Waiting for host', 'pending button copy');
  assertIncludes(lobby, 'openModal(\'modal-pending\')', 'pending modal after join');
});

test('feedback entry in settings', function () {
  assertIncludes(player, 'id="ps-feedback"', 'player feedback btn');
  assertIncludes(lobby, 'id="ps-feedback"', 'lobby feedback btn');
  assertIncludes(player, 'Send Feedback', 'player label');
  assertIncludes(lobby, 'Send Feedback', 'lobby label');
});

test('report bet issue hooks', function () {
  assertIncludes(player, 'data-report-bet', 'report attr');
  assertIncludes(player, 'Report issue', 'menu label');
  assertIncludes(player, 'Report a bet issue', 'details/results CTA');
  assertIncludes(player, 'openReportBetIssue', 'handler');
});

test('empty states polished', function () {
  assertIncludes(player, 'No recent bets', 'recent empty');
  assertIncludes(player, 'No results yet', 'results empty');
  assertIncludes(player, 'You’re all caught up', 'notif empty');
  assertIncludes(player, 'No props for this game yet', 'props empty');
  assertIncludes(player, 'No events available', 'sportsbook empty');
  assertIncludes(host, 'Graded tickets from the last week will show here.', 'host settled empty');
  assertIncludes(survivor, 'You’re not in any pools yet', 'survivor empty');
  assertIncludes(survivor, 'No picks this week yet', 'survivor picks empty');
});

test('error recovery copy helpers present', function () {
  assertIncludes(player, 'Session expired', 'session title');
  assertIncludes(player, 'Sign in again from the lobby', 'session body');
  assertIncludes(player, 'mapBetRejectMessage', 'reject mapper');
  assertIncludes(uxSrc, 'membership_pending', 'pending error');
  assertIncludes(uxSrc, 'results_unavailable', 'results error');
  assertIncludes(uxSrc, 'stale_odds', 'stale odds');
});

test('safe context strips secrets', function () {
  var store = {};
  var sandbox = {
    window: {},
    globalThis: {},
    document: { title: 'Player', createElement: function () { return { style: {}, setAttribute: function () {}, addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, appendChild: function () {}, remove: function () {}, children: [] }; }, head: { appendChild: function () {} }, body: {}, documentElement: {}, getElementById: function () { return null; }, readyState: 'complete', addEventListener: function () {} },
    localStorage: {
      getItem: function (k) { return store[k] || null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    location: { pathname: '/player.html' },
    navigator: { userAgent: 'test-agent' },
    console: console,
    Date: Date,
    Object: Object,
    Array: Array,
    String: String,
    Math: Math,
    JSON: JSON,
    setTimeout: function (fn) { return fn(); }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(uxSrc, sandbox);
  var PbBetaUx = sandbox.PbBetaUx || sandbox.window.PbBetaUx;
  assert(PbBetaUx, 'PbBetaUx exported');
  var dirty = PbBetaUx.sanitizeContext({
    path: 'player.html',
    token: 'SECRET_JWT',
    jwt: 'x.y.z',
    password: 'pw',
    clubId: 'club-1',
    ticketId: 'T_abc'
  });
  assert(dirty.token == null, 'token stripped');
  assert(dirty.jwt == null, 'jwt stripped');
  assert(dirty.password == null, 'password stripped');
  assert(dirty.clubId === 'club-1', 'club kept');
  assert(dirty.ticketId === 'T_abc', 'ticket kept');
  assert(PbBetaUx.mapBetRejectMessage('insufficient_balance').indexOf('balance') !== -1, 'reject map');
  assert(PbBetaUx.API_CONTRACT && PbBetaUx.API_CONTRACT.path === '/api/feedback', 'api contract');
});

test('mobile/desktop tip CSS present', function () {
  assertIncludes(uxSrc, '@media (min-width:768px)', 'tablet tip');
  assertIncludes(uxSrc, '@media (min-width:1100px)', 'desktop tip');
  assertIncludes(lobby, 'beta-pending-actions', 'pending actions layout');
});

test('no financial/auth mutation hooks added', function () {
  assert(uxSrc.indexOf('/api/bets') === -1, 'no bet API');
  assert(uxSrc.indexOf('confirmBet') === -1, 'no confirmBet');
  assert(uxSrc.indexOf('pb-sports-token') !== -1, 'mentions token only to strip');
  assert(uxSrc.indexOf('localStorage.setItem(\'pb-sports-token\'') === -1, 'never writes token');
  assert(uxSrc.indexOf('fetch(') === -1, 'no network from helper');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
