#!/usr/bin/env node
/**
 * PocketBooks Sports — Production Verification Script
 * Usage:
 *   VERIFY_BASE_URL=https://... VERIFY_OWNER_ID=H1 VERIFY_CLUB_ID=C1 node scripts/verify-production.js
 *
 * Or via package script:
 *   npm run verify:production
 *
 * Required env vars:
 *   VERIFY_BASE_URL     — backend Railway URL (no trailing slash)
 *   VERIFY_OWNER_ID     — actorId of a full_admin/owner in the club
 *   VERIFY_CLUB_ID      — clubId to authenticate against
 *
 * Optional env vars:
 *   VERIFY_PLAYER_ID    — actorId of a player (for player token check)
 *   VERIFY_TIMEOUT_MS   — HTTP timeout per check (default: 10000)
 */
'use strict';

const https = require('https');
const http  = require('http');

const BASE_URL    = (process.env.VERIFY_BASE_URL  || '').replace(/\/$/, '');
const OWNER_ID    = process.env.VERIFY_OWNER_ID   || '';
const PLAYER_ID   = process.env.VERIFY_PLAYER_ID  || '';
const CLUB_ID     = process.env.VERIFY_CLUB_ID    || '';
const TIMEOUT_MS  = parseInt(process.env.VERIFY_TIMEOUT_MS || '10000', 10);

// ── Env preflight ─────────────────────────────────────────────────────────────

const REQUIRED = [
  { key:'VERIFY_BASE_URL',  val:BASE_URL  },
  { key:'VERIFY_OWNER_ID',  val:OWNER_ID  },
  { key:'VERIFY_CLUB_ID',   val:CLUB_ID   },
];

function checkEnv() {
  var missing = REQUIRED.filter(function(v){ return !v.val; }).map(function(v){ return v.key; });
  return { ok: missing.length === 0, missing };
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function _fetch(method, path, body, token, timeoutMs) {
  return new Promise(function(resolve) {
    var url;
    try { url = new URL(BASE_URL + path); }
    catch(_) { return resolve({ ok:false, error:'invalid_base_url:'+BASE_URL }); }
    var driver = url.protocol === 'https:' ? https : http;
    var bodyStr = body ? JSON.stringify(body) : null;
    var headers = { 'Content-Type':'application/json', 'Accept':'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    var req = driver.request({
      hostname: url.hostname, port: url.port || (url.protocol==='https:'?443:80),
      path: url.pathname + (url.search||''), method, headers
    }, function(res) {
      var data = '';
      res.on('data', function(c){ data += c; });
      res.on('end', function() {
        try { resolve(Object.assign({ _status:res.statusCode }, JSON.parse(data))); }
        catch(_) { resolve({ ok:false, _status:res.statusCode, error:'invalid_json', raw:data.slice(0,80) }); }
      });
    });
    req.setTimeout(timeoutMs, function(){ req.destroy(); resolve({ ok:false, error:'timeout' }); });
    req.on('error', function(e){ resolve({ ok:false, error:e.message }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function _get(path, token)       { return _fetch('GET',  path, null, token, TIMEOUT_MS); }
function _post(path, body, token){ return _fetch('POST', path, body, token, TIMEOUT_MS); }

// ── Secret scrubbing ──────────────────────────────────────────────────────────

function scrub(obj) {
  var str = JSON.stringify(obj)||'';
  var PATTERNS = [
    /eyJ[A-Za-z0-9._-]{20,}/g,
    /"token"\s*:\s*"[^"]+"/g,
    /"secret"\s*:\s*"[^"]+"/g,
    /"key"\s*:\s*"[^"]+"/g,
  ];
  PATTERNS.forEach(function(p){ str = str.replace(p, '"[REDACTED]"'); });
  return str;
}

// ── Result builder ────────────────────────────────────────────────────────────

function result(name, ok, detail) {
  return { name, ok:!!ok, detail:detail||null };
}

// ── Report ────────────────────────────────────────────────────────────────────

function printReport(results) {
  console.log('\n── Production Verify Report ' + BASE_URL + ' ──');
  results.forEach(function(r) {
    console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.name +
      (r.detail ? ': ' + r.detail : ''));
  });
  var allPass = results.every(function(r){ return r.ok; });
  console.log('─'.repeat(60));
  if (allPass) {
    console.log('  🟢 PASS — production ready');
  } else {
    console.log('  🔴 FAIL — fix issues above before go-live');
    var failed = results.filter(function(r){ return !r.ok; });
    failed.forEach(function(r){ console.log('     → ' + r.name + ': ' + (r.detail||'failed')); });
  }
  return allPass;
}

// ── Checks ────────────────────────────────────────────────────────────────────

async function checkHealth() {
  var r = await _get('/api/health');
  if (!r.ok || r.dbStatus !== 'connected')
    return result('Health', false, 'db='+r.dbStatus+' odds='+r.oddsStatus+(r.error?' err='+r.error:''));
  return result('Health', true, 'db=connected odds='+r.oddsStatus+' uptime='+r.uptime+'s');
}

async function checkEnvCheck(token) {
  var r = await _get('/api/admin/env-check', token);
  if (!r.ok) {
    var missing = (r.missing||[]).map(function(m){ return m.key||m; }).join(',');
    return result('Env readiness', false, 'missing='+missing+(r.error?' err='+r.error:''));
  }
  var warnCount = (r.warnings||[]).length;
  return result('Env readiness', true,
    'all required present' + (warnCount?' warnings='+warnCount:''));
}

async function checkAuthToken(actorId, label) {
  var r = await _post('/api/auth/token', { actorId, clubId:CLUB_ID });
  if (!r.ok || !r.token)
    return { ok:false, token:null, checkResult: result('Auth token ('+label+')', false,
      r.error||'no token returned') };
  // Token is captured but NEVER printed
  return { ok:true, token:r.token, checkResult: result('Auth token ('+label+')', true, 'issued') };
}

async function checkDiagnostics(token) {
  var r = await _get('/api/admin/diagnostics', token);
  if (!r.ok)
    return result('Diagnostics', false, r.error||'_status='+r._status);
  return result('Diagnostics', true,
    'rpcFail='+r.rpcFailCount+' sessions='+r.activeSessions+
    ' jobs='+(r.jobCounts?(r.jobCounts.pending||0)+' pending':'n/a'));
}

async function checkMarkets(token) {
  var r = await _get('/api/markets/status', token);
  if (r._status === 403 || r._status === 401)
    return result('Markets status', true, 'endpoint exists (auth required, token role limited)');
  if (!r.ok && r._status !== 200)
    return result('Markets status', false, r.error||'_status='+r._status);
  return result('Markets status', true,
    'open='+(r.openCount||'?')+' suspended='+(r.suspendedCount||'?'));
}

async function checkCryptoRecon(token) {
  var r = await _get('/api/admin/crypto/reconciliation', token);
  if (!r.ok)
    return result('Crypto reconciliation (optional)', false, r.error||'_status='+r._status);
  return result('Crypto reconciliation (optional)', true,
    'intents='+(r.meta&&r.meta.totalIntents||0)+
    ' flagged='+(r.meta&&r.meta.totalFlagged||0));
}

async function checkPlayerToken() {
  if (!PLAYER_ID) return result('Auth token (player)', true, 'skipped — VERIFY_PLAYER_ID not set');
  var r = await _post('/api/auth/token', { actorId:PLAYER_ID, clubId:CLUB_ID });
  if (!r.ok || !r.token)
    return result('Auth token (player)', false, r.error||'no token');
  return result('Auth token (player)', true, 'issued');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍 Pocketbooks Sports — Production Verification');
  console.log('   Target: ' + (BASE_URL||'(not set)'));
  console.log('   Club:   ' + (CLUB_ID||'(not set)'));
  console.log('   Owner:  ' + (OWNER_ID||'(not set)') + '\n');

  // Env preflight
  var envCheck = checkEnv();
  if (!envCheck.ok) {
    console.error('❌ Missing required env vars: ' + envCheck.missing.join(', '));
    console.error('   Set: VERIFY_BASE_URL, VERIFY_OWNER_ID, VERIFY_CLUB_ID');
    process.exit(1);
  }

  var results = [];

  // 1. Health — unauthenticated
  results.push(await checkHealth());

  // 2. Auth token (owner) — get token for subsequent checks
  var ownerAuth = await checkAuthToken(OWNER_ID, 'owner');
  results.push(ownerAuth.checkResult);
  var ownerToken = ownerAuth.token;

  // 3. Auth token (player) — optional
  results.push(await checkPlayerToken());

  // 4. Env readiness — requires admin token
  if (ownerToken) {
    results.push(await checkEnvCheck(ownerToken));
    results.push(await checkDiagnostics(ownerToken));
    results.push(await checkMarkets(ownerToken));
    results.push(await checkCryptoRecon(ownerToken));
  } else {
    ['Env readiness','Diagnostics','Markets status','Crypto reconciliation (optional)'].forEach(function(n){
      results.push(result(n, false, 'skipped — no owner token'));
    });
  }

  var pass = printReport(results);
  process.exit(pass ? 0 : 1);
}

main().catch(function(e){
  console.error('❌ Verify script crashed:', e.message);
  process.exit(1);
});
