/**
 * A11y — modal focus trap module + odds markers in player.html
 * Run: node tests/a11y-modal-odds.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var root = path.join(__dirname, '..');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  OK ' + name); pass++; }
  catch (e) { console.error('  FAIL ' + name + '\n     ' + e.message); fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert failed'); }

console.log('\n-- a11y modal + odds --\n');

test('pb-a11y.js exists and exports PbA11y', function () {
  assert(fs.existsSync(path.join(root, 'pb-a11y.js')));
  var src = fs.readFileSync(path.join(root, 'pb-a11y.js'), 'utf8');
  assert(src.indexOf('PbA11y') >= 0);
  assert(src.indexOf('activate') >= 0);
  assert(src.indexOf('deactivate') >= 0);
  assert(src.indexOf('enhanceOddsCell') >= 0);
});

test('PbA11y modal focus trap + ESC + restore focus', function () {
  var listeners = [];
  var prevBtn = { focus: function () { prevBtn.focused = true; } };
  var closeBtn = { focus: function () { closeBtn.focused = true; }, disabled: false,
    getBoundingClientRect: function () { return { width: 10, height: 10 }; } };
  var overlay = {
    getAttribute: function (k) { return k === 'role' ? 'dialog' : null; },
    querySelector: function () { return closeBtn; },
    firstElementChild: closeBtn,
    contains: function () { return true; }
  };
  var doc = {
    activeElement: prevBtn,
    addEventListener: function (type, fn, cap) { listeners.push({ type: type, fn: fn, cap: cap }); },
    removeEventListener: function (type, fn, cap) {
      listeners = listeners.filter(function (l) { return l.fn !== fn; });
    }
  };
  var closed = false;
  var sandbox = { document: doc, window: {}, console: console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'pb-a11y.js'), 'utf8'), sandbox);

  sandbox.PbA11y.activate(overlay, {
    onEscape: function () { closed = true; },
    initialFocus: '#ps-close'
  });
  assert(closeBtn.focused, 'should focus initial control');
  var keyHandler = listeners.filter(function (l) { return l.type === 'keydown'; })[0];
  assert(keyHandler, 'keydown listener registered');
  keyHandler.fn({ key: 'Escape', preventDefault: function () {} });
  assert(closed, 'ESC should invoke onEscape');
  sandbox.PbA11y.deactivate(overlay);
  assert(prevBtn.focused, 'should restore previous focus');
  assert(!listeners.some(function (l) { return l.type === 'keydown'; }), 'listener removed');
});

test('PbA11y enhanceOddsCell adds keyboard + aria', function () {
  var clicked = false;
  var cell = {
    classList: { contains: function (c) { return c === 'odds-cell'; } },
    dataset: { game: 'LAL vs BOS', market: 'Moneyline', pick: 'LAL', odds: '150' },
    getAttribute: function (k) {
      if (k === 'aria-label') return null;
      if (k === 'data-pb-odds-key') return cell._key;
      return null;
    },
    setAttribute: function (k, v) { cell[k] = v; if (k === 'data-pb-odds-key') cell._key = v; },
    hasAttribute: function (k) { return k === 'tabindex' ? false : !!cell[k]; },
    addEventListener: function (type, fn) { cell._keydown = fn; },
    click: function () { clicked = true; }
  };
  var sandbox = { document: { getElementById: function () { return null; } }, window: {}, console: console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'pb-a11y.js'), 'utf8'), sandbox);
  sandbox.PbA11y.enhanceOddsCell(cell);
  assert(cell.role === 'button');
  assert(cell.tabindex === '0');
  assert(String(cell['aria-label']).indexOf('LAL vs BOS') >= 0);
  cell._keydown({ key: 'Enter', preventDefault: function () {} });
  assert(clicked, 'Enter should trigger click');
});

test('player.html wires PbA11y + focus-visible on odds controls', function () {
  var html = fs.readFileSync(path.join(root, 'player.html'), 'utf8');
  assert(html.indexOf('pb-a11y.js') >= 0);
  assert(html.indexOf('PbA11y.activate') >= 0);
  assert(html.indexOf('PbA11y.deactivate') >= 0);
  assert(/\.odds-box:focus-visible/.test(html));
  assert(/\.mc-prop-ou:focus-visible/.test(html));
  assert(html.indexOf('aria-label') >= 0 && html.indexOf('_pbOddsCellHtml') >= 0);
});

test('diamonds.js uses PbA11y on Buy Diamonds modal', function () {
  var js = fs.readFileSync(path.join(root, 'diamonds.js'), 'utf8');
  assert(js.indexOf('PbA11y.activate') >= 0);
  assert(js.indexOf('PbA11y.deactivate') >= 0);
  assert(js.indexOf('aria-modal') >= 0);
});

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
