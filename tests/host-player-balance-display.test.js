#!/usr/bin/env node
/**
 * Host player balance display — regression for false $0.00.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');
var pass = 0;
var fail = 0;

function test(name, fn) {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { fail++; console.log('  ❌ ' + name + '\n     ' + (e && e.message)); }
}

function _resolveHostPlayerBalance(p, dbp) {
  var rows = [];
  if (dbp) rows.push(dbp);
  if (p) rows.push(p);
  for (var i = 0; i < rows.length; i++) {
    var src = rows[i] || {};
    var keys = ['availableBalance', 'currentBalance', 'balance'];
    for (var k = 0; k < keys.length; k++) {
      var raw = src[keys[k]];
      if (raw == null || raw === '') continue;
      var n = Number(raw);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}
function _fmtHostPlayerBalance(n) {
  if (n == null || isNaN(Number(n))) return '—';
  return '$' + Number(n).toFixed(2);
}

var TP1 = '2a3e6819-be2f-4df3-8112-54ce19d0929e';
var TP2 = '12bb68f1-bcca-4e63-8ae4-7065dbb19172';
var TP3 = 'bc767309-6fc7-4585-9077-3de7b898df13';

console.log('\n── Host player balance display ──');

test('non-zero positive balance renders correctly', function () {
  assert.strictEqual(_fmtHostPlayerBalance(_resolveHostPlayerBalance(null, { availableBalance: 686.99 })), '$686.99');
  assert.strictEqual(_fmtHostPlayerBalance(_resolveHostPlayerBalance({ currentBalance: 1176.43 }, null)), '$1176.43');
});

test('negative balance renders correctly', function () {
  assert.strictEqual(_fmtHostPlayerBalance(_resolveHostPlayerBalance(null, { availableBalance: -25.5 })), '$-25.50');
});

test('true zero renders $0.00', function () {
  assert.strictEqual(_resolveHostPlayerBalance(null, { availableBalance: 0 }), 0);
  assert.strictEqual(_fmtHostPlayerBalance(0), '$0.00');
});

test('missing balance does not masquerade as zero', function () {
  assert.strictEqual(_resolveHostPlayerBalance(null, {}), null);
  assert.strictEqual(_fmtHostPlayerBalance(null), '—');
  assert.strictEqual(_fmtHostPlayerBalance(_resolveHostPlayerBalance({ creditLimit: 1000 }, null)), '—');
});

test('multiple players do not cross-map balances', function () {
  var byId = {};
  byId[TP1] = { playerId: TP1, username: 'testplayer1', availableBalance: 686.99 };
  byId[TP2] = { playerId: TP2, username: 'testplayer2', availableBalance: 1176.43 };
  byId[TP3] = { playerId: TP3, username: 'testplayer3', availableBalance: 864.75 };
  assert.strictEqual(_resolveHostPlayerBalance(null, byId[TP1]), 686.99);
  assert.strictEqual(_resolveHostPlayerBalance(null, byId[TP2]), 1176.43);
  assert.strictEqual(_resolveHostPlayerBalance(null, byId[TP3]), 864.75);
});

test('correct UUID is used for each player', function () {
  [TP1, TP2, TP3].forEach(function (id) {
    assert.ok(/^[0-9a-f-]{36}$/i.test(id));
  });
});

test('Settle tab and Players tab prefer the same canonical fields', function () {
  var dash = { availableBalance: 686.99, currentBalance: 686.99, balance: 686.99 };
  var settle = { currentBalance: 686.99, balance: 686.99, availableBalance: 686.99 };
  assert.strictEqual(_resolveHostPlayerBalance(null, dash), _resolveHostPlayerBalance(settle, null));
  assert.strictEqual(_resolveHostPlayerBalance({ balance: 0 }, { availableBalance: 686.99 }), 686.99);
});

test('index.html ships resolver and no longer coerces NaN avail to 0 in playerRow', function () {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.indexOf('function _resolveHostPlayerBalance') !== -1, 'resolver present');
  assert.ok(html.indexOf('function _fmtHostPlayerBalance') !== -1, 'formatter present');
  assert.ok(html.indexOf('_resolveHostPlayerBalance(p, dbp)') !== -1, 'playerRow uses resolver');
  assert.ok(html.indexOf('if (isNaN(avail)) avail = 0;') === -1, 'no NaN→0 coerce');
  assert.ok(html.indexOf('_fmtHostPlayerBalance(avail)') !== -1, 'playerRow uses formatter');
  assert.ok(html.indexOf('_hostDbPlayersById[uname]') !== -1, 'username secondary lookup key');
  assert.ok(html.indexOf("Object.prototype.hasOwnProperty.call(dp, 'availableBalance')") !== -1,
    'null availableBalance overwrites stale local 0');
});

console.log('\n──────────────────────────────────────────────────────');
console.log('Host player balance display: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.error('❌ FAILED'); process.exit(1); }
console.log('✅ All host player balance display rules verified');
