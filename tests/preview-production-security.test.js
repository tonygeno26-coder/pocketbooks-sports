'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const lobby = fs.readFileSync(path.join(root, 'lobby.html'), 'utf8');
const host = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const player = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
const survivor = fs.readFileSync(path.join(root, 'survivor.html'), 'utf8');
const dev = fs.readFileSync(path.join(root, 'dev.html'), 'utf8');

assert.ok(lobby.includes("const _preview = _previewLocal && _params.get('preview') === '1'"),
  'lobby preview must be localhost-gated');
assert.ok(lobby.includes('const isPreview = _preview;'),
  'lobby init must reuse the gated preview decision');
assert.ok(!lobby.includes("verdict === 'fatal' && TOKEN"),
  'club token mint must never retry without bearer');

assert.ok(host.includes("_hPreview = _hPreviewLocal && _hp.get('preview') === '1'"),
  'host preview must be localhost-gated');
assert.ok(host.includes('_hPrev = _hPrevLocal && new URLSearchParams(location.search)'),
  'early host auth bypass must be localhost-gated');
assert.ok(host.includes("_redirectLocal && new URLSearchParams(location.search).get('preview') === '1'"),
  'host auth redirect bypass must be localhost-gated');

const hostOps = fs.readFileSync(path.join(root, 'host-beta-ops.js'), 'utf8');
assert.ok(hostOps.includes('_isLocalPreview'), 'beta ops preview must be localhost-gated');
assert.ok(hostOps.includes("h === 'localhost'") || hostOps.includes("=== 'localhost'"),
  'beta ops preview host helper must accept loopback only');
assert.ok(hostOps.includes('_previewFixture') || hostOps.includes('LOCAL-ONLY'),
  'beta ops local fixture must be explicit');
assert.ok(hostOps.includes('_isLocalPreview()'),
  'beta ops fixture must never arm from query flag alone');

const hostOpsGate = fs.readFileSync(path.join(root, '_host-beta-ops-visual-gate.html'), 'utf8');
assert.ok(hostOpsGate.includes('__HBO_GATE_LOCAL'), 'ops visual gate must gate on localhost');
assert.ok(hostOpsGate.includes('Visual gate unavailable') || hostOpsGate.includes('restricted to localhost'),
  'ops visual gate must block deployed hosts');
assert.ok(!hostOpsGate.includes('mint') || hostOpsGate.includes('No session minting'),
  'ops visual gate must not enable session minting');

assert.ok(player.includes("return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'"),
  'player preview host helper must accept loopback only');
assert.ok(player.includes('Visual QA preview — financial actions disabled'),
  'player local preview must remain read-only');

assert.ok(survivor.includes('var _sPreview = _isLocalHostName() && _sPreviewFlag'),
  'survivor preview must be localhost-gated');
assert.ok(survivor.includes("h === 'localhost' || h === '127.0.0.1' || h === '[::1]'"),
  'survivor host helper must accept loopback only');
assert.ok(survivor.includes("error: 'preview_readonly'"),
  'survivor preview must refuse writes');
assert.ok(survivor.includes('PREVIEW_READONLY'),
  'survivor preview write block must be explicit');
assert.ok(survivor.includes('if (_sPreview)'),
  'survivor init must branch on gated preview');
assert.ok(!/_sPreview\s*=\s*_sPreviewFlag\s*;/.test(survivor),
  'survivor preview must never arm from query flag alone');
assert.ok(survivor.includes('_sTestUserFlag'),
  'survivor must acknowledge testUser flag without production bypass');
assert.ok(!survivor.includes('_sPreview = _isLocalHostName() && (_sPreviewFlag || _sTestUserFlag)'),
  'testUser must not grant survivor fixture preview');

assert.ok(dev.includes('DEV_PREVIEW_LOCAL_ONLY'), 'dev preview needs a local-only gate');
assert.ok(dev.includes("throw new Error('dev_preview_local_only')"),
  'deployed dev preview must stop before token or membership actions');
assert.ok(dev.indexOf('DEV_PREVIEW_LOCAL_ONLY') < dev.indexOf('var HOST_BYPASS'),
  'dev preview gate must run before bypass configuration');

console.log('preview production security: PASS');
