#!/usr/bin/env node
/**
 * PHASE 1 — Full Sports Asset Census (READ ONLY)
 * Catalog-first: markets/live + odds + props → resolve → HTTP-validate.
 * Never calls /api/player-photo (writes). Never production DB writes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const vm = require('vm');
const { URL } = require('url');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = process.env.PBS_CENSUS_OUT || path.join(__dirname, '..', '.tmp-asset-census');
const API = process.env.PBS_BACKEND_URL || process.env.API ||
  'https://pocketbooks-sports-backend-production.up.railway.app';
const SKIP_HTTP = process.argv.indexOf('--skip-http') >= 0;
const CONCURRENCY = parseInt(process.env.CENSUS_CONCURRENCY || '10', 10) || 10;
const TIMEOUT_MS = 12000;

const SPORT_MAP = {
  americanfootball_nfl: 'nfl',
  americanfootball_ncaaf: 'ncaaf',
  baseball_mlb: 'mlb',
  basketball_nba: 'nba',
  basketball_ncaab: 'ncaab',
  basketball_wnba: 'wnba',
  icehockey_nhl: 'nhl',
  soccer: 'soccer',
  tennis: 'tennis',
  golf: 'golf',
  mma: 'mma',
  boxing: 'boxing',
  rugby: 'rugby',
  rugby_league: 'rugby',
  rugby_union: 'rugby',
  nascar: 'nascar'
};

const TEAM_SPORTS = new Set(['nfl', 'mlb', 'nba', 'nhl', 'ncaaf', 'ncaab', 'wnba', 'soccer', 'rugby']);
const ATHLETE_SPORTS = new Set(['tennis', 'golf', 'mma', 'boxing', 'nascar']);
const PROP_SPORTS = ['nfl', 'mlb', 'nba', 'nhl', 'ncaaf', 'ncaab', 'wnba'];

const PLACEHOLDER_HINTS = [
  /\/default[_-]?logo/i,
  /\/placeholder/i,
  /\/missing/i,
  /\/silhouette/i,
  /headshots\/athletes\/default/i,
  /\/500\/500\.png$/i,
  /\/scoreboard\/g_70\.png/i
];

function normSport(sk) {
  const s = String(sk || '').toLowerCase();
  if (SPORT_MAP[s]) return SPORT_MAP[s];
  if (s.indexOf('soccer') === 0) return 'soccer';
  if (s.indexOf('tennis') === 0) return 'tennis';
  if (s.indexOf('ncaaf') >= 0) return 'ncaaf';
  if (s.indexOf('ncaab') >= 0) return 'ncaab';
  if (s.indexOf('nfl') >= 0) return 'nfl';
  if (s.indexOf('mlb') >= 0) return 'mlb';
  if (s.indexOf('nba') >= 0) return 'nba';
  if (s.indexOf('nhl') >= 0 || s.indexOf('hockey') >= 0) return 'nhl';
  if (s.indexOf('wnba') >= 0) return 'wnba';
  if (s.indexOf('golf') >= 0) return 'golf';
  if (s.indexOf('mma') >= 0 || s.indexOf('ufc') >= 0) return 'mma';
  if (s.indexOf('boxing') >= 0) return 'boxing';
  if (s.indexOf('rugby') >= 0) return 'rugby';
  if (s.indexOf('nascar') >= 0) return 'nascar';
  return s || 'unknown';
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_e) {
    return fallback;
  }
}

function curlJson(url) {
  const out = execFileSync(
    'curl',
    ['-sS', '-L', '--max-time', '90', '-A', 'PocketBooks-AssetCensus/1.0', url],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out);
}

function loadSandbox() {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
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

function buildBeLogoIndex(rows, keyField) {
  const byName = Object.create(null);
  const byNorm = Object.create(null);
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  (rows || []).forEach(function (t) {
    const url = t.logoUrl || t.logo_url || '';
    const names = [
      t.canonicalName, t.canonical_name, t.displayName, t.display_name,
      t.abbreviation
    ].concat(t.aliases || []);
    const meta = {
      url: url,
      espnId: t.providerTeamId || t.provider_team_id || t.espnId || null,
      canonical: t.canonicalName || t.canonical_name || t.displayName || null,
      source: 'be-team-logos'
    };
    names.forEach(function (n) {
      if (!n) return;
      byName[String(n)] = meta;
      byNorm[norm(n)] = meta;
    });
  });
  return { byName, byNorm, norm, size: (rows || []).length };
}

function isInvalidMarketLabel(sport, name) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (/^outright$/i.test(n)) return true;
  if (sport === 'nascar') {
    if (/winning manufacturer|championship|winner|winning team|food city|night race|outright/i.test(n)) {
      return true;
    }
  }
  if (/^(over|under|draw|yes|no)$/i.test(n)) return true;
  return false;
}

function looksPlaceholder(url) {
  if (!url) return false;
  return PLACEHOLDER_HINTS.some(function (re) { return re.test(url); });
}

function httpProbe(url) {
  return new Promise(function (resolve) {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'http:' ? http : https;
      const req = lib.request({
        method: 'HEAD',
        hostname: u.hostname,
        path: u.pathname + u.search,
        protocol: u.protocol,
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': 'PocketBooks-AssetCensus/1.0', Accept: '*/*' }
      }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpProbe(res.headers.location).then(resolve);
          res.resume();
          return;
        }
        const ct = String(res.headers['content-type'] || '').toLowerCase();
        const len = parseInt(res.headers['content-length'] || '0', 10) || 0;
        resolve({
          status: res.statusCode || 0,
          contentType: ct,
          contentLength: len,
          ok: res.statusCode === 200 && (!ct || ct.indexOf('image') >= 0 || ct.indexOf('octet') >= 0)
        });
        res.resume();
      });
      req.on('error', function () { resolve({ status: 0, contentType: '', contentLength: 0, ok: false }); });
      req.on('timeout', function () { req.destroy(); resolve({ status: 0, contentType: '', contentLength: 0, ok: false }); });
      req.end();
    } catch (_e) {
      resolve({ status: 0, contentType: '', contentLength: 0, ok: false });
    }
  });
}

async function mapPool(items, worker, concurrency) {
  let idx = 0;
  const out = new Array(items.length);
  async function pump() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await worker(items[i], i);
    }
  }
  const n = Math.min(concurrency || 8, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, function () { return pump(); }));
  return out;
}

function resolveEntity(sandbox, beIndexes, sport, entityType, name, providerLogo) {
  const result = {
    assetUrl: '',
    assetSource: null,
    espnId: null,
    canonicalIdentity: null,
    resolutionMethod: null,
    confidence: 'none',
    existingLocalAsset: false,
    existingAlias: false
  };

  if (providerLogo) {
    result.assetUrl = providerLogo;
    result.assetSource = 'provider_attached';
    result.resolutionMethod = 'odds_logo_url';
    result.confidence = 'high';
    result.existingLocalAsset = true;
  }

  // BE indexes (ncaaf / soccer)
  if ((!result.assetUrl || sport === 'ncaaf' || sport === 'soccer') && beIndexes[sport]) {
    const idx = beIndexes[sport];
    let hit = idx.byName[name] || idx.byNorm[idx.norm(name)];
    if (hit && hit.url) {
      result.assetUrl = hit.url;
      result.assetSource = 'espn_via_be_index';
      result.espnId = hit.espnId;
      result.canonicalIdentity = hit.canonical;
      result.resolutionMethod = hit === idx.byName[name] ? 'be_exact' : 'be_normalized';
      result.confidence = 'high';
      result.existingLocalAsset = true;
      if (result.resolutionMethod === 'be_normalized') result.existingAlias = true;
    }
  }

  if (result.assetUrl && sport !== 'soccer' && sport !== 'ncaaf') {
    // keep provider logo for majors when present; still try FE for espn id enrichment below
  }

  try {
    if (entityType === 'team') {
      if (sport === 'soccer' && sandbox.getSoccerTeamLogo) {
        const url = sandbox.getSoccerTeamLogo(name) || '';
        if (url && !result.assetUrl) {
          result.assetUrl = url;
          result.assetSource = 'fe_soccer_resolver';
          result.resolutionMethod = 'fe_getSoccerTeamLogo';
          result.confidence = 'high';
          result.existingLocalAsset = true;
        }
      } else {
        const mapSport = sport === 'ncaaf' ? 'ncaafb' : sport;
        const url = (sandbox.getTeamLogoDirect && sandbox.getTeamLogoDirect(name, mapSport)) ||
          (sandbox.getTeamLogo && sandbox.getTeamLogo(name, mapSport, 80)) || '';
        if (url && !result.assetUrl) {
          result.assetUrl = url;
          result.assetSource = 'fe_team_logo_map';
          result.resolutionMethod = 'fe_getTeamLogo';
          result.confidence = 'high';
          result.existingLocalAsset = true;
        }
      }
    } else {
      let url = '';
      if (sport === 'tennis' && sandbox.getTennisPlayerPhoto) url = sandbox.getTennisPlayerPhoto(name) || '';
      else if (sport === 'golf' && sandbox.getGolfPlayerPhoto) url = sandbox.getGolfPlayerPhoto(name) || '';
      else if (sport === 'mma' && sandbox.getMMAFighterPhoto) url = sandbox.getMMAFighterPhoto(name) || '';
      else if (sport === 'boxing' && sandbox.getMMAFighterPhoto) url = sandbox.getMMAFighterPhoto(name) || '';
      if (!url && sandbox.getPlayerHeadshotUrl) {
        const photoSport = sport === 'boxing' ? 'mma' : sport;
        url = sandbox.getPlayerHeadshotUrl(name, photoSport) || '';
      }
      if (url) {
        result.assetUrl = url;
        result.assetSource = 'fe_player_photo';
        result.resolutionMethod = 'fe_player_photo';
        result.confidence = 'high';
        result.existingLocalAsset = true;
      }
    }
  } catch (_e) {}

  return result;
}

function emptyBucket() {
  return {
    total: 0,
    verified: 0,
    coveragePct: 0,
    resolverMiss: 0,
    aliasMiss: 0,
    corpusMiss: 0,
    sourceHasAsset: 0,
    sourceNoAsset: 0,
    broken: 0,
    placeholder: 0,
    ambiguous: 0,
    invalid: 0,
    notApplicable: 0,
    classifications: Object.create(null)
  };
}

function bumpClass(bucket, cls) {
  bucket.classifications[cls] = (bucket.classifications[cls] || 0) + 1;
}

function finalizeBucket(b) {
  const denom = Math.max(0, b.total - b.invalid - b.notApplicable);
  b.visualTotal = denom;
  b.coveragePct = denom ? Math.round((b.verified / denom) * 1000) / 10 : 0;
  return b;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('PHASE 1 FULL SPORTS ASSET CENSUS (READ ONLY)');
  console.log('API:', API);

  const sportsPayload = loadJson(path.join(OUT_DIR, 'sports.json'), null) || curlJson(API + '/api/sports');
  fs.writeFileSync(path.join(OUT_DIR, 'sports.json'), JSON.stringify(sportsPayload, null, 2));

  let markets = loadJson(path.join(OUT_DIR, 'markets_live.json'), null);
  if (!markets || !markets.games) {
    console.log('Fetching /api/markets/live …');
    markets = curlJson(API + '/api/markets/live');
    fs.writeFileSync(path.join(OUT_DIR, 'markets_live.json'), JSON.stringify(markets));
  }
  console.log('markets games:', (markets.games || []).length);

  const sandbox = loadSandbox();
  const beNcaaf = loadJson(path.join(OUT_DIR, 'be_logos_ncaaf.json'), { teams: [] });
  const beSoccer = loadJson(path.join(OUT_DIR, 'be_logos_soccer.json'), { teams: [] });
  const beIndexes = {
    ncaaf: buildBeLogoIndex(beNcaaf.teams || []),
    soccer: buildBeLogoIndex(beSoccer.teams || [])
  };
  console.log('BE logo rows: ncaaf=%d soccer=%d', beIndexes.ncaaf.size, beIndexes.soccer.size);

  // Optional NCAAF audit confirm
  let ncaafAudit = null;
  try {
    ncaafAudit = curlJson(API + '/api/team-logos/audit/ncaaf');
  } catch (_e) {}

  // Odds logo overlay (may be truncated to 50) — merge provider logos by name
  const oddsLogoBySportName = Object.create(null);
  fs.readdirSync(OUT_DIR).filter(function (f) { return /^odds_/.test(f); }).forEach(function (f) {
    const sport = f.replace(/^odds_/, '').replace(/\.json$/, '');
    const games = loadJson(path.join(OUT_DIR, f), []);
    if (!Array.isArray(games)) return;
    if (!oddsLogoBySportName[sport]) oddsLogoBySportName[sport] = Object.create(null);
    games.forEach(function (g) {
      if (g.home && g.homeLogoUrl) oddsLogoBySportName[sport][g.home] = g.homeLogoUrl;
      if (g.away && g.awayLogoUrl) oddsLogoBySportName[sport][g.away] = g.awayLogoUrl;
    });
  });

  // Enumerate catalog entities
  const entityMap = Object.create(null); // key -> record
  function upsertEntity(rec) {
    const key = rec.entityType + '|' + rec.sport + '|' + String(rec.providerName).toLowerCase();
    if (!entityMap[key]) {
      entityMap[key] = rec;
      return;
    }
    const prev = entityMap[key];
    if (!prev.providerLogo && rec.providerLogo) prev.providerLogo = rec.providerLogo;
    if (rec.league && !prev.league) prev.league = rec.league;
    if (rec.source === 'props') prev.inProps = true;
  }

  (markets.games || []).forEach(function (g) {
    const sport = normSport(g.sport_key || g.sport);
    const league = g.league || null;
    const home = g.home_team || g.home;
    const away = g.away_team || g.away;
    const entityType = ATHLETE_SPORTS.has(sport) ? 'athlete' : 'team';
    [home, away].forEach(function (name) {
      if (!name) return;
      const invalid = isInvalidMarketLabel(sport, name);
      upsertEntity({
        sport,
        providerName: String(name).trim(),
        entityType: invalid ? 'invalid' : entityType,
        league,
        providerLogo: (oddsLogoBySportName[sport] && oddsLogoBySportName[sport][name]) || '',
        source: 'markets_live',
        inProps: false
      });
    });
  });

  // Ensure listed sports with zero games still appear
  const catalogSports = new Set((sportsPayload.sports || []).map(function (s) { return s.key; }));
  ['nfl', 'mlb', 'nba', 'nhl', 'ncaaf', 'ncaab', 'soccer', 'tennis', 'golf', 'mma', 'boxing', 'rugby', 'nascar', 'wnba']
    .forEach(function (s) { catalogSports.add(s); });

  // Props athletes
  const propAthletes = Object.create(null); // sport -> map name
  PROP_SPORTS.forEach(function (sport) {
    const payload = loadJson(path.join(OUT_DIR, 'props_' + sport + '.json'), { props: [] });
    const props = (payload && payload.props) || [];
    if (!propAthletes[sport]) propAthletes[sport] = Object.create(null);
    props.forEach(function (p) {
      const name = (p && p.playerName) || '';
      if (!name) return;
      propAthletes[sport][name] = true;
      upsertEntity({
        sport,
        providerName: name,
        entityType: 'athlete',
        league: null,
        providerLogo: '',
        source: 'props',
        inProps: true,
        team: (p && p.team) || null
      });
    });
    console.log('props', sport, Object.keys(propAthletes[sport]).length, 'unique athletes');
  });

  const entities = Object.keys(entityMap).map(function (k) { return entityMap[k]; });
  console.log('Total unique visual/invalid entities:', entities.length);

  // Resolve locally (no write APIs)
  entities.forEach(function (e) {
    if (e.entityType === 'invalid') {
      e.classification = 'INVALID_ENTITY';
      e.resolved = resolveEntity(sandbox, beIndexes, e.sport, 'athlete', e.providerName, '');
      return;
    }
    e.resolved = resolveEntity(
      sandbox,
      beIndexes,
      e.sport,
      e.entityType === 'athlete' ? 'athlete' : 'team',
      e.providerName,
      e.providerLogo || ''
    );
  });

  // HTTP validate URLs
  const urlCache = Object.create(null);
  const needProbe = [];
  entities.forEach(function (e) {
    const url = e.resolved && e.resolved.assetUrl;
    if (!url) return;
    if (urlCache[url] == null) {
      urlCache[url] = null;
      needProbe.push(url);
    }
  });
  console.log('HTTP probing', needProbe.length, 'unique URLs', SKIP_HTTP ? '(skipped)' : '');
  if (!SKIP_HTTP) {
    let done = 0;
    await mapPool(needProbe, async function (url) {
      urlCache[url] = await httpProbe(url);
      done++;
      if (done % 100 === 0) console.log('  probed', done, '/', needProbe.length);
      return urlCache[url];
    }, CONCURRENCY);
  } else {
    needProbe.forEach(function (url) {
      urlCache[url] = { status: 200, contentType: 'image/png', contentLength: 1, ok: true };
    });
  }

  // Classify
  const records = entities.map(function (e) {
    const r = e.resolved || {};
    const url = r.assetUrl || '';
    const probe = url ? (urlCache[url] || { status: 0, ok: false }) : null;
    let classification = 'RESOLVER_MISS';
    let displayStatus = 'missing';
    let validImage = false;
    let httpStatus = null;

    if (e.entityType === 'invalid') {
      classification = 'INVALID_ENTITY';
      displayStatus = 'not_applicable';
    } else if (!url) {
      classification = 'RESOLVER_MISS';
      displayStatus = 'missing';
    } else if (looksPlaceholder(url)) {
      classification = 'PLACEHOLDER';
      displayStatus = 'placeholder';
      httpStatus = probe && probe.status;
    } else if (probe && probe.ok) {
      classification = 'VERIFIED_ASSET';
      displayStatus = 'ok';
      validImage = true;
      httpStatus = probe.status;
    } else if (probe && (probe.status === 404 || probe.status === 410)) {
      classification = 'BROKEN_ASSET';
      displayStatus = 'broken';
      httpStatus = probe.status;
    } else if (probe && probe.status === 0) {
      classification = 'BROKEN_ASSET';
      displayStatus = 'http_error';
      httpStatus = 0;
    } else {
      classification = 'BROKEN_ASSET';
      displayStatus = 'broken';
      httpStatus = probe && probe.status;
    }

    return {
      sport: e.sport,
      providerEntityName: e.providerName,
      entityType: e.entityType === 'invalid' ? 'invalid' : e.entityType,
      canonicalIdentity: r.canonicalIdentity || null,
      pocketBooksCanonicalId: r.espnId || null,
      providerId: null,
      espnId: r.espnId || null,
      existingLocalAsset: !!r.existingLocalAsset,
      existingAlias: !!r.existingAlias,
      assetSource: r.assetSource,
      assetUrl: url || null,
      httpStatus,
      validImage,
      placeholder: classification === 'PLACEHOLDER',
      resolutionMethod: r.resolutionMethod,
      confidence: r.confidence,
      displayStatus,
      classification,
      league: e.league || null,
      inProps: !!e.inProps,
      catalogSource: e.source
    };
  });

  // Aggregate
  const bySportType = Object.create(null); // sport|type
  const teamLogo = emptyBucket();
  const athletePhoto = emptyBucket();
  const gaps = [];

  records.forEach(function (rec) {
    const typeKey = rec.entityType === 'team' ? 'team' :
      (rec.entityType === 'athlete' ? 'athlete' : 'invalid');
    const key = rec.sport + '|' + typeKey;
    if (!bySportType[key]) {
      bySportType[key] = Object.assign(emptyBucket(), { sport: rec.sport, entityType: typeKey });
    }
    const b = bySportType[key];
    b.total++;
    bumpClass(b, rec.classification);

    if (rec.classification === 'VERIFIED_ASSET') b.verified++;
    else if (rec.classification === 'RESOLVER_MISS') b.resolverMiss++;
    else if (rec.classification === 'ALIAS_MISS') b.aliasMiss++;
    else if (rec.classification === 'CORPUS_MISS') b.corpusMiss++;
    else if (rec.classification === 'SOURCE_HAS_ASSET_NOT_SEEDED') b.sourceHasAsset++;
    else if (rec.classification === 'SOURCE_NO_ASSET') b.sourceNoAsset++;
    else if (rec.classification === 'BROKEN_ASSET') b.broken++;
    else if (rec.classification === 'PLACEHOLDER') b.placeholder++;
    else if (rec.classification === 'AMBIGUOUS') b.ambiguous++;
    else if (rec.classification === 'INVALID_ENTITY') b.invalid++;
    else if (rec.classification === 'NOT_APPLICABLE') b.notApplicable++;

    if (typeKey === 'team') {
      teamLogo.total++;
      if (rec.classification === 'VERIFIED_ASSET') teamLogo.verified++;
      bumpClass(teamLogo, rec.classification);
    } else if (typeKey === 'athlete') {
      athletePhoto.total++;
      if (rec.classification === 'VERIFIED_ASSET') athletePhoto.verified++;
      bumpClass(athletePhoto, rec.classification);
    }

    if (rec.classification !== 'VERIFIED_ASSET' && rec.classification !== 'INVALID_ENTITY' &&
        rec.classification !== 'NOT_APPLICABLE') {
      gaps.push(rec);
    }
  });

  Object.keys(bySportType).forEach(function (k) { finalizeBucket(bySportType[k]); });
  finalizeBucket(teamLogo);
  finalizeBucket(athletePhoto);

  // Props photo coverage
  const propsRecIndex = Object.create(null);
  records.forEach(function (r) {
    if (!r.inProps || r.entityType !== 'athlete') return;
    propsRecIndex[r.sport + '|' + r.providerEntityName] = r;
  });
  const propsCoverage = {};
  PROP_SPORTS.forEach(function (sport) {
    const names = Object.keys(propAthletes[sport] || {});
    let verified = 0, missing = 0, broken = 0, unresolved = 0;
    names.forEach(function (name) {
      const rec = propsRecIndex[sport + '|' + name];
      if (!rec) { unresolved++; return; }
      if (rec.classification === 'VERIFIED_ASSET') verified++;
      else if (rec.classification === 'BROKEN_ASSET') broken++;
      else if (rec.classification === 'RESOLVER_MISS') unresolved++;
      else missing++;
    });
    propsCoverage[sport] = {
      totalUniquePropAthletes: names.length,
      photoVerified: verified,
      photoMissing: missing + unresolved,
      photoBroken: broken,
      identityUnresolved: unresolved
    };
  });

  // Rankings
  const sportRows = Object.keys(bySportType).map(function (k) { return bySportType[k]; });
  const actionableGaps = gaps.filter(function (g) {
    return g.classification !== 'INVALID_ENTITY';
  });

  function missingCount(row) {
    return row.visualTotal - row.verified;
  }

  const topMissing = sportRows
    .filter(function (r) { return r.entityType !== 'invalid'; })
    .slice()
    .sort(function (a, b) { return missingCount(b) - missingCount(a); })
    .slice(0, 10)
    .map(function (r) {
      return { sport: r.sport, entityType: r.entityType, missing: missingCount(r), coveragePct: r.coveragePct, total: r.visualTotal };
    });

  const topWorst = sportRows
    .filter(function (r) { return r.entityType !== 'invalid' && r.visualTotal >= 5; })
    .slice()
    .sort(function (a, b) { return a.coveragePct - b.coveragePct; })
    .slice(0, 10)
    .map(function (r) {
      return { sport: r.sport, entityType: r.entityType, coveragePct: r.coveragePct, missing: missingCount(r), total: r.visualTotal };
    });

  const brokenExisting = records.filter(function (r) { return r.classification === 'BROKEN_ASSET'; });
  const ambiguous = records.filter(function (r) { return r.classification === 'AMBIGUOUS'; });
  const invalid = records.filter(function (r) { return r.classification === 'INVALID_ENTITY'; });

  // TSDB measurement pointer (local proof only — not production)
  const tsdbStatus = loadJson(path.join(ROOT, '.tmp-premium-gate/results/STATUS.json'), null);

  const census = {
    status: 'FULL_SPORTS_ASSET_CENSUS',
    auditedAt: new Date().toISOString(),
    api: API,
    productionWrites: 'NONE',
    settlement: 'OFF',
    tsdb: {
      measuredOnly: true,
      productionApproved: false,
      note: 'TSDB MEASURED ONLY / NOT PRODUCTION APPROVED',
      priorPremiumGate: tsdbStatus ? {
        soccer: tsdbStatus.soccer,
        tennis: tsdbStatus.tennis,
        wrongIdentity: tsdbStatus.wrong_identity_true_total
      } : null
    },
    catalogSports: Array.from(catalogSports).sort(),
    marketsUpdatedAt: markets.updatedAt || null,
    ncaafConfirm: ncaafAudit ? {
      total: ncaafAudit.total,
      matched: ncaafAudit.matched,
      coveragePct: ncaafAudit.total ? Math.round((ncaafAudit.matched / ncaafAudit.total) * 1000) / 10 : null,
      unresolved: ncaafAudit.unresolved || [],
      note: 'Frozen ~99.6%; West Florida OK as fallback — do not polish further'
    } : null,
    summary: {
      teamLogoTotal: teamLogo.visualTotal,
      teamLogoVerified: teamLogo.verified,
      teamLogoCoveragePct: teamLogo.coveragePct,
      athletePhotoTotal: athletePhoto.visualTotal,
      athletePhotoVerified: athletePhoto.verified,
      athletePhotoCoveragePct: athletePhoto.coveragePct,
      totalActionableGaps: actionableGaps.length,
      top10Missing: topMissing,
      top10WorstCoverage: topWorst,
      brokenExistingCount: brokenExisting.length,
      ambiguousCount: ambiguous.length,
      invalidCount: invalid.length
    },
    bySport: sportRows.sort(function (a, b) {
      if (a.sport === b.sport) return a.entityType.localeCompare(b.entityType);
      return a.sport.localeCompare(b.sport);
    }),
    propsCoverage,
    httpSkipped: SKIP_HTTP,
    recordCount: records.length
  };

  const gapsOut = {
    auditedAt: census.auditedAt,
    totalActionableGaps: actionableGaps.length,
    gaps: actionableGaps,
    broken: brokenExisting,
    ambiguous,
    invalid,
    sourceHasAssetButMisses: actionableGaps.filter(function (g) {
      return g.classification === 'SOURCE_HAS_ASSET_NOT_SEEDED';
    })
  };

  fs.writeFileSync(path.join(OUT_DIR, 'asset-census.json'), JSON.stringify({
    meta: census,
    records
  }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'asset-gaps.json'), JSON.stringify(gapsOut, null, 2));

  // CSV
  const csvHeader = [
    'sport', 'entityType', 'providerEntityName', 'classification', 'displayStatus',
    'assetSource', 'assetUrl', 'httpStatus', 'validImage', 'espnId', 'inProps', 'league'
  ];
  const csvLines = [csvHeader.join(',')];
  records.forEach(function (r) {
    csvLines.push(csvHeader.map(function (h) {
      let v = r[h];
      if (v == null) v = '';
      v = String(v).replace(/"/g, '""');
      if (/[",\n]/.test(v)) v = '"' + v + '"';
      return v;
    }).join(','));
  });
  fs.writeFileSync(path.join(OUT_DIR, 'asset-census.csv'), csvLines.join('\n'));

  fs.writeFileSync(path.join(OUT_DIR, 'phase1-summary.json'), JSON.stringify(census, null, 2));

  // Console report
  console.log('\nSTATUS: FULL SPORTS ASSET CENSUS');
  console.log('SPORT | ENTITY TYPE | TOTAL | VERIFIED | COVERAGE | RESOLVER MISS | ALIAS MISS | CORPUS MISS | SOURCE ASSET AVAILABLE | SOURCE NO ASSET | BROKEN | AMBIGUOUS');
  census.bySport.forEach(function (r) {
    if (r.entityType === 'invalid') return;
    console.log([
      r.sport,
      r.entityType,
      r.visualTotal,
      r.verified,
      r.coveragePct + '%',
      r.resolverMiss,
      r.aliasMiss,
      r.corpusMiss,
      r.sourceHasAsset,
      r.sourceNoAsset,
      r.broken,
      r.ambiguous
    ].join(' | '));
  });
  console.log('\nTEAM LOGO TOTAL:', census.summary.teamLogoTotal);
  console.log('TEAM LOGO VERIFIED:', census.summary.teamLogoVerified, '(' + census.summary.teamLogoCoveragePct + '%)');
  console.log('ATHLETE PHOTO TOTAL:', census.summary.athletePhotoTotal);
  console.log('ATHLETE PHOTO VERIFIED:', census.summary.athletePhotoVerified, '(' + census.summary.athletePhotoCoveragePct + '%)');
  console.log('TOTAL ACTIONABLE GAPS:', census.summary.totalActionableGaps);
  console.log('TOP 10 MISSING:', JSON.stringify(census.summary.top10Missing, null, 2));
  console.log('TOP 10 WORST:', JSON.stringify(census.summary.top10WorstCoverage, null, 2));
  console.log('BROKEN:', brokenExisting.length);
  console.log('AMBIGUOUS:', ambiguous.length);
  console.log('INVALID:', invalid.length);
  console.log('PROP COVERAGE:', JSON.stringify(propsCoverage, null, 2));
  if (census.ncaafConfirm) {
    console.log('NCAAF CONFIRM:', census.ncaafConfirm.matched + '/' + census.ncaafConfirm.total,
      '=', census.ncaafConfirm.coveragePct + '%', 'unresolved=', census.ncaafConfirm.unresolved);
  }
  console.log('TSDB: MEASURED ONLY / NOT PRODUCTION APPROVED');
  console.log('PRODUCTION WRITES: NONE');
  console.log('SETTLEMENT: OFF');
  console.log('NEXT: PHASE 2 GAP RECOVERY AUDIT — DO NOT FIX YET');
  console.log('Wrote', path.join(OUT_DIR, 'asset-census.json'));
  console.log('Wrote', path.join(OUT_DIR, 'asset-gaps.json'));
  console.log('Wrote', path.join(OUT_DIR, 'asset-census.csv'));
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
