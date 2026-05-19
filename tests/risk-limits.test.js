/**
 * PocketBooks Sports — Phase J: Risk Limits + Exposure Engine Tests
 * Run: node tests/risk-limits.test.js
 * Pure logic — no network, no DB.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Risk settings model ───────────────────────────────────────────────────────

function defaultClubSettings() {
  return {
    minStake:           1,
    maxStake:           500,
    maxPayout:          5000,
    clubMaxOpenRisk:    10000,
    eventMaxOpenRisk:   2000,
    marketMaxOpenRisk:  1000,
    playerEventMaxRisk: 500,
    maxParlayLegs:      8,
    allowLiveBetting:   true,
    allowParlays:       true,
    allowTeasers:       true,
    allowRoundRobins:   true,
    blockedSports:      [],
    blockedMarkets:     []
  };
}

function defaultPlayerLimits() {
  return {
    maxSingleBet:   200,
    maxPayout:      2000,
    maxOpenRisk:    800,
    weeklyLimit:    1000,
    allowedSports:  null,   // null = all allowed
    blockedSports:  [],
    blockedMarkets: [],
    suspendedUntil: null,
    statusReason:   null
  };
}

// ── Exposure tracker (in-memory) ──────────────────────────────────────────────

function makeExposureTracker() {
  const playerRisk = {};   // playerId → totalOpenRisk
  const eventRisk  = {};   // canonicalGameKey → totalOpenRisk
  const marketRisk = {};   // canonicalGameKey+'|'+market → totalOpenRisk
  const clubRisk   = { total: 0 };
  return {
    addBet: function(playerId, legs, stake) {
      playerRisk[playerId]  = (playerRisk[playerId]||0)  + stake;
      clubRisk.total        = (clubRisk.total||0)        + stake;
      (legs||[]).forEach(function(leg) {
        var eKey = leg.canonicalGameKey||'';
        var mKey = eKey+'|'+(leg.market||'moneyline').toLowerCase();
        eventRisk[eKey]  = (eventRisk[eKey]||0)  + stake;
        marketRisk[mKey] = (marketRisk[mKey]||0) + stake;
      });
    },
    getPlayerRisk:   function(pid)   { return playerRisk[pid]||0; },
    getEventRisk:    function(cKey)  { return eventRisk[cKey]||0; },
    getMarketRisk:   function(mKey)  { return marketRisk[mKey]||0; },
    getClubRisk:     function()      { return clubRisk.total; }
  };
}

// ── Risk validation engine ────────────────────────────────────────────────────

function validateRiskLimits(params) {
  var { stake, potentialPayout, betType, legs, playerId,
        playerLimits, clubSettings, exposure, nowMs } = params;
  stake          = parseFloat(stake)||0;
  potentialPayout= parseFloat(potentialPayout)||0;
  nowMs          = nowMs || Date.now();
  legs           = legs || [];
  var pl         = playerLimits  || defaultPlayerLimits();
  var cs         = clubSettings  || defaultClubSettings();
  var exp        = exposure       || makeExposureTracker();

  // 1. Player suspended
  if (pl.suspendedUntil) {
    var sus = new Date(pl.suspendedUntil).getTime();
    if (!isNaN(sus) && nowMs < sus)
      return { ok:false, code:'player_suspended', suspendedUntil:pl.suspendedUntil };
  }

  // 2. Stake bounds
  if (stake < cs.minStake)
    return { ok:false, code:'stake_below_min', min:cs.minStake, stake };
  if (stake > cs.maxStake)
    return { ok:false, code:'stake_above_max', max:cs.maxStake, stake };

  // 3. Player single bet max
  if (pl.maxSingleBet && stake > pl.maxSingleBet)
    return { ok:false, code:'stake_above_max', max:pl.maxSingleBet, stake, source:'player_limit' };

  // 4. Payout cap
  var effectiveMaxPayout = Math.min(cs.maxPayout, pl.maxPayout||cs.maxPayout);
  if (potentialPayout > effectiveMaxPayout)
    return { ok:false, code:'payout_above_max', max:effectiveMaxPayout, payout:potentialPayout };

  // 5. Bet type gates
  var type = (betType||'').toLowerCase();
  if ((type==='parlay' || type==='roundrobin') && !cs.allowParlays)
    return { ok:false, code:'parlays_disabled' };
  if (type==='teaser' && !cs.allowTeasers)
    return { ok:false, code:'teasers_disabled' };
  if (type==='roundrobin' && !cs.allowRoundRobins)
    return { ok:false, code:'round_robins_disabled' };

  // 6. Parlay leg count
  if ((type==='parlay'||type==='roundrobin') && legs.length > cs.maxParlayLegs)
    return { ok:false, code:'too_many_parlay_legs', max:cs.maxParlayLegs, legs:legs.length };

  // 7. Sport / market blocks (per leg)
  for (var i=0; i<legs.length; i++) {
    var leg = legs[i];
    var sport  = (leg.sport||'').toLowerCase();
    var market = (leg.market||'').toLowerCase();

    if (cs.blockedSports.includes(sport))
      return { ok:false, code:'sport_blocked', sport, legIndex:i };
    if (pl.blockedSports && pl.blockedSports.includes(sport))
      return { ok:false, code:'sport_blocked', sport, legIndex:i, source:'player_limit' };
    if (cs.blockedMarkets.includes(market))
      return { ok:false, code:'market_blocked', market, legIndex:i };
    if (pl.blockedMarkets && pl.blockedMarkets.includes(market))
      return { ok:false, code:'market_blocked', market, legIndex:i, source:'player_limit' };
    if (pl.allowedSports && !pl.allowedSports.includes(sport))
      return { ok:false, code:'sport_not_allowed', sport, legIndex:i };

    // 8. Live betting
    if (!cs.allowLiveBetting && leg.isLive)
      return { ok:false, code:'live_betting_disabled', legIndex:i };
  }

  // 9. Player open risk
  var playerCurrentRisk = exp.getPlayerRisk(playerId);
  if (pl.maxOpenRisk && (playerCurrentRisk + stake) > pl.maxOpenRisk)
    return { ok:false, code:'player_open_risk_exceeded',
             max:pl.maxOpenRisk, current:playerCurrentRisk, stake };

  // 10. Club total open risk
  var clubCurrentRisk = exp.getClubRisk();
  if (cs.clubMaxOpenRisk && (clubCurrentRisk + stake) > cs.clubMaxOpenRisk)
    return { ok:false, code:'club_open_risk_exceeded',
             max:cs.clubMaxOpenRisk, current:clubCurrentRisk, stake };

  // 11. Per-event and per-market exposure
  for (var j=0; j<legs.length; j++) {
    var l = legs[j];
    var cKey = l.canonicalGameKey||'';
    var mKey = cKey+'|'+(l.market||'moneyline').toLowerCase();

    if (cs.eventMaxOpenRisk) {
      var evRisk = exp.getEventRisk(cKey);
      if (evRisk + stake > cs.eventMaxOpenRisk)
        return { ok:false, code:'event_risk_exceeded',
                 max:cs.eventMaxOpenRisk, current:evRisk, event:cKey, stake };
    }
    if (cs.marketMaxOpenRisk) {
      var mRisk = exp.getMarketRisk(mKey);
      if (mRisk + stake > cs.marketMaxOpenRisk)
        return { ok:false, code:'market_risk_exceeded',
                 max:cs.marketMaxOpenRisk, current:mRisk, market:mKey, stake };
    }
  }

  return { ok:true };
}

// ── Test data ─────────────────────────────────────────────────────────────────

function leg(sport, market, cKey, isLive) {
  return {
    sport:  sport||'mlb',
    market: market||'moneyline',
    canonicalGameKey: cKey||'MLB|reds|guardians|2026-05-17',
    isLive: !!isLive
  };
}
function base(overrides) {
  return Object.assign({
    stake:100, potentialPayout:190.91, betType:'Single',
    legs:[leg()], playerId:'P001',
    playerLimits: defaultPlayerLimits(),
    clubSettings:  defaultClubSettings(),
    exposure:      makeExposureTracker()
  }, overrides||{});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Valid bet passes all limits ──');
test('valid bet under all limits → ok', function() {
  var r = validateRiskLimits(base());
  assert(r.ok, 'ok: '+(r.code||''));
});

console.log('\n── Player suspended ──');
test('active suspension blocks bet', function() {
  var pl = defaultPlayerLimits();
  pl.suspendedUntil = new Date(Date.now()+60000).toISOString(); // 1min from now
  var r = validateRiskLimits(base({ playerLimits:pl }));
  assertEq(r.code,'player_suspended');
});
test('expired suspension does not block', function() {
  var pl = defaultPlayerLimits();
  pl.suspendedUntil = new Date(Date.now()-60000).toISOString(); // 1min ago
  var r = validateRiskLimits(base({ playerLimits:pl }));
  assert(r.ok, 'expired suspension ok');
});

console.log('\n── Stake bounds ──');
test('stake below min → stake_below_min', function() {
  var cs = defaultClubSettings(); cs.minStake = 5;
  var r = validateRiskLimits(base({ stake:2, clubSettings:cs }));
  assertEq(r.code,'stake_below_min'); assertEq(r.min,5);
});
test('stake above club max → stake_above_max', function() {
  var cs = defaultClubSettings(); cs.maxStake = 100;
  var r = validateRiskLimits(base({ stake:150, clubSettings:cs }));
  assertEq(r.code,'stake_above_max'); assertEq(r.max,100);
});
test('stake above player single bet max → stake_above_max (player_limit)', function() {
  var pl = defaultPlayerLimits(); pl.maxSingleBet = 50;
  var r = validateRiskLimits(base({ stake:100, playerLimits:pl }));
  assertEq(r.code,'stake_above_max'); assertEq(r.source,'player_limit');
});
test('exact max stake → ok', function() {
  var cs = defaultClubSettings(); cs.maxStake = 100;
  assert(validateRiskLimits(base({ stake:100, clubSettings:cs })).ok);
});

console.log('\n── Payout cap ──');
test('payout above club max → payout_above_max', function() {
  var cs = defaultClubSettings(); cs.maxPayout = 200;
  var r = validateRiskLimits(base({ potentialPayout:250, clubSettings:cs }));
  assertEq(r.code,'payout_above_max'); assertEq(r.max,200);
});
test('payout above player max (lower) → payout_above_max', function() {
  var pl = defaultPlayerLimits(); pl.maxPayout = 150;
  var r = validateRiskLimits(base({ potentialPayout:200, playerLimits:pl }));
  assertEq(r.code,'payout_above_max'); assertEq(r.max,150);
});
test('payout within limits → ok', function() {
  var r = validateRiskLimits(base({ potentialPayout:190.91 }));
  assert(r.ok);
});

console.log('\n── Bet type gates ──');
test('parlay when parlays disabled → parlays_disabled', function() {
  var cs = defaultClubSettings(); cs.allowParlays = false;
  var r = validateRiskLimits(base({ betType:'Parlay', clubSettings:cs }));
  assertEq(r.code,'parlays_disabled');
});
test('teaser when teasers disabled → teasers_disabled', function() {
  var cs = defaultClubSettings(); cs.allowTeasers = false;
  var r = validateRiskLimits(base({ betType:'Teaser', clubSettings:cs }));
  assertEq(r.code,'teasers_disabled');
});
test('parlay when parlays enabled → ok', function() {
  var legs2 = [leg('mlb','moneyline','KEY1'),leg('mlb','moneyline','KEY2')];
  var r = validateRiskLimits(base({ betType:'Parlay', legs:legs2 }));
  assert(r.ok,'parlay ok');
});
test('too many parlay legs → too_many_parlay_legs', function() {
  var cs = defaultClubSettings(); cs.maxParlayLegs = 3;
  var legs4 = [leg(),leg(),leg(),leg()];
  var r = validateRiskLimits(base({ betType:'Parlay', legs:legs4, clubSettings:cs }));
  assertEq(r.code,'too_many_parlay_legs'); assertEq(r.max,3); assertEq(r.legs,4);
});

console.log('\n── Sport / market blocks ──');
test('blocked sport (club) → sport_blocked', function() {
  var cs = defaultClubSettings(); cs.blockedSports = ['mlb'];
  var r = validateRiskLimits(base({ clubSettings:cs }));
  assertEq(r.code,'sport_blocked'); assertEq(r.sport,'mlb');
});
test('blocked sport (player) → sport_blocked', function() {
  var pl = defaultPlayerLimits(); pl.blockedSports = ['mlb'];
  var r = validateRiskLimits(base({ playerLimits:pl }));
  assertEq(r.code,'sport_blocked'); assertEq(r.source,'player_limit');
});
test('blocked market (club) → market_blocked', function() {
  var cs = defaultClubSettings(); cs.blockedMarkets = ['moneyline'];
  var r = validateRiskLimits(base({ clubSettings:cs }));
  assertEq(r.code,'market_blocked'); assertEq(r.market,'moneyline');
});
test('blocked market (player) → market_blocked', function() {
  var pl = defaultPlayerLimits(); pl.blockedMarkets = ['moneyline'];
  var r = validateRiskLimits(base({ playerLimits:pl }));
  assertEq(r.code,'market_blocked'); assertEq(r.source,'player_limit');
});
test('sport not in allowedSports → sport_not_allowed', function() {
  var pl = defaultPlayerLimits(); pl.allowedSports = ['nfl','nba'];
  var r = validateRiskLimits(base({ playerLimits:pl }));  // mlb not in allowed
  assertEq(r.code,'sport_not_allowed');
});
test('allowed sport in allowedSports → ok', function() {
  var pl = defaultPlayerLimits(); pl.allowedSports = ['mlb','nfl'];
  assert(validateRiskLimits(base({ playerLimits:pl })).ok);
});

console.log('\n── Live betting ──');
test('live bet when live disabled → live_betting_disabled', function() {
  var cs = defaultClubSettings(); cs.allowLiveBetting = false;
  var r = validateRiskLimits(base({ legs:[leg('mlb','moneyline','K1',true)], clubSettings:cs }));
  assertEq(r.code,'live_betting_disabled');
});
test('live bet when live enabled → ok', function() {
  assert(validateRiskLimits(base({ legs:[leg('mlb','moneyline','K1',true)] })).ok);
});

console.log('\n── Player open risk ──');
test('player open risk at limit → ok', function() {
  var pl = defaultPlayerLimits(); pl.maxOpenRisk = 800;
  var exp = makeExposureTracker();
  exp.addBet('P001',[leg()], 700); // existing 700
  var r = validateRiskLimits(base({ stake:100, playerLimits:pl, exposure:exp })); // 700+100=800
  assert(r.ok,'at limit ok');
});
test('player open risk exceeded → player_open_risk_exceeded', function() {
  var pl = defaultPlayerLimits(); pl.maxOpenRisk = 800;
  var exp = makeExposureTracker();
  exp.addBet('P001',[leg()], 750); // existing 750
  var r = validateRiskLimits(base({ stake:100, playerLimits:pl, exposure:exp })); // 750+100=850>800
  assertEq(r.code,'player_open_risk_exceeded');
  assertEq(r.max,800); assertEq(r.current,750);
});

console.log('\n── Club open risk ──');
test('club open risk exceeded → club_open_risk_exceeded', function() {
  var cs = defaultClubSettings(); cs.clubMaxOpenRisk = 500;
  var exp = makeExposureTracker();
  exp.addBet('P001',[leg()], 450);
  var r = validateRiskLimits(base({ stake:100, clubSettings:cs, exposure:exp }));
  assertEq(r.code,'club_open_risk_exceeded');
});

console.log('\n── Event / market exposure ──');
test('event risk exceeded → event_risk_exceeded', function() {
  var cs = defaultClubSettings(); cs.eventMaxOpenRisk = 300;
  var exp = makeExposureTracker();
  exp.addBet('P002',[leg()], 250); // another player already bet 250 on same game
  var r = validateRiskLimits(base({ stake:100, clubSettings:cs, exposure:exp }));
  assertEq(r.code,'event_risk_exceeded');
  assertEq(r.max,300); assertEq(r.current,250);
});
test('market risk exceeded → market_risk_exceeded', function() {
  var cs = defaultClubSettings(); cs.marketMaxOpenRisk = 200;
  var exp = makeExposureTracker();
  exp.addBet('P002',[leg()], 150);
  var r = validateRiskLimits(base({ stake:100, clubSettings:cs, exposure:exp }));
  assertEq(r.code,'market_risk_exceeded');
  assertEq(r.max,200); assertEq(r.current,150);
});
test('different event → no event conflict', function() {
  var cs = defaultClubSettings(); cs.eventMaxOpenRisk = 300;
  var exp = makeExposureTracker();
  exp.addBet('P002',[leg('mlb','moneyline','DIFFERENT_KEY')], 250);
  var r = validateRiskLimits(base({ stake:100, clubSettings:cs, exposure:exp }));
  assert(r.ok,'different event ok');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Risk limits tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ RISK LIMITS TESTS FAILED'); process.exit(1); }
else console.log('✅ All risk limit rules verified');
