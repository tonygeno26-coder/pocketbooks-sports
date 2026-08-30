'use strict';

const fs = require('fs');
const path = require('path');

let _pass = 0;
let _fail = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  OK ' + name);
    _pass++;
  } catch (e) {
    console.error('  FAIL ' + name + '\n     ' + e.message);
    _fail++;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'expected true');
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'values differ') +
      ' - got ' + JSON.stringify(actual) + ' expected ' + JSON.stringify(expected));
  }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');

function _isoDateFromValue(v) {
  if (v == null || v === '') return '';
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var ms = new Date(s).getTime();
  if (!isNaN(ms)) return new Date(ms).toISOString().slice(0, 10);
  return '';
}
function _owlsSportKey(sport) {
  var s = String(sport || 'mlb').toLowerCase();
  var map = { mlb:'baseball_mlb', nba:'basketball_nba', nfl:'americanfootball_nfl', nhl:'icehockey_nhl', wnba:'basketball_wnba' };
  if (map[s]) return map[s];
  if (s.indexOf('baseball') === 0) return 'baseball_mlb';
  return s;
}
function _titleCaseTeamName(name) {
  return String(name || '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}
function _extractSlipPointLine(pick, line) {
  if (line != null && line !== '') {
    var n = Number(line);
    if (Number.isFinite(n)) return n;
  }
  var m = String(pick || '').match(/(?:^|\s)([+-]?\d+(?:\.\d+)?)(?:\s|$)/);
  return m ? Number(m[1]) : null;
}
function _normalizeGameKeyToOwls(existingKey, away, home, sport, isoTime) {
  var dateStr = _isoDateFromValue(isoTime);
  var parts = String(existingKey || '').split('|');
  var sportPart = _owlsSportKey(parts[0] || sport);
  var awayPart = _titleCaseTeamName(parts[1] || away);
  var homePart = _titleCaseTeamName(parts[2] || home);
  var last = parts[parts.length - 1] || '';
  var datePart = /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : dateStr;
  return [sportPart, awayPart, homePart, datePart].join('|');
}

function _isoScheduledStart(v, dateHint, allowDisplay) {
  if (v == null || v === '') return null;
  var s = String(v).trim();
  if (!s || /^tbd$/i.test(s)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    var ms0 = new Date(s).getTime();
    if (!isNaN(ms0)) return new Date(ms0).toISOString();
  }
  var ms = new Date(s).getTime();
  if (!isNaN(ms) && /T\d{2}:/.test(s)) return new Date(ms).toISOString();
  if (!allowDisplay) {
    if (!isNaN(ms) && /^\d{4}/.test(s)) return new Date(ms).toISOString();
    return null;
  }
  var dateStr = _isoDateFromValue(dateHint);
  if (!dateStr && dateHint) {
    var hintParts = String(dateHint).split('|');
    var last = hintParts[hintParts.length - 1] || '';
    if (/^\d{4}-\d{2}-\d{2}/.test(last)) dateStr = last.slice(0, 10);
  }
  var tm = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (tm && dateStr) {
    var hour = parseInt(tm[1], 10);
    var min = parseInt(tm[2], 10);
    var ap = String(tm[3] || '').toUpperCase();
    if (ap === 'PM' && hour !== 12) hour += 12;
    if (ap === 'AM' && hour === 12) hour = 0;
    var hh = (hour < 10 ? '0' : '') + hour;
    var mm = (min < 10 ? '0' : '') + min;
    var builtMs = new Date(dateStr + 'T' + hh + ':' + mm + ':00').getTime();
    if (!isNaN(builtMs)) return new Date(builtMs).toISOString();
  }
  if (!isNaN(ms)) return new Date(ms).toISOString();
  return null;
}
function _stripCellGameId(cellId) {
  var s = String(cellId || '');
  if (!s) return '';
  s = s.replace(/-(sp-aw|sp-hw|ml-aw|ml-hw|ov|un)$/i, '');
  s = s.replace(/-(tot|atot|pp)-.*$/i, '');
  return s;
}
function _lookupCachedGame(cellId, canonicalGameKey, away, home) {
  var cache = (typeof window !== 'undefined' && window.gamesCache) ? window.gamesCache : {};
  var id = String(cellId || '');
  if (id && cache[id]) return cache[id];
  var stripped = _stripCellGameId(id);
  if (stripped && cache[stripped]) return cache[stripped];
  var keys = Object.keys(cache);
  var best = null, bestLen = 0, i, k, g;
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    if (k && id.indexOf(k) === 0 && k.length > bestLen) {
      best = cache[k];
      bestLen = k.length;
    }
  }
  if (best) return best;
  if (canonicalGameKey) {
    for (i = 0; i < keys.length; i++) {
      g = cache[keys[i]];
      if (g && g.canonicalGameKey && g.canonicalGameKey === canonicalGameKey) return g;
    }
  }
  var a = String(away || '').toLowerCase();
  var h = String(home || '').toLowerCase();
  if (a && h) {
    for (i = 0; i < keys.length; i++) {
      g = cache[keys[i]];
      if (!g) continue;
      var ga = String(g.away || g.away_team || '').toLowerCase();
      var gh = String(g.home || g.home_team || '').toLowerCase();
      if (ga === a && gh === h) return g;
    }
  }
  return null;
}
function _resolveScheduledStart(obj, cachedGame) {
  obj = obj || {};
  var dateHint = obj.canonicalGameKey || obj.canonical_game_key
    || (cachedGame && cachedGame.canonicalGameKey) || null;
  var list = [
    obj.scheduledStart, obj.scheduled_start, obj.commenceTime, obj.commence_time,
    obj.time, obj.start,
    cachedGame && cachedGame.scheduledStart,
    cachedGame && cachedGame.scheduled_start,
    cachedGame && cachedGame.time,
    cachedGame && cachedGame.commence_time,
    cachedGame && cachedGame.commenceTime
  ];
  var i, iso;
  for (i = 0; i < list.length; i++) {
    iso = _isoScheduledStart(list[i], dateHint || list[i], false);
    if (iso) return iso;
  }
  for (i = 0; i < list.length; i++) {
    iso = _isoScheduledStart(list[i], dateHint || list[i], true);
    if (iso) return iso;
  }
  return null;
}

console.log('\n-- Place-bet payload alignment --');

const CONTRACT_FIELDS = ['pick','market','odds','line','canonicalGameKey','scheduledStart','gameId'];

test('player.html ships the Owls key + line helpers', function() {
  assert(html.indexOf('function _normalizeGameKeyToOwls') !== -1);
  assert(html.indexOf('function _extractSlipPointLine') !== -1);
  assert(html.indexOf('function _buildContractPlaceLeg') !== -1);
  assert(html.indexOf('var canonicalGameKey = _normalizeGameKeyToOwls(') !== -1);
});

test('player.html stamps ISO scheduledStart onto every POST leg', function() {
  assert(html.indexOf('function _resolveScheduledStart') !== -1);
  assert(html.indexOf('function _lookupCachedGame') !== -1);
  assert(html.indexOf('scheduledStart:_c.scheduledStart') !== -1 || html.indexOf('scheduledStart: iso') !== -1
    || html.indexOf('scheduledStart:iso') !== -1,
    'POST legs must include scheduledStart from the contract builder');
  assert(html.indexOf('function _buildContractPlaceLeg') !== -1);
  assert(html.indexOf('data-start=') !== -1);
  assert(html.indexOf("id.split('-').slice(0,4)") === -1,
    'must not look up gamesCache with cellId.split(-).slice(0,4)');
});

test('confirmBet / _makeSelection / click / bsToggle emit all contract fields', function() {
  CONTRACT_FIELDS.forEach(function(f) {
    assert(html.indexOf(f) !== -1, 'player.html missing contract field ' + f);
  });
  assert(html.indexOf('gameId:_c.gameId') !== -1 || html.indexOf('gameId: _c.gameId') !== -1,
    'POST mapper must send gameId from the contract builder');
  assert(html.indexOf('function _resolveGameId') !== -1);
  assert(html.indexOf('data-game-id=') !== -1);
  assert(html.indexOf('_buildContractPlaceLeg(leg)') !== -1,
    'confirmBet POST must go through _buildContractPlaceLeg');
  assert(html.indexOf('_buildContractPlaceLeg(b)') !== -1,
    '_makeSelection must go through _buildContractPlaceLeg');
  assert(html.indexOf('_buildContractPlaceLeg(Object.assign({}, sel') !== -1,
    'bsToggle must stamp contract fields via _buildContractPlaceLeg');
});

test('market normalizer emits lowercase moneyline/total/spread', function() {
  assert(html.indexOf("return 'moneyline'") !== -1);
  assert(html.indexOf("return 'total'") !== -1);
  assert(html.indexOf("return 'spread'") !== -1);
  assert(html.indexOf("return 'Moneyline'") === -1,
    'must not send title-case Moneyline');
});

test('hyphenated MLB key becomes Owls snapshot key', function() {
  assertEq(
    _normalizeGameKeyToOwls('MLB|colorado-rockies|atlanta-braves|', 'Colorado Rockies', 'Atlanta Braves', 'MLB', '2026-08-30T17:35:00Z'),
    'baseball_mlb|Colorado Rockies|Atlanta Braves|2026-08-30'
  );
});

test('empty-date Owls key is stamped from scheduledStart', function() {
  assertEq(
    _normalizeGameKeyToOwls('baseball_mlb|Miami Marlins|Washington Nationals|', '', '', 'mlb', '2026-08-30T16:15:00Z'),
    'baseball_mlb|Miami Marlins|Washington Nationals|2026-08-30'
  );
});

test('already-correct Owls key is preserved', function() {
  const k = 'baseball_mlb|Boston Red Sox|New York Yankees|2026-08-30';
  assertEq(_normalizeGameKeyToOwls(k, '', '', 'mlb', '2026-08-30T17:35:00Z'), k);
});

test('totals pick yields a numeric line; moneyline does not', function() {
  assertEq(_extractSlipPointLine('Over 9', null), 9);
  assertEq(_extractSlipPointLine('Over 8', null), 8);
  assertEq(_extractSlipPointLine('Colorado Rockies', null), null);
  assertEq(_extractSlipPointLine('Colorado Rockies To Win', null), null);
});

function _normalizeSlipMarket(market) {
  var m = String(market || '').trim().toLowerCase();
  if (!m) return 'moneyline';
  if (m === 'to win' || m === 'win' || m === 'h2h' || m.indexOf('moneyline') >= 0) return 'moneyline';
  if (m.indexOf('total') >= 0 || m === 'over' || m === 'under') return 'total';
  if (m.indexOf('spread') >= 0 || m.indexOf('run line') >= 0 || m.indexOf('puck line') >= 0
      || m.indexOf('runline') >= 0 || m.indexOf('handicap') >= 0) return 'spread';
  return m;
}

test('lobby labels collapse to contract markets', function() {
  assertEq(_normalizeSlipMarket('Moneyline'), 'moneyline');
  assertEq(_normalizeSlipMarket('To Win'), 'moneyline');
  assertEq(_normalizeSlipMarket('Total'), 'total');
  assertEq(_normalizeSlipMarket('Run Line'), 'spread');
});

test('contract moneyline payload has the seven fields and no To Win', function() {
  var pick = 'Boston Red Sox To Win'.replace(/\s+to\s+win\s*$/i, '').trim();
  var leg = {
    pick: pick,
    market: _normalizeSlipMarket('Moneyline'),
    odds: -119,
    line: null,
    canonicalGameKey: _normalizeGameKeyToOwls(
      'mlb|Boston Red Sox|New York Yankees|', 'Boston Red Sox', 'New York Yankees', 'mlb',
      '2026-08-30T17:35:00Z'
    ),
    scheduledStart: _isoScheduledStart('2026-08-30T17:35:00Z'),
    gameId: '1634659875'
  };
  CONTRACT_FIELDS.forEach(function(f) {
    assert(Object.prototype.hasOwnProperty.call(leg, f), 'missing ' + f);
  });
  assertEq(leg.pick, 'Boston Red Sox');
  assertEq(leg.market, 'moneyline');
  assertEq(leg.line, null);
  assertEq(leg.canonicalGameKey, 'baseball_mlb|Boston Red Sox|New York Yankees|2026-08-30');
  assert(leg.scheduledStart.indexOf('2026-08-30T17:35:00') === 0);
  assertEq(leg.gameId, '1634659875');
});

test('contract totals payload uses Over N + numeric line', function() {
  var pick = 'Over 9';
  var leg = {
    pick: pick,
    market: _normalizeSlipMarket('Total'),
    odds: -110,
    line: _extractSlipPointLine(pick, null),
    canonicalGameKey: _normalizeGameKeyToOwls(
      'baseball_mlb|Boston Red Sox|New York Yankees|2026-08-30', '', '', 'mlb',
      '2026-08-30T17:35:00Z'
    ),
    scheduledStart: '2026-08-30T17:35:00Z',
    gameId: '1634659875'
  };
  assertEq(leg.market, 'total');
  assertEq(leg.line, 9);
  assertEq(leg.pick, 'Over 9');
});

test('unhyphenated Owls cell id strips market suffix', function() {
  assertEq(_stripCellGameId('abc123def456-ml-aw'), 'abc123def456');
  assertEq(_stripCellGameId('abc123def456-sp-hw'), 'abc123def456');
  assertEq(_stripCellGameId('abc123def456-ov'), 'abc123def456');
});

test('ISO scheduledStart passes through', function() {
  assertEq(_isoScheduledStart('2026-08-30T17:35:00Z'), '2026-08-30T17:35:00.000Z');
});

test('display time converts when game-key date is present', function() {
  var iso = _isoScheduledStart('Sun 7:10 PM', 'baseball_mlb|Miami Marlins|Washington Nationals|2026-08-30', true);
  assert(iso && !isNaN(new Date(iso).getTime()), 'must produce parseable ISO');
  assert(iso.indexOf('2026-08-3') === 0,
    'must keep the hinted calendar date, got ' + iso);
});

test('cache fills scheduledStart when slip field is empty', function() {
  global.window = { gamesCache: {
    abc123def456: {
      id: 'abc123def456',
      away: 'Miami Marlins',
      home: 'Washington Nationals',
      time: '2026-08-30T16:15:00Z',
      scheduledStart: '2026-08-30T16:15:00Z',
      canonicalGameKey: 'baseball_mlb|Miami Marlins|Washington Nationals|2026-08-30'
    }
  } };
  var game = _lookupCachedGame('abc123def456-ml-aw', '', 'Miami Marlins', 'Washington Nationals');
  assert(game && game.id === 'abc123def456', 'must find cache by prefix, not slice(0,4)');
  var iso = _resolveScheduledStart({ scheduledStart: null, time: 'Sun 7:10 PM' }, game);
  assertEq(iso, '2026-08-30T16:15:00.000Z');
  delete global.window;
});

console.log('\nPlace-bet payload tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) process.exit(1);
