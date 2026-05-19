#!/usr/bin/env node
/**
 * PocketBooks Sports — Release Note Generator
 * Prints a markdown release note and optionally prepends it to CHANGELOG.md.
 *
 * Usage:
 *   RELEASE_VERSION=1.0.0 FRONTEND_SHA=abc123 BACKEND_SHA=def456 \
 *   TEST_COUNT=1288 VERIFY_STATUS=PASS node scripts/create-release-note.js
 *
 * Or via package script:
 *   npm run release:note
 *
 * Required env vars:
 *   RELEASE_VERSION   — semver string, e.g. 1.0.0
 *   FRONTEND_SHA      — git SHA of the deployed frontend commit
 *   BACKEND_SHA       — git SHA of the deployed backend commit
 *   TEST_COUNT        — number of passing tests at time of release
 *   VERIFY_STATUS     — PASS or FAIL (from npm run verify:deploy)
 *
 * Optional env vars:
 *   NOTES             — free-text notes for this release
 *   RELEASE_APPEND    — set to "true" to prepend note into CHANGELOG.md
 *   CHANGELOG_PATH    — path to CHANGELOG.md (default: CHANGELOG.md in repo root)
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const REQUIRED = ['RELEASE_VERSION','FRONTEND_SHA','BACKEND_SHA','TEST_COUNT','VERIFY_STATUS'];

// ── Env preflight ─────────────────────────────────────────────────────────────

function checkEnv(env) {
  var missing = REQUIRED.filter(function(k){ return !env[k]; });
  return { ok: missing.length === 0, missing };
}

// ── Note builder ──────────────────────────────────────────────────────────────

function buildReleaseNote(env) {
  var today       = new Date().toISOString().slice(0, 10);
  var verifyBadge = env.VERIFY_STATUS === 'PASS' ? '🟢 PASS' : '🔴 FAIL';
  var lines = [
    '## v' + env.RELEASE_VERSION + ' — ' + today,
    '',
    '| Field | Value |',
    '|---|---|',
    '| Frontend SHA | `' + env.FRONTEND_SHA + '` |',
    '| Backend SHA  | `' + env.BACKEND_SHA  + '` |',
    '| Test count   | ' + env.TEST_COUNT + ' |',
    '| Verify status | ' + verifyBadge + ' |',
  ];
  if (env.NOTES && env.NOTES.trim()) {
    lines.push('| Notes | ' + env.NOTES.trim() + ' |');
  }
  lines.push('');
  return lines.join('\n');
}

// ── Safe prepend into CHANGELOG ───────────────────────────────────────────────

function safeAppend(changelogPath, note) {
  var existing = '';
  try { existing = fs.readFileSync(changelogPath, 'utf8'); } catch(_) {}
  var h1end   = existing.indexOf('\n');
  var header  = h1end > -1 && existing.startsWith('#')
    ? existing.slice(0, h1end + 1) + '\n'
    : '';
  var rest    = h1end > -1 && existing.startsWith('#')
    ? existing.slice(h1end + 1)
    : existing;
  var updated = header + note + rest;
  fs.writeFileSync(changelogPath, updated, 'utf8');
  return updated;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  var env = process.env;
  var check = checkEnv(env);
  if (!check.ok) {
    console.error('❌ Missing required env vars: ' + check.missing.join(', '));
    console.error('');
    console.error('Usage:');
    console.error('  RELEASE_VERSION=1.0.0 \\');
    console.error('  FRONTEND_SHA=<sha>    \\');
    console.error('  BACKEND_SHA=<sha>     \\');
    console.error('  TEST_COUNT=1288       \\');
    console.error('  VERIFY_STATUS=PASS    \\');
    console.error('  [NOTES="optional"]    \\');
    console.error('  [RELEASE_APPEND=true] \\');
    console.error('  npm run release:note');
    process.exit(1);
  }

  var note = buildReleaseNote(env);

  // Always print the note
  console.log('\n── Release Note ────────────────────────────────────');
  console.log(note);

  if (env.RELEASE_APPEND === 'true') {
    var changelogPath = env.CHANGELOG_PATH
      || path.join(__dirname, '..', 'CHANGELOG.md');
    safeAppend(changelogPath, note);
    console.log('✅ Prepended to ' + path.basename(changelogPath));
  } else {
    console.log('ℹ  Set RELEASE_APPEND=true to prepend this note to CHANGELOG.md');
  }
}

main();
