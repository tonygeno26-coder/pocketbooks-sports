#!/usr/bin/env node
/**
 * Build owner preview that exercises PRODUCTION wager visual helpers
 * (_slipLegLogoHtml + asset resolvers) with real verified identities.
 * Presentation only — no wager mutations.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PLAYER_HTML = path.join(ROOT, 'player.html');
const OUT_HTML = path.join(__dirname, 'wager-visual-identity-owner-preview.html');
const OUT_PROOF = path.join(__dirname, 'wager-visual-real-asset-proof.json');

function extractBetween(src, startNeedle, endNeedle) {
  const s = src.indexOf(startNeedle);
  const e = src.indexOf(endNeedle, s + startNeedle.length);
  if (s < 0 || e < 0) throw new Error('extract miss: ' + startNeedle);
  return src.slice(s, e);
}

function loadModule(file) {
  const code = fs.readFileSync(file, 'utf8');
  const sandbox = { console, setTimeout, clearTimeout };
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  return sandbox;
}

function headOk(url) {
  return new Promise((resolve) => {
    if (!url || !/^https?:/.test(url)) return resolve({ ok: false, status: 'skip', url });
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: { 'User-Agent': 'PocketBooks-AssetGate/1.0', Range: 'bytes=0-64' },
      },
      (r) => {
        r.resume();
        resolve({ ok: r.statusCode >= 200 && r.statusCode < 400, status: r.statusCode, url });
      }
    );
    req.on('error', (e) => resolve({ ok: false, status: 'err', err: e.message, url }));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ ok: false, status: 'timeout', url });
    });
    req.end();
  });
}

function firstImgSrc(html) {
  const m = String(html || '').match(/src="([^"]+)"/);
  return m ? m[1].replace(/&amp;/g, '&') : null;
}

function allImgSrcs(html) {
  const out = [];
  const re = /src="([^"]+)"/g;
  let m;
  while ((m = re.exec(String(html || '')))) out.push(m[1].replace(/&amp;/g, '&'));
  return out;
}

async function main() {
  const playerSrc = fs.readFileSync(PLAYER_HTML, 'utf8');
  const logos = loadModule(path.join(ROOT, 'team-logos.js'));
  const photos = loadModule(path.join(ROOT, 'player-photos.js'));
  const g = Object.assign({}, logos, photos);

  // Production helper body (exact from player.html)
  const helperBody =
    extractBetween(playerSrc, 'function _pbAvatarSportKey(sport)', 'function teamAvatar(name, sport, opts)') +
    '\n' +
    extractBetween(playerSrc, 'function bsTeamAbbr(pickStr, game)', 'function _hydrateSlipPlayerPhotos(root)') +
    '\n' +
    extractBetween(playerSrc, 'function _normalizeSlipMarket(market)', 'function _resolveGameId(obj, cachedGame)') +
    '\n';

  // Build Node proof harness using same helpers + real resolvers
  const harness =
    "'use strict';\n" +
    'var _currentSport = "mlb";\n' +
    helperBody +
    '\nmodule.exports = {\n' +
    '  _slipLegLogoHtml: _slipLegLogoHtml,\n' +
    '  _wagerLegVisualInput: _wagerLegVisualInput,\n' +
    '  _slipIsAthleteSport: _slipIsAthleteSport,\n' +
    '  getTeamLogo: typeof getTeamLogo==="function"?getTeamLogo:null,\n' +
    '  getPlayerHeadshotUrl: typeof getPlayerHeadshotUrl==="function"?getPlayerHeadshotUrl:null\n' +
    '};\n';

  const sandbox = Object.assign({}, g, {
    console,
    module: { exports: {} },
    exports: {},
    _currentSport: 'mlb',
  });
  sandbox.global = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(harness, sandbox, { filename: 'wager-visual-helpers.js' });
  const h = sandbox.module.exports;

  // Real verified scenario legs (wager-shaped inputs → production resolver)
  const SCENARIOS = {
    'mlb-ml': {
      title: 'MLB team moneyline — Dodgers crest',
      legs: [
        {
          pick: 'Los Angeles Dodgers',
          market: 'Moneyline',
          sport: 'mlb',
          game: 'Los Angeles Dodgers vs San Francisco Giants',
          awayTeam: 'Los Angeles Dodgers',
          homeTeam: 'San Francisco Giants',
          odds: '-145',
        },
      ],
    },
    'ncaaf-spread': {
      title: 'NCAAF spread — Ohio State crest',
      legs: [
        {
          pick: 'Ohio State Buckeyes -7.5',
          market: 'Spread',
          sport: 'ncaaf',
          game: 'Ohio State Buckeyes vs Michigan Wolverines',
          awayTeam: 'Ohio State Buckeyes',
          homeTeam: 'Michigan Wolverines',
          odds: '-110',
        },
      ],
    },
    'mlb-total': {
      title: 'MLB game total — BOTH logos',
      legs: [
        {
          pick: 'Over 8.5',
          market: 'Total',
          side: 'over',
          sport: 'mlb',
          game: 'Boston Red Sox vs New York Yankees',
          awayTeam: 'Boston Red Sox',
          homeTeam: 'New York Yankees',
          odds: '-110',
        },
      ],
    },
    golf: {
      title: 'Golf matchup — verified golfer photo',
      legs: [
        {
          pick: 'Rasmus Neergaard-Petersen',
          market: 'Moneyline',
          sport: 'golf',
          game: 'Rasmus Neergaard-Petersen vs Scottie Scheffler',
          awayTeam: 'Rasmus Neergaard-Petersen',
          homeTeam: 'Scottie Scheffler',
          odds: '+2200',
          playerName: 'Rasmus Neergaard-Petersen',
        },
      ],
    },
    tennis: {
      title: 'Tennis matchup — verified photo',
      legs: [
        {
          pick: 'Carlos Alcaraz',
          market: 'Moneyline',
          sport: 'tennis',
          game: 'Carlos Alcaraz vs Jannik Sinner',
          awayTeam: 'Carlos Alcaraz',
          homeTeam: 'Jannik Sinner',
          odds: '-145',
          playerName: 'Carlos Alcaraz',
        },
      ],
    },
    prop: {
      title: 'Player prop — verified Aaron Judge photo',
      legs: [
        {
          pick: 'Aaron Judge Over 1.5 Total Bases',
          market: 'Player Prop',
          sport: 'mlb',
          game: 'New York Yankees vs Boston Red Sox',
          awayTeam: 'New York Yankees',
          homeTeam: 'Boston Red Sox',
          odds: '-115',
          isPlayerProp: true,
          playerName: 'Aaron Judge',
          playerTeam: 'New York Yankees',
          presentation: {
            kind: 'player_prop',
            playerName: 'Aaron Judge',
            playerTeam: 'New York Yankees',
            side: 'over',
            propType: 'total_bases',
          },
        },
      ],
    },
    'two-leg': {
      title: '2-leg parlay — per-leg imagery',
      legs: [
        {
          pick: 'Los Angeles Dodgers',
          market: 'Moneyline',
          sport: 'mlb',
          game: 'Los Angeles Dodgers vs San Francisco Giants',
          awayTeam: 'Los Angeles Dodgers',
          homeTeam: 'San Francisco Giants',
          odds: '-145',
        },
        {
          pick: 'Patrick Mahomes Over 275.5 Passing Yards',
          market: 'Player Prop',
          sport: 'nfl',
          game: 'Kansas City Chiefs vs Buffalo Bills',
          awayTeam: 'Kansas City Chiefs',
          homeTeam: 'Buffalo Bills',
          odds: '-115',
          isPlayerProp: true,
          playerName: 'Patrick Mahomes',
          playerTeam: 'Kansas City Chiefs',
          presentation: {
            kind: 'player_prop',
            playerName: 'Patrick Mahomes',
            playerTeam: 'Kansas City Chiefs',
            side: 'over',
            propType: 'pass_yds',
          },
        },
      ],
    },
    mixed: {
      title: 'Mixed parlay — real team + player imagery',
      legs: [
        {
          pick: 'Kansas City Chiefs',
          market: 'Moneyline',
          sport: 'nfl',
          game: 'Kansas City Chiefs vs Buffalo Bills',
          awayTeam: 'Kansas City Chiefs',
          homeTeam: 'Buffalo Bills',
          odds: '-135',
        },
        {
          pick: 'Under 8.5',
          market: 'Total',
          side: 'under',
          sport: 'mlb',
          game: 'Boston Red Sox vs New York Yankees',
          awayTeam: 'Boston Red Sox',
          homeTeam: 'New York Yankees',
          odds: '-105',
        },
        {
          pick: 'Aaron Judge Over 1.5 Total Bases',
          market: 'Player Prop',
          sport: 'mlb',
          game: 'New York Yankees vs Boston Red Sox',
          awayTeam: 'New York Yankees',
          homeTeam: 'Boston Red Sox',
          odds: '-115',
          isPlayerProp: true,
          playerName: 'Aaron Judge',
          playerTeam: 'New York Yankees',
          presentation: {
            kind: 'player_prop',
            playerName: 'Aaron Judge',
            playerTeam: 'New York Yankees',
            side: 'over',
          },
        },
        {
          pick: 'Rasmus Neergaard-Petersen',
          market: 'Moneyline',
          sport: 'golf',
          game: 'Round 1 Matchup',
          odds: '+2200',
          playerName: 'Rasmus Neergaard-Petersen',
        },
        {
          pick: 'Carlos Alcaraz',
          market: 'Moneyline',
          sport: 'tennis',
          game: 'Carlos Alcaraz vs Jannik Sinner',
          awayTeam: 'Carlos Alcaraz',
          homeTeam: 'Jannik Sinner',
          odds: '-145',
          playerName: 'Carlos Alcaraz',
        },
      ],
    },
    fallback: {
      title: 'Missing-asset — intentional neutral fallback',
      legs: [
        {
          pick: 'Unresolved Selection XYZ',
          market: 'Moneyline',
          sport: 'mlb',
          game: 'Unknown Away vs Unknown Home',
          awayTeam: 'Unknown Away',
          homeTeam: 'Unknown Home',
          odds: '+100',
        },
      ],
    },
    broken: {
      title: 'Broken URL — graceful onerror fallback',
      legs: [
        {
          pick: 'Aaron Judge Over 1.5 Total Bases',
          market: 'Player Prop',
          sport: 'mlb',
          game: 'New York Yankees vs Boston Red Sox',
          awayTeam: 'New York Yankees',
          homeTeam: 'Boston Red Sox',
          odds: '-115',
          isPlayerProp: true,
          playerName: 'Aaron Judge',
          playerTeam: 'New York Yankees',
          presentation: {
            kind: 'player_prop',
            playerName: 'Aaron Judge',
            playerTeam: 'New York Yankees',
            // Force broken URL while keeping identity fields correct
            photoUrl: 'https://a.espncdn.com/i/headshots/mlb/players/full/__BROKEN_JUDGE_99999999__.png',
          },
        },
      ],
    },
  };

  const proof = {
    branch: 'feature/wager-visual-identity-continuity',
    baseSha: 'fac85b6',
    resolver: '_slipLegLogoHtml ← getTeamLogoImg / getPlayerPhotoImg / getGolfPlayerPhotoImg / getTennisPlayerPhotoImg',
    identityWrong: 0,
    examples: [],
    scenarios: {},
  };

  const identityChecks = [
    {
      label: 'Dodgers',
      kind: 'team',
      sport: 'mlb',
      display: 'Los Angeles Dodgers',
      expectedAbbrevOrId: 'lad',
      url: g.getTeamLogo('Los Angeles Dodgers', 'mlb', 80),
      dbNote: 'MLB logos via team-logos.js ESPN map (production path); team_logos DB is NCAAF/soccer',
    },
    {
      label: 'Ohio State',
      kind: 'team',
      sport: 'ncaaf',
      display: 'Ohio State Buckeyes',
      expectedAbbrevOrId: '194',
      url: 'https://a.espncdn.com/i/teamlogos/ncaa/500/194.png',
      dbNote: 'team_logos.ncaaf active row Ohio State Buckeyes → ncaa/500/194.png',
    },
    {
      label: 'Aaron Judge',
      kind: 'player',
      sport: 'mlb',
      display: 'Aaron Judge',
      expectedAbbrevOrId: '33192',
      url: g.getPlayerHeadshotUrl('Aaron Judge', 'mlb'),
      dbNote: 'player_photos verified espn_id=33192',
    },
    {
      label: 'Patrick Mahomes',
      kind: 'player',
      sport: 'nfl',
      display: 'Patrick Mahomes',
      expectedAbbrevOrId: '3139477',
      url: g.getPlayerHeadshotUrl('Patrick Mahomes', 'nfl'),
      dbNote: 'player_photos verified espn_id=3139477',
    },
    {
      label: 'Rasmus Neergaard-Petersen',
      kind: 'player',
      sport: 'golf',
      display: 'Rasmus Neergaard-Petersen',
      expectedAbbrevOrId: '4858859',
      url: g.getPlayerHeadshotUrl('Rasmus Neergaard-Petersen', 'golf'),
      dbNote: 'player_photos verified espn_id=4858859',
    },
    {
      label: 'Carlos Alcaraz',
      kind: 'player',
      sport: 'tennis',
      display: 'Carlos Alcaraz',
      expectedAbbrevOrId: '3782',
      url: g.getPlayerHeadshotUrl('Carlos Alcaraz', 'tennis'),
      dbNote: 'player_photos verified espn_id=3782',
    },
  ];

  for (const c of identityChecks) {
    const reach = await headOk(c.url);
    const identityMatch =
      !!c.url &&
      String(c.url).indexOf(String(c.expectedAbbrevOrId)) >= 0 &&
      reach.ok;
    if (!identityMatch) proof.identityWrong++;
    proof.examples.push({
      label: c.label,
      sport: c.sport,
      display: c.display,
      canonicalHint: c.expectedAbbrevOrId,
      url: c.url,
      reachable: reach.ok,
      httpStatus: reach.status,
      identityMatch,
      dbNote: c.dbNote,
    });
  }

  for (const [key, sc] of Object.entries(SCENARIOS)) {
    const rendered = sc.legs.map((leg) => {
      const input = h._wagerLegVisualInput(leg, leg.sport);
      const html = h._slipLegLogoHtml(input, { size: 36 });
      const srcs = allImgSrcs(html);
      return {
        pick: leg.pick,
        sport: leg.sport,
        market: leg.market,
        htmlPreview: html.slice(0, 220),
        imgSrcs: srcs,
        hasImg: srcs.length > 0,
        isFallback:
          /dkslip-dual-fallback|pb-text-fallback|dkslip-player-fallback/.test(html) &&
          srcs.length === 0,
      };
    });
    proof.scenarios[key] = { title: sc.title, legs: rendered };
  }

  // Write helpers JS for browser (exact production extract + globals from asset modules)
  const helpersJs =
    '/* AUTO-GENERATED from player.html — production wager visual helpers. Do not edit by hand. */\n' +
    '(function(global){\n"use strict";\n' +
    'var _currentSport = global._currentSport || "mlb";\n' +
    helperBody +
    '\nglobal._pbAvatarSportKey = _pbAvatarSportKey;\n' +
    'global._slipIsAthleteSport = _slipIsAthleteSport;\n' +
    'global._pbPlayerHeadshotImg = _pbPlayerHeadshotImg;\n' +
    'global._pbLobbyLogoImg = _pbLobbyLogoImg;\n' +
    'global._slipTotalSide = _slipTotalSide;\n' +
    'global._slipIsPlayerProp = _slipIsPlayerProp;\n' +
    'global._slipIsDrawSelection = _slipIsDrawSelection;\n' +
    'global._slipPlayerPropPhotoHtml = _slipPlayerPropPhotoHtml;\n' +
    'global._slipDualTeamLogoHtml = _slipDualTeamLogoHtml;\n' +
    'global._slipLegLogoHtml = _slipLegLogoHtml;\n' +
    'global._wagerLegVisualInput = _wagerLegVisualInput;\n' +
    'global._normalizeSlipMarket = _normalizeSlipMarket;\n' +
    'global.bsTeamAbbr = bsTeamAbbr;\n' +
    '})(typeof window !== "undefined" ? window : globalThis);\n';

  fs.writeFileSync(path.join(__dirname, 'wager-visual-prod-helpers.js'), helpersJs);

  // Also need _pbLobbyLogoImg which is later in player.html — check if extracted
  if (helperBody.indexOf('function _pbLobbyLogoImg') < 0) {
    // Extract from later section — _slipDualTeamLogoHtml depends on it
    const lobby = extractBetween(
      playerSrc,
      'function _pbLobbyLogoImg(name, sport, size)',
      'function _pbNormalizePropSport(sport)'
    );
    const patched =
      helpersJs.replace(
        'var _currentSport = global._currentSport || "mlb";\n',
        'var _currentSport = global._currentSport || "mlb";\n' + lobby + '\n'
      );
    // Wait - _pbLobbyLogoImg is used by _slipDualTeamLogoHtml but might not be in first extract.
    // First extract was _pbAvatarSportKey through teamAvatar — that includes _pbPlayerHeadshotImg
    // but NOT _pbLobbyLogoImg (that's at 5646). Second extract was bsTeamAbbr through _hydrate...
    // which includes _slipDualTeamLogoHtml that CALLS _pbLobbyLogoImg.
    // So we need to inject _pbLobbyLogoImg into helpers.
    fs.writeFileSync(
      path.join(__dirname, 'wager-visual-prod-helpers.js'),
      '/* AUTO-GENERATED from player.html — production wager visual helpers. Do not edit by hand. */\n' +
        '(function(global){\n"use strict";\n' +
        'var _currentSport = global._currentSport || "mlb";\n' +
        extractBetween(playerSrc, 'function _pbAvatarSportKey(sport)', 'function teamAvatar(name, sport, opts)') +
        '\n' +
        lobby +
        '\n' +
        extractBetween(playerSrc, 'function bsTeamAbbr(pickStr, game)', 'function _hydrateSlipPlayerPhotos(root)') +
        '\n' +
        extractBetween(playerSrc, 'function _normalizeSlipMarket(market)', 'function _resolveGameId(obj, cachedGame)') +
        '\n' +
        'global._pbAvatarSportKey = _pbAvatarSportKey;\n' +
        'global._slipIsAthleteSport = _slipIsAthleteSport;\n' +
        'global._pbPlayerHeadshotImg = _pbPlayerHeadshotImg;\n' +
        'global._pbLobbyLogoImg = _pbLobbyLogoImg;\n' +
        'global._slipTotalSide = _slipTotalSide;\n' +
        'global._slipIsPlayerProp = _slipIsPlayerProp;\n' +
        'global._slipIsDrawSelection = _slipIsDrawSelection;\n' +
        'global._slipPlayerPropPhotoHtml = _slipPlayerPropPhotoHtml;\n' +
        'global._slipDualTeamLogoHtml = _slipDualTeamLogoHtml;\n' +
        'global._slipLegLogoHtml = _slipLegLogoHtml;\n' +
        'global._slipMatchupTeams = _slipMatchupTeams;\n' +
        'global._wagerLegVisualInput = _wagerLegVisualInput;\n' +
        'global._normalizeSlipMarket = _normalizeSlipMarket;\n' +
        'global.bsTeamAbbr = bsTeamAbbr;\n' +
        '})(typeof window !== "undefined" ? window : globalThis);\n'
    );
  }

  // Re-verify Node harness includes lobby — rebuild h with lobby
  {
    const lobby = extractBetween(
      playerSrc,
      'function _pbLobbyLogoImg(name, sport, size)',
      'function _pbNormalizePropSport(sport)'
    );
    const harness2 =
      "'use strict';\n" +
      'var _currentSport = "mlb";\n' +
      extractBetween(playerSrc, 'function _pbAvatarSportKey(sport)', 'function teamAvatar(name, sport, opts)') +
      '\n' +
      lobby +
      '\n' +
      extractBetween(playerSrc, 'function bsTeamAbbr(pickStr, game)', 'function _hydrateSlipPlayerPhotos(root)') +
      '\n' +
      extractBetween(playerSrc, 'function _normalizeSlipMarket(market)', 'function _resolveGameId(obj, cachedGame)') +
      '\nmodule.exports = { _slipLegLogoHtml: _slipLegLogoHtml, _wagerLegVisualInput: _wagerLegVisualInput };\n';
    const sb2 = Object.assign({}, g, { console, module: { exports: {} }, exports: {}, _currentSport: 'mlb' });
    sb2.global = sb2;
    sb2.window = sb2;
    vm.createContext(sb2);
    vm.runInContext(harness2, sb2, { filename: 'wager-visual-helpers2.js' });
    const h2 = sb2.module.exports;
    for (const [key, sc] of Object.entries(SCENARIOS)) {
      proof.scenarios[key] = {
        title: sc.title,
        legs: sc.legs.map((leg) => {
          const input = h2._wagerLegVisualInput(leg, leg.sport);
          const html = h2._slipLegLogoHtml(input, { size: 36 });
          const srcs = allImgSrcs(html);
          return {
            pick: leg.pick,
            sport: leg.sport,
            market: leg.market,
            htmlPreview: html.slice(0, 280),
            imgSrcs: srcs,
            hasImg: srcs.length > 0,
            isFallback:
              /dkslip-dual-fallback|pb-text-fallback|dkslip-player-fallback/.test(html) &&
              srcs.length === 0,
          };
        }),
      };
    }
  }

  fs.writeFileSync(OUT_PROOF, JSON.stringify(proof, null, 2));

  const scenariosJson = JSON.stringify(SCENARIOS, null, 2);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>Wager Visual Identity — Real Asset Owner Preview</title>
<style>
  :root {
    --bg: #0e0e10;
    --panel: #18181b;
    --green: #00c853;
    --blue: #0064c8;
    --muted: #a1a1aa;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #1f2937 0%, var(--bg) 55%);
    color: #f4f4f5;
  }
  .topbar {
    position: sticky; top: 0; z-index: 50;
    backdrop-filter: blur(10px);
    background: rgba(14,14,16,.92);
    border-bottom: 1px solid #27272a;
    padding: calc(8px + env(safe-area-inset-top,0px)) 12px 10px;
  }
  .topbar h1 { margin: 0; font-size: 13px; font-weight: 900; letter-spacing: .2px; }
  .topbar p { margin: 3px 0 0; font-size: 11px; color: var(--muted); line-height: 1.35; }
  .controls { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
  .chip, .btn {
    border: 1px solid #3f3f46; background: #27272a; color: #fafafa;
    border-radius: 999px; padding: 7px 10px; font-size: 11px; font-weight: 800; cursor: pointer;
  }
  .chip.active { background: #fafafa; color: #111; border-color: #fafafa; }
  .btn.primary { background: var(--green); border-color: var(--green); color: #fff; }
  .hint { margin-top: 6px; font-size: 10px; color: var(--muted); line-height: 1.35; }
  .hint code { color: #fde68a; }
  .proof {
    margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: #111827;
    border: 1px solid #374151; font-size: 10px; color: #cbd5e1; line-height: 1.4;
    max-height: 96px; overflow: auto;
  }
  .proof strong { color: #86efac; }
  .proof .bad { color: #fca5a5; }
  .stage-wrap { display: flex; justify-content: center; padding: 10px 10px 24px; }
  .phone-shell {
    width: var(--vw, 390px); max-width: 100%;
    height: min(844px, calc(100dvh - 200px)); min-height: 520px;
    background: #09090b; border: 1px solid #3f3f46; border-radius: 24px;
    overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,.55); position: relative;
  }
  .phone-shell.desktop { height: min(900px, calc(100dvh - 190px)); border-radius: 16px; }
  @media (max-width: 520px) {
    .topbar p, .hint { display: none; }
    .stage-wrap { padding: 0; }
    .phone-shell {
      width: 100% !important; max-width: none; height: calc(100dvh - 170px);
      min-height: 0; border: none; border-radius: 0; box-shadow: none;
    }
  }
  .app {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    background: linear-gradient(180deg, #111827 0%, #0b1220 40%, #09090b 100%);
  }
  .stage-label {
    flex-shrink: 0; padding: 10px 14px 6px; font-size: 10px; font-weight: 900;
    letter-spacing: .5px; text-transform: uppercase; color: #94a3b8;
  }
  .sheet {
    flex: 1; margin: 0 10px 12px; background: #fff; color: #111;
    border-radius: 18px 18px 14px 14px; overflow: hidden;
    display: flex; flex-direction: column; min-height: 0;
  }
  .sheet-hd {
    flex-shrink: 0; padding: 12px 14px; border-bottom: 1px solid #f0f0f0;
    font-size: 13px; font-weight: 900;
  }
  .sheet-hd .sub { font-size: 11px; color: #666; font-weight: 700; margin-top: 2px; }
  .sheet-bd { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 4px 0 8px; }
  .sheet-ft {
    flex-shrink: 0; padding: 10px 14px calc(12px + env(safe-area-inset-bottom,0px));
    border-top: 1px solid #eee; background: #fff;
  }
  .cta {
    width: 100%; height: 48px; border: none; border-radius: 12px;
    background: var(--green); color: #fff; font-weight: 900; font-size: 15px; cursor: pointer;
  }
  .cta.sec { background: transparent; color: #555; height: 40px; margin-top: 6px; }

  /* Mirror production wager visual CSS (approved layout — unchanged) */
  .dkslip-leg{display:flex;align-items:flex-start;padding:10px 14px;border-bottom:1px solid #f5f5f5;gap:10px}
  .dkslip-leg-logo{width:36px;height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:visible;background:transparent;border:none;padding:0}
  .dkslip-leg-logo img,.rb-leg-visual img{width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))}
  .dkslip-player-photo,.dkslip-leg-logo img.dkslip-player-photo{object-fit:cover!important;border-radius:8px!important}
  .dkslip-dual-logos{position:relative;width:36px;height:36px;flex-shrink:0}
  .dkslip-dual-a,.dkslip-dual-b{position:absolute;width:24px;height:24px;display:flex;align-items:center;justify-content:center}
  .dkslip-dual-a{left:0;top:1px;z-index:1}
  .dkslip-dual-b{right:0;bottom:1px;z-index:2}
  .dkslip-dual-fallback{font-size:10px;font-weight:900;color:#888;display:flex;align-items:center;justify-content:center;width:100%;height:100%}
  .dkslip-player-fallback,.pb-text-fallback{font-size:8px;font-weight:900;color:#666;text-align:center;line-height:1.1;max-width:72px;overflow:hidden}
  .dkslip-leg-info{flex:1;min-width:0}
  .dkslip-leg-matchup{font-size:10px;color:#999;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dkslip-leg-pick{font-size:14px;font-weight:900;color:#111;line-height:1.25;overflow-wrap:anywhere;word-break:break-word}
  .dkslip-leg-mkt{font-size:10px;font-weight:700;color:var(--blue);text-transform:uppercase;margin-top:2px}
  .dkslip-leg-odds{font-size:13px;font-weight:900;color:#111;flex-shrink:0;padding-left:8px;white-space:nowrap}
  .dkslip-leg-rm{background:none;border:none;color:#bbb;font-size:12px;cursor:pointer;flex-shrink:0}
  .rb-leg{display:flex;align-items:flex-start;padding:8px 14px;border-bottom:1px solid #f0f0f0;gap:0}
  .rb-leg-visual{width:32px;height:32px;flex-shrink:0;margin-right:8px;display:flex;align-items:center;justify-content:center}
  .rb-leg-pick{font-size:13px;font-weight:800;line-height:1.25;overflow-wrap:anywhere}
  .rb-leg-pick--won{color:#00a854}
  .rb-leg-pick--lost{color:#ef4444}
  .rb-leg-meta{font-size:10px;color:#888;font-weight:700;margin-top:2px}
  .rb-legs-more{padding:8px 14px;font-size:11px;font-weight:800;color:#888}
  .badge{display:inline-block;font-size:9px;font-weight:900;padding:3px 7px;border-radius:999px;margin-left:6px}
  .badge.won{background:#e8faf0;color:#00a854}
  .badge.lost{background:#fef2f2;color:#ef4444}
  .note{padding:8px 14px;font-size:10px;color:#888;line-height:1.35}
</style>
</head>
<body>
  <div class="topbar">
    <h1>Wager Visual Identity — Real Asset Owner Preview</h1>
    <p>Production resolvers · <strong>no production wager</strong> · branch <code>feature/wager-visual-identity-continuity</code> · helpers from <code>player.html</code> + <code>team-logos.js</code> + <code>player-photos.js</code></p>
    <div class="controls">
      <button class="chip active" data-scenario="mlb-ml" type="button">1 MLB ML</button>
      <button class="chip" data-scenario="ncaaf-spread" type="button">2 NCAAF Spread</button>
      <button class="chip" data-scenario="mlb-total" type="button">3 MLB Total</button>
      <button class="chip" data-scenario="golf" type="button">4 Golf</button>
      <button class="chip" data-scenario="tennis" type="button">5 Tennis</button>
      <button class="chip" data-scenario="prop" type="button">6 Player Prop</button>
      <button class="chip" data-scenario="two-leg" type="button">7 2-leg Parlay</button>
      <button class="chip" data-scenario="mixed" type="button">8 Mixed Parlay</button>
      <button class="chip" data-scenario="fallback" type="button">9 Fallback</button>
      <button class="chip" data-scenario="broken" type="button">10 Broken URL</button>
    </div>
    <div class="controls">
      <button class="chip active" data-stage="slip" type="button">Bet Slip</button>
      <button class="chip" data-stage="confirm" type="button">Confirm Wager</button>
      <button class="chip" data-stage="confirmed" type="button">Bet Confirmed</button>
      <button class="chip" data-stage="mybets" type="button">My Bets</button>
      <button class="chip" data-stage="results" type="button">Results</button>
      <button class="btn" data-vw="390" type="button">390</button>
      <button class="btn" data-vw="430" type="button">430</button>
      <button class="btn" data-vw="768" type="button">768</button>
      <button class="btn" data-vw="1280" type="button">1280</button>
      <button class="btn" data-vw="1440" type="button">1440</button>
    </div>
    <div class="hint">Visuals via production <code>_slipLegLogoHtml</code> only. Examples: Dodgers, Ohio State, Red Sox/Yankees, Neergaard-Petersen, Alcaraz, Aaron Judge, Mahomes.</div>
    <div class="proof" id="proof">Loading real-asset proof…</div>
  </div>
  <div class="stage-wrap">
    <div class="phone-shell" id="shell"><div class="app" id="app"></div></div>
  </div>
<script src="/player-photos.js"></script>
<script src="/team-logos.js"></script>
<script src="/.tmp-asset-audit/wager-visual-prod-helpers.js"></script>
<script>
(function(){
  var state = { scenario: 'mlb-ml', stage: 'slip', vw: 390 };
  var SCENARIOS = ${scenariosJson};

  function matchupOf(leg) {
    return leg.game || ((leg.awayTeam || '') + (leg.homeTeam ? ' vs ' + leg.homeTeam : ''));
  }

  function visualHtml(leg, size) {
    size = size || 36;
    if (typeof _slipLegLogoHtml !== 'function' || typeof _wagerLegVisualInput !== 'function') {
      return '<div class="dkslip-leg-logo"><span class="dkslip-dual-fallback">ERR</span></div>';
    }
    var input = _wagerLegVisualInput(leg, leg.sport);
    return _slipLegLogoHtml(input, { size: size });
  }

  function legRow(leg, opts) {
    opts = opts || {};
    var rm = opts.remove
      ? '<button class="dkslip-leg-rm" type="button" aria-label="Remove">✕</button>' : '';
    return '<div class="dkslip-leg">' +
      visualHtml(leg, 36) +
      '<div class="dkslip-leg-info">' +
        '<div class="dkslip-leg-matchup">'+matchupOf(leg)+'</div>' +
        '<div class="dkslip-leg-pick">'+leg.pick+'</div>' +
        '<div class="dkslip-leg-mkt">'+leg.market+'</div>' +
      '</div>' +
      '<div style="display:flex;align-items:flex-start;gap:4px;flex-shrink:0">' +
        '<span class="dkslip-leg-odds">'+(leg.odds||'')+'</span>' + rm +
      '</div></div>';
  }

  function rbLeg(leg, resultClass) {
    return '<div class="rb-leg">' +
      '<div class="rb-leg-visual">'+visualHtml(leg, 32)+'</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div class="rb-leg-pick '+(resultClass||'')+'">'+leg.pick+'</div>' +
        '<div class="rb-leg-meta">'+leg.market+' · '+matchupOf(leg)+'</div>' +
      '</div>' +
      '<div class="dkslip-leg-odds">'+(leg.odds||'')+'</div></div>';
  }

  function renderLegs(legs, opts) {
    opts = opts || {};
    var cap = opts.cap || 99;
    var visible = legs.slice(0, cap);
    var hidden = Math.max(0, legs.length - cap);
    var html = visible.map(function(l){ return opts.rb ? rbLeg(l, opts.resultClass) : legRow(l, opts); }).join('');
    if (hidden) html += '<div class="rb-legs-more">+'+hidden+' more leg'+(hidden===1?'':'s')+'</div>';
    return html;
  }

  function renderProof() {
    var el = document.getElementById('proof');
    if (!el) return;
    var bits = [];
    bits.push('<strong>Resolver:</strong> _slipLegLogoHtml (production extract)');
    var keys = Object.keys(SCENARIOS);
    keys.forEach(function(k){
      var sc = SCENARIOS[k];
      var html = sc.legs.map(function(l){ return visualHtml(l, 36); }).join('');
      var imgs = (html.match(/src="/g) || []).length;
      var fb = /dkslip-dual-fallback|pb-text-fallback|dkslip-player-fallback/.test(html);
      bits.push(k + ': imgs=' + imgs + (fb && !imgs ? ' · fallback' : ' · resolved'));
    });
    el.innerHTML = bits.join(' · ');
  }

  function render() {
    var sc = SCENARIOS[state.scenario];
    var legs = sc.legs;
    var isParlay = legs.length > 1;
    var shell = document.getElementById('shell');
    shell.style.setProperty('--vw', state.vw + 'px');
    shell.classList.toggle('desktop', state.vw >= 768);

    var title, body, ft, label;
    if (state.stage === 'slip') {
      label = 'Bet Slip';
      title = (isParlay ? legs.length + ' Pick Parlay' : 'Straight') +
        '<div class="sub">'+sc.title+'</div>';
      body = renderLegs(legs, { remove: true });
      ft = '<button class="cta" type="button">Place Bet — $10.00</button>';
    } else if (state.stage === 'confirm') {
      label = 'Confirm Wager';
      title = 'Confirm Wager<div class="sub">'+(isParlay?'Parlay':'Singles')+' · '+legs.length+' pick'+(legs.length>1?'s':'')+'</div>';
      body = renderLegs(legs, { cap: 4 }) +
        '<div class="note">Play credits only · Not real money · Visual preview only</div>';
      ft = '<button class="cta" type="button">Confirm Bet — $10.00</button>' +
        '<button class="cta sec" type="button">Back to Bet Slip</button>';
    } else if (state.stage === 'confirmed') {
      label = 'Bet Confirmed';
      title = '✓ Bet Confirmed<div class="sub">'+(isParlay?'Parlay':'Single')+'</div>';
      body = renderLegs(legs, { cap: 4 }) +
        '<div class="note">Ref PREVIEW_ONLY · no ticket written</div>';
      ft = '<button class="cta" type="button">Done</button>' +
        '<button class="cta sec" type="button">View My Bets</button>';
    } else if (state.stage === 'mybets') {
      label = 'My Bets';
      title = 'Active<span class="badge won">OPEN</span><div class="sub">'+sc.title+'</div>';
      body = renderLegs(legs, { rb: true, cap: 3 });
      ft = '<div class="note">Per-leg visuals · first 3 +N for large parlays</div>';
    } else {
      label = 'Results';
      title = 'Settled<span class="badge '+(state.scenario==='fallback'||state.scenario==='broken'?'lost':'won')+'">'+(state.scenario==='fallback'||state.scenario==='broken'?'LOST':'WON')+'</span>' +
        '<div class="sub">Text may tint · logos/photos stay neutral</div>';
      body = renderLegs(legs, {
        rb: true, cap: 3,
        resultClass: (state.scenario === 'fallback' || state.scenario === 'broken') ? 'rb-leg-pick--lost' : 'rb-leg-pick--won'
      });
      ft = '<div class="note">No green/red filters on images</div>';
    }

    document.getElementById('app').innerHTML =
      '<div class="stage-label">'+label+'</div>' +
      '<div class="sheet">' +
        '<div class="sheet-hd">'+title+'</div>' +
        '<div class="sheet-bd">'+body+'</div>' +
        '<div class="sheet-ft">'+ft+'</div>' +
      '</div>';

    // After render: hydrate placeholders if any, and exercise broken-url path via real onerror
    if (typeof hydratePlayerPhotos === 'function') {
      try { hydratePlayerPhotos(document.getElementById('app')); } catch (_e) {}
    }
    renderProof();
  }

  document.querySelectorAll('[data-scenario]').forEach(function(btn){
    btn.addEventListener('click', function(){
      state.scenario = btn.getAttribute('data-scenario');
      document.querySelectorAll('[data-scenario]').forEach(function(b){ b.classList.toggle('active', b===btn); });
      render();
    });
  });
  document.querySelectorAll('[data-stage]').forEach(function(btn){
    btn.addEventListener('click', function(){
      state.stage = btn.getAttribute('data-stage');
      document.querySelectorAll('[data-stage]').forEach(function(b){ b.classList.toggle('active', b===btn); });
      render();
    });
  });
  document.querySelectorAll('[data-vw]').forEach(function(btn){
    btn.addEventListener('click', function(){
      state.vw = parseInt(btn.getAttribute('data-vw'), 10);
      render();
    });
  });
  render();
})();
</script>
</body>
</html>
`;

  fs.writeFileSync(OUT_HTML, html);
  console.log('Wrote', OUT_HTML);
  console.log('Wrote', OUT_PROOF);
  console.log('identityWrong', proof.identityWrong);
  for (const ex of proof.examples) {
    console.log(
      (ex.identityMatch ? 'OK' : 'FAIL'),
      ex.label,
      'reachable=' + ex.reachable,
      'status=' + ex.httpStatus
    );
  }
  for (const [k, sc] of Object.entries(proof.scenarios)) {
    const imgs = sc.legs.reduce((n, l) => n + (l.imgSrcs || []).length, 0);
    const fb = sc.legs.some((l) => l.isFallback);
    console.log('SCENARIO', k, 'imgs=' + imgs, fb ? 'fallback' : 'ok');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
