/**
 * PocketBooks Sports — Ops Task 3: Frontend Smoke Check Tests
 * Run: node tests/verify-frontend.test.js
 * Pure logic — no network.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b));
}

// ── Inline core logic mirroring verify-frontend.js ───────────────────────────

const REQUIRED_ENV = ['VERIFY_FRONTEND_URL'];

function checkVerifyEnv(env) {
  var missing = REQUIRED_ENV.filter(function(k){ return !env[k]; });
  return { ok: missing.length === 0, missing };
}

// Markers that must be present in a valid index.html
const REQUIRED_MARKERS = [
  { key:'sportsbook_section', pattern:'sportsbook',        desc:'Sportsbook section' },
  { key:'bet_slip',           pattern:'bet-slip',          desc:'Bet slip element' },
  { key:'my_bets',            pattern:'my-bets',           desc:'My Bets section' },
  { key:'pb_fetch',           pattern:'_pbFetch',          desc:'API fetch function' },
  { key:'admin_panel',        pattern:'_admin-system-panel',desc:'Admin system panel' },
];

// Strings that indicate a broken deploy
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

function checkHtmlMarkers(html) {
  var missing  = [];
  var present  = [];
  REQUIRED_MARKERS.forEach(function(m) {
    if (html.includes(m.pattern)) present.push(m.desc);
    else missing.push(m.desc);
  });
  return { ok: missing.length === 0, present, missing };
}

function checkFatalStrings(html) {
  var found = FATAL_STRINGS.filter(function(s){ return html.includes(s); });
  return { ok: found.length === 0, found };
}

function extractAssets(html, baseUrl) {
  var assets = [];
  // src="..." and href="..." that look like local JS/CSS
  var re = /(?:src|href)="([^"]+\.(?:js|css))"/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var url = m[1];
    if (url.startsWith('http://') || url.startsWith('https://')) {
      assets.push(url);
    } else if (url.startsWith('/')) {
      var base = new URL(baseUrl);
      assets.push(base.origin + url);
    }
    // skip relative paths without leading slash (uncommon in built apps)
  }
  return [...new Set(assets)]; // dedupe
}

function buildResult(name, ok, detail) {
  return { name, ok:!!ok, detail: detail||null };
}

function formatReport(results, baseUrl) {
  var lines = ['\n── Frontend Smoke Check ' + (baseUrl||'') + ' ──'];
  results.forEach(function(r) {
    lines.push('  ' + (r.ok ? '✅' : '❌') + ' ' + r.name +
      (r.detail ? ': ' + r.detail : ''));
  });
  var allPass = results.every(function(r){ return r.ok; });
  lines.push('─'.repeat(56));
  lines.push(allPass
    ? '  🟢 PASS — frontend production ready'
    : '  🔴 FAIL — fix issues above before go-live');
  return lines.join('\n');
}

// ── Mock HTML fixtures ────────────────────────────────────────────────────────

function mockGoodHtml() {
  return [
    '<!DOCTYPE html><html><head><title>PocketBooks Sports</title>',
    '<link rel="stylesheet" href="/styles.css">',
    '<script src="/app.js"></script>',
    '</head><body>',
    '<div id="sportsbook"></div>',
    '<div id="bet-slip"></div>',
    '<div id="my-bets"></div>',
    '<div id="_admin-system-panel"></div>',
    '<script>function _pbFetch(){}</script>',
    '</body></html>'
  ].join('\n');
}

function mockMissingMarkerHtml() {
  // Missing bet-slip and _admin-system-panel
  return [
    '<!DOCTYPE html><html><head><title>PocketBooks Sports</title></head><body>',
    '<div id="sportsbook"></div>',
    '<div id="my-bets"></div>',
    '<script>function _pbFetch(){}</script>',
    '</body></html>'
  ].join('\n');
}

function mockFatalHtml() {
  return '<html><body>Application error: SyntaxError in chunk-abc.js</body></html>';
}

function mockBrokenDeployHtml() {
  return '<html><body>502 Bad Gateway</body></html>';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Script exists ──');

test('verify-frontend.js exists in scripts/', function() {
  var fs   = require('fs');
  var path = require('path');
  var p    = path.join(__dirname, '..', 'scripts', 'verify-frontend.js');
  assert(fs.existsSync(p), 'scripts/verify-frontend.js not found');
});

test('package.json has verify:frontend script', function() {
  var pkg = require('../package.json');
  assert(pkg.scripts && pkg.scripts['verify:frontend'],
    'verify:frontend not in package.json');
  assert(pkg.scripts['verify:frontend'].includes('verify-frontend'),
    'verify:frontend should invoke verify-frontend.js');
});

console.log('\n── Env var validation ──');

test('VERIFY_FRONTEND_URL present → ok', function() {
  var r = checkVerifyEnv({ VERIFY_FRONTEND_URL:'https://pocketbooks-sports.vercel.app' });
  assert(r.ok); assertEq(r.missing.length, 0);
});

test('missing VERIFY_FRONTEND_URL → not ok', function() {
  var r = checkVerifyEnv({});
  assert(!r.ok); assert(r.missing.includes('VERIFY_FRONTEND_URL'));
});

console.log('\n── checkHtmlMarkers ──');

test('good HTML with all markers → ok, no missing', function() {
  var r = checkHtmlMarkers(mockGoodHtml());
  assert(r.ok, 'ok: missing='+r.missing.join(','));
  assertEq(r.missing.length, 0);
  assert(r.present.length > 0, 'has present markers');
});

test('missing bet-slip and admin panel → fails', function() {
  var r = checkHtmlMarkers(mockMissingMarkerHtml());
  assert(!r.ok);
  assert(r.missing.includes('Bet slip element'), 'bet-slip missing');
  assert(r.missing.includes('Admin system panel'), 'admin panel missing');
});

test('missing single marker lists that marker', function() {
  var html = mockGoodHtml().replace('bet-slip','NOPE');
  var r = checkHtmlMarkers(html);
  assert(!r.ok);
  assertEq(r.missing.length, 1);
  assert(r.missing[0].includes('Bet slip'));
});

test('present markers listed in present array', function() {
  var r = checkHtmlMarkers(mockGoodHtml());
  assert(r.present.some(function(p){ return p.includes('Sportsbook'); }));
  assert(r.present.some(function(p){ return p.includes('My Bets'); }));
});

console.log('\n── checkFatalStrings ──');

test('clean HTML → no fatal strings', function() {
  var r = checkFatalStrings(mockGoodHtml());
  assert(r.ok); assertEq(r.found.length, 0);
});

test('SyntaxError in HTML → fatal', function() {
  var r = checkFatalStrings(mockFatalHtml());
  assert(!r.ok); assert(r.found.includes('SyntaxError'));
});

test('502 Bad Gateway → fatal', function() {
  var r = checkFatalStrings(mockBrokenDeployHtml());
  assert(!r.ok); assert(r.found.includes('502 Bad Gateway'));
});

test('Application error → fatal', function() {
  var r = checkFatalStrings('<html>Application error: something broke</html>');
  assert(!r.ok);
});

console.log('\n── extractAssets ──');

test('extracts absolute CSS/JS hrefs', function() {
  var html = '<link href="https://cdn.example.com/style.css"><script src="https://cdn.example.com/app.js"></script>';
  var assets = extractAssets(html, 'https://pocketbooks-sports.vercel.app');
  assert(assets.length === 2, 'found 2 assets; got '+assets.length);
  assert(assets.some(function(a){ return a.endsWith('.css'); }));
  assert(assets.some(function(a){ return a.endsWith('.js'); }));
});

test('extracts root-relative assets and prepends origin', function() {
  var html = '<link href="/static/app.css"><script src="/static/main.js"></script>';
  var assets = extractAssets(html, 'https://pocketbooks-sports.vercel.app');
  assert(assets.some(function(a){ return a.startsWith('https://pocketbooks-sports.vercel.app'); }));
});

test('deduplicates repeated asset references', function() {
  var html = '<script src="/app.js"></script><script src="/app.js"></script>';
  var assets = extractAssets(html, 'https://example.com');
  assertEq(assets.length, 1, 'deduplicated');
});

test('ignores non-asset hrefs (html pages, anchors)', function() {
  var html = '<a href="/page.html">link</a><link href="/style.css">';
  var assets = extractAssets(html, 'https://example.com');
  assert(assets.every(function(a){ return a.endsWith('.css') || a.endsWith('.js'); }));
});

console.log('\n── Report formatting ──');

test('all pass → 🟢 PASS', function() {
  var results = [
    buildResult('HTTP 200', true),
    buildResult('HTML markers', true),
    buildResult('No fatal errors', true),
  ];
  var report = formatReport(results, 'https://example.vercel.app');
  assert(report.includes('🟢 PASS'));
  assert(!report.includes('🔴 FAIL'));
});

test('any fail → 🔴 FAIL', function() {
  var results = [
    buildResult('HTTP 200', true),
    buildResult('HTML markers', false, 'missing: Bet slip element'),
  ];
  var report = formatReport(results, 'https://example.vercel.app');
  assert(report.includes('🔴 FAIL'));
});

test('missing markers listed in report detail', function() {
  var r = checkHtmlMarkers(mockMissingMarkerHtml());
  var result = buildResult('HTML markers', r.ok, r.missing.length ? 'missing: '+r.missing.join(', ') : 'all present');
  assert(result.detail.includes('Bet slip element'));
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Verify-frontend tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ VERIFY-FRONTEND TESTS FAILED'); process.exit(1); }
else console.log('✅ All verify-frontend checks passed');
