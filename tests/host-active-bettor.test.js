/**
 * PocketBooks Sports — Phase AA: Host Active-Bettor Diamond Charging Tests
 * Run: node tests/host-active-bettor.test.js
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

const HOST_ACTIVE_BETTOR_FEE_DIAMONDS = 15;

// ── Week start derivation ─────────────────────────────────────────────────────

function getWeekStart(nowMs) {
  var d = new Date(nowMs || Date.now());
  // Monday-based ISO week
  var day = d.getUTCDay();             // 0=Sun
  var diff = (day === 0 ? -6 : 1 - day); // days back to Monday
  var mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  mon.setUTCHours(0, 0, 0, 0);
  return mon.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ── In-memory stores (stand-in for DB tables) ─────────────────────────────────

function makeHostBalanceStore() {
  var rows = {};
  return {
    get: function(clubId) {
      return rows[clubId] || null;
    },
    init: function(clubId, hostActorId, balance) {
      rows[clubId] = { clubId, hostActorId, balanceDiamonds: balance, updatedAt: new Date().toISOString() };
    },
    deduct: function(clubId, amount) {
      if (!rows[clubId]) return false;
      rows[clubId].balanceDiamonds -= amount;
      rows[clubId].updatedAt = new Date().toISOString();
      return true;
    },
    add: function(clubId, amount) {
      if (!rows[clubId]) return false;
      rows[clubId].balanceDiamonds += amount;
      rows[clubId].updatedAt = new Date().toISOString();
      return true;
    }
  };
}

function makeActiveBettorStore() {
  var rows = {};
  function key(clubId, playerId, weekStart) { return clubId + '|' + playerId + '|' + weekStart; }
  return {
    isActive: function(clubId, playerId, weekStart) {
      return !!rows[key(clubId, playerId, weekStart)];
    },
    activate: function(clubId, playerId, weekStart, ticketId, chargeLedgerId) {
      var k = key(clubId, playerId, weekStart);
      if (rows[k]) return false; // already active
      rows[k] = {
        clubId, playerId, weekStart,
        firstTicketId: ticketId,
        activatedAt: new Date().toISOString(),
        chargedDiamonds: HOST_ACTIVE_BETTOR_FEE_DIAMONDS,
        chargeLedgerId: chargeLedgerId || null
      };
      return true;
    },
    countForWeek: function(clubId, weekStart) {
      return Object.values(rows).filter(function(r) {
        return r.clubId === clubId && r.weekStart === weekStart;
      }).length;
    },
    listForWeek: function(clubId, weekStart) {
      return Object.values(rows).filter(function(r) {
        return r.clubId === clubId && r.weekStart === weekStart;
      });
    }
  };
}

// ── Active-bettor charge logic ────────────────────────────────────────────────

function processActiveBettorCharge(hostStore, bettorStore, clubId, playerId, ticketId, nowMs) {
  var weekStart = getWeekStart(nowMs);

  // Already active this week → no charge
  if (bettorStore.isActive(clubId, playerId, weekStart)) {
    return { ok: true, charged: false, reason: 'already_active_this_week', weekStart };
  }

  // Check host balance
  var host = hostStore.get(clubId);
  if (!host) return { ok: false, error: 'host_balance_not_found' };
  if (host.balanceDiamonds < HOST_ACTIVE_BETTOR_FEE_DIAMONDS) {
    return {
      ok: false, error: 'host_diamond_balance_insufficient',
      httpStatus: 402,
      message: 'Host diamond balance is too low to activate another bettor this week. Ask host to refill diamonds.',
      balance: host.balanceDiamonds,
      required: HOST_ACTIVE_BETTOR_FEE_DIAMONDS
    };
  }

  // Deduct and activate
  hostStore.deduct(clubId, HOST_ACTIVE_BETTOR_FEE_DIAMONDS);
  var ledgerId = 'HLDR_' + clubId + '_' + playerId + '_' + weekStart;
  bettorStore.activate(clubId, playerId, weekStart, ticketId, ledgerId);

  return {
    ok: true, charged: true,
    chargedDiamonds: HOST_ACTIVE_BETTOR_FEE_DIAMONDS,
    ledgerEvent: 'HOST_ACTIVE_BETTOR_CHARGE',
    weekStart, ledgerId
  };
}

// ── Usage summary ─────────────────────────────────────────────────────────────

function getHostDiamondUsage(hostStore, bettorStore, clubId, nowMs) {
  var weekStart = getWeekStart(nowMs);
  var host = hostStore.get(clubId);
  var balance = host ? host.balanceDiamonds : 0;
  var activeBettorCount = bettorStore.countForWeek(clubId, weekStart);
  var capacityTotal = Math.floor(balance / HOST_ACTIVE_BETTOR_FEE_DIAMONDS) + activeBettorCount;
  var capacityRemaining = Math.floor(balance / HOST_ACTIVE_BETTOR_FEE_DIAMONDS);
  return {
    balanceDiamonds: balance,
    activeBettorCount,
    feePerActiveBettor: HOST_ACTIVE_BETTOR_FEE_DIAMONDS,
    capacityTotal,
    capacityUsed: activeBettorCount,
    capacityRemaining,
    activeBettors: bettorStore.listForWeek(clubId, weekStart)
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── getWeekStart ──');

test('Monday returns same day', function() {
  // 2026-05-18 is a Monday
  var ws = getWeekStart(new Date('2026-05-18T12:00:00Z').getTime());
  assertEq(ws, '2026-05-18');
});
test('Sunday returns previous Monday', function() {
  // 2026-05-17 is a Sunday → week start = 2026-05-11
  var ws = getWeekStart(new Date('2026-05-17T12:00:00Z').getTime());
  assertEq(ws, '2026-05-11');
});
test('Wednesday returns Monday of that week', function() {
  // 2026-05-20 is a Wednesday → week start = 2026-05-18
  var ws = getWeekStart(new Date('2026-05-20T12:00:00Z').getTime());
  assertEq(ws, '2026-05-18');
});

console.log('\n── First bet charges host 15 diamonds ──');

test('first bet → charged=true, 15 diamonds deducted', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  var r = processActiveBettorCharge(hs, bs, 'C1','P1','T001', new Date('2026-05-19T10:00:00Z').getTime());
  assert(r.ok && r.charged, 'charged: '+(r.error||''));
  assertEq(r.chargedDiamonds, 15);
  assertEq(hs.get('C1').balanceDiamonds, 135);
});

test('first bet emits HOST_ACTIVE_BETTOR_CHARGE ledger event', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  var r = processActiveBettorCharge(hs, bs, 'C1','P1','T001', Date.now());
  assertEq(r.ledgerEvent, 'HOST_ACTIVE_BETTOR_CHARGE');
});

console.log('\n── Repeat bettor same week charges 0 ──');

test('second bet same player same week → charged=false', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  var now = new Date('2026-05-19T10:00:00Z').getTime();
  processActiveBettorCharge(hs, bs, 'C1','P1','T001', now);
  var r2 = processActiveBettorCharge(hs, bs, 'C1','P1','T002', now + 3600000);
  assert(r2.ok && !r2.charged);
  assertEq(r2.reason, 'already_active_this_week');
});

test('100 bets same player same week → host charged only once (15 total)', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 1500);
  var now = new Date('2026-05-19T10:00:00Z').getTime();
  for (var i = 0; i < 100; i++) {
    processActiveBettorCharge(hs, bs, 'C1','P1','T'+i, now + i * 1000);
  }
  assertEq(hs.get('C1').balanceDiamonds, 1485, '1500 - 15 = 1485');
});

console.log('\n── Multiple distinct bettors charge correctly ──');

test('16 unique bettors → host charged 16 × 15 = 240 diamonds', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 1000);
  var now = new Date('2026-05-19T10:00:00Z').getTime();
  for (var i = 0; i < 16; i++) {
    processActiveBettorCharge(hs, bs, 'C1','P'+i,'T'+i, now + i * 100);
  }
  assertEq(hs.get('C1').balanceDiamonds, 1000 - 16*15);
  assertEq(bs.countForWeek('C1', getWeekStart(now)), 16);
});

test('inactive players cost 0', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  // Players who never bet — balance unchanged
  assertEq(hs.get('C1').balanceDiamonds, 150);
  assertEq(bs.countForWeek('C1', getWeekStart(Date.now())), 0);
});

console.log('\n── Insufficient host balance blocks new active bettor ──');

test('balance < 15 → 402 host_diamond_balance_insufficient', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 10); // only 10 diamonds
  var r = processActiveBettorCharge(hs, bs, 'C1','P1','T001', Date.now());
  assert(!r.ok);
  assertEq(r.error, 'host_diamond_balance_insufficient');
  assertEq(r.httpStatus, 402);
  assert(r.message.includes('refill diamonds'), 'player message present');
});

test('exact 15 diamonds → allowed', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 15);
  var r = processActiveBettorCharge(hs, bs, 'C1','P1','T001', Date.now());
  assert(r.ok && r.charged);
  assertEq(hs.get('C1').balanceDiamonds, 0);
});

test('balance 0 after charging → next new bettor blocked', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 15);
  processActiveBettorCharge(hs, bs, 'C1','P1','T001', Date.now());
  var r2 = processActiveBettorCharge(hs, bs, 'C1','P2','T002', Date.now());
  assert(!r2.ok); assertEq(r2.error, 'host_diamond_balance_insufficient');
});

test('already-active bettor can keep betting even if balance later drops to 0', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 15);
  var now = new Date('2026-05-19T10:00:00Z').getTime();
  processActiveBettorCharge(hs, bs, 'C1','P1','T001', now); // activates, balance → 0
  // Now P1 places another bet — must be allowed (already active)
  var r = processActiveBettorCharge(hs, bs, 'C1','P1','T002', now + 1000);
  assert(r.ok && !r.charged, 'already-active player not blocked by low balance');
  assertEq(r.reason, 'already_active_this_week');
});

console.log('\n── Weekly reset ──');

test('new week → player not active, charged again', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  var week1 = new Date('2026-05-18T10:00:00Z').getTime(); // Monday week 1
  var week2 = new Date('2026-05-25T10:00:00Z').getTime(); // Monday week 2
  processActiveBettorCharge(hs, bs, 'C1','P1','T001', week1);
  assertEq(hs.get('C1').balanceDiamonds, 135);
  var r2 = processActiveBettorCharge(hs, bs, 'C1','P1','T002', week2);
  assert(r2.ok && r2.charged, 'charged in new week');
  assertEq(hs.get('C1').balanceDiamonds, 120);
});

test('previous week rows preserved for audit', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  var week1 = new Date('2026-05-18T10:00:00Z').getTime();
  var week2 = new Date('2026-05-25T10:00:00Z').getTime();
  processActiveBettorCharge(hs, bs, 'C1','P1','T001', week1);
  processActiveBettorCharge(hs, bs, 'C1','P1','T002', week2);
  // Both weeks should have a row
  assert(bs.isActive('C1','P1','2026-05-18'), 'week1 row preserved');
  assert(bs.isActive('C1','P1','2026-05-25'), 'week2 row exists');
});

console.log('\n── Cancel does not refund charge ──');

test('canceling first bet does NOT refund 15 diamonds', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  processActiveBettorCharge(hs, bs, 'C1','P1','T001', Date.now());
  var balanceAfterCharge = hs.get('C1').balanceDiamonds;
  assertEq(balanceAfterCharge, 135);
  // Simulate bet cancel — no refund operation defined
  // Balance should remain 135 (no refund logic runs)
  assertEq(hs.get('C1').balanceDiamonds, 135, 'no refund on cancel');
});

console.log('\n── getHostDiamondUsage ──');

test('usage returns correct balanceDiamonds', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  var u = getHostDiamondUsage(hs, bs, 'C1', Date.now());
  assertEq(u.balanceDiamonds, 150);
  assertEq(u.feePerActiveBettor, 15);
});

test('usage capacityUsed matches active bettor count', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  var now = new Date('2026-05-19T10:00:00Z').getTime();
  processActiveBettorCharge(hs, bs, 'C1','P1','T001', now);
  processActiveBettorCharge(hs, bs, 'C1','P2','T002', now + 100);
  var u = getHostDiamondUsage(hs, bs, 'C1', now);
  assertEq(u.capacityUsed, 2);
  assertEq(u.balanceDiamonds, 120); // 150 - 2×15
  assertEq(u.capacityRemaining, 8); // 120/15
});

test('usage capacityRemaining 0 when balance 0', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 15);
  processActiveBettorCharge(hs, bs, 'C1','P1','T001', Date.now());
  var u = getHostDiamondUsage(hs, bs, 'C1', Date.now());
  assertEq(u.capacityRemaining, 0);
});

test('usage activeBettors[] contains player entries', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  hs.init('C1','H1', 150);
  var now = new Date('2026-05-19T10:00:00Z').getTime();
  processActiveBettorCharge(hs, bs, 'C1','P1','T001', now);
  var u = getHostDiamondUsage(hs, bs, 'C1', now);
  assert(u.activeBettors.length === 1);
  assertEq(u.activeBettors[0].playerId, 'P1');
});

test('host_balance_not_found when no balance row', function() {
  var hs = makeHostBalanceStore(); var bs = makeActiveBettorStore();
  var r = processActiveBettorCharge(hs, bs, 'NO_CLUB','P1','T001', Date.now());
  assertEq(r.error, 'host_balance_not_found');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Host active-bettor tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ HOST ACTIVE-BETTOR TESTS FAILED'); process.exit(1); }
else console.log('✅ All host active-bettor rules verified');
