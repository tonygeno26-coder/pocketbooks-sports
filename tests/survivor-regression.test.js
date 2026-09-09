/**
 * Task 19 — Survivor regression (join/entries/picks/deadline/lock/phase)
 * Run: node tests/survivor-regression.test.js
 * Pure logic + FE source gates. No prod picks.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch (e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m || '') + ' — got ' + JSON.stringify(a) + ' expected ' + JSON.stringify(b));
}

const html = fs.readFileSync(path.join(__dirname, '..', 'survivor.html'), 'utf8');
const BE = path.join(process.env.HOME || '', '.openclaw/workspace/pocketbooks-sports-backend/index.js');
const beSrc = fs.existsSync(BE) ? fs.readFileSync(BE, 'utf8') : '';

function survivorPhase(week) {
  return (parseInt(week, 10) || 0) <= 18 ? 'regular' : 'playoffs';
}

function teamAlreadyUsed(priorPicks, week, team, entryNumber) {
  const phase = survivorPhase(week);
  return (priorPicks || []).some(function (p) {
    const pn = p.entryNumber || p.entry_number || 1;
    if (pn !== entryNumber) return false;
    if (p.week === week) return false;
    if (survivorPhase(p.week) !== phase) return false;
    return String(p.team).toLowerCase() === String(team).toLowerCase();
  });
}

function gradePick(pick, game) {
  if (!pick) return { result: 'lost', reason: 'no_pick' };
  if (!game || !game.completed) return { result: 'pending', reason: game ? 'game_not_final' : 'game_not_found' };
  const won = (pick.team === game.home && game.home_score > game.away_score)
    || (pick.team === game.away && game.away_score > game.home_score);
  return { result: won ? 'won' : 'lost', reason: 'graded' };
}

function deadlinePassed(deadlineIso, nowMs) {
  if (!deadlineIso) return false;
  return (nowMs || Date.now()) >= new Date(deadlineIso).getTime();
}

console.log('\n── Phase / reuse ──');
test('weeks 1-18 are regular', function () {
  assertEq(survivorPhase(1), 'regular');
  assertEq(survivorPhase(18), 'regular');
});
test('weeks 19-22 are playoffs', function () {
  assertEq(survivorPhase(19), 'playoffs');
  assertEq(survivorPhase(22), 'playoffs');
});
test('team reuse blocked in same phase', function () {
  assert(teamAlreadyUsed([{ week: 3, team: 'Chiefs', entryNumber: 1 }], 5, 'Chiefs', 1));
});
test('team reuse allowed across regular→playoffs', function () {
  assert(!teamAlreadyUsed([{ week: 10, team: 'Chiefs', entryNumber: 1 }], 19, 'Chiefs', 1));
});
test('entry isolation for used teams', function () {
  assert(!teamAlreadyUsed([{ week: 3, team: 'Chiefs', entryNumber: 1 }], 5, 'Chiefs', 2));
});

console.log('\n── Deadline / lock / W-L ──');
test('deadline lock when past iso', function () {
  assert(deadlinePassed('2020-01-01T18:00:00.000Z', Date.parse('2020-01-01T19:00:00.000Z')));
  assert(!deadlinePassed('2030-01-01T18:00:00.000Z', Date.parse('2020-01-01T19:00:00.000Z')));
});
test('no pick → eliminated', function () {
  assertEq(gradePick(null, { completed: true, home: 'A', away: 'B', home_score: 1, away_score: 0 }).result, 'lost');
});
test('winning pick survives', function () {
  assertEq(gradePick({ team: 'Chiefs' }, {
    completed: true, home: 'Chiefs', away: 'Ravens', home_score: 27, away_score: 20
  }).result, 'won');
});
test('losing pick eliminated', function () {
  assertEq(gradePick({ team: 'Ravens' }, {
    completed: true, home: 'Chiefs', away: 'Ravens', home_score: 27, away_score: 20
  }).result, 'lost');
});
test('incomplete game stays pending', function () {
  assertEq(gradePick({ team: 'Chiefs' }, {
    completed: false, home: 'Chiefs', away: 'Ravens', home_score: 7, away_score: 3
  }).result, 'pending');
});

console.log('\n── FE source gates ──');
test('join / approve / pick / grade routes wired', function () {
  assert(html.includes('/api/survivor/request-join') || html.includes('/api/survivor/join'));
  assert(html.includes('/approve'));
  assert(html.includes('/pick'));
  assert(html.includes('/grade'));
});
test('deadline countdown + picks locked overlay', function () {
  assert(html.includes('picksAreLocked') || html.includes('deadlinePassed'));
  assert(html.includes('Picks Locked') || html.includes('picks-locked'));
});
test('browse-only weeks cannot submit picks', function () {
  assert(html.includes('Browse-only week') || /browseWeek\s*!==\s*currentDetail\.pool\.currentWeek/.test(html));
});
test('preseason/test mode helper present', function () {
  assert(html.includes('isPreseasonTestMode'));
});
test('ESPN regular-season scoreboard (seasontype=2)', function () {
  assert(html.includes('seasontype=2'));
});

if (beSrc) {
  console.log('\n── BE source gates ──');
  test('pick rejects eliminated / deadline / wrong week', function () {
    assert(beSrc.includes("error: 'eliminated'") || beSrc.includes("error:'eliminated'"));
    assert(beSrc.includes('picks_locked'));
    assert(beSrc.includes('week_mismatch'));
  });
  test('grade uses ESPN NFL scores path', function () {
    assert(beSrc.includes('_fetchEspnNflScores') || beSrc.includes('_gradeSurvivorPool'));
  });
  test('approve creates 1-3 entries', function () {
    assert(beSrc.includes('entriesGranted_must_be_1_2_or_3'));
  });
}

console.log('\n── Summary: ' + _pass + ' passed, ' + _fail + ' failed ──');
process.exit(_fail ? 1 : 0);
