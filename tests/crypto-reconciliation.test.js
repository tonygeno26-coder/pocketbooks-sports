/**
 * PocketBooks Sports — Phase Y: Admin Crypto Reconciliation Dashboard Tests
 * Run: node tests/crypto-reconciliation.test.js
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
function assertGt(a, b, m) { if (!(a > b)) throw new Error((m||'')+' — '+a+' not > '+b); }

// ── Constants ─────────────────────────────────────────────────────────────────
const FLAG_MISSING_HASH_MS  = 30 * 60 * 1000;
const FLAG_NO_SCAN_AFTER_MS = 30 * 60 * 1000;
const WALLET_ERC20 = '0x61F74cD55bA283269eb86a2AA7a882B2e1a9225F';
const WALLET_BTC   = 'bc1qu6um0h9qdy8nn6w3m2t4x3ava8lp6tm96erwc4';

// ── Reconciliation engine (pure logic) ───────────────────────────────────────

function _dayKey(ts) {
  return ts ? new Date(ts).toISOString().slice(0,10) : 'unknown';
}

function _scanIndex(scans) {
  var byIntent = {}, txCount = {};
  scans.forEach(function(s) {
    var id = s.matched_intent_id || s.matchedIntentId;
    if (id) { if (!byIntent[id]) byIntent[id]=[]; byIntent[id].push(s); }
    var h = s.tx_hash || s.txHash;
    if (h) txCount[h] = (txCount[h]||0) + 1;
  });
  return { byIntent, txCount };
}

function buildDailySummary(intents, scans, nowMs) {
  nowMs = nowMs || Date.now();
  var idx = _scanIndex(scans);
  var days = {};
  intents.forEach(function(i) {
    var d = _dayKey(i.created_at || i.createdAt);
    if (!days[d]) days[d] = {
      date:d, totalDepositIntents:0, totalHashSubmitted:0,
      totalCreditedDiamonds:0, totalExpectedUsd:0,
      totalScannedUsd:0, totalConfirmedUsd:0,
      totalRejected:0, missingHashCount:0,
      pendingReviewCount:0, mismatchCount:0
    };
    var row = days[d];
    row.totalDepositIntents++;
    row.totalExpectedUsd += parseFloat(i.expected_usd || i.expectedUsd || 0);
    if (i.status === 'credited')       row.totalCreditedDiamonds += parseFloat(i.package_amount_diamonds || i.packageAmountDiamonds || 0);
    if (i.status === 'rejected')       row.totalRejected++;
    if (i.status === 'pending_review') row.pendingReviewCount++;
    if (i.tx_hash || i.txHash)         row.totalHashSubmitted++;
    var ageMs = nowMs - new Date(i.created_at || i.createdAt).getTime();
    if (i.status === 'created' && ageMs > FLAG_MISSING_HASH_MS) row.missingHashCount++;
    var intentScans = idx.byIntent[i.intent_id || i.intentId] || [];
    intentScans.forEach(function(s) {
      var usd = parseFloat(s.amount_usd_estimate || s.amountUsdEstimate || 0);
      row.totalScannedUsd += usd;
      if (s.status === 'found_confirmed') row.totalConfirmedUsd += usd;
      if (s.status === 'mismatch')        row.mismatchCount++;
    });
  });
  return Object.values(days).sort(function(a,b){ return b.date.localeCompare(a.date); });
}

function buildWalletSummary(intents, scans) {
  var idx = _scanIndex(scans);
  var wallets = {};
  intents.forEach(function(i) {
    var w   = (i.assigned_wallet_address || i.assignedWalletAddress || 'unknown').toLowerCase();
    var sym = i.crypto_symbol || i.cryptoSymbol || '?';
    var net = i.network || '?';
    var k   = w+'::'+net+'::'+sym;
    if (!wallets[k]) wallets[k] = {
      walletAddress: i.assigned_wallet_address || i.assignedWalletAddress,
      network:net, cryptoSymbol:sym,
      confirmedUsd:0, creditedDiamonds:0, pendingUsd:0,
      mismatchCount:0, txCount:0
    };
    var row = wallets[k];
    if (i.tx_hash || i.txHash) row.txCount++;
    if (i.status === 'credited') row.creditedDiamonds += parseFloat(i.package_amount_diamonds || i.packageAmountDiamonds || 0);
    var intentScans = idx.byIntent[i.intent_id || i.intentId] || [];
    intentScans.forEach(function(s) {
      var usd = parseFloat(s.amount_usd_estimate || s.amountUsdEstimate || 0);
      if (s.status === 'found_confirmed') row.confirmedUsd += usd;
      else if (s.status === 'found_pending') row.pendingUsd += usd;
      if (s.status === 'mismatch') row.mismatchCount++;
    });
  });
  return Object.values(wallets);
}

function buildFlaggedRows(intents, scans, nowMs) {
  nowMs = nowMs || Date.now();
  var idx = _scanIndex(scans);
  var flagged = [];
  intents.forEach(function(i) {
    var intentId    = i.intent_id || i.intentId;
    var txHash      = i.tx_hash || i.txHash;
    var flags       = [];
    var ageMs       = nowMs - new Date(i.created_at || i.createdAt).getTime();
    var intentScans = idx.byIntent[intentId] || [];
    var latestScan  = intentScans[intentScans.length-1] || null;

    if (i.status === 'created' && ageMs > FLAG_MISSING_HASH_MS)
      flags.push('missing_hash');

    if (i.status === 'hash_submitted' && (i.tx_hash_submitted_at || i.txHashSubmittedAt)) {
      var waitMs = nowMs - new Date(i.tx_hash_submitted_at || i.txHashSubmittedAt).getTime();
      if (waitMs > FLAG_NO_SCAN_AFTER_MS && intentScans.length === 0)
        flags.push('no_scan_after_hash');
    }

    if (latestScan && latestScan.status === 'found_confirmed' && i.status !== 'credited')
      flags.push('confirmed_not_credited');

    if (i.status === 'credited' && latestScan && latestScan.status === 'mismatch')
      flags.push('credited_mismatch');

    if (intentScans.some(function(s){ return s.status === 'mismatch'; }))
      flags.push('wallet_mismatch');

    if (intentScans.some(function(s){ return (s.error_message||s.errorMessage) === 'amount_short'; }))
      flags.push('amount_short');

    if (txHash && idx.txCount[txHash] > 1)
      flags.push('duplicate_txhash_attempt');

    if (flags.length) {
      flagged.push({
        intentId,
        playerId:              i.player_id || i.playerId,
        assignedWalletAddress: i.assigned_wallet_address || i.assignedWalletAddress,
        txHash:                txHash || null,
        status:                i.status,
        flags
      });
    }
  });
  return flagged;
}

function buildPlayerAuditRows(intents, scans, nowMs) {
  nowMs = nowMs || Date.now();
  var idx = _scanIndex(scans);
  return intents.map(function(i) {
    var intentId    = i.intent_id || i.intentId;
    var intentScans = idx.byIntent[intentId] || [];
    var latestScan  = intentScans[intentScans.length-1] || null;
    var myFlagged   = buildFlaggedRows([i], scans, nowMs);
    return {
      playerId:              i.player_id || i.playerId,
      intentId,
      packageAmountDiamonds: parseFloat(i.package_amount_diamonds || i.packageAmountDiamonds || 0),
      expectedUsd:           parseFloat(i.expected_usd || i.expectedUsd || 0),
      assignedWalletAddress: i.assigned_wallet_address || i.assignedWalletAddress,
      txHash:                i.tx_hash || i.txHash || null,
      scanStatus:            latestScan ? latestScan.status : null,
      matchedPlayerId:       latestScan ? (latestScan.matched_player_id || latestScan.matchedPlayerId || null) : null,
      creditedDiamonds:      i.status === 'credited' ? parseFloat(i.package_amount_diamonds || i.packageAmountDiamonds || 0) : 0,
      status:                i.status,
      flags:                 myFlagged.length ? myFlagged[0].flags : [],
      createdAt:             i.created_at || i.createdAt,
      updatedAt:             i.updated_at || i.updatedAt || null
    };
  });
}

// ── Test data helpers ─────────────────────────────────────────────────────────

function mkIntent(id, pid, status, opts) {
  opts = opts || {};
  var now = opts.createdAt || new Date().toISOString();
  return {
    intent_id: id, player_id: pid, club_id: opts.clubId || 'C1',
    package_amount_diamonds: opts.diamonds || 500,
    expected_usd: opts.expectedUsd || 50,
    crypto_symbol: opts.sym || 'USDT', network: opts.net || 'ERC20',
    assigned_wallet_address: opts.wallet || WALLET_ERC20,
    tx_hash: opts.txHash || null,
    tx_hash_submitted_at: opts.txHashSubmittedAt || null,
    status, created_at: now, updated_at: now
  };
}

function mkScan(intentId, scanStatus, opts) {
  opts = opts || {};
  return {
    scan_id: 'SC_'+intentId+'_'+Math.random().toString(36).slice(2),
    tx_hash: opts.txHash || '0xABC',
    network: opts.net || 'ERC20', status: scanStatus,
    confirmations: opts.confs != null ? opts.confs : 6,
    amount_usd_estimate: opts.usd != null ? opts.usd : 50,
    from_address: opts.from || '0xSender',
    to_address: opts.to || WALLET_ERC20,
    matched_intent_id: intentId,
    matched_player_id: opts.pid || null,
    error_message: opts.err || null,
    scanned_at: new Date().toISOString()
  };
}

const DAY1 = '2026-05-18T10:00:00Z';
const DAY2 = '2026-05-19T10:00:00Z';

// ── Tests: buildDailySummary ──────────────────────────────────────────────────
console.log('\n── buildDailySummary ──');

test('groups intents by day', function() {
  var intents = [
    mkIntent('I1','P1','credited',{ createdAt:DAY1, diamonds:500 }),
    mkIntent('I2','P2','credited',{ createdAt:DAY1, diamonds:300 }),
    mkIntent('I3','P3','created', { createdAt:DAY2 })
  ];
  var rows = buildDailySummary(intents, [], Date.now());
  var d1 = rows.find(function(r){ return r.date==='2026-05-18'; });
  var d2 = rows.find(function(r){ return r.date==='2026-05-19'; });
  assert(d1 && d2, 'both days present');
  assertEq(d1.totalDepositIntents, 2);
  assertEq(d1.totalCreditedDiamonds, 800);
  assertEq(d2.totalDepositIntents, 1);
});

test('totalHashSubmitted counts intents with txHash', function() {
  var intents = [
    mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC', createdAt:DAY1 }),
    mkIntent('I2','P2','created',{ createdAt:DAY1 })
  ];
  var rows = buildDailySummary(intents, [], Date.now());
  var d = rows.find(function(r){ return r.date==='2026-05-18'; });
  assertEq(d.totalHashSubmitted, 1);
});

test('totalRejected counted correctly', function() {
  var intents = [
    mkIntent('I1','P1','rejected',{ createdAt:DAY1 }),
    mkIntent('I2','P2','rejected',{ createdAt:DAY1 }),
    mkIntent('I3','P3','credited',{ createdAt:DAY1 })
  ];
  var rows = buildDailySummary(intents, [], Date.now());
  var d = rows.find(function(r){ return r.date==='2026-05-18'; });
  assertEq(d.totalRejected, 2);
});

test('missingHashCount flagged in daily summary', function() {
  var old = new Date(Date.now()-31*60*1000).toISOString();
  var intents = [mkIntent('I1','P1','created',{ createdAt:old })];
  var rows = buildDailySummary(intents, [], Date.now());
  assertGt(rows[0].missingHashCount, 0, 'missing hash counted');
});

test('totalConfirmedUsd from scans attached to intents', function() {
  var intents = [mkIntent('I1','P1','credited',{ createdAt:DAY1 })];
  var scans   = [mkScan('I1','found_confirmed',{ usd:50 })];
  var rows    = buildDailySummary(intents, scans, Date.now());
  var d = rows.find(function(r){ return r.date==='2026-05-18'; });
  assertEq(d.totalConfirmedUsd, 50);
});

test('sorted most recent day first', function() {
  var intents = [
    mkIntent('I1','P1','created',{ createdAt:DAY1 }),
    mkIntent('I2','P2','created',{ createdAt:DAY2 })
  ];
  var rows = buildDailySummary(intents, [], Date.now());
  assert(rows[0].date >= rows[1].date, 'desc order');
});

test('mismatchCount increments from mismatch scans', function() {
  var intents = [mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC', createdAt:DAY1 })];
  var scans   = [mkScan('I1','mismatch',{})];
  var rows    = buildDailySummary(intents, scans, Date.now());
  var d = rows.find(function(r){ return r.date==='2026-05-18'; });
  assertEq(d.mismatchCount, 1);
});

// ── Tests: buildWalletSummary ─────────────────────────────────────────────────
console.log('\n── buildWalletSummary ──');

test('groups by wallet+network+symbol', function() {
  var intents = [
    mkIntent('I1','P1','credited',{ wallet:WALLET_ERC20, sym:'USDT', net:'ERC20', diamonds:500 }),
    mkIntent('I2','P2','credited',{ wallet:WALLET_ERC20, sym:'USDT', net:'ERC20', diamonds:300 }),
    mkIntent('I3','P3','created', { wallet:WALLET_BTC,   sym:'BTC',  net:'Bitcoin_SegWit' })
  ];
  var rows = buildWalletSummary(intents, []);
  assert(rows.length >= 2, 'at least 2 wallets');
  var erc = rows.find(function(r){ return r.walletAddress === WALLET_ERC20; });
  assertEq(erc.creditedDiamonds, 800, 'sum diamonds');
});

test('pendingUsd from found_pending scans', function() {
  var intents = [mkIntent('I1','P1','hash_submitted',{ wallet:WALLET_ERC20, txHash:'0xABC' })];
  var scans   = [mkScan('I1','found_pending',{ usd:50 })];
  var rows    = buildWalletSummary(intents, scans);
  assertEq(rows[0].pendingUsd, 50);
});

test('mismatchCount from mismatch scans', function() {
  var intents = [mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC' })];
  var scans   = [mkScan('I1','mismatch',{})];
  var rows    = buildWalletSummary(intents, scans);
  assertEq(rows[0].mismatchCount, 1);
});

test('txCount only counts intents with txHash', function() {
  var intents = [
    mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC', sym:'USDT', net:'ERC20' }),
    mkIntent('I2','P2','created',{ sym:'USDT', net:'ERC20' })
  ];
  var rows = buildWalletSummary(intents, []);
  assertEq(rows[0].txCount, 1);
});

// ── Tests: buildFlaggedRows ───────────────────────────────────────────────────
console.log('\n── buildFlaggedRows ──');

test('missing_hash after 30min', function() {
  var old = new Date(Date.now()-31*60*1000).toISOString();
  var flagged = buildFlaggedRows([mkIntent('I1','P1','created',{ createdAt:old })], [], Date.now());
  assert(flagged.length > 0 && flagged[0].flags.includes('missing_hash'));
});

test('no_scan_after_hash — hash submitted 30+ min ago, no scan', function() {
  var old = new Date(Date.now()-31*60*1000).toISOString();
  var i = mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC', createdAt:old });
  i.tx_hash_submitted_at = old;
  var flagged = buildFlaggedRows([i], [], Date.now());
  assert(flagged.some(function(f){ return f.flags.includes('no_scan_after_hash'); }));
});

test('confirmed_not_credited — scan found_confirmed but intent not credited', function() {
  var intents = [mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC' })];
  var scans   = [mkScan('I1','found_confirmed',{})];
  var flagged = buildFlaggedRows(intents, scans, Date.now());
  assert(flagged.some(function(f){ return f.flags.includes('confirmed_not_credited'); }));
});

test('credited_mismatch — credited but scan shows mismatch', function() {
  var intents = [mkIntent('I1','P1','credited',{ txHash:'0xABC' })];
  var scans   = [mkScan('I1','mismatch',{})];
  var flagged = buildFlaggedRows(intents, scans, Date.now());
  assert(flagged.some(function(f){ return f.flags.includes('credited_mismatch'); }));
});

test('wallet_mismatch from mismatch scan', function() {
  var intents = [mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC' })];
  var scans   = [mkScan('I1','mismatch',{})];
  var flagged = buildFlaggedRows(intents, scans, Date.now());
  assert(flagged.some(function(f){ return f.flags.includes('wallet_mismatch'); }));
});

test('amount_short from scan error_message', function() {
  var intents = [mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC' })];
  var scans   = [Object.assign(mkScan('I1','found_confirmed',{}), { error_message:'amount_short' })];
  var flagged = buildFlaggedRows(intents, scans, Date.now());
  assert(flagged.some(function(f){ return f.flags.includes('amount_short'); }));
});

test('clean credited intent has no flags', function() {
  var intents = [mkIntent('I1','P1','credited',{ txHash:'0xABC' })];
  var scans   = [mkScan('I1','found_confirmed',{})];
  assertEq(buildFlaggedRows(intents, scans, Date.now()).length, 0, 'no flags on clean credited');
});

test('playerId visible on every flagged row', function() {
  var old = new Date(Date.now()-31*60*1000).toISOString();
  var flagged = buildFlaggedRows([mkIntent('I1','PLAYER_99','created',{ createdAt:old })], [], Date.now());
  assertEq(flagged[0].playerId, 'PLAYER_99');
});

// ── Tests: buildPlayerAuditRows ───────────────────────────────────────────────
console.log('\n── buildPlayerAuditRows ──');

test('player audit row includes playerId from intent', function() {
  var rows = buildPlayerAuditRows([mkIntent('I1','P42','hash_submitted',{ txHash:'0xABC' })], [], Date.now());
  assertEq(rows[0].playerId, 'P42');
});

test('matchedPlayerId comes from latest scan row', function() {
  var intents = [mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC' })];
  var scans   = [mkScan('I1','found_confirmed',{ pid:'P1' })];
  var rows    = buildPlayerAuditRows(intents, scans, Date.now());
  assertEq(rows[0].matchedPlayerId, 'P1');
});

test('creditedDiamonds is 0 when not credited', function() {
  var rows = buildPlayerAuditRows([mkIntent('I1','P1','hash_submitted',{ diamonds:500 })], [], Date.now());
  assertEq(rows[0].creditedDiamonds, 0);
});

test('creditedDiamonds equals package when credited', function() {
  var rows = buildPlayerAuditRows([mkIntent('I1','P1','credited',{ diamonds:500, txHash:'0xABC' })], [], Date.now());
  assertEq(rows[0].creditedDiamonds, 500);
});

test('scanStatus null when no scans', function() {
  var rows = buildPlayerAuditRows([mkIntent('I1','P1','created',{})], [], Date.now());
  assert(rows[0].scanStatus === null);
});

test('scanStatus from latest scan', function() {
  var intents = [mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC' })];
  var scans   = [mkScan('I1','found_pending',{})];
  var rows    = buildPlayerAuditRows(intents, scans, Date.now());
  assertEq(rows[0].scanStatus, 'found_pending');
});

test('flags[] populated from buildFlaggedRows logic', function() {
  var intents = [mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC' })];
  var scans   = [mkScan('I1','found_confirmed',{})];
  var rows    = buildPlayerAuditRows(intents, scans, Date.now());
  assert(rows[0].flags.includes('confirmed_not_credited'));
});

// ── Tests: UI render stubs ────────────────────────────────────────────────────
console.log('\n── UI render stubs ──');

function renderDailyRow(day) {
  return [
    '<div class="recon-day">',
    '<span class="recon-date">'+day.date+'</span>',
    '<span>'+day.totalDepositIntents+' intents</span>',
    '<span>💎 '+day.totalCreditedDiamonds+'</span>',
    '<span>$'+day.totalConfirmedUsd.toFixed(2)+' confirmed</span>',
    day.missingHashCount ? '<span class="recon-flag">⚠ '+day.missingHashCount+' missing hash</span>' : '',
    day.mismatchCount    ? '<span class="recon-flag">⚠ '+day.mismatchCount+' mismatch</span>'       : '',
    '</div>'
  ].join('');
}

test('UI renders daily rows with date and diamonds', function() {
  var rows = buildDailySummary([mkIntent('I1','P1','credited',{ createdAt:DAY1, diamonds:500 })], [], Date.now());
  var d = rows.find(function(r){ return r.date==='2026-05-18'; });
  var html = renderDailyRow(d);
  assert(html.includes('2026-05-18'), 'date in render');
  assert(html.includes('💎'), 'diamond in render');
});

test('UI renders missing hash warning when flagged', function() {
  var old = new Date(Date.now()-31*60*1000).toISOString();
  var rows = buildDailySummary([mkIntent('I1','P1','created',{ createdAt:old })], [], Date.now());
  assert(renderDailyRow(rows[0]).includes('missing hash'));
});

test('UI renders mismatch warning when present', function() {
  var intents = [mkIntent('I1','P1','hash_submitted',{ txHash:'0xABC', createdAt:DAY1 })];
  var scans   = [mkScan('I1','mismatch',{})];
  var rows    = buildDailySummary(intents, scans, Date.now());
  var d = rows.find(function(r){ return r.date==='2026-05-18'; }) || rows[0];
  assert(renderDailyRow(d).includes('mismatch'));
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Crypto reconciliation tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ CRYPTO RECONCILIATION TESTS FAILED'); process.exit(1); }
else console.log('✅ All crypto reconciliation rules verified');
