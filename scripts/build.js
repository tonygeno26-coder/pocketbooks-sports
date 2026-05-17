#!/usr/bin/env node
/**
 * build.js — PocketBooks Sports build pipeline
 *
 * What it does:
 *   1. Stamps build.json + SHA into all HTML files
 *   2. Validates JS syntax in all HTML script blocks
 *   3. Writes a build manifest (build-manifest.json)
 *
 * Does NOT bundle/minify — the app is intentionally vanilla HTML/JS.
 * Vercel deploys the repo root as static files with /api/* rewrites.
 *
 * Run: node scripts/build.js
 */
'use strict';
const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let exitCode = 0;

console.log('\n🏗️  PocketBooks Sports Build\n');

// ── Step 1: Stamp build.json + SHA ──────────────────────────────────────────
console.log('── Step 1: Stamp build info');
require('./stamp-build.js');

// ── Step 2: JS syntax check on all HTML files ────────────────────────────────
console.log('\n── Step 2: JS syntax check');
const htmlFiles = ['player.html', 'index.html', 'dev.html']
  .map(f => path.join(ROOT, f))
  .filter(f => fs.existsSync(f));

const scriptRx = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let syntaxOk = true;

for (const filePath of htmlFiles) {
  const src = fs.readFileSync(filePath, 'utf8');
  const fname = path.basename(filePath);
  let blockIdx = 0;
  let m;
  scriptRx.lastIndex = 0;
  while ((m = scriptRx.exec(src)) !== null) {
    blockIdx++;
    const code = m[1];
    if (!code.trim()) continue;
    const tmp = path.join(require('os').tmpdir(), `pbs_chk_${fname}_${blockIdx}.js`);
    fs.writeFileSync(tmp, code, 'utf8');
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    if (r.status !== 0) {
      console.error(`  ❌ ${fname} block ${blockIdx}: ${r.stderr.split('\n')[0]}`);
      syntaxOk = false;
      exitCode = 1;
    }
  }
  if (syntaxOk) console.log(`  ✅ ${fname}: syntax OK`);
}

// ── Step 3: Guard check — no raw JS visible as text ─────────────────────────
console.log('\n── Step 3: DOM injection guard');
for (const filePath of htmlFiles) {
  const src = fs.readFileSync(filePath, 'utf8');
  const fname = path.basename(filePath);
  // Strip all script blocks, check no raw JS leaked into HTML body
  const stripped = src.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  const leakPatterns = ['_versionGuard', 'function bsAddStake', 'function confirmBet'];
  const leaked = leakPatterns.filter(p => stripped.includes(p));
  if (leaked.length) {
    console.error(`  ❌ ${fname}: raw JS in HTML body: ${leaked.join(', ')}`);
    exitCode = 1;
  } else {
    console.log(`  ✅ ${fname}: no raw JS in body`);
  }
}

// ── Step 4: Write build manifest ─────────────────────────────────────────────
console.log('\n── Step 4: Build manifest');
const buildJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'build.json'), 'utf8'));
const manifest = {
  ...buildJson,
  files: htmlFiles.map(f => path.basename(f)),
  syntaxOk,
  buildTime: new Date().toISOString()
};
fs.writeFileSync(path.join(ROOT, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`  ✅ build-manifest.json written — sha=${manifest.sha}`);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + (exitCode === 0
  ? `✅ Build complete — sha=${manifest.sha}`
  : '❌ Build FAILED — fix errors before deploying'));

process.exit(exitCode);
