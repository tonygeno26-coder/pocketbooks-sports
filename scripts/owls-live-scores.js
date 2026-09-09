'use strict';

/**
 * Owls Insight live scores — deterministic matching (presentation only).
 * Shared by player.html client hydration and node tests.
 * Does NOT drive settlement/grading authority.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OwlsLiveScores = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

function _normTeamIdentity(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function _soccerClubKey(name) {
  return String(name || '').toLowerCase()
    .replace(/\b(fc|cf|sc|ac|afc|bk|sk|if|as|ss|cd|ud|rc|deportivo|club)\b/g, ' ')
    .replace(/\b(united|city|town|real|atletico|athletic|sporting|inter|internacional)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

function _tennisSingleKey(name) {
  var parts = String(name || '').trim().replace(/\./g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 2 && parts[1].length <= 2) {
    return parts[0].toLowerCase().replace(/[^a-z]/g, '');
  }
  if (parts.length === 2 && parts[0].length <= 2) {
    return parts[1].toLowerCase().replace(/[^a-z]/g, '');
  }
  var last = parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, '');
  if (last.length >= 3) return last;
  return parts.join('').toLowerCase().replace(/[^a-z]/g, '');
}

function _tennisPlayerKey(name) {
  var raw = String(name || '').trim();
  if (/[\/&]/.test(raw)) {
    return raw.split(/[\/&]/).map(_tennisSingleKey).filter(Boolean).sort().join('+');
  }
  return _tennisSingleKey(raw);
}

function _tennisPairKey(away, home) {
  var aw = _tennisPlayerKey(away);
  var hw = _tennisPlayerKey(home);
  if (!aw || !hw) return '';
  return aw + '|' + hw;
}

function _canonicalKeyFromRow(row, sportKey) {
  if (!row) return '';
  var sport = String(sportKey || row.sport_key || 'soccer').toLowerCase();
  if (sport.indexOf('soccer') >= 0) sport = 'soccer';
  if (sport.indexOf('tennis') >= 0) sport = 'tennis';
  var date = (row.commence_time || '').slice(0, 10);
  return [sport, row.away_team, row.home_team, date].join('|');
}

function _startMs(iso) {
  if (!iso) return NaN;
  var ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function _sameStartWindow(aIso, bIso, windowMs) {
  var a = _startMs(aIso);
  var b = _startMs(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= (windowMs || 3 * 60 * 60 * 1000);
}

function _soccerMinuteFromEvent(ev, status) {
  if (status && status.displayClock != null && String(status.displayClock).trim() !== '') {
    return String(status.displayClock).replace(/'/g, '') + "'";
  }
  var detail = status && status.detail != null ? String(status.detail) : '';
  if (/^\d{1,3}(\+\d{1,2})?'?$/.test(detail.trim())) {
    return detail.trim().replace(/'/g, '') + "'";
  }
  var incidents = Array.isArray(ev && ev.incidents) ? ev.incidents : [];
  var maxMin = null;
  for (var i = 0; i < incidents.length; i++) {
    var m = incidents[i] && incidents[i].minute;
    if (m == null) continue;
    var n = parseInt(m, 10);
    if (!Number.isFinite(n)) continue;
    if (maxMin == null || n > maxMin) maxMin = n;
  }
  return maxMin != null ? maxMin + "'" : '';
}

function _tennisSetScore(td, homeScore, awayScore) {
  if (homeScore != null && awayScore != null) return String(awayScore) + '-' + String(homeScore);
  var sets = td && Array.isArray(td.sets) ? td.sets : [];
  if (!sets.length) return null;
  var aw = 0, hw = 0;
  sets.forEach(function(s) {
    if (!s) return;
    var h = Number(s.home);
    var a = Number(s.away);
    if (!Number.isFinite(h) || !Number.isFinite(a)) return;
    if (a > h) aw++;
    else if (h > a) hw++;
  });
  return aw + '-' + hw;
}

function _tennisGameScore(td) {
  if (!td || !td.currentGameScore) return null;
  var g = td.currentGameScore;
  if (typeof g === 'string') return g;
  var h = g.home != null ? g.home : '';
  var a = g.away != null ? g.away : '';
  if (h === '' && a === '') return null;
  return a + '-' + h;
}

function parseOwlsLiveScoreEvent(ev, sportKey) {
  if (!ev || typeof ev !== 'object') return null;
  var homeSide = ev.home || {};
  var awaySide = ev.away || {};
  var homeTeam = (homeSide.team && (homeSide.team.displayName || homeSide.team.name)) ||
    homeSide.displayName || ev.home_team || '';
  var awayTeam = (awaySide.team && (awaySide.team.displayName || awaySide.team.name)) ||
    awaySide.displayName || ev.away_team || '';
  if (!homeTeam || !awayTeam) return null;

  var status = ev.status || {};
  if (typeof status === 'string') status = { state: status };
  var state = String(status.state || status.type || '').toLowerCase();
  var statusName = String(status.name || status.detail || '').toUpperCase();
  var completed = ev.completed === true || state === 'post' || state === 'final' ||
    state === 'completed' || state === 'closed' ||
    statusName === 'STATUS_FINAL' || statusName === 'STATUS_FULL_TIME';
  var canceled = /cancel|abandon|postpone/i.test(String(status.detail || status.name || ''));
  var live = !completed && !canceled && (
    state === 'in' || state === 'live' || ev.in_play === true || ev.is_live === true || ev.live === true
  );
  var gameStatus = completed ? 'final' : canceled ? 'canceled' : live ? 'live' : 'upcoming';

  var homeScore = homeSide.score != null ? Number(homeSide.score) : null;
  var awayScore = awaySide.score != null ? Number(awaySide.score) : null;
  if (homeScore != null && !Number.isFinite(homeScore)) homeScore = null;
  if (awayScore != null && !Number.isFinite(awayScore)) awayScore = null;

  var sport = String(sportKey || ev.sport || '').toLowerCase();
  var bd = ev.baseballDetail || {};
  var td = ev.tennisDetail || {};
  var period = status.period != null ? status.period : null;
  var clock = status.displayClock != null ? status.displayClock : null;
  var inning = null;
  var inningHalf = null;
  var setScore = null;
  var gameScore = null;

  if (sport.indexOf('mlb') >= 0 || sport.indexOf('baseball') >= 0 || bd.inning != null) {
    inning = bd.inning != null ? bd.inning : period;
    inningHalf = bd.half || null;
    if (period == null && inning != null) period = inning;
  }
  if (sport.indexOf('tennis') >= 0 || td.currentSet != null || td.sets) {
    if (period == null && td.currentSet != null) period = td.currentSet;
    setScore = _tennisSetScore(td, homeScore, awayScore);
    gameScore = _tennisGameScore(td);
  }
  if (sport.indexOf('soccer') >= 0) {
    clock = _soccerMinuteFromEvent(ev, status) || clock;
  }

  var detail = status.detail != null ? String(status.detail) : '';

  return {
    id: String(ev.id || ''),
    sourceMatchId: ev.sourceMatchId != null ? String(ev.sourceMatchId) : null,
    sport_key: sportKey || ev.sport || null,
    home_team: homeTeam,
    away_team: awayTeam,
    commence_time: ev.startTime || ev.commence_time || ev.date || null,
    completed: completed,
    canceled: canceled,
    status: gameStatus,
    isLive: gameStatus === 'live',
    homeScore: homeScore,
    awayScore: awayScore,
    period: period,
    clock: clock,
    inning: inning,
    inningHalf: inningHalf,
    setScore: setScore,
    gameScore: gameScore,
    statusDetail: detail || null,
    league: ev.league || null,
    lastUpdated: ev.lastUpdated || null
  };
}

function indexOwlsLiveScores(events, sportKey) {
  var byEventId = {};
  var bySourceMatchId = {};
  var byTeamStart = {};
  var byCanonicalKey = {};
  var bySoccerPair = {};
  var byTennisPair = {};
  var list = [];
  (events || []).forEach(function(raw) {
    var row = parseOwlsLiveScoreEvent(raw, sportKey);
    if (!row || !row.id) return;
    list.push(row);
    byEventId[row.id] = row;
    if (row.sourceMatchId) bySourceMatchId[row.sourceMatchId] = row;

    var cKey = _canonicalKeyFromRow(row, sportKey);
    if (cKey) byCanonicalKey[cKey] = row;
    var cKeySwap = _canonicalKeyFromRow({
      away_team: row.home_team,
      home_team: row.away_team,
      commence_time: row.commence_time
    }, sportKey);
    if (cKeySwap) byCanonicalKey[cKeySwap] = row;

    var aw = _normTeamIdentity(row.away_team);
    var hw = _normTeamIdentity(row.home_team);
    if (aw && hw) {
      byTeamStart[aw + '|' + hw] = byTeamStart[aw + '|' + hw] || [];
      byTeamStart[aw + '|' + hw].push(row);
    }

    var sk = _soccerClubKey(row.away_team);
    var hk = _soccerClubKey(row.home_team);
    if (sk && hk) {
      bySoccerPair[sk + '|' + hk] = bySoccerPair[sk + '|' + hk] || [];
      bySoccerPair[sk + '|' + hk].push(row);
    }

    var tk = _tennisPairKey(row.away_team, row.home_team);
    if (tk) {
      byTennisPair[tk] = byTennisPair[tk] || [];
      byTennisPair[tk].push(row);
    }
  });
  return {
    byEventId: byEventId,
    bySourceMatchId: bySourceMatchId,
    byTeamStart: byTeamStart,
    byCanonicalKey: byCanonicalKey,
    bySoccerPair: bySoccerPair,
    byTennisPair: byTennisPair,
    list: list
  };
}

function _pickUniqueCandidate(candidates, start, windowMs) {
  if (!candidates || !candidates.length) return null;
  var exact = [];
  for (var j = 0; j < candidates.length; j++) {
    var c = candidates[j];
    if (start && c.commence_time && !_sameStartWindow(start, c.commence_time, windowMs)) continue;
    if (!start || !c.commence_time || _sameStartWindow(start, c.commence_time, windowMs)) {
      exact.push(c);
    }
  }
  if (exact.length !== 1) return null;
  return exact[0];
}

function _remapSwappedScore(hit, game) {
  var src = hit.row || hit;
  return Object.assign({}, src, {
    home_team: game.home_team || game.home || src.away_team,
    away_team: game.away_team || game.away || src.home_team,
    homeScore: src.awayScore,
    awayScore: src.homeScore,
    orientationSwapped: true
  });
}

/**
 * Strict match order:
 * 1) Owls eventId (odds eventId == scores id)
 * 2) canonicalGameKey exact (display-name pipe key)
 * 3) provider ids (numeric id / sourceMatchId)
 * 4) sport-specific deterministic identity (tennis last-name / soccer club key) + start window
 * 5) normalized exact team identity + start window (+ soccer swapped orientation)
 * 6) unresolved → null (never fuzzy)
 */
function matchScoreToGame(game, index, opts) {
  if (!game || !index) return null;
  var windowMs = (opts && opts.windowMs) || 3 * 60 * 60 * 1000;
  var start = game.commence_time || game.scheduledStart || game.time || null;
  var sport = String(game.sport_key || game.sport || '').toLowerCase();

  var eventId = game.eventId || game.owlsEventId || game.owls_event_id || null;
  if (eventId && index.byEventId[String(eventId)]) return index.byEventId[String(eventId)];

  var cKey = game.canonicalGameKey || game.canonicalKey || null;
  if (cKey && index.byCanonicalKey && index.byCanonicalKey[cKey]) {
    return index.byCanonicalKey[cKey];
  }

  var ids = [
    game.id, game.providerGameId, game.provider_game_id, game.sourceMatchId, game.source_match_id
  ].filter(Boolean).map(String);
  for (var i = 0; i < ids.length; i++) {
    if (index.byEventId[ids[i]]) return index.byEventId[ids[i]];
    if (index.bySourceMatchId[ids[i]]) return index.bySourceMatchId[ids[i]];
  }

  if (sport.indexOf('tennis') >= 0 && index.byTennisPair) {
    var tk = _tennisPairKey(game.away_team || game.away, game.home_team || game.home);
    var tHit = _pickUniqueCandidate(index.byTennisPair[tk] || [], start, windowMs);
    if (tHit) return tHit;
    var tkSwap = _tennisPairKey(game.home_team || game.home, game.away_team || game.away);
    var tSwap = _pickUniqueCandidate(index.byTennisPair[tkSwap] || [], start, windowMs);
    if (tSwap) return _remapSwappedScore(tSwap, game);
  }

  if (sport.indexOf('soccer') >= 0 && index.bySoccerPair) {
    var sk = _soccerClubKey(game.away_team || game.away);
    var hk = _soccerClubKey(game.home_team || game.home);
    var sHit = _pickUniqueCandidate(index.bySoccerPair[sk + '|' + hk] || [], start, windowMs);
    if (sHit) return sHit;
    var sSwap = _pickUniqueCandidate(index.bySoccerPair[hk + '|' + sk] || [], start, windowMs);
    if (sSwap) return _remapSwappedScore(sSwap, game);
  }

  var aw = _normTeamIdentity(game.away_team || game.away);
  var hw = _normTeamIdentity(game.home_team || game.home);
  if (!aw || !hw) return null;

  function pickFromCandidates(candidates, expectAway, expectHome, swapped) {
    var exact = [];
    for (var j = 0; j < candidates.length; j++) {
      var c = candidates[j];
      if (_normTeamIdentity(c.away_team) !== expectAway || _normTeamIdentity(c.home_team) !== expectHome) continue;
      if (start && c.commence_time && !_sameStartWindow(start, c.commence_time, windowMs)) continue;
      if (!start || !c.commence_time || _sameStartWindow(start, c.commence_time, windowMs)) {
        exact.push({ row: c, swapped: !!swapped });
      }
    }
    if (exact.length !== 1) return null;
    var hit = exact[0];
    if (!hit.swapped) return hit.row;
    return _remapSwappedScore(hit, game);
  }

  var oriented = pickFromCandidates(index.byTeamStart[aw + '|' + hw] || [], aw, hw, false);
  if (oriented) return oriented;
  return pickFromCandidates(index.byTeamStart[hw + '|' + aw] || [], hw, aw, true);
}

function applyScoreFieldsToGame(game, score) {
  if (!game || !score) return game;
  game.homeScore = score.homeScore;
  game.awayScore = score.awayScore;
  game.period = score.period;
  game.clock = score.clock;
  game.inning = score.inning;
  game.inningHalf = score.inningHalf;
  game.setScore = score.setScore;
  game.gameScore = score.gameScore;
  game.statusDetail = score.statusDetail;
  game.scoreEventId = score.id || null;
  game.scoreSourceMatchId = score.sourceMatchId || null;
  game.scoreSource = 'owls_scores_live';
  game._scoreMatchSafe = true;
  if (score.status === 'final') {
    game.status = 'final';
    game.isLive = false;
    game.isFinal = true;
    game.completed = true;
  }
  return game;
}

function hydrateGamesWithOwlsScores(games, scoreIndexesBySport, formatGameStateText) {
  var matched = 0;
  var unmatchedLive = 0;
  (games || []).forEach(function(g) {
    if (!g) return;
    var sport = String(g.sport_key || g.sport || '').toLowerCase();
    var short = sport;
    if (sport.indexOf('mlb') >= 0 || sport.indexOf('baseball') >= 0) short = 'mlb';
    else if (sport.indexOf('ncaaf') >= 0) short = 'ncaaf';
    else if (sport.indexOf('nfl') >= 0) short = 'nfl';
    else if (sport.indexOf('nba') >= 0) short = 'nba';
    else if (sport.indexOf('ncaab') >= 0) short = 'ncaab';
    else if (sport.indexOf('nhl') >= 0 || sport.indexOf('hockey') >= 0) short = 'nhl';
    else if (sport.indexOf('soccer') >= 0) short = 'soccer';
    else if (sport.indexOf('tennis') >= 0) short = 'tennis';

    var idx = scoreIndexesBySport[short] || scoreIndexesBySport[sport];
    if (!idx) {
      if (g.isLive || g.status === 'live') unmatchedLive++;
      return;
    }
    var score = matchScoreToGame(g, idx);
    if (!score) {
      if (g.isLive || g.status === 'live') unmatchedLive++;
      return;
    }
    applyScoreFieldsToGame(g, score);
    if (typeof formatGameStateText === 'function') {
      g.gameStateText = formatGameStateText(short, {
        status: g.status || score.status,
        period: g.period,
        clock: g.clock,
        inning: g.inning,
        inningHalf: g.inningHalf,
        setScore: g.setScore,
        gameScore: g.gameScore,
        statusDetail: g.statusDetail
      });
    }
    matched++;
  });
  return { matched: matched, unmatchedLive: unmatchedLive };
}

function scoreEventFromFlatGame(g) {
  if (!g) return null;
  var hasNum = g.homeScore != null || g.awayScore != null;
  var hasTennis = g.setScore != null || g.gameScore != null;
  if (!hasNum && !hasTennis && !g.clock && !g.statusDetail) return null;
  return {
    id: g.eventId || g.owlsEventId || g.id || g.providerGameId || '',
    sourceMatchId: g.sourceMatchId || g.providerGameId || null,
    startTime: g.scheduledStart || g.time || g.commence_time || null,
    status: {
      state: (g.isLive || g.status === 'live') ? 'in' : (g.status || 'in'),
      detail: g.statusDetail || g.gameStateText || null,
      displayClock: g.clock || null,
      period: g.period || null
    },
    home: { team: { displayName: g.home || g.home_team }, score: g.homeScore },
    away: { team: { displayName: g.away || g.away_team }, score: g.awayScore },
    tennisDetail: (g.setScore != null || g.gameScore != null) ? {
      currentSet: g.period,
      currentGameScore: g.gameScore,
      sets: g.setScore ? [{ home: g.homeScore, away: g.awayScore }] : []
    } : null,
    league: g.league || null
  };
}

return {
  parseOwlsLiveScoreEvent: parseOwlsLiveScoreEvent,
  indexOwlsLiveScores: indexOwlsLiveScores,
  matchScoreToGame: matchScoreToGame,
  applyScoreFieldsToGame: applyScoreFieldsToGame,
  hydrateGamesWithOwlsScores: hydrateGamesWithOwlsScores,
  scoreEventFromFlatGame: scoreEventFromFlatGame,
  _normTeamIdentity: _normTeamIdentity,
  _tennisPairKey: _tennisPairKey,
  _soccerClubKey: _soccerClubKey,
  _canonicalKeyFromRow: _canonicalKeyFromRow
};

});
