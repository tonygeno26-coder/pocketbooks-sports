/**
 * PocketBooks Sports — Phase F: Session Revocation + Token Rotation Tests
 * Run: node tests/session-revocation.test.js
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
function assertMatch(s, re, m) { if (!re.test(s)) throw new Error((m||'')+' — "'+s+'" did not match '+re); }

// ── Token helpers ─────────────────────────────────────────────────────────────
const SECRET = 'session-test-secret-32bytes-ok!!';
function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64uDec(s) {
  s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='='; return Buffer.from(s,'base64');
}
function signToken(payload, expiresIn) {
  const h = b64u(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const exp = Math.floor(Date.now()/1000)+(expiresIn!=null?expiresIn:3600);
  const b = b64u(JSON.stringify(Object.assign({},payload,{exp,iat:Math.floor(Date.now()/1000)})));
  const s = b64u(crypto.createHmac('sha256',SECRET).update(h+'.'+b).digest());
  return h+'.'+b+'.'+s;
}
function verifyToken(token) {
  if (!token) return {error:'missing_token'};
  const p=token.split('.');
  if(p.length!==3) return {error:'malformed_token'};
  const exp=b64u(crypto.createHmac('sha256',SECRET).update(p[0]+'.'+p[1]).digest());
  if(exp!==p[2]) return {error:'invalid_token'};
  let pl; try{ pl=JSON.parse(b64uDec(p[1]).toString()); }catch(_e){return{error:'malformed_payload'};}
  if(pl.exp && Math.floor(Date.now()/1000)>=pl.exp) return{error:'expired_token'};
  return {ok:true,payload:pl};
}

const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };

// ── Session store (in-memory) ─────────────────────────────────────────────────
function makeSessionStore() {
  const rows = {};
  return {
    get: function(jti) { return rows[jti]||null; },
    set: function(jti, row) { rows[jti]=row; },
    getByActor: function(actorId, clubId) {
      return Object.values(rows).filter(function(r){
        return r.actorId===actorId && r.clubId===clubId && r.status==='active';
      });
    },
    all: function() { return Object.values(rows); }
  };
}

// ── Token + session issuance ──────────────────────────────────────────────────
function generateJti() {
  return 'jti_'+Date.now()+'_'+crypto.randomBytes(6).toString('hex');
}

function issueSession(store, actorId, role, clubId, platformRole, expiresInSec, meta) {
  const jti  = generateJti();
  const now  = new Date().toISOString();
  const exp  = new Date(Date.now()+(expiresInSec||86400)*1000).toISOString();
  const token = signToken({ sub:actorId, actorId, role, clubId:clubId||'', jti,
                             platformRole:platformRole||null }, expiresInSec);
  const row = {
    jti, actorId, clubId:clubId||'', role, platformRole:platformRole||null,
    status:'active', issuedAt:now, expiresAt:exp,
    revokedAt:null, revokeReason:null,
    lastSeenAt:now,
    userAgent: meta && meta.userAgent || null,
    ipHash:    meta && meta.ipHash    || null
  };
  store.set(jti, row);
  return { token, jti, row };
}

// ── requireActor with session check ──────────────────────────────────────────
function requireActorWithSession(authHeader, store, isProduction, devBypass, nowSec) {
  nowSec = nowSec || Math.floor(Date.now()/1000);
  const bypassOk = !isProduction || devBypass;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (bypassOk) return { actorId:'dev-owner', role:'owner', clubId:'dev-club',
                           platformRole:'platform_admin', isDevBypass:true };
    return { error:'unauthenticated', status:401, auditEvent:'unauthenticated' };
  }

  const result = verifyToken(authHeader.slice(7));
  if (!result.ok) return { error:result.error, status:401, auditEvent:result.error };

  const p = result.payload;

  // Production: jti required
  if (isProduction && !p.jti)
    return { error:'legacy_token_missing_jti', status:401, auditEvent:'legacy_token_missing_jti' };

  // Session store check (if jti present)
  if (p.jti) {
    const session = store.get(p.jti);
    if (!session)
      return { error:'session_not_found', status:401, auditEvent:'session_not_found' };
    if (session.status === 'revoked')
      return { error:'session_revoked', status:401, auditEvent:'session_revoked',
               revokeReason:session.revokeReason };
    if (session.status === 'expired')
      return { error:'expired_token', status:401, auditEvent:'session_expired' };
    // Claim consistency check: token role/club must match session row
    if (session.role !== p.role || session.clubId !== (p.clubId||''))
      return { error:'session_claim_mismatch', status:401, auditEvent:'session_claim_mismatch' };
    // Update lastSeenAt (in real impl: fire-and-forget DB update)
    session.lastSeenAt = new Date().toISOString();
  }

  const role = ROLE_RANK[p.role] != null ? p.role : 'view_only';
  return { actorId:p.sub||p.actorId, role, clubId:p.clubId||'',
           platformRole:p.platformRole||null, jti:p.jti,
           isDevBypass:false, fromToken:true };
}

// ── Token rotation ────────────────────────────────────────────────────────────
function rotateSession(store, oldJti, actorId, role, clubId, platformRole) {
  const oldSession = store.get(oldJti);
  if (!oldSession) return { error:'session_not_found' };
  if (oldSession.status !== 'active') return { error:'session_not_active', status:oldSession.status };

  // Revoke old session
  oldSession.status = 'revoked';
  oldSession.revokedAt = new Date().toISOString();
  oldSession.revokeReason = 'rotated';
  store.set(oldJti, oldSession);

  // Issue new session
  const newSession = issueSession(store, actorId, role, clubId, platformRole);
  return { ok:true, newToken:newSession.token, newJti:newSession.jti, oldJti };
}

// ── Logout ────────────────────────────────────────────────────────────────────
function logout(store, jti, reason) {
  const session = store.get(jti);
  if (!session) return { error:'session_not_found' };
  session.status = 'revoked';
  session.revokedAt = new Date().toISOString();
  session.revokeReason = reason || 'logout';
  store.set(jti, session);
  return { ok:true };
}

// ── Role-change revocation (revoke all active sessions for actor+club) ────────
function revokeActorSessions(store, actorId, clubId, reason) {
  const sessions = store.getByActor(actorId, clubId);
  sessions.forEach(function(s) {
    s.status = 'revoked';
    s.revokedAt = new Date().toISOString();
    s.revokeReason = reason || 'role_changed';
    store.set(s.jti, s);
  });
  return { revokedCount: sessions.length };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// ── Token + session issuance ──────────────────────────────────────────────────
console.log('\n── Token + session issuance ──');

test('issueSession returns token + jti + row', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  assert(r.token, 'has token');
  assert(r.jti,   'has jti');
  assert(r.row,   'has row');
  assertEq(r.row.status,'active');
});
test('jti included in token payload', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  var vr = verifyToken(r.token);
  assert(vr.ok); assert(vr.payload.jti, 'jti in payload');
  assertEq(vr.payload.jti, r.jti);
});
test('jti is unique across calls', function() {
  var store = makeSessionStore();
  var r1 = issueSession(store,'P1','player','C1');
  var r2 = issueSession(store,'P1','player','C1');
  assert(r1.jti !== r2.jti, 'unique jtis');
});
test('session row stored with correct fields', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1',null,3600);
  assertEq(r.row.actorId,'P1'); assertEq(r.row.role,'player');
  assertEq(r.row.clubId,'C1'); assert(r.row.expiresAt);
});

// ── requireActorWithSession: valid ────────────────────────────────────────────
console.log('\n── requireActorWithSession: valid ──');

test('valid token + active session → ok', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  var a = requireActorWithSession('Bearer '+r.token, store, true, false);
  assert(!a.error, 'no error: '+(a.error||''));
  assertEq(a.actorId,'P1'); assertEq(a.role,'player');
});
test('valid token sets lastSeenAt on session', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  var before = r.row.lastSeenAt;
  requireActorWithSession('Bearer '+r.token, store, true, false);
  var after = store.get(r.jti).lastSeenAt;
  assert(after >= before, 'lastSeenAt updated');
});

// ── requireActorWithSession: revoked ─────────────────────────────────────────
console.log('\n── Revocation checks ──');

test('revoked token rejected with session_revoked', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  logout(store, r.jti);
  var a = requireActorWithSession('Bearer '+r.token, store, true, false);
  assert(a.error === 'session_revoked', 'got: '+a.error);
  assertEq(a.auditEvent,'session_revoked');
});
test('revoked token carries revokeReason', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  logout(store, r.jti, 'logout');
  var a = requireActorWithSession('Bearer '+r.token, store, true, false);
  assertEq(a.revokeReason,'logout');
});
test('session_not_found when jti absent from store', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  // Use token but delete session row
  store.set(r.jti, null);
  var a = requireActorWithSession('Bearer '+r.token, store, true, false);
  assertEq(a.error,'session_not_found');
  assertEq(a.auditEvent,'session_not_found');
});
test('missing jti in production → legacy_token_missing_jti', function() {
  var legacyToken = signToken({ sub:'P1', actorId:'P1', role:'player', clubId:'C1' }); // no jti
  var store = makeSessionStore();
  var a = requireActorWithSession('Bearer '+legacyToken, store, true, false);
  assertEq(a.error,'legacy_token_missing_jti');
});
test('missing jti in dev mode is allowed (no store check)', function() {
  var legacyToken = signToken({ sub:'P1', actorId:'P1', role:'player', clubId:'C1' });
  var store = makeSessionStore();
  var a = requireActorWithSession('Bearer '+legacyToken, store, false, false);
  assert(!a.error, 'dev allows legacy token');
});
test('session_claim_mismatch when role changed in store', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  // Tamper session row role
  store.get(r.jti).role = 'settlement_manager';
  var a = requireActorWithSession('Bearer '+r.token, store, true, false);
  assertEq(a.error,'session_claim_mismatch');
  assertEq(a.auditEvent,'session_claim_mismatch');
});

// ── Token rotation ────────────────────────────────────────────────────────────
console.log('\n── Token rotation ──');

test('rotateSession: old jti revoked', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  rotateSession(store, r.jti, 'P1','player','C1');
  assertEq(store.get(r.jti).status,'revoked');
  assertEq(store.get(r.jti).revokeReason,'rotated');
});
test('rotateSession: new jti active', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  var rot = rotateSession(store, r.jti, 'P1','player','C1');
  assert(rot.ok); assert(rot.newJti); assert(rot.newJti !== r.jti);
  assertEq(store.get(rot.newJti).status,'active');
});
test('old token rejected after rotation', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  rotateSession(store, r.jti, 'P1','player','C1');
  var a = requireActorWithSession('Bearer '+r.token, store, true, false);
  assertEq(a.error,'session_revoked');
  assertEq(a.revokeReason,'rotated');
});
test('new token works after rotation', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  var rot = rotateSession(store, r.jti, 'P1','player','C1');
  var a = requireActorWithSession('Bearer '+rot.newToken, store, true, false);
  assert(!a.error, 'new token valid: '+(a.error||''));
  assertEq(a.actorId,'P1');
});
test('rotate non-existent session → error', function() {
  var store = makeSessionStore();
  var r = rotateSession(store, 'jti_fake', 'P1','player','C1');
  assertEq(r.error,'session_not_found');
});
test('rotate already-revoked session → error', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  logout(store, r.jti);
  var rot = rotateSession(store, r.jti, 'P1','player','C1');
  assertEq(rot.error,'session_not_active');
});

// ── Logout ────────────────────────────────────────────────────────────────────
console.log('\n── Logout ──');

test('logout revokes session', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  logout(store, r.jti, 'logout');
  assertEq(store.get(r.jti).status,'revoked');
  assertEq(store.get(r.jti).revokeReason,'logout');
});
test('token rejected after logout', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  logout(store, r.jti);
  var a = requireActorWithSession('Bearer '+r.token, store, true, false);
  assertEq(a.error,'session_revoked');
});
test('logout unknown jti → session_not_found', function() {
  var store = makeSessionStore();
  var r = logout(store, 'jti_missing');
  assertEq(r.error,'session_not_found');
});

// ── Role-change revocation ────────────────────────────────────────────────────
console.log('\n── Role-change revocation ──');

test('revokeActorSessions revokes all active sessions', function() {
  var store = makeSessionStore();
  issueSession(store,'P1','player','C1');
  issueSession(store,'P1','player','C1');
  var r = revokeActorSessions(store,'P1','C1','role_changed');
  assertEq(r.revokedCount,2,'2 sessions revoked');
  store.getByActor('P1','C1').forEach(function(s){ assert(s.status==='revoked'); });
});
test('revokeActorSessions only affects target actor+club', function() {
  var store = makeSessionStore();
  issueSession(store,'P1','player','C1');
  issueSession(store,'P2','player','C1'); // different actor
  revokeActorSessions(store,'P1','C1','role_changed');
  var p2Sessions = store.getByActor('P2','C1');
  assertEq(p2Sessions.length,1,'P2 session untouched');
});
test('revoked session tokens rejected after role change', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  revokeActorSessions(store,'P1','C1','role_changed');
  var a = requireActorWithSession('Bearer '+r.token, store, true, false);
  assertEq(a.error,'session_revoked');
  assertEq(a.revokeReason,'role_changed');
});

// ── Dev bypass unaffected ─────────────────────────────────────────────────────
console.log('\n── Dev bypass ──');

test('dev bypass works without any session store entry', function() {
  var store = makeSessionStore();
  var a = requireActorWithSession('', store, false, false);
  assert(a.isDevBypass); assertEq(a.role,'owner');
});
test('DEV_AUTH_BYPASS in production bypasses session check', function() {
  var store = makeSessionStore();
  var a = requireActorWithSession('', store, true, true);
  assert(a.isDevBypass);
});

// ── Audit event types ─────────────────────────────────────────────────────────
console.log('\n── Audit event types ──');

test('session_revoked produces correct auditEvent', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  logout(store, r.jti);
  var a = requireActorWithSession('Bearer '+r.token, store, true, false);
  assertEq(a.auditEvent,'session_revoked');
});
test('session_not_found produces correct auditEvent', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  store.set(r.jti, null);
  var a = requireActorWithSession('Bearer '+r.token, store, true, false);
  assertEq(a.auditEvent,'session_not_found');
});
test('session_claim_mismatch produces correct auditEvent', function() {
  var store = makeSessionStore();
  var r = issueSession(store,'P1','player','C1');
  store.get(r.jti).role = 'owner';
  var a = requireActorWithSession('Bearer '+r.token, store, true, false);
  assertEq(a.auditEvent,'session_claim_mismatch');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Session revocation tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ SESSION REVOCATION TESTS FAILED'); process.exit(1); }
else console.log('✅ All session revocation rules verified');
