#!/usr/bin/env node
/**
 * stamp-build.js
 * Writes build.json with current git SHA + timestamp.
 * Patches window.PBS_BUILD_SHA in all HTML files.
 * Run: node scripts/stamp-build.js
 * Also run automatically as git pre-commit hook.
 */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Get current git SHA
let sha = 'unknown';
try { sha = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch(_) {}

const builtAt = new Date().toISOString();
const buildInfo = { sha, builtAt };

// Write build.json
const buildJsonPath = path.join(ROOT, 'build.json');
fs.writeFileSync(buildJsonPath, JSON.stringify(buildInfo, null, 2) + '\n');
console.log(`[stamp] build.json → sha=${sha} builtAt=${builtAt}`);

// Patch PBS_BUILD_SHA in HTML files
const htmlFiles = ['player.html', 'index.html', 'dev.html', 'lobby.html', 'admin.html']
  .map(f => path.join(ROOT, f))
  .filter(f => fs.existsSync(f));

for (const filePath of htmlFiles) {
  let src = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Patch window.PBS_BUILD_SHA = '...'
  const shaRx = /window\.PBS_BUILD_SHA\s*=\s*'[^']*'/;
  if (shaRx.test(src)) {
    src = src.replace(shaRx, `window.PBS_BUILD_SHA = '${sha}'`);
    changed = true;
  }

  // Patch window.PBS_BUILD_DATE = '...'
  const dateRx = /window\.PBS_BUILD_DATE\s*=\s*'[^']*'/;
  if (dateRx.test(src)) {
    src = src.replace(dateRx, `window.PBS_BUILD_DATE = '${builtAt}'`);
    changed = true;
  }

  // Patch footer badge: main · <sha> · <date>
  const badgeRx = /main\s*·\s*[a-z0-9]{7,}\s*·\s*[^<"']*/;
  if (badgeRx.test(src)) {
    const dateStr = new Date(builtAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    src = src.replace(badgeRx, `main · ${sha} · ${dateStr}`);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, src, 'utf8');
    console.log(`[stamp] patched ${path.basename(filePath)}`);
  }
}

console.log(`[stamp] done — sha=${sha}`);
module.exports = buildInfo;
