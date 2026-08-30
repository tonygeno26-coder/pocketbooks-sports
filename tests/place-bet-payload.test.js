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

console.log('\n-- Place-bet payload alignment --');

test('player.html ships the Owls key + line helpers', function() {
  assert(html.indexOf('function _normalizeGameKeyToOwls') !== -1);
  assert(html.indexOf('function _extractSlipPointLine') !== -1);
  assert(html.indexOf('line:_extractSlipPointLine(leg.pick, leg.line)') !== -1);
  assert(html.indexOf('canonicalGameKey:_normalizeGameKeyToOwls(') !== -1);
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

console.log('\nPlace-bet payload tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) process.exit(1);
