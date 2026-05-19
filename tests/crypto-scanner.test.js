/**
 * PocketBooks Sports — Phase X: Crypto Scanner Stub + Deposit Reconciliation Tests
 * Run: node tests/crypto-scanner.test.js
 * Pure logic — no network, no blockchain.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Scan status constants ─────────────────────────────────────────────────────

const SCAN_STATUSES = new Set([
  'not_found','found_pending','found_confirmed','mismatch','scan_error'
]);

// ── Scanner abstraction ───────────────────────────────────────────────────────

const AMOUNT_TOLERANCE_PCT = 0.02; // allow 2% underpay (fees)

function verifyCryptoTx(txHash, network, expectedWallet, expectedAmountUsd, opts) {
  opts = opts||{};
  // Production gate: scanner not configured
  if (!opts.scannerEnabled) {
    return {
      txHash, network, status:'scan_error',
      confirmations:0, amountCrypto:null, amountUsdEstimate:null,
      fromAddress:null, toAddress:null, errorMessage:'scanner_not_configured'
    };
  }
  // Mock scanner result for testing
  const mock = opts.mockResult;
  if (!mock) {
    return { txHash, network, status:'not_found', confirmations:0,
             amountCrypto:null, amountUsdEstimate:null,
             fromAddress:null, toAddress:null, errorMessage:null };
  }
  return Object.assign({
    txHash, network,
    status: mock.status||'found_confirmed',
    confirmations: mock.confirmations!=null ? mock.confirmations : 6,
    amountCrypto: mock.amountCrypto||null,
    amountUsdEstimate: mock.amountUsdEstimate||null,
    fromAddress: mock.fromAddress||null,
    toAddress: mock.toAddress||null,
    errorMessage: mock.errorMessage||null
  }, {});
}

// ── Match logic ───────────────────────────────────────────────────────────────

function matchScanToIntent(scanResult, intent) {
  if (!intent) return { matched:false, reason:'no_intent' };
  if (scanResult.status==='scan_error') return { matched:false, reason:'scan_error' };
  if (scanResult.status==='not_found')  return { matched:false, reason:'not_found' };

  // Wallet check: toAddress must match assignedWalletAddress
  const expectedWallet = intent.assignedWalletAddress||intent.assigned_wallet_address;
  const actualWallet   = (scanResult.toAddress||'').toLowerCase();
  if (actualWallet && expectedWallet && actualWallet !== expectedWallet.toLowerCase())
    return { matched:false, reason:'wallet_mismatch',
             expected:expectedWallet, actual:scanResult.toAddress };

  // Amount check: amountUsdEstimate >= expectedUsd * (1 - tolerance)
  const expectedUsd = parseFloat(intent.expectedUsd||intent.expected_usd||0);
  const actualUsd   = parseFloat(scanResult.amountUsdEstimate||0);
  if (expectedUsd > 0 && actualUsd > 0) {
    const minAcceptable = expectedUsd * (1 - AMOUNT_TOLERANCE_PCT);
    if (actualUsd < minAcceptable)
      return { matched:false, reason:'amount_short',
               expectedUsd, actualUsd, minAcceptable };
  }

  return {
    matched:          true,
    matchedIntentId:  intent.intentId||intent.intent_id,
    matchedPlayerId:  intent.playerId||intent.player_id,
    matchedClubId:    intent.clubId||intent.club_id,
    scanStatus:       scanResult.status,
    confirmations:    scanResult.confirmations
  };
}

// ── Scan result builder ───────────────────────────────────────────────────────

function buildScanRow(scanResult, matchResult, intentId, nowMs) {
  const now = new Date(nowMs||Date.now()).toISOString();
  return {
    scanId:           'SCAN_'+scanResult.txHash+'_'+Date.now(),
    txHash:           scanResult.txHash,
    network:          scanResult.network,
    cryptoSymbol:     scanResult.cryptoSymbol||null,
    status:           scanResult.status,
    confirmations:    scanResult.confirmations||0,
    amountCrypto:     scanResult.amountCrypto,
    amountUsdEstimate:scanResult.amountUsdEstimate,
    fromAddress:      scanResult.fromAddress,
    toAddress:        scanResult.toAddress,
    matchedIntentId:  matchResult&&matchResult.matched ? matchResult.matchedIntentId : null,
    matchedPlayerId:  matchResult&&matchResult.matched ? matchResult.matchedPlayerId  : null,
    matchedClubId:    matchResult&&matchResult.matched ? matchResult.matchedClubId   : null,
    scannedAt:        now,
    rawJson:          scanResult,
    errorMessage:     scanResult.errorMessage||null
  };
}

// ── Auto-credit decision ──────────────────────────────────────────────────────

function shouldAutoCredit(scanResult, matchResult, autoCreditEnabled) {
  if (!autoCreditEnabled)            return { credit:false, reason:'auto_credit_disabled' };
  if (!matchResult||!matchResult.matched)
    return { credit:false, reason:matchResult&&matchResult.reason||'no_match' };
  if (scanResult.status!=='found_confirmed')
    return { credit:false, reason:'not_confirmed:'+scanResult.status };
  if (scanResult.confirmations < 3)
    return { credit:false, reason:'insufficient_confirmations:'+scanResult.confirmations };
  return { credit:true };
}

// ── Intent lookup from store ──────────────────────────────────────────────────

function findIntentByTxHash(intents, txHash) {
  return intents.find(function(i){
    return i.tx_hash===txHash || i.txHash===txHash;
  })||null;
}

// ── Test data helpers ─────────────────────────────────────────────────────────

function intent(id, pid, cid, wallet, expectedUsd) {
  return {
    intentId:             id,
    intent_id:            id,
    playerId:             pid,
    player_id:            pid,
    clubId:               cid,
    club_id:              cid,
    assignedWalletAddress:wallet||'0xABC',
    assigned_wallet_address:wallet||'0xABC',
    expectedUsd:          expectedUsd||50,
    expected_usd:         expectedUsd||50,
    packageAmountDiamonds:500,
    txHash:               null,
    tx_hash:              null,
    status:               'hash_submitted'
  };
}

const WALLET    = '0x61F74cD55bA283269eb86a2AA7a882B2e1a9225F';
const TX_HASH   = '0xabc123def456abc123def456abc123def456abc1';
const GOOD_SCAN = { status:'found_confirmed', confirmations:6,
  amountCrypto:50, amountUsdEstimate:50,
  fromAddress:'0xSender', toAddress:WALLET, txHash:TX_HASH };
const PEND_SCAN = { status:'found_pending', confirmations:1,
  amountCrypto:50, amountUsdEstimate:50,
  fromAddress:'0xSender', toAddress:WALLET, txHash:TX_HASH };

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── verifyCryptoTx: scanner not configured ──');

test('scanner disabled → scan_error reason=scanner_not_configured', function() {
  var r = verifyCryptoTx(TX_HASH,'ERC20',WALLET,50,{ scannerEnabled:false });
  assertEq(r.status,'scan_error'); assertEq(r.errorMessage,'scanner_not_configured');
});
test('scanner disabled never returns found_confirmed', function() {
  var r = verifyCryptoTx(TX_HASH,'ERC20',WALLET,50,{ scannerEnabled:false });
  assert(r.status!=='found_confirmed');
});
test('scanner disabled with any txHash → same scan_error', function() {
  var r = verifyCryptoTx('any_hash','ERC20',WALLET,50,{ scannerEnabled:false });
  assertEq(r.status,'scan_error');
});

console.log('\n── verifyCryptoTx: mock scanner ──');

test('mock found_confirmed returned correctly', function() {
  var r = verifyCryptoTx(TX_HASH,'ERC20',WALLET,50,{ scannerEnabled:true, mockResult:GOOD_SCAN });
  assertEq(r.status,'found_confirmed'); assertEq(r.confirmations,6);
  assertEq(r.toAddress,WALLET);
});
test('mock found_pending returned correctly', function() {
  var r = verifyCryptoTx(TX_HASH,'ERC20',WALLET,50,{ scannerEnabled:true, mockResult:PEND_SCAN });
  assertEq(r.status,'found_pending');
});
test('no mock result → not_found', function() {
  var r = verifyCryptoTx(TX_HASH,'ERC20',WALLET,50,{ scannerEnabled:true });
  assertEq(r.status,'not_found');
});
test('txHash preserved in result', function() {
  var r = verifyCryptoTx(TX_HASH,'ERC20',WALLET,50,{ scannerEnabled:true, mockResult:GOOD_SCAN });
  assertEq(r.txHash,TX_HASH);
});

console.log('\n── matchScanToIntent ──');

test('found_confirmed + correct wallet + correct amount → matched', function() {
  var r = matchScanToIntent(GOOD_SCAN, intent('I1','P1','C1',WALLET,50));
  assert(r.matched,'matched'); assertEq(r.matchedPlayerId,'P1');
});
test('scan attaches playerId from intent', function() {
  var r = matchScanToIntent(GOOD_SCAN, intent('I1','P99','C1',WALLET,50));
  assertEq(r.matchedPlayerId,'P99','playerId from intent');
});
test('wallet mismatch → not matched', function() {
  var scan = Object.assign({},GOOD_SCAN,{ toAddress:'0xWRONG_WALLET' });
  var r = matchScanToIntent(scan, intent('I1','P1','C1',WALLET,50));
  assert(!r.matched); assertEq(r.reason,'wallet_mismatch');
});
test('amount short → not matched', function() {
  var scan = Object.assign({},GOOD_SCAN,{ amountUsdEstimate:40 }); // expected 50, got 40
  var r = matchScanToIntent(scan, intent('I1','P1','C1',WALLET,50));
  assert(!r.matched); assertEq(r.reason,'amount_short');
});
test('amount at tolerance boundary → matched (49.1 of 50, drift<2%)', function() {
  var scan = Object.assign({},GOOD_SCAN,{ amountUsdEstimate:49.1 }); // 98.2% of 50
  var r = matchScanToIntent(scan, intent('I1','P1','C1',WALLET,50));
  assert(r.matched,'within tolerance');
});
test('scan_error → not matched', function() {
  var err = { status:'scan_error', errorMessage:'scanner_not_configured' };
  var r = matchScanToIntent(err, intent('I1','P1','C1',WALLET,50));
  assert(!r.matched); assertEq(r.reason,'scan_error');
});
test('not_found → not matched', function() {
  var r = matchScanToIntent({ status:'not_found' }, intent('I1','P1','C1',WALLET,50));
  assert(!r.matched); assertEq(r.reason,'not_found');
});
test('no intent → not matched', function() {
  var r = matchScanToIntent(GOOD_SCAN, null);
  assert(!r.matched); assertEq(r.reason,'no_intent');
});
test('found_pending → matched (pending state)', function() {
  var r = matchScanToIntent(PEND_SCAN, intent('I1','P1','C1',WALLET,50));
  assert(r.matched,'pending can match'); assertEq(r.scanStatus,'found_pending');
});

console.log('\n── shouldAutoCredit ──');

test('autoCredit=false → no credit', function() {
  var mr = { matched:true, matchedPlayerId:'P1' };
  assertEq(shouldAutoCredit(GOOD_SCAN,mr,false).credit,false);
});
test('autoCredit=true + confirmed + matched → credit', function() {
  var mr = matchScanToIntent(GOOD_SCAN, intent('I1','P1','C1',WALLET,50));
  assert(shouldAutoCredit(GOOD_SCAN,mr,true).credit);
});
test('autoCredit=true + pending (not confirmed) → no credit', function() {
  var mr = matchScanToIntent(PEND_SCAN, intent('I1','P1','C1',WALLET,50));
  var r = shouldAutoCredit(PEND_SCAN,mr,true);
  assert(!r.credit); assert(r.reason.includes('not_confirmed'));
});
test('autoCredit=true + insufficient confirmations → no credit', function() {
  var lowConf = Object.assign({},GOOD_SCAN,{ confirmations:2 });
  var mr = matchScanToIntent(lowConf, intent('I1','P1','C1',WALLET,50));
  var r = shouldAutoCredit(lowConf,mr,true);
  assert(!r.credit); assert(r.reason.includes('insufficient_confirmations'));
});
test('autoCredit=true + wallet mismatch → no credit', function() {
  var badScan = Object.assign({},GOOD_SCAN,{ toAddress:'0xBAD' });
  var mr = matchScanToIntent(badScan, intent('I1','P1','C1',WALLET,50));
  assert(!shouldAutoCredit(badScan,mr,true).credit);
});
test('autoCredit=true + scanner_not_configured → no credit', function() {
  var errScan = { status:'scan_error', errorMessage:'scanner_not_configured', confirmations:0 };
  var mr = { matched:false, reason:'scan_error' };
  assert(!shouldAutoCredit(errScan,mr,true).credit);
});

console.log('\n── findIntentByTxHash ──');

test('finds intent matching tx hash', function() {
  var intents = [
    Object.assign(intent('I1','P1','C1',WALLET,50),{ tx_hash:TX_HASH }),
    Object.assign(intent('I2','P2','C1',WALLET,50),{ tx_hash:'0xOTHER' })
  ];
  var found = findIntentByTxHash(intents,TX_HASH);
  assert(found,'found'); assertEq(found.intent_id,'I1');
});
test('no match → null', function() {
  var intents = [Object.assign(intent('I1','P1','C1',WALLET,50),{ tx_hash:'0xABC' })];
  assert(!findIntentByTxHash(intents,'0xNOTEXIST'));
});

console.log('\n── buildScanRow ──');

test('scan row includes matchedPlayerId when matched', function() {
  var mr = matchScanToIntent(GOOD_SCAN, intent('I1','P1','C1',WALLET,50));
  var row = buildScanRow(GOOD_SCAN, mr, 'I1');
  assertEq(row.matchedPlayerId,'P1');
  assertEq(row.matchedIntentId,'I1');
});
test('scan row matchedPlayerId null when not matched', function() {
  var mr = { matched:false, reason:'wallet_mismatch' };
  var row = buildScanRow(Object.assign({},GOOD_SCAN,{ toAddress:'0xBAD' }), mr, 'I1');
  assert(!row.matchedPlayerId,'null when no match');
});
test('scan row includes errorMessage for scan_error', function() {
  var errScan = { txHash:TX_HASH, network:'ERC20', status:'scan_error',
    confirmations:0, errorMessage:'scanner_not_configured' };
  var row = buildScanRow(errScan, { matched:false, reason:'scan_error' }, null);
  assertEq(row.errorMessage,'scanner_not_configured');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Crypto scanner tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ CRYPTO SCANNER TESTS FAILED'); process.exit(1); }
else console.log('✅ All crypto scanner rules verified');
