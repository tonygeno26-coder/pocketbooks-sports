/**
 * PocketBooks Sports — Owls Insight Odds Provider Integration Tests (Phase 1)
 * Run: node tests/owls-insight.test.js
 * Pure logic — no network.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b));
}

// ── Sport key mapping ─────────────────────────────────────────────────────────

const SPORT_MAP = {
  basketball_nba:       'nba',
  nba:                  'nba',
  americanfootball_nfl: 'nfl',
  nfl:                  'nfl',
  icehockey_nhl:        'nhl',
  nhl:                  'nhl',
  baseball_mlb:         'mlb',
  mlb:                  'mlb',
  basketball_ncaab:     'ncaab',
  ncaab:                'ncaab',
  americanfootball_ncaaf:'ncaaf',
  ncaaf:                'ncaaf'
};

function mapToOwlsSport(key) {
  return SPORT_MAP[key] || null;
}

// ── URL builder ───────────────────────────────────────────────────────────────

function buildOwlsUrl(baseUrl, sportKey, books, alternates) {
  var owlsSport = mapToOwlsSport(sportKey);
  if (!owlsSport) return null;
  var url = (baseUrl||'https://api.owlsinsight.com').replace(/\/$/, '')
    + '/api/v1/' + owlsSport + '/odds';
  var params = [];
  if (books) params.push('books=' + books);
  params.push('alternates=' + (alternates ? 'true' : 'false'));
  return url + '?' + params.join('&');
}

// ── Config checker ────────────────────────────────────────────────────────────

function checkOwlsConfig(env) {
  if (!env.OWLS_INSIGHT_API_KEY) return { ok:false, error:'owls_insight_not_configured' };
  return { ok:true };
}

function getActiveProvider(env) {
  return env.ODDS_PROVIDER === 'owls_insight' ? 'owls_insight' : 'the_odds_api';
}

// ── Owls response normalizer ──────────────────────────────────────────────────

function normalizeOwlsResponse(owlsData, sportKey) {
  if (!owlsData || !owlsData.success || !owlsData.data) {
    return { ok:false, error:'invalid_owls_response', games:[], marketsByCanonicalKey:{},
             marketsByProviderGameId:{}, sourceStatus:'error', warnings:['invalid_owls_response'] };
  }

  var allEvents = [];
  // Merge events across books (dedup by event id) — handle flat array or per-book object
  var seen = {};
  function _addEv(ev){ if(ev&&ev.id&&!seen[ev.id]){seen[ev.id]=true;allEvents.push(ev);} }
  var _rd = owlsData.data;
  if (Array.isArray(_rd)) { _rd.forEach(_addEv); }
  else { Object.values(_rd).forEach(function(v){ if(Array.isArray(v)) v.forEach(_addEv); else _addEv(v); }); }

  var games = [];
  var marketsByCanonicalKey = {};
  var marketsByProviderGameId = {};
  var warnings = [];

  allEvents.forEach(function(ev) {
    var date = ev.commence_time ? ev.commence_time.slice(0,10) : '';
    var canonicalKey = (sportKey||'?') + '|' + (ev.away_team||'') + '|' + (ev.home_team||'') + '|' + date;

    var gameEntry = {
      id:              ev.id,
      sport_key:       ev.sport_key || sportKey,
      commence_time:   ev.commence_time,
      home_team:       ev.home_team,
      away_team:       ev.away_team,
      canonicalKey,
      markets:         []
    };

    // Collect markets from all bookmakers on this event
    (ev.bookmakers||[]).forEach(function(bm) {
      (bm.markets||[]).forEach(function(mkt) {
        var marketType = null;
        var _mk2 = mkt.key||'';
        if      (_mk2==='h2h'||_mk2==='moneyline') marketType = 'moneyline';
        else if (_mk2==='spreads'||_mk2==='spread') marketType = 'spread';
        else if (_mk2==='totals'||_mk2==='total')   marketType = 'total';
        if (!marketType) return;

        if (mkt.suspended) {
          warnings.push('suspended:' + ev.id + ':' + mkt.key);
          return;
        }

        (mkt.outcomes||[]).forEach(function(oc) {
          var entry = {
            marketType,
            sportsbook:    bm.key,
            sportsbookName:bm.title,
            teamOrSide:    oc.name,
            odds:          _toAmericanOdds(parseFloat(oc.price)||0),
            lastUpdate:    bm.last_update,
            providerGameId:ev.id,
            canonicalKey
          };
          if (oc.point != null) entry.line = oc.point;
          if (marketType === 'total') entry.overUnder = oc.name; // 'Over'/'Under'
          gameEntry.markets.push(entry);
        });
      });
    });

    games.push(gameEntry);

    if (!marketsByCanonicalKey[canonicalKey]) marketsByCanonicalKey[canonicalKey] = [];
    gameEntry.markets.forEach(function(m) { marketsByCanonicalKey[canonicalKey].push(m); });

    if (!marketsByProviderGameId[ev.id]) marketsByProviderGameId[ev.id] = [];
    gameEntry.markets.forEach(function(m) { marketsByProviderGameId[ev.id].push(m); });
  });

  return {
    ok: true,
    games,
    marketsByCanonicalKey,
    marketsByProviderGameId,
    sourceStatus: games.length ? 'live' : 'empty',
    warnings,
    meta: owlsData.meta || {}
  };
}

// ── HTTP error classifier ─────────────────────────────────────────────────────

function classifyOwlsHttpError(status) {
  if (status === 401 || status === 403) return { ok:false, error:'owls_insight_unauthorized', status };
  if (status === 429)                   return { ok:false, error:'provider_rate_limited',     status };
  if (status >= 500)                    return { ok:false, error:'owls_insight_server_error', status };
  return                                       { ok:false, error:'owls_insight_http_error',   status };
}

// ── Decimal to American odds conversion ─────────────────────────────────────

function _toAmericanOdds(price) {
  if (typeof price !== 'number') return price;
  if (Math.abs(price) <= 30 && price > 0) {
    if (price >= 2) return Math.round((price - 1) * 100);
    else            return Math.round(-100 / (price - 1));
  }
  return price;
}

// ── Sample Owls response ──────────────────────────────────────────────────────

var SAMPLE_OWLS = {
  success: true,
  data: {
    pinnacle: [{
      id: 'OI_NBA_001',
      sport_key: 'nba',
      commence_time: '2026-05-20T23:00:00Z',
      home_team: 'Boston Celtics',
      away_team: 'New York Knicks',
      bookmakers: [{
        key: 'pinnacle', title: 'Pinnacle', last_update: '2026-05-20T20:00:00Z',
        markets: [
          { key:'h2h', suspended:false, outcomes:[
            { name:'Boston Celtics', price:-160 },
            { name:'New York Knicks', price:+135 }
          ]},
          { key:'spreads', suspended:false, outcomes:[
            { name:'Boston Celtics', price:-110, point:-3.5 },
            { name:'New York Knicks', price:-110, point:+3.5 }
          ]},
          { key:'totals', suspended:false, outcomes:[
            { name:'Over',  price:-110, point:218.5 },
            { name:'Under', price:-110, point:218.5 }
          ]}
        ]
      }]
    }],
    fanduel: [{
      id: 'OI_NBA_001',
      sport_key: 'nba',
      commence_time: '2026-05-20T23:00:00Z',
      home_team: 'Boston Celtics',
      away_team: 'New York Knicks',
      bookmakers: [{
        key: 'fanduel', title: 'FanDuel', last_update: '2026-05-20T20:00:00Z',
        markets: [
          { key:'h2h', suspended:false, outcomes:[
            { name:'Boston Celtics', price:-155 },
            { name:'New York Knicks', price:+130 }
          ]}
        ]
      }]
    }]
  },
  meta: { sport:'nba', timestamp:'2026-05-20T20:00:00Z', freshness:'live' }
};

var SAMPLE_SUSPENDED = {
  success: true,
  data: {
    pinnacle: [{
      id: 'OI_NBA_002',
      sport_key: 'nba',
      commence_time: '2026-05-20T21:00:00Z',
      home_team: 'Lakers', away_team: 'Warriors',
      bookmakers: [{
        key:'pinnacle', title:'Pinnacle', last_update:'2026-05-20T20:00:00Z',
        markets: [
          { key:'h2h', suspended:true, outcomes:[
            { name:'Lakers', price:-120 },{ name:'Warriors', price:+100 }
          ]}
        ]
      }]
    }]
  },
  meta:{}
};

// Sample flat-array response (Shape B — events at top level)
var SAMPLE_FLAT_ARRAY = {
  success: true,
  data: [
    {
      id: 'OI_NFL_001', sport_key:'nfl',
      commence_time: '2026-09-10T20:15:00Z',
      home_team: 'Kansas City Chiefs', away_team: 'Baltimore Ravens',
      bookmakers: [{
        key:'pinnacle', title:'Pinnacle', last_update:'2026-09-10T18:00:00Z',
        markets: [
          { key:'h2h', suspended:false, outcomes:[{ name:'Kansas City Chiefs', price:-140 },{ name:'Baltimore Ravens', price:+120 }]},
          { key:'spreads', suspended:false, outcomes:[{ name:'Kansas City Chiefs', price:-110, point:-2.5 },{ name:'Baltimore Ravens', price:-110, point:+2.5 }]}
        ]
      }]
    }
  ],
  meta:{ sport:'nfl' }
};

// Sample with decimal odds
var SAMPLE_DECIMAL_ODDS = {
  success: true,
  data: {
    pinnacle: [{
      id: 'OI_MLB_001', sport_key:'mlb',
      commence_time:'2026-05-20T23:00:00Z',
      home_team:'New York Yankees', away_team:'Boston Red Sox',
      bookmakers: [{
        key:'pinnacle', title:'Pinnacle', last_update:'2026-05-20T20:00:00Z',
        markets: [{
          key:'h2h', suspended:false,
          outcomes:[{ name:'New York Yankees', price:1.65 },{ name:'Boston Red Sox', price:2.30 }]
        }]
      }]
    }]
  },
  meta:{}
};

// Sample with alternate market key names
var SAMPLE_ALT_KEYS = {
  success: true,
  data: {
    fanduel: [{
      id: 'OI_NBA_003', sport_key:'nba',
      commence_time:'2026-05-20T23:00:00Z',
      home_team:'Miami Heat', away_team:'Chicago Bulls',
      bookmakers: [{
        key:'fanduel', title:'FanDuel', last_update:'2026-05-20T20:00:00Z',
        markets: [
          { key:'moneyline', suspended:false, outcomes:[{ name:'Miami Heat', price:-180 },{ name:'Chicago Bulls', price:+150 }]},
          { key:'spread',    suspended:false, outcomes:[{ name:'Miami Heat', price:-110, point:-4.5 }]},
          { key:'total',     suspended:false, outcomes:[{ name:'Over', price:-110, point:220.5 },{ name:'Under', price:-110, point:220.5 }]}
        ]
      }]
    }]
  },
  meta:{}
};

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Provider selection ──');

test('default provider is the_odds_api when ODDS_PROVIDER not set', function() {
  assertEq(getActiveProvider({}), 'the_odds_api');
});
test('ODDS_PROVIDER=owls_insight selects owls_insight', function() {
  assertEq(getActiveProvider({ ODDS_PROVIDER:'owls_insight' }), 'owls_insight');
});
test('ODDS_PROVIDER=the_odds_api stays on the_odds_api', function() {
  assertEq(getActiveProvider({ ODDS_PROVIDER:'the_odds_api' }), 'the_odds_api');
});
test('any other value falls back to the_odds_api', function() {
  assertEq(getActiveProvider({ ODDS_PROVIDER:'something_else' }), 'the_odds_api');
});

console.log('\n── Config check ──');

test('missing OWLS_INSIGHT_API_KEY → owls_insight_not_configured', function() {
  var r = checkOwlsConfig({});
  assert(!r.ok); assertEq(r.error, 'owls_insight_not_configured');
});
test('with API key → ok', function() {
  assert(checkOwlsConfig({ OWLS_INSIGHT_API_KEY:'test_key' }).ok);
});

console.log('\n── Sport key mapping ──');

test('basketball_nba → nba', function() { assertEq(mapToOwlsSport('basketball_nba'), 'nba'); });
test('nba → nba (short form)', function() { assertEq(mapToOwlsSport('nba'), 'nba'); });
test('americanfootball_nfl → nfl', function() { assertEq(mapToOwlsSport('americanfootball_nfl'), 'nfl'); });
test('nfl → nfl', function() { assertEq(mapToOwlsSport('nfl'), 'nfl'); });
test('icehockey_nhl → nhl', function() { assertEq(mapToOwlsSport('icehockey_nhl'), 'nhl'); });
test('baseball_mlb → mlb', function() { assertEq(mapToOwlsSport('baseball_mlb'), 'mlb'); });
test('basketball_ncaab → ncaab', function() { assertEq(mapToOwlsSport('basketball_ncaab'), 'ncaab'); });
test('americanfootball_ncaaf → ncaaf', function() { assertEq(mapToOwlsSport('americanfootball_ncaaf'), 'ncaaf'); });
test('unknown sport returns null', function() { assert(mapToOwlsSport('cricket') === null); });

console.log('\n── URL builder ──');

test('builds correct URL for nba with books', function() {
  var url = buildOwlsUrl('https://api.owlsinsight.com', 'basketball_nba', 'pinnacle,fanduel', false);
  assert(url.includes('/api/v1/nba/odds'), 'nba path');
  assert(url.includes('books=pinnacle,fanduel'), 'books param');
  assert(url.includes('alternates=false'), 'alternates param');
});
test('alternates=true included when set', function() {
  var url = buildOwlsUrl('https://api.owlsinsight.com', 'nfl', 'pinnacle', true);
  assert(url.includes('alternates=true'));
});
test('unknown sport returns null URL', function() {
  assert(buildOwlsUrl('https://api.owlsinsight.com', 'cricket', 'pinnacle', false) === null);
});

console.log('\n── HTTP error classification ──');

test('401 → owls_insight_unauthorized', function() {
  assertEq(classifyOwlsHttpError(401).error, 'owls_insight_unauthorized');
});
test('403 → owls_insight_unauthorized', function() {
  assertEq(classifyOwlsHttpError(403).error, 'owls_insight_unauthorized');
});
test('429 → provider_rate_limited', function() {
  assertEq(classifyOwlsHttpError(429).error, 'provider_rate_limited');
});
test('500 → owls_insight_server_error', function() {
  assertEq(classifyOwlsHttpError(500).error, 'owls_insight_server_error');
});

console.log('\n── normalizeOwlsResponse ──');

test('returns ok:true for valid response', function() {
  var r = normalizeOwlsResponse(SAMPLE_OWLS, 'nba');
  assert(r.ok, 'ok: '+(r.error||''));
});

test('deduplicates events across books by id', function() {
  var r = normalizeOwlsResponse(SAMPLE_OWLS, 'nba');
  assertEq(r.games.length, 1, 'OI_NBA_001 deduplicated across pinnacle+fanduel');
});

test('h2h normalized to moneyline', function() {
  var r = normalizeOwlsResponse(SAMPLE_OWLS, 'nba');
  var ml = r.games[0].markets.filter(function(m){ return m.marketType==='moneyline'; });
  assert(ml.length > 0, 'moneyline markets present');
  assert(ml.some(function(m){ return m.teamOrSide==='Boston Celtics' && m.odds===-160; }), 'home team odds');
  assert(ml.some(function(m){ return m.teamOrSide==='New York Knicks' && m.odds===135; }), 'away team odds');
});

test('spreads normalized with line (point)', function() {
  var r = normalizeOwlsResponse(SAMPLE_OWLS, 'nba');
  var sp = r.games[0].markets.filter(function(m){ return m.marketType==='spread'; });
  assert(sp.length > 0, 'spread markets present');
  var home = sp.find(function(m){ return m.teamOrSide==='Boston Celtics'; });
  assert(home, 'home spread entry');
  assertEq(home.line, -3.5, 'spread line');
  assertEq(home.odds, -110, 'spread odds');
});

test('totals normalized with Over/Under and point', function() {
  var r = normalizeOwlsResponse(SAMPLE_OWLS, 'nba');
  var tot = r.games[0].markets.filter(function(m){ return m.marketType==='total'; });
  assert(tot.length >= 2, 'over+under present');
  var ov = tot.find(function(m){ return m.overUnder==='Over'; });
  var un = tot.find(function(m){ return m.overUnder==='Under'; });
  assert(ov && ov.line===218.5, 'over line');
  assert(un && un.line===218.5, 'under line');
});

test('marketsByCanonicalKey populated', function() {
  var r = normalizeOwlsResponse(SAMPLE_OWLS, 'nba');
  var keys = Object.keys(r.marketsByCanonicalKey);
  assertEq(keys.length, 1, 'one game key');
  assert(keys[0].startsWith('nba|'), 'sport prefix');
});

test('marketsByProviderGameId populated', function() {
  var r = normalizeOwlsResponse(SAMPLE_OWLS, 'nba');
  assert(r.marketsByProviderGameId['OI_NBA_001'], 'id key exists');
});

test('suspended market excluded and warning emitted', function() {
  var r = normalizeOwlsResponse(SAMPLE_SUSPENDED, 'nba');
  assert(r.games[0].markets.length === 0, 'no markets (suspended)');
  assert(r.warnings.some(function(w){ return w.includes('suspended'); }), 'warning emitted');
});

test('sourceStatus = live when games present', function() {
  var r = normalizeOwlsResponse(SAMPLE_OWLS, 'nba');
  assertEq(r.sourceStatus, 'live');
});

test('sourceStatus = empty when no games', function() {
  var r = normalizeOwlsResponse({ success:true, data:{}, meta:{} }, 'nba');
  assertEq(r.sourceStatus, 'empty');
});

test('invalid response returns error shape', function() {
  var r = normalizeOwlsResponse(null, 'nba');
  assert(!r.ok); assertEq(r.sourceStatus, 'error');
});


console.log('\n── Flat-array shape (Shape B) ──');

test('flat array data normalized correctly', function() {
  var r = normalizeOwlsResponse(SAMPLE_FLAT_ARRAY, 'nfl');
  assert(r.ok, 'ok'); assertEq(r.games.length, 1);
  var ml = r.games[0].markets.filter(function(m){ return m.marketType==='moneyline'; });
  assert(ml.length > 0, 'moneyline from flat array');
});

test('flat array spread with point normalized', function() {
  var r = normalizeOwlsResponse(SAMPLE_FLAT_ARRAY, 'nfl');
  var sp = r.games[0].markets.filter(function(m){ return m.marketType==='spread'; });
  assert(sp.length > 0, 'spread present'); assertEq(sp[0].line, -2.5);
});

console.log('\n── Alternate market key names ──');

test('moneyline key variant normalized', function() {
  var r = normalizeOwlsResponse(SAMPLE_ALT_KEYS, 'nba');
  assert(r.games[0].markets.filter(function(m){ return m.marketType==='moneyline'; }).length > 0);
});

test('spread key variant normalized', function() {
  var r = normalizeOwlsResponse(SAMPLE_ALT_KEYS, 'nba');
  var sp = r.games[0].markets.filter(function(m){ return m.marketType==='spread'; });
  assert(sp.length > 0); assertEq(sp[0].line, -4.5);
});

test('total key variant normalized', function() {
  var r = normalizeOwlsResponse(SAMPLE_ALT_KEYS, 'nba');
  assert(r.games[0].markets.filter(function(m){ return m.marketType==='total'; }).length >= 2);
});

console.log('\n── Decimal odds conversion ──');

test('decimal 1.65 converts to American -154', function() { assertEq(_toAmericanOdds(1.65), -154); });
test('decimal 2.30 converts to American +130', function() { assertEq(_toAmericanOdds(2.30), 130); });
test('American -160 unchanged by converter', function() { assertEq(_toAmericanOdds(-160), -160); });
test('American +135 unchanged by converter', function() { assertEq(_toAmericanOdds(135), 135); });
test('decimal odds response converts to American scale', function() {
  var r = normalizeOwlsResponse(SAMPLE_DECIMAL_ODDS, 'mlb');
  assert(r.ok);
  var ml = r.games[0].markets.filter(function(m){ return m.marketType==='moneyline'; });
  assert(ml.length > 0, 'moneyline present');
  assert(Math.abs(ml[0].odds) > 30, 'converted to American; got '+ml[0].odds);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Owls Insight tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ OWLS INSIGHT TESTS FAILED'); process.exit(1); }
else console.log('✅ All Owls Insight rules verified');
