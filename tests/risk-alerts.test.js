/**
 * PocketBooks Sports — Phase V: Fraud/Abuse Signals — Risk Alerts Tests
 * Run: node tests/risk-alerts.test.js
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

// ── Alert model ───────────────────────────────────────────────────────────────

const VALID_ALERT_TYPES = new Set([
  'rapid_bet_velocity','repeated_rate_limit','repeated_failed_auth',
  'odds_change_rejections','stale_line_attempts','large_payout_attempt',
  'over_limit_attempt','repeated_cancel_attempts',
  'settlement_overpayment_attempt','manual_override_used'
]);
const VALID_SEVERITIES = new Set(['low','medium','high']);
const VALID_STATUSES   = new Set(['open','acknowledged','dismissed']);

const COALESCE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

// Threshold → severity mapping
const SEVERITY_THRESHOLDS = {
  rapid_bet_velocity:             { medium:5, high:10 },
  repeated_rate_limit:            { medium:3, high:10 },
  repeated_failed_auth:           { medium:3, high:8  },
  odds_change_rejections:         { medium:3, high:8  },
  stale_line_attempts:            { medium:3, high:8  },
  large_payout_attempt:           { medium:1, high:3  },
  over_limit_attempt:             { medium:2, high:5  },
  repeated_cancel_attempts:       { medium:4, high:8  },
  settlement_overpayment_attempt: { medium:1, high:3  },
  manual_override_used:           { medium:1, high:3  }
};

function calcSeverity(type, count) {
  var thr = SEVERITY_THRESHOLDS[type];
  if (!thr) return 'low';
  if (count >= thr.high)   return 'high';
  if (count >= thr.medium) return 'medium';
  return 'low';
}

// ── In-memory alert store ─────────────────────────────────────────────────────

function makeAlertStore() {
  const rows = {};  // key = clubId+'|'+actorId+'|'+type
  return {
    key: function(clubId, actorId, type) { return (clubId||'')+'|'+(actorId||'')+'|'+type; },
    get: function(clubId, actorId, type) { return rows[this.key(clubId,actorId,type)]||null; },
    set: function(alert) { rows[this.key(alert.clubId,alert.actorId,alert.type)]=alert; },
    all: function()      { return Object.values(rows); },
    forClub: function(clubId) {
      return Object.values(rows).filter(function(a){ return a.clubId===clubId; });
    }
  };
}

// Coalescing emitter: increment count on existing open alert within window, else create new
function emitRiskAlert(store, type, clubId, actorId, metadata, nowMs) {
  if (!VALID_ALERT_TYPES.has(type)) return { ok:false, error:'invalid_alert_type' };
  nowMs = nowMs||Date.now();
  const now = new Date(nowMs).toISOString();
  const existing = store.get(clubId, actorId, type);

  if (existing && existing.status === 'open' &&
      (nowMs - new Date(existing.firstSeenAt).getTime()) < COALESCE_WINDOW_MS) {
    // Coalesce: increment count, update severity + lastSeen
    existing.count++;
    existing.severity  = calcSeverity(type, existing.count);
    existing.lastSeenAt= now;
    existing.updatedAt = now;
    if (metadata) existing.metadataJson = Object.assign({}, existing.metadataJson, metadata);
    store.set(existing);
    return { ok:true, coalesced:true, alertId:existing.alertId, count:existing.count,
             severity:existing.severity };
  }

  // New alert
  const alertId = 'ALERT_'+type+'_'+(actorId||'?')+'_'+nowMs;
  const alert = {
    alertId, clubId, actorId, type,
    severity:   calcSeverity(type, 1),
    status:     'open',
    count:      1,
    firstSeenAt:now, lastSeenAt:now,
    metadataJson:metadata||{},
    createdAt:  now, updatedAt:now
  };
  store.set(alert);
  return { ok:true, coalesced:false, alertId, count:1, severity:alert.severity };
}

function ackAlert(store, clubId, actorId, type) {
  const alert = store.get(clubId, actorId, type);
  if (!alert) return { ok:false, error:'alert_not_found' };
  if (alert.status !== 'open') return { ok:false, error:'alert_not_open', status:alert.status };
  alert.status    = 'acknowledged';
  alert.updatedAt = new Date().toISOString();
  store.set(alert);
  return { ok:true };
}

function dismissAlert(store, clubId, actorId, type) {
  const alert = store.get(clubId, actorId, type);
  if (!alert) return { ok:false, error:'alert_not_found' };
  alert.status    = 'dismissed';
  alert.updatedAt = new Date().toISOString();
  store.set(alert);
  return { ok:true };
}

// Access check: player cannot view alerts
function canViewAlerts(role) {
  const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };
  return (ROLE_RANK[role]||0) >= ROLE_RANK.full_admin;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── emitRiskAlert: create ──');

test('creates new alert with count=1', function() {
  var store = makeAlertStore();
  var r = emitRiskAlert(store,'rapid_bet_velocity','C1','P1',{ stake:100 });
  assert(r.ok,'ok: '+(r.error||''));
  assert(!r.coalesced,'not coalesced');
  assertEq(r.count,1);
  assertEq(store.forClub('C1').length,1);
});
test('invalid alert type rejected', function() {
  var r = emitRiskAlert(makeAlertStore(),'hack_db','C1','P1');
  assert(!r.ok); assertEq(r.error,'invalid_alert_type');
});
test('all valid alert types accepted', function() {
  var store = makeAlertStore();
  var now = Date.now();
  var failed = [];
  VALID_ALERT_TYPES.forEach(function(t){
    var r = emitRiskAlert(store,t,'C1','A_'+t,{},now);
    if(!r.ok) failed.push(t);
  });
  assertEq(failed.length,0,'failed types: '+failed.join(','));
});

console.log('\n── emitRiskAlert: coalesce ──');

test('second alert same type/actor coalesces within 24h', function() {
  var store = makeAlertStore();
  var now = Date.now();
  emitRiskAlert(store,'rapid_bet_velocity','C1','P1',{},now);
  var r2 = emitRiskAlert(store,'rapid_bet_velocity','C1','P1',{},now+1000);
  assert(r2.coalesced,'coalesced');
  assertEq(r2.count,2);
  assertEq(store.forClub('C1').length,1,'still 1 alert row');
});
test('repeated rate limits coalesce into one alert', function() {
  var store = makeAlertStore();
  var now = Date.now();
  for (var i=0;i<5;i++) emitRiskAlert(store,'repeated_rate_limit','C1','P1',{},now+i*1000);
  var alert = store.get('C1','P1','repeated_rate_limit');
  assertEq(alert.count,5);
});
test('after 24h window: new alert created instead of coalescing', function() {
  var store = makeAlertStore();
  var t0  = new Date('2026-05-17T00:00:00Z').getTime();
  var t1  = t0 + 25*60*60*1000; // 25h later
  emitRiskAlert(store,'rapid_bet_velocity','C1','P1',{},t0);
  var r2 = emitRiskAlert(store,'rapid_bet_velocity','C1','P1',{},t1);
  assert(!r2.coalesced,'not coalesced after 24h');
  assertEq(r2.count,1,'fresh count');
});
test('different actor does not coalesce', function() {
  var store = makeAlertStore();
  var now = Date.now();
  emitRiskAlert(store,'rapid_bet_velocity','C1','P1',{},now);
  var r2 = emitRiskAlert(store,'rapid_bet_velocity','C1','P2',{},now);
  assert(!r2.coalesced,'different actor = no coalesce');
  assertEq(store.forClub('C1').length,2,'2 separate alerts');
});

console.log('\n── Severity thresholds ──');

test('1 large_payout_attempt → medium', function() {
  var store = makeAlertStore();
  var r = emitRiskAlert(store,'large_payout_attempt','C1','P1',{ payout:6000 });
  assertEq(r.severity,'medium');
});
test('3 large_payout_attempts → high', function() {
  var store = makeAlertStore();
  var now = Date.now();
  for (var i=0;i<3;i++) emitRiskAlert(store,'large_payout_attempt','C1','P1',{},now+i*1000);
  assertEq(store.get('C1','P1','large_payout_attempt').severity,'high');
});
test('1 rapid_bet_velocity → low (below medium threshold of 5)', function() {
  var r = emitRiskAlert(makeAlertStore(),'rapid_bet_velocity','C1','P1',{});
  assertEq(r.severity,'low');
});
test('5 rapid_bet_velocity events → medium', function() {
  var store = makeAlertStore(); var now = Date.now();
  for (var i=0;i<5;i++) emitRiskAlert(store,'rapid_bet_velocity','C1','P1',{},now+i*100);
  assertEq(store.get('C1','P1','rapid_bet_velocity').severity,'medium');
});
test('10+ rapid_bet_velocity → high', function() {
  var store = makeAlertStore(); var now = Date.now();
  for (var i=0;i<10;i++) emitRiskAlert(store,'rapid_bet_velocity','C1','P1',{},now+i*100);
  assertEq(store.get('C1','P1','rapid_bet_velocity').severity,'high');
});
test('manual_override_used 1st occurrence → medium', function() {
  assertEq(emitRiskAlert(makeAlertStore(),'manual_override_used','C1','H1',{}).severity,'medium');
});

console.log('\n── Specific detection scenarios ──');

test('odds_change rejection creates odds_change_rejections alert', function() {
  var store = makeAlertStore();
  var r = emitRiskAlert(store,'odds_change_rejections','C1','P1',{ submitted:-95, server:-110 });
  assert(r.ok); assertEq(store.get('C1','P1','odds_change_rejections').count,1);
});
test('overpayment creates settlement_overpayment_attempt alert', function() {
  var r = emitRiskAlert(makeAlertStore(),'settlement_overpayment_attempt','C1','H1',{ attempted:200, remaining:50 });
  assert(r.ok); assertEq(r.severity,'medium');
});
test('manual override creates manual_override_used alert at medium', function() {
  var r = emitRiskAlert(makeAlertStore(),'manual_override_used','C1','H1',{ ticketId:'T1', result:'won' });
  assert(r.ok); assertEq(r.severity,'medium');
});
test('over_limit_attempt count=5 → high', function() {
  var store = makeAlertStore(); var now = Date.now();
  for (var i=0;i<5;i++) emitRiskAlert(store,'over_limit_attempt','C1','P1',{},now+i*100);
  assertEq(store.get('C1','P1','over_limit_attempt').severity,'high');
});

console.log('\n── ackAlert / dismissAlert ──');

test('ack open alert succeeds', function() {
  var store = makeAlertStore();
  emitRiskAlert(store,'rapid_bet_velocity','C1','P1',{});
  var r = ackAlert(store,'C1','P1','rapid_bet_velocity');
  assert(r.ok); assertEq(store.get('C1','P1','rapid_bet_velocity').status,'acknowledged');
});
test('ack already-acknowledged → error', function() {
  var store = makeAlertStore();
  emitRiskAlert(store,'rapid_bet_velocity','C1','P1',{});
  ackAlert(store,'C1','P1','rapid_bet_velocity');
  var r = ackAlert(store,'C1','P1','rapid_bet_velocity');
  assertEq(r.error,'alert_not_open');
});
test('dismiss sets status=dismissed', function() {
  var store = makeAlertStore();
  emitRiskAlert(store,'rapid_bet_velocity','C1','P1',{});
  dismissAlert(store,'C1','P1','rapid_bet_velocity');
  assertEq(store.get('C1','P1','rapid_bet_velocity').status,'dismissed');
});
test('ack not-found → error', function() {
  var r = ackAlert(makeAlertStore(),'C1','P1','rapid_bet_velocity');
  assertEq(r.error,'alert_not_found');
});

console.log('\n── Access control ──');

test('full_admin can view alerts', function() {
  assert(canViewAlerts('full_admin'));
});
test('owner can view alerts', function() {
  assert(canViewAlerts('owner'));
});
test('settlement_manager cannot view alerts', function() {
  assert(!canViewAlerts('settlement_manager'));
});
test('player cannot view alerts', function() {
  assert(!canViewAlerts('player'));
});
test('risk_viewer cannot view alerts', function() {
  assert(!canViewAlerts('risk_viewer'));
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Risk alert tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ RISK ALERT TESTS FAILED'); process.exit(1); }
else console.log('✅ All risk alert rules verified');
