/**
 * PocketBooks Sports — Phase AA-1: Host Diamond Balance Fail-Closed Tests
 * Run: node tests/host-diamond-failclosed.test.js
 * Pure logic — no network, no DB.
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

// ── Constants ─────────────────────────────────────────────────────────────────

const HOST_ACTIVE_BETTOR_FEE = 15;

// ── Fail-closed charge logic (mirrors updated backend) ────────────────────────

function processActiveBettorChargeV2(hostStore, bettorStore, clubId, playerId,
                                      ticketId, nowMs, opts) {
  opts = opts || {};
  var isProduction    = opts.isProduction !== false; // default: production mode
  var devAuthBypass   = !!opts.devAuthBypass;        // DEV_AUTH_BYPASS=true
  var weekStart       = getWeekStart(nowMs);

  // Already active this week → no charge
  if (bettorStore.isActive(clubId, playerId, weekStart))
    return { ok:true, charged:false, reason:'already_active_this_week', weekStart };

  var host = hostStore.get(clubId);

  // FAIL-CLOSED: missing host balance row
  if (!host) {
    if (isProduction) {
      return {
        ok: false, error: 'host_diamond_balance_missing', httpStatus: 402,
        message: 'Host diamond balance is not configured. Contact the host to set up their account.'
      };
    }
    // Dev bypass — fail-open with loud warning
    if (devAuthBypass) {
      console.warn('[WARN] DEV_AUTH_BYPASS: host_diamond_balance_missing for club=' + clubId + ' — allowing in dev');
      return { ok:true, charged:false, reason:'dev_bypass_no_balance_row', weekStart };
    }
    // Dev without bypass still fails closed
    return {
      ok: false, error: 'host_diamond_balance_missing', httpStatus: 402,
      message: 'Host diamond balance is not configured. Contact the host to set up their account.'
    };
  }

  // Insufficient balance
  if (host.balanceDiamonds < HOST_ACTIVE_BETTOR_FEE) {
    return {
      ok: false, error: 'host_diamond_balance_insufficient', httpStatus: 402,
      message: 'Host diamond balance is too low to activate another bettor this week. Ask host to refill diamonds.',
      balance: host.balanceDiamonds, required: HOST_ACTIVE_BETTOR_FEE
    };
  }

  // Deduct and activate
  hostStore.deduct(clubId, HOST_ACTIVE_BETTOR_FEE);
  var ledgerId = 'HAB_' + clubId + '_' + playerId + '_' + weekStart;
  bettorStore.activate(clubId, playerId, weekStart, ticketId, ledgerId);
  return {
    ok: true, charged: true, chargedDiamonds: HOST_ACTIVE_BETTOR_FEE,
    ledgerEvent: 'HOST_ACTIVE_BETTOR_CHARGE', weekStart, ledgerId
  };
}

// ── Seed endpoint logic ───────────────────────────────────────────────────────

function seedHostBalance(hostStore, clubId, hostActorId, startingBalance, force) {
  if (!clubId || !hostActorId)
    return { ok: false, error: 'missing_clubId_or_hostActorId' };
  if (typeof startingBalance !== 'number' || startingBalance < 0)
    return { ok: false, error: 'invalid_startingBalance' };

  var existing = hostStore.get(clubId);
  if (existing && !force)
    return { ok: false, error: 'balance_row_already_exists', current: existing.balanceDiamonds };

  hostStore.init(clubId, hostActorId, startingBalance);
  return { ok: true, clubId, hostActorId, balanceDiamonds: startingBalance,
           created: !existing, overwritten: !!existing };
}

// ── Helpers (copied from Phase AA tests) ─────────────────────────────────────

function getWeekStart(nowMs) {
  var d = new Date(nowMs || Date.now());
  var day = d.getUTCDay();
  var diff = day === 0 ? -6 : 1 - day;
  var mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  return mon.toISOString().slice(0, 10);
}

function makeHostBalanceStore() {
  var rows = {};
  return {
    get:    function(id)    { return rows[id] || null; },
    init:   function(id, ha, bal) { rows[id] = { clubId:id, hostActorId:ha, balanceDiamonds:bal }; },
    deduct: function(id, n) { if (rows[id]) rows[id].balanceDiamonds -= n; }
  };
}

function makeActiveBettorStore() {
  var rows = {};
  function k(c,p,w){ return c+'|'+p+'|'+w; }
  return {
    isActive:  function(c,p,w){ return !!rows[k(c,p,w)]; },
    activate:  function(c,p,w,t,l){ var key=k(c,p,w); if(rows[key]) return false; rows[key]={clubId:c,playerId:p,weekStart:w,firstTicketId:t,chargeLedgerId:l}; return true; },
    countForWeek: function(c,w){ return Object.values(rows).filter(function(r){ return r.clubId===c&&r.weekStart===w; }).length; }
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Production: missing host balance → fail closed ──');

test('production + no balance row → 402 host_diamond_balance_missing', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  var r = processActiveBettorChargeV2(hs, bs, 'C1','P1','T1', Date.now(),
    { isProduction: true });
  assert(!r.ok);
  assertEq(r.error, 'host_diamond_balance_missing');
  assertEq(r.httpStatus, 402);
  assert(r.message.includes('Contact the host'));
});

test('production + no balance row → bet blocked (ok:false)', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  var r = processActiveBettorChargeV2(hs, bs, 'C1','P1','T1', Date.now(),
    { isProduction: true });
  assert(!r.ok, 'must be blocked in production');
});

test('production + no balance → different club also blocked', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C2','H2', 100); // C2 has balance but C1 does not
  var r = processActiveBettorChargeV2(hs, bs, 'C1','P1','T1', Date.now(),
    { isProduction: true });
  assertEq(r.error, 'host_diamond_balance_missing');
});

console.log('\n── Dev bypass: fail-open with warning ──');

test('dev + DEV_AUTH_BYPASS=true + no balance → ok:true (fail-open)', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  var r = processActiveBettorChargeV2(hs, bs, 'C1','P1','T1', Date.now(),
    { isProduction: false, devAuthBypass: true });
  assert(r.ok, 'dev bypass should allow');
  assertEq(r.reason, 'dev_bypass_no_balance_row');
  assert(!r.charged, 'not charged (no row)');
});

test('dev + no DEV_AUTH_BYPASS + no balance → still fail-closed', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  var r = processActiveBettorChargeV2(hs, bs, 'C1','P1','T1', Date.now(),
    { isProduction: false, devAuthBypass: false });
  assert(!r.ok);
  assertEq(r.error, 'host_diamond_balance_missing');
});

console.log('\n── Seeded host balance allows charge ──');

test('seeded balance → first bettor charged correctly', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  var r = processActiveBettorChargeV2(hs, bs, 'C1','P1','T1', Date.now(),
    { isProduction: true });
  assert(r.ok && r.charged);
  assertEq(r.chargedDiamonds, 15);
  assertEq(hs.get('C1').balanceDiamonds, 135);
});

test('seeded balance → already-active bettor not charged again', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  var now = Date.now();
  processActiveBettorChargeV2(hs, bs, 'C1','P1','T1', now, { isProduction:true });
  var r2 = processActiveBettorChargeV2(hs, bs, 'C1','P1','T2', now+1000, { isProduction:true });
  assert(r2.ok && !r2.charged);
  assertEq(hs.get('C1').balanceDiamonds, 135, 'still 135 — second bet no charge');
});

console.log('\n── seedHostBalance ──');

test('seed creates row when none exists', function() {
  var hs = makeHostBalanceStore();
  var r = seedHostBalance(hs, 'C1','H1', 300, false);
  assert(r.ok); assert(r.created); assert(!r.overwritten);
  assertEq(r.balanceDiamonds, 300);
  assertEq(hs.get('C1').balanceDiamonds, 300);
});

test('seed without force does not overwrite existing row', function() {
  var hs = makeHostBalanceStore();
  hs.init('C1','H1', 100);
  var r = seedHostBalance(hs, 'C1','H1', 999, false);
  assert(!r.ok);
  assertEq(r.error, 'balance_row_already_exists');
  assertEq(r.current, 100, 'existing balance unchanged');
  assertEq(hs.get('C1').balanceDiamonds, 100, 'store unchanged');
});

test('seed with force=true overwrites existing row', function() {
  var hs = makeHostBalanceStore();
  hs.init('C1','H1', 100);
  var r = seedHostBalance(hs, 'C1','H1', 500, true);
  assert(r.ok); assert(r.overwritten);
  assertEq(hs.get('C1').balanceDiamonds, 500);
});

test('seed missing clubId → error', function() {
  var hs = makeHostBalanceStore();
  var r = seedHostBalance(hs, '','H1', 100, false);
  assertEq(r.error, 'missing_clubId_or_hostActorId');
});

test('seed negative balance → error', function() {
  var hs = makeHostBalanceStore();
  var r = seedHostBalance(hs, 'C1','H1', -50, false);
  assertEq(r.error, 'invalid_startingBalance');
});

test('seed 0 balance → valid (host starts empty)', function() {
  var hs = makeHostBalanceStore();
  var r = seedHostBalance(hs, 'C1','H1', 0, false);
  assert(r.ok); assertEq(r.balanceDiamonds, 0);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Host diamond fail-closed tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ HOST DIAMOND FAIL-CLOSED TESTS FAILED'); process.exit(1); }
else console.log('✅ All host diamond fail-closed rules verified');
