/**
 * PocketBooks Sports — Phase C: Server-Trusted Actor Auth Tests
 * Run: node tests/auth-trust-boundary.test.js
 * Pure logic — no network, no DB. Uses node crypto for HMAC.
 */
'use strict';

const crypto = require('crypto');

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)   { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Minimal JWT-style token (HS256 HMAC-SHA256) ───────────────────────────────
// Production tokens are signed with SESSION_SECRET — raw headers are NOT trusted.

const TEST_SECRET = 'test-session-secret-32-bytes-ok!';

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(s) {
  s = s.replace(/-/g,'+').replace(/_/g,'/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function signToken(payload, secret, expiresInSec) {
  const header  = b64url(JSON.stringify({ alg:'HS256', typ:'JWT' }));
  const exp     = Math.floor(Date.now()/1000) + (expiresInSec != null ? expiresInSec : 3600);
  const body    = b64url(JSON.stringify(Object.assign({}, payload, { exp, iat: Math.floor(Date.now()/1000) })));
  const sig     = b64url(crypto.createHmac('sha256', secret).update(header+'.'+body).digest());
  return header+'.'+body+'.'+sig;
}

function verifyToken(token, secret, nowSec) {
  nowSec = nowSec != null ? nowSec : Math.floor(Date.now()/1000);
  if (!token || typeof token !== 'string') return { error:'missing_token' };
  const parts = token.split('.');
  if (parts.length !== 3) return { error:'malformed_token' };
  const [header, body, sig] = parts;
  // Verify signature
  const expected = b64url(crypto.createHmac('sha256', secret).update(header+'.'+body).digest());
  if (expected !== sig) return { error:'invalid_token' };
  // Decode payload
  let payload;
  try { payload = JSON.parse(b64urlDecode(body).toString()); }
  catch(_e) { return { error:'malformed_payload' }; }
  // Expiry check
  if (payload.exp && nowSec >= payload.exp) return { error:'expired_token', expiredAt: payload.exp };
  return { ok:true, payload };
}

// ── requireActor with token trust ────────────────────────────────────────────
const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };

function requireActorSecure(headers, isProduction, devBypassEnabled, secret, nowSec) {
  const authHeader = (headers['authorization'] || headers['Authorization'] || '').trim();
  const devBypassOk = !isProduction || devBypassEnabled;

  // 1. Try bearer token
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const result = verifyToken(token, secret, nowSec);
    if (!result.ok) {
      return { error: result.error, status: result.error === 'expired_token' ? 401 : 401,
               auditEvent: result.error };
    }
    const p = result.payload;
    const role = ROLE_RANK[p.role] != null ? p.role : 'view_only';
    return { actorId: p.sub || p.actorId, role, clubId: p.clubId||'', isDevBypass:false, fromToken:true };
  }

  // 2. Dev bypass (no token provided)
  if (devBypassOk) {
    const clubId = headers['x-club-id'] || 'dev-club';
    return { actorId:'dev-owner', role:'owner', clubId, isDevBypass:true };
  }

  // 3. Production, no valid token → reject
  // In production, x-actor-role header alone is NOT trusted
  return { error:'unauthenticated', status:401, auditEvent:'unauthenticated' };
}

// ── Token creation helper ─────────────────────────────────────────────────────
function makeToken(role, actorId, clubId, secret, expiresInSec) {
  return signToken({ sub: actorId||'U1', actorId: actorId||'U1', role, clubId: clubId||'C1' },
                   secret||TEST_SECRET, expiresInSec);
}

// ── verifyToken tests ─────────────────────────────────────────────────────────
console.log('\n── Token verification ──');

test('valid token verifies ok', function() {
  var tok = makeToken('player','P001','C1');
  var r = verifyToken(tok, TEST_SECRET);
  assert(r.ok, 'verified'); assertEq(r.payload.role, 'player');
});
test('tampered payload rejected', function() {
  var tok = makeToken('player','P001','C1');
  var parts = tok.split('.');
  // Tamper payload: change role to owner
  var evil = b64url(JSON.stringify({ sub:'P001', actorId:'P001', role:'owner', clubId:'C1',
    exp: Math.floor(Date.now()/1000)+3600, iat: Math.floor(Date.now()/1000) }));
  var tampered = parts[0]+'.'+evil+'.'+parts[2];
  var r = verifyToken(tampered, TEST_SECRET);
  assert(!r.ok); assertEq(r.error, 'invalid_token');
});
test('wrong secret rejected', function() {
  var tok = makeToken('owner','P001','C1', 'wrong-secret-xxxxxxxxxxxxxxxxxx');
  var r = verifyToken(tok, TEST_SECRET);
  assert(!r.ok); assertEq(r.error, 'invalid_token');
});
test('expired token rejected', function() {
  var tok = makeToken('player','P001','C1', TEST_SECRET, -10); // expired 10s ago
  var r = verifyToken(tok, TEST_SECRET);
  assert(!r.ok); assertEq(r.error, 'expired_token');
});
test('expired token includes expiredAt', function() {
  var tok = makeToken('player','P001','C1', TEST_SECRET, -1);
  var r = verifyToken(tok, TEST_SECRET);
  assert(r.expiredAt, 'has expiredAt');
});
test('malformed token (2 parts) rejected', function() {
  var r = verifyToken('header.body', TEST_SECRET);
  assert(!r.ok); assertEq(r.error, 'malformed_token');
});
test('empty token rejected', function() {
  var r = verifyToken('', TEST_SECRET);
  assert(!r.ok); assertEq(r.error, 'missing_token');
});
test('null token rejected', function() {
  var r = verifyToken(null, TEST_SECRET);
  assert(!r.ok); assertEq(r.error, 'missing_token');
});

// ── requireActorSecure: production token path ─────────────────────────────────
console.log('\n── requireActorSecure: production ──');

test('valid player token resolves player role', function() {
  var tok = makeToken('player','P001','C1');
  var r = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assert(r.ok !== false && !r.error, 'no error: '+(r.error||''));
  assertEq(r.actorId, 'P001'); assertEq(r.role, 'player'); assert(r.fromToken);
});
test('valid owner token resolves owner role', function() {
  var tok = makeToken('owner','H1','C1');
  var r = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assertEq(r.role, 'owner');
});
test('valid settlement_manager token resolves correct role', function() {
  var tok = makeToken('settlement_manager','S1','C1');
  var r = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assertEq(r.role, 'settlement_manager');
});

// KEY TRUST BOUNDARY TESTS
test('production: raw x-actor-role:owner header WITHOUT token → rejected', function() {
  // No bearer token, production mode, no dev bypass
  var r = requireActorSecure({ 'x-actor-id':'P001', 'x-actor-role':'owner', 'x-club-id':'C1' },
                              true, false, TEST_SECRET);
  assert(r.error === 'unauthenticated', 'must be rejected: '+(r.error||JSON.stringify(r)));
});
test('production: raw x-actor-role:settlement_manager without token → rejected', function() {
  var r = requireActorSecure({ 'x-actor-id':'P001', 'x-actor-role':'settlement_manager' },
                              true, false, TEST_SECRET);
  assert(r.error === 'unauthenticated');
});
test('production: tampered token → invalid_token', function() {
  var tok = makeToken('player','P001','C1');
  var parts = tok.split('.');
  var evil = b64url(JSON.stringify({ sub:'P001', role:'owner', clubId:'C1',
    exp:Math.floor(Date.now()/1000)+3600, iat:Math.floor(Date.now()/1000) }));
  var r = requireActorSecure({ authorization:'Bearer '+parts[0]+'.'+evil+'.'+parts[2] },
                              true, false, TEST_SECRET);
  assert(r.error === 'invalid_token');
});
test('production: expired token → error with auditEvent', function() {
  var tok = makeToken('player','P001','C1', TEST_SECRET, -5);
  var r = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assert(r.error === 'expired_token'); assert(r.auditEvent);
});
test('unknown role in token → downgraded to view_only', function() {
  var tok = makeToken('superadmin','P001','C1');
  var r = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assert(!r.error); assertEq(r.role, 'view_only');
});

// ── Dev bypass ────────────────────────────────────────────────────────────────
console.log('\n── Dev bypass ──');

test('dev mode no token → dev-owner bypass', function() {
  var r = requireActorSecure({}, false, false, TEST_SECRET);
  assert(r.isDevBypass); assertEq(r.role, 'owner');
});
test('DEV_AUTH_BYPASS in production → bypass allowed', function() {
  var r = requireActorSecure({}, true, true, TEST_SECRET);
  assert(r.isDevBypass);
});
test('dev bypass still rejected in production without flag', function() {
  var r = requireActorSecure({}, true, false, TEST_SECRET);
  assert(r.error === 'unauthenticated');
});

// ── Permission chain with trusted actor ──────────────────────────────────────
console.log('\n── Permission chain ──');

const ACTION_MIN_RANK = {
  place_bet:-1, cancel_bet:-1, view_player_dashboard:-1,
  view_host_dashboard:2, settle_player:3, weekly_rollover:3,
  run_server_grade:3, force_market_refresh:4
};

function checkPerm(actor, action, targetId) {
  if (actor.error) return { allowed:false, reason:actor.error };
  const minRank = ACTION_MIN_RANK[action];
  if (minRank == null) return { allowed:false, reason:'unknown_action' };
  const rank = ROLE_RANK[actor.role] != null ? ROLE_RANK[actor.role] : -99;
  if (minRank === -1) {
    const isSelf = targetId && actor.actorId === targetId;
    const isPriv = rank >= ROLE_RANK.full_admin;
    return isSelf || isPriv ? { allowed:true } : { allowed:false, reason:'not_own_account' };
  }
  return rank >= minRank ? { allowed:true } : { allowed:false, reason:'insufficient_role' };
}

test('valid player token can place own bet', function() {
  var tok = makeToken('player','P001','C1');
  var a = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assert(checkPerm(a, 'place_bet', 'P001').allowed, 'own bet allowed');
});
test('valid player token cannot place bet for another player', function() {
  var tok = makeToken('player','P001','C1');
  var a = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assert(!checkPerm(a, 'place_bet', 'P999').allowed);
});
test('player token cannot settle', function() {
  var tok = makeToken('player','P001','C1');
  var a = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assert(!checkPerm(a, 'settle_player').allowed);
});
test('settlement_manager token can settle', function() {
  var tok = makeToken('settlement_manager','S1','C1');
  var a = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assert(checkPerm(a, 'settle_player').allowed);
});
test('risk_viewer token can view host dashboard', function() {
  var tok = makeToken('risk_viewer','R1','C1');
  var a = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assert(checkPerm(a, 'view_host_dashboard').allowed);
});
test('risk_viewer token cannot run server grade', function() {
  var tok = makeToken('risk_viewer','R1','C1');
  var a = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assert(!checkPerm(a, 'run_server_grade').allowed);
});
test('raw owner header in production cannot access admin endpoints', function() {
  // No token, production mode — raw x-actor-role:owner must not grant access
  var a = requireActorSecure({ 'x-actor-role':'owner' }, true, false, TEST_SECRET);
  assert(a.error === 'unauthenticated', 'rejected without token');
  assert(!checkPerm(a, 'force_market_refresh').allowed);
});
test('dev bypass actor has owner perms (all actions pass)', function() {
  var a = requireActorSecure({}, false, false, TEST_SECRET);
  assert(checkPerm(a, 'force_market_refresh').allowed);
  assert(checkPerm(a, 'settle_player').allowed);
  assert(checkPerm(a, 'place_bet', 'P001').allowed);
});

// ── Audit event types ─────────────────────────────────────────────────────────
console.log('\n── Audit event types ──');

test('expired token produces auditEvent=expired_token', function() {
  var tok = makeToken('player','P001','C1', TEST_SECRET, -1);
  var r = requireActorSecure({ authorization:'Bearer '+tok }, true, false, TEST_SECRET);
  assertEq(r.auditEvent, 'expired_token');
});
test('tampered token produces auditEvent=invalid_token', function() {
  var tok = makeToken('player','P001','C1');
  var r = requireActorSecure({ authorization:'Bearer '+tok.slice(0,-5)+'XXXXX' }, true, false, TEST_SECRET);
  assertEq(r.auditEvent, 'invalid_token');
});
test('missing token in production produces auditEvent=unauthenticated', function() {
  var r = requireActorSecure({}, true, false, TEST_SECRET);
  assertEq(r.auditEvent, 'unauthenticated');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Auth trust-boundary tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ AUTH TRUST BOUNDARY TESTS FAILED'); process.exit(1); }
else console.log('✅ All auth trust-boundary rules verified');
