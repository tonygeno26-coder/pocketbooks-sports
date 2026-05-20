/**
 * PocketBooks Sports — Phase AC: Host Diamond Balance Visibility + Player Gate UI Tests
 * Run: node tests/host-diamond-ui.test.js
 * Pure logic — no network, no DB.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) {
  if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b));
}

// ── Host dashboard diamond card renderer ──────────────────────────────────────

function renderHostDiamondCard(usage) {
  if (!usage || !usage.ok) return '<div class="hd-card hd-card--error">Diamond data unavailable</div>';

  var balance     = usage.balanceDiamonds || 0;
  var used        = usage.capacityUsed    || 0;
  var remaining   = usage.capacityRemaining || 0;
  var total       = usage.capacityTotal   || 0;
  var fee         = usage.feePerActiveBettor || 15;
  var topupsWk    = usage.totalTopupsThisWeek || 0;
  var chargesWk   = usage.totalChargesThisWeek || 0;
  var ledger      = usage.recentLedger || [];

  var status  = remaining === 0 ? 'critical' : remaining <= 3 ? 'low' : 'ok';
  var statusLabel = { ok:'✅ Healthy', low:'⚠️ Low balance', critical:'🔴 FULL — refill needed' }[status];

  var html = '<div class="hd-card hd-card--' + status + '">';
  html += '<div class="hd-card__title">💎 Host Diamond Balance</div>';
  html += '<div class="hd-card__status">' + statusLabel + '</div>';
  html += '<div class="hd-card__balance">' + balance + ' diamonds</div>';
  html += '<div class="hd-card__capacity">Active bettors: ' + used + ' / ' + total + ' capacity</div>';
  html += '<div class="hd-card__remaining">Remaining capacity: ' + remaining + ' bettors</div>';
  html += '<div class="hd-card__fee">Fee: ' + fee + ' diamonds per active bettor/week</div>';
  if (topupsWk || chargesWk) {
    html += '<div class="hd-card__week">This week: +' + topupsWk + 'd credited, -' + chargesWk + 'd charged</div>';
  }
  if (ledger.length) {
    html += '<ul class="hd-card__ledger">';
    ledger.slice(0, 5).forEach(function(e) {
      var dir = (e.direction === 'credit') ? '+' : '-';
      var amt = e.amount_diamonds || e.amountDiamonds || 0;
      var type = (e.event_type || e.eventType || '').replace('HOST_','').replace(/_/g,' ').toLowerCase();
      html += '<li>' + dir + amt + 'd — ' + type + (e.reason ? ' (' + e.reason.slice(0,40) + ')' : '') + '</li>';
    });
    html += '</ul>';
  }
  html += '<button class="hd-card__topup-btn">+ Top Up Diamonds</button>';
  html += '</div>';
  return html;
}

// ── Player gate message renderer ──────────────────────────────────────────────

function renderPlayerGateMessage(error, detail) {
  var MESSAGES = {
    host_diamond_balance_insufficient: {
      title: 'Club Capacity Full',
      body:  detail || 'The club has reached its bettor capacity for this week. Ask the host to add more diamonds.',
      action: null
    },
    host_diamond_balance_missing: {
      title: 'Club Not Ready',
      body:  detail || 'This club\'s account is not fully configured. Contact the host.',
      action: null
    },
    insufficient_balance: {
      title: 'Insufficient Balance',
      body:  detail || 'You don\'t have enough balance to place this bet.',
      action: 'Check your balance'
    }
  };
  var msg = MESSAGES[error] || { title: 'Bet Blocked', body: (detail || error || 'Unknown error').replace(/_/g,' '), action: null };
  var html = '<div class="gate-msg gate-msg--' + error + '">';
  html += '<div class="gate-msg__title">' + msg.title + '</div>';
  html += '<div class="gate-msg__body">' + msg.body + '</div>';
  if (msg.action) html += '<div class="gate-msg__action">' + msg.action + '</div>';
  html += '</div>';
  return html;
}

// ── Balance display helpers ───────────────────────────────────────────────────

function formatDiamondBalance(balance, feePerBettor) {
  feePerBettor = feePerBettor || 15;
  var capacity = Math.floor(balance / feePerBettor);
  var status   = capacity === 0 ? 'critical' : capacity <= 3 ? 'low' : 'ok';
  return { balance, capacity, status, formatted: balance + '💎 (' + capacity + ' bettor slots)' };
}

function computeWeeklyStats(ledgerEntries, weekStart) {
  var entries = (ledgerEntries || []).filter(function(e) {
    return (e.created_at || e.createdAt || '') >= weekStart;
  });
  var topups  = entries.filter(function(e){ return (e.event_type||e.eventType||'').includes('TOPUP'); });
  var charges = entries.filter(function(e){ return (e.event_type||e.eventType||'').includes('CHARGE'); });
  return {
    topupCount:    topups.length,
    topupTotal:    topups.reduce(function(s,e){ return s+(e.amount_diamonds||e.amountDiamonds||0); }, 0),
    chargeCount:   charges.length,
    chargeTotal:   charges.reduce(function(s,e){ return s+(e.amount_diamonds||e.amountDiamonds||0); }, 0)
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── renderHostDiamondCard ──');

test('healthy balance renders ok status', function() {
  var html = renderHostDiamondCard({ ok:true, balanceDiamonds:300, capacityUsed:5,
    capacityRemaining:15, capacityTotal:20, feePerActiveBettor:15,
    totalTopupsThisWeek:300, totalChargesThisWeek:75, recentLedger:[] });
  assert(html.includes('hd-card--ok'), 'ok status class');
  assert(html.includes('Healthy'), 'healthy label');
  assert(html.includes('300 diamonds'), 'balance shown');
  assert(html.includes('+ Top Up Diamonds'), 'topup button present');
});

test('low balance (≤3 remaining) renders low status', function() {
  var html = renderHostDiamondCard({ ok:true, balanceDiamonds:30, capacityUsed:18,
    capacityRemaining:2, capacityTotal:20, feePerActiveBettor:15,
    totalTopupsThisWeek:0, totalChargesThisWeek:270, recentLedger:[] });
  assert(html.includes('hd-card--low'), 'low status class');
  assert(html.includes('Low balance'), 'low label');
});

test('zero remaining renders critical status', function() {
  var html = renderHostDiamondCard({ ok:true, balanceDiamonds:0, capacityUsed:10,
    capacityRemaining:0, capacityTotal:10, feePerActiveBettor:15,
    recentLedger:[] });
  assert(html.includes('hd-card--critical'), 'critical class');
  assert(html.includes('FULL'), 'critical label');
});

test('card shows capacity used / total', function() {
  var html = renderHostDiamondCard({ ok:true, balanceDiamonds:150, capacityUsed:8,
    capacityRemaining:2, capacityTotal:10, feePerActiveBettor:15, recentLedger:[] });
  assert(html.includes('8 / 10 capacity'), 'capacity ratio shown');
});

test('card shows fee per bettor', function() {
  var html = renderHostDiamondCard({ ok:true, balanceDiamonds:150, capacityUsed:0,
    capacityRemaining:10, capacityTotal:10, feePerActiveBettor:15, recentLedger:[] });
  assert(html.includes('15 diamonds per active bettor'), 'fee shown');
});

test('card shows weekly stats when present', function() {
  var html = renderHostDiamondCard({ ok:true, balanceDiamonds:200, capacityUsed:3,
    capacityRemaining:10, capacityTotal:13, feePerActiveBettor:15,
    totalTopupsThisWeek:500, totalChargesThisWeek:45, recentLedger:[] });
  assert(html.includes('+500d credited'), 'topups shown');
  assert(html.includes('-45d charged'), 'charges shown');
});

test('card renders recent ledger rows', function() {
  var ledger = [
    { event_type:'HOST_DIAMOND_TOPUP', direction:'credit', amount_diamonds:300, reason:'admin topup' },
    { event_type:'HOST_ACTIVE_BETTOR_CHARGE', direction:'debit', amount_diamonds:15, reason:'P1' }
  ];
  var html = renderHostDiamondCard({ ok:true, balanceDiamonds:285, capacityUsed:1,
    capacityRemaining:19, capacityTotal:20, feePerActiveBettor:15,
    totalTopupsThisWeek:300, totalChargesThisWeek:15, recentLedger:ledger });
  assert(html.includes('<ul'), 'ledger list rendered');
  assert(html.includes('+300d'), 'topup entry');
  assert(html.includes('-15d'), 'charge entry');
});

test('unavailable data renders error card', function() {
  var html = renderHostDiamondCard(null);
  assert(html.includes('hd-card--error'), 'error card');
  assert(html.includes('unavailable'), 'error message');
});

console.log('\n── renderPlayerGateMessage ──');

test('host_diamond_balance_insufficient renders capacity full message', function() {
  var html = renderPlayerGateMessage('host_diamond_balance_insufficient');
  assert(html.includes('gate-msg--host_diamond_balance_insufficient'), 'class set');
  assert(html.includes('Capacity Full') || html.includes('capacity'), 'capacity message');
  assert(html.includes('host') || html.includes('diamonds'), 'mentions host/diamonds');
});

test('host_diamond_balance_missing renders not-ready message', function() {
  var html = renderPlayerGateMessage('host_diamond_balance_missing');
  assert(html.includes('Not Ready') || html.includes('configured'), 'not-ready message');
});

test('insufficient_balance renders player balance message with action', function() {
  var html = renderPlayerGateMessage('insufficient_balance');
  assert(html.includes('Insufficient Balance') || html.includes('balance'), 'balance message');
  assert(html.includes('Check your balance'), 'action shown');
});

test('custom detail message overrides default', function() {
  var html = renderPlayerGateMessage('host_diamond_balance_insufficient', 'Custom host message here');
  assert(html.includes('Custom host message here'), 'custom detail shown');
});

test('unknown error falls back to generic message', function() {
  var html = renderPlayerGateMessage('some_weird_error_code');
  assert(html.includes('Bet Blocked') || html.includes('weird'), 'generic fallback');
});

console.log('\n── formatDiamondBalance ──');

test('300 diamonds / 15 fee = 20 capacity, status ok', function() {
  var r = formatDiamondBalance(300, 15);
  assertEq(r.capacity, 20); assertEq(r.status, 'ok');
  assert(r.formatted.includes('300💎'));
});

test('45 diamonds = 3 capacity, status low', function() {
  var r = formatDiamondBalance(45, 15);
  assertEq(r.capacity, 3); assertEq(r.status, 'low');
});

test('0 diamonds = 0 capacity, status critical', function() {
  var r = formatDiamondBalance(0, 15);
  assertEq(r.capacity, 0); assertEq(r.status, 'critical');
});

test('14 diamonds = 0 capacity (floor)', function() {
  var r = formatDiamondBalance(14, 15);
  assertEq(r.capacity, 0); assertEq(r.status, 'critical');
});

console.log('\n── computeWeeklyStats ──');

test('counts topups and charges in week', function() {
  var entries = [
    { event_type:'HOST_DIAMOND_TOPUP',          direction:'credit', amount_diamonds:500, created_at:'2026-05-19T10:00:00Z' },
    { event_type:'HOST_ACTIVE_BETTOR_CHARGE',   direction:'debit',  amount_diamonds:15,  created_at:'2026-05-19T11:00:00Z' },
    { event_type:'HOST_ACTIVE_BETTOR_CHARGE',   direction:'debit',  amount_diamonds:15,  created_at:'2026-05-19T12:00:00Z' },
    { event_type:'HOST_DIAMOND_TOPUP',          direction:'credit', amount_diamonds:200, created_at:'2026-05-12T10:00:00Z' } // previous week
  ];
  var stats = computeWeeklyStats(entries, '2026-05-18');
  assertEq(stats.topupCount, 1,  'only current week topup');
  assertEq(stats.topupTotal, 500,'topup total');
  assertEq(stats.chargeCount, 2, 'two charges this week');
  assertEq(stats.chargeTotal, 30,'charge total');
});

test('empty ledger returns zeros', function() {
  var stats = computeWeeklyStats([], '2026-05-18');
  assertEq(stats.topupTotal, 0); assertEq(stats.chargeTotal, 0);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Host diamond UI tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ HOST DIAMOND UI TESTS FAILED'); process.exit(1); }
else console.log('✅ All host diamond UI rules verified');
