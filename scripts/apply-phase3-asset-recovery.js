#!/usr/bin/env node
/**
 * Phase 3 — apply SAFE deterministic asset recoveries from Phase 2 audit.
 * Updates FE verified maps + BE soccer aliases + durable seed JSON.
 * Does NOT call TSDB. Does NOT touch NCAAF team logos. No financial mutations.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FE_ROOT = path.join(__dirname, '..');
const BE_ROOT = path.join(__dirname, '..', '..', 'pocketbooks-sports-backend');
const FIXES = path.join(FE_ROOT, '.tmp-asset-census', 'phase2-safe-fixes.json');

function loadFixes() {
  const raw = JSON.parse(fs.readFileSync(FIXES, 'utf8'));
  return (raw.fixes || []).filter(function (f) {
    return f.recoveryClass === 'ESPN_RECOVERABLE' || f.recoveryClass === 'ALIAS_NEEDED';
  });
}

function escapeKey(name) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
  return "'" + String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function parseObjectEntries(body) {
  const map = Object.create(null);
  const re = /(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"|([A-Za-z_][A-Za-z0-9_]*))\s*:\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[0-9]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const key = (m[1] != null ? m[1] : (m[2] != null ? m[2] : m[3])).replace(/\\'/g, "'");
    let val = m[4];
    if (val[0] === "'" || val[0] === '"') val = val.slice(1, -1).replace(/\\'/g, "'");
    map[key] = val;
  }
  return map;
}

function serializeObject(map, indent) {
  const pad = ' '.repeat(indent);
  const keys = Object.keys(map).sort(function (a, b) {
    return a.localeCompare(b);
  });
  const lines = keys.map(function (k) {
    const v = map[k];
    const isNum = /^\d+$/.test(String(v));
    return pad + escapeKey(k) + ': ' + (isNum ? String(v) : ("'" + String(v).replace(/'/g, "\\'") + "'"));
  });
  return lines.join(',\n');
}

function replaceObjectLiteral(src, startMarker, indent) {
  const idx = src.indexOf(startMarker);
  if (idx < 0) throw new Error('marker not found: ' + startMarker);
  const brace = src.indexOf('{', idx);
  let depth = 0;
  let end = brace;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  const body = src.slice(brace + 1, end);
  const map = parseObjectEntries(body);
  return {
    map,
    replace: function (newMap) {
      const serialized = '\n' + serializeObject(newMap, indent) + '\n' + ' '.repeat(indent - 2);
      return src.slice(0, brace + 1) + serialized + src.slice(end);
    }
  };
}

function mergeIds(map, entries, asString) {
  let added = 0;
  entries.forEach(function (e) {
    if (!e.name || !e.espnId) return;
    if (map[e.name] != null) return;
    map[e.name] = asString ? String(e.espnId) : String(e.espnId);
    added++;
  });
  return added;
}

function main() {
  const fixes = loadFixes();
  console.log('Applying', fixes.length, 'safe fixes');

  const bySport = {
    nfl: [], mlb: [], wnba: [], ncaaf: [], tennis: [], golf: [], mma: [],
    soccerEspn: [], soccerAlias: []
  };
  fixes.forEach(function (f) {
    if (f.sport === 'soccer' && f.recoveryClass === 'ALIAS_NEEDED') {
      bySport.soccerAlias.push(f);
      return;
    }
    if (f.sport === 'soccer' && f.recoveryClass === 'ESPN_RECOVERABLE') {
      bySport.soccerEspn.push(f);
      return;
    }
    if (bySport[f.sport]) bySport[f.sport].push({ name: f.providerName, espnId: f.espnId, url: f.assetUrl });
  });

  // ── FE player-photos.js ──────────────────────────────────────────────────
  let pp = fs.readFileSync(path.join(FE_ROOT, 'player-photos.js'), 'utf8');

  // Ensure wnba + ncaaf blocks exist before closing of VERIFIED_PLAYER_IDS
  if (!/\n  wnba: \{/.test(pp)) {
    pp = pp.replace(/\n  golf: \{/, '\n  wnba: {\n  },\n  ncaaf: {\n  },\n  golf: {');
    // if golf comes after mma, insert before golf - already did
  }
  if (!/\n  ncaaf: \{/.test(pp)) {
    pp = pp.replace(/\n  wnba: \{/, '\n  ncaaf: {\n  },\n  wnba: {');
  }

  const sportMarkers = {
    mlb: '  mlb: {',
    nfl: '  nfl: {',
    tennis: '  tennis: {',
    mma: '  mma: {',
    golf: '  golf: {',
    wnba: '  wnba: {',
    ncaaf: '  ncaaf: {'
  };

  const feStats = {};
  Object.keys(sportMarkers).forEach(function (sport) {
    const entries = bySport[sport] || [];
    if (!entries.length && sport !== 'wnba' && sport !== 'ncaaf') return;
    const block = replaceObjectLiteral(pp, sportMarkers[sport], 4);
    // player-photos uses numeric IDs without quotes typically
    const before = Object.keys(block.map).length;
    entries.forEach(function (e) {
      if (block.map[e.name] == null) block.map[e.name] = String(e.espnId);
    });
    pp = block.replace(block.map);
    feStats[sport] = { before: before, after: Object.keys(block.map).length, added: Object.keys(block.map).length - before };
  });

  fs.writeFileSync(path.join(FE_ROOT, 'player-photos.js'), pp);
  console.log('Updated player-photos.js', feStats);

  // ── FE team-logos.js golf/mma/soccer ─────────────────────────────────────
  let tl = fs.readFileSync(path.join(FE_ROOT, 'team-logos.js'), 'utf8');

  // Golf
  {
    const block = replaceObjectLiteral(tl, '  var _GOLF_VERIFIED_IDS = {', 4);
    const before = Object.keys(block.map).length;
    mergeIds(block.map, bySport.golf, true);
    tl = block.replace(block.map);
    console.log('golf verified', before, '->', Object.keys(block.map).length);
  }
  // MMA
  {
    const block = replaceObjectLiteral(tl, '  var _MMA_VERIFIED_IDS = {', 4);
    const before = Object.keys(block.map).length;
    mergeIds(block.map, bySport.mma, true);
    tl = block.replace(block.map);
    console.log('mma verified', before, '->', Object.keys(block.map).length);
  }
  // Soccer IDs (new ESPN recoverables)
  {
    const block = replaceObjectLiteral(tl, '  var SOCCER_TEAM_IDS = {', 4);
    const before = Object.keys(block.map).length;
    bySport.soccerEspn.forEach(function (f) {
      if (block.map[f.providerName] == null) block.map[f.providerName] = String(f.espnId);
    });
    tl = block.replace(block.map);
    console.log('soccer ids', before, '->', Object.keys(block.map).length);
  }
  // Soccer aliases (provider name → espn id)
  {
    const block = replaceObjectLiteral(tl, '  var SOCCER_TEAM_ALIASES = {', 4);
    const before = Object.keys(block.map).length;
    bySport.soccerAlias.forEach(function (f) {
      if (block.map[f.providerName] == null) block.map[f.providerName] = String(f.espnId);
    });
    // Also alias ESPN recoverable provider names to their ids for board strings
    bySport.soccerEspn.forEach(function (f) {
      if (block.map[f.providerName] == null) block.map[f.providerName] = String(f.espnId);
    });
    tl = block.replace(block.map);
    console.log('soccer aliases', before, '->', Object.keys(block.map).length);
  }

  fs.writeFileSync(path.join(FE_ROOT, 'team-logos.js'), tl);

  // ── BE soccer VERIFIED_ALIASES ───────────────────────────────────────────
  const beSoccerPath = path.join(BE_ROOT, 'lib', 'soccer-team-logos.js');
  let beSoccer = fs.readFileSync(beSoccerPath, 'utf8');
  const aliasInserts = [];
  bySport.soccerAlias.forEach(function (f) {
    // Resolve canonical from BE logos file if possible
    const logos = JSON.parse(fs.readFileSync(path.join(FE_ROOT, '.tmp-asset-census', 'be_logos_soccer.json'), 'utf8'));
    const teams = logos.teams || [];
    const hit = teams.find(function (t) {
      return String(t.providerTeamId) === String(f.espnId);
    });
    const canonical = (hit && (hit.canonicalName || hit.displayName)) || f.providerName;
    if (beSoccer.indexOf("'" + f.providerName.replace(/'/g, "\\'") + "'") >= 0) return;
    aliasInserts.push("  '" + f.providerName.replace(/'/g, "\\'") + "': '" + String(canonical).replace(/'/g, "\\'") + "'");
  });
  if (aliasInserts.length) {
    beSoccer = beSoccer.replace(
      'const VERIFIED_ALIASES = {\n',
      'const VERIFIED_ALIASES = {\n  // Phase-3 board aliases (deterministic; from asset recovery audit)\n' +
        aliasInserts.join(',\n') + ',\n'
    );
    fs.writeFileSync(beSoccerPath, beSoccer);
    console.log('BE soccer aliases added:', aliasInserts.length);
  }

  // ── Durable seed for BE DB apply (when SUPABASE creds available) ─────────
  const seed = {
    generatedAt: new Date().toISOString(),
    policy: 'ESPN deterministic only; no TSDB; no NCAAF team polish; ambiguous excluded',
    playerPhotos: [],
    soccerTeams: [],
    soccerAliases: []
  };
  ['nfl', 'mlb', 'wnba', 'ncaaf', 'tennis', 'golf', 'mma'].forEach(function (sport) {
    (bySport[sport] || []).forEach(function (e) {
      seed.playerPhotos.push({
        sport: sport,
        player_name: e.name,
        espn_id: String(e.espnId),
        photo_url: e.url,
        verified: true
      });
    });
  });
  bySport.soccerEspn.forEach(function (f) {
    seed.soccerTeams.push({
      sport: 'soccer',
      provider: 'espn',
      provider_team_id: String(f.espnId),
      canonical_name: f.providerName,
      display_name: f.providerName,
      logo_url: f.assetUrl,
      aliases: [f.providerName],
      active: true,
      classification: 'club'
    });
  });
  bySport.soccerAlias.forEach(function (f) {
    seed.soccerAliases.push({
      alias: f.providerName,
      provider_team_id: String(f.espnId),
      logo_url: f.assetUrl
    });
  });

  const seedDir = path.join(BE_ROOT, 'data');
  fs.mkdirSync(seedDir, { recursive: true });
  fs.writeFileSync(path.join(seedDir, 'asset-recovery-seed.json'), JSON.stringify(seed, null, 2));
  fs.writeFileSync(path.join(FE_ROOT, '.tmp-asset-census', 'asset-recovery-seed.json'), JSON.stringify(seed, null, 2));
  console.log('Seed player photos:', seed.playerPhotos.length);
  console.log('Seed soccer teams:', seed.soccerTeams.length);
  console.log('Seed soccer aliases:', seed.soccerAliases.length);
}

main();
