/**
 * PocketBooks Sports — Phase L: Fail-Closed Odds + Market Suspension Tests
 * Run: node tests/fail-closed-odds.test.js
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

// ── Snapshot verification with fail-closed policy ────────────────────────────

const STALE_MS  = 5 * 60 * 1000;
const TOLERANCE = 3;

function makeSnap(overrides) {
  var now = overrides.fetchedAt || new Date().toISOString();
  return Object.assign({
    snapshotId: 'SNAP_1', oddsAmerican: -110, oddsDecimal: 1.909,
    pointLine: null, suspended: false, commenceTime: '2026-05-17T19:10:00Z',
    fetchedAt: now, expiresAt: new Date(new Date(now).getTime()+STALE_MS).toISOString()
  }, overrides);
}

/**
 * verifyLegWithPolicy
 * @param snap        - snapshot row | null (not found) | Error (DB failure)
 * @param leg         - { odds, pick }
 * @param isProduction
 * @param devBypass   - whether DEV_AUTH_BYPASS allows fallback
 * @param nowMs
 */
function verifyLegWithPolicy(snap, leg, isProduction, devBypass, nowMs) {
  nowMs = nowMs || Date.now();
  const bypassOk = !isProduction || devBypass;

  // DB error / exception
  if (snap instanceof Error) {
    if (bypassOk) {
      console.warn('[odds] DB error — DEV fallback to client odds:', snap.message);
      return { ok:true, devFallback:true, warn:'snapshot_db_error' };
    }
    return { ok:false, code:'odds_service_unavailable', reason:'db_error', detail:snap.message };
  }

  // Snapshot not found
  if (!snap) {
    if (bypassOk) {
      console.warn('[odds] snapshot missing — DEV fallback to client odds');
      return { ok:true, devFallback:true, warn:'odds_snapshot_missing' };
    }
    return { ok:false, code:'odds_service_unavailable', reason:'snapshot_missing', leg:leg.pick };
  }

  // Stale
  const ageMs = nowMs - new Date(snap.fetchedAt).getTime();
  if (ageMs > STALE_MS) {
    if (bypassOk) {
      console.warn('[odds] stale snapshot — DEV fallback');
      return { ok:true, devFallback:true, warn:'odds_stale', ageMs };
    }
    return { ok:false, code:'odds_stale', ageMs, leg:leg.pick };
  }
  if (snap.expiresAt && nowMs > new Date(snap.expiresAt).getTime()) {
    if (bypassOk) return { ok:true, devFallback:true, warn:'odds_expired' };
    return { ok:false, code:'odds_stale', reason:'expired', leg:leg.pick };
  }

  // Suspended
  if (snap.suspended) {
    return { ok:false, code:'market_closed', reason:'suspended', leg:leg.pick };
  }

  // Event started
  if (snap.commenceTime) {
    const ct = new Date(snap.commenceTime).getTime();
    if (!isNaN(ct) && nowMs >= ct)
      return { ok:false, code:'event_started', commenceTime:snap.commenceTime, leg:leg.pick };
  }

  // Odds drift
  const submittedOdds = parseInt(leg.odds, 10);
  if (!isNaN(submittedOdds)) {
    const drift = Math.abs(submittedOdds - snap.oddsAmerican);
    if (drift > TOLERANCE)
      return { ok:false, code:'odds_changed', submittedOdds, serverOdds:snap.oddsAmerican, drift };
  }

  return {
    ok:true, snapshotId:snap.snapshotId,
    acceptedOddsAmerican:snap.oddsAmerican,
    acceptedOddsDecimal:snap.oddsDecimal
  };
}

// ── Market status model ───────────────────────────────────────────────────────

const MARKET_STATES = { ACTIVE:'active', SUSPENDED:'suspended',
                         CLOSED:'closed', STALE:'stale', STARTED:'event_started' };

function classifyMarket(snap, nowMs) {
  if (!snap) return MARKET_STATES.SUSPENDED; // missing = treat as suspended
  const ageMs = nowMs - new Date(snap.fetchedAt).getTime();
  if (ageMs > STALE_MS) return MARKET_STATES.STALE;
  if (snap.suspended) return MARKET_STATES.SUSPENDED;
  if (snap.commenceTime) {
    const ct = new Date(snap.commenceTime).getTime();
    if (!isNaN(ct) && nowMs >= ct) return MARKET_STATES.STARTED;
  }
  return MARKET_STATES.ACTIVE;
}

function buildMarketStatusSummary(snapshots, nowMs) {
  var counts = { active:0, suspended:0, closed:0, stale:0, event_started:0 };
  var warnings = [];
  (snapshots||[]).forEach(function(s) {
    var state = classifyMarket(s, nowMs);
    counts[state] = (counts[state]||0) + 1;
  });
  if (counts.stale > 0)     warnings.push('stale_snapshots:'+counts.stale);
  if (counts.suspended > 0) warnings.push('suspended_markets:'+counts.suspended);
  return { counts, warnings };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

var NOW = new Date('2026-05-17T15:00:00Z').getTime();
var LEG = { pick:'Guardians ML', odds:-110 };

// ── Production: fail-closed ───────────────────────────────────────────────────
console.log('\n── Production: fail-closed ──');

test('production: DB error → odds_service_unavailable', function() {
  var r = verifyLegWithPolicy(new Error('connection timeout'), LEG, true, false, NOW);
  assert(!r.ok); assertEq(r.code,'odds_service_unavailable');
  assertEq(r.reason,'db_error');
});
test('production: snapshot missing → odds_service_unavailable', function() {
  var r = verifyLegWithPolicy(null, LEG, true, false, NOW);
  assert(!r.ok); assertEq(r.code,'odds_service_unavailable');
  assertEq(r.reason,'snapshot_missing');
});
test('production: stale snapshot → odds_stale (no fallback)', function() {
  var stale = makeSnap({ fetchedAt: new Date(NOW - 6*60*1000).toISOString() });
  var r = verifyLegWithPolicy(stale, LEG, true, false, NOW);
  assert(!r.ok); assertEq(r.code,'odds_stale');
  assert(!r.devFallback,'no dev fallback in production');
});
test('production: valid snapshot → ok, no devFallback', function() {
  var snap = makeSnap({ fetchedAt: new Date(NOW).toISOString() });
  var r = verifyLegWithPolicy(snap, LEG, true, false, NOW);
  assert(r.ok); assert(!r.devFallback,'no fallback flag');
});
test('production: never uses client odds on error', function() {
  // Any error in production must return ok:false
  var errors = [
    verifyLegWithPolicy(new Error('network'), LEG, true, false, NOW),
    verifyLegWithPolicy(null, LEG, true, false, NOW),
    verifyLegWithPolicy(makeSnap({ fetchedAt:new Date(NOW-10*60*1000).toISOString() }), LEG, true, false, NOW)
  ];
  errors.forEach(function(r) {
    assert(!r.ok, 'must fail: '+JSON.stringify(r));
    assert(!r.devFallback, 'no dev fallback');
  });
});

// ── Dev: fallback allowed when bypass enabled ─────────────────────────────────
console.log('\n── Dev: fallback ──');

test('dev: DB error → devFallback ok', function() {
  var r = verifyLegWithPolicy(new Error('no db'), LEG, false, false, NOW);
  assert(r.ok); assert(r.devFallback); assertEq(r.warn,'snapshot_db_error');
});
test('dev: missing snapshot → devFallback ok', function() {
  var r = verifyLegWithPolicy(null, LEG, false, false, NOW);
  assert(r.ok); assert(r.devFallback);
});
test('dev: stale snapshot → devFallback ok', function() {
  var stale = makeSnap({ fetchedAt: new Date(NOW-10*60*1000).toISOString() });
  var r = verifyLegWithPolicy(stale, LEG, false, false, NOW);
  assert(r.ok); assert(r.devFallback);
});
test('DEV_AUTH_BYPASS=true in production → fallback allowed', function() {
  var r = verifyLegWithPolicy(null, LEG, true, true/*devBypass*/, NOW);
  assert(r.ok); assert(r.devFallback);
});
test('dev: suspended market still blocked (not a db error)', function() {
  var snap = makeSnap({ fetchedAt:new Date(NOW).toISOString(), suspended:true });
  var r = verifyLegWithPolicy(snap, LEG, false, false, NOW);
  assert(!r.ok); assertEq(r.code,'market_closed');
});

// ── Market states ─────────────────────────────────────────────────────────────
console.log('\n── Market states ──');

test('active snap → active', function() {
  var s = makeSnap({ fetchedAt:new Date(NOW).toISOString(), commenceTime:'2026-05-17T19:00:00Z' });
  assertEq(classifyMarket(s, NOW), 'active');
});
test('missing snap → suspended', function() {
  assertEq(classifyMarket(null, NOW), 'suspended');
});
test('suspended snap → suspended', function() {
  var s = makeSnap({ fetchedAt:new Date(NOW).toISOString(), suspended:true });
  assertEq(classifyMarket(s, NOW), 'suspended');
});
test('stale snap → stale', function() {
  var s = makeSnap({ fetchedAt:new Date(NOW-6*60*1000).toISOString() });
  assertEq(classifyMarket(s, NOW), 'stale');
});
test('started event → event_started', function() {
  var s = makeSnap({ fetchedAt:new Date(NOW).toISOString(), commenceTime:'2026-05-17T14:00:00Z' });
  assertEq(classifyMarket(s, NOW), 'event_started');
});

// ── Market status summary ─────────────────────────────────────────────────────
console.log('\n── Market status summary ──');

test('all active → no warnings', function() {
  var snaps = [
    makeSnap({ fetchedAt:new Date(NOW).toISOString() }),
    makeSnap({ fetchedAt:new Date(NOW).toISOString() })
  ];
  var r = buildMarketStatusSummary(snaps, NOW);
  assertEq(r.counts.active, 2);
  assertEq(r.warnings.length, 0);
});
test('mixed states → correct counts + warnings', function() {
  var snaps = [
    makeSnap({ fetchedAt:new Date(NOW).toISOString() }),              // active
    makeSnap({ fetchedAt:new Date(NOW-6*60*1000).toISOString() }),    // stale
    makeSnap({ fetchedAt:new Date(NOW).toISOString(), suspended:true }) // suspended
  ];
  var r = buildMarketStatusSummary(snaps, NOW);
  assertEq(r.counts.active, 1);
  assertEq(r.counts.stale, 1);
  assertEq(r.counts.suspended, 1);
  assert(r.warnings.some(function(w){ return w.includes('stale'); }));
  assert(r.warnings.some(function(w){ return w.includes('suspended'); }));
});

// ── Stale / suspended bets blocked ───────────────────────────────────────────
console.log('\n── Stale/suspended market bets blocked ──');

test('stale market → bet rejected in production', function() {
  var stale = makeSnap({ fetchedAt:new Date(NOW-8*60*1000).toISOString() });
  var r = verifyLegWithPolicy(stale, LEG, true, false, NOW);
  assert(!r.ok); assertEq(r.code,'odds_stale');
});
test('suspended market → bet rejected (production + dev)', function() {
  var snap = makeSnap({ fetchedAt:new Date(NOW).toISOString(), suspended:true });
  assert(!verifyLegWithPolicy(snap, LEG, true, false, NOW).ok);
  assert(!verifyLegWithPolicy(snap, LEG, false, false, NOW).ok);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Fail-closed odds tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ FAIL-CLOSED ODDS TESTS FAILED'); process.exit(1); }
else console.log('✅ All fail-closed odds rules verified');
