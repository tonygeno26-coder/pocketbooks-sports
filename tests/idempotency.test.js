/**
 * PocketBooks Sports — Phase E: Idempotency + Replay Protection Tests
 * Run: node tests/idempotency.test.js
 * Pure logic — no network, no DB.
 */
'use strict';

const crypto = require('crypto');

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Idempotency engine (pure functions mirroring backend) ─────────────────────

const KEY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Canonicalize + hash request body (key-order independent)
function hashRequest(endpoint, actorId, clubId, body) {
  const canonical = JSON.stringify({
    endpoint,
    actorId,
    clubId: clubId || '',
    body: sortKeys(body || {})
  });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce(function(acc, k) {
      acc[k] = sortKeys(obj[k]); return acc;
    }, {});
  }
  return obj;
}

// In-memory idempotency store (mirrors the DB table)
function makeStore() {
  const rows = {};
  return {
    get: function(key) { return rows[key] || null; },
    set: function(key, row) { rows[key] = row; },
    count: function() { return Object.keys(rows).length; },
    all: function() { return Object.values(rows); }
  };
}

const IDEMPOTENCY_ENDPOINTS = new Set([
  '/api/bets/place', '/api/bets/cancel',
  '/api/host/settle-player', '/api/host/weekly-rollover',
  '/api/grade/run', '/api/markets/refresh'
]);

// Process an idempotent request
// Returns: { action:'execute'|'replay'|'conflict'|'in_progress', existingRow? }
function processIdempotentRequest(store, key, endpoint, actorId, clubId, body, nowMs) {
  nowMs = nowMs || Date.now();

  // No key provided — not an idempotency-required endpoint check
  if (!key) return { action:'execute', warn:'no_idempotency_key' };

  const reqHash = hashRequest(endpoint, actorId, clubId, body);
  const existing = store.get(key);

  if (!existing) {
    // First time — reserve the key as pending
    const row = {
      idempotencyKey: key, actorId, clubId: clubId||'', endpoint,
      requestHash: reqHash, status: 'pending',
      responseStatus: null, responseBody: null,
      createdAt: new Date(nowMs).toISOString(),
      completedAt: null,
      expiresAt: new Date(nowMs + KEY_TTL_MS).toISOString()
    };
    store.set(key, row);
    return { action:'execute', row };
  }

  // Key expired?
  if (existing.expiresAt && nowMs > new Date(existing.expiresAt).getTime()) {
    // Treat as fresh — remove expired row and re-execute
    store.set(key, null);
    return { action:'execute', warn:'key_expired_reused' };
  }

  // Actor/club mismatch — different actor trying to use same key
  if (existing.actorId !== actorId) {
    return { action:'conflict', reason:'actor_mismatch',
             existingActorId: existing.actorId };
  }
  if (existing.clubId !== (clubId||'')) {
    return { action:'conflict', reason:'club_mismatch',
             existingClubId: existing.clubId };
  }

  // Request hash mismatch — same key, different body
  if (existing.requestHash !== reqHash) {
    return { action:'conflict', reason:'body_mismatch',
             existingHash: existing.requestHash, newHash: reqHash };
  }

  // Still pending — in-flight duplicate
  if (existing.status === 'pending') {
    return { action:'in_progress', existingRow: existing };
  }

  // Completed — replay stored response
  if (existing.status === 'completed' || existing.status === 'failed') {
    return { action:'replay', existingRow: existing };
  }

  return { action:'execute' };
}

// Mark a row as completed after execution
function completeIdempotentRequest(store, key, responseStatus, responseBody) {
  const row = store.get(key);
  if (!row) return;
  row.status = responseStatus >= 200 && responseStatus < 300 ? 'completed' : 'failed';
  row.responseStatus = responseStatus;
  row.responseBody = responseBody;
  row.completedAt = new Date().toISOString();
  store.set(key, row);
}

// Generate a random idempotency key
function generateIdempotencyKey(prefix) {
  return (prefix||'IK') + '_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex');
}

// ── hashRequest ───────────────────────────────────────────────────────────────
console.log('\n── hashRequest ──');

test('same body different key order → same hash', function() {
  var h1 = hashRequest('/api/bets/place','P1','C1',{stake:100,betType:'Single',playerId:'P1'});
  var h2 = hashRequest('/api/bets/place','P1','C1',{playerId:'P1',betType:'Single',stake:100});
  assertEq(h1, h2, 'key-order independent');
});
test('different body → different hash', function() {
  var h1 = hashRequest('/api/bets/place','P1','C1',{stake:100});
  var h2 = hashRequest('/api/bets/place','P1','C1',{stake:200});
  assert(h1 !== h2, 'different stake → different hash');
});
test('different endpoint → different hash', function() {
  var h1 = hashRequest('/api/bets/place','P1','C1',{stake:100});
  var h2 = hashRequest('/api/bets/cancel','P1','C1',{stake:100});
  assert(h1 !== h2);
});
test('different actorId → different hash', function() {
  var h1 = hashRequest('/api/bets/place','P1','C1',{stake:100});
  var h2 = hashRequest('/api/bets/place','P2','C1',{stake:100});
  assert(h1 !== h2);
});
test('different clubId → different hash', function() {
  var h1 = hashRequest('/api/bets/place','P1','C1',{});
  var h2 = hashRequest('/api/bets/place','P1','C2',{});
  assert(h1 !== h2);
});

// ── First request ─────────────────────────────────────────────────────────────
console.log('\n── First request ──');

test('first request returns execute', function() {
  var store = makeStore();
  var r = processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',{stake:100});
  assertEq(r.action,'execute');
});
test('first request reserves key as pending', function() {
  var store = makeStore();
  processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',{stake:100});
  var row = store.get('K1');
  assert(row, 'row exists'); assertEq(row.status,'pending');
});
test('first request stores correct fields', function() {
  var store = makeStore();
  processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',{stake:100});
  var row = store.get('K1');
  assertEq(row.actorId,'P1'); assertEq(row.clubId,'C1');
  assertEq(row.endpoint,'/api/bets/place');
  assert(row.expiresAt, 'has expiresAt');
});

// ── Double execution (same key, same body) ────────────────────────────────────
console.log('\n── Double execution ──');

test('duplicate place bet returns replay (not execute)', function() {
  var store = makeStore();
  var body = {stake:100,betType:'Single',playerId:'P1'};
  processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',body);
  completeIdempotentRequest(store,'K1',200,{ok:true,ticketId:'T1'});
  var r2 = processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',body);
  assertEq(r2.action,'replay');
  assertEq(r2.existingRow.responseBody.ticketId,'T1');
});
test('duplicate cancel returns replay', function() {
  var store = makeStore();
  var body = {ticketId:'T1',playerId:'P1'};
  processIdempotentRequest(store,'CK1','/api/bets/cancel','P1','C1',body);
  completeIdempotentRequest(store,'CK1',200,{ok:true,refundAmount:100});
  var r2 = processIdempotentRequest(store,'CK1','/api/bets/cancel','P1','C1',body);
  assertEq(r2.action,'replay');
  assertEq(r2.existingRow.responseBody.refundAmount,100);
});
test('duplicate settlement returns replay', function() {
  var store = makeStore();
  var body = {playerId:'P1',amount:50,direction:'player_owes_host'};
  processIdempotentRequest(store,'SK1','/api/host/settle-player','H1','C1',body);
  completeIdempotentRequest(store,'SK1',200,{ok:true,settled:true});
  var r2 = processIdempotentRequest(store,'SK1','/api/host/settle-player','H1','C1',body);
  assertEq(r2.action,'replay');
});
test('duplicate weekly rollover returns replay', function() {
  var store = makeStore();
  var body = {rolloverWeek:'2026-W20'};
  processIdempotentRequest(store,'WK1','/api/host/weekly-rollover','H1','C1',body);
  completeIdempotentRequest(store,'WK1',200,{ok:true,rolloverId:'R1'});
  var r2 = processIdempotentRequest(store,'WK1','/api/host/weekly-rollover','H1','C1',body);
  assertEq(r2.action,'replay');
});
test('replay does not call execute again → one ticket only', function() {
  var store = makeStore();
  var body = {stake:100,betType:'Single'};
  var execCount = 0;
  function handleRequest(key) {
    var r = processIdempotentRequest(store,key,'/api/bets/place','P1','C1',body);
    if (r.action==='execute') { execCount++; completeIdempotentRequest(store,key,200,{ok:true,ticketId:'T1'}); }
    return r.action;
  }
  handleRequest('K1');
  handleRequest('K1'); // duplicate
  handleRequest('K1'); // triplicate
  assertEq(execCount,1,'executed exactly once');
});

// ── Pending duplicate ─────────────────────────────────────────────────────────
console.log('\n── Pending duplicate ──');

test('pending duplicate returns in_progress', function() {
  var store = makeStore();
  processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',{stake:100}); // first: pending
  var r2 = processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',{stake:100});
  assertEq(r2.action,'in_progress');
});

// ── Conflict cases ────────────────────────────────────────────────────────────
console.log('\n── Conflict cases ──');

test('same key different body → body_mismatch conflict', function() {
  var store = makeStore();
  processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',{stake:100});
  completeIdempotentRequest(store,'K1',200,{ok:true});
  var r2 = processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',{stake:200});
  assertEq(r2.action,'conflict'); assertEq(r2.reason,'body_mismatch');
});
test('same key different actor → actor_mismatch conflict', function() {
  var store = makeStore();
  processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',{stake:100});
  var r2 = processIdempotentRequest(store,'K1','/api/bets/place','P2','C1',{stake:100});
  assertEq(r2.action,'conflict'); assertEq(r2.reason,'actor_mismatch');
});
test('same key different club → club_mismatch conflict', function() {
  var store = makeStore();
  processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',{stake:100});
  var r2 = processIdempotentRequest(store,'K1','/api/bets/place','P1','C2',{stake:100});
  assertEq(r2.action,'conflict'); assertEq(r2.reason,'club_mismatch');
});

// ── Key expiry ────────────────────────────────────────────────────────────────
console.log('\n── Key expiry ──');

test('expired key treated as fresh', function() {
  var store = makeStore();
  var nowMs = Date.now();
  var pastMs = nowMs - (KEY_TTL_MS + 1000); // 1s past TTL
  // Pre-insert an expired row
  store.set('K_EXP', {
    idempotencyKey:'K_EXP', actorId:'P1', clubId:'C1',
    endpoint:'/api/bets/place', requestHash:'abc', status:'completed',
    responseStatus:200, responseBody:{ok:true},
    createdAt:new Date(pastMs).toISOString(),
    completedAt:new Date(pastMs+100).toISOString(),
    expiresAt:new Date(pastMs+KEY_TTL_MS).toISOString()
  });
  var r = processIdempotentRequest(store,'K_EXP','/api/bets/place','P1','C1',{stake:100},nowMs);
  assertEq(r.action,'execute', 'expired key re-executes');
});
test('non-expired completed key replays', function() {
  var store = makeStore();
  processIdempotentRequest(store,'K2','/api/bets/place','P1','C1',{stake:100});
  completeIdempotentRequest(store,'K2',200,{ok:true,ticketId:'T2'});
  var r = processIdempotentRequest(store,'K2','/api/bets/place','P1','C1',{stake:100});
  assertEq(r.action,'replay');
});

// ── generateIdempotencyKey ────────────────────────────────────────────────────
console.log('\n── generateIdempotencyKey ──');

test('generated key is unique', function() {
  var k1 = generateIdempotencyKey('BET');
  var k2 = generateIdempotencyKey('BET');
  assert(k1 !== k2, 'unique keys');
});
test('generated key has correct prefix', function() {
  var k = generateIdempotencyKey('SETTLE');
  assert(k.startsWith('SETTLE_'), 'prefix: '+k);
});
test('generated key has sufficient entropy (hex portion)', function() {
  var k = generateIdempotencyKey('X');
  var hexPart = k.split('_').pop();
  assert(hexPart.length >= 8, 'hex length: '+hexPart.length);
});

// ── completeIdempotentRequest ─────────────────────────────────────────────────
console.log('\n── completeIdempotentRequest ──');

test('200 response marks status=completed', function() {
  var store = makeStore();
  processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',{});
  completeIdempotentRequest(store,'K1',200,{ok:true});
  assertEq(store.get('K1').status,'completed');
});
test('400 response marks status=failed', function() {
  var store = makeStore();
  processIdempotentRequest(store,'K1','/api/bets/place','P1','C1',{});
  completeIdempotentRequest(store,'K1',400,{ok:false,error:'invalid_stake'});
  assertEq(store.get('K1').status,'failed');
  assertEq(store.get('K1').responseStatus,400);
});
test('failed response also replays on retry', function() {
  var store = makeStore();
  var body = {stake:0};
  processIdempotentRequest(store,'K_BAD','/api/bets/place','P1','C1',body);
  completeIdempotentRequest(store,'K_BAD',400,{ok:false,error:'invalid_stake'});
  var r2 = processIdempotentRequest(store,'K_BAD','/api/bets/place','P1','C1',body);
  assertEq(r2.action,'replay');
  assertEq(r2.existingRow.responseStatus,400);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Idempotency tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ IDEMPOTENCY TESTS FAILED'); process.exit(1); }
else console.log('✅ All idempotency rules verified');
