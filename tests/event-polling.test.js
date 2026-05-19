/**
 * PocketBooks Sports — Phase T: Real-Time Status Updates — Polling Bus Tests
 * Run: node tests/event-polling.test.js
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

// ── Event types ───────────────────────────────────────────────────────────────
const VALID_EVENT_TYPES = new Set([
  'ticket_placed','ticket_canceled','ticket_graded',
  'balance_changed','odds_refreshed','result_refreshed',
  'settlement_closed','payment_confirmed','payment_voided',
  'job_completed','job_failed','risk_limit_changed'
]);

// ── In-memory event store ─────────────────────────────────────────────────────
let _evSeq = 0;
function makeEventStore() {
  const rows = [];
  return {
    append: function(ev) { rows.push(ev); },
    all:    function()   { return rows.slice(); },
    count:  function()   { return rows.length; },
    since:  function(cursor) {
      if (!cursor) return rows.slice();
      return rows.filter(function(r){ return r.eventId > cursor || r.createdAt > cursor; });
    }
  };
}

// ── emitEvent ─────────────────────────────────────────────────────────────────
function emitEvent(store, type, payload, scope) {
  if (!VALID_EVENT_TYPES.has(type)) return { ok:false, error:'invalid_event_type:'+type };
  scope = scope||{};
  const ev = {
    eventId:    'EV_'+(++_evSeq)+'_'+Date.now(),
    clubId:     scope.clubId||null,
    actorId:    scope.actorId||null,
    playerId:   scope.playerId||null,
    type,
    payloadJson:payload||{},
    createdAt:  new Date().toISOString()
  };
  store.append(ev);
  return { ok:true, eventId:ev.eventId };
}

// ── Access control for /api/events ────────────────────────────────────────────

const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };

// Club-wide event types (visible to all club members)
const CLUB_WIDE_TYPES = new Set([
  'odds_refreshed','result_refreshed','settlement_closed',
  'job_completed','job_failed','risk_limit_changed'
]);
// Player-private event types (only own playerId)
const PLAYER_PRIVATE_TYPES = new Set([
  'ticket_placed','ticket_canceled','ticket_graded',
  'balance_changed','payment_confirmed','payment_voided'
]);

function filterEventsForActor(events, actor) {
  if (actor.platformRole==='platform_admin') return events; // cross-club access
  if (!actor.clubId) return [];
  return events.filter(function(ev) {
    // Must be same club
    if (ev.clubId && ev.clubId !== actor.clubId) return false;
    const rank = ROLE_RANK[actor.role]||0;
    // risk_viewer+ sees all club events
    if (rank >= ROLE_RANK.risk_viewer) return true;
    // player sees club-wide events + own private events
    if (CLUB_WIDE_TYPES.has(ev.type)) return true;
    if (PLAYER_PRIVATE_TYPES.has(ev.type) && ev.playerId === actor.actorId) return true;
    return false;
  });
}

// ── Cursor/since logic ────────────────────────────────────────────────────────

function buildEventResponse(events, since, serverTime) {
  const filtered = since
    ? events.filter(function(e){ return e.eventId > since || e.createdAt > since; })
    : events;
  const latest = filtered.length ? filtered[filtered.length-1].eventId : (since||null);
  return { events:filtered, latestCursor:latest, serverTime:serverTime||new Date().toISOString() };
}

// ── Frontend poller model ─────────────────────────────────────────────────────

const POLLER_INTERVAL_MS = 12000; // 12s
const FRONTEND_EVENT_ACTIONS = {
  ticket_graded:     ['refresh_my_bets','refresh_balance'],
  balance_changed:   ['refresh_balance'],
  odds_refreshed:    ['refresh_market_banner'],
  payment_confirmed: ['refresh_settlement_period'],
  payment_voided:    ['refresh_settlement_period'],
  job_failed:        ['warn_health_badge'],
  job_completed:     [],
  ticket_placed:     ['refresh_my_bets','refresh_balance'],
  ticket_canceled:   ['refresh_my_bets','refresh_balance'],
  settlement_closed: ['refresh_settlement_list'],
  result_refreshed:  [],
  risk_limit_changed:[]
};

function dispatchFrontendActions(events) {
  const actionSet = new Set();
  (events||[]).forEach(function(ev) {
    const actions = FRONTEND_EVENT_ACTIONS[ev.type]||[];
    actions.forEach(function(a){ actionSet.add(a); });
  });
  return [...actionSet];
}

// Retention: drop events older than 7 days or beyond 10k per club
const RETENTION_DAYS = 7;
const RETENTION_MAX  = 10000;

function applyRetention(events, clubId) {
  const cutoff = new Date(Date.now()-RETENTION_DAYS*86400000).toISOString();
  let filtered = events.filter(function(e){ return (!clubId||e.clubId===clubId) && e.createdAt>=cutoff; });
  if (filtered.length > RETENTION_MAX) filtered = filtered.slice(filtered.length-RETENTION_MAX);
  return filtered;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── emitEvent ──');

test('valid event emitted', function() {
  var store = makeEventStore();
  var r = emitEvent(store,'ticket_placed',{ ticketId:'T1' },{ clubId:'C1', playerId:'P1' });
  assert(r.ok,'ok: '+(r.error||''));
  assertEq(store.count(),1);
  assertEq(store.all()[0].type,'ticket_placed');
  assertEq(store.all()[0].playerId,'P1');
});
test('all valid event types accepted', function() {
  var store = makeEventStore();
  var failed = [];
  VALID_EVENT_TYPES.forEach(function(t){
    var r = emitEvent(store,t,{},{ clubId:'C1' });
    if (!r.ok) failed.push(t);
  });
  assertEq(failed.length,0,'failed types: '+failed.join(','));
});
test('invalid event type rejected', function() {
  var r = emitEvent(makeEventStore(),'hack_db',{});
  assert(!r.ok); assert(r.error.includes('invalid_event_type'));
});
test('event has eventId and createdAt', function() {
  var store = makeEventStore();
  emitEvent(store,'job_completed',{},{ clubId:'C1' });
  var ev = store.all()[0];
  assert(ev.eventId,'has eventId');
  assert(ev.createdAt,'has createdAt');
});

console.log('\n── Access control ──');

function actor(role, actorId, clubId, platformRole) {
  return { role, actorId:actorId||'A1', clubId:clubId||'C1', platformRole:platformRole||null };
}

test('player sees own private events', function() {
  var store = makeEventStore();
  emitEvent(store,'ticket_graded',{},{clubId:'C1',playerId:'P1'});
  emitEvent(store,'ticket_graded',{},{clubId:'C1',playerId:'P2'});
  var evs = filterEventsForActor(store.all(), actor('player','P1','C1'));
  assertEq(evs.length,1,'only own'); assertEq(evs[0].playerId,'P1');
});
test('player sees club-wide odds/result events', function() {
  var store = makeEventStore();
  emitEvent(store,'odds_refreshed',{},{clubId:'C1'});
  emitEvent(store,'result_refreshed',{},{clubId:'C1'});
  var evs = filterEventsForActor(store.all(), actor('player','P1','C1'));
  assertEq(evs.length,2,'sees club-wide');
});
test('player does not see another player private event', function() {
  var store = makeEventStore();
  emitEvent(store,'balance_changed',{},{clubId:'C1',playerId:'P2'});
  var evs = filterEventsForActor(store.all(), actor('player','P1','C1'));
  assertEq(evs.length,0);
});
test('risk_viewer sees all club events', function() {
  var store = makeEventStore();
  emitEvent(store,'ticket_placed',{},{clubId:'C1',playerId:'P1'});
  emitEvent(store,'balance_changed',{},{clubId:'C1',playerId:'P2'});
  emitEvent(store,'odds_refreshed',{},{clubId:'C1'});
  var evs = filterEventsForActor(store.all(), actor('risk_viewer','R1','C1'));
  assertEq(evs.length,3,'sees all club events');
});
test('cross-club event blocked for non-platform_admin', function() {
  var store = makeEventStore();
  emitEvent(store,'odds_refreshed',{},{clubId:'C2'});
  var evs = filterEventsForActor(store.all(), actor('owner','H1','C1'));
  assertEq(evs.length,0,'C1 actor cannot see C2 event');
});
test('platform_admin sees cross-club events', function() {
  var store = makeEventStore();
  emitEvent(store,'odds_refreshed',{},{clubId:'C1'});
  emitEvent(store,'odds_refreshed',{},{clubId:'C2'});
  var evs = filterEventsForActor(store.all(), actor('owner','PA','C1','platform_admin'));
  assertEq(evs.length,2,'platform_admin sees both');
});
test('no clubId actor → empty', function() {
  var store = makeEventStore();
  emitEvent(store,'odds_refreshed',{},{clubId:'C1'});
  var a = { role:'owner', actorId:'X', clubId:null, platformRole:null };
  assertEq(filterEventsForActor(store.all(),a).length,0);
});

console.log('\n── buildEventResponse (cursor) ──');

test('no cursor returns all events', function() {
  var store = makeEventStore();
  emitEvent(store,'job_completed',{},{clubId:'C1'});
  emitEvent(store,'job_completed',{},{clubId:'C1'});
  var r = buildEventResponse(store.all(), null);
  assertEq(r.events.length,2);
  assert(r.serverTime,'has serverTime');
});
test('cursor filters to newer events', function() {
  var store = makeEventStore();
  emitEvent(store,'job_completed',{},{clubId:'C1'});
  var cursor = store.all()[0].eventId;
  emitEvent(store,'odds_refreshed',{},{clubId:'C1'});
  var r = buildEventResponse(store.all(), cursor);
  assertEq(r.events.length,1);
  assertEq(r.events[0].type,'odds_refreshed');
});
test('latestCursor updated to last event', function() {
  var store = makeEventStore();
  emitEvent(store,'job_completed',{},{clubId:'C1'});
  emitEvent(store,'odds_refreshed',{},{clubId:'C1'});
  var r = buildEventResponse(store.all(), null);
  assertEq(r.latestCursor, store.all()[1].eventId);
});

console.log('\n── Frontend dispatch ──');

test('ticket_graded triggers refresh_my_bets + refresh_balance', function() {
  var actions = dispatchFrontendActions([{ type:'ticket_graded' }]);
  assert(actions.includes('refresh_my_bets'),'has refresh_my_bets');
  assert(actions.includes('refresh_balance'),'has refresh_balance');
});
test('payment_confirmed triggers refresh_settlement_period', function() {
  var actions = dispatchFrontendActions([{ type:'payment_confirmed' }]);
  assert(actions.includes('refresh_settlement_period'));
});
test('job_failed triggers warn_health_badge', function() {
  assert(dispatchFrontendActions([{ type:'job_failed' }]).includes('warn_health_badge'));
});
test('multiple events deduplicate actions', function() {
  var actions = dispatchFrontendActions([{ type:'ticket_graded' },{ type:'balance_changed' }]);
  // refresh_balance should appear once even though both emit it
  var balCount = actions.filter(function(a){ return a==='refresh_balance'; }).length;
  assertEq(balCount,1,'deduplicated');
});
test('odds_refreshed triggers refresh_market_banner', function() {
  assert(dispatchFrontendActions([{ type:'odds_refreshed' }]).includes('refresh_market_banner'));
});

console.log('\n── Retention ──');

test('old events pruned', function() {
  var events = [];
  var old = new Date(Date.now()-8*86400000).toISOString(); // 8 days ago
  for (var i=0;i<5;i++) events.push({ clubId:'C1', createdAt:old, eventId:'EV_old_'+i });
  events.push({ clubId:'C1', createdAt:new Date().toISOString(), eventId:'EV_new_1' });
  var kept = applyRetention(events,'C1');
  assertEq(kept.length,1,'only fresh event kept');
});
test('events beyond 10k capped', function() {
  var events = [];
  var now = new Date().toISOString();
  for (var i=0;i<10005;i++) events.push({ clubId:'C1', createdAt:now, eventId:'EV_'+i });
  var kept = applyRetention(events,'C1');
  assertEq(kept.length,10000,'capped at 10k');
});
test('different club events not pruned by other club retention', function() {
  var events = [
    { clubId:'C1', createdAt:new Date().toISOString(), eventId:'E1' },
    { clubId:'C2', createdAt:new Date().toISOString(), eventId:'E2' }
  ];
  var kept = applyRetention(events,'C1');
  assertEq(kept.length,1,'only C1 events');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Event polling tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ EVENT POLLING TESTS FAILED'); process.exit(1); }
else console.log('✅ All event polling rules verified');
