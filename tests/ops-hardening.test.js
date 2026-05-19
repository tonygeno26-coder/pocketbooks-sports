/**
 * PocketBooks Sports — Phase Q: Production Ops Hardening Tests
 * Run: node tests/ops-hardening.test.js
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

// ── In-memory rate limiter ────────────────────────────────────────────────────

function makeRateLimiter() {
  const windows = {}; // key → { count, resetAt }
  return {
    check: function(key, maxReqs, windowMs) {
      const now = Date.now();
      if (!windows[key] || now >= windows[key].resetAt) {
        windows[key] = { count:0, resetAt: now+windowMs };
      }
      windows[key].count++;
      const allowed = windows[key].count <= maxReqs;
      const retryAfterMs = allowed ? 0 : windows[key].resetAt - now;
      return { allowed, count:windows[key].count, max:maxReqs,
               retryAfterSec: Math.ceil(retryAfterMs/1000) };
    },
    reset: function(key) { delete windows[key]; },
    resetAll: function() { Object.keys(windows).forEach(function(k){ delete windows[k]; }); }
  };
}

// Rate limit config: endpoint → { maxReqs, windowMs }
const RATE_LIMITS = {
  '/api/auth/token':               { maxReqs:10,  windowMs:60000 },
  '/api/auth/refresh':             { maxReqs:10,  windowMs:60000 },
  '/api/bets/place':               { maxReqs:30,  windowMs:60000 },
  '/api/bets/cancel':              { maxReqs:30,  windowMs:60000 },
  '/api/grade/run':                { maxReqs:5,   windowMs:60000 },
  '/api/grade/manual':             { maxReqs:5,   windowMs:60000 },
  '/api/markets/refresh':          { maxReqs:5,   windowMs:60000 },
  '/api/host/settlements':         { maxReqs:20,  windowMs:60000 },
  '/api/club/members':             { maxReqs:20,  windowMs:60000 },
  '/api/club/risk-settings':       { maxReqs:20,  windowMs:60000 }
};

function getRateLimitConfig(endpoint) {
  // Exact match first, then prefix match
  if (RATE_LIMITS[endpoint]) return RATE_LIMITS[endpoint];
  for (var prefix of Object.keys(RATE_LIMITS)) {
    if (endpoint.startsWith(prefix)) return RATE_LIMITS[prefix];
  }
  return null;
}

function buildRateLimitKey(endpoint, actorId, clubId, ipHash) {
  if (actorId) return actorId+'|'+endpoint;
  if (ipHash)  return 'ip:'+ipHash+'|'+endpoint;
  return 'anon|'+endpoint;
}

// Build 429 response
function build429(retryAfterSec, limitKey) {
  return { ok:false, error:'rate_limited', retryAfterSec, limitKey };
}

// ── CORS engine ───────────────────────────────────────────────────────────────

const DEFAULT_ALLOWED_ORIGINS = [
  'https://pocketbooks-sports.vercel.app',
  'https://pocketbooks-sports-git-main.vercel.app'
];
const DEV_PATTERN = /^https?:\/\/localhost(:\d+)?$/;

function checkCors(origin, isProduction, allowedOriginsEnv) {
  if (!origin) return { allowed:true, reason:'no_origin' }; // server-to-server
  const allowed = isProduction
    ? (allowedOriginsEnv||DEFAULT_ALLOWED_ORIGINS)
    : [...(allowedOriginsEnv||DEFAULT_ALLOWED_ORIGINS), 'http://localhost:3000',
       'http://localhost:5000', 'http://localhost:8080'];
  if (!isProduction && DEV_PATTERN.test(origin)) return { allowed:true, reason:'dev_localhost' };
  if (allowed.includes(origin)) return { allowed:true, reason:'whitelisted' };
  return { allowed:false, reason:'cors_rejected', origin };
}

// ── Security headers ──────────────────────────────────────────────────────────

const SENSITIVE_PATHS = new Set(['/api/auth', '/api/bets', '/api/host/settlements',
                                  '/api/grade', '/api/club']);

function getSecurityHeaders(path) {
  const base = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options':        'DENY',
    'Referrer-Policy':        'no-referrer',
    'Permissions-Policy':     'camera=(), microphone=(), geolocation=()'
  };
  const isSensitive = [...SENSITIVE_PATHS].some(function(p){ return path.startsWith(p); });
  if (isSensitive) base['Cache-Control'] = 'no-store';
  return base;
}

// ── Payload size check ────────────────────────────────────────────────────────

const PAYLOAD_LIMITS = {
  default:   100 * 1024, // 100 KB
  sensitive:  50 * 1024  // 50 KB for betting/admin
};

function checkPayloadSize(byteLength, path) {
  const SENSITIVE_BET = ['/api/bets/', '/api/grade/', '/api/host/settlements/'];
  const isSensitive = SENSITIVE_BET.some(function(p){ return path.startsWith(p); });
  const limit = isSensitive ? PAYLOAD_LIMITS.sensitive : PAYLOAD_LIMITS.default;
  if (byteLength > limit) return { ok:false, error:'payload_too_large', byteLength, limit };
  return { ok:true };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// ── Rate limiter ──────────────────────────────────────────────────────────────
console.log('\n── Rate limiter ──');

test('within limit → allowed', function() {
  var rl = makeRateLimiter();
  var r  = rl.check('P1|/api/bets/place', 30, 60000);
  assert(r.allowed); assertEq(r.count, 1);
});
test('at limit → allowed', function() {
  var rl = makeRateLimiter();
  var r;
  for (var i=0;i<30;i++) r=rl.check('P1|/api/bets/place',30,60000);
  assert(r.allowed); assertEq(r.count,30);
});
test('over limit → rejected with 429 data', function() {
  var rl = makeRateLimiter();
  for (var i=0;i<30;i++) rl.check('P1|/api/bets/place',30,60000);
  var r = rl.check('P1|/api/bets/place',30,60000);
  assert(!r.allowed); assert(r.retryAfterSec>0,'has retryAfter');
});
test('auth/token limit is 10/min', function() {
  var cfg = getRateLimitConfig('/api/auth/token');
  assertEq(cfg.maxReqs, 10);
});
test('grade/run limit is 5/min', function() {
  assertEq(getRateLimitConfig('/api/grade/run').maxReqs, 5);
});
test('prefix match for settlements', function() {
  var cfg = getRateLimitConfig('/api/host/settlements/close-week');
  assertEq(cfg.maxReqs, 20);
});
test('auth token rate limited after 10 requests', function() {
  var rl = makeRateLimiter();
  var key = 'P1|/api/auth/token';
  for (var i=0;i<10;i++) rl.check(key,10,60000);
  var r = rl.check(key,10,60000);
  assert(!r.allowed,'11th request blocked');
  assertEq(r.retryAfterSec > 0, true);
});
test('grade/run club rate limited after 5', function() {
  var rl = makeRateLimiter();
  var key = 'C1|/api/grade/run';
  for (var i=0;i<5;i++) rl.check(key,5,60000);
  assert(!rl.check(key,5,60000).allowed,'6th blocked');
});
test('unauthenticated IP fallback key', function() {
  var key = buildRateLimitKey('/api/auth/token', null, null, 'abc123');
  assertEq(key, 'ip:abc123|/api/auth/token');
});
test('authenticated actor key', function() {
  var key = buildRateLimitKey('/api/bets/place','P001','C1',null);
  assertEq(key, 'P001|/api/bets/place');
});
test('different actors have independent counters', function() {
  var rl = makeRateLimiter();
  for (var i=0;i<5;i++) rl.check('P1|/api/grade/run',5,60000);
  assert(!rl.check('P1|/api/grade/run',5,60000).allowed,'P1 blocked');
  assert(rl.check('P2|/api/grade/run',5,60000).allowed,'P2 still allowed');
});
test('build429 returns correct shape', function() {
  var r = build429(45, 'P1|/api/bets/place');
  assertEq(r.ok, false);
  assertEq(r.error, 'rate_limited');
  assertEq(r.retryAfterSec, 45);
  assertEq(r.limitKey, 'P1|/api/bets/place');
});

// ── CORS ──────────────────────────────────────────────────────────────────────
console.log('\n── CORS ──');

test('prod: allowed origin passes', function() {
  var r = checkCors('https://pocketbooks-sports.vercel.app', true, null);
  assert(r.allowed); assertEq(r.reason,'whitelisted');
});
test('prod: unknown origin rejected', function() {
  var r = checkCors('https://evil.example.com', true, null);
  assert(!r.allowed); assertEq(r.reason,'cors_rejected');
});
test('dev: localhost allowed', function() {
  var r = checkCors('http://localhost:3000', false, null);
  assert(r.allowed); assertEq(r.reason,'dev_localhost');
});
test('dev: localhost:8080 allowed', function() {
  assert(checkCors('http://localhost:8080', false, null).allowed);
});
test('prod: localhost rejected', function() {
  var r = checkCors('http://localhost:3000', true, null);
  assert(!r.allowed, 'localhost blocked in prod');
});
test('no origin (server-to-server) always allowed', function() {
  assert(checkCors(null, true, null).allowed);
  assert(checkCors('', true, null).allowed);
});
test('custom allowed origins env respected', function() {
  var custom = ['https://my-custom-app.com'];
  assert(checkCors('https://my-custom-app.com', true, custom).allowed);
  assert(!checkCors('https://pocketbooks-sports.vercel.app', true, custom).allowed,
    'default not in custom list');
});

// ── Security headers ──────────────────────────────────────────────────────────
console.log('\n── Security headers ──');

test('all responses get X-Content-Type-Options: nosniff', function() {
  var h = getSecurityHeaders('/api/markets/live');
  assertEq(h['X-Content-Type-Options'], 'nosniff');
});
test('all responses get X-Frame-Options: DENY', function() {
  assertEq(getSecurityHeaders('/api/env-check')['X-Frame-Options'], 'DENY');
});
test('sensitive auth path gets Cache-Control: no-store', function() {
  assertEq(getSecurityHeaders('/api/auth/token')['Cache-Control'], 'no-store');
});
test('sensitive bet path gets no-store', function() {
  assertEq(getSecurityHeaders('/api/bets/place')['Cache-Control'], 'no-store');
});
test('non-sensitive path no Cache-Control no-store', function() {
  var h = getSecurityHeaders('/api/scores/mlb');
  assert(!h['Cache-Control']||h['Cache-Control']!=='no-store', 'no no-store on scores');
});
test('Referrer-Policy is no-referrer', function() {
  assertEq(getSecurityHeaders('/api/bets/place')['Referrer-Policy'], 'no-referrer');
});

// ── Payload size ──────────────────────────────────────────────────────────────
console.log('\n── Payload size ──');

test('normal payload passes', function() {
  assert(checkPayloadSize(1024, '/api/bets/place').ok);
});
test('oversized sensitive payload rejected', function() {
  var r = checkPayloadSize(60*1024, '/api/bets/place');
  assert(!r.ok); assertEq(r.error,'payload_too_large');
  assertEq(r.limit, 50*1024);
});
test('oversized default payload rejected', function() {
  var r = checkPayloadSize(110*1024, '/api/markets/live');
  assert(!r.ok); assertEq(r.error,'payload_too_large');
});
test('exactly at default limit passes', function() {
  assert(checkPayloadSize(100*1024, '/api/markets/live').ok);
});
test('sensitive at 50KB passes', function() {
  assert(checkPayloadSize(50*1024, '/api/bets/place').ok);
});
test('sensitive at 51KB rejected', function() {
  assert(!checkPayloadSize(51*1024, '/api/bets/place').ok);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Ops hardening tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ OPS HARDENING TESTS FAILED'); process.exit(1); }
else console.log('✅ All ops hardening rules verified');
