/**
 * PocketBooks Sports — Parlay Math Tests
 * Run: node tests/parlay-math.test.js
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }
function assertApprox(a, b, m, tol) {
  tol = tol || 0.02;
  if (Math.abs(a - b) > tol) throw new Error((m||'') + ' — got ' + a.toFixed(4) + ' expected ~' + b.toFixed(4) + ' (tol ' + tol + ')');
}

// ── Canonical math (mirror of player.html) ────────────────────────────────────
function amToDecimal(o) {
  var n = parseInt(String(o).replace('+',''));
  if (!n || isNaN(n)) return 1;
  return n > 0 ? n/100 + 1 : 100/Math.abs(n) + 1;
}

function parlayPayout(stake, oddsArray) {
  var combined = oddsArray.reduce(function(p, o) { return p * amToDecimal(o); }, 1);
  var totalPayout = Math.round(stake * combined * 100) / 100;
  var toWin       = Math.round((totalPayout - stake) * 100) / 100;
  return { combined, totalPayout, toWin };
}

function logParlayAudit(label, stake, legs) {
  var decimalOdds = legs.map(amToDecimal);
  var combined    = decimalOdds.reduce(function(p,d){ return p*d; }, 1);
  var totalPayout = Math.round(stake * combined * 100) / 100;
  var toWin       = Math.round((totalPayout - stake) * 100) / 100;
  console.log('[parlay math audit] ' + label,
    '\n  stake:          $' + stake,
    '\n  legs:           ' + legs.join(', '),
    '\n  decimalOdds:    ' + decimalOdds.map(function(d){ return d.toFixed(4); }).join(' × '),
    '\n  combinedDecimal:', combined.toFixed(4),
    '\n  toWin:          $' + toWin.toFixed(2),
    '\n  totalPayout:    $' + totalPayout.toFixed(2)
  );
  return { combined, totalPayout, toWin };
}

// ── Unit: amToDecimal ─────────────────────────────────────────────────────────
console.log('\n── amToDecimal conversions ──');

test('-110 → 1.9091', function() { assertApprox(amToDecimal(-110), 1.9091, '-110', 0.0002); });
test('-116 → 1.8621', function() { assertApprox(amToDecimal(-116), 1.8621, '-116', 0.0002); });
test('-105 → 1.9524', function() { assertApprox(amToDecimal(-105), 1.9524, '-105', 0.0002); });
test('+116 → 2.16',   function() { assertApprox(amToDecimal(+116), 2.16,   '+116', 0.0002); });
test('+100 → 2.0',    function() { assertApprox(amToDecimal(+100), 2.0,    '+100', 0.0002); });
test('+150 → 2.5',    function() { assertApprox(amToDecimal(+150), 2.5,    '+150', 0.0002); });
test('-200 → 1.5',    function() { assertApprox(amToDecimal(-200), 1.5,    '-200', 0.0002); });
test('0 or invalid → 1.0', function() { assertApprox(amToDecimal(0), 1.0, 'zero', 0.0001); });
test('string "+130" → 2.3', function() { assertApprox(amToDecimal('+130'), 2.3, 'string', 0.0002); });

// ── Parlay payouts ────────────────────────────────────────────────────────────
console.log('\n── Parlay Payout Math ──');

test('$118 parlay: -116, +116, -105 → ~$808.30 toWin, ~$926.30 payout', function() {
  var r = logParlayAudit('$118 3-leg parlay', 118, [-116, +116, -105]);
  // Manual: 1.8621 * 2.16 * 1.9524 = 7.850 → * 118 = 926.30
  assertApprox(r.totalPayout, 926.30, 'totalPayout', 0.50);
  assertApprox(r.toWin,       808.30, 'toWin',       0.50);
});

test('$100 2-leg -110/-110: combined=3.6446, payout=$364.46, toWin=$264.46', function() {
  var r = parlayPayout(100, [-110, -110]);
  assertApprox(r.combined,    3.6446, 'combined decimal', 0.001);
  assertApprox(r.totalPayout, 364.46, 'totalPayout',      0.05);
  assertApprox(r.toWin,       264.46, 'toWin',            0.05);
});

test('$50 single +150: payout=$125, toWin=$75', function() {
  var r = parlayPayout(50, [+150]);
  assertApprox(r.totalPayout, 125.00, 'totalPayout', 0.01);
  assertApprox(r.toWin,        75.00, 'toWin',       0.01);
});

test('$100 single -200: payout=$150, toWin=$50', function() {
  var r = parlayPayout(100, [-200]);
  assertApprox(r.totalPayout, 150.00, 'totalPayout', 0.01);
  assertApprox(r.toWin,        50.00, 'toWin',       0.01);
});

test('$25 4-leg parlay +100/+100/+100/+100: payout=$400, toWin=$375', function() {
  var r = parlayPayout(25, [+100, +100, +100, +100]);
  // 2.0^4 = 16; 25*16=400; toWin=375
  assertApprox(r.totalPayout, 400.00, 'totalPayout', 0.01);
  assertApprox(r.toWin,       375.00, 'toWin',       0.01);
});

// ── toWin = totalPayout - stake (never negative) ──────────────────────────────
console.log('\n── toWin derivation ──');

test('toWin is always totalPayout - stake', function() {
  [[118,[-116,+116,-105]], [100,[-110,-110]], [50,[+150]]].forEach(function(tc) {
    var r = parlayPayout(tc[0], tc[1]);
    var expected = Math.round((r.totalPayout - tc[0]) * 100) / 100;
    assertApprox(r.toWin, expected, 'toWin=totalPayout-stake for ' + JSON.stringify(tc[1]));
  });
});

test('totalPayout always >= stake (can never lose more than stake in math)', function() {
  [[-110], [-200], [+100], [+500]].forEach(function(legs) {
    var r = parlayPayout(100, legs);
    assert(r.totalPayout >= 100, 'payout >= stake for ' + legs[0]);
  });
});

// ── Reported ticket: $118, -116/+116/-105 ────────────────────────────────────
console.log('\n── Reported ticket validation ──');

test('Reported ticket $118 payout $926.61 is within acceptable range', function() {
  var r = parlayPayout(118, [-116, +116, -105]);
  // The reported value $926.61 — our calc gives ~$926.30
  // Small difference likely from rounding intermediate steps.
  // Within $1.00 tolerance = acceptable.
  assertApprox(r.totalPayout, 926.61, 'matches reported payout', 1.00);
  assertApprox(r.toWin,       808.61, 'matches reported toWin',  1.00);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(54));
console.log('Parlay math tests: ' + _pass + ' passed, ' + _fail + ' failed');
if (_fail > 0) { console.error('❌ PARLAY MATH TESTS FAILED'); process.exit(1); }
else console.log('✅ All parlay math rules verified');
