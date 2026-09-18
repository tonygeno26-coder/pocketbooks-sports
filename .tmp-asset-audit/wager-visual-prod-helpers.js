/* AUTO-GENERATED from player.html — production wager visual helpers. Do not edit by hand. */
(function(global){
"use strict";
var _currentSport = global._currentSport || "mlb";
function _pbAvatarSportKey(sport) {
  var s = String(sport || (typeof _currentSport !== 'undefined' ? _currentSport : '') || '').toLowerCase();
  if (s.indexOf('tennis') === 0 || s === 'atp' || s === 'wta') return 'tennis';
  if (s === 'mma' || s === 'mma_mixed_martial_arts' || s.indexOf('mma') === 0) return 'mma';
  if (s.indexOf('golf') === 0 || s === 'pga' || s === 'lpga' || s === 'golf_pga' || s === 'golf_liv' || s === 'golf_european') return 'golf';
  if (s.indexOf('boxing') === 0 || s === 'box') return 'boxing';
  if (s.indexOf('soccer') === 0 || s === 'epl' || s === 'mls' || s === 'ucl' ||
      s === 'laliga' || s === 'seriea' || s === 'bundesliga' || s === 'ligue1' ||
      s === 'worldcup' || s === 'euros') return 'soccer';
  return s;
}

/** Individual-athlete sports — ML/spread selections use athlete photos, not team crests. */
function _slipIsAthleteSport(sport) {
  var kind = _pbAvatarSportKey(sport);
  return kind === 'tennis' || kind === 'golf' || kind === 'mma' || kind === 'boxing';
}

function _pbPlayerHeadshotImg(name, sport, size) {
  size = size || 52;
  // Sport-specific helpers first so verified maps in team-logos.js are used
  // (getPlayerPhotoImg alone misses golf/MMA IDs that live outside player-photos.js).
  if (sport === 'tennis' && typeof getTennisPlayerPhotoImg === 'function') {
    return getTennisPlayerPhotoImg(name, size);
  }
  if (sport === 'golf' && typeof getGolfPlayerPhotoImg === 'function') {
    return getGolfPlayerPhotoImg(name, size);
  }
  if ((sport === 'mma' || sport === 'boxing') && typeof getMMAFighterPhotoImg === 'function') {
    return getMMAFighterPhotoImg(name, size);
  }
  if (typeof getPlayerPhotoImg === 'function') {
    return getPlayerPhotoImg(name, sport, size, { borderRadius: '10px' });
  }
  return '';
}


function _pbLobbyLogoImg(name, sport, size) {
  size = size || 36;
  var kind = _pbAvatarSportKey(sport);
  if (kind === 'tennis' || kind === 'mma' || kind === 'golf' || kind === 'boxing') {
    var shot = _pbPlayerHeadshotImg(name, kind, size);
    if (shot) return shot;
  }
  if (kind === 'soccer' && typeof getSoccerTeamLogoImg === 'function') {
    return getSoccerTeamLogoImg(name, size);
  }
  if (typeof getTeamLogoImg === 'function') return getTeamLogoImg(name, sport, size);
  return '';
}


function bsTeamAbbr(pickStr, game) {
  if (!pickStr) return '?';
  // For totals use O/U
  if (/^over/i.test(pickStr)) return 'O';
  if (/^under/i.test(pickStr)) return 'U';
  // Last word of first token before space+number
  var m = pickStr.match(/^([A-Za-z ]+)/);
  if (m) { var words = m[1].trim().split(' '); return words[words.length-1].slice(0,3).toUpperCase(); }
  return pickStr.slice(0,3).toUpperCase();
}

/** Resolve Over/Under for game totals from structured slip fields (side → market → pick). */
function _slipTotalSide(b) {
  if (!b) return null;
  // Player props can carry over/under side — never treat as game-total icons.
  if (typeof _slipIsPlayerProp === 'function' && _slipIsPlayerProp(b)) return null;
  var side = String(b.side || '').toLowerCase().trim();
  if (side === 'over' || side === 'under') return side;
  var market = typeof _normalizeSlipMarket === 'function'
    ? _normalizeSlipMarket(b.market)
    : String(b.market || '').trim().toLowerCase();
  var isTotal = market === 'total' || market === 'totals' || market === 'ou';
  var pick = String(b.pick || '').trim();
  var pickSide = /^over\b/i.test(pick) ? 'over' : /^under\b/i.test(pick) ? 'under' : null;
  if (isTotal) return pickSide;
  // Selection names Over/Under are always game totals in this sportsbook
  return pickSide;
}

/** Structured player-prop detection — never infer from matchup display text alone. */
function _slipIsPlayerProp(b) {
  if (!b) return false;
  if (b.presentation && b.presentation.kind === 'player_prop') return true;
  if (b.isPlayerProp === true || b.is_player_prop === true) return true;
  if (b.playerName || (b.presentation && b.presentation.playerName)) {
    var m0 = typeof _normalizeSlipMarket === 'function'
      ? _normalizeSlipMarket(b.market)
      : String(b.market || '').trim().toLowerCase();
    if (m0 === 'prop' || m0 === 'player_prop' || m0.indexOf('prop') === 0) return true;
  }
  var market = typeof _normalizeSlipMarket === 'function'
    ? _normalizeSlipMarket(b.market)
    : String(b.market || '').trim().toLowerCase();
  if (market === 'prop' || market === 'player_prop') return true;
  var cellId = String(b.cellId || '');
  if (/^prop-/i.test(cellId)) return true;
  return false;
}

/** Soccer 1X2 Draw selection — never treat as a club crest or remove-button X. */
function _slipIsDrawSelection(b) {
  if (!b) return false;
  if (typeof _slipIsPlayerProp === 'function' && _slipIsPlayerProp(b)) return false;
  var side = String(b.side || '').toLowerCase().trim();
  if (side === 'draw' || side === 'x' || side === 'tie') return true;
  var pick = String(b.pick || '').trim();
  if (/^draw\b/i.test(pick) || /^x\b/i.test(pick) || /^tie\b/i.test(pick)) return true;
  var market = typeof _normalizeSlipMarket === 'function'
    ? _normalizeSlipMarket(b.market)
    : String(b.market || '').trim().toLowerCase();
  var isMl = market === 'moneyline' || market === 'ml' || market === '1x2' || market === 'three way';
  if (isMl && /^draw$/i.test(pick)) return true;
  return false;
}

/** Read presentation-only metadata from an odds cell (does not alter wager identity). */
function _slipPresentationFromCell(cell) {
  if (!cell) return null;
  var isProp = cell.getAttribute('data-player-prop') === '1'
    || String(cell.getAttribute('data-market') || '').toLowerCase() === 'prop'
    || /^prop-/i.test(String(cell.getAttribute('data-id') || cell.dataset && cell.dataset.id || ''));
  if (!isProp) return null;
  var playerName = cell.getAttribute('data-player-name') || '';
  var playerTeam = cell.getAttribute('data-player-team') || '';
  var propType = cell.getAttribute('data-prop-type') || '';
  var side = cell.getAttribute('data-side') || '';
  var playerId = cell.getAttribute('data-player-id') || '';
  var photoUrl = cell.getAttribute('data-photo-url') || '';
  if (!playerName && !playerId && !photoUrl) {
    // Still mark as player prop so logo hierarchy prefers photo/fallback over O/U.
    return { kind: 'player_prop', playerName: '', playerTeam: '', propType: propType, side: side };
  }
  return {
    kind: 'player_prop',
    playerName: playerName,
    playerTeam: playerTeam,
    propType: propType,
    side: side,
    playerId: playerId || undefined,
    photoUrl: photoUrl || undefined
  };
}

/** Player-prop / athlete photo HTML for the slip logo slot (shared photo helpers). */
function _slipPlayerPropPhotoHtml(b, size) {
  size = size || 36;
  var pres = (b && b.presentation) || {};
  var name = String(pres.playerName || b.playerName || b.pick || '').trim();
  // Strip Over/Under / line noise from pick-derived athlete names
  name = name.replace(/\s+(Over|Under)\s+[\d.]+.*$/i, '').replace(/\s+[+-]?\d+(\.\d+)?\s*$/, '').trim();
  var team = String(pres.playerTeam || b.playerTeam || '').trim();
  var sport = (b && b.sport) || (typeof _currentSport !== 'undefined' ? _currentSport : null) || 'mlb';
  var kind = _pbAvatarSportKey(sport);
  var photoUrl = String(pres.photoUrl || '').trim();
  var playerId = String(pres.playerId || '').trim();

  if (!name && !photoUrl && !playerId) {
    return '<span class="dkslip-player-fallback" aria-hidden="true">?</span>';
  }

  // Prefer sport-specific verified maps for tennis/golf/mma/boxing.
  if (_slipIsAthleteSport(sport) && name) {
    var shot = _pbPlayerHeadshotImg(name, kind, size);
    if (shot) return shot;
  }

  if (typeof getPlayerPhotoImg === 'function' && name) {
    return getPlayerPhotoImg(name, sport, size, {
      team: team,
      className: 'dkslip-player-photo',
      borderRadius: '8px',
      objectFit: 'cover',
      photoUrl: photoUrl || undefined,
      espnId: playerId || undefined,
      playerId: playerId || undefined
    });
  }

  if (photoUrl) {
    var safeUrl = photoUrl.replace(/"/g, '&quot;');
    var safeName = String(name || 'Player').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return '<img class="dkslip-player-photo" src="' + safeUrl + '" alt="' + safeName +
      '" width="' + size + '" height="' + size + '"' +
      ' style="width:' + size + 'px;height:' + size + 'px;object-fit:cover;display:block;border-radius:8px"' +
      ' referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">';
  }

  if (typeof getPlayerHeadshotUrl === 'function' && name) {
    var url = getPlayerHeadshotUrl(name, sport, playerId || undefined);
    if (url) {
      return '<img class="dkslip-player-photo" src="' + String(url).replace(/"/g, '&quot;') +
        '" alt="' + String(name).replace(/"/g, '&quot;').replace(/</g, '&lt;') +
        '" width="' + size + '" height="' + size + '"' +
        ' style="width:' + size + 'px;height:' + size + 'px;object-fit:cover;display:block;border-radius:8px"' +
        ' referrerpolicy="no-referrer"' +
        ' data-player-photo="' + String(name).replace(/"/g, '&quot;') + '"' +
        ' data-player-name="' + String(name).replace(/"/g, '&quot;') + '"' +
        ' data-player-sport="' + String(sport).replace(/"/g, '&quot;') + '"' +
        ' data-player-team="' + String(team).replace(/"/g, '&quot;') + '"' +
        ' data-logo-size="' + size + '" data-object-fit="cover" data-border-radius="8px"' +
        ' data-logo-class="dkslip-player-photo"' +
        ' onerror="window.handlePlayerPhotoError&&window.handlePlayerPhotoError(this)">';
    }
  }

  // Graceful text-only fallback (never a broken image / initials circle)
  var label = String(name || '').trim() || '—';
  return '<span class="dkslip-player-fallback pb-text-fallback" aria-hidden="true" title="' +
    String(label).replace(/"/g, '&quot;') + '">' +
    String(label).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';
}

/** Resolve away/home for dual-logo totals from structured fields or matchup text. */
function _slipMatchupTeams(b) {
  var away = String((b && (b.awayTeam || b.away_team || b.away)) || '').trim();
  var home = String((b && (b.homeTeam || b.home_team || b.home)) || '').trim();
  if (away && home) return { away: away, home: home };
  var game = String((b && (b.game || b.matchup || b.event)) || '').trim();
  if (!game) return { away: away, home: home };
  var parts = game.split(/\s+vs\.?\s+|\s+@\s+/i);
  if (parts.length >= 2) {
    if (!away) away = parts[0].trim();
    if (!home) home = parts[1].trim();
  }
  return { away: away, home: home };
}

/** Compact overlapping dual team logos for game totals (not a selected-side crest). */
function _slipDualTeamLogoHtml(b, size) {
  size = size || 36;
  var teams = _slipMatchupTeams(b);
  var sport = (b && b.sport) || (typeof _currentSport !== 'undefined' ? _currentSport : null) || 'mlb';
  var aLogo = teams.away && typeof _pbLobbyLogoImg === 'function'
    ? _pbLobbyLogoImg(teams.away, sport, 24) : '';
  var hLogo = teams.home && typeof _pbLobbyLogoImg === 'function'
    ? _pbLobbyLogoImg(teams.home, sport, 24) : '';
  // Athlete-sport "totals" are rare; if logos resolve as headshots, still show both.
  if (aLogo || hLogo) {
    return '<div class="dkslip-dual-logos" aria-hidden="true">' +
      '<span class="dkslip-dual-a">' + (aLogo || '<span class="dkslip-dual-fallback">—</span>') + '</span>' +
      '<span class="dkslip-dual-b">' + (hLogo || '<span class="dkslip-dual-fallback">—</span>') + '</span>' +
      '</div>';
  }
  var aAbbr = teams.away ? String(teams.away).split(/\s+/).pop().slice(0, 3).toUpperCase() : '';
  var hAbbr = teams.home ? String(teams.home).split(/\s+/).pop().slice(0, 3).toUpperCase() : '';
  if (aAbbr || hAbbr) {
    return '<div class="dkslip-dual-logos" aria-hidden="true"><span class="dkslip-dual-fallback">' +
      String(aAbbr || '—').replace(/</g, '&lt;') + '/' + String(hAbbr || '—').replace(/</g, '&lt;') +
      '</span></div>';
  }
  return '<div class="dkslip-leg-logo" aria-hidden="true"><span class="dkslip-dual-fallback">TOT</span></div>';
}

/**
 * Logo-slot HTML hierarchy (Phase 2 wager visual identity):
 * 1) Player prop → athlete photo
 * 2) Athlete sport ML (tennis/golf/mma/boxing) → selected athlete photo
 * 3) Game/event total → BOTH team logos (dual overlap)
 * 4) Soccer Draw → neutral X/DRAW
 * 5) Team ML/spread → selected team logo
 * 6) Unresolved → graceful neutral fallback
 */
function _slipLegLogoHtml(b, opts) {
  opts = opts || {};
  var extraStyle = opts.style ? ' style="' + String(opts.style).replace(/"/g, '') + '"' : '';
  var wrapClass = opts.className ? String(opts.className) : 'dkslip-leg-logo';

  // 1) Player prop photo beats Over/Under even when side is over/under.
  if (_slipIsPlayerProp(b)) {
    return '<div class="' + wrapClass + '"' + extraStyle + ' aria-hidden="true">' +
      _slipPlayerPropPhotoHtml(b, opts.size || 36) + '</div>';
  }

  var legSport = (b && b.sport) || (typeof _currentSport !== 'undefined' ? _currentSport : null) || 'mlb';

  // 2) Athlete sports (Golf/Tennis/MMA/Boxing) — selected athlete photo for ML/outright
  if (_slipIsAthleteSport(legSport) && !_slipTotalSide(b) && !_slipIsDrawSelection(b)) {
    return '<div class="' + wrapClass + '"' + extraStyle + ' aria-hidden="true">' +
      _slipPlayerPropPhotoHtml(b, opts.size || 36) + '</div>';
  }

  // 3) Game totals → dual team logos (never a single-team crest that implies selection)
  if (_slipTotalSide(b)) {
    var dual = _slipDualTeamLogoHtml(b, opts.size || 36);
    // Dual helper already wraps; attach extra style on outer if needed
    if (extraStyle && dual.indexOf('style=') < 0) {
      dual = dual.replace(/^<div /, '<div' + extraStyle + ' ');
    }
    return dual;
  }

  // 4) Soccer Draw
  if (_slipIsDrawSelection(b)) {
    return '<div class="' + wrapClass + '"' + extraStyle + ' aria-hidden="true" title="Draw">' +
      '<span class="dkslip-draw"><span class="dkslip-draw-x">X</span><span class="dkslip-draw-label">DRAW</span></span></div>';
  }

  // 5) Team logo / 6) abbr fallback
  var pick = (b && b.pick) || '';
  var game = (b && b.game) || '';
  var teams = String(game).split(/\s+vs\.?\s+/i);
  var team = (typeof extractTeamFromPick === 'function')
    ? extractTeamFromPick(pick, teams[1] || b.homeTeam || '', teams[0] || b.awayTeam || '', legSport)
    : pick;
  var _logo = (typeof _pbLobbyLogoImg === 'function') ? _pbLobbyLogoImg(team || pick, legSport, opts.size || 36) : '';
  if (_logo) return '<div class="' + wrapClass + '"' + extraStyle + '>' + _logo + '</div>';
  return '<div class="' + wrapClass + '"' + extraStyle + '>' + bsTeamAbbr(pick, game) + '</div>';
}

/** Normalize a ticket/receipt leg into the shape _slipLegLogoHtml expects (presentation only). */
function _wagerLegVisualInput(leg, fallbackSport) {
  if (!leg) return null;
  var sport = leg.sport || leg.league || fallbackSport || '';
  var game = leg.game || leg.matchup || '';
  if (!game && leg.awayTeam && leg.homeTeam) game = leg.awayTeam + ' vs ' + leg.homeTeam;
  var isProp = !!(leg.isPlayerProp || leg.is_player_prop ||
    (leg.presentation && leg.presentation.kind === 'player_prop') ||
    leg.playerName || (leg.presentation && leg.presentation.playerName));
  return {
    pick: leg.pick || leg.selection || leg.team || '',
    market: leg.market || leg.market_type || leg.marketType || '',
    sport: sport,
    game: game,
    side: leg.side || '',
    homeTeam: leg.homeTeam || leg.home_team || leg.home || '',
    awayTeam: leg.awayTeam || leg.away_team || leg.away || '',
    presentation: leg.presentation || undefined,
    isPlayerProp: isProp,
    playerName: leg.playerName || (leg.presentation && leg.presentation.playerName) || undefined,
    playerTeam: leg.playerTeam || (leg.presentation && leg.presentation.playerTeam) || undefined
  };
}


function _normalizeSlipMarket(market) {
  var m = String(market || '').trim().toLowerCase();
  if (!m) return 'moneyline';
  if (m === 'to win' || m === 'win' || m === 'h2h' || m.indexOf('moneyline') >= 0) return 'moneyline';
  if (m.indexOf('total') >= 0 || m === 'over' || m === 'under') return 'total';
  if (m.indexOf('spread') >= 0 || m.indexOf('run line') >= 0 || m.indexOf('puck line') >= 0
      || m.indexOf('runline') >= 0 || m.indexOf('handicap') >= 0) return 'spread';
  return m;
}

global._pbAvatarSportKey = _pbAvatarSportKey;
global._slipIsAthleteSport = _slipIsAthleteSport;
global._pbPlayerHeadshotImg = _pbPlayerHeadshotImg;
global._pbLobbyLogoImg = _pbLobbyLogoImg;
global._slipTotalSide = _slipTotalSide;
global._slipIsPlayerProp = _slipIsPlayerProp;
global._slipIsDrawSelection = _slipIsDrawSelection;
global._slipPlayerPropPhotoHtml = _slipPlayerPropPhotoHtml;
global._slipDualTeamLogoHtml = _slipDualTeamLogoHtml;
global._slipLegLogoHtml = _slipLegLogoHtml;
global._slipMatchupTeams = _slipMatchupTeams;
global._wagerLegVisualInput = _wagerLegVisualInput;
global._normalizeSlipMarket = _normalizeSlipMarket;
global.bsTeamAbbr = bsTeamAbbr;
})(typeof window !== "undefined" ? window : globalThis);
