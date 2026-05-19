/**
 * PocketBooks Sports — Phase K: Odds Snapshot + Stale Line Protection Tests
 * Run: node tests/odds-snapshot.test.js
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
function assertApprox(a, b, m) { if (Math.abs(a-b)>0.01) throw new Error((m||'')+' — got '+a+' expected ~'+b); }

// ── Snapshot store ────────────────────────────────────────────────────────────

function makeSnapshotStore() {
  const snaps = {}; // key = canonicalGameKey+'|'+market+'|'+selection
  return {
    set: function(key, snap) { snaps[key] = snap; },
    get: function(key)       { return snaps[key] || null; },
    all: function()          { return Object.values(snaps); }
  };
}

// ── Snapshot model ────────────────────────────────────────────────────────────

function makeSnapshot(opts) {
  var now = opts.fetchedAt || new Date().toISOString();
  var ttl = opts.ttlMs != null ? opts.ttlMs : 5 * 60 * 1000; // 5 min default
  return {
    snapshotId:       opts.snapshotId || 'SNAP_'+Date.now(),
    clubId:           opts.clubId     || 'C1',
    sport:            opts.sport      || 'mlb',
    eventId:          opts.eventId    || 'G001',
    canonicalGameKey: opts.canonicalGameKey || 'MLB|reds|guardians|2026-05-17',
    marketKey:        opts.marketKey  || 'moneyline',
    selectionKey:     opts.selectionKey || 'Guardians ML',
    oddsAmerican:     opts.oddsAmerican != null ? opts.oddsAmerican : -110,
    oddsDecimal:      opts.oddsDecimal  != null ? opts.oddsDecimal  : 1.909,
    pointLine:        opts.pointLine    != null ? opts.pointLine    : null,
    source:           opts.source     || 'odds-api',
    fetchedAt:        now,
    expiresAt:        new Date(new Date(now).getTime() + ttl).toISOString(),
    commenceTime:     opts.commenceTime || '2026-05-17T19:10:00Z',
    suspended:        opts.suspended   || false,
    rawJson:          opts.rawJson     || null
  };
}

// Snapshot key
function snapKey(canonicalGameKey, market, selection) {
  return canonicalGameKey + '|' + (market||'').toLowerCase() + '|' + (selection||'').toLowerCase();
}

// ── Core: verify a submitted leg against snapshot store ───────────────────────

const ODDS_TOLERANCE_PTS = 3;   // ±3 American odds points
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 min

function verifyLegOdds(leg, store, nowMs) {
  nowMs = nowMs || Date.now();
  var cKey   = leg.canonicalGameKey || '';
  var market = (leg.market || 'moneyline').toLowerCase();
  var pick   = (leg.pick || '').toLowerCase();
  var key    = snapKey(cKey, market, pick);
  var snap   = store.get(key);

  // 1. Missing snapshot
  if (!snap) return { ok:false, code:'odds_snapshot_missing', leg:leg.pick };

  // 2. Stale snapshot
  var snapAge = nowMs - new Date(snap.fetchedAt).getTime();
  if (snapAge > STALE_THRESHOLD_MS)
    return { ok:false, code:'odds_stale', leg:leg.pick, ageMs:snapAge,
             fetchedAt:snap.fetchedAt };

  // 3. Expired snapshot
  if (snap.expiresAt && nowMs > new Date(snap.expiresAt).getTime())
    return { ok:false, code:'odds_stale', leg:leg.pick, reason:'expired' };

  // 4. Market suspended
  if (snap.suspended)
    return { ok:false, code:'market_closed', leg:leg.pick, reason:'suspended' };

  // 5. Event started
  if (snap.commenceTime) {
    var ct = new Date(snap.commenceTime).getTime();
    if (!isNaN(ct) && nowMs >= ct)
      return { ok:false, code:'event_started', leg:leg.pick, commenceTime:snap.commenceTime };
  }

  // 6. Odds changed beyond tolerance (client-submitted vs server snapshot)
  var submittedOdds = parseInt(leg.odds, 10);
  if (!isNaN(submittedOdds)) {
    var drift = Math.abs(submittedOdds - snap.oddsAmerican);
    if (drift > ODDS_TOLERANCE_PTS)
      return {
        ok:false, code:'odds_changed',
        leg:leg.pick, submittedOdds, serverOdds:snap.oddsAmerican, drift
      };
  }

  return {
    ok:true,
    snapshotId:       snap.snapshotId,
    acceptedOddsAmerican: snap.oddsAmerican,
    acceptedOddsDecimal:  snap.oddsDecimal,
    acceptedPointLine:    snap.pointLine,
    commenceTime:         snap.commenceTime
  };
}

// Verify all legs; return first failure
function verifyAllLegsOdds(legs, store, nowMs) {
  for (var i = 0; i < legs.length; i++) {
    var r = verifyLegOdds(legs[i], store, nowMs);
    if (!r.ok) return Object.assign(r, { legIndex:i });
  }
  return { ok:true };
}

// ── Payout recalculation ──────────────────────────────────────────────────────

function amToDecimal(am) {
  am = parseInt(am, 10);
  if (isNaN(am)) return 1;
  return am > 0 ? am/100 + 1 : 100/Math.abs(am) + 1;
}

function recalcPayout(stake, legs, store, nowMs) {
  // Returns { ok, payout, profit, legs: [{...serverOdds}] } or { ok:false, code, ... }
  var product = 1;
  var enrichedLegs = [];
  for (var i=0; i<legs.length; i++) {
    var vr = verifyLegOdds(legs[i], store, nowMs);
    if (!vr.ok) return Object.assign(vr, { legIndex:i });
    product *= amToDecimal(vr.acceptedOddsAmerican);
    enrichedLegs.push(Object.assign({}, legs[i], {
      acceptedOddsAmerican: vr.acceptedOddsAmerican,
      acceptedOddsDecimal:  vr.acceptedOddsDecimal,
      acceptedPointLine:    vr.acceptedPointLine,
      oddsSnapshotId:       vr.snapshotId,
      acceptedAt:           new Date(nowMs).toISOString()
    }));
  }
  var payout = Math.round(stake * product * 100) / 100;
  var profit = Math.round((payout - stake) * 100) / 100;
  return { ok:true, payout, profit, legs:enrichedLegs };
}

// ── oddsChangePolicy ──────────────────────────────────────────────────────────

function applyOddsChangePolicy(policy, verifyResult) {
  if (verifyResult.ok) return { allowed:true };
  if (verifyResult.code !== 'odds_changed') return { allowed:false, reason:verifyResult.code };
  if (policy === 'accept_any_with_confirm') return { allowed:true, changed:true };
  if (policy === 'accept_better') {
    // Better for player = more positive / less negative than submitted
    var better = verifyResult.serverOdds > verifyResult.submittedOdds;
    return better ? { allowed:true, changed:true } : { allowed:false, reason:'odds_worse' };
  }
  // Default: reject
  return { allowed:false, reason:'odds_changed' };
}

// ── Test data ─────────────────────────────────────────────────────────────────
var NOW    = new Date('2026-05-17T15:00:00Z').getTime();
var FUTURE = '2026-05-17T19:10:00Z';
var PAST   = '2026-05-17T14:00:00Z';
var CKEY   = 'MLB|reds|guardians|2026-05-17';

function freshStore() { return makeSnapshotStore(); }
function addSnap(store, overrides) {
  var s = makeSnapshot(Object.assign({ canonicalGameKey:CKEY, fetchedAt:new Date(NOW).toISOString() }, overrides||{}));
  store.set(snapKey(s.canonicalGameKey, s.marketKey, s.selectionKey), s);
  return s;
}
function leg(pick, odds, cKey, market) {
  return { pick:pick||'Guardians ML', odds:odds||-110,
           canonicalGameKey:cKey||CKEY, market:market||'Moneyline' };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Snapshot missing ──');
test('missing snapshot → odds_snapshot_missing', function() {
  var r = verifyLegOdds(leg(), freshStore(), NOW);
  assert(!r.ok); assertEq(r.code, 'odds_snapshot_missing');
});
test('snapshot present → no missing error', function() {
  var store = freshStore(); addSnap(store);
  var r = verifyLegOdds(leg(), store, NOW);
  assert(r.ok || r.code !== 'odds_snapshot_missing', 'not missing: '+(r.code||''));
});

console.log('\n── Stale snapshot ──');
test('fresh snapshot → ok', function() {
  var store = freshStore(); addSnap(store, { fetchedAt:new Date(NOW-60000).toISOString() }); // 1min old
  var r = verifyLegOdds(leg(), store, NOW);
  assert(r.ok, 'fresh 1min old: '+(r.code||''));
});
test('stale snapshot (>5min) → odds_stale', function() {
  var store = freshStore();
  addSnap(store, { fetchedAt:new Date(NOW-6*60*1000).toISOString() }); // 6min old
  var r = verifyLegOdds(leg(), store, NOW);
  assert(!r.ok); assertEq(r.code, 'odds_stale');
});
test('expired snapshot → odds_stale', function() {
  var store = freshStore();
  addSnap(store, { fetchedAt:new Date(NOW).toISOString(), ttlMs:-1000 }); // already expired
  var r = verifyLegOdds(leg(), store, NOW);
  assert(!r.ok); assertEq(r.code, 'odds_stale');
});

console.log('\n── Market suspended / event started ──');
test('suspended market → market_closed', function() {
  var store = freshStore(); addSnap(store, { suspended:true });
  assertEq(verifyLegOdds(leg(), store, NOW).code, 'market_closed');
});
test('event started → event_started', function() {
  var store = freshStore(); addSnap(store, { commenceTime:PAST });
  assertEq(verifyLegOdds(leg(), store, NOW).code, 'event_started');
});
test('event not started → ok', function() {
  var store = freshStore(); addSnap(store, { commenceTime:FUTURE });
  assert(verifyLegOdds(leg(), store, NOW).ok);
});

console.log('\n── Client-modified odds ──');
test('exact match → ok', function() {
  var store = freshStore(); addSnap(store);
  assert(verifyLegOdds(leg('Guardians ML',-110), store, NOW).ok);
});
test('within tolerance (drift=2) → ok', function() {
  var store = freshStore(); addSnap(store, { oddsAmerican:-112 }); // server=-112
  var r = verifyLegOdds(leg('Guardians ML',-110), store, NOW); // submitted=-110, drift=2
  assert(r.ok, 'drift=2 ok');
});
test('beyond tolerance (drift=15) → odds_changed', function() {
  var store = freshStore(); addSnap(store, { oddsAmerican:-125 }); // server=-125
  var r = verifyLegOdds(leg('Guardians ML',-110), store, NOW); // submitted=-110, drift=15
  assert(!r.ok); assertEq(r.code,'odds_changed');
  assertEq(r.submittedOdds,-110); assertEq(r.serverOdds,-125);
});
test('client submitted better odds than server → odds_changed (reject)', function() {
  var store = freshStore(); addSnap(store, { oddsAmerican:-120 }); // server worse
  var r = verifyLegOdds(leg('Guardians ML',-105), store, NOW); // submitted better
  assert(!r.ok); assertEq(r.code,'odds_changed');
});

console.log('\n── Server payout recalculation ──');
test('recalcPayout uses server odds, not client odds', function() {
  var store = freshStore(); addSnap(store, { oddsAmerican:-120, oddsDecimal:1.833 });
  var r = recalcPayout(100, [leg('Guardians ML',-110)], store, NOW); // client submitted -110, server has -120
  assert(!r.ok); assertEq(r.code,'odds_changed'); // client odds rejected
});
test('recalcPayout with matching odds calculates correctly', function() {
  var store = freshStore(); addSnap(store, { oddsAmerican:-110, oddsDecimal:1.909 });
  var r = recalcPayout(100, [leg('Guardians ML',-110)], store, NOW);
  assert(r.ok,'ok: '+(r.code||''));
  assertApprox(r.payout, 190.91, 'payout');
  assertApprox(r.profit, 90.91, 'profit');
});
test('parlay recalcPayout: product of server odds', function() {
  var store = freshStore();
  addSnap(store, { oddsAmerican:-110, oddsDecimal:1.909, selectionKey:'guardians ml' });
  var snap2 = makeSnapshot({ canonicalGameKey:'MLB|marlins|rays|2026-05-17',
    marketKey:'moneyline', selectionKey:'rays ml',
    oddsAmerican:-115, oddsDecimal:1.87, fetchedAt:new Date(NOW).toISOString() });
  store.set(snapKey(snap2.canonicalGameKey, snap2.marketKey, snap2.selectionKey), snap2);
  var r = recalcPayout(100, [
    leg('Guardians ML',-110, CKEY,'Moneyline'),
    leg('Rays ML',-115,'MLB|marlins|rays|2026-05-17','Moneyline')
  ], store, NOW);
  assert(r.ok,'parlay ok: '+(r.code||''));
  // 100 × 1.909 × 1.87 ≈ 356.98, allow ±0.10 for decimal rounding
  assert(Math.abs(r.payout - 100*1.909*1.87) < 0.15, 'parlay payout ~'+r.payout);
});
test('ticket legs store acceptedOddsAmerican + snapshotId', function() {
  var store = freshStore(); addSnap(store);
  var r = recalcPayout(100, [leg('Guardians ML',-110)], store, NOW);
  assert(r.ok);
  assertEq(r.legs[0].acceptedOddsAmerican,-110);
  assert(r.legs[0].oddsSnapshotId,'has snapshotId');
  assert(r.legs[0].acceptedAt,'has acceptedAt');
});

console.log('\n── oddsChangePolicy ──');
test('policy=reject: odds_changed → blocked', function() {
  var vr = { ok:false, code:'odds_changed', submittedOdds:-110, serverOdds:-125, drift:15 };
  assertEq(applyOddsChangePolicy('reject', vr).allowed, false);
});
test('policy=accept_any_with_confirm: odds_changed → allowed', function() {
  var vr = { ok:false, code:'odds_changed', submittedOdds:-110, serverOdds:-125, drift:15 };
  var r = applyOddsChangePolicy('accept_any_with_confirm', vr);
  assert(r.allowed); assert(r.changed);
});
test('policy=accept_better: better server odds → allowed', function() {
  var vr = { ok:false, code:'odds_changed', submittedOdds:-120, serverOdds:-110, drift:10 };
  // -110 > -120 = better for player
  assert(applyOddsChangePolicy('accept_better', vr).allowed);
});
test('policy=accept_better: worse server odds → blocked', function() {
  var vr = { ok:false, code:'odds_changed', submittedOdds:-110, serverOdds:-130, drift:20 };
  // -130 < -110 = worse for player
  assert(!applyOddsChangePolicy('accept_better', vr).allowed);
});

console.log('\n── Parlay: one stale leg blocks ──');
test('parlay: one stale leg blocks whole ticket', function() {
  var store = freshStore();
  addSnap(store, { selectionKey:'guardians ml', commenceTime:FUTURE });
  var snap2 = makeSnapshot({ canonicalGameKey:'MLB|marlins|rays|2026-05-17',
    marketKey:'moneyline', selectionKey:'rays ml',
    commenceTime:PAST, fetchedAt:new Date(NOW).toISOString() }); // game started
  store.set(snapKey(snap2.canonicalGameKey, snap2.marketKey, snap2.selectionKey), snap2);
  var r = verifyAllLegsOdds([
    leg('Guardians ML',-110, CKEY,'Moneyline'),
    leg('Rays ML',-110,'MLB|marlins|rays|2026-05-17','Moneyline')
  ], store, NOW);
  assert(!r.ok); assertEq(r.code,'event_started'); assertEq(r.legIndex,1);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Odds snapshot tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ ODDS SNAPSHOT TESTS FAILED'); process.exit(1); }
else console.log('✅ All odds snapshot rules verified');
