#!/usr/bin/env node
/**
 * PocketBooks Sports — Combined Deploy Verification
 * Runs backend + frontend smoke checks and emits a single PASS/FAIL verdict.
 *
 * Usage:
 *   VERIFY_BASE_URL=https://... VERIFY_FRONTEND_URL=https://... \
 *   VERIFY_OWNER_ID=H1 VERIFY_CLUB_ID=C1 node scripts/verify-deploy.js
 *
 * Or via package script:
 *   npm run verify:deploy
 *
 * Env vars (pass-through to sub-scripts — see each script for full list):
 *   VERIFY_BASE_URL        — backend Railway URL
 *   VERIFY_FRONTEND_URL    — Vercel frontend URL
 *   VERIFY_OWNER_ID        — full_admin actorId for backend auth checks
 *   VERIFY_CLUB_ID         — clubId
 *   VERIFY_PLAYER_ID       — (optional) player actorId
 *   VERIFY_PLAYER_URL      — (optional) player.html URL to spot-check
 *   VERIFY_TIMEOUT_MS      — per-request timeout (default 10000)
 *   VERIFY_STOP_ON_FAIL    — set to "true" to skip frontend if backend fails
 *   VERIFY_CHECK_ASSETS    — set to "true" to HEAD-check frontend assets
 */
'use strict';

const { spawnSync } = require('child_process');
const path          = require('path');

const STOP_ON_FAIL = process.env.VERIFY_STOP_ON_FAIL === 'true';
const SCRIPTS_DIR  = __dirname;

// ── Runner ────────────────────────────────────────────────────────────────────

function runScript(scriptName) {
  var scriptPath = path.join(SCRIPTS_DIR, scriptName);
  console.log('\n' + '─'.repeat(58));
  console.log('▶  Running ' + scriptName + ' ...');
  console.log('─'.repeat(58));
  var r = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    env:   process.env
  });
  return r.status != null ? r.status : 1;
}

// ── Report ────────────────────────────────────────────────────────────────────

function buildCombinedReport(backendCode, frontendCode, frontendSkipped) {
  var backendPass  = backendCode  === 0;
  var frontendPass = frontendSkipped ? null : frontendCode === 0;
  var overallPass  = backendPass && (frontendSkipped ? false : frontendPass);
  return { backendPass, frontendPass, frontendSkipped: !!frontendSkipped, overallPass,
           exitCode: overallPass ? 0 : 1 };
}

function printCombinedReport(r) {
  console.log('\n══ Combined Deploy Verify Report ══════════════════');
  console.log('  Backend:  ' + (r.backendPass  ? '🟢 PASS' : '🔴 FAIL'));
  if (r.frontendSkipped) {
    console.log('  Frontend: ⏭  SKIPPED (VERIFY_STOP_ON_FAIL=true + backend failed)');
  } else {
    console.log('  Frontend: ' + (r.frontendPass ? '🟢 PASS' : '🔴 FAIL'));
  }
  console.log('  ' + '─'.repeat(47));
  if (r.overallPass) {
    console.log('  Overall:  🟢 PASS — deploy verified');
  } else {
    console.log('  Overall:  🔴 FAIL — do not go live');
    if (!r.backendPass)  console.log('     → Fix backend issues first (env vars, DB, auth)');
    if (!r.frontendSkipped && !r.frontendPass)
      console.log('     → Fix frontend issues (missing markers, broken assets)');
    if (r.frontendSkipped)
      console.log('     → Re-run after backend is fixed to check frontend');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('\n🚀 Pocketbooks Sports — Full Deploy Verification');
  console.log('   Stop on fail: ' + STOP_ON_FAIL);

  // 1. Backend check
  var backendCode = runScript('verify-production.js');

  // 2. Frontend check (skip if stop-on-fail + backend failed)
  var frontendSkipped = STOP_ON_FAIL && backendCode !== 0;
  var frontendCode    = 0;
  if (!frontendSkipped) {
    frontendCode = runScript('verify-frontend.js');
  }

  // 3. Combined report + exit
  var report = buildCombinedReport(backendCode, frontendCode, frontendSkipped);
  printCombinedReport(report);
  process.exit(report.exitCode);
}

main();
