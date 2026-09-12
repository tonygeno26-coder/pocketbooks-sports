/**
 * TASK C — Navigation + state persistence (UI prefs only)
 * Run: node tests/nav-persistence.test.js
 *
 * Proves safe nav prefs are wired for Back/refresh, and financial
 * authoritative state is NOT persisted by the nav layer.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'expected true'); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'assertEq') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}

const root = path.join(__dirname, '..');
const playerSrc = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
const hostSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  var m = re.exec(src);
  if (!m) throw new Error('function ' + name + ' not found');
  var start = m.index;
  var i = src.indexOf('{', start);
  var depth = 0;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces for ' + name);
}

function extractNavHelpers(src) {
  var start = src.indexOf('// ══ NAV PERSISTENCE');
  if (start < 0) throw new Error('NAV PERSISTENCE block missing');
  var end = src.indexOf('var _pbLiveOddsStatus', start);
  if (end < 0) end = src.indexOf('function _pbIsSportsbookVisible', start);
  if (end < 0) throw new Error('could not bound nav helpers');
  return src.slice(start, end);
}

console.log('\n-- Nav persistence: static wiring --');

test('player has nav persistence helpers + session key', function() {
  assert(playerSrc.includes('// ══ NAV PERSISTENCE'), 'missing NAV PERSISTENCE marker');
  assert(playerSrc.includes("var _PB_NAV_SS_KEY = 'pb-nav-ui'"), 'missing pb-nav-ui key');
  assert(playerSrc.includes('function _pbNavSyncUrl'), 'missing _pbNavSyncUrl');
  assert(playerSrc.includes('function _pbNavResolveBoot'), 'missing _pbNavResolveBoot');
  assert(playerSrc.includes("window.addEventListener('popstate'"), 'missing player popstate');
});

test('setSport / setBNav / setMarketFilter / props / my bets sync nav', function() {
  var setSport = extractFn(playerSrc, 'setSport');
  var setBNav = extractFn(playerSrc, 'setBNav');
  var setMarket = extractFn(playerSrc, 'setMarketFilter');
  var setPropTab = extractFn(playerSrc, '_pbSetPropTab');
  var setPropTeam = extractFn(playerSrc, '_pbSetPropTeamFilter');
  var myBetsApply = extractFn(playerSrc, '_myBetsApply');
  var toggleProps = extractFn(playerSrc, '_pbToggleGameProps');
  var openProps = extractFn(playerSrc, '_pbOpenDedicatedProps');
  var closeProps = extractFn(playerSrc, '_pbCloseDedicatedProps');
  assert(setSport.includes('_pbNavSyncUrl'), 'setSport must sync nav');
  assert(setBNav.includes('_pbNavSyncUrl'), 'setBNav must sync nav');
  assert(setMarket.includes('_pbNavSyncUrl'), 'setMarketFilter must sync nav');
  assert(setPropTab.includes('_pbNavSyncUrl'), 'prop tab must sync nav');
  assert(setPropTeam.includes('_pbNavSyncUrl'), 'prop team must sync nav');
  assert(myBetsApply.includes('_pbNavSyncUrl'), 'my bets filter must sync nav');
  assert(
    openProps.includes('_pbNavSyncUrl') && closeProps.includes('_pbNavSyncUrl'),
    'dedicated props open/close must sync nav'
  );
  assert(toggleProps.includes('_pbOpenDedicatedProps'), 'legacy toggle must delegate to dedicated props');
});

test('boot restores nav instead of hardcoding mlb only', function() {
  assert(playerSrc.includes('_pbNavResolveBoot()'), 'boot must call _pbNavResolveBoot');
  assert(playerSrc.includes('_pbNavAfterGamesPaint'), 'games paint must restore event');
  // Legacy forced mlb boot path should no longer be the only path
  assert(!/try \{ _currentSport = 'mlb'; \} catch\(e\) \{ console\.error\('\[PBS init\] set _currentSport failed:/.test(playerSrc),
    'unconditional mlb boot still present');
});

test('host tab persistence wired', function() {
  assert(hostSrc.includes("var _PB_HOST_NAV_SS = 'pb-nav-host-tab'"), 'missing host ss key');
  assert(hostSrc.includes('function _hostNavSync'), 'missing _hostNavSync');
  assert(hostSrc.includes('function _hostNavResolveBoot'), 'missing host boot resolve');
  var setBN = extractFn(hostSrc, 'setBN');
  assert(setBN.includes('_hostNavSync'), 'setBN must sync host tab');
  assert(hostSrc.includes('_hostNavResolveBoot()'), 'DOMContentLoaded must restore host tab');
  assert(hostSrc.includes("window.addEventListener('popstate'"), 'missing host popstate');
});

test('nav layer documents financial deny-list and does not write financial LS keys', function() {
  var helpers = extractNavHelpers(playerSrc);
  assert(helpers.includes('pb-tickets') && helpers.includes('delete cur'),
    'helpers must deny pb-tickets');
  assert(helpers.includes('pb-ledger'), 'helpers must deny pb-ledger');
  assert(helpers.includes('pb-balance-start'), 'helpers must deny pb-balance-start');
  // Nav helpers must only write pb-nav-ui via sessionStorage — never financial localStorage
  assert(!/localStorage\.setItem\(\s*['"]pb-tickets['"]/.test(helpers), 'nav must not set pb-tickets');
  assert(!/localStorage\.setItem\(\s*['"]pb-ledger['"]/.test(helpers), 'nav must not set pb-ledger');
  assert(!/localStorage\.setItem\(\s*['"]pb-balance/.test(helpers), 'nav must not set pb-balance*');
  assert(helpers.includes('sessionStorage.setItem(_PB_NAV_SS_KEY'), 'nav writes sessionStorage only');
});

console.log('\n-- Nav persistence: resolve/sync behavior --');

test('URL + sessionStorage resolve preference with URL winning', function() {
  var sessionStore = {};
  var historyStack = [];
  var loc = { pathname: '/player.html', search: '?sport=nba&view=mybets&market=spread&mbStatus=won', hash: '' };
  var sandbox = {
    sessionStorage: {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(sessionStore, k) ? sessionStore[k] : null; },
      setItem: function(k, v) { sessionStore[k] = String(v); },
      removeItem: function(k) { delete sessionStore[k]; }
    },
    localStorage: {
      getItem: function() { return null; },
      setItem: function() { throw new Error('nav must not write localStorage in this unit'); },
      removeItem: function() {}
    },
    history: {
      pushState: function(state, title, url) { historyStack.push({ type:'push', state:state, url:url }); loc.search = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?')) : ''; },
      replaceState: function(state, title, url) { historyStack.push({ type:'replace', state:state, url:url }); loc.search = url.indexOf('?') >= 0 ? url.slice(url.indexOf('?')) : ''; }
    },
    location: loc,
    URLSearchParams: URLSearchParams,
    addEventListener: function() {},
    _pbActiveTab: 'sportsbook',
    _currentSport: 'mlb',
    activeMarketFilter: 'lines',
    _pbExpandedPropsGameId: null,
    _pbPropsUiState: {},
    _myBetsFilter: { q:'', status:'all', range:'week', sort:'newest' },
    console: console
  };
  sandbox.window = sandbox;
  // Seed stale SS that URL should override
  sessionStore['pb-nav-ui'] = JSON.stringify({
    sport: 'nhl', view: 'live', market: 'totals', mbStatus: 'lost',
    // smuggled financial keys must be stripped on write
    balance: 999, tickets: [{ id:1 }], ledger: [{ id:2 }]
  });

  var helpers = extractNavHelpers(playerSrc);
  // Trim trailing incomplete statements if any; execute helper functions only.
  vm.runInNewContext(helpers + '\n;this.__out = { resolve: _pbNavResolveBoot, sync: _pbNavSyncUrl, read: _pbNavReadSs, write: _pbNavWriteSs, key: _PB_NAV_SS_KEY };', sandbox);

  var boot = sandbox.__out.resolve();
  assertEq(boot.sport, 'nba', 'URL sport wins over SS');
  assertEq(boot.view, 'mybets', 'URL view wins');
  assertEq(boot.market, 'spread', 'URL market wins');
  assertEq(boot.mbStatus, 'won', 'URL mbStatus wins');

  // Apply collect/sync from in-memory state
  sandbox._currentSport = 'nba';
  sandbox._pbActiveTab = 'mybets';
  sandbox.activeMarketFilter = 'spread';
  sandbox._myBetsFilter = { q:'', status:'won', range:'month', sort:'oldest' };
  sandbox.__out.sync({ push: false });

  var stored = JSON.parse(sessionStore['pb-nav-ui']);
  assertEq(stored.sport, 'nba', 'SS sport persisted');
  assertEq(stored.view, 'mybets', 'SS view persisted');
  assertEq(stored.mbRange, 'month', 'SS mbRange persisted');
  assert(stored.balance == null, 'financial balance must not persist in pb-nav-ui');
  assert(stored.tickets == null, 'tickets must not persist in pb-nav-ui');
  assert(stored.ledger == null, 'ledger must not persist in pb-nav-ui');
  assert(historyStack.length >= 1 && historyStack[historyStack.length - 1].type === 'replace', 'replaceState used');
  assert(String(historyStack[historyStack.length - 1].url).indexOf('sport=nba') !== -1, 'URL contains sport');
  assert(String(historyStack[historyStack.length - 1].url).indexOf('view=mybets') !== -1, 'URL contains view');
});

test('SS fallback used when URL lacks nav params', function() {
  var sessionStore = {
    'pb-nav-ui': JSON.stringify({ sport:'soccer', view:'live', market:'moneyline', mbRange:'all', mbSort:'win' })
  };
  var loc = { pathname: '/player.html', search: '', hash: '' };
  var sandbox = {
    sessionStorage: {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(sessionStore, k) ? sessionStore[k] : null; },
      setItem: function(k, v) { sessionStore[k] = String(v); }
    },
    localStorage: { getItem: function(){return null;}, setItem: function(){ throw new Error('no ls'); } },
    history: { pushState: function(){}, replaceState: function(){} },
    location: loc,
    URLSearchParams: URLSearchParams,
    addEventListener: function() {},
    _pbActiveTab: 'sportsbook',
    _currentSport: 'mlb',
    activeMarketFilter: 'lines',
    _pbExpandedPropsGameId: null,
    _pbPropsUiState: {},
    _myBetsFilter: { q:'', status:'all', range:'week', sort:'newest' }
  };
  sandbox.window = sandbox;
  var helpers = extractNavHelpers(playerSrc);
  vm.runInNewContext(helpers + '\n;this.__boot = _pbNavResolveBoot();', sandbox);
  assertEq(sandbox.__boot.sport, 'soccer', 'SS sport fallback');
  assertEq(sandbox.__boot.view, 'live', 'SS view fallback');
  assertEq(sandbox.__boot.market, 'moneyline', 'SS market fallback');
  assertEq(sandbox.__boot.mbRange, 'all', 'SS mbRange fallback');
  assertEq(sandbox.__boot.mbSort, 'win', 'SS mbSort fallback');
});

test('p0 phantom ledger gate still present (no financial LS truth reintroduced in nav branch)', function() {
  assert(playerSrc.includes('phantom_ledger_fallback_blocked'),
    'p0 gate missing — do not drop phantom ledger protection');
  var confirmBet = extractFn(playerSrc, 'confirmBet');
  assert(confirmBet.includes('phantom_ledger_fallback_blocked'), 'confirmBet must keep p0 gate');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
