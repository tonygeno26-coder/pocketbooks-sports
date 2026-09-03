/**
 * Verified player photo system with tiered fallbacks.
 * Tier 1: pre-built VERIFIED_PLAYER_IDS map
 * Tier 2: ESPN search (+ team when available) with 7-day localStorage cache
 * Tier 3: sport-specific (tennis initials / soccer team logo / colored initials)
 * Tier 4: img onerror → next tier → initials (never broken image)
 */
(function (global) {
  'use strict';

  var VERIFIED_PLAYER_IDS = {
  mlb: {
    'Aaron Judge': 33192,
    'Adley Rutschman': 42178,
    'Alec Burleson': 4345070,
    'Alex Bregman': 34886,
    'Alika Williams': 4424289,
    'Andrew Benintendi': 34986,
    'Blaze Alexander': 41345,
    'Bobby Witt Jr.': 42403,
    'Braden Montgomery': 4950345,
    'Brandon Nimmo': 32159,
    'Brice Turang': 41179,
    'Brock Rodden': 5197107,
    'Bryce Harper': 30951,
    'Cal Raleigh': 41292,
    'Caleb Durbin': 5007615,
    'Cam Smith': 5080766,
    'Carlos Narvaez': 5012120,
    'Carter Jensen': 4917812,
    'Ceddanne Rafaela': 4987382,
    'Cedric Mullins': 35578,
    'Chandler Simpson': 4679983,
    'Chase Meidroth': 5136929,
    'Christian Encarnacion-Strand': 5012106,
    'Christian Walker': 32758,
    'Christian Yelich': 31283,
    'Coby Mayo': 4683371,
    'Cody Freeman': 42925,
    'Cole Young': 5080641,
    'Colson Montgomery': 4872685,
    'Cooper Pratt': 5149101,
    'Corbin Carroll': 42404,
    'Corey Seager': 32691,
    'Danny Jansen': 35004,
    'Daulton Varsho': 40963,
    'David Hamilton': 42987,
    'Denzel Clarke': 4918085,
    'Dominic Canzone': 4345621,
    'Elias Diaz': 33594,
    'Elly De La Cruz': 4917694,
    'Enrique Hernandez': 31358,
    'Ezequiel Duran': 42457,
    'Fernando Tatis Jr.': 35983,
    'Francisco Lindor': 32129,
    'Freddie Freeman': 30193,
    'Garrett Mitchell': 4313442,
    'Gerrit Cole': 32081,
    'Graham Pauley': 4622931,
    'Griffin Conine': 41295,
    'Gunnar Henderson': 42507,
    'Henry Bolte': 5080756,
    'Heriberto Hernandez': 42455,
    'Ian Happ': 34945,
    'Isaac Collins': 42959,
    'Isaac Paredes': 39706,
    'Ivan Herrera': 41889,
    'J. P. Crawford': 33210,
    'J.P. Crawford': 33210,
    'Jac Caglianone': 4926296,
    'Jackson Chourio': 4917869,
    'Jackson Holliday': 5080633,
    'Jacob deGrom': 32796,
    'Jake Bauers': 35013,
    'Jake Burger': 39882,
    'Jake Rogers': 39900,
    'Jakob Marsee': 4866735,
    'Jarren Duran': 41610,
    'Javier Sanoja': 5073992,
    'Jeff McNeil': 33900,
    'Jeremy Pena': 41273,
    'Joe Mack': 4872695,
    'Jonah Heim': 33842,
    'Jonathan Aranda': 40810,
    'Jordan Walker': 4684778,
    'Jose Altuve': 31662,
    'Jose Fermin': 38851,
    'Josh Naylor': 35066,
    'Josh Rojas': 40718,
    'Joshua Baez': 4920835,
    'Juan Soto': 36969,
    'Julio Rodriguez': 41044,
    'Junior Caminero': 4905921,
    'Justin Foscue': 4298639,
    'Kyle Isbel': 41263,
    'Kyle Stowers': 42796,
    'Kyle Tucker': 34967,
    'LaMonte Wade Jr.': 37798,
    'Lawrence Butler': 4917919,
    'Lazaro Montes': 5124103,
    'Leody Taveras': 34951,
    'Liam Hicks': 4725251,
    'Luis Robert': 39631,
    'Luis Robert Jr.': 39631,
    'Max P. Muncy': 4872686,
    'Michael Busch': 42415,
    'Michael Conforto': 33711,
    'Mickey Gasper': 5132012,
    'Miguel Amaya': 38905,
    'Miguel Rojas': 30791,
    'Miguel Vargas': 42453,
    'Mike Trout': 30836,
    'Mookie Betts': 33039,
    'Munetaka Murakami': 4872595,
    'Nick Loftin': 4314013,
    'Nick Sogard': 42979,
    'Otto Lopez': 41917,
    'Owen Caissie': 4917685,
    'Paul Skenes': 4719507,
    'Pedro Ramirez': 5012995,
    'Pete Alonso': 37498,
    'Pete Crow-Armstrong': 4717833,
    'Rafael Devers': 33859,
    'Ramon Urias': 40610,
    'Randy Arozarena': 36488,
    'Richie Palacios': 41359,
    'Roman Anthony': 5080767,
    'Ronald Acuna Jr.': 36185,
    'Salvador Perez': 31127,
    'Sandy Alcantara': 35241,
    'Seiya Suzuki': 4142424,
    'Shohei Ohtani': 39832,
    'Spencer Strider': 4307825,
    'Tarik Skubal': 42409,
    'Teoscar Hernandez': 33377,
    'Tommy Edman': 39907,
    'Tommy White': 4923961,
    'Trevor Story': 32150,
    'Victor Mesa Jr.': 4917849,
    'Vinnie Pasquantino': 4109109,
    'Vladimir Guerrero Jr.': 35002,
    'Will Smith': 38309,
    'William Contreras': 39895,
    'Wilyer Abreu': 4990055,
    'Wyatt Langford': 4719324,
    'Yainer Diaz': 4781491,
    'Yandy Diaz': 33481,
    'Yordan Alvarez': 36018,
    'Zack Gelof': 4414531
  },
  nfl: {
    'A.J. Brown': 4047646,
    'Amon-Ra St. Brown': 4374302,
    'Baker Mayfield': 3052587,
    'Bijan Robinson': 4430807,
    'Breece Hall': 4427366,
    'Brian Thomas Jr.': 4432773,
    'Brock Purdy': 4361741,
    'Caleb Williams': 4431611,
    'CeeDee Lamb': 4241389,
    'Christian McCaffrey': 3117251,
    'Cooper Kupp': 2977187,
    'Dak Prescott': 2577417,
    'Davante Adams': 16800,
    'Deebo Samuel': 3126486,
    'Deebo Samuel Sr.': 3126486,
    'DK Metcalf': 4047650,
    'Garrett Wilson': 4569618,
    'George Kittle': 3040151,
    'Ja\'Marr Chase': 4362628,
    'Jalen Hurts': 4040715,
    'Jayden Daniels': 4426348,
    'Joe Burrow': 3915511,
    'Josh Allen': 3918298,
    'Justin Herbert': 4038941,
    'Justin Jefferson': 4262921,
    'Lamar Jackson': 3916387,
    'Malik Nabers': 4595348,
    'Mark Andrews': 3116365,
    'Micah Parsons': 4361423,
    'Myles Garrett': 3122132,
    'Nico Collins': 4258173,
    'Patrick Mahomes': 3139477,
    'Puka Nacua': 4426515,
    'Rashee Rice': 4428331,
    'Saquon Barkley': 3929630,
    'Stefon Diggs': 2976212,
    'T.J. Watt': 3045282,
    'Travis Kelce': 15847,
    'Tua Tagovailoa': 4241479,
    'Tyreek Hill': 3116406,
    'Xavier Worthy': 4683062
  },
  nba: {
    'Anthony Davis': 6583,
    'Anthony Edwards': 4594268,
    'Cade Cunningham': 4432166,
    'Damian Lillard': 6606,
    'Devin Booker': 3136193,
    'Giannis Antetokounmpo': 3032977,
    'Ja Morant': 4279888,
    'Jalen Brunson': 3934672,
    'Jalen Williams': 4593803,
    'Jayson Tatum': 4065648,
    'Jimmy Butler': 6430,
    'Jimmy Butler III': 6430,
    'Joel Embiid': 3059318,
    'Kevin Durant': 3202,
    'Kyrie Irving': 6442,
    'LeBron James': 1966,
    'Luka Doncic': 3945274,
    'Nikola Jokic': 3112335,
    'Shai Gilgeous-Alexander': 4278073,
    'Stephen Curry': 3975,
    'Trae Young': 4277905,
    'Victor Wembanyama': 5104157
  },
  tennis: {
    'Alex de Minaur': 2651,
    'Alexander Zverev': 2375,
    'Andrey Rublev': 2642,
    'Aryna Sabalenka': 3038,
    'Carlos Alcaraz': 3782,
    'Casper Ruud': 2989,
    'Coco Gauff': 3626,
    'Daniil Medvedev': 2383,
    'Elena Rybakina': 3126,
    'Frances Tiafoe': 2708,
    'Hubert Hurkacz': 2726,
    'Iga Swiatek': 3730,
    'Jannik Sinner': 3623,
    'Jessica Pegula': 2113,
    'Madison Keys': 1556,
    'Naomi Osaka': 2789,
    'Novak Djokovic': 296,
    'Ons Jabeur': 1803,
    'Sebastian Korda': 3368,
    'Stefanos Tsitsipas': 2869,
    'Taylor Fritz': 2946,
    'Tommy Paul': 2964
  },
  soccer: {
    'Carlos Vela': 76098,
    'Cucho Hernandez': 336809,
    'Cucho Hernández': 336809,
    'Denis Bouanga': 213304,
    'Hany Mukhtar': 174548,
    'Jordi Alba': 121021,
    'Josef Martinez': 172688,
    'Josef Martínez': 172688,
    'Lionel Messi': 45843,
    'Sergio Busquets': 121893,
    'Thiago Almada': 277208,
    'Tyler Adams': 222776
  }
  };

  var ESPN_SEARCH_SPORT = {
    mlb: 'baseball', nba: 'basketball', wnba: 'basketball', ncaab: 'basketball',
    nfl: 'football', ncaaf: 'football', ncaafb: 'football', nhl: 'hockey',
    tennis: 'tennis', tennis_atp: 'tennis', tennis_wta: 'tennis', soccer: 'soccer', mls: 'soccer'
  };

  var ESPN_HEADSHOT_SPORT = {
    mlb: 'mlb', nba: 'nba', nfl: 'nfl', nhl: 'nhl', wnba: 'wnba',
    ncaab: 'mens-college-basketball', ncaaf: 'college-football', ncaafb: 'college-football',
    tennis: 'tennis', tennis_atp: 'tennis', tennis_wta: 'tennis', soccer: 'soccer', mls: 'soccer'
  };

  var ESPN_LEAGUE_SLUG = {
    mlb: 'mlb', nba: 'nba', nfl: 'nfl', nhl: 'nhl', wnba: 'wnba',
    ncaab: 'mens-college-basketball', ncaaf: 'college-football', ncaafb: 'college-football',
    tennis: 'atp', tennis_atp: 'atp', tennis_wta: 'wta', soccer: 'soccer', mls: 'usa.1'
  };

  var CACHE_PREFIX = 'pbPlayerPhoto:v1:';
  var CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var _memCache = {};
  var _pending = {};

  function normalizeSport(sport) {
    var s = String(sport || 'mlb').toLowerCase().trim();
    if (s === 'ncaafb') return 'ncaaf';
    if (s === 'americanfootball_nfl') return 'nfl';
    if (s === 'americanfootball_ncaaf') return 'ncaaf';
    if (s === 'baseball_mlb') return 'mlb';
    if (s === 'basketball_nba') return 'nba';
    if (s === 'basketball_wnba') return 'wnba';
    if (s === 'icehockey_nhl') return 'nhl';
    if (s === 'tennis_atp' || s === 'atp' || s === 'tennis_wta' || s === 'wta') return 'tennis';
    if (s === 'soccer_mls' || s === 'mls') return 'soccer';
    return s;
  }

  function verifiedSportKey(sport) {
    var s = normalizeSport(sport);
    if (s === 'tennis' || s === 'tennis_atp' || s === 'tennis_wta') return 'tennis';
    if (s === 'soccer' || s === 'mls') return 'soccer';
    return s;
  }

  function normName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function playerInitials(name) {
    var parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }

  function playerInitialColors(name, teamColor) {
    if (teamColor) return { bg: teamColor, fg: '#fff' };
    var hash = 0;
    var s = String(name || '?');
    for (var i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
    var hue = Math.abs(hash) % 360;
    return { bg: 'hsl(' + hue + ',45%,32%)', fg: '#fff' };
  }

  function cacheKey(name, sport, team) {
    return String(name || '').trim().toLowerCase() + '|' + normalizeSport(sport) + '|' + String(team || '').trim().toLowerCase();
  }

  function readPersistentCache(key) {
    try {
      if (typeof localStorage === 'undefined') return null;
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.expiresAt || Date.now() > obj.expiresAt) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return obj;
    } catch (_e) {
      return null;
    }
  }

  function writePersistentCache(key, payload) {
    try {
      if (typeof localStorage === 'undefined') return;
      var obj = {
        espnId: payload.espnId || null,
        headshotUrl: payload.headshotUrl || null,
        miss: !!payload.miss,
        expiresAt: Date.now() + CACHE_TTL_MS
      };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(obj));
    } catch (_e) { /* quota / private mode */ }
  }

  function clearPlayerPhotoCache() {
    _memCache = {};
    try {
      if (typeof localStorage === 'undefined') return;
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(CACHE_PREFIX) === 0) keys.push(k);
      }
      keys.forEach(function (k) { localStorage.removeItem(k); });
    } catch (_e) {}
  }

  function lookupVerifiedId(name, sport) {
    var map = VERIFIED_PLAYER_IDS[verifiedSportKey(sport)];
    if (!map) return null;
    if (map[name] != null) return String(map[name]);
    var want = normName(name);
    if (!want) return null;
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      if (normName(keys[i]) === want) return String(map[keys[i]]);
    }
    return null;
  }

  function getVerifiedPlayerId(name, sport) {
    return lookupVerifiedId(name, sport);
  }

  function getPlayerHeadshotUrl(name, sport, espnId) {
    var id = espnId || lookupVerifiedId(name, sport);
    if (!id) return '';
    var slug = ESPN_HEADSHOT_SPORT[normalizeSport(sport)] || normalizeSport(sport) || 'mlb';
    return 'https://a.espncdn.com/i/headshots/' + slug + '/players/full/' + id + '.png';
  }

  function teamColorFor(team, sport) {
    try {
      if (typeof global.getTeamColors === 'function' && team) {
        var c = global.getTeamColors(team, sport);
        if (c && c.primary) return c.primary;
      }
    } catch (_e) {}
    return '';
  }

  function initialsHtml(name, size, className, team, sport) {
    size = size || 40;
    var colors = playerInitialColors(name, teamColorFor(team, sport));
    var cls = className ? ' class="' + esc(className) + '"' : '';
    return '<div' + cls +
      ' style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:' +
      colors.bg + ';color:' + colors.fg + ';font-size:' + Math.max(8, Math.round(size * 0.32)) +
      'px;font-weight:900;letter-spacing:0.3px;flex-shrink:0" aria-hidden="true">' +
      esc(playerInitials(name)) + '</div>';
  }

  function leagueMatches(itemLeague, sport) {
    var s = normalizeSport(sport);
    var league = String(itemLeague || '').toLowerCase();
    if (s === 'tennis') return !league || league === 'atp' || league === 'wta' || league === 'tennis';
    if (s === 'soccer') return true;
    var want = ESPN_LEAGUE_SLUG[s] || s;
    return !league || league === String(want).toLowerCase();
  }

  function pickSearchResult(items, playerName, sport, team) {
    var want = normName(playerName);
    var teamNorm = normName(team);
    var ranked = [];
    for (var i = 0; i < (items || []).length; i++) {
      var it = items[i];
      if (!it || !it.id) continue;
      if (!leagueMatches(it.league, sport)) continue;
      var dn = normName(it.displayName || it.name || '');
      var score = 0;
      if (dn === want) score = 100;
      else if (dn.indexOf(want) >= 0 || want.indexOf(dn) >= 0) score = 50;
      else score = 10;
      if (teamNorm) {
        var hay = normName([it.displayName, it.description, it.subtitle, it.team, it.location].filter(Boolean).join(' '));
        if (hay.indexOf(teamNorm) >= 0) score += 40;
      }
      ranked.push({ score: score, it: it });
    }
    ranked.sort(function (a, b) { return b.score - a.score; });
    return ranked.length ? ranked[0].it : null;
  }

  async function searchEspnPlayerId(playerName, sport, team) {
    sport = normalizeSport(sport);
    var key = cacheKey(playerName, sport, team);
    if (_memCache[key]) return _memCache[key];
    var persisted = readPersistentCache(key);
    if (persisted) {
      _memCache[key] = persisted.miss
        ? { miss: true }
        : { id: String(persisted.espnId), headshotUrl: persisted.headshotUrl };
      return _memCache[key];
    }

    // Tier 1 — verified map (ignore team for map key)
    var verifiedId = lookupVerifiedId(playerName, sport);
    if (verifiedId) {
      var vUrl = getPlayerHeadshotUrl(playerName, sport, verifiedId);
      var hit = { id: verifiedId, headshotUrl: vUrl, verified: true };
      _memCache[key] = hit;
      writePersistentCache(key, { espnId: verifiedId, headshotUrl: vUrl });
      return hit;
    }

    if (_pending[key]) return _pending[key];

    _pending[key] = (async function () {
      var searchSport = ESPN_SEARCH_SPORT[sport] || sport;
      var query = String(playerName || '').trim();
      if (team) query = query + ' ' + String(team).trim();
      var url = 'https://site.api.espn.com/apis/common/v3/search?query=' +
        encodeURIComponent(query) +
        '&sport=' + encodeURIComponent(searchSport) +
        '&type=player&limit=8';
      try {
        var res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) {
          var miss1 = { miss: true };
          _memCache[key] = miss1;
          writePersistentCache(key, { miss: true });
          return miss1;
        }
        var data = await res.json();
        var pick = pickSearchResult(data.items || [], playerName, sport, team);
        // Retry without team if team-disambiguated search failed
        if (!pick && team) {
          var url2 = 'https://site.api.espn.com/apis/common/v3/search?query=' +
            encodeURIComponent(String(playerName || '').trim()) +
            '&sport=' + encodeURIComponent(searchSport) +
            '&type=player&limit=8';
          var res2 = await fetch(url2, { cache: 'force-cache' });
          if (res2.ok) {
            var data2 = await res2.json();
            pick = pickSearchResult(data2.items || [], playerName, sport, team);
          }
        }
        if (!pick || !pick.id) {
          var miss2 = { miss: true };
          _memCache[key] = miss2;
          writePersistentCache(key, { miss: true });
          return miss2;
        }
        var headshotUrl = getPlayerHeadshotUrl(playerName, sport, pick.id);
        var ok = { id: String(pick.id), headshotUrl: headshotUrl };
        _memCache[key] = ok;
        writePersistentCache(key, { espnId: ok.id, headshotUrl: headshotUrl });
        return ok;
      } catch (_e) {
        var miss3 = { miss: true };
        _memCache[key] = miss3;
        return miss3;
      } finally {
        delete _pending[key];
      }
    })();

    return _pending[key];
  }

  function soccerTeamLogoFallback(team, size, className) {
    if (typeof global.getSoccerTeamLogoImg === 'function' && team) {
      return global.getSoccerTeamLogoImg(team, size, className);
    }
    if (typeof global.getTeamLogoImg === 'function' && team) {
      return global.getTeamLogoImg(team, 'soccer', size, className);
    }
    return '';
  }

  function handlePlayerPhotoError(img) {
    if (!img) return;
    var step = parseInt(img.getAttribute('data-photo-step') || '0', 10);
    var name = img.getAttribute('data-player-name') || img.alt || '';
    var sport = img.getAttribute('data-player-sport') || 'mlb';
    var team = img.getAttribute('data-player-team') || '';
    var size = parseInt(img.getAttribute('data-logo-size') || img.getAttribute('width') || '40', 10);
    var className = img.getAttribute('data-logo-class') || '';

    // Invalidate bad cache entry
    try {
      var key = cacheKey(name, sport, team);
      _memCache[key] = { miss: true };
      writePersistentCache(key, { miss: true });
    } catch (_e) {}

    // Soccer: try team logo before initials
    if (normalizeSport(sport) === 'soccer' && step === 0 && team) {
      var logoHtml = soccerTeamLogoFallback(team, size, className);
      if (logoHtml) {
        img.outerHTML = logoHtml;
        return;
      }
    }

    img.outerHTML = initialsHtml(name, size, className, team, sport);
  }

  function getPlayerPhotoImg(playerName, sport, size, opts) {
    opts = opts || {};
    size = size || 40;
    sport = normalizeSport(sport);
    var name = String(playerName || '').trim();
    var team = opts.team || '';
    var className = opts.className || '';
    var borderRadius = opts.borderRadius != null ? opts.borderRadius : (sport === 'tennis' ? '10px' : '50%');
    var cls = className ? ' class="' + esc(className) + '"' : '';
    var url = getPlayerHeadshotUrl(name, sport);

    if (!url) {
      if (sport === 'soccer' && team) {
        var logo = soccerTeamLogoFallback(team, size, className);
        if (logo) return logo;
      }
      return '<span data-player-photo="' + esc(name) + '" data-player-name="' + esc(name) +
        '" data-player-sport="' + esc(sport) + '" data-player-team="' + esc(team) +
        '" data-logo-size="' + size + '"' +
        (className ? ' data-logo-class="' + esc(className) + '"' : '') + '>' +
        initialsHtml(name, size, className, team, sport) + '</span>';
    }

    return '<img' + cls +
      ' src="' + esc(url) + '"' +
      ' alt="' + esc(name) + '"' +
      ' width="' + size + '" height="' + size + '"' +
      ' style="width:' + size + 'px;height:' + size + 'px;object-fit:cover;display:block;border-radius:' + borderRadius + '"' +
      ' referrerpolicy="no-referrer"' +
      ' data-photo-step="0"' +
      ' data-player-photo="' + esc(name) + '"' +
      ' data-player-name="' + esc(name) + '"' +
      ' data-player-sport="' + esc(sport) + '"' +
      ' data-player-team="' + esc(team) + '"' +
      ' data-logo-size="' + size + '"' +
      (className ? ' data-logo-class="' + esc(className) + '"' : '') +
      ' onerror="window.handlePlayerPhotoError&&window.handlePlayerPhotoError(this)">';
  }

  function buildHeadshotImgNode(name, sport, size, team, className, url) {
    var img = document.createElement('img');
    if (className) img.className = className;
    img.src = url;
    img.alt = name;
    img.width = size;
    img.height = size;
    img.style.cssText = 'width:' + size + 'px;height:' + size + 'px;object-fit:cover;display:block;border-radius:' +
      (normalizeSport(sport) === 'tennis' ? '10px' : '50%');
    img.referrerPolicy = 'no-referrer';
    img.setAttribute('data-photo-step', '0');
    img.setAttribute('data-player-photo', name);
    img.setAttribute('data-player-name', name);
    img.setAttribute('data-player-sport', sport);
    img.setAttribute('data-player-team', team || '');
    img.setAttribute('data-logo-size', String(size));
    if (className) img.setAttribute('data-logo-class', className);
    img.onerror = function () { handlePlayerPhotoError(img); };
    return img;
  }

  async function hydratePlayerPhotos(root, sportHint) {
    var scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return;
    var els = Array.prototype.slice.call(scope.querySelectorAll('[data-player-photo]'));
    var jobs = [];
    var seen = {};
    els.forEach(function (el) {
      var name = el.getAttribute('data-player-name') || el.getAttribute('data-player-photo') || '';
      var sport = el.getAttribute('data-player-sport') || sportHint || 'mlb';
      var team = el.getAttribute('data-player-team') || '';
      var key = cacheKey(name, sport, team);
      if (!name || seen[key]) return;
      seen[key] = true;
      if (lookupVerifiedId(name, sport)) return;
      jobs.push(searchEspnPlayerId(name, sport, team));
    });
    if (jobs.length) await Promise.all(jobs);

    els = Array.prototype.slice.call(scope.querySelectorAll('[data-player-photo]'));
    els.forEach(function (el) {
      var name = el.getAttribute('data-player-name') || el.getAttribute('data-player-photo') || '';
      var sport = el.getAttribute('data-player-sport') || sportHint || 'mlb';
      var team = el.getAttribute('data-player-team') || '';
      var size = parseInt(el.getAttribute('data-logo-size') || '40', 10);
      var className = el.getAttribute('data-logo-class') || '';
      var key = cacheKey(name, sport, team);
      var cached = _memCache[key];
      var url = (cached && cached.headshotUrl) || getPlayerHeadshotUrl(name, sport);
      if (!url) return;
      if (el.tagName === 'IMG' && el.getAttribute('src') === url) return;
      if (!el.parentNode) return;
      el.parentNode.replaceChild(buildHeadshotImgNode(name, sport, size, team, className, url), el);
    });
  }

  global.VERIFIED_PLAYER_IDS = VERIFIED_PLAYER_IDS;
  global.getVerifiedPlayerId = getVerifiedPlayerId;
  global.getPlayerHeadshotUrl = getPlayerHeadshotUrl;
  global.searchEspnPlayerId = searchEspnPlayerId;
  global.getPlayerPhotoImg = getPlayerPhotoImg;
  global.handlePlayerPhotoError = handlePlayerPhotoError;
  global.hydratePlayerPhotos = hydratePlayerPhotos;
  global.clearPlayerPhotoCache = clearPlayerPhotoCache;
  global.playerPhotoCacheKey = cacheKey;
  global.playerPhotoInitialsHtml = initialsHtml;
})(typeof window !== 'undefined' ? window : this);
