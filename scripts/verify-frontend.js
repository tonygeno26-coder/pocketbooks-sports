#!/usr/bin/env node
/**
 * PocketBooks Sports — Frontend Production Smoke Check
 * Usage:
 *   VERIFY_FRONTEND_URL=https://pocketbooks-sports.vercel.app node scripts/verify-frontend.js
 *
 * Or via package script:
 *   npm run verify:frontend
 *
 * Required env vars:
 *   VERIFY_FRONTEND_URL       — Vercel frontend URL (no trailing slash)
 *
 * Optional env vars:
 *   VERIFY_EXPECTED_TITLE     — Expected <title> substring (default: PocketBooks Sports)
 *   VERIFY_PLAYER_URL         — Player-facing page URL to spot-check
 *   VERIFY_TIMEOUT_MS         — Per-request timeout in ms (default: 10000)
 *   VERIFY_CHECK_ASSETS       — Set to "true" to HEAD-check discovered assets (slower)
 */
'use strict';

const https  = require('https');
const http   = require('http');

const FRONTEND_URL     = (process.env.VERIFY_FRONTEND_URL   || '').replace(/\/$/, '');
const EXPECTED_TITLE   =  process.env.VERIFY_EXPECTED_TITLE || 'PocketBooks Sports';
const PLAYER_URL       = (process.env.VERIFY_PLAYER_URL     || '').replace(/\/$/, '');
const TIMEOUT_MS       = parseInt(process.env.VERIFY_TIMEOUT_MS || '10000', 10);
const CHECK_ASSETS     =  process.env.VERIFY_CHECK_ASSETS   === 'true';

// ── Env preflight ─────────────────────────────────────────────────────────────

function checkEnv() {
  var missing = !FRONTEND_URL ? ['VERIFY_FRONTEND_URL'] : [];
  return { ok: missing.length === 0, missing };
}

// ── Markers that must be present in a healthy index.html ─────────────────────

const REQUIRED_MARKERS = [
  { pattern:'sportsbook',         desc:'Sportsbook section'   },
  { pattern:'bet-slip',           desc:'Bet slip element'     },
  { pattern:'my-bets',            desc:'My Bets section'      },
  { pattern:'_pbFetch',           desc:'API fetch function'   },
  { pattern:'_admin-system-panel',desc:'Admin system panel'   },
];

// Strings that signal a broken/crashed deploy
const FATAL_STRINGS = [
  'SyntaxError',
  'ReferenceError: ',
  'Cannot find module',
  'MODULE_NOT_FOUND',
  'ENOENT',
  'Application error',
  'Build failed',
  '502 Bad Gateway',
  '503 Service Unavailable',
];

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function _request(method, rawUrl, timeoutMs) {
  return new Promise(function(resolve) {
    var url;
    try { url = new URL(rawUrl); }
    catch(_) { return resolve({ ok:false, status:0, body:'', error:'invalid_url:'+rawUrl }); }
    var driver = url.protocol === 'https:' ? https : http;
    var chunks = [];
    var req = driver.request({
      hostname: url.hostname,
      port:     url.port || (url.protocol==='https:' ? 443 : 80),
      path:     url.pathname + (url.search||''),
      method,
      headers:  { 'Accept':'text/html,application/json', 'User-Agent':'PBSmokeCheck/1.0' }
    }, function(res) {
      res.on('data', function(c){ chunks.push(c); });
      res.on('end', function() {
        var body = Buffer.concat(chunks).toString('utf8');
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400,
                  status: res.statusCode, body });
      });
    });
    req.setTimeout(timeoutMs, function(){ req.destroy(); resolve({ ok:false, status:0, body:'', error:'timeout' }); });
    req.on('error', function(e){ resolve({ ok:false, status:0, body:'', error:e.message }); });
    req.end();
  });
}

function _get(url)  { return _request('GET',  url, TIMEOUT_MS); }
function _head(url) { return _request('HEAD', url, Math.min(TIMEOUT_MS, 5000)); }

// ── Analysis helpers ─────────────────────────────────────────────────────────

function checkHtmlMarkers(html) {
  var missing = [], present = [];
  REQUIRED_MARKERS.forEach(function(m) {
    (html.includes(m.pattern) ? present : missing).push(m.desc);
  });
  return { ok: missing.length === 0, present, missing };
}

function checkFatalStrings(html) {
  var found = FATAL_STRINGS.filter(function(s){ return html.includes(s); });
  return { ok: found.length === 0, found };
}

function extractTitle(html) {
  var m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function extractAssets(html, baseUrl) {
  var assets = [];
  var re = /(?:src|href)="([^"]+\.(?:js|css))"/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var url = m[1];
    if (url.startsWith('http://') || url.startsWith('https://')) {
      assets.push(url);
    } else if (url.startsWith('/')) {
      try { assets.push(new URL(baseUrl).origin + url); } catch(_){}
    }
  }
  return [...new Set(assets)];
}

// ── Result builder + report ───────────────────────────────────────────────────

function result(name, ok, detail) {
  return { name, ok:!!ok, detail: detail||null };
}

function printReport(results) {
  console.log('\n── Frontend Smoke Check ' + FRONTEND_URL + ' ──');
  results.forEach(function(r) {
    console.log('  ' + (r.ok ? '✅' : '❌') + ' ' + r.name +
      (r.detail ? ': ' + r.detail : ''));
  });
  var allPass = results.every(function(r){ return r.ok; });
  console.log('─'.repeat(58));
  if (allPass) {
    console.log('  🟢 PASS — frontend production ready');
  } else {
    console.log('  🔴 FAIL — fix issues above before go-live');
    results.filter(function(r){ return !r.ok; }).forEach(function(r){
      console.log('     → ' + r.name + ': ' + (r.detail||'failed'));
    });
  }
  return allPass;
}

// ── Checks ────────────────────────────────────────────────────────────────────

async function checkMainPage() {
  console.log('  Fetching ' + FRONTEND_URL + ' ...');
  var r = await _get(FRONTEND_URL);
  if (!r.ok)
    return { result: result('HTTP 200', false, 'status='+r.status+(r.error?' err='+r.error:'')), html:null };
  return { result: result('HTTP 200', true, 'status='+r.status), html: r.body };
}

async function checkPlayerPage() {
  if (!PLAYER_URL) return result('Player page (optional)', true, 'skipped — VERIFY_PLAYER_URL not set');
  var r = await _get(PLAYER_URL);
  return result('Player page', r.ok, 'status='+r.status+(r.error?' err='+r.error:''));
}

async function checkAssets(html) {
  if (!CHECK_ASSETS) return result('Asset check', true, 'skipped — set VERIFY_CHECK_ASSETS=true to enable');
  var assets = extractAssets(html, FRONTEND_URL);
  if (!assets.length) return result('Asset check', true, 'no same-origin assets found');
  var broken = [];
  for (var i=0; i<assets.length; i++) {
    var r = await _head(assets[i]);
    if (!r.ok) broken.push(assets[i].split('/').pop()+'('+r.status+')');
  }
  if (broken.length)
    return result('Asset check', false, 'broken: '+broken.join(', '));
  return result('Asset check', true, assets.length+' assets ok');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍 Pocketbooks Sports — Frontend Smoke Check');
  console.log('   Target:  ' + (FRONTEND_URL||'(not set)'));
  console.log('   Title:   ' + EXPECTED_TITLE);
  console.log('   Assets:  ' + (CHECK_ASSETS?'checking':'skipped (set VERIFY_CHECK_ASSETS=true)') + '\n');

  // Env preflight
  var envOk = checkEnv();
  if (!envOk.ok) {
    console.error('❌ Missing required env vars: ' + envOk.missing.join(', '));
    console.error('   Set: VERIFY_FRONTEND_URL=https://your-app.vercel.app');
    process.exit(1);
  }

  var results = [];

  // 1. Fetch main page
  var main_ = await checkMainPage();
  results.push(main_.result);
  var html = main_.html || '';

  // 2. Title check
  if (html) {
    var title = extractTitle(html);
    var titleOk = title && title.includes(EXPECTED_TITLE);
    results.push(result('Page title', titleOk,
      titleOk ? '"'+title+'"' : 'got "'+title+'" expected to contain "'+EXPECTED_TITLE+'"'));
  }

  // 3. Required HTML markers
  if (html) {
    var markers = checkHtmlMarkers(html);
    results.push(result('HTML markers', markers.ok,
      markers.ok
        ? markers.present.length + ' markers present'
        : 'missing: ' + markers.missing.join(', ')));
  }

  // 4. Fatal error strings
  if (html) {
    var fatal = checkFatalStrings(html);
    results.push(result('No fatal errors', fatal.ok,
      fatal.ok ? 'clean' : 'found: ' + fatal.found.join(', ')));
  }

  // 5. Player page (optional)
  results.push(await checkPlayerPage());

  // 6. Asset check (opt-in)
  if (html) {
    results.push(await checkAssets(html));
  }

  var pass = printReport(results);
  process.exit(pass ? 0 : 1);
}

main().catch(function(e){
  console.error('❌ Verify-frontend script crashed:', e.message);
  process.exit(1);
});
