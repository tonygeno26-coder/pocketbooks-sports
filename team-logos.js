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

  // Complete NBA — ESPN displayName / abbreviation from basketball/nba/teams.
  var NBA_FULL = {
    'Atlanta Hawks': 'atl', 'Boston Celtics': 'bos', 'Brooklyn Nets': 'bkn',
    'Charlotte Hornets': 'cha', 'Chicago Bulls': 'chi', 'Cleveland Cavaliers': 'cle',
    'Dallas Mavericks': 'dal', 'Denver Nuggets': 'den', 'Detroit Pistons': 'det',
    'Golden State Warriors': 'gs', 'Houston Rockets': 'hou', 'Indiana Pacers': 'ind',
    'Los Angeles Clippers': 'lac', 'LA Clippers': 'lac',
    'Los Angeles Lakers': 'lal', 'Memphis Grizzlies': 'mem',
    'Miami Heat': 'mia', 'Milwaukee Bucks': 'mil', 'Minnesota Timberwolves': 'min',
    'New Orleans Pelicans': 'no', 'New York Knicks': 'ny', 'Oklahoma City Thunder': 'okc',
    'Orlando Magic': 'orl', 'Philadelphia 76ers': 'phi', 'Phoenix Suns': 'phx',
    'Portland Trail Blazers': 'por', 'Sacramento Kings': 'sac', 'San Antonio Spurs': 'sa',
    'Toronto Raptors': 'tor', 'Utah Jazz': 'utah', 'Washington Wizards': 'wsh'
  };

  var NBA_SHORT_ALIASES = {
    'Warriors': 'Golden State Warriors',
    'Golden State': 'Golden State Warriors',
    'GSW': 'Golden State Warriors',
    'LA Lakers': 'Los Angeles Lakers',
    'Lakers': 'Los Angeles Lakers',
    'LAL': 'Los Angeles Lakers',
    'Clippers': 'Los Angeles Clippers',
    'LAC': 'Los Angeles Clippers',
    'LA Clippers': 'Los Angeles Clippers',
    'Sixers': 'Philadelphia 76ers',
    '76ers': 'Philadelphia 76ers',
    'PHI': 'Philadelphia 76ers',
    'Celtics': 'Boston Celtics',
    'BOS': 'Boston Celtics',
    'Knicks': 'New York Knicks',
    'NYK': 'New York Knicks',
    'NY Knicks': 'New York Knicks',
    'Nets': 'Brooklyn Nets',
    'BKN': 'Brooklyn Nets',
    'Hawks': 'Atlanta Hawks',
    'ATL': 'Atlanta Hawks',
    'Bulls': 'Chicago Bulls',
    'CHI': 'Chicago Bulls',
    'Cavs': 'Cleveland Cavaliers',
    'Cavaliers': 'Cleveland Cavaliers',
    'CLE': 'Cleveland Cavaliers',
    'Mavs': 'Dallas Mavericks',
    'Mavericks': 'Dallas Mavericks',
    'DAL': 'Dallas Mavericks',
    'Nuggets': 'Denver Nuggets',
    'DEN': 'Denver Nuggets',
    'Pistons': 'Detroit Pistons',
    'DET': 'Detroit Pistons',
    'Rockets': 'Houston Rockets',
    'HOU': 'Houston Rockets',
    'Pacers': 'Indiana Pacers',
    'IND': 'Indiana Pacers',
    'Grizzlies': 'Memphis Grizzlies',
    'MEM': 'Memphis Grizzlies',
    'Heat': 'Miami Heat',
    'MIA': 'Miami Heat',
    'Bucks': 'Milwaukee Bucks',
    'MIL': 'Milwaukee Bucks',
    'Wolves': 'Minnesota Timberwolves',
    'Timberwolves': 'Minnesota Timberwolves',
    'MIN': 'Minnesota Timberwolves',
    'Pelicans': 'New Orleans Pelicans',
    'NOP': 'New Orleans Pelicans',
    'Thunder': 'Oklahoma City Thunder',
    'OKC': 'Oklahoma City Thunder',
    'Magic': 'Orlando Magic',
    'ORL': 'Orlando Magic',
    'Suns': 'Phoenix Suns',
    'PHX': 'Phoenix Suns',
    'PHO': 'Phoenix Suns',
    'Blazers': 'Portland Trail Blazers',
    'Trail Blazers': 'Portland Trail Blazers',
    'POR': 'Portland Trail Blazers',
    'Kings': 'Sacramento Kings',
    'SAC': 'Sacramento Kings',
    'Spurs': 'San Antonio Spurs',
    'SAS': 'San Antonio Spurs',
    'Raptors': 'Toronto Raptors',
    'TOR': 'Toronto Raptors',
    'Jazz': 'Utah Jazz',
    'UTA': 'Utah Jazz',
    'Wizards': 'Washington Wizards',
    'WAS': 'Washington Wizards',
    'WSH': 'Washington Wizards',
    'Hornets': 'Charlotte Hornets',
    'CHA': 'Charlotte Hornets',
    // city + full name
    'Atlanta': 'Atlanta Hawks',
    'Boston': 'Boston Celtics',
    'Brooklyn': 'Brooklyn Nets',
    'Charlotte': 'Charlotte Hornets',
    'Chicago': 'Chicago Bulls',
    'Cleveland': 'Cleveland Cavaliers',
    'Dallas': 'Dallas Mavericks',
    'Denver': 'Denver Nuggets',
    'Detroit': 'Detroit Pistons',
    'Houston': 'Houston Rockets',
    'Indiana': 'Indiana Pacers',
    'Los Angeles': 'Los Angeles Lakers',
    'Memphis': 'Memphis Grizzlies',
    'Miami': 'Miami Heat',
    'Milwaukee': 'Milwaukee Bucks',
    'Minnesota': 'Minnesota Timberwolves',
    'New Orleans': 'New Orleans Pelicans',
    'New York': 'New York Knicks',
    'Oklahoma City': 'Oklahoma City Thunder',
    'Orlando': 'Orlando Magic',
    'Philadelphia': 'Philadelphia 76ers',
    'Phoenix': 'Phoenix Suns',
    'Portland': 'Portland Trail Blazers',
    'Sacramento': 'Sacramento Kings',
    'San Antonio': 'San Antonio Spurs',
    'Toronto': 'Toronto Raptors',
    'Utah': 'Utah Jazz',
    'Washington': 'Washington Wizards'
  };

  // Complete NHL — ESPN hockey/nhl/teams (32 clubs incl. Utah Mammoth).
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
    'Utah Mammoth': 'utah', 'Utah Hockey Club': 'utah',
    'Vancouver Canucks': 'van', 'Vegas Golden Knights': 'vgk',
    'Washington Capitals': 'wsh', 'Winnipeg Jets': 'wpg'
  };

  var NHL_SHORT_ALIASES = {
    'Vegas': 'Vegas Golden Knights',
    'Vegas Golden Knights': 'Vegas Golden Knights',
    'Golden Knights': 'Vegas Golden Knights',
    'VGK': 'Vegas Golden Knights',
    'Seattle': 'Seattle Kraken',
    'Kraken': 'Seattle Kraken',
    'SEA': 'Seattle Kraken',
    'TB Lightning': 'Tampa Bay Lightning',
    'Tampa Bay': 'Tampa Bay Lightning',
    'Lightning': 'Tampa Bay Lightning',
    'TB': 'Tampa Bay Lightning',
    'TBL': 'Tampa Bay Lightning',
    'NJ Devils': 'New Jersey Devils',
    'New Jersey': 'New Jersey Devils',
    'Devils': 'New Jersey Devils',
    'NJD': 'New Jersey Devils',
    'NJ': 'New Jersey Devils',
    'NY Rangers': 'New York Rangers',
    'Rangers': 'New York Rangers',
    'NYR': 'New York Rangers',
    'NY Islanders': 'New York Islanders',
    'Islanders': 'New York Islanders',
    'NYI': 'New York Islanders',
    'Utah': 'Utah Mammoth',
    'Mammoth': 'Utah Mammoth',
    'UTA': 'Utah Mammoth',
    'Ducks': 'Anaheim Ducks',
    'Bruins': 'Boston Bruins',
    'Sabres': 'Buffalo Sabres',
    'Flames': 'Calgary Flames',
    'Hurricanes': 'Carolina Hurricanes',
    'Canes': 'Carolina Hurricanes',
    'Blackhawks': 'Chicago Blackhawks',
    'Hawks': 'Chicago Blackhawks',
    'Avalanche': 'Colorado Avalanche',
    'Avs': 'Colorado Avalanche',
    'Blue Jackets': 'Columbus Blue Jackets',
    'Jackets': 'Columbus Blue Jackets',
    'Stars': 'Dallas Stars',
    'Red Wings': 'Detroit Red Wings',
    'Wings': 'Detroit Red Wings',
    'Oilers': 'Edmonton Oilers',
    'Panthers': 'Florida Panthers',
    'Kings': 'Los Angeles Kings',
    'LA Kings': 'Los Angeles Kings',
    'Wild': 'Minnesota Wild',
    'Canadiens': 'Montreal Canadiens',
    'Habs': 'Montreal Canadiens',
    'Predators': 'Nashville Predators',
    'Preds': 'Nashville Predators',
    'Senators': 'Ottawa Senators',
    'Sens': 'Ottawa Senators',
    'Flyers': 'Philadelphia Flyers',
    'Penguins': 'Pittsburgh Penguins',
    'Pens': 'Pittsburgh Penguins',
    'Sharks': 'San Jose Sharks',
    'Blues': 'St. Louis Blues',
    'Maple Leafs': 'Toronto Maple Leafs',
    'Leafs': 'Toronto Maple Leafs',
    'Canucks': 'Vancouver Canucks',
    'Capitals': 'Washington Capitals',
    'Caps': 'Washington Capitals',
    'Jets': 'Winnipeg Jets'
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

  // Complete FBS NCAAF programs — ESPN numeric team IDs (ncaa/500/{id}.png).
  // Sourced from ESPN college-football FBS conferences (group 80), season 2025.
  var NCAAF_FULL = {
    'Auburn Tigers': '2', 'UAB Blazers': '5',
    'South Alabama Jaguars': '6', 'Arkansas Razorbacks': '8',
    'Arizona State Sun Devils': '9', 'Arizona Wildcats': '12',
    'San Diego State Aztecs': '21', 'San José State Spartans': '23',
    'Stanford Cardinal': '24', 'California Golden Bears': '25',
    'UCLA Bruins': '26', 'USC Trojans': '30',
    'Colorado State Rams': '36', 'Colorado Buffaloes': '38',
    'UConn Huskies': '41', 'Delaware Blue Hens': '48',
    'Florida State Seminoles': '52', 'Jacksonville State Gamecocks': '55',
    'Florida Gators': '57', 'South Florida Bulls': '58',
    'Georgia Tech Yellow Jackets': '59', 'Georgia Bulldogs': '61',
    'Hawai\'i Rainbow Warriors': '62', 'Iowa State Cyclones': '66',
    'Boise State Broncos': '68', 'Northwestern Wildcats': '77',
    'Indiana Hoosiers': '84', 'Notre Dame Fighting Irish': '87',
    'Kentucky Wildcats': '96', 'Louisville Cardinals': '97',
    'Western Kentucky Hilltoppers': '98', 'LSU Tigers': '99',
    'Boston College Eagles': '103', 'Massachusetts Minutemen': '113',
    'Maryland Terrapins': '120', 'Michigan State Spartans': '127',
    'Michigan Wolverines': '130', 'Minnesota Golden Gophers': '135',
    'Missouri Tigers': '142', 'Ole Miss Rebels': '145',
    'Duke Blue Devils': '150', 'East Carolina Pirates': '151',
    'NC State Wolfpack': '152', 'North Carolina Tar Heels': '153',
    'Wake Forest Demon Deacons': '154', 'Nebraska Cornhuskers': '158',
    'Rutgers Scarlet Knights': '164', 'New Mexico State Aggies': '166',
    'New Mexico Lobos': '167', 'Syracuse Orange': '183',
    'Bowling Green Falcons': '189', 'Miami (OH) RedHawks': '193',
    'Ohio State Buckeyes': '194', 'Ohio Bobcats': '195',
    'Oklahoma State Cowboys': '197', 'Oklahoma Sooners': '201',
    'Tulsa Golden Hurricane': '202', 'Oregon State Beavers': '204',
    'Penn State Nittany Lions': '213', 'Temple Owls': '218',
    'Pittsburgh Panthers': '221', 'Clemson Tigers': '228',
    'Memphis Tigers': '235', 'Vanderbilt Commodores': '238',
    'Baylor Bears': '239', 'Rice Owls': '242',
    'Texas A&M Aggies': '245', 'Houston Cougars': '248',
    'North Texas Mean Green': '249', 'Texas Longhorns': '251',
    'BYU Cougars': '252', 'Utah Utes': '254',
    'James Madison Dukes': '256', 'Virginia Cavaliers': '258',
    'Virginia Tech Hokies': '259', 'Washington Huskies': '264',
    'Washington State Cougars': '265', 'Wisconsin Badgers': '275',
    'Marshall Thundering Herd': '276', 'West Virginia Mountaineers': '277',
    'Fresno State Bulldogs': '278', 'Georgia Southern Eagles': '290',
    'Old Dominion Monarchs': '295', 'Louisiana Ragin\' Cajuns': '309',
    'Coastal Carolina Chanticleers': '324', 'Texas State Bobcats': '326',
    'Utah State Aggies': '328', 'Alabama Crimson Tide': '333',
    'Kennesaw State Owls': '338', 'Mississippi State Bulldogs': '344',
    'Army Black Knights': '349', 'Illinois Fighting Illini': '356',
    'Air Force Falcons': '2005', 'Akron Zips': '2006',
    'App State Mountaineers': '2026', 'Arkansas State Red Wolves': '2032',
    'Ball State Cardinals': '2050', 'Buffalo Bulls': '2084',
    'UCF Knights': '2116', 'Central Michigan Chippewas': '2117',
    'Cincinnati Bearcats': '2132', 'Eastern Michigan Eagles': '2199',
    'Florida Atlantic Owls': '2226', 'Florida International Panthers': '2229',
    'Georgia State Panthers': '2247', 'Iowa Hawkeyes': '2294',
    'Kansas Jayhawks': '2305', 'Kansas State Wildcats': '2306',
    'Kent State Golden Flashes': '2309', 'Liberty Flames': '2335',
    'Louisiana Tech Bulldogs': '2348', 'Miami Hurricanes': '2390',
    'Middle Tennessee Blue Raiders': '2393', 'Navy Midshipmen': '2426',
    'Charlotte 49ers': '2429', 'UL Monroe Warhawks': '2433',
    'UNLV Rebels': '2439', 'Nevada Wolf Pack': '2440',
    'Northern Illinois Huskies': '2459', 'Oregon Ducks': '2483',
    'Purdue Boilermakers': '2509', 'Sam Houston Bearkats': '2534',
    'SMU Mustangs': '2567', 'Southern Miss Golden Eagles': '2572',
    'South Carolina Gamecocks': '2579', 'Missouri State Bears': '2623',
    'TCU Horned Frogs': '2628', 'Tennessee Volunteers': '2633',
    'UTSA Roadrunners': '2636', 'UTEP Miners': '2638',
    'Texas Tech Red Raiders': '2641', 'Toledo Rockets': '2649',
    'Troy Trojans': '2653', 'Tulane Green Wave': '2655',
    'Western Michigan Broncos': '2711', 'Wyoming Cowboys': '2751',
    'North Dakota State Bison': '2449', 'Sacramento State Hornets': '16'
  };

  var NCAAF_SHORT_ALIASES = {
    'Auburn': 'Auburn Tigers',
    'AUB': 'Auburn Tigers',
    'UAB': 'UAB Blazers',
    'South Alabama': 'South Alabama Jaguars',
    'USA': 'South Alabama Jaguars',
    'Arkansas': 'Arkansas Razorbacks',
    'ARK': 'Arkansas Razorbacks',
    'Arizona State': 'Arizona State Sun Devils',
    'Arizona St': 'Arizona State Sun Devils',
    'ASU': 'Arizona State Sun Devils',
    'Arizona': 'Arizona Wildcats',
    'ARIZ': 'Arizona Wildcats',
    'San Diego State': 'San Diego State Aztecs',
    'San Diego St': 'San Diego State Aztecs',
    'SDSU': 'San Diego State Aztecs',
    'San José State': 'San José State Spartans',
    'San José St': 'San José State Spartans',
    'SJSU': 'San José State Spartans',
    'Stanford': 'Stanford Cardinal',
    'STAN': 'Stanford Cardinal',
    'California': 'California Golden Bears',
    'CAL': 'California Golden Bears',
    'UCLA': 'UCLA Bruins',
    'USC': 'USC Trojans',
    'Colorado State': 'Colorado State Rams',
    'Colorado St': 'Colorado State Rams',
    'CSU': 'Colorado State Rams',
    'Colorado': 'Colorado Buffaloes',
    'COLO': 'Colorado Buffaloes',
    'UConn': 'UConn Huskies',
    'CONN': 'UConn Huskies',
    'Delaware': 'Delaware Blue Hens',
    'DEL': 'Delaware Blue Hens',
    'Florida State': 'Florida State Seminoles',
    'Florida St': 'Florida State Seminoles',
    'FSU': 'Florida State Seminoles',
    'Jacksonville State': 'Jacksonville State Gamecocks',
    'Jax State': 'Jacksonville State Gamecocks',
    'JXST': 'Jacksonville State Gamecocks',
    'Florida': 'Florida Gators',
    'FLA': 'Florida Gators',
    'South Florida': 'South Florida Bulls',
    'USF': 'South Florida Bulls',
    'Georgia Tech': 'Georgia Tech Yellow Jackets',
    'GT': 'Georgia Tech Yellow Jackets',
    'Georgia': 'Georgia Bulldogs',
    'UGA': 'Georgia Bulldogs',
    'Hawai\'i': 'Hawai\'i Rainbow Warriors',
    'HAW': 'Hawai\'i Rainbow Warriors',
    'Iowa State': 'Iowa State Cyclones',
    'ISU': 'Iowa State Cyclones',
    'Boise State': 'Boise State Broncos',
    'Boise St': 'Boise State Broncos',
    'BOIS': 'Boise State Broncos',
    'Northwestern': 'Northwestern Wildcats',
    'NU': 'Northwestern Wildcats',
    'Indiana': 'Indiana Hoosiers',
    'IU': 'Indiana Hoosiers',
    'Notre Dame': 'Notre Dame Fighting Irish',
    'ND': 'Notre Dame Fighting Irish',
    'Kentucky': 'Kentucky Wildcats',
    'UK': 'Kentucky Wildcats',
    'Louisville': 'Louisville Cardinals',
    'LOU': 'Louisville Cardinals',
    'Western Kentucky': 'Western Kentucky Hilltoppers',
    'Western KY': 'Western Kentucky Hilltoppers',
    'WKU': 'Western Kentucky Hilltoppers',
    'LSU': 'LSU Tigers',
    'Boston College': 'Boston College Eagles',
    'BC': 'Boston College Eagles',
    'Massachusetts': 'Massachusetts Minutemen',
    'UMass': 'Massachusetts Minutemen',
    'MASS': 'Massachusetts Minutemen',
    'Maryland': 'Maryland Terrapins',
    'MD': 'Maryland Terrapins',
    'Michigan State': 'Michigan State Spartans',
    'Michigan St': 'Michigan State Spartans',
    'MSU': 'Michigan State Spartans',
    'Michigan': 'Michigan Wolverines',
    'MICH': 'Michigan Wolverines',
    'Minnesota': 'Minnesota Golden Gophers',
    'MINN': 'Minnesota Golden Gophers',
    'Missouri': 'Missouri Tigers',
    'MIZ': 'Missouri Tigers',
    'Ole Miss': 'Ole Miss Rebels',
    'MISS': 'Ole Miss Rebels',
    'Duke': 'Duke Blue Devils',
    'DUKE': 'Duke Blue Devils',
    'East Carolina': 'East Carolina Pirates',
    'ECU': 'East Carolina Pirates',
    'NC State': 'NC State Wolfpack',
    'NCSU': 'NC State Wolfpack',
    'North Carolina': 'North Carolina Tar Heels',
    'UNC': 'North Carolina Tar Heels',
    'Wake Forest': 'Wake Forest Demon Deacons',
    'WAKE': 'Wake Forest Demon Deacons',
    'Nebraska': 'Nebraska Cornhuskers',
    'NEB': 'Nebraska Cornhuskers',
    'Rutgers': 'Rutgers Scarlet Knights',
    'RUTG': 'Rutgers Scarlet Knights',
    'New Mexico State': 'New Mexico State Aggies',
    'New Mexico St': 'New Mexico State Aggies',
    'NMSU': 'New Mexico State Aggies',
    'New Mexico': 'New Mexico Lobos',
    'UNM': 'New Mexico Lobos',
    'Syracuse': 'Syracuse Orange',
    'SYR': 'Syracuse Orange',
    'Bowling Green': 'Bowling Green Falcons',
    'BGSU': 'Bowling Green Falcons',
    'Miami (OH)': 'Miami (OH) RedHawks',
    'Miami OH': 'Miami (OH) RedHawks',
    'M-OH': 'Miami (OH) RedHawks',
    'Miami': 'Miami Hurricanes',
    'Miami (FL)': 'Miami Hurricanes',
    'Miami FL': 'Miami Hurricanes',
    'Miami Florida': 'Miami Hurricanes',
    'MIA': 'Miami Hurricanes',
    'Ohio State': 'Ohio State Buckeyes',
    'OSU': 'Ohio State Buckeyes',
    'Ohio': 'Ohio Bobcats',
    'OHIO': 'Ohio Bobcats',
    'Oklahoma State': 'Oklahoma State Cowboys',
    'Oklahoma St': 'Oklahoma State Cowboys',
    'OKST': 'Oklahoma State Cowboys',
    'Oklahoma': 'Oklahoma Sooners',
    'OU': 'Oklahoma Sooners',
    'Tulsa': 'Tulsa Golden Hurricane',
    'TLSA': 'Tulsa Golden Hurricane',
    'Oregon State': 'Oregon State Beavers',
    'Oregon St': 'Oregon State Beavers',
    'ORST': 'Oregon State Beavers',
    'Penn State': 'Penn State Nittany Lions',
    'PSU': 'Penn State Nittany Lions',
    'Temple': 'Temple Owls',
    'TEM': 'Temple Owls',
    'Pittsburgh': 'Pittsburgh Panthers',
    'Pitt': 'Pittsburgh Panthers',
    'PITT': 'Pittsburgh Panthers',
    'Clemson': 'Clemson Tigers',
    'CLEM': 'Clemson Tigers',
    'Memphis': 'Memphis Tigers',
    'MEM': 'Memphis Tigers',
    'Vanderbilt': 'Vanderbilt Commodores',
    'VAN': 'Vanderbilt Commodores',
    'Baylor': 'Baylor Bears',
    'BAY': 'Baylor Bears',
    'Rice': 'Rice Owls',
    'RICE': 'Rice Owls',
    'Texas A&M': 'Texas A&M Aggies',
    'TA&M': 'Texas A&M Aggies',
    'Houston': 'Houston Cougars',
    'HOU': 'Houston Cougars',
    'North Texas': 'North Texas Mean Green',
    'UNT': 'North Texas Mean Green',
    'Texas': 'Texas Longhorns',
    'TEX': 'Texas Longhorns',
    'BYU': 'BYU Cougars',
    'Utah': 'Utah Utes',
    'UTAH': 'Utah Utes',
    'James Madison': 'James Madison Dukes',
    'JMU': 'James Madison Dukes',
    'Virginia': 'Virginia Cavaliers',
    'UVA': 'Virginia Cavaliers',
    'Virginia Tech': 'Virginia Tech Hokies',
    'VT': 'Virginia Tech Hokies',
    'Washington': 'Washington Huskies',
    'WASH': 'Washington Huskies',
    'Washington State': 'Washington State Cougars',
    'Washington St': 'Washington State Cougars',
    'WSU': 'Washington State Cougars',
    'Wisconsin': 'Wisconsin Badgers',
    'WIS': 'Wisconsin Badgers',
    'Marshall': 'Marshall Thundering Herd',
    'MRSH': 'Marshall Thundering Herd',
    'West Virginia': 'West Virginia Mountaineers',
    'WVU': 'West Virginia Mountaineers',
    'Fresno State': 'Fresno State Bulldogs',
    'Fresno St': 'Fresno State Bulldogs',
    'FRES': 'Fresno State Bulldogs',
    'Georgia Southern': 'Georgia Southern Eagles',
    'GA Southern': 'Georgia Southern Eagles',
    'GASO': 'Georgia Southern Eagles',
    'Old Dominion': 'Old Dominion Monarchs',
    'ODU': 'Old Dominion Monarchs',
    'Louisiana': 'Louisiana Ragin\' Cajuns',
    'UL': 'Louisiana Ragin\' Cajuns',
    'Coastal Carolina': 'Coastal Carolina Chanticleers',
    'Coastal': 'Coastal Carolina Chanticleers',
    'CCU': 'Coastal Carolina Chanticleers',
    'Texas State': 'Texas State Bobcats',
    'Texas St': 'Texas State Bobcats',
    'TXST': 'Texas State Bobcats',
    'Utah State': 'Utah State Aggies',
    'USU': 'Utah State Aggies',
    'Alabama': 'Alabama Crimson Tide',
    'ALA': 'Alabama Crimson Tide',
    'Kennesaw State': 'Kennesaw State Owls',
    'Kennesaw St': 'Kennesaw State Owls',
    'KENN': 'Kennesaw State Owls',
    'Mississippi State': 'Mississippi State Bulldogs',
    'Mississippi St': 'Mississippi State Bulldogs',
    'MSST': 'Mississippi State Bulldogs',
    'Army': 'Army Black Knights',
    'ARMY': 'Army Black Knights',
    'Illinois': 'Illinois Fighting Illini',
    'ILL': 'Illinois Fighting Illini',
    'Air Force': 'Air Force Falcons',
    'AF': 'Air Force Falcons',
    'Akron': 'Akron Zips',
    'AKR': 'Akron Zips',
    'App State': 'App State Mountaineers',
    'APP': 'App State Mountaineers',
    'Arkansas State': 'Arkansas State Red Wolves',
    'Arkansas St': 'Arkansas State Red Wolves',
    'ARST': 'Arkansas State Red Wolves',
    'Ball State': 'Ball State Cardinals',
    'BALL': 'Ball State Cardinals',
    'Buffalo': 'Buffalo Bulls',
    'BUF': 'Buffalo Bulls',
    'UCF': 'UCF Knights',
    'Central Michigan': 'Central Michigan Chippewas',
    'C Michigan': 'Central Michigan Chippewas',
    'CMU': 'Central Michigan Chippewas',
    'Cincinnati': 'Cincinnati Bearcats',
    'CIN': 'Cincinnati Bearcats',
    'Eastern Michigan': 'Eastern Michigan Eagles',
    'E Michigan': 'Eastern Michigan Eagles',
    'EMU': 'Eastern Michigan Eagles',
    'Florida Atlantic': 'Florida Atlantic Owls',
    'FAU': 'Florida Atlantic Owls',
    'Florida International': 'Florida International Panthers',
    'FIU': 'Florida International Panthers',
    'Georgia State': 'Georgia State Panthers',
    'Georgia St': 'Georgia State Panthers',
    'GAST': 'Georgia State Panthers',
    'Iowa': 'Iowa Hawkeyes',
    'IOWA': 'Iowa Hawkeyes',
    'Kansas': 'Kansas Jayhawks',
    'KU': 'Kansas Jayhawks',
    'Kansas State': 'Kansas State Wildcats',
    'Kansas St': 'Kansas State Wildcats',
    'KSU': 'Kansas State Wildcats',
    'Kent State': 'Kent State Golden Flashes',
    'KENT': 'Kent State Golden Flashes',
    'Liberty': 'Liberty Flames',
    'LIB': 'Liberty Flames',
    'Louisiana Tech': 'Louisiana Tech Bulldogs',
    'LT': 'Louisiana Tech Bulldogs',
    'Miami': 'Miami Hurricanes',
    'MIA': 'Miami Hurricanes',
    'Middle Tennessee': 'Middle Tennessee Blue Raiders',
    'MTSU': 'Middle Tennessee Blue Raiders',
    'Navy': 'Navy Midshipmen',
    'NAVY': 'Navy Midshipmen',
    'Charlotte': 'Charlotte 49ers',
    'CLT': 'Charlotte 49ers',
    'UL Monroe': 'UL Monroe Warhawks',
    'ULM': 'UL Monroe Warhawks',
    'UNLV': 'UNLV Rebels',
    'Nevada': 'Nevada Wolf Pack',
    'NEV': 'Nevada Wolf Pack',
    'Northern Illinois': 'Northern Illinois Huskies',
    'N Illinois': 'Northern Illinois Huskies',
    'NIU': 'Northern Illinois Huskies',
    'Oregon': 'Oregon Ducks',
    'ORE': 'Oregon Ducks',
    'Purdue': 'Purdue Boilermakers',
    'PUR': 'Purdue Boilermakers',
    'Sam Houston': 'Sam Houston Bearkats',
    'SHSU': 'Sam Houston Bearkats',
    'SMU': 'SMU Mustangs',
    'Southern Miss': 'Southern Miss Golden Eagles',
    'USM': 'Southern Miss Golden Eagles',
    'South Carolina': 'South Carolina Gamecocks',
    'SC': 'South Carolina Gamecocks',
    'Missouri State': 'Missouri State Bears',
    'Missouri St': 'Missouri State Bears',
    'MOST': 'Missouri State Bears',
    'TCU': 'TCU Horned Frogs',
    'Tennessee': 'Tennessee Volunteers',
    'TENN': 'Tennessee Volunteers',
    'UTSA': 'UTSA Roadrunners',
    'UTEP': 'UTEP Miners',
    'Texas Tech': 'Texas Tech Red Raiders',
    'TTU': 'Texas Tech Red Raiders',
    'Toledo': 'Toledo Rockets',
    'TOL': 'Toledo Rockets',
    'Troy': 'Troy Trojans',
    'TROY': 'Troy Trojans',
    'Tulane': 'Tulane Green Wave',
    'TULN': 'Tulane Green Wave',
    'Western Michigan': 'Western Michigan Broncos',
    'W Michigan': 'Western Michigan Broncos',
    'WMU': 'Western Michigan Broncos',
    'Wyoming': 'Wyoming Cowboys',
    'WYO': 'Wyoming Cowboys',
    'Mississippi': 'Ole Miss Rebels',
    'Southern California': 'USC Trojans',
    'Louisiana State': 'LSU Tigers',
    'Texas Christian': 'TCU Horned Frogs',
    'Southern Methodist': 'SMU Mustangs',
    'Central Florida': 'UCF Knights',
    'Texas-San Antonio': 'UTSA Roadrunners',
    'Texas San Antonio': 'UTSA Roadrunners',
    'Alabama-Birmingham': 'UAB Blazers',
    'Alabama Birmingham': 'UAB Blazers',
    'Miami FL': 'Miami Hurricanes',
    'Miami Florida': 'Miami Hurricanes',
    'The U': 'Miami Hurricanes',
    'Appalachian State': 'App State Mountaineers',
    'Louisiana Monroe': 'UL Monroe Warhawks',
    'Louisiana-Monroe': 'UL Monroe Warhawks',
    'Southern Mississippi': 'Southern Miss Golden Eagles',
    'Hawaii': 'Hawai\'i Rainbow Warriors',
    'San Jose State': 'San José State Spartans',
    'Middle Tennessee State': 'Middle Tennessee Blue Raiders',
    'Texas-San Antonio Roadrunners': 'UTSA Roadrunners',
    'Miami Ohio': 'Miami (OH) RedHawks',
    'Cal': 'California Golden Bears',
    'Connecticut': 'UConn Huskies',
    'North Carolina State': 'NC State Wolfpack',
    'Miss State': 'Mississippi State Bulldogs',
    'Sam Houston State': 'Sam Houston Bearkats'
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
    nba: _buildMaps(NBA_FULL, _aliasFromFull(NBA_FULL, NBA_SHORT_ALIASES), {
      'Los Angeles Lakers': { bg: '#552583', fg: '#FDB927' },
      'Boston Celtics': { bg: '#007A33', fg: '#BA9653' },
      'Golden State Warriors': { bg: '#1D428A', fg: '#FFC72C' }
    }),
    nhl: _buildMaps(NHL_FULL, _aliasFromFull(NHL_FULL, NHL_SHORT_ALIASES), {
      'Toronto Maple Leafs': { bg: '#00205B', fg: '#FFFFFF' },
      'Boston Bruins': { bg: '#FFB81C', fg: '#000000' },
      'Vegas Golden Knights': { bg: '#B4975A', fg: '#333F42' }
    }),
    wnba: _buildMaps(WNBA_FULL, _aliasFromFull(WNBA_FULL), {}),
    mls: _buildMaps(MLS_FULL, _aliasFromFull(MLS_FULL), {}),
    ncaafb: _buildMaps(NCAAF_FULL, NCAAF_SHORT_ALIASES, {}),
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
    var lower = n.toLowerCase();
    var fullKeys = Object.keys(data.fullToAbbrev);
    for (var fi = 0; fi < fullKeys.length; fi++) {
      if (fullKeys[fi].toLowerCase() === lower) return fullKeys[fi];
    }
    var aliasKeys = Object.keys(data.aliases);
    for (var ai = 0; ai < aliasKeys.length; ai++) {
      if (aliasKeys[ai].toLowerCase() === lower) {
        var mapped = data.aliases[aliasKeys[ai]];
        if (mapped && data.fullToAbbrev[mapped]) return mapped;
      }
    }
    var want = n.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (want) {
      for (var ni = 0; ni < fullKeys.length; ni++) {
        var nk = fullKeys[ni].toLowerCase().replace(/[^a-z0-9]/g, '');
        if (nk === want) return fullKeys[ni];
      }
      for (var aj = 0; aj < aliasKeys.length; aj++) {
        var ak = aliasKeys[aj].toLowerCase().replace(/[^a-z0-9]/g, '');
        if (ak === want) {
          var mapped2 = data.aliases[aliasKeys[aj]];
          if (mapped2 && data.fullToAbbrev[mapped2]) return mapped2;
        }
      }
    }
    // NCAAF: never use loose substring fuzzy matching
    if (sport === 'ncaafb') return n;
    for (var i = 0; i < fullKeys.length; i++) {
      if (teamMatches(fullKeys[i], n)) return fullKeys[i];
    }
    return n;
  }

  // NCAAF runtime ID cache (search hits + localStorage)
  var _ncaafIdByNorm = {};
  var _ncaafMiss = {};
  var _ncaafPending = {};
  var _NCAAF_LS_PREFIX = 'pbNcaafLogo:v1:';
  var _NCAAF_LS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function _ncaafCacheRead(normKey) {
    try {
      if (typeof localStorage === 'undefined') return null;
      var raw = localStorage.getItem(_NCAAF_LS_PREFIX + normKey);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.expiresAt || Date.now() > obj.expiresAt) {
        localStorage.removeItem(_NCAAF_LS_PREFIX + normKey);
        return null;
      }
      return obj.id ? String(obj.id) : null;
    } catch (_e) { return null; }
  }

  function _ncaafCacheWrite(normKey, id) {
    try {
      if (typeof localStorage === 'undefined' || !normKey || !id) return;
      localStorage.setItem(_NCAAF_LS_PREFIX + normKey, JSON.stringify({
        id: String(id),
        expiresAt: Date.now() + _NCAAF_LS_TTL_MS
      }));
    } catch (_e) {}
  }

  function _lookupVerifiedNcaafId(teamName) {
    var map = global.VERIFIED_NCAAF_TEAM_IDS;
    if (!map || !teamName) return '';
    if (map[teamName] != null) return String(map[teamName]);
    var want = String(teamName).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!want) return '';
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var nk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (nk === want) return String(map[k]);
    }
    return '';
  }

  function _lookupNcaafIdSync(teamName) {
    if (!teamName) return '';
    var want = String(teamName).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (want && _ncaafIdByNorm[want]) return _ncaafIdByNorm[want];
    if (want) {
      var cached = _ncaafCacheRead(want);
      if (cached) {
        _ncaafIdByNorm[want] = cached;
        return cached;
      }
    }
    var verifiedId = _lookupVerifiedNcaafId(teamName);
    if (verifiedId) {
      if (want) _ncaafIdByNorm[want] = verifiedId;
      return verifiedId;
    }
    var data = TEAM_DATA.ncaafb;
    if (!data) return '';
    var key = resolveTeamName(teamName, 'ncaafb');
    var ab = data.fullToAbbrev[key];
    if (ab && /^\d+$/.test(String(ab))) {
      if (want) _ncaafIdByNorm[want] = String(ab);
      return String(ab);
    }
    verifiedId = _lookupVerifiedNcaafId(key);
    if (verifiedId) {
      if (want) _ncaafIdByNorm[want] = verifiedId;
      return verifiedId;
    }
    return '';
  }

  function getTeamAbbrev(teamName, sport) {
    sport = normalizeSport(sport);
    // NCAAF logos require ESPN numeric IDs (abbrev slugs 404 on ncaa/500 CDN).
    if (sport === 'ncaafb') {
      return _lookupNcaafIdSync(teamName);
    }
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
    var initials = getTeamInitials(teamName);

    // NCAAF: numeric ESPN IDs only; missing IDs get a hydrate placeholder + search fallback.
    if (sport === 'ncaafb') {
      var ncaafId = _lookupNcaafIdSync(teamName);
      var cls = className ? ' class="' + esc(className) + '"' : '';
      if (!ncaafId) {
        return '<span data-ncaaf-team="' + esc(teamName || '') + '" data-team-name="' + esc(teamName || '') +
          '" data-team-sport="ncaafb" data-logo-size="' + size + '"' +
          (className ? ' data-logo-class="' + esc(className) + '"' : '') + '>' +
          _fallbackHtml(teamName, sport, size, className) + '</span>';
      }
      var combiner = 'https://a.espncdn.com/combiner/i?img=' + encodeURIComponent('/i/teamlogos/ncaa/500/' + ncaafId + '.png') +
        '&w=' + size + '&h=' + size;
      var direct = 'https://a.espncdn.com/i/teamlogos/ncaa/500/' + ncaafId + '.png';
      return '<img' + cls +
        ' src="' + esc(combiner) + '"' +
        ' alt="' + esc(teamName || initials) + '"' +
        ' width="' + size + '" height="' + size + '"' +
        ' style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;display:block"' +
        ' referrerpolicy="no-referrer"' +
        ' data-logo-step="0"' +
        ' data-ncaaf-team="' + esc(teamName || '') + '"' +
        ' data-team-name="' + esc(teamName) + '"' +
        ' data-team-sport="ncaafb"' +
        ' data-logo-direct="' + esc(direct) + '"' +
        ' data-logo-size="' + size + '"' +
        (className ? ' data-logo-class="' + esc(className) + '"' : '') +
        ' onerror="window.handleTeamLogoError&&window.handleTeamLogoError(this)">';
    }

    var combiner = getTeamLogo(teamName, sport, size);
    var direct = getTeamLogoDirect(teamName, sport);
    if (!combiner) return _fallbackHtml(teamName, sport, size, className);

    var cls2 = className ? ' class="' + esc(className) + '"' : '';
    return '<img' + cls2 +
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

    // NCAAF: attempt ESPN college search before initials fallback
    if (normalizeSport(sport) === 'ncaafb' && teamName && img.getAttribute('data-ncaaf-search') !== '1') {
      img.setAttribute('data-ncaaf-search', '1');
      if (typeof global.searchNcaafTeamId === 'function') {
        global.searchNcaafTeamId(teamName).then(function (id) {
          if (!id || !img || !img.parentNode) return;
          var combiner = 'https://a.espncdn.com/combiner/i?img=' +
            encodeURIComponent('/i/teamlogos/ncaa/500/' + id + '.png') + '&w=' + size + '&h=' + size;
          img.setAttribute('data-logo-step', '0');
          img.setAttribute('data-logo-direct', 'https://a.espncdn.com/i/teamlogos/ncaa/500/' + id + '.png');
          img.src = combiner;
        }).catch(function () {
          _finishTeamLogoFallback(img, teamName, sport, size, className);
        });
        return;
      }
    }

    _finishTeamLogoFallback(img, teamName, sport, size, className);
  }

  function _finishTeamLogoFallback(img, teamName, sport, size, className) {
    if (!img) return;
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
  var _verifiedSoccerSeeded = false;

  function _seedVerifiedSoccerTeams() {
    if (_verifiedSoccerSeeded) return;
    var map = global.VERIFIED_SOCCER_TEAM_IDS;
    if (map) {
      Object.keys(map).forEach(function (name) {
        _rememberSoccerTeam(name, map[name], '');
      });
    }
    if (typeof SOCCER_TEAM_IDS !== 'undefined' && SOCCER_TEAM_IDS) {
      Object.keys(SOCCER_TEAM_IDS).forEach(function (name) {
        _rememberSoccerTeam(name, SOCCER_TEAM_IDS[name], '');
      });
    }
    if (typeof SOCCER_TEAM_ALIASES !== 'undefined' && SOCCER_TEAM_ALIASES) {
      Object.keys(SOCCER_TEAM_ALIASES).forEach(function (name) {
        _rememberSoccerTeam(name, SOCCER_TEAM_ALIASES[name], '');
      });
    }
    _verifiedSoccerSeeded = true;
  }

  var _tennisIdByNorm = {};
  var _tennisMiss = {};
  var _tennisPending = {};
  var _dbPhotoByNorm = {};

  function _playerPhotoApiBase() {
    if (typeof global.API === 'string' && global.API) return global.API;
    if (typeof API === 'string' && API) return API;
    if (global._PBS_BACKEND) return global._PBS_BACKEND;
    return 'https://pocketbooks-sports-backend-production.up.railway.app';
  }

  async function _lookupDbPlayerPhoto(playerName, sport) {
    var k = _normKey(playerName);
    if (!k) return null;
    if (_dbPhotoByNorm[k]) return { photoUrl: _dbPhotoByNorm[k], cached: true };
    try {
      var url = _playerPhotoApiBase() + '/api/player-photo/' +
        encodeURIComponent(sport || 'tennis') + '/' + encodeURIComponent(String(playerName).trim());
      var res = await fetch(url, { cache: 'no-store' });
      var d = await res.json();
      if (d && d.ok && d.photoUrl) {
        _dbPhotoByNorm[k] = d.photoUrl;
        if (d.espnId) _tennisIdByNorm[k] = String(d.espnId);
        return d;
      }
    } catch (_e) {}
    return null;
  }

  // Major-league soccer IDs — EPL, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, MLS
  var SOCCER_TEAM_IDS = {
    '1. FC Union Berlin': '598',
    'AC Milan': '103',
    'AEK Athens': '887',
    'AFC Bournemouth': '349',
    'AJ Auxerre': '172',
    'Alavés': '96',
    'Angers': '7868',
    'Arsenal': '359',
    'AS Monaco': '174',
    'AS Roma': '104',
    'Aston Villa': '362',
    'Atalanta': '105',
    'Athletic Club': '93',
    'Atlanta United FC': '18418',
    'Atlético Madrid': '1068',
    'Austin FC': '20906',
    'Barcelona': '83',
    'Bayer Leverkusen': '131',
    'Bayern Munich': '132',
    'Bodo/Glimt': '2980',
    'Bologna': '107',
    'Borussia Dortmund': '124',
    'Borussia Mönchengladbach': '268',
    'Brentford': '337',
    'Brest': '6997',
    'Brighton & Hove Albion': '331',
    'Cagliari': '2925',
    'Celta Vigo': '85',
    'CF Montréal': '9720',
    'Charlotte FC': '21300',
    'Chelsea': '363',
    'Chicago Fire FC': '182',
    'Club Brugge': '570',
    'Colorado Rapids': '184',
    'Columbus Crew': '183',
    'Como': '2572',
    'Coventry City': '388',
    'Crystal Palace': '384',
    'D.C. United': '193',
    'Deportivo': '90',
    'Eintracht Frankfurt': '125',
    'Elche': '3751',
    'Espanyol': '88',
    'Everton': '368',
    'FC Augsburg': '3841',
    'FC Cincinnati': '18267',
    'FC Cologne': '122',
    'FC Dallas': '185',
    'FC Porto': '437',
    'Fenerbahce': '436',
    'Feyenoord Rotterdam': '142',
    'Fiorentina': '109',
    'Frosinone': '4057',
    'Fulham': '370',
    'Galatasaray': '432',
    'Genoa': '3263',
    'Getafe': '2922',
    'Hamburg SV': '127',
    'Houston Dynamo FC': '6077',
    'Hull City': '306',
    'Inter Miami CF': '20232',
    'Internazionale': '110',
    'Ipswich Town': '373',
    'Juventus': '111',
    'LA Galaxy': '187',
    'LAFC': '18966',
    'LASK Linz': '4411',
    'Lazio': '112',
    'Le Havre AC': '3236',
    'Le Mans': '2697',
    'Lecce': '113',
    'Leeds United': '357',
    'Lens': '175',
    'Levante': '1538',
    'Lille': '166',
    'Liverpool': '364',
    'Lorient': '273',
    'Lyon': '167',
    'Mainz': '2950',
    'Manchester City': '382',
    'Manchester United': '360',
    'Marseille': '176',
    'Minnesota United FC': '17362',
    'Monza': '4007',
    'Málaga': '99',
    'Napoli': '114',
    'Nashville SC': '18986',
    'New England Revolution': '189',
    'New York City FC': '17606',
    'Newcastle United': '361',
    'Nice': '2502',
    'Nottingham Forest': '393',
    'Orlando City SC': '12011',
    'Osasuna': '97',
    'Paris FC': '6851',
    'Paris Saint-Germain': '160',
    'Parma': '115',
    'Philadelphia Union': '10739',
    'Portland Timbers': '9723',
    'PSV Eindhoven': '148',
    'Racing Santander': '87',
    'Rayo Vallecano': '101',
    'RB Leipzig': '11420',
    'Real Betis': '244',
    'Real Madrid': '86',
    'Real Salt Lake': '4771',
    'Real Sociedad': '89',
    'Red Bull New York': '190',
    'Sabah FK': '21922',
    'San Diego FC': '22529',
    'San Jose Earthquakes': '191',
    'Sassuolo': '3997',
    'SC Freiburg': '126',
    'SC Paderborn 07': '3307',
    'Schalke 04': '133',
    'Seattle Sounders FC': '9726',
    'Sevilla': '243',
    'Shakhtar Donetsk': '493',
    'Slavia Prague': '494',
    'Slovan Bratislava': '521',
    'Sporting CP': '2250',
    'Sporting Kansas City': '186',
    'St. Louis CITY SC': '21812',
    'Stade Rennais': '169',
    'Strasbourg': '180',
    'Sunderland': '366',
    'SV Elversberg': '10388',
    'Torino': '239',
    'Toronto FC': '7318',
    'Tottenham Hotspur': '367',
    'Toulouse': '179',
    'Troyes': '170',
    'TSG Hoffenheim': '7911',
    'Udinese': '118',
    'Valencia': '94',
    'Vancouver Whitecaps': '9727',
    'Venezia': '17530',
    'VfB Stuttgart': '134',
    'Viking FK': '510',
    'Villarreal': '102',
    'Werder Bremen': '137'
  };

  // Common betting / feed aliases → ESPN team id
  var SOCCER_TEAM_ALIASES = {
    'Athletic': '93',
    'Atlanta': '18418',
    'Atleti': '1068',
    'Atletico Madrid': '1068',
    'Atlético': '1068',
    'Augsburg': '3841',
    'Austin': '20906',
    'Auxerre': '172',
    'Barca': '83',
    'Barcelona': '83',
    'Bayern': '132',
    'Betis': '244',
    'Bournemouth': '349',
    'Bremen': '137',
    'Brighton': '331',
    'BVB': '124',
    'C Palace': '384',
    'Charlotte': '21300',
    'Chicago': '182',
    'Cincinnati': '18267',
    'Cologne': '122',
    'Colorado': '184',
    'Columbus': '183',
    'Coventry': '388',
    'Dallas': '185',
    'Dortmund': '124',
    'Elversberg': '10388',
    'Feyenoord': '142',
    'Forest': '393',
    'Frankfurt': '125',
    'Freiburg': '126',
    'Galaxy': '187',
    'Gladbach': '268',
    'Hamburg': '127',
    'Hoffenheim': '7911',
    'Houston': '6077',
    'Hull': '306',
    'Inter': '110',
    'Inter Miami': '20232',
    'Inter Milan': '110',
    'Ipswich': '373',
    'Kansas City': '186',
    'LA Galaxy': '187',
    'LAFC': '18966',
    'Leeds': '357',
    'Leverkusen': '131',
    'Man City': '382',
    'Man United': '360',
    'Man Utd': '360',
    'Miami': '20232',
    'Milan': '103',
    'Minnesota': '17362',
    'Monaco': '174',
    'Nashville': '18986',
    'New England': '189',
    'New York Red Bulls': '190',
    'Newcastle': '361',
    'Nottm Forest': '393',
    'NY Red Bulls': '190',
    'NYCFC': '17606',
    'Orlando': '12011',
    'Paderborn': '3307',
    'Philadelphia': '10739',
    'Portland': '9723',
    'PSG': '160',
    'PSV': '148',
    'Racing': '87',
    'Rayo': '101',
    'Red Bull NY': '190',
    'Red Bulls': '190',
    'Rennes': '169',
    'S Bratislava': '521',
    'Sabah': '21922',
    'Salt Lake': '4771',
    'San Diego': '22529',
    'San Jose': '191',
    'Schalke': '133',
    'Seattle': '9726',
    'Shakhtar': '493',
    'Sounders': '9726',
    'Sporting': '2250',
    'Spurs': '367',
    'St. Louis': '21812',
    'Stuttgart': '134',
    'Toronto': '7318',
    'Tottenham': '367',
    'Union Berlin': '598',
    'Vancouver': '9727',
    'Vancouver Whitecaps FC': '9727',
    'Whitecaps': '9727'
  };

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
    _seedVerifiedSoccerTeams();
    var k = _normKey(teamName);
    if (!k) return '';
    if (_soccerIdByNorm[k]) return _soccerIdByNorm[k];
    var verified = global.VERIFIED_SOCCER_TEAM_IDS;
    if (verified) {
      if (verified[teamName] != null) return String(verified[teamName]);
      var keys = Object.keys(verified);
      for (var vi = 0; vi < keys.length; vi++) {
        if (_normKey(keys[vi]) === k) return String(verified[keys[vi]]);
      }
    }
    // Fuzzy: substring match against known keys
    var known = Object.keys(_soccerIdByNorm);
    for (var i = 0; i < known.length; i++) {
      var kk = known[i];
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
    var k0 = _normKey(playerName);
    if (k0 && _dbPhotoByNorm[k0]) return _dbPhotoByNorm[k0];
    // Tier 1: verified player-photos.js map
    if (typeof global.getPlayerHeadshotUrl === 'function') {
      var verifiedUrl = global.getPlayerHeadshotUrl(playerName, 'tennis');
      if (verifiedUrl) return verifiedUrl;
    }
    if (typeof global.getVerifiedPlayerId === 'function') {
      var verifiedId = global.getVerifiedPlayerId(playerName, 'tennis');
      if (verifiedId) {
        return 'https://a.espncdn.com/i/headshots/tennis/players/full/' + verifiedId + '.png';
      }
    }
    var k = _normKey(playerName);
    var id = k && _tennisIdByNorm[k];
    if (!id) return '';
    return 'https://a.espncdn.com/i/headshots/tennis/players/full/' + id + '.png';
  }

  async function _fetchTennisPlayerId(playerName) {
    var k = _normKey(playerName);
    if (!k) return null;
    if (typeof global.getVerifiedPlayerId === 'function') {
      var verifiedId = global.getVerifiedPlayerId(playerName, 'tennis');
      if (verifiedId) {
        _tennisIdByNorm[k] = String(verifiedId);
        return String(verifiedId);
      }
    }
    if (_tennisIdByNorm[k]) return _tennisIdByNorm[k];
    if (_tennisMiss[k]) return null;
    if (_tennisPending[k]) return _tennisPending[k];

    _tennisPending[k] = (async function () {
      try {
        var dbHit = await _lookupDbPlayerPhoto(playerName, 'tennis');
        if (dbHit && (dbHit.espnId || dbHit.photoUrl)) {
          if (dbHit.espnId) _tennisIdByNorm[k] = String(dbHit.espnId);
          return dbHit.espnId ? String(dbHit.espnId) : (_tennisIdByNorm[k] || null);
        }
        return await _fetchTennisPlayerIdFromEspn(playerName, k);
      } finally {
        delete _tennisPending[k];
      }
    })();
    return _tennisPending[k];
  }

  async function _fetchTennisPlayerIdFromEspn(playerName, k) {
    if (typeof global.searchEspnPlayerId === 'function') {
      try {
        var hit = await global.searchEspnPlayerId(playerName, 'tennis', '');
        if (hit && hit.id) {
          _tennisIdByNorm[k] = String(hit.id);
          return String(hit.id);
        }
        _tennisMiss[k] = true;
        return null;
      } catch (_e) {
        _tennisMiss[k] = true;
        return null;
      }
    }

    var parts = String(playerName || '').trim().split(/\s+/).filter(Boolean);
    var firstLast = parts.length >= 2 ? (parts[0] + ' ' + parts[parts.length - 1]) : String(playerName || '').trim();
    var queries = [firstLast + ' tennis', firstLast];
    try {
      var pick = null;
      for (var qi = 0; qi < queries.length && !pick; qi++) {
        var url = 'https://site.api.espn.com/apis/common/v3/search?query=' +
          encodeURIComponent(queries[qi]) +
          '&sport=tennis&type=player&limit=3';
        var res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) continue;
        var data = await res.json();
        var items = (data && data.items) || [];
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (!it || !it.id) continue;
          var sp = String(it.sport || '').toLowerCase();
          var lg = String(it.league || '').toLowerCase();
          if (sp && sp !== 'tennis') continue;
          if (lg && lg !== 'atp' && lg !== 'wta' && lg !== 'tennis') continue;
          pick = it;
          break;
        }
      }
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
    }
  }

  function handleTennisPhotoError(img) {
    if (!img) return;
    // Prefer shared tiered onerror when available
    if (typeof global.handlePlayerPhotoError === 'function' && img.getAttribute('data-player-sport')) {
      return global.handlePlayerPhotoError(img);
    }
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
    // Shared photo system (verified map → search → initials)
    if (typeof global.getPlayerPhotoImg === 'function') {
      return global.getPlayerPhotoImg(name, 'tennis', size, { className: className || '' });
    }
    var url = getTennisPlayerPhoto(name);
    var cls = className ? ' class="' + esc(className) + '"' : '';

    if (!url) {
      return '<span data-tennis-player="' + esc(name) + '" data-player-photo="' + esc(name) +
        '" data-player-name="' + esc(name) + '" data-player-sport="tennis" data-logo-size="' + size + '"' +
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
      ' data-player-photo="' + esc(name) + '"' +
      ' data-player-name="' + esc(name) + '"' +
      ' data-player-sport="tennis"' +
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


  function _isCollegeFootballSearchItem(it) {
    if (!it || !it.id) return false;
    var sport = String(it.sport || '').toLowerCase();
    var league = String(it.league || it.defaultLeagueSlug || '').toLowerCase();
    if (sport && sport !== 'football') return false;
    if (league === 'nfl' || /(^|[^a-z])nfl([^a-z]|$)/.test(league)) return false;
    if (league.indexOf('college') >= 0 || league === 'ncaaf' || league === 'ncaa-football') return true;
    if (it.collegeId != null) return true;
    return sport === 'football' || !league;
  }

  async function searchNcaafTeamId(teamName) {
    var name = String(teamName || '').trim();
    var k = _normKey(name);
    if (!k) return null;
    var sync = _lookupNcaafIdSync(name);
    if (sync) return sync;
    if (_ncaafMiss[k]) return null;
    if (_ncaafPending[k]) return _ncaafPending[k];

    _ncaafPending[k] = (async function () {
      try {
        var url = 'https://site.api.espn.com/apis/common/v3/search?query=' +
          encodeURIComponent(name + ' ncaa football') +
          '&sport=football&type=team&limit=8';
        var res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) {
          _ncaafMiss[k] = true;
          return null;
        }
        var data = await res.json();
        var items = (data && data.items) || [];
        var want = k;
        var pick = null;
        var ambiguous = false;
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (!_isCollegeFootballSearchItem(it)) continue;
          var dn = _normKey(it.displayName || it.name || '');
          if (dn === want) {
            if (pick && String(pick.id) !== String(it.id)) { ambiguous = true; break; }
            pick = it;
          }
        }
        if (ambiguous || !pick || !pick.id) {
          _ncaafMiss[k] = true;
          return null;
        }
        var idStr = String(pick.id);
        _ncaafIdByNorm[k] = idStr;
        _ncaafCacheWrite(k, idStr);
        if (pick.displayName) {
          var dk = _normKey(pick.displayName);
          if (dk) {
            _ncaafIdByNorm[dk] = idStr;
            _ncaafCacheWrite(dk, idStr);
          }
        }
        delete _ncaafMiss[k];
        return idStr;
      } catch (_e) {
        _ncaafMiss[k] = true;
        return null;
      } finally {
        delete _ncaafPending[k];
      }
    })();

    return _ncaafPending[k];
  }

  var _ncaafApiSeeded = false;
  var _ncaafApiPromise = null;

  function _rememberNcaafMapping(name, id) {
    if (!name || id == null) return;
    var idStr = String(id);
    var k = _normKey(name);
    if (!k) return;
    _ncaafIdByNorm[k] = idStr;
    _ncaafCacheWrite(k, idStr);
    if (TEAM_DATA.ncaafb) {
      var keys = Object.keys(TEAM_DATA.ncaafb.fullToAbbrev || {});
      for (var i = 0; i < keys.length; i++) {
        if (String(TEAM_DATA.ncaafb.fullToAbbrev[keys[i]]) === idStr) {
          TEAM_DATA.ncaafb.aliases[name] = keys[i];
          break;
        }
      }
    }
  }

  async function warmNcaafTeamLogosFromApi(apiBase) {
    if (_ncaafApiSeeded) return true;
    if (_ncaafApiPromise) return _ncaafApiPromise;
    var base = String(apiBase || (typeof global.API === 'string' ? global.API : '') || '').replace(/\/$/, '');
    if (!base) return false;
    _ncaafApiPromise = (async function () {
      try {
        var res = await fetch(base + '/api/team-logos/ncaaf', { cache: 'no-store' });
        if (!res.ok) return false;
        var data = await res.json();
        var teams = (data && data.teams) || [];
        teams.forEach(function (t) {
          if (!t) return;
          var id = t.providerTeamId || t.provider_team_id;
          var canon = t.canonicalName || t.canonical_name || t.displayName || t.display_name;
          if (canon && id) {
            if (TEAM_DATA.ncaafb && !TEAM_DATA.ncaafb.fullToAbbrev[canon]) {
              TEAM_DATA.ncaafb.fullToAbbrev[canon] = String(id);
            }
            _rememberNcaafMapping(canon, id);
          }
          (t.aliases || []).forEach(function (a) { _rememberNcaafMapping(a, id); });
          if (t.abbreviation) _rememberNcaafMapping(t.abbreviation, id);
          if (t.location) _rememberNcaafMapping(t.location, id);
        });
        _ncaafApiSeeded = true;
        return true;
      } catch (_e) {
        return false;
      } finally {
        _ncaafApiPromise = null;
      }
    })();
    return _ncaafApiPromise;
  }

  async function hydrateEspnLobbyMedia(root) {
    var scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return;

    await warmSoccerTeamsCache();
    try {
      var apiBase = (typeof global.API === 'string' && global.API) || '';
      await warmNcaafTeamLogosFromApi(apiBase);
    } catch (_eApi) {}

    // Shared verified/search photo hydrate for tennis (and any data-player-photo nodes)
    if (typeof global.hydratePlayerPhotos === 'function') {
      try { await global.hydratePlayerPhotos(scope, 'tennis'); } catch (_eHydra) {}
    }

    var soccerEls = Array.prototype.slice.call(scope.querySelectorAll('[data-soccer-team]'));
    var tennisEls = Array.prototype.slice.call(scope.querySelectorAll('[data-tennis-player],[data-player-photo][data-player-sport="tennis"]'));
    var ncaafEls = Array.prototype.slice.call(scope.querySelectorAll('[data-ncaaf-team]'));

    var soccerNames = [];
    soccerEls.forEach(function (el) {
      var n = el.getAttribute('data-soccer-team') || '';
      if (n) soccerNames.push(n);
    });
    var tennisNames = [];
    tennisEls.forEach(function (el) {
      var n = el.getAttribute('data-tennis-player') || el.getAttribute('data-player-name') || el.getAttribute('data-player-photo') || '';
      if (n) tennisNames.push(n);
    });
    var ncaafNames = [];
    ncaafEls.forEach(function (el) {
      var n = el.getAttribute('data-ncaaf-team') || el.getAttribute('data-team-name') || '';
      if (n && !_lookupNcaafIdSync(n)) ncaafNames.push(n);
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
      runPool(tennisNames, _fetchTennisPlayerId, 6),
      runPool(ncaafNames, searchNcaafTeamId, 6)
    ]);

    if (!scope.isConnected && scope !== document) return;

    soccerEls = Array.prototype.slice.call(scope.querySelectorAll('[data-soccer-team]'));
    tennisEls = Array.prototype.slice.call(scope.querySelectorAll('[data-tennis-player],[data-player-photo][data-player-sport="tennis"]'));
    ncaafEls = Array.prototype.slice.call(scope.querySelectorAll('[data-ncaaf-team]'));

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
      var name = el.getAttribute('data-tennis-player') || el.getAttribute('data-player-name') || el.getAttribute('data-player-photo') || '';
      var size = parseInt(el.getAttribute('data-logo-size') || '40', 10);
      var className = el.getAttribute('data-logo-class') || '';
      var url = getTennisPlayerPhoto(name);
      if (el.tagName === 'IMG' && url && el.getAttribute('src') === url) return;
      if (!url) return;
      _replacePlaceholderWithImg(el, getTennisPlayerPhotoImg(name, size, className));
    });

    ncaafEls.forEach(function (el) {
      var name = el.getAttribute('data-ncaaf-team') || el.getAttribute('data-team-name') || '';
      var size = parseInt(el.getAttribute('data-logo-size') || '40', 10);
      var className = el.getAttribute('data-logo-class') || '';
      var id = _lookupNcaafIdSync(name);
      if (!id) return;
      var html = getTeamLogoImg(name, 'ncaafb', size, className);
      _replacePlaceholderWithImg(el, html);
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
  _seedVerifiedSoccerTeams();
})(typeof window !== 'undefined' ? window : this);
