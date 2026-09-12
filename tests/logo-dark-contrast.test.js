#!/usr/bin/env node
'use strict';

/**
 * Dark-logo contrast polish — presentation only.
 * Ensures edge-separation tiers for known dark marks without recolor / white boxes.
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

var root = path.join(__dirname, '..');
var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  OK ' + name);
  } catch (e) {
    failed++;
    console.error('  FAIL ' + name + ': ' + (e && e.message ? e.message : e));
  }
}

console.log('\n-- logo dark contrast --\n');

var sandbox = { window: {}, console: console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'team-logos.js'), 'utf8'), sandbox);
var g = sandbox.window;

test('exports getLogoContrastTier', function () {
  assert.strictEqual(typeof g.getLogoContrastTier, 'function');
});

test('Yankees + Rockies use strong edge tier', function () {
  assert.strictEqual(g.getLogoContrastTier('New York Yankees', 'mlb'), 'strong');
  assert.strictEqual(g.getLogoContrastTier('Colorado Rockies', 'mlb'), 'strong');
  assert.strictEqual(g.getLogoContrastTier('Chicago White Sox', 'mlb'), 'strong');
  assert.strictEqual(g.getLogoContrastTier('Brooklyn Nets', 'nba'), 'strong');
  assert.strictEqual(g.getLogoContrastTier('Las Vegas Raiders', 'nfl'), 'strong');
});

test('soft tier covers other dark outliers', function () {
  assert.strictEqual(g.getLogoContrastTier('San Antonio Spurs', 'nba'), 'soft');
  assert.strictEqual(g.getLogoContrastTier('Anaheim Ducks', 'nhl'), 'soft');
  assert.strictEqual(g.getLogoContrastTier('Seattle Mariners', 'mlb'), 'soft');
});

test('bright / colorful marks stay default (no contrast attr)', function () {
  assert.strictEqual(g.getLogoContrastTier('Kansas City Chiefs', 'nfl'), '');
  assert.strictEqual(g.getLogoContrastTier('Los Angeles Lakers', 'nba'), '');
  assert.strictEqual(g.getLogoContrastTier('Boston Red Sox', 'mlb'), '');
});

test('img HTML includes data-logo-contrast for dark marks only', function () {
  var yankees = g.getTeamLogoImg('New York Yankees', 'mlb', 56);
  var chiefs = g.getTeamLogoImg('Kansas City Chiefs', 'nfl', 56);
  assert.ok(yankees.indexOf('data-logo-contrast="strong"') >= 0, 'Yankees strong attr');
  assert.ok(yankees.indexOf('object-fit:contain') >= 0, 'contain preserved');
  assert.ok(chiefs.indexOf('data-logo-contrast') < 0, 'Chiefs no contrast attr');
});

test('player.html CSS uses transparent edge treatment (no white box)', function () {
  var src = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  assert.ok(src.indexOf('data-logo-contrast="strong"') >= 0);
  assert.ok(src.indexOf('data-logo-contrast="soft"') >= 0);
  assert.ok(src.indexOf('background:transparent!important') >= 0);
  // No white circle / tile treatment in board logo rules
  var boardBlock = src.slice(src.indexOf('#sportsbook-section .mc-jersey img'), src.indexOf('#sportsbook-section .mc-jersey.mc-jersey-headshot'));
  assert.ok(boardBlock.indexOf('border-radius:50%') < 0);
  assert.ok(boardBlock.indexOf('background:#fff') < 0);
  assert.ok(boardBlock.indexOf('background:white') < 0);
  assert.ok(boardBlock.indexOf('filter:') >= 0 && boardBlock.indexOf('drop-shadow') >= 0);
});

test('no settlement / betting contract changes in this polish', function () {
  var logos = fs.readFileSync(path.join(root, 'team-logos.js'), 'utf8');
  assert.ok(logos.indexOf('SETTLEMENT') < 0);
  assert.ok(logos.indexOf('placeBet') < 0);
  assert.ok(logos.indexOf('LOGO_DARK_CONTRAST') >= 0);
});

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed) process.exit(1);
console.log('✅ Dark-logo contrast rules verified');
