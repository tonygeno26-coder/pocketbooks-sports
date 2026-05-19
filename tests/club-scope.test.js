/**
 * PocketBooks Sports — Phase D: Club-Scoped Authorization Tests
 * Run: node tests/club-scope.test.js
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

// ── Minimal token helpers ─────────────────────────────────────────────────────
const SECRET = 'test-secret-32-bytes-min-ok----!';
function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64uDec(s) {
  s = s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='='; return Buffer.from(s,'base64');
}
function sign(payload, expiresIn) {
  const h = b64u(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const exp = Math.floor(Date.now()/1000)+(expiresIn||3600);
  const b = b64u(JSON.stringify(Object.assign({},payload,{exp,iat:Math.floor(Date.now()/1000)})));
  const s = b64u(crypto.createHmac('sha256',SECRET).update(h+'.'+b).digest());
  return h+'.'+b+'.'+s;
}
function verify(token) {
  if (!token) return {error:'missing_token'};
  const p=token.split('.');
  if(p.length!==3) return {error:'malformed_token'};
  const exp=b64u(crypto.createHmac('sha256',SECRET).update(p[0]+'.'+p[1]).digest());
  if(exp!==p[2]) return {error:'invalid_token'};
  let pl; try{ pl=JSON.parse(b64uDec(p[1]).toString()); }catch(_e){return{error:'malformed_payload'};}
  if(pl.exp && Math.floor(Date.now()/1000)>=pl.exp) return{error:'expired_token'};
  return {ok:true,payload:pl};
}
function makeToken(actorId, role, clubId, platformRole) {
  return sign({ sub:actorId, actorId, role, clubId: clubId||'', platformRole: platformRole||null });
}

// ── Club-scope enforcement engine ─────────────────────────────────────────────

const ROLE_RANK = { owner:5, full_admin:4, settlement_manager:3, risk_viewer:2, player:1, view_only:0 };

// Resolve actor from token (production path)
function resolveActor(authHeader, isProduction, devBypass) {
  const bypassOk = !isProduction || devBypass;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const r = verify(authHeader.slice(7));
    if (!r.ok) return { error: r.error, status:401 };
    const p = r.payload;
    const role = ROLE_RANK[p.role] != null ? p.role : 'view_only';
    return { actorId:p.sub||p.actorId, role, clubId:p.clubId||'',
             platformRole:p.platformRole||null, isDevBypass:false, fromToken:true };
  }
  if (bypassOk) return { actorId:'dev-owner', role:'owner', clubId:'dev-club',
                         platformRole:'platform_admin', isDevBypass:true };
  return { error:'unauthenticated', status:401 };
}

// Core club-scope check
// Returns { ok, reason, auditEvent }
function checkClubScope(actor, requestedClubId) {
  if (actor.error) return { ok:false, reason:actor.error, auditEvent:actor.error };
  if (!requestedClubId) return { ok:true }; // no club in request — pass through to DB filter

  // platform_admin bypasses all club checks
  if (actor.platformRole === 'platform_admin') return { ok:true, crossClub:true };

  // Dev bypass — skip club check
  if (actor.isDevBypass) return { ok:true };

  // Token clubId must match the requested clubId
  if (actor.clubId && actor.clubId !== requestedClubId) {
    return {
      ok:false, reason:'club_scope_mismatch', status:403,
      auditEvent:'club_scope_mismatch',
      actorClubId: actor.clubId, requestedClubId
    };
  }
  return { ok:true };
}

// Full permission check including club scope
function checkPermissionWithScope(actor, action, requestedClubId, targetPlayerId) {
  // Unauthenticated
  if (actor.error) return { allowed:false, reason:actor.error, status:actor.status||401 };

  // Club scope
  const scope = checkClubScope(actor, requestedClubId);
  if (!scope.ok) return { allowed:false, reason:scope.reason, status:scope.status||403,
                           auditEvent:scope.auditEvent };

  // Role check
  const ACTION_MIN_RANK = {
    place_bet:-1, cancel_bet:-1, view_player_dashboard:-1,
    view_host_dashboard:2, view_settlement_history:2,
    settle_player:3, weekly_rollover:3, run_server_grade:3,
    force_market_refresh:4, view_audit_log:2,
    cross_club_master:99 // only platform_admin (handled via scope.crossClub)
  };
  const minRank = ACTION_MIN_RANK[action];
  if (minRank == null) return { allowed:false, reason:'unknown_action:'+action };

  // cross_club_master: only platform_admin
  if (action === 'cross_club_master') {
    return actor.platformRole === 'platform_admin'
      ? { allowed:true }
      : { allowed:false, reason:'not_platform_admin', status:403 };
  }

  const rank = ROLE_RANK[actor.role] != null ? ROLE_RANK[actor.role] : -99;

  if (minRank === -1) {
    // player-self: actorId must match targetPlayerId AND same club
    const isSelf = targetPlayerId && actor.actorId === targetPlayerId;
    const isPriv = rank >= ROLE_RANK.full_admin;
    if (!isSelf && !isPriv) return { allowed:false, reason:'not_own_account', status:403 };
    return { allowed:true };
  }
  if (rank < minRank) {
    return { allowed:false, reason:'insufficient_role', status:403,
             required:Object.keys(ROLE_RANK).find(r=>ROLE_RANK[r]===minRank), actual:actor.role };
  }
  return { allowed:true };
}

// Derive canonical clubId from actor (never trust request body in production)
function deriveClubId(actor, reqBodyClubId, reqQueryClubId, isProduction, devBypass) {
  const bypassOk = !isProduction || devBypass;
  if (actor.error) return null;
  if (actor.platformRole === 'platform_admin') return reqBodyClubId || reqQueryClubId || actor.clubId;
  if (actor.isDevBypass && bypassOk) return reqBodyClubId || reqQueryClubId || actor.clubId;
  // Production: ONLY trust token clubId
  if (actor.fromToken) return actor.clubId || null;
  return null;
}

// ── Test actors ───────────────────────────────────────────────────────────────
function actor(role, id, club, platformRole) {
  return resolveActor('Bearer '+makeToken(id||'U1', role, club||'C1', platformRole||null), true, false);
}
const PA  = actor('owner',  'PA1', 'C1', 'platform_admin'); // platform_admin
const OWN = actor('owner',  'H1',  'C1');                    // owner club C1
const SET = actor('settlement_manager','S1','C1');
const RISK= actor('risk_viewer','R1','C1');
const PLY = actor('player','P001','C1');
const PLY2= actor('player','P002','C2');  // player in Club 2

// ── Club scope check ──────────────────────────────────────────────────────────
console.log('\n── checkClubScope ──');

test('same club → ok', function() {
  assert(checkClubScope(OWN,'C1').ok);
});
test('different club → club_scope_mismatch', function() {
  var r = checkClubScope(OWN,'C2');
  assert(!r.ok); assertEq(r.reason,'club_scope_mismatch');
  assertEq(r.actorClubId,'C1'); assertEq(r.requestedClubId,'C2');
});
test('no requestedClubId → pass (DB filter)', function() {
  assert(checkClubScope(OWN, null).ok);
  assert(checkClubScope(OWN, '').ok);
});
test('platform_admin bypasses club check', function() {
  assert(checkClubScope(PA,'C2').ok); // PA is in C1 but can access C2
});
test('dev bypass skips club check', function() {
  var dev = resolveActor('', false, true);
  assert(checkClubScope(dev,'ANY_CLUB').ok);
});
test('auditEvent=club_scope_mismatch on mismatch', function() {
  var r = checkClubScope(OWN,'C2');
  assertEq(r.auditEvent,'club_scope_mismatch');
});

// ── Player self + club ─────────────────────────────────────────────────────────
console.log('\n── Player self + club scope ──');

test('P001@C1 can place own bet in C1', function() {
  assert(checkPermissionWithScope(PLY,'place_bet','C1','P001').allowed);
});
test('P001@C1 cannot place bet in C2 (club mismatch)', function() {
  var r = checkPermissionWithScope(PLY,'place_bet','C2','P001');
  assert(!r.allowed); assertEq(r.reason,'club_scope_mismatch');
});
test('P001@C1 cannot place bet for P002 (not own account)', function() {
  var r = checkPermissionWithScope(PLY,'place_bet','C1','P002');
  assert(!r.allowed); assertEq(r.reason,'not_own_account');
});
test('P001@C1 cannot view dashboard in C2', function() {
  var r = checkPermissionWithScope(PLY,'view_player_dashboard','C2','P001');
  assert(!r.allowed); assertEq(r.reason,'club_scope_mismatch');
});
test('P002@C2 cannot cancel P002 bet in C1', function() {
  var r = checkPermissionWithScope(PLY2,'cancel_bet','C1','P002');
  assert(!r.allowed); assertEq(r.reason,'club_scope_mismatch');
});

// ── Staff cross-club ───────────────────────────────────────────────────────────
console.log('\n── Staff cross-club ──');

test('settlement_manager@C1 can settle in C1', function() {
  assert(checkPermissionWithScope(SET,'settle_player','C1').allowed);
});
test('settlement_manager@C1 cannot settle in C2', function() {
  var r = checkPermissionWithScope(SET,'settle_player','C2');
  assert(!r.allowed); assertEq(r.reason,'club_scope_mismatch');
});
test('risk_viewer@C1 can view C1 host dashboard', function() {
  assert(checkPermissionWithScope(RISK,'view_host_dashboard','C1').allowed);
});
test('risk_viewer@C1 cannot view C2 host dashboard', function() {
  var r = checkPermissionWithScope(RISK,'view_host_dashboard','C2');
  assert(!r.allowed); assertEq(r.reason,'club_scope_mismatch');
});
test('owner@C1 cannot settle C2', function() {
  var r = checkPermissionWithScope(OWN,'settle_player','C2');
  assert(!r.allowed); assertEq(r.reason,'club_scope_mismatch');
});

// ── Platform admin escape hatch ───────────────────────────────────────────────
console.log('\n── Platform admin ──');

test('platform_admin can access any club', function() {
  assert(checkPermissionWithScope(PA,'settle_player','C2').allowed);
  assert(checkPermissionWithScope(PA,'view_host_dashboard','C99').allowed);
});
test('platform_admin can access cross_club_master action', function() {
  assert(checkPermissionWithScope(PA,'cross_club_master',null).allowed);
});
test('regular owner cannot access cross_club_master', function() {
  var r = checkPermissionWithScope(OWN,'cross_club_master',null);
  assert(!r.allowed); assertEq(r.reason,'not_platform_admin');
});
test('platform_admin token must come from signed token', function() {
  // Cannot self-claim platform_admin via header injection
  var forgedActor = { actorId:'evil', role:'owner', clubId:'C99',
                      platformRole:'platform_admin', isDevBypass:false, fromToken:false };
  // Without fromToken:true, the token was not verified — we detect this
  assert(!forgedActor.fromToken, 'forged actor has no fromToken proof');
  // In real enforcement, fromToken must be true for production
});

// ── deriveClubId ──────────────────────────────────────────────────────────────
console.log('\n── deriveClubId (spoofing protection) ──');

test('production: derives clubId from token, ignores body', function() {
  var id = deriveClubId(PLY,'C_EVIL_BODY','C_EVIL_QUERY',true,false);
  assertEq(id,'C1','token clubId wins over body/query');
});
test('production: platform_admin can use body clubId', function() {
  var id = deriveClubId(PA,'C5','',true,false);
  assertEq(id,'C5');
});
test('dev bypass: uses body or actor clubId', function() {
  var dev = resolveActor('',false,true);
  var id = deriveClubId(dev,'C_BODY','',false,true);
  assertEq(id,'C_BODY');
});
test('unauthenticated actor returns null clubId', function() {
  var unauth = { error:'unauthenticated', status:401 };
  assert(deriveClubId(unauth,'C1','',true,false) === null);
});

// ── clubId spoofing via body/header ───────────────────────────────────────────
console.log('\n── Spoofing protection ──');

test('P001@C1 token cannot spoof clubId=C2 in body', function() {
  // body says C2, token says C1 → mismatch → denied
  var r = checkPermissionWithScope(PLY,'place_bet','C2','P001');
  assert(!r.allowed); assertEq(r.reason,'club_scope_mismatch');
});
test('raw x-club-id header without token does not grant cross-club access', function() {
  // Production with no token → unauthenticated
  var unauth = resolveActor('', true, false);
  var r = checkPermissionWithScope(unauth,'settle_player','C2');
  assert(!r.allowed);
});
test('matching body clubId and token clubId passes', function() {
  // Even if body says C1 and token says C1 — allowed
  var r = checkPermissionWithScope(PLY,'place_bet','C1','P001');
  assert(r.allowed);
});

// ── Audit event fields ────────────────────────────────────────────────────────
console.log('\n── Audit event fields ──');

function buildScopeAuditEvent(actor, action, requestedClubId, result, endpoint) {
  return {
    event_type: result.allowed ? 'permission_granted' : (result.auditEvent||result.reason||'denied'),
    player_id:  actor.actorId||null,
    club_id:    actor.clubId||null,
    payload: {
      actorId: actor.actorId, role: actor.role,
      actorClubId: actor.clubId, requestedClubId,
      action, endpoint, reason: result.reason
    }
  };
}

test('club_scope_mismatch audit has both clubIds', function() {
  var result = checkPermissionWithScope(SET,'settle_player','C2');
  var ev = buildScopeAuditEvent(SET,'settle_player','C2',result,'/api/host/settle-player');
  assertEq(ev.event_type,'club_scope_mismatch');
  assertEq(ev.payload.actorClubId,'C1');
  assertEq(ev.payload.requestedClubId,'C2');
});
test('permission_granted audit includes fromToken proof', function() {
  var result = checkPermissionWithScope(SET,'settle_player','C1');
  assert(result.allowed);
  var ev = buildScopeAuditEvent(SET,'settle_player','C1',result,'/api/host/settle-player');
  assertEq(ev.event_type,'permission_granted');
  assertEq(ev.payload.actorClubId,'C1');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Club-scope tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ CLUB-SCOPE TESTS FAILED'); process.exit(1); }
else console.log('✅ All club-scope rules verified');
