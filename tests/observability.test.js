/**
 * PocketBooks Sports — Phase R: Observability + Health Dashboard Tests
 * Run: node tests/observability.test.js
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

// ── Request ID ────────────────────────────────────────────────────────────────

function generateRequestId() {
  return 'req_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function resolveRequestId(incomingHeader) {
  // Preserve client-supplied ID if it looks safe (alphanumeric + _-)
  if (incomingHeader && /^[a-zA-Z0-9_\-]{6,64}$/.test(incomingHeader.trim()))
    return incomingHeader.trim();
  return generateRequestId();
}

// ── Structured logger ─────────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set(['authorization','x-actor-role','token','password',
                                 'secret','SESSION_SECRET','jwt','bearer']);

function sanitizeLogData(data) {
  if (!data || typeof data !== 'object') return data;
  const out = {};
  Object.keys(data).forEach(function(k) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else if (data[k] && typeof data[k] === 'object') {
      out[k] = sanitizeLogData(data[k]);
    } else {
      out[k] = data[k];
    }
  });
  return out;
}

function logEvent(level, event, data, requestId) {
  const LEVELS = new Set(['info','warn','error']);
  if (!LEVELS.has(level)) level = 'info';
  const entry = {
    ts:        new Date().toISOString(),
    level,
    event,
    requestId: requestId||null,
    data:      sanitizeLogData(data||{})
  };
  // In production this would go to a log aggregator
  return entry; // return for testing
}

// ── Health response builder ───────────────────────────────────────────────────

function buildHealthResponse(opts) {
  opts = opts||{};
  return {
    ok:               opts.dbOk !== false, // ok only if db is up
    uptime:           opts.uptimeSec||0,
    version:          opts.version||'unknown',
    commit:           opts.commit||null,
    dbStatus:         opts.dbStatus||'unknown',
    oddsStatus:       opts.oddsStatus||'unknown',
    resultStatus:     opts.resultStatus||'unknown',
    queueStatus:      'not_implemented',
    lastOddsSuccessAt:opts.lastOddsSuccessAt||null,
    lastResultSuccessAt:opts.lastResultSuccessAt||null
  };
}

// Ensure no sensitive fields in health response
function validateHealthResponse(resp) {
  const FORBIDDEN = ['token','secret','key','password','supabaseUrl','serviceRole'];
  const str = JSON.stringify(resp).toLowerCase();
  return !FORBIDDEN.some(function(f){ return str.includes(f); });
}

// ── Diagnostics builder ───────────────────────────────────────────────────────

function buildDiagnosticsResponse(opts) {
  const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };
  const actor = opts.actor||{};
  // Requires full_admin+ or platform_admin
  const rank = ROLE_RANK[actor.role]||0;
  if (rank < ROLE_RANK.full_admin && actor.platformRole !== 'platform_admin') {
    return { ok:false, error:'insufficient_role', required:'full_admin' };
  }
  return {
    ok:              true,
    generatedAt:     new Date().toISOString(),
    rateLimitStats:  opts.rateLimitStats||{},
    marketStatus:    opts.marketStatus||{},
    resultStatus:    opts.resultStatus||{},
    auditEventCounts:opts.auditEventCounts||{},
    sessionCounts:   opts.sessionCounts||{ active:0, revoked:0 },
    settlementStats: opts.settlementStats||{ openPeriods:0, closedPeriods:0 },
    rpcFailCount:    opts.rpcFailCount||0
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// ── Request ID ────────────────────────────────────────────────────────────────
console.log('\n── Request ID ──');

test('generates unique request IDs', function() {
  var ids = new Set();
  for (var i=0;i<10;i++) ids.add(generateRequestId());
  assertEq(ids.size, 10, 'all unique');
});
test('generated ID starts with req_', function() {
  assert(generateRequestId().startsWith('req_'));
});
test('generated ID is at least 12 chars', function() {
  assert(generateRequestId().length >= 12);
});
test('client-supplied safe ID preserved', function() {
  assertEq(resolveRequestId('abc123def'), 'abc123def');
});
test('client ID with hyphen/underscore preserved', function() {
  assertEq(resolveRequestId('my-req_abc123'), 'my-req_abc123');
});
test('client ID too short → generate new', function() {
  var r = resolveRequestId('abc');
  assert(r.startsWith('req_'), 'generated: '+r);
});
test('client ID with injection chars → generate new', function() {
  var r = resolveRequestId('<script>alert(1)</script>');
  assert(r.startsWith('req_'), 'generated: '+r);
});
test('missing/null client ID → generate new', function() {
  assert(resolveRequestId(null).startsWith('req_'));
  assert(resolveRequestId('').startsWith('req_'));
});

// ── Structured logger ─────────────────────────────────────────────────────────
console.log('\n── Structured logger ──');

test('logEvent returns entry with required fields', function() {
  var e = logEvent('info','auth_success',{ actorId:'P1' },'req_123');
  assert(e.ts,'has ts');
  assertEq(e.level,'info');
  assertEq(e.event,'auth_success');
  assertEq(e.requestId,'req_123');
});
test('invalid level falls back to info', function() {
  var e = logEvent('CRITICAL','test',{});
  assertEq(e.level,'info');
});
test('Authorization header redacted', function() {
  var e = logEvent('info','request',{ authorization:'Bearer abc123', actorId:'P1' });
  assertEq(e.data.authorization,'[REDACTED]','auth redacted');
  assertEq(e.data.actorId,'P1','non-sensitive preserved');
});
test('token field redacted', function() {
  var e = logEvent('warn','session_check',{ token:'eyJhb...', actorId:'P1' });
  assertEq(e.data.token,'[REDACTED]');
});
test('secret field redacted', function() {
  var e = logEvent('error','config',{ secret:'s3cr3t', path:'/api/auth' });
  assertEq(e.data.secret,'[REDACTED]');
  assertEq(e.data.path,'/api/auth');
});
test('nested sensitive field redacted', function() {
  var e = logEvent('info','nested',{ headers:{ authorization:'Bearer tok', host:'localhost' } });
  assertEq(e.data.headers.authorization,'[REDACTED]');
  assertEq(e.data.headers.host,'localhost');
});
test('no sensitive data in log when only safe fields', function() {
  var e = logEvent('info','bet_placed',{ ticketId:'T1', amount:100, playerId:'P1' });
  assertEq(JSON.stringify(e).includes('[REDACTED]'), false,'no redaction needed');
});

// ── Health response ───────────────────────────────────────────────────────────
console.log('\n── Health response ──');

test('health ok when db up', function() {
  var r = buildHealthResponse({ dbStatus:'connected', dbOk:true });
  assert(r.ok); assertEq(r.dbStatus,'connected');
});
test('health not ok when db down', function() {
  var r = buildHealthResponse({ dbStatus:'error', dbOk:false });
  assert(!r.ok);
});
test('health includes queueStatus placeholder', function() {
  assertEq(buildHealthResponse({}).queueStatus,'not_implemented');
});
test('health response contains no sensitive fields', function() {
  var r = buildHealthResponse({ dbStatus:'connected', version:'1.0', commit:'abc123' });
  assert(validateHealthResponse(r),'no sensitive fields');
});
test('health shows version and commit', function() {
  var r = buildHealthResponse({ version:'1.2.3', commit:'abc1234' });
  assertEq(r.version,'1.2.3'); assertEq(r.commit,'abc1234');
});
test('health shows last odds/result success timestamps', function() {
  var ts = new Date().toISOString();
  var r = buildHealthResponse({ lastOddsSuccessAt:ts, lastResultSuccessAt:ts });
  assertEq(r.lastOddsSuccessAt, ts);
  assertEq(r.lastResultSuccessAt, ts);
});

// ── Diagnostics ───────────────────────────────────────────────────────────────
console.log('\n── Diagnostics ──');

test('full_admin can access diagnostics', function() {
  var r = buildDiagnosticsResponse({ actor:{ role:'full_admin', platformRole:null } });
  assert(r.ok,'ok: '+(r.error||''));
});
test('owner can access diagnostics', function() {
  assert(buildDiagnosticsResponse({ actor:{ role:'owner' } }).ok);
});
test('platform_admin can access diagnostics', function() {
  assert(buildDiagnosticsResponse({ actor:{ role:'view_only', platformRole:'platform_admin' } }).ok);
});
test('settlement_manager cannot access diagnostics', function() {
  var r = buildDiagnosticsResponse({ actor:{ role:'settlement_manager' } });
  assert(!r.ok); assertEq(r.error,'insufficient_role');
});
test('player cannot access diagnostics', function() {
  assert(!buildDiagnosticsResponse({ actor:{ role:'player' } }).ok);
});
test('diagnostics response has expected sections', function() {
  var r = buildDiagnosticsResponse({ actor:{ role:'full_admin' },
    rateLimitStats:{ hits:10 }, auditEventCounts:{ rate_limited:2 } });
  assert(r.rateLimitStats,'has rateLimitStats');
  assert(r.marketStatus!=null,'has marketStatus');
  assert(r.sessionCounts,'has sessionCounts');
  assert(r.settlementStats,'has settlementStats');
  assert(r.rpcFailCount>=0,'has rpcFailCount');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Observability tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ OBSERVABILITY TESTS FAILED'); process.exit(1); }
else console.log('✅ All observability rules verified');
