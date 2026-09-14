'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const lobby = fs.readFileSync(path.join(root, 'lobby.html'), 'utf8');
const host = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const player = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
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

assert.ok(player.includes("return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'"),
  'player preview host helper must accept loopback only');
assert.ok(player.includes('Visual QA preview — financial actions disabled'),
  'player local preview must remain read-only');

assert.ok(dev.includes('DEV_PREVIEW_LOCAL_ONLY'), 'dev preview needs a local-only gate');
assert.ok(dev.includes("throw new Error('dev_preview_local_only')"),
  'deployed dev preview must stop before token or membership actions');
assert.ok(dev.indexOf('DEV_PREVIEW_LOCAL_ONLY') < dev.indexOf('var HOST_BYPASS'),
  'dev preview gate must run before bypass configuration');

console.log('preview production security: PASS');
