'use strict';

/**
 * Host preview / responsive containment (display only).
 * Asserts index.html keeps Settle tab + modals inside narrow shells.
 * No settlement math / recording changes.
 */

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'expected true'); }

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

console.log('\n-- Host preview responsive --');

test('?preview=1 skips top-of-file auth bounce', function() {
  assert(html.indexOf("get('preview') === '1'") !== -1 || html.indexOf('get("preview") === "1"') !== -1);
  assert(html.indexOf('if (_hPrev) return;') !== -1);
  var boot = html.slice(html.indexOf('(function(){'), html.indexOf('</script>'));
  assert(boot.indexOf('_hPrev') !== -1 && boot.indexOf('if (_hPrev) return;') < boot.indexOf('pb-sports-token'));
});

test('mobile shell pins bnav without translate / without 100vw', function() {
  var m480 = html.match(/@media\s*\(\s*max-width:\s*480px\s*\)\{[\s\S]*?\n\}/);
  assert(m480, 'missing ≤480 media block');
  var block = m480[0];
  assert(block.indexOf('transform:none') !== -1, 'bnav must drop translateX centering on mobile');
  assert(block.indexOf('left:0') !== -1);
  assert(/max-width:\s*100%\s*!important/.test(block), 'use 100% not 100vw to avoid scrollbar crop');
  assert(!/max-width:\s*100vw\s*!important/.test(block), '100vw!important re-crops Settle on 390');
});

test('five-tab bottom nav can shrink (Settle visible)', function() {
  assert(/\.bn\{[^}]*flex:\s*1\s+1\s+0/.test(html));
  assert(/\.bn\{[^}]*min-width:\s*0/.test(html));
  assert(html.indexOf('do not overflow:hidden the bar') !== -1);
});

test('narrow phone MQ covers 390/430 (not only 375)', function() {
  assert(/@media\s*\(\s*max-width:\s*430px\s*\)/.test(html));
  assert(!/@media\s*\(\s*max-width:\s*375px\s*\)\s*\{\s*body\{max-width:100vw/.test(html));
});

test('settle modal sheets capped to viewport width', function() {
  assert(html.indexOf('#_settle_modal > div') !== -1);
  assert(/max-width:\s*min\(430px,\s*100%\)/.test(html));
  assert(html.indexOf('#settlements-section') !== -1);
  assert(/#settlements-section\{[\s\S]*?overflow-x:\s*hidden/.test(html));
});

test('hrc overview grids use minmax(0,…) containment', function() {
  assert(/\.hrc-metrics-grid\{[^}]*minmax\(0,\s*1fr\)/.test(html));
  assert(/#home-content,\.host-risk-console/.test(html) || html.indexOf('#home-content,.host-risk-console') !== -1);
});

test('auth redirect respects ?preview=1 (no mid-session lobby bounce)', function() {
  assert(html.indexOf('function _authRedirectToLogin') !== -1);
  var idx = html.indexOf('function _authRedirectToLogin');
  var chunk = html.slice(idx, idx + 450);
  assert(chunk.indexOf("get('preview') === '1'") !== -1);
  assert(chunk.indexOf('return;') !== -1);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
