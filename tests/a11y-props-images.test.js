/**
 * A11y + props deferral + image lazy/text-fallback checks.
 * Run: node tests/a11y-props-images.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');
var bench = require('../scripts/props-perf-bench');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

console.log('\n-- a11y / props perf / image hardening --\n');

test('pb-a11y.js exports focus trap + odds helpers', function () {
  var sandbox = { console: console, setTimeout: setTimeout };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    body: { appendChild: function () {} },
    createElement: function () {
      return {
        setAttribute: function () {},
        classList: { add: function () {} },
        textContent: '',
        style: {}
      };
    },
    getElementById: function () { return null; },
    addEventListener: function () {}
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'pb-a11y.js'), 'utf8'), sandbox);
  assert(sandbox.PbA11y && typeof sandbox.PbA11y.activate === 'function');
  assert(typeof sandbox.PbA11y.oddsAriaLabel === 'function');
  assert(typeof sandbox.PbA11y.announce === 'function');
  var label = sandbox.PbA11y.oddsAriaLabel({
    getAttribute: function (k) {
      return ({ 'data-pick': 'Yankees ML', 'data-market': 'moneyline', 'data-odds': '-140', 'data-game': 'BOS vs NYY' })[k] || '';
    },
    classList: { contains: function () { return false; } }
  });
  assert(/Yankees/.test(label) && /-140/.test(label), 'aria label incomplete: ' + label);
});

test('player.html wires a11y landmarks, trap, keyboard odds', function () {
  var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  assert(html.indexOf('src="pb-a11y.js"') >= 0);
  assert(html.indexOf('pb-skip-link') >= 0);
  assert(html.indexOf('id="pb-a11y-live"') >= 0);
  assert(/<main id="sportsbook-section"/.test(html));
  assert(/<header class="header"/.test(html));
  assert(html.indexOf('PbA11y.activate') >= 0);
  assert(html.indexOf('aria-pressed') >= 0);
  assert(html.indexOf('_PB_PROP_EAGER_SECTIONS') >= 0);
  assert(html.indexOf('_pbHydrateDeferredPropSections') >= 0);
  assert(html.indexOf('mc-prop-section-deferred') >= 0);
});

test('props bench preserves markets and defers DOM at 100+', function () {
  var r100 = bench.bench(100);
  var r300 = bench.bench(300);
  var r500 = bench.bench(500);
  assert(r100.marketsPreserved && r300.marketsPreserved && r500.marketsPreserved);
  assert(r500.eagerDomRows < r500.fullDomRows, 'expected deferred DOM savings at 500');
  assert(r500.deferredSections > 0);
  assert(r500.totalMs < 250, 'bench unexpectedly slow: ' + r500.totalMs);
  var out = {
    generatedAt: new Date().toISOString(),
    fixtures: [r100, r300, r500]
  };
  fs.writeFileSync(path.join(root, 'scripts/props-perf-metrics.json'), JSON.stringify(out, null, 2));
});

test('team/player images: lazy + text fallback on miss', function () {
  var sandbox = {
    console: console,
    document: { createElement: function () { return {}; }, querySelectorAll: function () { return []; } },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, key: function () { return null; }, length: 0 },
    fetch: async function () { return { ok: false }; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'player-photos.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'team-logos.js'), 'utf8'), sandbox);

  var logo = sandbox.getTeamLogoImg('New York Yankees', 'mlb', 40);
  if (logo.indexOf('<img') >= 0) {
    assert(/loading="lazy"/.test(logo), 'team logo missing loading=lazy');
    assert(/decoding="async"/.test(logo), 'team logo missing decoding=async');
    assert(/width="40"/.test(logo) && /height="40"/.test(logo), 'CLS width/height missing');
  }

  var miss = sandbox.getTeamLogoImg('Definitely Not A Real Team XYZ', 'mlb', 40);
  assert(miss.indexOf('<img') < 0, 'broken/unknown must not emit img');
  assert(/pb-text-fallback/.test(miss));

  var photo = sandbox.getPlayerPhotoImg('Aaron Judge', 'mlb', 48, { photoUrl: 'https://example.invalid/x.png' });
  assert(/loading="lazy"/.test(photo));
  assert(/onerror=/.test(photo));
});

test('diamonds modal uses aria-modal + ESC hook', function () {
  var js = fs.readFileSync(path.join(root, 'diamonds.js'), 'utf8');
  assert(js.indexOf('aria-modal') >= 0);
  assert(js.indexOf('PbA11y.activate') >= 0);
});

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
