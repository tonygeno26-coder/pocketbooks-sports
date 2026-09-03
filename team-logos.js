/**
 * Shared team logo system for PocketBooks Sports (vanilla HTML).
 * ESPN CDN with combiner URL primary + direct /500/ fallback + initials circle.
 */
(function (global) {
  'use strict';

  var TEAM_LOGOS = {
    nfl: function (abbrev) { return 'https://a.espncdn.com/i/teamlogos/nfl/500/' + abbrev + '.png'; },
    nba: function (abbrev) { return 'https://a.espncdn.com/i/teamlogos/nba/500/' + abbrev + '.png'; },
    mlb: function (abbrev) { return 'https://a.espncdn.com/i/teamlogos/mlb/500/' + abbrev + '.png'; },
    nhl: function (abbrev) { return 'https://a.espncdn.com/i/teamlogos/nhl/500/' + abbrev + '.png'; },
    ncaafb: function (abbrev) { return 'https://a.espncdn.com/i/teamlogos/ncaa/500/' + abbrev + '.png'; },
    ncaab: function (abbrev) { return 'https://a.espncdn.com/i/teamlogos/ncaa/500/' + abbrev + '.png'; },
    wnba: function (abbrev) { return 'https://a.espncdn.com/i/teamlogos/wnba/500/' + abbrev + '.png'; },
    mls: function (abbrev) { return 'https://a.espncdn.com/i/teamlogos/soccer/500/' + abbrev + '.png'; }
  };

  var SPORT_ALIASES = {
    baseball_mlb: 'mlb', mlb: 'mlb',
    basketball_nba: 'nba', nba: 'nba',
    basketball_wnba: 'wnba', wnba: 'wnba',
    americanfootball_nfl: 'nfl', nfl: 'nfl',
    icehockey_nhl: 'nhl', nhl: 'nhl',
    basketball_ncaab: 'ncaab', ncaab: 'ncaab',
    americanfootball_ncaaf: 'ncaafb', ncaaf: 'ncaafb', ncaafb: 'ncaafb',
    soccer: 'mls', soccer_mls: 'mls', mls: 'mls'
  };

  function _buildMaps(fullToAbbrev, aliasMap, colorMap) {
    return { fullToAbbrev: fullToAbbrev, aliases: aliasMap || {}, colors: colorMap || {} };
  }

  var NFL_FULL = {
    'Arizona Cardinals': 'ari', 'Atlanta Falcons': 'atl', 'Baltimore Ravens': 'bal',
    'Buffalo Bills': 'buf', 'Carolina Panthers': 'car', 'Chicago Bears': 'chi',
    'Cincinnati Bengals': 'cin', 'Cleveland Browns': 'cle', 'Dallas Cowboys': 'dal',
    'Denver Broncos': 'den', 'Detroit Lions': 'det', 'Green Bay Packers': 'gb',
    'Houston Texans': 'hou', 'Indianapolis Colts': 'ind', 'Jacksonville Jaguars': 'jax',
    'Kansas City Chiefs': 'kc', 'Las Vegas Raiders': 'lv', 'Los Angeles Chargers': 'lac',
    'Los Angeles Rams': 'lar', 'Miami Dolphins': 'mia', 'Minnesota Vikings': 'min',
    'New England Patriots': 'ne', 'New Orleans Saints': 'no', 'New York Giants': 'nyg',
    'New York Jets': 'nyj', 'Philadelphia Eagles': 'phi', 'Pittsburgh Steelers': 'pit',
    'San Francisco 49ers': 'sf', 'Seattle Seahawks': 'sea', 'Tampa Bay Buccaneers': 'tb',
    'Tennessee Titans': 'ten', 'Washington Commanders': 'wsh'
  };

  var MLB_FULL = {
    'Arizona Diamondbacks': 'ari', 'Atlanta Braves': 'atl', 'Baltimore Orioles': 'bal',
    'Boston Red Sox': 'bos', 'Chicago Cubs': 'chc', 'Chicago White Sox': 'chw',
    'Cincinnati Reds': 'cin', 'Cleveland Guardians': 'cle', 'Colorado Rockies': 'col',
    'Detroit Tigers': 'det', 'Houston Astros': 'hou', 'Kansas City Royals': 'kc',
    'Los Angeles Angels': 'laa', 'Los Angeles Dodgers': 'lad', 'Miami Marlins': 'mia',
    'Milwaukee Brewers': 'mil', 'Minnesota Twins': 'min', 'New York Mets': 'nym',
    'New York Yankees': 'nyy', 'Oakland Athletics': 'oak', 'Philadelphia Phillies': 'phi',
    'Pittsburgh Pirates': 'pit', 'San Diego Padres': 'sd', 'San Francisco Giants': 'sf',
    'Seattle Mariners': 'sea', 'St. Louis Cardinals': 'stl', 'Tampa Bay Rays': 'tb',
    'Texas Rangers': 'tex', 'Toronto Blue Jays': 'tor', 'Washington Nationals': 'wsh'
  };

  var NBA_FULL = {
    'Atlanta Hawks': 'atl', 'Boston Celtics': 'bos', 'Brooklyn Nets': 'bkn',
    'Charlotte Hornets': 'cha', 'Chicago Bulls': 'chi', 'Cleveland Cavaliers': 'cle',
    'Dallas Mavericks': 'dal', 'Denver Nuggets': 'den', 'Detroit Pistons': 'det',
    'Golden State Warriors': 'gs', 'Houston Rockets': 'hou', 'Indiana Pacers': 'ind',
    'Los Angeles Clippers': 'lac', 'Los Angeles Lakers': 'lal', 'Memphis Grizzlies': 'mem',
    'Miami Heat': 'mia', 'Milwaukee Bucks': 'mil', 'Minnesota Timberwolves': 'min',
    'New Orleans Pelicans': 'no', 'New York Knicks': 'ny', 'Oklahoma City Thunder': 'okc',
    'Orlando Magic': 'orl', 'Philadelphia 76ers': 'phi', 'Phoenix Suns': 'phx',
    'Portland Trail Blazers': 'por', 'Sacramento Kings': 'sac', 'San Antonio Spurs': 'sa',
    'Toronto Raptors': 'tor', 'Utah Jazz': 'utah', 'Washington Wizards': 'wsh'
  };

  var NHL_FULL = {
    'Anaheim Ducks': 'ana', 'Boston Bruins': 'bos', 'Buffalo Sabres': 'buf',
    'Calgary Flames': 'cgy', 'Carolina Hurricanes': 'car', 'Chicago Blackhawks': 'chi',
    'Colorado Avalanche': 'col', 'Columbus Blue Jackets': 'cbj', 'Dallas Stars': 'dal',
    'Detroit Red Wings': 'det', 'Edmonton Oilers': 'edm', 'Florida Panthers': 'fla',
    'Los Angeles Kings': 'la', 'Minnesota Wild': 'min', 'Montreal Canadiens': 'mtl',
    'Nashville Predators': 'nsh', 'New Jersey Devils': 'nj', 'New York Islanders': 'nyi',
    'New York Rangers': 'nyr', 'Ottawa Senators': 'ott', 'Philadelphia Flyers': 'phi',
    'Pittsburgh Penguins': 'pit', 'San Jose Sharks': 'sj', 'Seattle Kraken': 'sea',
    'St. Louis Blues': 'stl', 'Tampa Bay Lightning': 'tb', 'Toronto Maple Leafs': 'tor',
    'Utah Hockey Club': 'uta', 'Vancouver Canucks': 'van', 'Vegas Golden Knights': 'vgk',
    'Washington Capitals': 'wsh', 'Winnipeg Jets': 'wpg'
  };

  var WNBA_FULL = {
    'Atlanta Dream': 'atl', 'Chicago Sky': 'chi', 'Connecticut Sun': 'conn',
    'Dallas Wings': 'dal', 'Indiana Fever': 'ind', 'Las Vegas Aces': 'lv',
    'Los Angeles Sparks': 'la', 'Minnesota Lynx': 'min', 'New York Liberty': 'ny',
    'Phoenix Mercury': 'phx', 'Seattle Storm': 'sea', 'Washington Mystics': 'wsh'
  };

  var MLS_FULL = {
    'Atlanta United FC': 'atl', 'Austin FC': 'atx', 'Charlotte FC': 'clt',
    'Chicago Fire FC': 'chi', 'FC Cincinnati': 'cin', 'Colorado Rapids': 'col',
    'Columbus Crew': 'clb', 'D.C. United': 'dc', 'FC Dallas': 'dal',
    'Houston Dynamo FC': 'hou', 'Inter Miami CF': 'mia', 'LA Galaxy': 'la',
    'Los Angeles FC': 'lafc', 'Minnesota United FC': 'min', 'CF Montréal': 'mtl',
    'Nashville SC': 'nsh', 'New England Revolution': 'ne', 'New York City FC': 'nyc',
    'New York Red Bulls': 'ny', 'Orlando City SC': 'orl', 'Philadelphia Union': 'phi',
    'Portland Timbers': 'por', 'Real Salt Lake': 'rsl', 'San Jose Earthquakes': 'sj',
    'Seattle Sounders FC': 'sea', 'Sporting Kansas City': 'kc', 'St. Louis CITY SC': 'stl',
    'Toronto FC': 'tor', 'Vancouver Whitecaps FC': 'van'
  };

  // Major NCAAF programs (ESPN NCAA abbrev keys)
  var NCAAF_FULL = {
    'Alabama Crimson Tide': 'ala', 'Arizona State Sun Devils': 'asu', 'Arizona Wildcats': 'ariz',
    'Arkansas Razorbacks': 'ark', 'Auburn Tigers': 'aub', 'Baylor Bears': 'bay',
    'Boise State Broncos': 'boise', 'Boston College Eagles': 'bc', 'BYU Cougars': 'byu',
    'California Golden Bears': 'cal', 'Cincinnati Bearcats': 'cin', 'Clemson Tigers': 'clem',
    'Colorado Buffaloes': 'col', 'Duke Blue Devils': 'duke', 'Florida Gators': 'fla',
    'Florida State Seminoles': 'fsu', 'Georgia Bulldogs': 'uga', 'Georgia Tech Yellow Jackets': 'gt',
    'Iowa Hawkeyes': 'iowa', 'Iowa State Cyclones': 'isu', 'Kansas Jayhawks': 'ku',
    'Kansas State Wildcats': 'ksu', 'Kentucky Wildcats': 'uk', 'Louisville Cardinals': 'lou',
    'LSU Tigers': 'lsu', 'Maryland Terrapins': 'md', 'Miami Hurricanes': 'mia',
    'Michigan State Spartans': 'msu', 'Michigan Wolverines': 'mich', 'Minnesota Golden Gophers': 'minn',
    'Mississippi State Bulldogs': 'msst', 'Missouri Tigers': 'mizz', 'Nebraska Cornhuskers': 'neb',
    'North Carolina Tar Heels': 'unc', 'North Carolina State Wolfpack': 'ncst',
    'Notre Dame Fighting Irish': 'nd', 'Ohio State Buckeyes': 'ohio-st', 'Oklahoma Sooners': 'okla',
    'Oklahoma State Cowboys': 'okst', 'Oregon Ducks': 'ore', 'Oregon State Beavers': 'orst',
    'Penn State Nittany Lions': 'psu', 'Pittsburgh Panthers': 'pitt', 'Purdue Boilermakers': 'purdue',
    'Rutgers Scarlet Knights': 'rutgers', 'South Carolina Gamecocks': 'sc', 'Stanford Cardinal': 'stan',
    'TCU Horned Frogs': 'tcu', 'Tennessee Volunteers': 'tenn', 'Texas A&M Aggies': 'tam',
    'Texas Longhorns': 'tex', 'Texas Tech Red Raiders': 'ttu', 'UCLA Bruins': 'ucla',
    'USC Trojans': 'usc', 'Utah Utes': 'utah', 'Virginia Cavaliers': 'uva',
    'Virginia Tech Hokies': 'vt', 'Washington Huskies': 'wash', 'Washington State Cougars': 'wsu',
    'West Virginia Mountaineers': 'wvu', 'Wisconsin Badgers': 'wisc'
  };

  // Major NCAAB programs
  var NCAAB_FULL = {
    'Alabama Crimson Tide': 'ala', 'Arizona Wildcats': 'ariz', 'Arkansas Razorbacks': 'ark',
    'Auburn Tigers': 'aub', 'Baylor Bears': 'bay', 'BYU Cougars': 'byu',
    'Cincinnati Bearcats': 'cin', 'Clemson Tigers': 'clem', 'Connecticut Huskies': 'uconn',
    'Creighton Bluejays': 'creighton', 'Duke Blue Devils': 'duke', 'Florida Gators': 'fla',
    'Florida State Seminoles': 'fsu', 'Gonzaga Bulldogs': 'gonzaga', 'Houston Cougars': 'hou',
    'Illinois Fighting Illini': 'ill', 'Indiana Hoosiers': 'ind', 'Iowa Hawkeyes': 'iowa',
    'Iowa State Cyclones': 'isu', 'Kansas Jayhawks': 'ku', 'Kansas State Wildcats': 'ksu',
    'Kentucky Wildcats': 'uk', 'Louisville Cardinals': 'lou', 'LSU Tigers': 'lsu',
    'Marquette Golden Eagles': 'marquette', 'Maryland Terrapins': 'md', 'Memphis Tigers': 'mem',
    'Michigan State Spartans': 'msu', 'Michigan Wolverines': 'mich', 'North Carolina Tar Heels': 'unc',
    'Notre Dame Fighting Irish': 'nd', 'Ohio State Buckeyes': 'ohio-st', 'Oklahoma Sooners': 'okla',
    'Oregon Ducks': 'ore', 'Purdue Boilermakers': 'purdue', 'San Diego State Aztecs': 'sdsu',
    'Tennessee Volunteers': 'tenn', 'Texas Longhorns': 'tex', 'Texas Tech Red Raiders': 'ttu',
    'UCLA Bruins': 'ucla', 'USC Trojans': 'usc', 'Villanova Wildcats': 'villanova',
    'Virginia Cavaliers': 'uva', 'Wisconsin Badgers': 'wisc', 'Xavier Musketeers': 'xavier'
  };

  function _aliasFromFull(fullMap, extra) {
    var out = {};
    Object.keys(fullMap).forEach(function (full) {
      var parts = full.split(' ');
      var last = parts[parts.length - 1];
      var lastTwo = parts.slice(-2).join(' ');
      if (!out[last]) out[last] = full;
      if (!out[lastTwo]) out[lastTwo] = full;
      out[fullMap[full].toUpperCase()] = full;
    });
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  var NFL_ALIASES = _aliasFromFull(NFL_FULL, {
    'ARI': 'Arizona Cardinals', 'ATL': 'Atlanta Falcons', 'BAL': 'Baltimore Ravens',
    'BUF': 'Buffalo Bills', 'CAR': 'Carolina Panthers', 'CHI': 'Chicago Bears',
    'CIN': 'Cincinnati Bengals', 'CLE': 'Cleveland Browns', 'DAL': 'Dallas Cowboys',
    'DEN': 'Denver Broncos', 'DET': 'Detroit Lions', 'GB': 'Green Bay Packers',
    'HOU': 'Houston Texans', 'IND': 'Indianapolis Colts', 'JAX': 'Jacksonville Jaguars',
    'JAC': 'Jacksonville Jaguars', 'KC': 'Kansas City Chiefs', 'LV': 'Las Vegas Raiders',
    'LAC': 'Los Angeles Chargers', 'LAR': 'Los Angeles Rams', 'MIA': 'Miami Dolphins',
    'MIN': 'Minnesota Vikings', 'NE': 'New England Patriots', 'NO': 'New Orleans Saints',
    'NYG': 'New York Giants', 'NYJ': 'New York Jets', 'PHI': 'Philadelphia Eagles',
    'PIT': 'Pittsburgh Steelers', 'SF': 'San Francisco 49ers', 'SEA': 'Seattle Seahawks',
    'TB': 'Tampa Bay Buccaneers', 'TEN': 'Tennessee Titans', 'WSH': 'Washington Commanders',
    'WAS': 'Washington Commanders', 'LA Rams': 'Los Angeles Rams', 'LA Chargers': 'Los Angeles Chargers',
    'Washington Football Team': 'Washington Commanders'
  });

  var TEAM_DATA = {
    nfl: _buildMaps(NFL_FULL, NFL_ALIASES, {
      'Kansas City Chiefs': { bg: '#E31837', fg: '#FFB612' },
      'San Francisco 49ers': { bg: '#AA0000', fg: '#B3995D' },
      'Dallas Cowboys': { bg: '#041E42', fg: '#869397' },
      'Green Bay Packers': { bg: '#203731', fg: '#FFB612' },
      'Philadelphia Eagles': { bg: '#004C54', fg: '#A5ACAF' }
    }),
    mlb: _buildMaps(MLB_FULL, _aliasFromFull(MLB_FULL), {
      'New York Yankees': { bg: '#003087', fg: '#E4002C' },
      'Los Angeles Dodgers': { bg: '#005A9C', fg: '#EF3E42' },
      'Boston Red Sox': { bg: '#BD3039', fg: '#0C2340' }
    }),
    nba: _buildMaps(NBA_FULL, _aliasFromFull(NBA_FULL), {
      'Los Angeles Lakers': { bg: '#552583', fg: '#FDB927' },
      'Boston Celtics': { bg: '#007A33', fg: '#BA9653' },
      'Golden State Warriors': { bg: '#1D428A', fg: '#FFC72C' }
    }),
    nhl: _buildMaps(NHL_FULL, _aliasFromFull(NHL_FULL), {
      'Toronto Maple Leafs': { bg: '#00205B', fg: '#FFFFFF' },
      'Boston Bruins': { bg: '#FFB81C', fg: '#000000' },
      'Vegas Golden Knights': { bg: '#B4975A', fg: '#333F42' }
    }),
    wnba: _buildMaps(WNBA_FULL, _aliasFromFull(WNBA_FULL), {}),
    mls: _buildMaps(MLS_FULL, _aliasFromFull(MLS_FULL), {}),
    ncaafb: _buildMaps(NCAAF_FULL, _aliasFromFull(NCAAF_FULL), {}),
    ncaab: _buildMaps(NCAAB_FULL, _aliasFromFull(NCAAB_FULL), {})
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function normalizeSport(sport) {
    var s = String(sport || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    return SPORT_ALIASES[s] || s || 'mlb';
  }

  function teamMatches(a, b) {
    var na = String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    var nb = String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!na || !nb) return false;
    return na === nb || na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0;
  }

  function resolveTeamName(name, sport) {
    if (!name) return '';
    sport = normalizeSport(sport);
    var data = TEAM_DATA[sport];
    if (!data) return String(name).trim();
    var n = String(name).trim();
    if (data.fullToAbbrev[n]) return n;
    var alias = data.aliases[n] || data.aliases[n.toUpperCase()];
    if (alias && data.fullToAbbrev[alias]) return alias;
    var keys = Object.keys(data.fullToAbbrev);
    for (var i = 0; i < keys.length; i++) {
      if (teamMatches(keys[i], n)) return keys[i];
    }
    return n;
  }

  function getTeamAbbrev(teamName, sport) {
    sport = normalizeSport(sport);
    var data = TEAM_DATA[sport];
    if (!data) return '';
    var key = resolveTeamName(teamName, sport);
    var ab = data.fullToAbbrev[key];
    if (ab) return ab;
    var parts = String(teamName || '').trim().split(/\s+/);
    return (parts[parts.length - 1] || '?').slice(0, 3).toLowerCase();
  }

  function getTeamInitials(teamName) {
    var key = resolveTeamName(teamName);
    var parts = String(key || teamName || '').trim().split(/\s+/);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function getTeamColors(teamName, sport) {
    sport = normalizeSport(sport);
    var data = TEAM_DATA[sport];
    var key = resolveTeamName(teamName, sport);
    if (data && data.colors && data.colors[key]) return data.colors[key];
    var hash = 0;
    var s = key || teamName || '?';
    for (var i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
    var hue = Math.abs(hash) % 360;
    return { bg: 'hsl(' + hue + ',45%,32%)', fg: '#fff' };
  }

  function _directLogoUrl(sport, abbrev) {
    var builder = TEAM_LOGOS[sport];
    if (!builder || !abbrev) return '';
    return builder(abbrev);
  }

  function _combinerLogoUrl(sport, abbrev, size) {
    var direct = _directLogoUrl(sport, abbrev);
    if (!direct) return '';
    var path = direct.replace('https://a.espncdn.com', '');
    var sz = size || 80;
    return 'https://a.espncdn.com/combiner/i?img=' + encodeURIComponent(path) + '&w=' + sz + '&h=' + sz;
  }

  function getTeamLogo(teamName, sport, size) {
    sport = normalizeSport(sport);
    var abbrev = getTeamAbbrev(teamName, sport);
    if (!abbrev || !TEAM_LOGOS[sport]) return '';
    return _combinerLogoUrl(sport, abbrev, size || 80);
  }

  function getTeamLogoDirect(teamName, sport) {
    sport = normalizeSport(sport);
    return _directLogoUrl(sport, getTeamAbbrev(teamName, sport));
  }

  function _fallbackHtml(teamName, sport, size, className) {
    var colors = getTeamColors(teamName, sport);
    var initials = getTeamInitials(teamName);
    var cls = className ? ' class="' + esc(className) + '"' : '';
    return '<div' + cls + ' style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:' + colors.bg + ';color:' + colors.fg + ';font-size:' + Math.max(8, Math.round(size * 0.32)) + 'px;font-weight:900;letter-spacing:0.3px;flex-shrink:0" aria-hidden="true">' + esc(initials) + '</div>';
  }

  function getTeamLogoImg(teamName, sport, size, className) {
    size = size || 40;
    sport = normalizeSport(sport);
    var combiner = getTeamLogo(teamName, sport, size);
    var direct = getTeamLogoDirect(teamName, sport);
    var initials = getTeamInitials(teamName);
    if (!combiner) return _fallbackHtml(teamName, sport, size, className);

    var cls = className ? ' class="' + esc(className) + '"' : '';
    return '<img' + cls +
      ' src="' + esc(combiner) + '"' +
      ' alt="' + esc(teamName || initials) + '"' +
      ' width="' + size + '" height="' + size + '"' +
      ' style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;display:block"' +
      ' referrerpolicy="no-referrer"' +
      ' data-logo-step="0"' +
      ' data-team-name="' + esc(teamName) + '"' +
      ' data-team-sport="' + esc(sport) + '"' +
      ' data-logo-direct="' + esc(direct) + '"' +
      ' data-logo-size="' + size + '"' +
      (className ? ' data-logo-class="' + esc(className) + '"' : '') +
      ' onerror="window.handleTeamLogoError&&window.handleTeamLogoError(this)">';
  }

  function handleTeamLogoError(img) {
    if (!img) return;
    var step = parseInt(img.getAttribute('data-logo-step') || '0', 10);
    var direct = img.getAttribute('data-logo-direct') || '';
    var teamName = img.getAttribute('data-team-name') || img.alt || '';
    var sport = img.getAttribute('data-team-sport') || 'mlb';
    var size = parseInt(img.getAttribute('data-logo-size') || '40', 10);
    var className = img.getAttribute('data-logo-class') || '';

    if (step === 0 && direct) {
      img.setAttribute('data-logo-step', '1');
      img.src = direct;
      return;
    }

    var fb = _fallbackHtml(teamName, sport, size, className);
    if (img.id === 'pick-confirm-logo') {
      img.style.display = 'none';
      var el = document.getElementById('pick-confirm-logo-fb');
      if (el) {
        el.textContent = getTeamInitials(teamName);
        el.style.display = 'flex';
      }
      return;
    }
    img.outerHTML = fb;
  }

  function extractTeamFromPick(pick, homeTeam, awayTeam, sport) {
    var p = String(pick || '').trim();
    if (!p) return '';
    if (/^(over|under)\b/i.test(p)) return '';
    var home = resolveTeamName(homeTeam, sport);
    var away = resolveTeamName(awayTeam, sport);
    if (home && teamMatches(p, home)) return home;
    if (away && teamMatches(p, away)) return away;
    var stripped = p.replace(/\s+[+-]?\d+(\.\d+)?\s*$/, '').replace(/\s+(ml|to win)\s*$/i, '').trim();
    if (home && teamMatches(stripped, home)) return home;
    if (away && teamMatches(stripped, away)) return away;
    return resolveTeamName(stripped, sport) || stripped;
  }

  // ── Soccer ESPN team IDs + Tennis player headshots ──────────────────────
  // Soccer logos: https://a.espncdn.com/i/teamlogos/soccer/500/{espnTeamId}.png
  // Tennis photos: https://a.espncdn.com/i/headshots/tennis/players/full/{espnPlayerId}.png
  // Teams list endpoint soccer/all/teams 404s; per-league teams endpoints lack
  // browser CORS. Prefer ESPN common search (ACAO: *) for lookups; optionally
  // warm a multi-league cache when a proxy or CORS allows it.

  var _soccerIdByNorm = {};      // normalized name → espn team id string
  var _soccerMetaByNorm = {};    // normalized name → { id, abbr, displayName }
  var _soccerMiss = {};          // normalized name → true
  var _soccerPending = {};       // in-flight lookups
  var _soccerCacheWarmed = false;
  var _soccerWarmPromise = null;

  var _tennisIdByNorm = {};
  var _tennisMiss = {};
  var _tennisPending = {};

  var SOCCER_LEAGUE_SLUGS = [
    'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'usa.1',
    'uefa.champions', 'uefa.europa', 'fifa.world', 'mex.1', 'ned.1', 'por.1',
    'uefa.nations', 'eng.2', 'esp.2'
  ];

  /** FIFA/common 3-letter (and name) → flagcdn ISO code */
  var COUNTRY_FLAG_CODES = {
    usa: 'us', 'united states': 'us', 'united states of america': 'us', usmnt: 'us',
    eng: 'gb-eng', england: 'gb-eng',
    sco: 'gb-sct', scotland: 'gb-sct',
    wal: 'gb-wls', wales: 'gb-wls',
    nir: 'gb-nir', 'northern ireland': 'gb-nir',
    fra: 'fr', france: 'fr',
    ger: 'de', germany: 'de', deu: 'de',
    esp: 'es', spain: 'es',
    ita: 'it', italy: 'it',
    por: 'pt', portugal: 'pt',
    ned: 'nl', netherlands: 'nl', hol: 'nl',
    bel: 'be', belgium: 'be',
    bra: 'br', brazil: 'br',
    arg: 'ar', argentina: 'ar',
    mex: 'mx', mexico: 'mx',
    can: 'ca', canada: 'ca',
    jpn: 'jp', japan: 'jp',
    kor: 'kr', 'south korea': 'kr', korea: 'kr',
    aus: 'au', australia: 'au',
    nzl: 'nz', 'new zealand': 'nz',
    uru: 'uy', uruguay: 'uy',
    chi: 'cl', chile: 'cl',
    col: 'co', colombia: 'co',
    per: 'pe', peru: 'pe',
    ecu: 'ec', ecuador: 'ec',
    par: 'py', paraguay: 'py',
    bol: 'bo', bolivia: 'bo',
    ven: 've', venezuela: 've',
    crc: 'cr', 'costa rica': 'cr',
    pan: 'pa', panama: 'pa',
    jam: 'jm', jamaica: 'jm',
    hai: 'ht', haiti: 'ht',
    hon: 'hn', honduras: 'hn',
    slv: 'sv', 'el salvador': 'sv',
    gua: 'gt', guatemala: 'gt',
    mar: 'ma', morocco: 'ma',
    sen: 'sn', senegal: 'sn',
    nga: 'ng', nigeria: 'ng',
    gha: 'gh', ghana: 'gh',
    cmr: 'cm', cameroon: 'cm',
    egy: 'eg', egypt: 'eg',
    tun: 'tn', tunisia: 'tn',
    alg: 'dz', algeria: 'dz',
    civ: 'ci', 'ivory coast': 'ci', "cote divoire": 'ci',
    rsa: 'za', 'south africa': 'za',
    irn: 'ir', iran: 'ir',
    irq: 'iq', iraq: 'iq',
    sau: 'sa', 'saudi arabia': 'sa',
    qat: 'qa', qatar: 'qa',
    uae: 'ae', 'united arab emirates': 'ae',
    tur: 'tr', turkey: 'tr', turkiye: 'tr',
    gre: 'gr', greece: 'gr',
    cro: 'hr', croatia: 'hr',
    srb: 'rs', serbia: 'rs',
    svn: 'si', slovenia: 'si',
    svk: 'sk', slovakia: 'sk',
    cze: 'cz', 'czech republic': 'cz', czechia: 'cz',
    pol: 'pl', poland: 'pl',
    ukr: 'ua', ukraine: 'ua',
    rus: 'ru', russia: 'ru',
    swe: 'se', sweden: 'se',
    nor: 'no', norway: 'no',
    den: 'dk', denmark: 'dk',
    fin: 'fi', finland: 'fi',
    isl: 'is', iceland: 'is',
    sui: 'ch', switzerland: 'ch',
    aut: 'at', austria: 'at',
    hun: 'hu', hungary: 'hu',
    rou: 'ro', romania: 'ro',
    bul: 'bg', bulgaria: 'bg',
    irl: 'ie', ireland: 'ie', 'republic of ireland': 'ie',
    chn: 'cn', china: 'cn',
    ind: 'in', india: 'in',
    tha: 'th', thailand: 'th',
    vie: 'vn', vietnam: 'vn',
    idn: 'id', indonesia: 'id',
    mys: 'my', malaysia: 'my',
    phi: 'ph', philippines: 'ph',
    sgp: 'sg', singapore: 'sg'
  };

  function _normKey(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function _playerInitials(name) {
    var parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }

  function _playerInitialColors(name) {
    var hash = 0;
    var s = String(name || '?');
    for (var i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
    var hue = Math.abs(hash) % 360;
    return { bg: 'hsl(' + hue + ',45%,32%)', fg: '#fff' };
  }

  function _initialsFallbackHtml(name, size, className) {
    var colors = _playerInitialColors(name);
    var initials = _playerInitials(name);
    var cls = className ? ' class="' + esc(className) + '"' : '';
    return '<div' + cls + ' style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:' + colors.bg + ';color:' + colors.fg + ';font-size:' + Math.max(8, Math.round(size * 0.32)) + 'px;font-weight:900;letter-spacing:0.3px;flex-shrink:0" aria-hidden="true">' + esc(initials) + '</div>';
  }

  function getCountryFlagCode(teamName) {
    var raw = String(teamName || '').trim();
    if (!raw) return '';
    var lower = raw.toLowerCase();
    if (COUNTRY_FLAG_CODES[lower]) return COUNTRY_FLAG_CODES[lower];
    var norm = _normKey(raw);
    if (COUNTRY_FLAG_CODES[norm]) return COUNTRY_FLAG_CODES[norm];
    var meta = _soccerMetaByNorm[norm];
    if (meta && meta.abbr) {
      var ab = String(meta.abbr).toLowerCase();
      if (COUNTRY_FLAG_CODES[ab]) return COUNTRY_FLAG_CODES[ab];
    }
    // Last token or whole abbrev-style names
    var parts = lower.split(/\s+/);
    if (parts.length === 1 && parts[0].length === 3 && COUNTRY_FLAG_CODES[parts[0]]) {
      return COUNTRY_FLAG_CODES[parts[0]];
    }
    return '';
  }

  function getCountryFlagUrl(teamName, width) {
    var code = getCountryFlagCode(teamName);
    if (!code) return '';
    var w = width || 24;
    var h = Math.round(w * 18 / 24);
    return 'https://flagcdn.com/' + w + 'x' + h + '/' + code + '.png';
  }

  function _rememberSoccerTeam(displayName, id, abbr) {
    if (!id) return;
    var idStr = String(id);
    var names = [displayName];
    if (abbr) names.push(abbr);
    names.forEach(function (n) {
      var k = _normKey(n);
      if (!k) return;
      _soccerIdByNorm[k] = idStr;
      _soccerMetaByNorm[k] = { id: idStr, abbr: abbr || '', displayName: displayName || n };
      delete _soccerMiss[k];
    });
  }

  function _ingestSoccerTeamsPayload(data) {
    try {
      var sports = (data && data.sports) || [];
      sports.forEach(function (sp) {
        ((sp && sp.leagues) || []).forEach(function (lg) {
          ((lg && lg.teams) || []).forEach(function (wrap) {
            var t = (wrap && wrap.team) || wrap || {};
            if (!t.id) return;
            _rememberSoccerTeam(t.displayName || t.name || t.shortDisplayName, t.id, t.abbreviation);
            if (t.location && t.name) _rememberSoccerTeam(t.location + ' ' + t.name, t.id, t.abbreviation);
            if (t.shortDisplayName) _rememberSoccerTeam(t.shortDisplayName, t.id, t.abbreviation);
            if (t.nickname) _rememberSoccerTeam(t.nickname, t.id, t.abbreviation);
          });
        });
      });
    } catch (_e) {}
  }

  function _lookupSoccerIdSync(teamName) {
    var k = _normKey(teamName);
    if (!k) return '';
    if (_soccerIdByNorm[k]) return _soccerIdByNorm[k];
    // Fuzzy: substring match against known keys
    var keys = Object.keys(_soccerIdByNorm);
    for (var i = 0; i < keys.length; i++) {
      var kk = keys[i];
      if (kk === k || kk.indexOf(k) >= 0 || k.indexOf(kk) >= 0) return _soccerIdByNorm[kk];
    }
    return '';
  }

  function getSoccerTeamLogo(teamName) {
    var id = _lookupSoccerIdSync(teamName);
    if (!id) return '';
    return 'https://a.espncdn.com/i/teamlogos/soccer/500/' + id + '.png';
  }

  async function warmSoccerTeamsCache() {
    if (_soccerCacheWarmed) return { ok: true, via: 'cache' };
    if (_soccerWarmPromise) return _soccerWarmPromise;
    _soccerWarmPromise = (async function () {
      // Spec URL — currently 404s for league "all"
      try {
        var allRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams?limit=200', { cache: 'force-cache' });
        if (allRes.ok) {
          _ingestSoccerTeamsPayload(await allRes.json());
          _soccerCacheWarmed = true;
          return { ok: true, via: 'all' };
        }
      } catch (_eAll) { /* CORS or network */ }

      var loaded = 0;
      for (var i = 0; i < SOCCER_LEAGUE_SLUGS.length; i++) {
        var slug = SOCCER_LEAGUE_SLUGS[i];
        try {
          var res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/' + slug + '/teams?limit=200', { cache: 'force-cache' });
          if (!res.ok) continue;
          _ingestSoccerTeamsPayload(await res.json());
          loaded++;
        } catch (_eLg) {
          // Per-league teams endpoints typically lack ACAO — expected in browser.
          break;
        }
      }
      _soccerCacheWarmed = true;
      return { ok: loaded > 0, via: loaded > 0 ? 'leagues' : 'search-only', leagues: loaded };
    })();
    try {
      return await _soccerWarmPromise;
    } finally {
      /* keep promise for reuse */
    }
  }

  async function _fetchSoccerTeamId(teamName) {
    var k = _normKey(teamName);
    if (!k) return null;
    if (_soccerIdByNorm[k]) return _soccerIdByNorm[k];
    if (_soccerMiss[k]) return null;
    if (_soccerPending[k]) return _soccerPending[k];

    _soccerPending[k] = (async function () {
      try {
        await warmSoccerTeamsCache();
        var warmed = _lookupSoccerIdSync(teamName);
        if (warmed) return warmed;

        var url = 'https://site.api.espn.com/apis/common/v3/search?query=' +
          encodeURIComponent(String(teamName).trim()) +
          '&sport=soccer&type=team&limit=5';
        var res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) {
          _soccerMiss[k] = true;
          return null;
        }
        var data = await res.json();
        var items = (data && data.items) || [];
        var want = _normKey(teamName);
        var pick = null;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (!it || !it.id) continue;
          var dn = _normKey(it.displayName || it.name || '');
          if (dn === want) { pick = it; break; }
          if (!pick && (dn.indexOf(want) >= 0 || want.indexOf(dn) >= 0)) pick = it;
        }
        if (!pick && items.length) pick = items[0];
        if (!pick || !pick.id) {
          _soccerMiss[k] = true;
          return null;
        }
        _rememberSoccerTeam(pick.displayName || pick.name || teamName, pick.id, pick.abbreviation);
        return String(pick.id);
      } catch (_e) {
        _soccerMiss[k] = true;
        return null;
      } finally {
        delete _soccerPending[k];
      }
    })();

    return _soccerPending[k];
  }

  function handleSoccerLogoError(img) {
    if (!img) return;
    var step = parseInt(img.getAttribute('data-soccer-step') || '0', 10);
    var teamName = img.getAttribute('data-team-name') || img.alt || '';
    var size = parseInt(img.getAttribute('data-logo-size') || '40', 10);
    var className = img.getAttribute('data-logo-class') || '';
    var flag = img.getAttribute('data-flag-url') || getCountryFlagUrl(teamName, Math.max(24, Math.round(size * 0.55)));

    if (step === 0 && flag) {
      img.setAttribute('data-soccer-step', '1');
      img.src = flag;
      img.style.objectFit = 'cover';
      return;
    }
    img.outerHTML = _initialsFallbackHtml(teamName, size, className);
  }

  function getSoccerTeamLogoImg(teamName, size, className) {
    size = size || 40;
    var name = String(teamName || '').trim();
    var url = getSoccerTeamLogo(name);
    var flag = getCountryFlagUrl(name, Math.max(24, Math.round(size * 0.55)));
    var cls = className ? ' class="' + esc(className) + '"' : '';

    if (!url && !flag) {
      return '<span data-soccer-team="' + esc(name) + '" data-logo-size="' + size + '"' +
        (className ? ' data-logo-class="' + esc(className) + '"' : '') + '>' +
        _initialsFallbackHtml(name, size, className) + '</span>';
    }

    var src = url || flag;
    return '<img' + cls +
      ' src="' + esc(src) + '"' +
      ' alt="' + esc(name) + '"' +
      ' width="' + size + '" height="' + size + '"' +
      ' style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;display:block"' +
      ' referrerpolicy="no-referrer"' +
      ' data-soccer-step="' + (url ? '0' : '1') + '"' +
      ' data-soccer-team="' + esc(name) + '"' +
      ' data-team-name="' + esc(name) + '"' +
      ' data-logo-size="' + size + '"' +
      ' data-flag-url="' + esc(flag) + '"' +
      (className ? ' data-logo-class="' + esc(className) + '"' : '') +
      ' onerror="window.handleSoccerLogoError&&window.handleSoccerLogoError(this)">';
  }

  function getTennisPlayerPhoto(playerName) {
    var k = _normKey(playerName);
    var id = k && _tennisIdByNorm[k];
    if (!id) return '';
    return 'https://a.espncdn.com/i/headshots/tennis/players/full/' + id + '.png';
  }

  async function _fetchTennisPlayerId(playerName) {
    var k = _normKey(playerName);
    if (!k) return null;
    if (_tennisIdByNorm[k]) return _tennisIdByNorm[k];
    if (_tennisMiss[k]) return null;
    if (_tennisPending[k]) return _tennisPending[k];

    _tennisPending[k] = (async function () {
      var url = 'https://site.api.espn.com/apis/common/v3/search?query=' +
        encodeURIComponent(String(playerName).trim()) +
        '&sport=tennis&type=player&limit=1';
      try {
        var res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) {
          _tennisMiss[k] = true;
          return null;
        }
        var data = await res.json();
        var items = (data && data.items) || [];
        var pick = items[0];
        if (!pick || !pick.id) {
          _tennisMiss[k] = true;
          return null;
        }
        _tennisIdByNorm[k] = String(pick.id);
        if (pick.displayName) _tennisIdByNorm[_normKey(pick.displayName)] = String(pick.id);
        return String(pick.id);
      } catch (_e) {
        _tennisMiss[k] = true;
        return null;
      } finally {
        delete _tennisPending[k];
      }
    })();

    return _tennisPending[k];
  }

  function handleTennisPhotoError(img) {
    if (!img) return;
    var name = img.getAttribute('data-player-name') || img.alt || '';
    var size = parseInt(img.getAttribute('data-logo-size') || '40', 10);
    var className = img.getAttribute('data-logo-class') || '';
    var k = _normKey(name);
    if (k && _tennisIdByNorm[k]) {
      _tennisMiss[k] = true;
      delete _tennisIdByNorm[k];
    }
    img.outerHTML = _initialsFallbackHtml(name, size, className);
  }

  function getTennisPlayerPhotoImg(playerName, size, className) {
    size = size || 40;
    var name = String(playerName || '').trim();
    var url = getTennisPlayerPhoto(name);
    var cls = className ? ' class="' + esc(className) + '"' : '';

    if (!url) {
      return '<span data-tennis-player="' + esc(name) + '" data-logo-size="' + size + '"' +
        (className ? ' data-logo-class="' + esc(className) + '"' : '') + '>' +
        _initialsFallbackHtml(name, size, className) + '</span>';
    }

    return '<img' + cls +
      ' src="' + esc(url) + '"' +
      ' alt="' + esc(name) + '"' +
      ' width="' + size + '" height="' + size + '"' +
      ' style="width:' + size + 'px;height:' + size + 'px;object-fit:cover;display:block;border-radius:10px"' +
      ' referrerpolicy="no-referrer"' +
      ' data-tennis-player="' + esc(name) + '"' +
      ' data-player-name="' + esc(name) + '"' +
      ' data-logo-size="' + size + '"' +
      (className ? ' data-logo-class="' + esc(className) + '"' : '') +
      ' onerror="window.handleTennisPhotoError&&window.handleTennisPhotoError(this)">';
  }

  function _replacePlaceholderWithImg(el, imgHtml) {
    if (!el || !el.parentNode) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = imgHtml;
    var node = tmp.firstChild;
    if (!node) return;
    el.parentNode.replaceChild(node, el);
  }

  async function hydrateEspnLobbyMedia(root) {
    var scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return;

    await warmSoccerTeamsCache();

    var soccerEls = Array.prototype.slice.call(scope.querySelectorAll('[data-soccer-team]'));
    var tennisEls = Array.prototype.slice.call(scope.querySelectorAll('[data-tennis-player]'));

    var soccerNames = [];
    soccerEls.forEach(function (el) {
      var n = el.getAttribute('data-soccer-team') || '';
      if (n) soccerNames.push(n);
    });
    var tennisNames = [];
    tennisEls.forEach(function (el) {
      var n = el.getAttribute('data-tennis-player') || '';
      if (n) tennisNames.push(n);
    });

    // Dedupe + concurrent lookups
    async function runPool(names, worker, concurrency) {
      var seen = {};
      var unique = [];
      names.forEach(function (n) {
        var k = _normKey(n);
        if (!k || seen[k]) return;
        seen[k] = true;
        unique.push(n);
      });
      var idx = 0;
      var limit = Math.max(1, concurrency || 6);
      async function pump() {
        while (idx < unique.length) {
          var i = idx++;
          await worker(unique[i]);
        }
      }
      var jobs = [];
      for (var w = 0; w < Math.min(limit, unique.length); w++) jobs.push(pump());
      await Promise.all(jobs);
    }

    await Promise.all([
      runPool(soccerNames, _fetchSoccerTeamId, 6),
      runPool(tennisNames, _fetchTennisPlayerId, 6)
    ]);

    if (!scope.isConnected && scope !== document) return;

    soccerEls = Array.prototype.slice.call(scope.querySelectorAll('[data-soccer-team]'));
    tennisEls = Array.prototype.slice.call(scope.querySelectorAll('[data-tennis-player]'));

    soccerEls.forEach(function (el) {
      var name = el.getAttribute('data-soccer-team') || '';
      var size = parseInt(el.getAttribute('data-logo-size') || '40', 10);
      var className = el.getAttribute('data-logo-class') || '';
      var url = getSoccerTeamLogo(name);
      var flag = getCountryFlagUrl(name, Math.max(24, Math.round(size * 0.55)));
      if (el.tagName === 'IMG' && url && el.getAttribute('src') === url) return;
      if (!url && !flag) return;
      _replacePlaceholderWithImg(el, getSoccerTeamLogoImg(name, size, className));
    });

    tennisEls.forEach(function (el) {
      var name = el.getAttribute('data-tennis-player') || '';
      var size = parseInt(el.getAttribute('data-logo-size') || '40', 10);
      var className = el.getAttribute('data-logo-class') || '';
      var url = getTennisPlayerPhoto(name);
      if (el.tagName === 'IMG' && url && el.getAttribute('src') === url) return;
      if (!url) return;
      _replacePlaceholderWithImg(el, getTennisPlayerPhotoImg(name, size, className));
    });
  }

  global.TEAM_LOGOS = TEAM_LOGOS;
  global.normalizeSport = normalizeSport;
  global.resolveTeamName = resolveTeamName;
  global.getTeamAbbrev = getTeamAbbrev;
  global.getTeamInitials = getTeamInitials;
  global.getTeamColors = getTeamColors;
  global.getTeamLogo = getTeamLogo;
  global.getTeamLogoDirect = getTeamLogoDirect;
  global.getTeamLogoImg = getTeamLogoImg;
  global.handleTeamLogoError = handleTeamLogoError;
  global.extractTeamFromPick = extractTeamFromPick;
  global.getSoccerTeamLogo = getSoccerTeamLogo;
  global.getSoccerTeamLogoImg = getSoccerTeamLogoImg;
  global.handleSoccerLogoError = handleSoccerLogoError;
  global.getTennisPlayerPhoto = getTennisPlayerPhoto;
  global.getTennisPlayerPhotoImg = getTennisPlayerPhotoImg;
  global.handleTennisPhotoError = handleTennisPhotoError;
  global.getCountryFlagUrl = getCountryFlagUrl;
  global.getCountryFlagCode = getCountryFlagCode;
  global.warmSoccerTeamsCache = warmSoccerTeamsCache;
  global.hydrateEspnLobbyMedia = hydrateEspnLobbyMedia;
})(typeof window !== 'undefined' ? window : this);
