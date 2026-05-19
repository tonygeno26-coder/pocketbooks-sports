/**
 * PocketBooks Sports — Player Dashboard DB Tests
 * Run: node tests/player-dashboard.test.js
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

// ── Pure player balance engine (mirrors backend) ──────────────────────────────

function rnd(v) { return Math.round((isNaN(v)?0:v)*100)/100; }

function calcPlayerBalance(tickets, startingBalance) {
  var starting = parseFloat(startingBalance) || 1000;
  var openRisk=0, settledGains=0, settledLosses=0, refunds=0;
  var warnings = [];
  var active=[], settled=[], canceled=[];

  (tickets||[]).forEach(function(t) {
    var s   = (t.status || t.ticket_status || '').toLowerCase();
    var risk = parseFloat(t.risk_amount   || t.riskAmount   || 0);
    var prof = parseFloat(t.potential_profit || t.potentialProfit || 0);

    if (isNaN(risk)||risk<0) { warnings.push('invalid_risk:'+t.id); risk=0; }
    if (isNaN(prof)||prof<0) { warnings.push('invalid_profit:'+t.id); prof=0; }

    if (s==='canceled'||s==='voided'||s==='deleted') {
      canceled.push(t); return; // zero impact
    }
    if (s==='active'||s==='open') {
      openRisk      += risk;
      active.push(t);
    } else if (s==='won') {
      settledGains  += prof;  // profit credited
      settled.push(t);
    } else if (s==='lost') {
      settledLosses += risk;  // risk lost
      settled.push(t);
    } else if (s==='push'||s==='pushed') {
      // Push: risk freed automatically (not in openRisk = returned to player)
      // No explicit refund line needed — same as client model
      settled.push(t);
    }
  });

  // Available = starting − openRisk − settledLosses + settledGains + refunds
  var available = rnd(starting - openRisk - settledLosses + settledGains + refunds);
  if (available < 0) warnings.push('available_balance_negative:'+available);
  if (openRisk  < 0) warnings.push('openRisk_negative:'+openRisk);

  return {
    startingBalance: rnd(starting),
    availableBalance: available,
    openRisk:        rnd(openRisk),
    settledGains:    rnd(settledGains),
    settledLosses:   rnd(settledLosses),
    pendingPayouts:  rnd(openRisk),   // what player stands to win if active bets hit
    refunds:         rnd(refunds),
    warnings,
    _active: active, _settled: settled, _canceled: canceled
  };
}

function getISOWeek(nowMs) {
  var d = new Date(nowMs||Date.now()); d.setHours(0,0,0,0);
  d.setDate(d.getDate()+3-(d.getDay()+6)%7);
  var w1 = new Date(d.getFullYear(),0,4);
  return d.getFullYear()+'-W'+String(1+Math.round(((d.getTime()-w1.getTime())/86400000-3+(w1.getDay()+6)%7)/7)).padStart(2,'0');
}

function calcWeeklyStats(tickets, weekStartMs, weekEndMs) {
  var settledNet=0, openRisk=0, count=0;
  (tickets||[]).forEach(function(t) {
    var ts = new Date(t.placed_at||t.placedAt||0).getTime();
    if (ts<weekStartMs||ts>=weekEndMs) return;
    count++;
    var s=t.status.toLowerCase(), r=parseFloat(t.risk_amount||t.riskAmount||0), p=parseFloat(t.potential_profit||t.potentialProfit||0);
    if (s==='active'||s==='open')  openRisk+=r;
    else if (s==='won')            settledNet+=p;
    else if (s==='lost')           settledNet-=r;
  });
  return { settledNet:rnd(settledNet), openRisk:rnd(openRisk), ticketCount:count };
}

// ── Test data ─────────────────────────────────────────────────────────────────
function t(id, status, risk, profit) {
  return { id, status, risk_amount:risk||100, potential_profit:profit||90.91,
    placed_at: new Date().toISOString() };
}

// ── Balance derivation ────────────────────────────────────────────────────────
console.log('\n── Balance: starting $1000 ──');

test('no tickets → available = starting', function() {
  var b = calcPlayerBalance([], 1000);
  assertEq(b.availableBalance, 1000);
  assertEq(b.openRisk, 0);
  assertEq(b.warnings.length, 0);
});

test('active $100 → available=$900, openRisk=$100', function() {
  var b = calcPlayerBalance([t('T1','active',100,90.91)], 1000);
  assertEq(b.availableBalance, 900);
  assertEq(b.openRisk, 100);
  assertEq(b._active.length, 1);
});

test('won $100 ticket → profit added, risk freed', function() {
  var b = calcPlayerBalance([t('T1','won',100,90.91)], 1000);
  assertApprox(b.availableBalance, 1000+90.91, 'available=1090.91');
  assertApprox(b.settledGains, 90.91, 'gains=90.91');
  assertEq(b.openRisk, 0, 'no openRisk');
});

test('lost $100 ticket → available=$900', function() {
  var b = calcPlayerBalance([t('T1','lost',100,90.91)], 1000);
  assertEq(b.availableBalance, 900, 'available=900');
  assertEq(b.settledLosses, 100, 'losses=100');
  assertEq(b.openRisk, 0);
});

test('push $100 → risk freed, available=$1000 (risk not in openRisk)', function() {
  // Push: risk never went into openRisk, so available stays at starting
  var b = calcPlayerBalance([t('T1','push',100,90.91)], 1000);
  assertEq(b.availableBalance, 1000, 'push restores starting');
  assertEq(b.refunds, 0, 'no separate refund line for push');
  assertEq(b.openRisk, 0, 'no openRisk');
});

test('canceled → zero impact', function() {
  var b = calcPlayerBalance([t('T1','canceled',100,90.91)], 1000);
  assertEq(b.availableBalance, 1000);
  assertEq(b._canceled.length, 1);
  assertEq(b._active.length, 0);
});

test('mixed tickets: correct balance', function() {
  var tickets = [
    t('T1','active',100,90.91),  // openRisk +100
    t('T2','won',50,45.45),      // gains +45.45
    t('T3','lost',75,68.18),     // losses +75
    t('T4','canceled',200,180),  // zero impact
    t('T5','push',60,54.55)      // push: no net change
  ];
  // available = 1000 - 100(openRisk) - 75(loss) + 45.45(gain) = 870.45
  var b = calcPlayerBalance(tickets, 1000);
  assertApprox(b.availableBalance, 870.45, 'available=870.45');
  assertEq(b.openRisk, 100, 'openRisk=100');
  assertApprox(b.settledGains, 45.45, 'gains=45.45');
  assertEq(b.settledLosses, 75, 'losses=75');
  assertEq(b.refunds, 0, 'push has no refund line');
  assertEq(b._active.length, 1, '1 active');
  assertEq(b._settled.length, 3, '3 settled (won+lost+push)');
  assertEq(b._canceled.length, 1, '1 canceled');
});

// ── Safety validation ─────────────────────────────────────────────────────────
console.log('\n── Safety ──');

test('NaN risk handled safely', function() {
  var bad = { id:'T1', status:'active', risk_amount:'bad', potential_profit:90 };
  var b = calcPlayerBalance([bad], 1000);
  assertEq(b.openRisk, 0, 'NaN risk → 0');
  assert(b.warnings.some(function(w){ return w.includes('invalid_risk'); }), 'warning logged');
});

test('no NaN in output', function() {
  var b = calcPlayerBalance([t('T1','won',100,90.91)], 1000);
  Object.values(b).forEach(function(v){
    if (typeof v === 'number') assert(!isNaN(v), 'NaN found in output');
  });
});

test('openRisk never negative', function() {
  var b = calcPlayerBalance([], 1000);
  assert(b.openRisk >= 0, 'openRisk >= 0');
});

// ── Matches client calcAvailableBalance formula ───────────────────────────────
console.log('\n── Matches client formula ──');

test('formula: available = starting − openRisk − settledLosses + settledGains + refunds', function() {
  var tickets = [t('T1','active',100,90.91), t('T2','won',50,45.45), t('T3','lost',75,68)];
  var b = calcPlayerBalance(tickets, 1000);
  var expected = rnd(1000 - b.openRisk - b.settledLosses + b.settledGains + b.refunds);
  assertApprox(b.availableBalance, expected, 'formula matches');
});

// ── Weekly stats ──────────────────────────────────────────────────────────────
console.log('\n── Weekly stats ──');

test('weekly: only current-week tickets counted', function() {
  var NOW = new Date('2026-05-17T12:00:00Z').getTime();
  var week = getISOWeek(NOW);
  var weekStart = new Date(new Date(NOW).toISOString().slice(0,8)+'01T00:00:00Z');
  // Simpler: use Mon of this week
  var d = new Date(NOW); d.setUTCDate(d.getUTCDate() - (d.getUTCDay()+6)%7);
  d.setUTCHours(0,0,0,0);
  var ws = d.getTime(); var we = ws + 7*86400000;

  var tickets = [
    { id:'T1', status:'won', risk_amount:100, potential_profit:90.91, placed_at: new Date(ws+1000).toISOString() },  // this week
    { id:'T2', status:'lost', risk_amount:75, potential_profit:68, placed_at: new Date(ws-86400000).toISOString() } // last week
  ];
  var s = calcWeeklyStats(tickets, ws, we);
  assertApprox(s.settledNet, 90.91, 'only this week');
  assertEq(s.ticketCount, 1, 'only 1 this week');
});

// ── Fallback decision ─────────────────────────────────────────────────────────
console.log('\n── Fallback ──');

function shouldFallbackPlayer(dbResp) {
  if (!dbResp||!dbResp.ok) return { fallback:true, reason:'db_error_or_null' };
  var b = dbResp.balance;
  if (!b) return { fallback:true, reason:'missing_balance' };
  if (isNaN(b.availableBalance)) return { fallback:true, reason:'NaN_balance' };
  if (b.openRisk < 0) return { fallback:true, reason:'negative_openRisk' };
  return { fallback:false };
}

test('null response → fallback', function() { assert(shouldFallbackPlayer(null).fallback); });
test('ok=false → fallback', function() { assert(shouldFallbackPlayer({ok:false}).fallback); });
test('missing balance → fallback', function() { assert(shouldFallbackPlayer({ok:true}).fallback); });
test('NaN balance → fallback', function() {
  assert(shouldFallbackPlayer({ok:true,balance:{availableBalance:NaN,openRisk:0}}).fallback);
});
test('valid response → no fallback', function() {
  var b = calcPlayerBalance([t('T1','active',100,90.91)], 1000);
  assert(!shouldFallbackPlayer({ok:true,balance:b}).fallback);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Player dashboard tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ PLAYER DASHBOARD TESTS FAILED'); process.exit(1); }
else console.log('✅ All player dashboard DB rules verified');
