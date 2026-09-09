#!/usr/bin/env node
/**
 * PocketBooks Sports — logo + player-photo audit
 *
 * Usage:
 *   node scripts/image-audit.js
 *   node scripts/image-audit.js --out /tmp/image-audit.json
 *   node scripts/image-audit.js --skip-http          # map resolve only
 *   node scripts/image-audit.js --live               # include live /api/odds entities
 *   API=https://... node scripts/image-audit.js --live
 *
 * Reports per sport: entities, resolved, missing, broken, unresolved, ambiguous, coverage %.
 * Correct identity > fake completeness — does not invent matches.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');
var http = require('http');
var vm = require('vm');
var { URL } = require('url');

var ROOT = path.join(__dirname, '..');
var API = process.env.API || process.env.PBS_API ||
  'https://pocketbooks-sports-backend-production.up.railway.app';

var args = process.argv.slice(2);
function hasFlag(f) { return args.indexOf(f) >= 0; }
function flagVal(f, def) {
  var i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

var SKIP_HTTP = hasFlag('--skip-http');
var DO_LIVE = hasFlag('--live') || !hasFlag('--maps-only');
var OUT = flagVal('--out', path.join('/tmp', 'image-audit.json'));
var CONCURRENCY = parseInt(flagVal('--concurrency', '8'), 10) || 8;
var TIMEOUT_MS = parseInt(flagVal('--timeout', '10000'), 10) || 10000;

var TEAM_SPORTS = ['nfl', 'mlb', 'nba', 'nhl', 'ncaafb', 'ncaab', 'wnba', 'mls'];
var PLAYER_SPORTS = ['mlb', 'nba', 'nfl', 'tennis', 'soccer', 'mma', 'golf'];
var LIVE_SPORTS = [
  'nfl', 'ncaaf', 'mlb', 'nba', 'ncaab', 'nhl', 'soccer',
  'tennis', 'golf', 'mma', 'boxing', 'rugby', 'nascar'
];

function loadSandbox() {
  var sandbox = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    document: {
      createElement: function () { return {}; },
      querySelectorAll: function () { return []; },
      getElementById: function () { return null; }
    },
    localStorage: {
      getItem: function () { return null; },
      setItem: function () {},
      removeItem: function () {},
      key: function () { return null; },
      length: 0
    },
    fetch: async function () { return { ok: false, json: async function () { return {}; } }; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'player-photos.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'team-logos.js'), 'utf8'), sandbox);
  return sandbox;
}

function httpStatus(url) {
  return new Promise(function (resolve) {
    try {
      var u = new URL(url);
      var lib = u.protocol === 'http:' ? http : https;
      var req = lib.request({
        method: 'HEAD',
        hostname: u.hostname,
        path: u.pathname + u.search,
        protocol: u.protocol,
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': 'PocketBooks-ImageAudit/1.0', Accept: '*/*' }
      }, function (res) {
        // Follow one redirect
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpStatus(res.headers.location).then(resolve);
          res.resume();
          return;
        }
        resolve(res.statusCode || 0);
        res.resume();
      });
      req.on('error', function () { resolve(0); });
      req.on('timeout', function () { req.destroy(); resolve(0); });
      req.end();
    } catch (_e) {
      resolve(0);
    }
  });
}

async function mapPool(items, worker, concurrency) {
  var idx = 0;
  var out = new Array(items.length);
  async function pump() {
    while (idx < items.length) {
      var i = idx++;
      out[i] = await worker(items[i], i);
    }
  }
  var jobs = [];
  var n = Math.min(concurrency || 8, Math.max(1, items.length));
  for (var w = 0; w < n; w++) jobs.push(pump());
  await Promise.all(jobs);
  return out;
}

function emptySportBucket() {
  return {
    entities: 0,
    resolved: 0,
    missingUrl: 0,
    broken: 0,
    unresolved: 0,
    ambiguous: 0,
    coveragePct: 0,
    unresolvedNames: [],
    ambiguousNames: [],
    brokenUrls: []
  };
}

function parseObjectKeys(body) {
  var names = [];
  var seen = {};
  // Match 'key': or "key": including escaped quotes inside
  var re = /(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)")\s*:/g;
  var mm;
  while ((mm = re.exec(body))) {
    var raw = mm[1] != null ? mm[1] : mm[2];
    if (raw == null) continue;
    var name = String(raw).replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (!name || name.length < 2) continue;
    if (/^\s/.test(name)) continue;
    if (seen[name]) continue;
    seen[name] = true;
    names.push(name);
  }
  return names;
}

function finalize(bucket) {
  bucket.entities = bucket.entities || 0;
  var ok = bucket.resolved || 0;
  bucket.coveragePct = bucket.entities
    ? Math.round((ok / bucket.entities) * 1000) / 10
    : 0;
  return bucket;
}

async function auditMappedTeams(sandbox) {
  var bySport = {};
  TEAM_SPORTS.forEach(function (s) { bySport[s] = emptySportBucket(); });

  var checks = [];
  TEAM_SPORTS.forEach(function (sport) {
    var maps = sandbox.TEAM_LOGO_MAPS || null;
    // Enumerate via known full maps exposed indirectly through getTeamAbbrev
    var fullNames = [];
    try {
      // Pull from module internals via probing common names is fragile —
      // instead parse source for FULL maps.
    } catch (_e) {}
    void maps;
    void fullNames;
  });

  // Parse FULL maps from source for deterministic enumeration
  var src = fs.readFileSync(path.join(ROOT, 'team-logos.js'), 'utf8');
  var mapBlocks = {
    nfl: /var NFL_FULL = \{([\s\S]*?)\n  \};/,
    mlb: /var MLB_FULL = \{([\s\S]*?)\n  \};/,
    nba: /var NBA_FULL = \{([\s\S]*?)\n  \};/,
    nhl: /var NHL_FULL = \{([\s\S]*?)\n  \};/,
    wnba: /var WNBA_FULL = \{([\s\S]*?)\n  \};/,
    mls: /var MLS_FULL = \{([\s\S]*?)\n  \};/,
    ncaafb: /var NCAAF_FULL = \{([\s\S]*?)\n  \};/,
    ncaab: /var NCAAB_FULL = \{([\s\S]*?)\n  \};/
  };

  Object.keys(mapBlocks).forEach(function (sport) {
    var m = src.match(mapBlocks[sport]);
    if (!m) return;
    parseObjectKeys(m[1]).forEach(function (name) {
      var url = '';
      try {
        url = sandbox.getTeamLogoDirect(name, sport) || sandbox.getTeamLogo(name, sport, 80) || '';
      } catch (_e) {}
      checks.push({ kind: 'team', sport: sport, name: name, url: url, source: 'map' });
    });
  });

  return checks;
}

async function auditMappedPlayers(sandbox) {
  var src = fs.readFileSync(path.join(ROOT, 'player-photos.js'), 'utf8');
  var checks = [];
  PLAYER_SPORTS.forEach(function (sport) {
    var re = new RegExp('\\n  ' + sport + ': \\{([\\s\\S]*?)\\n  \\}', 'm');
    // Also match nested under VERIFIED_PLAYER_IDS
    var idx = src.indexOf('\n  ' + sport + ': {');
    if (idx < 0) return;
    var brace = src.indexOf('{', idx);
    var depth = 0;
    var end = brace;
    for (var i = brace; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    var body = src.slice(brace + 1, end);
    parseObjectKeys(body).forEach(function (name) {
      var url = '';
      try { url = sandbox.getPlayerHeadshotUrl(name, sport) || ''; } catch (_e) {}
      checks.push({ kind: 'player', sport: sport, name: name, url: url, source: 'verified' });
    });
    void re;
  });

  // Golf / MMA extras in team-logos.js
  ['golf', 'mma'].forEach(function (sport) {
    var getter = sport === 'golf' ? sandbox.getGolfPlayerPhoto : sandbox.getMMAFighterPhoto;
    var mapName = sport === 'golf' ? '_GOLF_VERIFIED_IDS' : '_MMA_VERIFIED_IDS';
    var tl = fs.readFileSync(path.join(ROOT, 'team-logos.js'), 'utf8');
    var idx = tl.indexOf('var ' + mapName + ' = {');
    if (idx < 0) return;
    var brace = tl.indexOf('{', idx);
    var depth = 0;
    var end = brace;
    for (var i = brace; i < tl.length; i++) {
      if (tl[i] === '{') depth++;
      else if (tl[i] === '}') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    var body = tl.slice(brace + 1, end);
    parseObjectKeys(body).forEach(function (name) {
      var url = '';
      try { url = (getter && getter(name)) || sandbox.getPlayerHeadshotUrl(name, sport) || ''; } catch (_e) {}
      checks.push({ kind: 'player', sport: sport, name: name, url: url, source: 'verified-extra' });
    });
  });

  return checks;
}

async function fetchJson(url) {
  return new Promise(function (resolve, reject) {
    try {
      var u = new URL(url);
      var lib = u.protocol === 'http:' ? http : https;
      var req = lib.get(url, {
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'PocketBooks-ImageAudit/1.0',
          Accept: 'application/json'
        }
      }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchJson(res.headers.location).then(resolve, reject);
          res.resume();
          return;
        }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          var raw = Buffer.concat(chunks).toString('utf8') || 'null';
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', function () { req.destroy(); reject(new Error('timeout')); });
    } catch (e) {
      reject(e);
    }
  });
}

async function auditLiveEntities(sandbox) {
  var checks = [];
  for (var si = 0; si < LIVE_SPORTS.length; si++) {
    var sport = LIVE_SPORTS[si];
    var games = [];
    try {
      games = await fetchJson(API + '/api/odds/' + encodeURIComponent(sport));
      if (!Array.isArray(games)) games = [];
      console.log('  live ' + sport + ': ' + games.length + ' events');
    } catch (e) {
      console.warn('  live ' + sport + ' fetch failed: ' + (e && e.message));
      games = [];
    }

    var isIndividual = sport === 'tennis' || sport === 'golf' || sport === 'mma' ||
      sport === 'boxing' || sport === 'nascar';

    games.forEach(function (g) {
      var home = (g && (g.home || g.homeTeam)) || '';
      var away = (g && (g.away || g.awayTeam)) || '';
      var homeLogo = (g && g.homeLogoUrl) || '';
      var awayLogo = (g && g.awayLogoUrl) || '';

      if (isIndividual) {
        [home, away].forEach(function (name) {
          if (!name || /^outright$/i.test(name)) return;
          var url = '';
          try {
            if (sport === 'golf' && sandbox.getGolfPlayerPhoto) url = sandbox.getGolfPlayerPhoto(name) || '';
            else if (sport === 'mma' && sandbox.getMMAFighterPhoto) url = sandbox.getMMAFighterPhoto(name) || '';
            else if (sport === 'tennis' && sandbox.getTennisPlayerPhoto) url = sandbox.getTennisPlayerPhoto(name) || '';
            if (!url) url = sandbox.getPlayerHeadshotUrl(name, sport === 'boxing' ? 'mma' : sport) || '';
          } catch (_e) {}
          checks.push({
            kind: 'player',
            sport: sport,
            name: name,
            url: url,
            source: 'live',
            providerLogo: ''
          });
        });
      } else {
        [[home, homeLogo], [away, awayLogo]].forEach(function (pair) {
          var name = pair[0];
          var providerLogo = pair[1] || '';
          if (!name) return;
          var url = providerLogo;
          if (!url) {
            try {
              var mapSport = sport === 'ncaaf' ? 'ncaafb' : (sport === 'soccer' ? 'mls' : sport);
              if (sport === 'soccer' && sandbox.getSoccerTeamLogo) {
                url = sandbox.getSoccerTeamLogo(name) || '';
              } else {
                url = sandbox.getTeamLogoDirect(name, mapSport) || sandbox.getTeamLogo(name, mapSport, 80) || '';
              }
            } catch (_e) {}
          }
          checks.push({
            kind: 'team',
            sport: sport,
            name: name,
            url: url,
            source: 'live',
            providerLogo: providerLogo
          });
        });
      }
    });

    // Player props (where available)
    if (sport === 'mlb' || sport === 'nfl' || sport === 'nba' || sport === 'nhl' || sport === 'ncaaf') {
      try {
        var propsPayload = await fetchJson(API + '/api/props/' + encodeURIComponent(sport));
        var props = (propsPayload && propsPayload.props) || [];
        var seen = {};
        props.forEach(function (p) {
          var name = (p && p.playerName) || '';
          if (!name || seen[name]) return;
          seen[name] = true;
          var url = '';
          try { url = sandbox.getPlayerHeadshotUrl(name, sport) || ''; } catch (_e) {}
          checks.push({ kind: 'player', sport: sport, name: name, url: url, source: 'live-props' });
        });
      } catch (_e) {}
    }
  }
  return checks;
}

async function classifyChecks(checks) {
  var logos = {};
  var photos = {};
  var statusCache = {};

  async function statusOf(url) {
    if (!url) return 0;
    if (statusCache[url] != null) return statusCache[url];
    if (SKIP_HTTP) {
      statusCache[url] = 200;
      return 200;
    }
    var code = await httpStatus(url);
    statusCache[url] = code;
    return code;
  }

  // Dedupe by kind|sport|name for counting, but keep first url
  var deduped = [];
  var seen = {};
  checks.forEach(function (c) {
    var key = c.kind + '|' + c.sport + '|' + String(c.name).toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    deduped.push(c);
  });

  await mapPool(deduped, async function (c) {
    var bucketMap = c.kind === 'team' ? logos : photos;
    if (!bucketMap[c.sport]) bucketMap[c.sport] = emptySportBucket();
    var b = bucketMap[c.sport];
    b.entities++;

    if (!c.url) {
      b.unresolved++;
      b.missingUrl++;
      b.unresolvedNames.push(c.name);
      return c;
    }

    var code = await statusOf(c.url);
    if (code === 200) {
      b.resolved++;
    } else if (code === 404 || code === 410) {
      b.broken++;
      b.brokenUrls.push({ name: c.name, url: c.url, status: code });
      b.unresolvedNames.push(c.name);
    } else if (code === 0) {
      // Network/timeout — count as unresolved for reporting, note separately
      b.unresolved++;
      b.unresolvedNames.push(c.name + ' (http_error)');
    } else {
      b.broken++;
      b.brokenUrls.push({ name: c.name, url: c.url, status: code });
    }
    return c;
  }, CONCURRENCY);

  Object.keys(logos).forEach(function (s) { finalize(logos[s]); });
  Object.keys(photos).forEach(function (s) { finalize(photos[s]); });

  return { logos: logos, photos: photos, checked: deduped.length, httpSkipped: SKIP_HTTP };
}

function printReport(report) {
  console.log('\n=== PocketBooks Image Audit ===');
  console.log('API: ' + API);
  console.log('Checked: ' + report.checked + (report.httpSkipped ? ' (HTTP skipped)' : ''));
  console.log('\n-- Team logos --');
  Object.keys(report.logos).sort().forEach(function (s) {
    var b = report.logos[s];
    console.log(
      s.padEnd(8) +
      ' entities=' + String(b.entities).padStart(4) +
      ' resolved=' + String(b.resolved).padStart(4) +
      ' missing=' + String(b.missingUrl).padStart(4) +
      ' broken=' + String(b.broken).padStart(3) +
      ' unresolved=' + String(b.unresolved).padStart(4) +
      ' coverage=' + b.coveragePct + '%'
    );
  });
  console.log('\n-- Player photos --');
  Object.keys(report.photos).sort().forEach(function (s) {
    var b = report.photos[s];
    console.log(
      s.padEnd(8) +
      ' entities=' + String(b.entities).padStart(4) +
      ' resolved=' + String(b.resolved).padStart(4) +
      ' missing=' + String(b.missingUrl).padStart(4) +
      ' broken=' + String(b.broken).padStart(3) +
      ' unresolved=' + String(b.unresolved).padStart(4) +
      ' coverage=' + b.coveragePct + '%'
    );
  });

  console.log('\n-- Unresolved names by sport --');
  function dumpUnresolved(kind, map) {
    Object.keys(map).sort().forEach(function (s) {
      var names = map[s].unresolvedNames || [];
      if (!names.length) return;
      console.log('[' + kind + '/' + s + '] (' + names.length + ')');
      names.slice(0, 40).forEach(function (n) { console.log('  - ' + n); });
      if (names.length > 40) console.log('  … +' + (names.length - 40) + ' more');
    });
  }
  dumpUnresolved('logo', report.logos);
  dumpUnresolved('photo', report.photos);

  console.log('\n-- Broken URLs --');
  var anyBroken = false;
  function dumpBroken(kind, map) {
    Object.keys(map).sort().forEach(function (s) {
      (map[s].brokenUrls || []).forEach(function (row) {
        anyBroken = true;
        console.log('[' + kind + '/' + s + '] ' + row.name + ' → ' + row.status + ' ' + row.url);
      });
    });
  }
  dumpBroken('logo', report.logos);
  dumpBroken('photo', report.photos);
  if (!anyBroken) console.log('(none)');
}

async function main() {
  console.log('Loading image modules…');
  var sandbox = loadSandbox();

  console.log('Enumerating mapped teams/players…');
  var checks = [];
  checks = checks.concat(await auditMappedTeams(sandbox));
  checks = checks.concat(await auditMappedPlayers(sandbox));

  if (DO_LIVE) {
    console.log('Fetching live sportsbook entities from ' + API + ' …');
    checks = checks.concat(await auditLiveEntities(sandbox));
  }

  console.log('Classifying ' + checks.length + ' checks' +
    (SKIP_HTTP ? ' (no HTTP)' : ' (HEAD URLs, concurrency=' + CONCURRENCY + ')') + '…');
  var classified = await classifyChecks(checks);

  var report = {
    generatedAt: new Date().toISOString(),
    api: API,
    branchHint: 'cursor/image-audit-text-fallback',
    policy: 'text-only fallback; strict matching; no fuzzy auto-image',
    checked: classified.checked,
    httpSkipped: classified.httpSkipped,
    logos: classified.logos,
    photos: classified.photos,
    inventoryNotes: [
      'Placeholders removed: colored initials circles → pb-text-fallback name text',
      'Bet-slip hierarchy preserved: player photo → team logo → O → U → Draw → text',
      'mmaEls hydrate bug fixed (ReferenceError)',
      'ESPN search rejects weak/fuzzy hits; ambiguous exact ties unresolved'
    ]
  };

  try {
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log('Wrote ' + OUT);
  } catch (e) {
    console.warn('Could not write ' + OUT + ': ' + e.message);
  }

  printReport(report);
  return report;
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
