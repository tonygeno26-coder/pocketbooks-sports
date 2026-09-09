'use strict';

var fs = require('fs');
var path = require('path');
var owls = require('../scripts/owls-live-scores');

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

function assertEq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
}

console.log('\n-- Live soccer/tennis matching --');

test('normal soccer exact club keys match', function() {
  var idx = owls.indexOwlsLiveScores([{
    id: 'soccer:Le Mans@Nice-20260905',
    startTime: '2026-09-05T18:00:00.000Z',
    status: { state: 'in', detail: '58\'' },
    home: { team: { displayName: 'Nice' }, score: 2 },
    away: { team: { displayName: 'Le Mans' }, score: 1 }
  }], 'soccer');
  var m = owls.matchScoreToGame({
    home_team: 'Nice',
    away_team: 'Le Mans',
    commence_time: '2026-09-05T18:00:00Z',
    sport: 'soccer'
  }, idx);
  assert(m, 'expected match');
  assertEq(m.homeScore, 2);
});

test('soccer reordered naming via club key (Real Madrid CF vs Real Madrid)', function() {
  var idx = owls.indexOwlsLiveScores([{
    id: 'soccer:Barcelona@Real Madrid-20260905',
    startTime: '2026-09-05T15:00:00.000Z',
    status: { state: 'in', detail: 'Live' },
    home: { team: { displayName: 'Real Madrid CF' }, score: 1 },
    away: { team: { displayName: 'FC Barcelona' }, score: 0 }
  }], 'soccer');
  var m = owls.matchScoreToGame({
    home_team: 'Real Madrid',
    away_team: 'Barcelona',
    commence_time: '2026-09-05T15:00:00Z',
    sport: 'SOCCER'
  }, idx);
  assert(m, 'expected club-key match');
  assertEq(m.awayScore, 0);
  assertEq(m.homeScore, 1);
});

test('soccer swapped home/away orientation remaps scores', function() {
  var idx = owls.indexOwlsLiveScores([{
    id: 'soccer:Gimnasia Mendoza@Boca Juniors-20260905',
    startTime: '2026-09-05T20:00:00.000Z',
    status: { state: 'in' },
    home: { team: { displayName: 'Boca Juniors' }, score: 1 },
    away: { team: { displayName: 'Gimnasia Mendoza' }, score: 0 }
  }], 'soccer');
  var m = owls.matchScoreToGame({
    home_team: 'Gimnasia Mendoza',
    away_team: 'Boca Juniors',
    commence_time: '2026-09-05T20:00:00Z'
  }, idx);
  assert(m && m.orientationSwapped, 'expected swapped remap');
  assertEq(m.homeScore, 0);
  assertEq(m.awayScore, 1);
});

test('tennis name variants match via last-name keys', function() {
  var idx = owls.indexOwlsLiveScores([{
    id: 'tennis:Khachanov K.@Bonzi B.-20260905',
    startTime: '2026-09-05T19:05:00.000Z',
    status: { state: 'in', detail: 'Set 1' },
    home: { team: { displayName: 'Bonzi B.' }, score: 0 },
    away: { team: { displayName: 'Khachanov K.' }, score: 2 },
    tennisDetail: { currentSet: 1, currentGameScore: { home: '0', away: '15' } }
  }], 'tennis');
  var m = owls.matchScoreToGame({
    home_team: 'Benjamin Bonzi',
    away_team: 'Karen Khachanov',
    commence_time: '2026-09-05T19:05:00Z',
    sport: 'tennis'
  }, idx);
  assert(m, 'expected tennis variant match');
  assertEq(m.awayScore, 2);
  assertEq(m.gameScore, '15-0');
});

test('tennis canonicalGameKey exact match', function() {
  var idx = owls.indexOwlsLiveScores([{
    id: 'tennis:Stijn Paardekooper@Lorenzo Comino-20260909',
    startTime: '2026-09-09T07:58:39.000Z',
    status: { state: 'in' },
    home: { team: { displayName: 'Lorenzo Comino' }, score: 1 },
    away: { team: { displayName: 'Stijn Paardekooper' }, score: 0 }
  }], 'tennis');
  var m = owls.matchScoreToGame({
    eventId: 'tennis:Stijn Paardekooper@Lorenzo Comino-20260909',
    canonicalGameKey: 'tennis|Stijn Paardekooper|Lorenzo Comino|2026-09-09',
    home: 'Lorenzo Comino',
    away: 'Stijn Paardekooper',
    scheduledStart: '2026-09-09T07:58:39.000Z'
  }, idx);
  assert(m, 'expected eventId/canonical match');
  assertEq(m.homeScore, 1);
});

test('tennis doubles pair keys when supported', function() {
  var idx = owls.indexOwlsLiveScores([{
    id: 'tennis:A / B@C / D-20260905',
    startTime: '2026-09-05T12:00:00.000Z',
    status: { state: 'in' },
    home: { team: { displayName: 'C / D' }, score: 1 },
    away: { team: { displayName: 'A / B' }, score: 0 }
  }], 'tennis');
  var m = owls.matchScoreToGame({
    home_team: 'D / C',
    away_team: 'B / A',
    commence_time: '2026-09-05T12:00:00Z',
    sport: 'tennis'
  }, idx);
  assert(m, 'expected doubles token match');
});

test('no safe match when ambiguous same-window candidates', function() {
  var idx = owls.indexOwlsLiveScores([
    {
      id: 'soccer:A@B-1',
      startTime: '2026-09-05T18:00:00.000Z',
      status: { state: 'in' },
      home: { team: { displayName: 'Team B' }, score: 1 },
      away: { team: { displayName: 'Team A' }, score: 0 }
    },
    {
      id: 'soccer:A@B-2',
      startTime: '2026-09-05T18:30:00.000Z',
      status: { state: 'in' },
      home: { team: { displayName: 'Team B' }, score: 2 },
      away: { team: { displayName: 'Team A' }, score: 1 }
    }
  ], 'soccer');
  var m = owls.matchScoreToGame({
    home_team: 'Team B',
    away_team: 'Team A',
    commence_time: '2026-09-05T18:00:00Z'
  }, idx);
  assert(!m, 'ambiguous pair must not match');
});

test('no fuzzy substring match for similar soccer names', function() {
  var idx = owls.indexOwlsLiveScores([{
    id: 'soccer:Nice@Le Mans-20260905',
    startTime: '2026-09-05T18:00:00.000Z',
    status: { state: 'in' },
    home: { team: { displayName: 'Nice' }, score: 2 },
    away: { team: { displayName: 'Le Mans' }, score: 1 }
  }], 'soccer');
  assert(!owls.matchScoreToGame({
    home_team: 'Nice United',
    away_team: 'Le Mans',
    commence_time: '2026-09-05T18:00:00Z'
  }, idx), 'substring must not match');
});

test('hydrate stamps _scoreMatchSafe without touching markets', function() {
  var games = [{
    id: '1',
    eventId: 'tennis:A@B-20260905',
    sport: 'tennis',
    home: 'B Player',
    away: 'A Player',
    home_team: 'B Player',
    away_team: 'A Player',
    scheduledStart: '2026-09-05T20:10:00Z',
    status: 'live',
    isLive: true,
    moneyline: [{ team: 'A Player', odds: -110 }]
  }];
  var idx = owls.indexOwlsLiveScores([{
    id: 'tennis:A@B-20260905',
    startTime: '2026-09-05T20:10:00.000Z',
    status: { state: 'in', detail: 'Set 2' },
    home: { team: { displayName: 'B Player' }, score: 1 },
    away: { team: { displayName: 'A Player' }, score: 2 },
    tennisDetail: { currentSet: 2, currentGameScore: { home: '30', away: '15' } }
  }], 'tennis');
  var r = owls.hydrateGamesWithOwlsScores(games, { tennis: idx });
  assertEq(r.matched, 1);
  assertEq(games[0].homeScore, 1);
  assert(games[0]._scoreMatchSafe === true);
  assertEq(games[0].moneyline[0].odds, -110);
});

test('player.html wires live score hydration helpers', function() {
  var html = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');
  assert(html.indexOf('scripts/owls-live-scores.js') !== -1, 'missing owls-live-scores script');
  assert(html.indexOf('function _pbHydrateLiveScoresForGames') !== -1, 'missing hydration helper');
  assert(html.indexOf('function _pbHasSafeNumericScore') !== -1, 'missing safe score guard');
  assert(html.indexOf('function _pbDevLogLiveScore') !== -1, 'missing dev log helper');
  assert(html.indexOf('/api/scores/') !== -1, 'missing /api/scores hydration path');
  assert(html.indexOf('_pbIsOutrightBoard') !== -1, 'missing outright board filter');
  assert(html.indexOf('No events available') !== -1, 'missing preferred empty copy');
});

test('soccer HT status classified and labeled', function() {
  var row = owls.parseOwlsLiveScoreEvent({
    id: 'soccer:A@B-ht',
    startTime: '2026-09-09T15:00:00.000Z',
    status: { state: 'in', detail: 'Half Time', name: 'STATUS_HALFTIME' },
    home: { team: { displayName: 'B' }, score: 1 },
    away: { team: { displayName: 'A' }, score: 1 }
  }, 'soccer');
  assert(row, 'parsed');
  assertEq(row.status, 'halftime');
  assertEq(row.statusLabel, 'HT');
  assert(row.isLive === true, 'HT still live');
});

test('soccer final / postponed / suspended statuses', function() {
  var ft = owls.parseOwlsLiveScoreEvent({
    id: 'soccer:A@B-ft',
    startTime: '2026-09-09T15:00:00.000Z',
    status: { state: 'post', detail: 'Full Time' },
    home: { team: { displayName: 'B' }, score: 2 },
    away: { team: { displayName: 'A' }, score: 0 }
  }, 'soccer');
  assertEq(ft.status, 'final');
  assertEq(ft.statusLabel, 'FT');

  var pp = owls.parseOwlsLiveScoreEvent({
    id: 'soccer:A@B-pp',
    startTime: '2026-09-09T18:00:00.000Z',
    status: { state: 'postponed', detail: 'Postponed' },
    home: { team: { displayName: 'B' }, score: null },
    away: { team: { displayName: 'A' }, score: null }
  }, 'soccer');
  assertEq(pp.status, 'postponed');
  assertEq(pp.statusLabel, 'POSTPONED');

  var sus = owls.parseOwlsLiveScoreEvent({
    id: 'soccer:A@B-sus',
    startTime: '2026-09-09T19:00:00.000Z',
    status: { state: 'in', detail: 'Suspended - weather' },
    home: { team: { displayName: 'B' }, score: 0 },
    away: { team: { displayName: 'A' }, score: 0 }
  }, 'soccer');
  assertEq(sus.status, 'suspended');
  assertEq(sus.statusLabel, 'SUSPENDED');
});

test('tennis retirement and walkover when provider supplies', function() {
  var ret = owls.parseOwlsLiveScoreEvent({
    id: 'tennis:A@B-ret',
    startTime: '2026-09-09T12:00:00.000Z',
    status: { state: 'post', detail: 'Retired' },
    home: { team: { displayName: 'B Player' }, score: 1 },
    away: { team: { displayName: 'A Player' }, score: 0 },
    tennisDetail: { currentSet: 2, currentGameScore: { home: '0', away: '0' }, sets: [{ home: 6, away: 3 }, { home: 2, away: 1 }] }
  }, 'tennis');
  assertEq(ret.status, 'retired');
  assertEq(ret.statusLabel, 'RETIRED');
  assertEq(ret.setScore, '0-1');

  var wo = owls.parseOwlsLiveScoreEvent({
    id: 'tennis:C@D-wo',
    startTime: '2026-09-09T13:00:00.000Z',
    status: { state: 'walkover', detail: 'Walkover' },
    home: { team: { displayName: 'D' }, score: 0 },
    away: { team: { displayName: 'C' }, score: 0 }
  }, 'tennis');
  assertEq(wo.status, 'walkover');
  assertEq(wo.statusLabel, 'WALKOVER');
});

test('tennis current set + games stamped on hydrate', function() {
  var games = [{
    id: 't1',
    sport: 'tennis',
    home: 'Benjamin Bonzi',
    away: 'Karen Khachanov',
    home_team: 'Benjamin Bonzi',
    away_team: 'Karen Khachanov',
    scheduledStart: '2026-09-09T19:05:00Z',
    isLive: true
  }];
  var idx = owls.indexOwlsLiveScores([{
    id: 'tennis:Khachanov K.@Bonzi B.-20260909',
    startTime: '2026-09-09T19:05:00.000Z',
    status: { state: 'in', detail: 'Set 3' },
    home: { team: { displayName: 'Bonzi B.' }, score: 1 },
    away: { team: { displayName: 'Khachanov K.' }, score: 1 },
    tennisDetail: {
      currentSet: 3,
      currentGameScore: { home: '40', away: '30' },
      sets: [{ home: 6, away: 4 }, { home: 3, away: 6 }, { home: 2, away: 2 }]
    }
  }], 'tennis');
  owls.hydrateGamesWithOwlsScores(games, { tennis: idx });
  assert(games[0]._scoreMatchSafe);
  assertEq(games[0].period, 3);
  assertEq(games[0].gameScore, '30-40');
  assertEq(games[0].setScore, '1-1');
});

test('flat /api/scores row converts and matches by event id', function() {
  var flat = owls.scoreEventFromFlatGame({
    id: 'soccer:Le Mans@Nice-20260909',
    home: 'Nice',
    away: 'Le Mans',
    homeScore: 2,
    awayScore: 1,
    status: 'live',
    clock: "58'",
    commence_time: '2026-09-09T18:00:00.000Z'
  });
  var idx = owls.indexOwlsLiveScores([flat], 'soccer');
  var m = owls.matchScoreToGame({
    eventId: 'soccer:Le Mans@Nice-20260909',
    home_team: 'Nice',
    away_team: 'Le Mans',
    commence_time: '2026-09-09T18:00:00Z',
    sport: 'soccer'
  }, idx);
  assert(m, 'flat eventId match');
  assertEq(m.homeScore, 2);
  assertEq(m.clock, "58'");
});

test('uncertain identity still suppresses score (no fuzzy)', function() {
  var idx = owls.indexOwlsLiveScores([{
    id: 'soccer:X@Y-1',
    startTime: '2026-09-09T18:00:00.000Z',
    status: { state: 'in' },
    home: { team: { displayName: 'Athletic Bilbao' }, score: 1 },
    away: { team: { displayName: 'Real Sociedad' }, score: 0 }
  }], 'soccer');
  // Club-key stripping removes athletic/real tokens — remaining keys must still diverge.
  assert(!owls.matchScoreToGame({
    home_team: 'Atletico Madrid',
    away_team: 'Real Madrid',
    commence_time: '2026-09-09T18:00:00Z',
    sport: 'soccer'
  }, idx), 'must suppress when club keys diverge');
  assertEq(owls._soccerClubKey('Athletic Bilbao') === owls._soccerClubKey('Atletico Madrid'), false);
});

console.log('\nLive soccer/tennis tests: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
