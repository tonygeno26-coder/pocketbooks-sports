/**
 * PocketBooks Sports — Settlement Preview Tests (Phase C Step 3)
 * Run: node tests/settlement-preview.test.js
 * Tests DB-derived settlement preview calculations. No network calls.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'') + ' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }
function assertApprox(a, b, m) { if (Math.abs(a-b)>0.02) throw new Error((m||'')+' — got '+a+' expected ~'+b); }

// ── Pure settlement engine (mirrors backend) ──────────────────────────────────

function calcSettlementPreview(tickets, playerMeta) {
  // playerMeta: { [playerId]: { username, ... } }
  var byPlayer = {};

  function getOrCreate(pid) {
    if (!byPlayer[pid]) {
      var meta = (playerMeta && playerMeta[pid]) || {};
      byPlayer[pid] = {
        playerId:     pid,
        username:     meta.username || meta.player_username || pid,
        balance:      parseFloat(meta.balance_start || meta.balanceStart || 1000),
        openRisk:     0,
        settledNet:   0,  // positive = host owes player; negative = player owes host
        owesHost:     0,
        hostOwes:     0,
        lastTicketAt: null
      };
    }
    return byPlayer[pid];
  }

  (tickets || []).forEach(function(t) {
    var pid    = t.player_id || t.playerId || 'unknown';
    var s      = (t.status || '').toLowerCase();
    var risk   = parseFloat(t.risk_amount   || t.riskAmount   || 0);
    var profit = parseFloat(t.potential_profit || t.potentialProfit || 0);
    var p      = getOrCreate(pid);

    // Track last ticket time
    var placedMs = t.placed_at ? new Date(t.placed_at).getTime() : 0;
    if (placedMs && (!p.lastTicketAt || placedMs > new Date(p.lastTicketAt).getTime())) {
      p.lastTicketAt = t.placed_at;
    }

    if (s === 'canceled' || s === 'voided' || s === 'deleted' || s === 'push' || s === 'pushed') {
      return; // excluded from settlement
    }
    if (s === 'active' || s === 'open') {
      p.openRisk += risk; // locked, not yet settled
    } else if (s === 'won') {
      p.settledNet += profit; // host owes profit to player
    } else if (s === 'lost') {
      p.settledNet -= risk;   // player owes risk to host (already deducted, but tracked)
    }
  });

  // Derive owesHost / hostOwes from settledNet
  Object.values(byPlayer).forEach(function(p) {
    p.settledNet = Math.round(p.settledNet * 100) / 100;
    p.openRisk   = Math.round(p.openRisk   * 100) / 100;
    if (p.settledNet < 0) {
      p.owesHost = Math.abs(p.settledNet); // player lost more than won
      p.hostOwes = 0;
    } else {
      p.hostOwes  = p.settledNet;          // player won more than lost
      p.owesHost  = 0;
    }
  });

  var players  = Object.values(byPlayer);
  var playersOweTot = players.reduce(function(s,p){ return s+p.owesHost; }, 0);
  var hostOwesTot   = players.reduce(function(s,p){ return s+p.hostOwes; }, 0);

  return {
    players: players,
    totals: {
      playersOwe: Math.round(playersOweTot*100)/100,
      hostOwes:   Math.round(hostOwesTot  *100)/100,
      net:        Math.round((playersOweTot - hostOwesTot)*100)/100  // positive = host is up
    }
  };
}

// ── Test data ─────────────────────────────────────────────────────────────────
function t(id, pid, status, risk, profit) {
  return { id, player_id:pid, status, risk_amount:risk||100, potential_profit:profit||90.91,
    placed_at:'2026-05-17T19:00:00Z' };
}

var META = {
  'P1': { username:'alice', balance_start:1000 },
  'P2': { username:'bob',   balance_start:1000 }
};

// ── Per-player settlement ─────────────────────────────────────────────────────
console.log('\n── Per-player settlement derivation ──');

test('lost ticket: player owes host risk', function() {
  var r = calcSettlementPreview([t('T1','P1','lost',100,90.91)], META);
  var p = r.players.find(function(p){ return p.playerId==='P1'; });
  assertApprox(p.owesHost, 100, 'owesHost=100');
  assertEq(p.hostOwes, 0, 'hostOwes=0');
  assertApprox(p.settledNet, -100, 'settledNet=-100');
});

test('won ticket: host owes player profit', function() {
  var r = calcSettlementPreview([t('T1','P1','won',100,90.91)], META);
  var p = r.players.find(function(p){ return p.playerId==='P1'; });
  assertApprox(p.hostOwes, 90.91, 'hostOwes=90.91');
  assertEq(p.owesHost, 0, 'owesHost=0');
  assertApprox(p.settledNet, 90.91, 'settledNet=90.91');
});

test('active ticket: goes to openRisk only, not settlement', function() {
  var r = calcSettlementPreview([t('T1','P1','active',100,90.91)], META);
  var p = r.players.find(function(p){ return p.playerId==='P1'; });
  assertApprox(p.openRisk, 100, 'openRisk=100');
  assertEq(p.owesHost, 0, 'owesHost=0 (not settled)');
  assertEq(p.hostOwes, 0, 'hostOwes=0 (not settled)');
  assertEq(p.settledNet, 0, 'settledNet=0 (active)');
});

test('push/canceled: excluded from settlement', function() {
  var r = calcSettlementPreview([
    t('T1','P1','push',100,90.91),
    t('T2','P1','canceled',50,45)
  ], META);
  var p = r.players.find(function(p){ return p.playerId==='P1'; });
  assertEq(p.owesHost, 0, 'push excluded');
  assertEq(p.hostOwes, 0, 'push excluded');
  assertEq(p.settledNet, 0, 'push/canceled = no settlement effect');
});

test('mixed: won+lost for same player → net settlement', function() {
  var tickets = [
    t('T1','P1','won', 100, 90.91),   // host owes 90.91
    t('T2','P1','lost',100, 90.91),   // player lost 100
    t('T3','P1','won', 50,  45.45)    // host owes 45.45
  ];
  // net = 90.91 + 45.45 - 100 = 36.36 (host owes)
  var r = calcSettlementPreview(tickets, META);
  var p = r.players.find(function(p){ return p.playerId==='P1'; });
  assertApprox(p.settledNet, 36.36, 'settledNet=36.36');
  assertApprox(p.hostOwes,   36.36, 'hostOwes=36.36');
  assertEq(p.owesHost, 0, 'owesHost=0');
});

test('player with only losses: owesHost correctly', function() {
  var tickets = [t('T1','P1','lost',75,68),t('T2','P1','lost',100,90)];
  var r = calcSettlementPreview(tickets, META);
  var p = r.players.find(function(p){ return p.playerId==='P1'; });
  assertApprox(p.owesHost, 175, 'owesHost=175');
  assertEq(p.hostOwes, 0, 'hostOwes=0');
});

// ── Multi-player ─────────────────────────────────────────────────────────────
console.log('\n── Multi-player settlement ──');

test('two players, separate settlements', function() {
  var tickets = [
    t('T1','P1','lost',100,90.91),   // P1 owes 100
    t('T2','P2','won', 100,90.91),   // P2 won 90.91
    t('T3','P2','lost',50, 45.45)    // P2 lost 50 → net: 90.91-50=40.91 hostOwes
  ];
  var r = calcSettlementPreview(tickets, META);
  var p1 = r.players.find(function(p){ return p.playerId==='P1'; });
  var p2 = r.players.find(function(p){ return p.playerId==='P2'; });
  assertApprox(p1.owesHost, 100, 'P1 owesHost=100');
  assertApprox(p2.hostOwes, 40.91, 'P2 hostOwes=40.91');
});

// ── Totals ────────────────────────────────────────────────────────────────────
console.log('\n── Totals ──');

test('totals.playersOwe = sum of all owesHost', function() {
  var tickets = [t('T1','P1','lost',100,90),t('T2','P2','lost',75,68)];
  var r = calcSettlementPreview(tickets, META);
  assertApprox(r.totals.playersOwe, 175, 'playersOwe=175');
});

test('totals.hostOwes = sum of all hostOwes', function() {
  var tickets = [t('T1','P1','won',100,90.91),t('T2','P2','won',50,45.45)];
  var r = calcSettlementPreview(tickets, META);
  assertApprox(r.totals.hostOwes, 90.91+45.45, 'hostOwes=136.36');
});

test('totals.net positive = host is up', function() {
  var tickets = [t('T1','P1','lost',200,180),t('T2','P2','won',100,90)];
  // playersOwe=200, hostOwes=90, net=110 (host up)
  var r = calcSettlementPreview(tickets, META);
  assertApprox(r.totals.net, 110, 'net=110 host up');
});

test('totals.net negative = host is down', function() {
  var tickets = [t('T1','P1','won',200,180),t('T2','P2','lost',100,90)];
  // hostOwes=180, playersOwe=100, net=-80 (host down)
  var r = calcSettlementPreview(tickets, META);
  assertApprox(r.totals.net, -80, 'net=-80 host down');
});

test('empty tickets → zero totals, no NaN', function() {
  var r = calcSettlementPreview([], {});
  assertEq(r.totals.playersOwe, 0, 'playersOwe=0');
  assertEq(r.totals.hostOwes, 0, 'hostOwes=0');
  assertEq(r.totals.net, 0, 'net=0');
  assertEq(r.players.length, 0, 'no players');
});

// ── Reconciles with host KPIs ─────────────────────────────────────────────────
console.log('\n── Reconciliation with host KPIs ──');

test('totals.hostOwes === host KPI settledLoss', function() {
  // Host stats: won tickets → settledLoss = profit paid to players
  // Settlement: won tickets → hostOwes = profit owed to players
  // These must match
  var tickets = [t('T1','P1','won',100,90.91),t('T2','P2','won',50,45.45)];
  var preview  = calcSettlementPreview(tickets, META);
  var hostSettledLoss = tickets.reduce(function(s,t){ return s+(t.status==='won'?parseFloat(t.potential_profit):0); },0);
  assertApprox(preview.totals.hostOwes, hostSettledLoss, 'hostOwes === settledLoss');
});

test('totals.playersOwe === host KPI settledGain', function() {
  var tickets = [t('T1','P1','lost',100,90),t('T2','P2','lost',75,68)];
  var preview  = calcSettlementPreview(tickets, META);
  var hostSettledGain = tickets.reduce(function(s,t){ return s+(t.status==='lost'?parseFloat(t.risk_amount):0); },0);
  assertApprox(preview.totals.playersOwe, hostSettledGain, 'playersOwe === settledGain');
});

// ── Edge: unknown player ──────────────────────────────────────────────────────
console.log('\n── Edge cases ──');

test('unknown player (no meta): creates entry with defaults', function() {
  var r = calcSettlementPreview([t('T1','UNKNOWN','lost',100,90)], {});
  var p = r.players.find(function(p){ return p.playerId==='UNKNOWN'; });
  assert(!!p, 'player entry created');
  assertApprox(p.owesHost, 100, 'owesHost correct');
  assertEq(p.username, 'UNKNOWN', 'username defaults to playerId');
});

test('multiple tickets same player: openRisk accumulates correctly', function() {
  var tickets = [
    t('T1','P1','active',100,90),
    t('T2','P1','active',50,45),
    t('T3','P1','lost',75,68)
  ];
  var r = calcSettlementPreview(tickets, META);
  var p = r.players.find(function(p){ return p.playerId==='P1'; });
  assertApprox(p.openRisk, 150, 'openRisk=150 (2 active)');
  assertApprox(p.owesHost, 75, 'owesHost=75 (1 lost)');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Settlement preview tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ SETTLEMENT PREVIEW TESTS FAILED'); process.exit(1); }
else console.log('✅ All settlement preview rules verified');
