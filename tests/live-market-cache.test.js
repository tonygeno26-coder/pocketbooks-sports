/**
 * PocketBooks Sports — Live Market Cache + Suspension Engine Tests
 * Run: node tests/live-market-cache.test.js
 * Pure logic tests — no network calls.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Cache engine (pure functions mirroring backend) ───────────────────────────

var STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 min before odds marked stale
var ODDS_TOLERANCE_PTS = 3;

function makeEmptyCache() {
  return {
    updatedAt: null, lastSuccessAt: null,
    games: [], marketsByCanonicalKey: {}, marketsByProviderGameId: {},
    gameCount: 0, marketCount: 0,
    cacheAgeMs: null, fetchDurationMs: null,
    sourceStatus: 'empty', warnings: []
  };
}

// Map sport_key to canonical sport prefix
function sportPrefix(sportKey) {
  var k = (sportKey||'').toLowerCase();
  if (k.startsWith('baseball'))            return 'MLB';
  if (k.startsWith('basketball_nba'))      return 'NBA';
  if (k.startsWith('americanfootball_nfl')) return 'NFL';
  if (k.startsWith('icehockey'))           return 'NHL';
  if (k.startsWith('soccer'))              return 'SOCCER';
  return k.split('_')[0].toUpperCase();
}

// Build canonical key from game object
function buildCanonicalKey(game) {
  var sport    = sportPrefix(game.sport_key);
  var awayTeam = (game.away_team||'').toLowerCase().replace(/\s+/g,'-');
  var homeTeam = (game.home_team||'').toLowerCase().replace(/\s+/g,'-');
  var dateStr  = (game.commence_time||'').slice(0,10);
  return sport+'|'+awayTeam+'|'+homeTeam+'|'+dateStr;
}

// Normalize Odds API market key to internal label
function normalizeMarketKey(key) {
  return key === 'h2h' ? 'moneyline' : key === 'spreads' ? 'spread' : key === 'totals' ? 'total' : key;
}

// Build maps from raw Odds API array — atomic, returns new cache object
function buildCacheFromGames(gamesArr, prevCache, fetchDurationMs) {
  if (!Array.isArray(gamesArr) || !gamesArr.length) {
    // Preserve previous on empty/failed fetch
    return Object.assign({}, prevCache || makeEmptyCache(), {
      sourceStatus: prevCache && prevCache.lastSuccessAt ? 'stale_preserved' : 'empty',
      warnings: ['fetch_returned_empty']
    });
  }

  var byKey = {};
  var byId  = {};
  var marketCount = 0;
  var now = new Date().toISOString();

  gamesArr.forEach(function(game) {
    var cKey   = buildCanonicalKey(game);
    var gameId = game.id;

    (game.bookmakers||[]).forEach(function(bookmaker) {
      (bookmaker.markets||[]).forEach(function(market) {
        var mLabel  = normalizeMarketKey(market.key);
        var mapKeyC = cKey + '|' + mLabel;
        var mapKeyI = gameId + '|' + mLabel;

        var entry = {
          cKey, gameId, sport: game.sport_key, market: mLabel,
          bookmaker: bookmaker.key,
          outcomes: market.outcomes || [],
          commenceTime: game.commence_time,
          suspended: false, closed: false,
          state: 'open',
          updatedAt: now
        };

        if (!byKey[mapKeyC]) { byKey[mapKeyC] = entry; marketCount++; }
        if (!byId[mapKeyI])  { byId[mapKeyI]  = entry; }
      });
    });
  });

  return {
    updatedAt: now, lastSuccessAt: now,
    games: gamesArr,
    marketsByCanonicalKey: byKey,
    marketsByProviderGameId: byId,
    gameCount: gamesArr.length,
    marketCount, fetchDurationMs: fetchDurationMs||0,
    cacheAgeMs: 0, sourceStatus: 'healthy', warnings: []
  };
}

// Atomically replace cache (never partial mutation)
var _LIVE_CACHE = makeEmptyCache();
function atomicReplaceCache(newCache) {
  _LIVE_CACHE = newCache; // single assignment = atomic in JS single thread
}
function getLiveCache() { return _LIVE_CACHE; }

// Compute cache age at read time
function getCacheAgeMs(cache) {
  if (!cache.updatedAt) return null;
  return Date.now() - new Date(cache.updatedAt).getTime();
}

// Normalise market state for a given key at read time
function normalizeMarketState(marketEntry, nowMs) {
  nowMs = nowMs || Date.now();
  if (!marketEntry) return { state:'suspended', reason:'not_found' };
  if (marketEntry.suspended) return { state:'suspended', reason:'provider_suspended' };
  if (marketEntry.closed)    return { state:'closed',    reason:'provider_closed' };
  // Game started?
  if (marketEntry.commenceTime) {
    var ct = new Date(marketEntry.commenceTime).getTime();
    if (!isNaN(ct) && nowMs >= ct) return { state:'closed', reason:'game_started' };
  }
  // Cache stale?
  if (marketEntry.updatedAt) {
    var age = nowMs - new Date(marketEntry.updatedAt).getTime();
    if (age > STALE_THRESHOLD_MS) return { state:'stale', reason:'cache_stale', ageMs: age };
  }
  return { state:'open', reason:'ok' };
}

// Leg validation using live cache
function validateLegVsCache(leg, cache, nowMs) {
  nowMs = nowMs || Date.now();
  // Game started check (scheduled_start field)
  if (leg.scheduledStart) {
    var ct = new Date(leg.scheduledStart).getTime();
    if (!isNaN(ct) && nowMs >= ct) return { ok:false, code:'game_started', leg:leg.pick };
  }
  var mLabel = (leg.market||'moneyline').toLowerCase().replace('run line','spread').replace('puck line','spread');
  var entry =
    (leg.providerGameId && cache.marketsByProviderGameId[leg.providerGameId+'|'+mLabel]) ||
    (leg.canonicalGameKey && cache.marketsByCanonicalKey[leg.canonicalGameKey+'|'+mLabel]);

  var ms = normalizeMarketState(entry, nowMs);
  if (ms.state === 'suspended' || ms.state === 'closed')
    return { ok:false, code: ms.state === 'closed' ? 'market_closed' : 'market_suspended',
             leg:leg.pick, reason:ms.reason };

  var outcome = entry && (entry.outcomes||[]).find(function(o) {
    return o.name && o.name.toLowerCase() === (leg.pick||'').toLowerCase();
  });
  if (!outcome) return { ok:false, code:'market_closed', leg:leg.pick, reason:'outcome_not_found' };

  var drift = Math.abs(outcome.price - parseInt(leg.odds,10));
  if (drift > ODDS_TOLERANCE_PTS) {
    return { ok:false, code:'odds_changed', leg:leg.pick,
             oldOdds:parseInt(leg.odds,10), newOdds:outcome.price, drift };
  }
  return { ok:true, liveOdds:outcome.price, state:ms.state };
}

// Collect all suspended markets from cache
function getSuspendedMarkets(cache, nowMs) {
  nowMs = nowMs || Date.now();
  var results = [];
  Object.keys(cache.marketsByCanonicalKey).forEach(function(key) {
    var entry = cache.marketsByCanonicalKey[key];
    var ms = normalizeMarketState(entry, nowMs);
    if (ms.state !== 'open') results.push({ key, state:ms.state, reason:ms.reason, cKey:entry.cKey });
  });
  return results;
}

// ── Test data ─────────────────────────────────────────────────────────────────

var FUTURE_CT = '2026-05-17T19:10:00Z';
var PAST_CT   = '2026-05-17T14:00:00Z';
var NOW_MS    = new Date('2026-05-17T15:00:00Z').getTime();

function makeGame(id, sport, home, away, ct, bookmakers) {
  return {
    id, sport_key: sport||'baseball_mlb',
    home_team: home||'Guardians', away_team: away||'Reds',
    commence_time: ct||FUTURE_CT,
    bookmakers: bookmakers || [{
      key:'draftkings', markets:[{
        key:'h2h', outcomes:[
          { name:'Guardians ML', price:-110 },
          { name:'Reds ML',      price:+100 }
        ]
      }]
    }]
  };
}

var GAME_FUTURE = makeGame('G001', 'baseball_mlb', 'Guardians', 'Reds', FUTURE_CT);
var GAME_PAST   = makeGame('G002', 'baseball_mlb', 'Rays',    'Marlins', PAST_CT);
var GAME_SUSP   = makeGame('G003', 'baseball_mlb', 'Cubs', 'Cardinals', FUTURE_CT, [{
  key:'draftkings', markets:[{ key:'h2h', outcomes:[] }]
}]);

// ── Cache construction ────────────────────────────────────────────────────────
console.log('\n── Cache construction ──');

test('buildCacheFromGames: empty array preserves prev cache', function() {
  var prev = Object.assign(makeEmptyCache(), { lastSuccessAt:'2026-01-01T00:00:00Z', gameCount:5 });
  var c = buildCacheFromGames([], prev, 0);
  assertEq(c.sourceStatus, 'stale_preserved', 'stale_preserved');
  assertEq(c.gameCount, 5, 'prev gameCount preserved');
});
test('buildCacheFromGames: no prev + empty → empty status', function() {
  var c = buildCacheFromGames([], null, 0);
  assertEq(c.sourceStatus, 'empty');
});
test('buildCacheFromGames: healthy build', function() {
  var c = buildCacheFromGames([GAME_FUTURE], null, 50);
  assertEq(c.sourceStatus, 'healthy');
  assertEq(c.gameCount, 1);
  assert(c.marketCount > 0, 'has markets');
  assert(c.updatedAt, 'has updatedAt');
});
test('buildCacheFromGames: canonical key correct format', function() {
  var c = buildCacheFromGames([GAME_FUTURE], null, 0);
  var keys = Object.keys(c.marketsByCanonicalKey);
  assert(keys.some(function(k){ return k.startsWith('MLB|reds|guardians|'); }), 'found canonical key: '+JSON.stringify(keys[0]));
});
test('buildCacheFromGames: providerGameId index built', function() {
  var c = buildCacheFromGames([GAME_FUTURE], null, 0);
  assert(Object.keys(c.marketsByProviderGameId).some(function(k){ return k.startsWith('G001|'); }), 'G001 in id map');
});
test('buildCacheFromGames: two games → two cKeys', function() {
  var c = buildCacheFromGames([GAME_FUTURE, GAME_PAST], null, 0);
  assertEq(c.gameCount, 2);
  var keys = Object.keys(c.marketsByCanonicalKey);
  assert(keys.length >= 2, 'at least 2 keys');
});

// ── Atomic replace ────────────────────────────────────────────────────────────
console.log('\n── Atomic replace ──');

test('atomicReplaceCache replaces whole cache reference', function() {
  atomicReplaceCache(makeEmptyCache());
  assertEq(getLiveCache().gameCount, 0, 'starts empty');
  var c = buildCacheFromGames([GAME_FUTURE], null, 0);
  atomicReplaceCache(c);
  assertEq(getLiveCache().gameCount, 1, 'replaced');
});
test('failed fetch does not partially mutate cache', function() {
  var c = buildCacheFromGames([GAME_FUTURE], null, 0);
  atomicReplaceCache(c);
  // Simulate failed fetch → returns preserved cache, do NOT call atomicReplaceCache
  var preserved = buildCacheFromGames([], getLiveCache(), 0);
  // Do NOT replace on error
  assertEq(getLiveCache().gameCount, 1, 'cache unchanged after failed fetch');
  assertEq(preserved.sourceStatus, 'stale_preserved', 'preserved status');
});

// ── Market state normalisation ────────────────────────────────────────────────
console.log('\n── Market state normalisation ──');

test('open market → state:open', function() {
  var entry = { suspended:false, closed:false, commenceTime:FUTURE_CT, updatedAt:new Date(NOW_MS).toISOString() };
  assertEq(normalizeMarketState(entry, NOW_MS).state, 'open');
});
test('missing entry → state:suspended, reason:not_found', function() {
  var ms = normalizeMarketState(null, NOW_MS);
  assertEq(ms.state, 'suspended'); assertEq(ms.reason, 'not_found');
});
test('provider suspended flag → state:suspended', function() {
  var entry = { suspended:true, closed:false, commenceTime:FUTURE_CT, updatedAt:new Date(NOW_MS).toISOString() };
  var ms = normalizeMarketState(entry, NOW_MS);
  assertEq(ms.state, 'suspended'); assertEq(ms.reason, 'provider_suspended');
});
test('provider closed flag → state:closed', function() {
  var entry = { suspended:false, closed:true, commenceTime:FUTURE_CT, updatedAt:new Date(NOW_MS).toISOString() };
  assertEq(normalizeMarketState(entry, NOW_MS).state, 'closed');
});
test('game started → state:closed, reason:game_started', function() {
  var entry = { suspended:false, closed:false, commenceTime:PAST_CT, updatedAt:new Date(NOW_MS).toISOString() };
  var ms = normalizeMarketState(entry, NOW_MS);
  assertEq(ms.state, 'closed'); assertEq(ms.reason, 'game_started');
});
test('stale cache (>5min) → state:stale', function() {
  var staleTime = new Date(NOW_MS - STALE_THRESHOLD_MS - 1000).toISOString();
  var entry = { suspended:false, closed:false, commenceTime:FUTURE_CT, updatedAt:staleTime };
  var ms = normalizeMarketState(entry, NOW_MS);
  assertEq(ms.state, 'stale'); assertEq(ms.reason, 'cache_stale');
});
test('fresh cache (< 5min) → state:open', function() {
  var freshTime = new Date(NOW_MS - 60000).toISOString(); // 1 min ago
  var entry = { suspended:false, closed:false, commenceTime:FUTURE_CT, updatedAt:freshTime };
  assertEq(normalizeMarketState(entry, NOW_MS).state, 'open');
});

// ── Leg validation vs cache ───────────────────────────────────────────────────
console.log('\n── Leg validation vs cache ──');

test('valid leg → ok', function() {
  var cache = buildCacheFromGames([GAME_FUTURE], null, 0);
  // Patch updatedAt to now so not stale
  Object.keys(cache.marketsByCanonicalKey).forEach(function(k){
    cache.marketsByCanonicalKey[k].updatedAt = new Date(NOW_MS).toISOString();
  });
  Object.keys(cache.marketsByProviderGameId).forEach(function(k){
    cache.marketsByProviderGameId[k].updatedAt = new Date(NOW_MS).toISOString();
  });
  var leg = { pick:'Guardians ML', odds:-110, market:'Moneyline', scheduledStart:FUTURE_CT,
    canonicalGameKey:'MLB|reds|guardians|2026-05-17' };
  var r = validateLegVsCache(leg, cache, NOW_MS);
  assert(r.ok, 'ok: '+(r.code||''));
});
test('game started → game_started', function() {
  var cache = buildCacheFromGames([GAME_FUTURE], null, 0);
  var leg = { pick:'Guardians ML', odds:-110, market:'Moneyline', scheduledStart:PAST_CT,
    canonicalGameKey:'BASEBALL_MLB|reds|guardians|2026-05-17' };
  var r = validateLegVsCache(leg, cache, NOW_MS);
  assert(!r.ok); assertEq(r.code, 'game_started');
});
test('market not in cache → market_suspended', function() {
  var cache = makeEmptyCache();
  var leg = { pick:'Guardians ML', odds:-110, market:'Moneyline', scheduledStart:FUTURE_CT,
    canonicalGameKey:'BASEBALL_MLB|nobody|nobody|2026-05-17' };
  var r = validateLegVsCache(leg, cache, NOW_MS);
  assert(!r.ok); assertEq(r.code, 'market_suspended');
});
test('odds moved → odds_changed', function() {
  var cache = buildCacheFromGames([GAME_FUTURE], null, 0);
  Object.keys(cache.marketsByCanonicalKey).forEach(function(k){
    cache.marketsByCanonicalKey[k].updatedAt = new Date(NOW_MS).toISOString();
  });
  var leg = { pick:'Guardians ML', odds:-95, market:'Moneyline', scheduledStart:FUTURE_CT,
    canonicalGameKey:'MLB|reds|guardians|2026-05-17' };
  var r = validateLegVsCache(leg, cache, NOW_MS);
  assert(!r.ok); assertEq(r.code, 'odds_changed');
  assertEq(r.newOdds, -110);
});
test('P1 lookup by providerGameId', function() {
  var cache = buildCacheFromGames([GAME_FUTURE], null, 0);
  Object.keys(cache.marketsByProviderGameId).forEach(function(k){
    cache.marketsByProviderGameId[k].updatedAt = new Date(NOW_MS).toISOString();
  });
  var leg = { pick:'Guardians ML', odds:-110, market:'Moneyline', scheduledStart:FUTURE_CT,
    providerGameId:'G001', canonicalGameKey:'WRONG|wrong|wrong|2026-05-17' };
  var r = validateLegVsCache(leg, cache, NOW_MS);
  assert(r.ok, 'P1 providerGameId lookup ok: '+(r.code||''));
});

// ── Suspended market collection ───────────────────────────────────────────────
console.log('\n── Suspended market collection ──');

test('no suspended markets in healthy cache', function() {
  var cache = buildCacheFromGames([GAME_FUTURE], null, 0);
  Object.keys(cache.marketsByCanonicalKey).forEach(function(k){
    cache.marketsByCanonicalKey[k].updatedAt = new Date(NOW_MS).toISOString();
  });
  var susp = getSuspendedMarkets(cache, NOW_MS);
  assertEq(susp.length, 0, 'none suspended');
});
test('started game markets appear as suspended/closed', function() {
  var cache = buildCacheFromGames([GAME_PAST], null, 0);
  Object.keys(cache.marketsByCanonicalKey).forEach(function(k){
    cache.marketsByCanonicalKey[k].updatedAt = new Date(NOW_MS).toISOString();
  });
  var susp = getSuspendedMarkets(cache, NOW_MS);
  assert(susp.length > 0, 'past game markets closed');
  assert(susp.every(function(s){ return s.state === 'closed'; }), 'all closed');
});
test('mixed future+past games: only past closed', function() {
  var cache = buildCacheFromGames([GAME_FUTURE, GAME_PAST], null, 0);
  Object.keys(cache.marketsByCanonicalKey).forEach(function(k){
    cache.marketsByCanonicalKey[k].updatedAt = new Date(NOW_MS).toISOString();
  });
  var susp = getSuspendedMarkets(cache, NOW_MS);
  assert(susp.every(function(s){ return s.state === 'closed'; }), 'only closed, not open');
});

// ── Cache age ─────────────────────────────────────────────────────────────────
console.log('\n── Cache age ──');

test('getCacheAgeMs: null updatedAt → null', function() {
  assert(getCacheAgeMs(makeEmptyCache()) === null, 'null for empty');
});
test('getCacheAgeMs: recent updatedAt → small ms', function() {
  var c = { updatedAt: new Date(Date.now()-500).toISOString() };
  var age = getCacheAgeMs(c);
  assert(age >= 400 && age < 2000, 'reasonable age: '+age);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Live market cache tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ LIVE MARKET CACHE TESTS FAILED'); process.exit(1); }
else console.log('✅ All live market cache rules verified');
