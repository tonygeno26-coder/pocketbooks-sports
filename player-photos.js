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
    'Adrian Mannarino': 1266,
    'Ajla Tomljanovic': 1549,
    'Alejandro Davidovich Fokina': 3212,
    'Aleksandar Vukic': 3471,
    'Alex de Minaur': 2651,
    'Alex De Minaur': 2651,
    'Alexander Bublik': 2865,
    'Alexander Zverev': 2375,
    'Alexei Popyrin': 2862,
    'Aliaksandra Sasnovich': 1809,
    'Amanda Anisimova': 3221,
    'Anastasia Pavlyuchenkova': 824,
    'Andrey Rublev': 2642,
    'Andy Murray': 235,
    'Angelique Kerber': 745,
    'Arthur Rinderknech': 3511,
    'Aryna Sabalenka': 3038,
    'Barbora Krejcikova': 2042,
    'Beatriz Haddad Maia': 2028,
    'Belinda Bencic': 2183,
    'Benjamin Bonzi': 2355,
    'Bianca Andreescu': 2979,
    'Borna Coric': 2202,
    'Botic Van De Zandschulp': 3310,
    'Botic van de Zandschulp': 3310,
    'Brandon Nakashima': 3774,
    'Cameron Norrie': 2366,
    'Carlos Alcaraz': 3782,
    'Caroline Wozniacki': 630,
    'Casper Ruud': 2989,
    'Catherine McNally': 3223,
    'Coco Gauff': 3626,
    'Cristian Garin': 2228,
    'Damir Dzumhur': 1842,
    'Daniel Altmaier': 3203,
    'Danielle Collins': 3262,
    'Daniil Medvedev': 2383,
    'Daria Kasatkina': 2191,
    'David Goffin': 1360,
    'Dayana Yastremska': 3142,
    'Denis Shapovalov': 2860,
    'Diego Schwartzman': 2324,
    'Donna Vekic': 2040,
    'Ekaterina Alexandrova': 3182,
    'Elena Rybakina': 3126,
    'Elina Svitolina': 1797,
    'Elise Mertens': 2221,
    'Fabio Fognini': 669,
    'Felix Auger-Aliassime': 3209,
    'Frances Tiafoe': 2708,
    'Gael Monfils': 242,
    'Grigor Dimitrov': 1287,
    'Hubert Hurkacz': 2726,
    'Hugo Gaston': 3375,
    'Iga Swiatek': 3730,
    'Jan-Lennard Struff': 2337,
    'Jannik Sinner': 3623,
    'Jaume Munar': 2709,
    'Jelena Ostapenko': 2195,
    'Jenson Brooksby': 3621,
    'Jessica Pegula': 2113,
    'John Isner': 1023,
    'Kamil Majchrzak': 2416,
    'Karen Khachanov': 2367,
    'Karolina Pliskova': 740,
    'Katerina Siniakova': 2248,
    'Katie Boulter': 2054,
    'Kei Nishikori': 1035,
    'Lloyd Harris': 2863,
    'Lorenzo Musetti': 3764,
    'Lorenzo Sonego': 3052,
    'Mackenzie McDonald': 2206,
    'Madison Keys': 1556,
    'Magda Linette': 1649,
    'Marcos Giron': 1993,
    'Maria Sakkari': 3018,
    'Marin Cilic': 464,
    'Marketa Vondrousova': 2735,
    'Marton Fucsovics': 1862,
    'Matteo Berrettini': 2622,
    'Milos Raonic': 1333,
    'Miomir Kecmanovic': 2874,
    'Naomi Osaka': 2789,
    'Nick Kyrgios': 1984,
    'Nicolas Jarry': 2377,
    'Nikoloz Basilashvili': 2498,
    'Novak Djokovic': 296,
    'Ons Jabeur': 1803,
    'Pablo Carreno Busta': 1590,
    'Pablo Carreño Busta': 1590,
    'Paula Badosa': 2731,
    'Petra Kvitova': 928,
    'Rafael Nadal': 261,
    'Richard Gasquet': 310,
    'Sebastian Baez': 3340,
    'Sebastian Korda': 3368,
    'Serena Williams': 394,
    'Simona Halep': 936,
    'Sloane Stephens': 1472,
    'Sofia Kenin': 2746,
    'Soon-Woo Kwon': 2872,
    'SoonWoo Kwon': 2872,
    'Soonwoo Kwon': 2872,
    'Sorana Cirstea': 1774,
    'Stan Wawrinka': 264,
    'Stefano Travaglia': 2682,
    'Stefanos Tsitsipas': 2869,
    'Tallon Griekspoor': 3319,
    'Tatjana Maria': 2346,
    'Taylor Fritz': 2946,
    'Tommy Paul': 2964,
    'Ugo Humbert': 3085,
    'Venus Williams': 403,
    'Victoria Azarenka': 421,
    'Yulia Putintseva': 1802,
    'Zhang Shuai': 707
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
  },
  // Exact Owls-name → ESPN ID aliases only (no fuzzy). Populated by sync /
  // verified lookups; empty object keeps resolver path open without guesses.
  mma: {
    // Accent / punctuation aliases (same ESPN id when known):
    // 'Casey ONeill': <id>, "Casey O'Neill": <id>
  }
  };

  var ESPN_SEARCH_SPORT = {
    mlb: 'baseball', nba: 'basketball', wnba: 'basketball', ncaab: 'basketball',
    nfl: 'football', ncaaf: 'football', ncaafb: 'football', nhl: 'hockey',
    tennis: 'tennis', tennis_atp: 'tennis', tennis_wta: 'tennis', soccer: 'soccer', mls: 'soccer',
    mma: 'mma', boxing: 'mma'
  };

  var ESPN_HEADSHOT_SPORT = {
    mlb: 'mlb', nba: 'nba', nfl: 'nfl', nhl: 'nhl', wnba: 'wnba',
    ncaab: 'mens-college-basketball', ncaaf: 'college-football', ncaafb: 'college-football',
    tennis: 'tennis', tennis_atp: 'tennis', tennis_wta: 'tennis', soccer: 'soccer', mls: 'soccer',
    mma: 'mma', boxing: 'mma'
  };

  var ESPN_LEAGUE_SLUG = {
    mlb: 'mlb', nba: 'nba', nfl: 'nfl', nhl: 'nhl', wnba: 'wnba',
    ncaab: 'mens-college-basketball', ncaaf: 'college-football', ncaafb: 'college-football',
    tennis: 'atp', tennis_atp: 'atp', tennis_wta: 'wta', soccer: 'soccer', mls: 'usa.1',
    mma: 'ufc', boxing: 'boxing'
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
    if (s === 'mma_mixed_martial_arts') return 'mma';
    return s;
  }

  function verifiedSportKey(sport) {
    var s = normalizeSport(sport);
    if (s === 'tennis' || s === 'tennis_atp' || s === 'tennis_wta') return 'tennis';
    if (s === 'soccer' || s === 'mls') return 'soccer';
    if (s === 'mma' || s === 'mma_mixed_martial_arts') return 'mma';
    return s;
  }

  function normName(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
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

  function leagueMatches(item, sport) {
    var s = normalizeSport(sport);
    var league = String((item && item.league) || '').toLowerCase();
    var itemSport = String((item && item.sport) || '').toLowerCase();
    if (s === 'tennis') {
      if (itemSport && itemSport !== 'tennis') return false;
      return !league || league === 'atp' || league === 'wta' || league === 'tennis';
    }
    if (s === 'soccer') return !itemSport || itemSport === 'soccer';
    if (s === 'mma') {
      if (itemSport && itemSport !== 'mma') return false;
      // Accept UFC / BKFC / PFL / etc. — any MMA league slug.
      return true;
    }
    var want = ESPN_LEAGUE_SLUG[s] || s;
    return !league || league === String(want).toLowerCase();
  }

  function tennisSearchQueries(playerName) {
    var parts = String(playerName || '').trim().split(/\s+/).filter(Boolean);
    var firstLast = parts.length >= 2 ? (parts[0] + ' ' + parts[parts.length - 1]) : String(playerName || '').trim();
    var queries = [];
    if (firstLast) queries.push(firstLast + ' tennis');
    if (firstLast && queries.indexOf(firstLast) < 0) queries.push(firstLast);
    var full = String(playerName || '').trim();
    if (full && queries.indexOf(full) < 0) queries.push(full);
    return queries;
  }

  function mmaSearchQueries(playerName) {
    var parts = String(playerName || '').trim().split(/\s+/).filter(Boolean);
    var firstLast = parts.length >= 2 ? (parts[0] + ' ' + parts[parts.length - 1]) : String(playerName || '').trim();
    var full = String(playerName || '').trim();
    var queries = [];
    if (full) queries.push(full);
    if (firstLast && queries.indexOf(firstLast) < 0) queries.push(firstLast);
    if (full) queries.push(full + ' ufc');
    if (firstLast) queries.push(firstLast + ' mma');
    return queries;
  }

  function pickSearchResult(items, playerName, sport, team) {
    var want = normName(playerName);
    var teamNorm = normName(team);
    var ranked = [];
    for (var i = 0; i < (items || []).length; i++) {
      var it = items[i];
      if (!it || !it.id) continue;
      if (!leagueMatches(it, sport)) continue;
      var dn = normName(it.displayName || it.name || '');
      var score = 0;
      // Exact-only preference for combat sports — never promote weak substring hits.
      if (dn === want) score = 100;
      else if (normalizeSport(sport) === 'mma') continue;
      else if (dn.indexOf(want) >= 0 || want.indexOf(dn) >= 0) score = 50;
      else score = 10;
      if (teamNorm) {
        var hay = normName([it.displayName, it.description, it.subtitle, it.team, it.location].filter(Boolean).join(' '));
        if (hay.indexOf(teamNorm) >= 0) score += 40;
      }
      ranked.push({ score: score, it: it });
    }
    ranked.sort(function (a, b) { return b.score - a.score; });
    if (!ranked.length) return null;
    // Ambiguous exact ties → unresolved (no dangerous guess).
    if (ranked.length > 1 && ranked[0].score === ranked[1].score && ranked[0].score >= 100) return null;
    return ranked[0].it;
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
      try {
        try {
          var apiBase = (typeof global.API === 'string' && global.API)
            || global._PBS_BACKEND
            || 'https://pocketbooks-sports-backend-production.up.railway.app';
          var dbRes = await fetch(apiBase + '/api/player-photo/' +
            encodeURIComponent(sport) + '/' + encodeURIComponent(String(playerName || '').trim()),
            { cache: 'no-store' });
          if (dbRes.ok) {
            var dbJson = await dbRes.json();
            if (dbJson && dbJson.ok && dbJson.photoUrl) {
              var dbHit = {
                id: dbJson.espnId ? String(dbJson.espnId) : '',
                headshotUrl: dbJson.photoUrl,
                fromDb: true
              };
              _memCache[key] = dbHit;
              writePersistentCache(key, { espnId: dbHit.id, headshotUrl: dbHit.headshotUrl });
              return dbHit;
            }
          }
        } catch (_dbE) { /* fall through to ESPN search */ }

        var searchSport = ESPN_SEARCH_SPORT[sport] || sport;
        var queries = [];
        if (sport === 'tennis') {
          queries = tennisSearchQueries(playerName);
        } else if (sport === 'mma') {
          queries = mmaSearchQueries(playerName);
        } else {
          var query = String(playerName || '').trim();
          if (team) query = query + ' ' + String(team).trim();
          queries.push(query);
          if (team) queries.push(String(playerName || '').trim());
        }
        var pick = null;
        for (var qi = 0; qi < queries.length && !pick; qi++) {
          var q = queries[qi];
          if (!q) continue;
          var limit = (sport === 'tennis' || sport === 'mma') ? 5 : 8;
          // ESPN returns empty items when `sport=` is set for some individual
          // sports — query by name + type=player, then filter in pickSearchResult.
          var url = 'https://site.api.espn.com/apis/common/v3/search?query=' +
            encodeURIComponent(q) +
            ((sport === 'tennis' || sport === 'mma')
              ? ''
              : ('&sport=' + encodeURIComponent(searchSport))) +
            '&type=player&limit=' + limit;
          var res = await fetch(url, { cache: 'force-cache' });
          if (!res.ok) continue;
          var data = await res.json();
          pick = pickSearchResult(data.items || [], playerName, sport, team);
        }
        if (!pick || !pick.id) {
          var miss1 = { miss: true };
          _memCache[key] = miss1;
          writePersistentCache(key, { miss: true });
          return miss1;
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
    var borderRadius = opts.borderRadius != null ? opts.borderRadius : ((sport === 'tennis' || sport === 'mma') ? '10px' : '50%');
    var objectFit = opts.objectFit || 'cover';
    var cls = className ? ' class="' + esc(className) + '"' : '';
    var url = opts.photoUrl || getPlayerHeadshotUrl(name, sport, opts.espnId || opts.playerId || '');

    if (!url) {
      if (sport === 'soccer' && team) {
        var logo = soccerTeamLogoFallback(team, size, className);
        if (logo) return logo;
      }
      return '<span data-player-photo="' + esc(name) + '" data-player-name="' + esc(name) +
        '" data-player-sport="' + esc(sport) + '" data-player-team="' + esc(team) +
        '" data-logo-size="' + size + '"' +
        ' data-object-fit="' + esc(objectFit) + '"' +
        ' data-border-radius="' + esc(String(borderRadius)) + '"' +
        (className ? ' data-logo-class="' + esc(className) + '"' : '') + '>' +
        initialsHtml(name, size, className, team, sport) + '</span>';
    }

    return '<img' + cls +
      ' src="' + esc(url) + '"' +
      ' alt="' + esc(name) + '"' +
      ' width="' + size + '" height="' + size + '"' +
      ' style="width:' + size + 'px;height:' + size + 'px;object-fit:' + esc(objectFit) +
      ';display:block;border-radius:' + esc(String(borderRadius)) + '"' +
      ' referrerpolicy="no-referrer"' +
      ' data-photo-step="0"' +
      ' data-player-photo="' + esc(name) + '"' +
      ' data-player-name="' + esc(name) + '"' +
      ' data-player-sport="' + esc(sport) + '"' +
      ' data-player-team="' + esc(team) + '"' +
      ' data-logo-size="' + size + '"' +
      ' data-object-fit="' + esc(objectFit) + '"' +
      ' data-border-radius="' + esc(String(borderRadius)) + '"' +
      (className ? ' data-logo-class="' + esc(className) + '"' : '') +
      ' onerror="window.handlePlayerPhotoError&&window.handlePlayerPhotoError(this)">';
  }

  function buildHeadshotImgNode(name, sport, size, team, className, url, styleOpts) {
    styleOpts = styleOpts || {};
    var objectFit = styleOpts.objectFit || 'cover';
    var borderRadius = styleOpts.borderRadius != null
      ? styleOpts.borderRadius
      : ((normalizeSport(sport) === 'tennis' || normalizeSport(sport) === 'mma') ? '10px' : '50%');
    var img = document.createElement('img');
    if (className) img.className = className;
    img.src = url;
    img.alt = name;
    img.width = size;
    img.height = size;
    img.style.cssText = 'width:' + size + 'px;height:' + size + 'px;object-fit:' + objectFit +
      ';display:block;border-radius:' + borderRadius;
    img.referrerPolicy = 'no-referrer';
    img.setAttribute('data-photo-step', '0');
    img.setAttribute('data-player-photo', name);
    img.setAttribute('data-player-name', name);
    img.setAttribute('data-player-sport', sport);
    img.setAttribute('data-player-team', team || '');
    img.setAttribute('data-logo-size', String(size));
    img.setAttribute('data-object-fit', objectFit);
    img.setAttribute('data-border-radius', String(borderRadius));
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
      var objectFit = el.getAttribute('data-object-fit') || 'cover';
      var borderRadius = el.getAttribute('data-border-radius');
      if (borderRadius == null || borderRadius === '') {
        borderRadius = normalizeSport(sport) === 'tennis' ? '10px' : '50%';
      }
      var key = cacheKey(name, sport, team);
      var cached = _memCache[key];
      var url = (cached && cached.headshotUrl) || getPlayerHeadshotUrl(name, sport);
      if (!url) return;
      if (el.tagName === 'IMG' && el.getAttribute('src') === url) return;
      if (!el.parentNode) return;
      el.parentNode.replaceChild(
        buildHeadshotImgNode(name, sport, size, team, className, url, {
          objectFit: objectFit,
          borderRadius: borderRadius
        }),
        el
      );
    });
  }


  var VERIFIED_SOCCER_TEAM_IDS = {
    '1. FC Union Berlin': 598,
    'Aberdeen': 263,
    'AC Milan': 103,
    'Académico': 21607,
    'Académico de Viseu': 21607,
    'ADO Den Haag': 2726,
    'AEK Athens': 887,
    'AFC Bournemouth': 349,
    'AJ Auxerre': 172,
    'Ajax': 139,
    'Ajax Amsterdam': 139,
    'Alanyaspor': 9078,
    'Alavés': 96,
    'Alverca': 21613,
    'América': 227,
    'Anderlecht': 441,
    'Angers': 7868,
    'Antwerp': 17544,
    'Ararat': 20024,
    'Ararat-Armenia': 20024,
    'Arouca': 15784,
    'Arsenal': 359,
    'AS Monaco': 174,
    'AS Roma': 104,
    'Aston Villa': 362,
    'Atalanta': 105,
    'Athletic': 93,
    'Athletic Club': 93,
    'Atl. San Luis': 15720,
    'Atlanta': 18418,
    'Atlanta United FC': 18418,
    'Atlante': 226,
    'Atlas': 216,
    'Atletico Madrid': 1068,
    'Atlético': 1068,
    'Atlético de San Luis': 15720,
    'Atlético Madrid': 1068,
    'Augsburg': 3841,
    'Austin': 20906,
    'Austin FC': 20906,
    'Auxerre': 172,
    'AZ Alkmaar': 140,
    'Barcelona': 83,
    'Barca': 83,
    'Barça': 83,
    'Bayer Leverkusen': 131,
    'Bayern': 132,
    'Bayern Munich': 132,
    'Benfica': 1929,
    'Besiktas': 1895,
    'Betis': 244,
    'Black Cats/Wearsiders': 366,
    'Blues': 363,
    'BODO': 2980,
    'Bodo/Glimt': 2980,
    'Bologna': 107,
    'Borussia Dortmund': 124,
    'Borussia Mönchengladbach': 268,
    'Bournemouth': 349,
    'Braga': 2994,
    'Bremen': 137,
    'Brentford': 337,
    'Brest': 6997,
    'Brighton': 331,
    'Brighton & Hove Albion': 331,
    'C Palace': 384,
    'C.D. Nacional': 3472,
    'Cagliari': 2925,
    'Cambuur': 3736,
    'Casa Pia': 21581,
    'Caykur Rizespor': 7656,
    'CDSC': 12215,
    'Celta Vigo': 85,
    'Celtic': 256,
    'Cercle Brugge': 3610,
    'Cercle Brugge KSV': 3610,
    'CF Montréal': 9720,
    'Charlotte': 21300,
    'Charlotte FC': 21300,
    'Chelsea': 363,
    'Chicago': 182,
    'Chicago Fire FC': 182,
    'Chivas': 219,
    'Cincinnati': 18267,
    'Club Brugge': 570,
    'Cologne': 122,
    'Colorado': 184,
    'Colorado Rapids': 184,
    'Columbus': 183,
    'Columbus Crew': 183,
    'Como': 2572,
    'COMO': 2572,
    'CORUMFK': 132334,
    'Coventry': 388,
    'Coventry City': 388,
    'CPAC': 21581,
    'Crew': 183,
    'Cruz Azul': 218,
    'Crystal Palace': 384,
    'D.C. United': 193,
    'Dallas': 185,
    'Deportivo': 90,
    'Dinamo Zagreb': 597,
    'Dortmund': 124,
    'Dundee': 261,
    'Dundee United': 264,
    'Dundee Utd': 264,
    'Dynamo': 6077,
    'Eagles': 384,
    'Earthquakes': 191,
    'Eintracht Frankfurt': 125,
    'Elche': 3751,
    'Elversberg': 10388,
    'Erzurum': 19267,
    'Erzurum BB': 19267,
    'Espanyol': 88,
    'Estoril': 12216,
    'Estrela': 21610,
    'Everton': 368,
    'Excelsior': 2566,
    'Eyupspor': 20729,
    'FALK': 254,
    'Falkirk': 254,
    'FC Augsburg': 3841,
    'FC Cincinnati': 18267,
    'FC Cologne': 122,
    'FC Dallas': 185,
    'FC Famalicao': 12698,
    'FC Groningen': 145,
    'FC Juarez': 17851,
    'FC Porto': 437,
    'FC Twente': 152,
    'FC Utrecht': 153,
    'Fenerbahce': 436,
    'Ferencvaros': 622,
    'Feyenoord': 142,
    'Feyenoord Rotterdam': 142,
    'Fiorentina': 109,
    'Fire': 182,
    'Fortuna': 143,
    'Fortuna Sittard': 143,
    'Frankfurt': 125,
    'Freiburg': 126,
    'Frosinone': 4057,
    'Fulham': 370,
    'Galatasaray': 432,
    'Galaxy': 187,
    'Gaziantep': 20070,
    'Gaziantep FK': 20070,
    'Genclerbirli': 996,
    'Genclerbirligi': 996,
    'GENK': 938,
    'Genk': 938,
    'Genoa': 3263,
    'GENT': 3611,
    'Getafe': 2922,
    'Gil Vicente': 3699,
    'Gladbach': 268,
    'Go Ahead Eagles': 3706,
    'Goztepe': 789,
    'Guadalajara': 219,
    'Gunners': 359,
    'GVFC': 3699,
    'Hamburg': 127,
    'Hamburg SV': 127,
    "Hapoel Be'er": 13083,
    'Heart of Midlothian': 262,
    'Hearts': 262,
    'Heerenveen': 146,
    'Hibernian': 258,
    'HIBS': 258,
    'Hoffenheim': 7911,
    'Houston': 6077,
    'Houston Dynamo FC': 6077,
    'Hull': 306,
    'Hull City': 306,
    'IBFK': 7914,
    'Impact': 9720,
    'Inter Miami': 20232,
    'Inter Miami CF': 20232,
    'Inter Milan': 110,
    'Internazionale': 110,
    'Ipswich': 373,
    'Ipswich Town': 373,
    'Istanbul Basaksehir': 7914,
    'Istanbul BB': 7914,
    'Jagiellonia ': 11505,
    'Jagiellonia Bialystok': 11505,
    'Juarez': 17851,
    'Juventus': 111,
    'KAA Gent': 3611,
    'Kansas City': 186,
    'Kasimpasa': 6870,
    'Kilmarnock': 260,
    'Kocaelispor': 995,
    'Konyaspor': 7648,
    'KV Kortrijk': 5786,
    'KV Mechelen': 7879,
    'KVC Westerlo': 606,
    'KVCW': 606,
    'La Franja': 231,
    'LA Galaxy': 187,
    'La Louvière': 131235,
    'LAFC': 18966,
    'LASK Linz': 4411,
    'Lazio': 112,
    'Le Havre AC': 3236,
    'Le Mans': 2697,
    'Lecce': 113,
    'LECH': 2990,
    'Lech Poznan': 2990,
    'Leeds': 357,
    'Leeds United': 357,
    'Leicester': 375,
    'Leicester City': 375,
    'Lens': 175,
    'Levante': 1538,
    'Leverkusen': 131,
    'LEVS': 490,
    'Levski Sofia': 490,
    'LILL': 166,
    'Lille': 166,
    'Lillestrom': 987,
    'Liverpool': 364,
    'Lommel SK': 22269,
    'Lorient': 273,
    'LYON': 167,
    'Lyon': 167,
    'Magpies/Toon': 361,
    'Mainz': 2950,
    'Man City': 382,
    'Man United': 360,
    'Man Utd': 360,
    'Manchester City': 382,
    'Manchester United': 360,
    'Maritimo': 552,
    'Marseille': 176,
    'Miami': 20232,
    'Milan': 103,
    'Minnesota': 17362,
    'Minnesota United FC': 17362,
    'Monaco': 174,
    'Monterrey': 220,
    'Monza': 4007,
    'Moreirense': 3696,
    'Motherwell': 266,
    'Málaga': 99,
    'Nacional': 3472,
    'Napoli': 114,
    'Nashville': 18986,
    'Nashville SC': 18986,
    'NEC Nijmegen': 147,
    'Necaxa': 229,
    'New England': 189,
    'New England Revolution': 189,
    'New York City FC': 17606,
    'Newcastle': 361,
    'Newcastle United': 361,
    'NICE': 2502,
    'Nice': 2502,
    'NK Celje': 3362,
    'Nottingham F.': 393,
    'Nottingham Forest': 393,
    'Nottm Forest': 393,
    'NYC FC': 17606,
    'NYCFC': 17606,
    'OFI Crete': 1010,
    'OH Leuven': 5579,
    'Olympiacos': 435,
    'OMON': 617,
    'Omonia': 617,
    'Omonia Nicosia': 617,
    'Orlando': 12011,
    'Orlando City SC': 12011,
    'Osasuna': 97,
    'Oud-Heverlee Leuven': 5579,
    'Pachuca': 234,
    'Paderborn': 3307,
    'Panzas Verdes': 228,
    'Paris FC': 6851,
    'Paris Saint-Germain': 160,
    'Parma': 115,
    'PEC Zwolle': 2565,
    'Philadelphia': 10739,
    'Philadelphia Union': 10739,
    'Portland': 9723,
    'Portland Timbers': 9723,
    'PSG': 160,
    'PSV Eindhoven': 148,
    'Puebla': 231,
    'Pumas': 233,
    'Pumas UNAM': 233,
    'Queretaro': 222,
    'Querétaro': 222,
    'RAAL La Louvière': 131235,
    'Racing': 87,
    'Racing Genk': 938,
    'Racing Santander': 87,
    'RAFC': 3822,
    'Rangers': 257,
    'Rapids': 184,
    'Rayados': 220,
    'Rayo': 101,
    'Rayo Vallecano': 101,
    'Rayos': 229,
    'RB Leipzig': 11420,
    'RB Salzburg': 2790,
    'RBNY': 190,
    'Real Betis': 244,
    'Real Madrid': 86,
    'Real Salt Lake': 4771,
    'Real Sociedad': 89,
    'Red Bull New York': 190,
    'Red Bull NY': 190,
    'Red Bulls': 190,
    'Red Devils': 360,
    'Reds': 364,
    'Rennes': 169,
    'Revolution': 189,
    'Rio Ave': 3822,
    'Rojos': 223,
    'ROMA': 104,
    'Royal Charleroi': 3616,
    'Royal Charleroi SC': 3616,
    'S Bratislava': 521,
    'Sabah': 21922,
    'Sabah FK': 21922,
    'Salt Lake': 4771,
    'Samsunspor': 11429,
    'San Diego': 22529,
    'San Diego FC': 22529,
    'San Jose': 191,
    'San Jose Earthquakes': 191,
    'Santa Clara': 12215,
    'Santos': 225,
    'Santos Laguna': 225,
    'Sassuolo': 3997,
    'SC Cambuur': 3736,
    'SC Freiburg': 126,
    'SC Paderborn 07': 3307,
    'Schalke': 133,
    'Schalke 04': 133,
    'Seagulls': 331,
    'Seattle': 9726,
    'Seattle Sounders': 9726,
    'Seattle Sounders FC': 9726,
    'Sevilla': 243,
    'Shakhtar': 493,
    'Shakhtar Donetsk': 493,
    'Sint-Truidense': 936,
    'SK Sturm Graz': 3746,
    'Sky Blues': 388,
    'Slavia Prague': 494,
    'Slovan Bratislava': 521,
    'Sounders': 9726,
    'Southampton': 376,
    'Sparta': 433,
    'Sparta Prague': 433,
    'Sparta Rotterdam': 151,
    'Sporting': 186,
    'Sporting CP': 2250,
    'Sporting Kansas City': 186,
    'Spurs': 367,
    'St Johnstone': 267,
    'St Mirren': 250,
    'St. Louis': 21812,
    'St. Louis CITY SC': 21812,
    'Stade Rennais': 169,
    'Standard Liege': 559,
    'Strasbourg': 180,
    'Sturm Graz': 3746,
    'Stuttgart': 134,
    'STVV': 936,
    'Sunderland': 366,
    'SV Elversberg': 10388,
    'Telstar': 3735,
    'Tigers': 306,
    'Tigres': 232,
    'Tigres UANL': 232,
    'Tijuana': 10125,
    'Timbers': 9723,
    'Toffees': 368,
    'Toluca': 223,
    'Torino': 239,
    'Toronto': 7318,
    'Toronto FC': 7318,
    'Tottenham Hotspur': 367,
    'Tottenham': 367,
    'Toulouse': 179,
    'TRAB': 997,
    'Trabzonspor': 997,
    'Tractor Boys': 373,
    'Troyes': 170,
    'TSG Hoffenheim': 7911,
    'UANL': 232,
    'Udinese': 118,
    'UNAM': 233,
    'Union': 10739,
    'Union Berlin': 598,
    'Union SG': 5807,
    'Union St.-Gilloise': 5807,
    'United': 193,
    'Valencia': 94,
    'Vancouver': 9727,
    'Vancouver Whitecaps': 9727,
    'Venezia': 17530,
    'VfB Stuttgart': 134,
    'VfL Wolfsburg': 138,
    'Viking FK': 510,
    'Viktoria Plzen': 11706,
    'Villarreal': 102,
    'Vitória ': 5309,
    'Vitória de Guimaraes': 5309,
    'Waasland-Beveren': 13450,
    'Werder Bremen': 137,
    'West Ham': 371,
    'West Ham United': 371,
    'Westerlo': 606,
    'Whitecaps': 9727,
    'Willem II': 156,
    'Wolfsburg': 138,
    'Wolverhampton Wanderers': 380,
    'Wolves': 380,
    'Zulte-Waregem': 4691,
    'Çorum FK': 132334
  };

  // NCAAF logos: https://a.espncdn.com/i/teamlogos/ncaa/500/{espnTeamId}.png
  // IDs from ESPN search (sport=football / college-football); logo URLs HTTP 200 verified.
  var VERIFIED_NCAAF_TEAM_IDS = {
    "Alabama Crimson Tide": 333,
    "Arizona State Sun Devils": 9,
    "Arizona Wildcats": 12,
    "Arkansas Razorbacks": 8,
    "Auburn Tigers": 2,
    "Baylor Bears": 239,
    "Boise State Broncos": 68,
    "Boston College Eagles": 103,
    "BYU Cougars": 252,
    "California Golden Bears": 25,
    "Cincinnati Bearcats": 2132,
    "Clemson Tigers": 228,
    "Colorado Buffaloes": 38,
    "Duke Blue Devils": 150,
    "Florida Gators": 57,
    "Florida State Seminoles": 52,
    "Georgia Bulldogs": 61,
    "Georgia Tech Yellow Jackets": 59,
    "Houston Cougars": 248,
    "Illinois Fighting Illini": 356,
    "Indiana Hoosiers": 84,
    "Iowa Hawkeyes": 2294,
    "Iowa State Cyclones": 66,
    "Kansas Jayhawks": 2305,
    "Kansas State Wildcats": 2306,
    "Kentucky Wildcats": 96,
    "Louisville Cardinals": 97,
    "LSU Tigers": 99,
    "Maryland Terrapins": 120,
    "Miami Hurricanes": 2390,
    "Michigan State Spartans": 127,
    "Michigan Wolverines": 130,
    "Minnesota Golden Gophers": 135,
    "Mississippi State Bulldogs": 344,
    "Missouri Tigers": 142,
    "Nebraska Cornhuskers": 158,
    "North Carolina State Wolfpack": 152,
    "North Carolina Tar Heels": 153,
    "Northwestern Wildcats": 77,
    "Notre Dame Fighting Irish": 87,
    "Ohio State Buckeyes": 194,
    "Oklahoma Sooners": 201,
    "Oklahoma State Cowboys": 197,
    "Ole Miss Rebels": 145,
    "Oregon Ducks": 2483,
    "Oregon State Beavers": 204,
    "Penn State Nittany Lions": 213,
    "Pittsburgh Panthers": 221,
    "Purdue Boilermakers": 2509,
    "Rutgers Scarlet Knights": 164,
    "SMU Mustangs": 2567,
    "South Carolina Gamecocks": 2579,
    "Stanford Cardinal": 24,
    "Syracuse Orange": 183,
    "TCU Horned Frogs": 2628,
    "Tennessee Volunteers": 2633,
    "Texas A&M Aggies": 245,
    "Texas Longhorns": 251,
    "Texas Tech Red Raiders": 2641,
    "UCF Knights": 2116,
    "UCLA Bruins": 26,
    "USC Trojans": 30,
    "Utah Utes": 254,
    "Vanderbilt Commodores": 238,
    "Virginia Cavaliers": 258,
    "Virginia Tech Hokies": 259,
    "Wake Forest Demon Deacons": 154,
    "Washington Huskies": 264,
    "Washington State Cougars": 265,
    "West Virginia Mountaineers": 277,
    "Wisconsin Badgers": 275,
    "ALA": 333,
    "Alabama": 333,
    "ARIZ": 12,
    "Arizona": 12,
    "Arizona State": 9,
    "ARK": 8,
    "Arkansas": 8,
    "ASU": 9,
    "AUB": 2,
    "Auburn": 2,
    "BAY": 239,
    "Baylor": 239,
    "BC": 103,
    "BOIS": 68,
    "Boise State": 68,
    "Boston College": 103,
    "BYU": 252,
    "CAL": 25,
    "California": 25,
    "CIN": 2132,
    "Cincinnati": 2132,
    "CLEM": 228,
    "Clemson": 228,
    "COLO": 38,
    "Colorado": 38,
    "Duke": 150,
    "DUKE": 150,
    "FLA": 57,
    "Florida": 57,
    "Florida State": 52,
    "FSU": 52,
    "Georgia": 61,
    "Georgia Tech": 59,
    "GT": 59,
    "HOU": 248,
    "Houston": 248,
    "ILL": 356,
    "Illinois": 356,
    "Indiana": 84,
    "Iowa": 2294,
    "IOWA": 2294,
    "Iowa State": 66,
    "ISU": 66,
    "IU": 84,
    "Kansas": 2305,
    "Kansas State": 2306,
    "Kentucky": 96,
    "KSU": 2306,
    "KU": 2305,
    "LOU": 97,
    "Louisville": 97,
    "LSU": 99,
    "Maryland": 120,
    "MD": 120,
    "MIA": 2390,
    "Miami": 2390,
    "MICH": 130,
    "Michigan": 130,
    "Michigan State": 127,
    "MINN": 135,
    "Minnesota": 135,
    "MISS": 145,
    "Mississippi State": 344,
    "Missouri": 142,
    "MIZ": 142,
    "MSST": 344,
    "MSU": 127,
    "NC State": 152,
    "NC State Wolfpack": 152,
    "NCSU": 152,
    "ND": 87,
    "NEB": 158,
    "Nebraska": 158,
    "North Carolina": 153,
    "Northwestern": 77,
    "Notre Dame": 87,
    "NU": 77,
    "Ohio State": 194,
    "Oklahoma": 201,
    "Oklahoma State": 197,
    "OKST": 197,
    "Ole Miss": 145,
    "ORE": 2483,
    "Oregon": 2483,
    "Oregon State": 204,
    "ORST": 204,
    "OSU": 194,
    "OU": 201,
    "Penn State": 213,
    "PITT": 221,
    "Pittsburgh": 221,
    "PSU": 213,
    "PUR": 2509,
    "Purdue": 2509,
    "RUTG": 164,
    "Rutgers": 164,
    "SC": 2579,
    "SMU": 2567,
    "South Carolina": 2579,
    "STAN": 24,
    "Stanford": 24,
    "SYR": 183,
    "Syracuse": 183,
    "TA&M": 245,
    "TAMU": 245,
    "TCU": 2628,
    "TENN": 2633,
    "Tennessee": 2633,
    "TEX": 251,
    "Texas": 251,
    "Texas A&M": 245,
    "Texas Tech": 2641,
    "TTU": 2641,
    "UCF": 2116,
    "UCLA": 26,
    "UGA": 61,
    "UK": 96,
    "UNC": 153,
    "USC": 30,
    "Utah": 254,
    "UTAH": 254,
    "UVA": 258,
    "VAN": 238,
    "Vanderbilt": 238,
    "Virginia": 258,
    "Virginia Tech": 259,
    "VT": 259,
    "WAKE": 154,
    "Wake Forest": 154,
    "WASH": 264,
    "Washington": 264,
    "Washington State": 265,
    "West Virginia": 277,
    "WIS": 275,
    "Wisconsin": 275,
    "WSU": 265,
    "WVU": 277
  };

  global.VERIFIED_PLAYER_IDS = VERIFIED_PLAYER_IDS;
  global.VERIFIED_SOCCER_TEAM_IDS = VERIFIED_SOCCER_TEAM_IDS;
  global.VERIFIED_NCAAF_TEAM_IDS = VERIFIED_NCAAF_TEAM_IDS;
  global.getVerifiedPlayerId = getVerifiedPlayerId;
  global.getPlayerHeadshotUrl = getPlayerHeadshotUrl;
  global.searchEspnPlayerId = searchEspnPlayerId;
  global.getPlayerPhotoImg = getPlayerPhotoImg;
  global.getTennisPlayerPhotoImg = function (name, size) {
    return getPlayerPhotoImg(name, 'tennis', size || 52, { borderRadius: '10px' });
  };
  global.getMmaFighterPhotoImg = function (name, size) {
    return getPlayerPhotoImg(name, 'mma', size || 52, { borderRadius: '10px' });
  };
  global.handlePlayerPhotoError = handlePlayerPhotoError;
  global.hydratePlayerPhotos = hydratePlayerPhotos;
  global.clearPlayerPhotoCache = clearPlayerPhotoCache;
  global.playerPhotoCacheKey = cacheKey;
  global.playerPhotoInitialsHtml = initialsHtml;
})(typeof window !== 'undefined' ? window : this);
