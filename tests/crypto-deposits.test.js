/**
 * PocketBooks Sports — Phase W: Crypto Deposit Intent + TX Hash Tracking Tests
 * Run: node tests/crypto-deposits.test.js
 * Pure logic — no network, no DB.
 */
'use strict';

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch(e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m)      { if (!c) throw new Error(m || 'Expected true'); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m||'')+' — got '+JSON.stringify(a)+' expected '+JSON.stringify(b)); }

// ── Intent model ──────────────────────────────────────────────────────────────

const INTENT_STATUSES = new Set([
  'created','hash_submitted','pending_review','confirmed','credited','rejected','expired'
]);
const VALID_SYMBOLS = new Set(['USDT','USDC','ETH','BTC']);
const VALID_NETWORKS = new Set(['ERC20','TRC20','BEP20','Bitcoin','Bitcoin_SegWit']);
const INTENT_TTL_MS = 60 * 60 * 1000; // 1h

// Wallet registry: symbol → network → address
const WALLET_REGISTRY = {
  'USDT': { 'ERC20': '0x61F74cD55bA283269eb86a2AA7a882B2e1a9225F' },
  'USDC': { 'ERC20': '0x61F74cD55bA283269eb86a2AA7a882B2e1a9225F' },
  'ETH':  { 'ERC20': '0x61F74cD55bA283269eb86a2AA7a882B2e1a9225F' },
  'BTC':  { 'Bitcoin_SegWit': 'bc1qu6um0h9qdy8nn6w3m2t4x3ava8lp6tm96erwc4' }
};

function resolveWallet(cryptoSymbol, network) {
  const sym = WALLET_REGISTRY[cryptoSymbol];
  if (!sym) return null;
  return sym[network]||null;
}

function buildQRPayload(wallet, amount, symbol) {
  // Minimal URI format for crypto QR codes
  if (symbol==='BTC') return 'bitcoin:'+wallet+'?amount='+amount;
  return 'ethereum:'+wallet+'?value='+amount+'&token='+symbol;
}

function createDepositIntent(params) {
  const { clubId, playerId, packageAmountDiamonds, expectedUsd, cryptoSymbol, network } = params||{};
  const errors = [];
  if (!clubId)                 errors.push('missing_clubId');
  if (!playerId)               errors.push('missing_playerId');
  if (!packageAmountDiamonds||parseFloat(packageAmountDiamonds)<=0) errors.push('invalid_package');
  if (!VALID_SYMBOLS.has(cryptoSymbol))  errors.push('invalid_cryptoSymbol:'+cryptoSymbol);
  if (!VALID_NETWORKS.has(network))      errors.push('invalid_network:'+network);
  if (errors.length) return { ok:false, errors };

  const wallet = resolveWallet(cryptoSymbol, network);
  if (!wallet) return { ok:false, error:'wallet_not_configured_for:'+cryptoSymbol+'/'+network };

  const now = new Date().toISOString();
  const intentId = 'DI_'+playerId+'_'+Date.now();
  return {
    ok:true,
    intent: {
      intentId, clubId, playerId,
      packageAmountDiamonds: parseFloat(packageAmountDiamonds),
      expectedUsd:           parseFloat(expectedUsd)||0,
      cryptoSymbol, network,
      assignedWalletAddress: wallet,
      qrPayload:             buildQRPayload(wallet, expectedUsd, cryptoSymbol),
      status:                'created',
      txHash:                null, txHashSubmittedAt:null,
      creditedAt:null, creditedBy:null, rejectReason:null,
      createdAt: now,
      expiresAt: new Date(new Date(now).getTime()+INTENT_TTL_MS).toISOString()
    }
  };
}

// ── In-memory store ───────────────────────────────────────────────────────────

function makeIntentStore() {
  const rows = {};
  return {
    get:    function(id)   { return rows[id]||null; },
    set:    function(i)    { rows[i.intentId]=i; },
    all:    function()     { return Object.values(rows); },
    forPlayer: function(pid) { return Object.values(rows).filter(function(i){ return i.playerId===pid; }); }
  };
}

// ── Submit tx hash ────────────────────────────────────────────────────────────

function submitTxHash(store, intentId, txHash, submittingPlayerId, nowMs) {
  nowMs = nowMs||Date.now();
  const intent = store.get(intentId);
  if (!intent) return { ok:false, error:'intent_not_found' };
  // Ownership check
  if (intent.playerId !== submittingPlayerId)
    return { ok:false, error:'not_owner', intentOwner:intent.playerId };
  // Status check
  if (intent.status==='credited') return { ok:false, error:'already_credited' };
  if (intent.status==='rejected') return { ok:false, error:'intent_rejected' };
  if (intent.status==='expired' || nowMs > new Date(intent.expiresAt).getTime())
    return { ok:false, error:'intent_expired' };
  if (!txHash||txHash.trim().length<10)
    return { ok:false, error:'invalid_txHash' };
  // Validate no other pending intent already has this hash
  const dup = store.all().find(function(i){ return i.txHash===txHash.trim() && i.intentId!==intentId; });
  if (dup) return { ok:false, error:'duplicate_txHash' };

  intent.txHash             = txHash.trim();
  intent.txHashSubmittedAt  = new Date(nowMs).toISOString();
  intent.status             = 'hash_submitted';
  intent.updatedAt          = new Date(nowMs).toISOString();
  store.set(intent);
  return { ok:true, intentId, status:'hash_submitted' };
}

// ── Admin confirm / reject ────────────────────────────────────────────────────

function confirmDeposit(store, intentId, adminActorId, idempotencyKey) {
  const intent = store.get(intentId);
  if (!intent) return { ok:false, error:'intent_not_found' };
  if (intent.status==='credited') return { ok:true, idempotent:true, intentId };
  if (intent.status==='rejected') return { ok:false, error:'intent_rejected' };
  if (!['hash_submitted','pending_review','confirmed'].includes(intent.status))
    return { ok:false, error:'invalid_status_for_confirm:'+intent.status };
  const now = new Date().toISOString();
  intent.status      = 'credited';
  intent.creditedAt  = now;
  intent.creditedBy  = adminActorId;
  intent.updatedAt   = now;
  store.set(intent);
  return { ok:true, intentId, diamonds:intent.packageAmountDiamonds,
           ledgerEvent:'BALANCE_ADJUSTMENT', idempotencyKey };
}

function rejectDeposit(store, intentId, adminActorId, reason) {
  if (!reason||!reason.trim()) return { ok:false, error:'missing_reject_reason' };
  const intent = store.get(intentId);
  if (!intent) return { ok:false, error:'intent_not_found' };
  if (intent.status==='credited') return { ok:false, error:'already_credited' };
  intent.status       = 'rejected';
  intent.rejectReason = reason.trim();
  intent.updatedAt    = new Date().toISOString();
  store.set(intent);
  return { ok:true, intentId };
}

// ── Reconciliation flagging ───────────────────────────────────────────────────

const FLAG_MISSING_HASH_AFTER_MS   = 30 * 60 * 1000; // 30 min
const FLAG_UNCONFIRMED_HASH_AFTER_MS= 30 * 60 * 1000;

function flagIntents(intents, nowMs) {
  nowMs = nowMs||Date.now();
  return (intents||[]).map(function(i) {
    var flags = [];
    var ageMs = nowMs - new Date(i.createdAt).getTime();
    if (i.status==='created' && ageMs > FLAG_MISSING_HASH_AFTER_MS)
      flags.push('missing_hash');
    if (i.status==='hash_submitted') {
      var waitMs = nowMs - new Date(i.txHashSubmittedAt).getTime();
      if (waitMs > FLAG_UNCONFIRMED_HASH_AFTER_MS)
        flags.push('awaiting_review');
    }
    if (i.status==='expired') flags.push('expired');
    return Object.assign({}, i, { flags });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── createDepositIntent ──');

test('creates intent with correct fields', function() {
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:500,
    expectedUsd:50, cryptoSymbol:'USDT', network:'ERC20' });
  assert(r.ok,'ok: '+(r.errors||[]).join(','));
  assertEq(r.intent.playerId,'P1');
  assertEq(r.intent.packageAmountDiamonds,500);
  assertEq(r.intent.status,'created');
  assert(r.intent.assignedWalletAddress,'has wallet');
  assert(r.intent.qrPayload,'has QR');
  assert(r.intent.expiresAt,'has expiresAt');
});
test('wallet resolved correctly for USDT/ERC20', function() {
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  assertEq(r.intent.assignedWalletAddress,'0x61F74cD55bA283269eb86a2AA7a882B2e1a9225F');
});
test('BTC resolved to segwit address', function() {
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'BTC', network:'Bitcoin_SegWit' });
  assertEq(r.intent.assignedWalletAddress,'bc1qu6um0h9qdy8nn6w3m2t4x3ava8lp6tm96erwc4');
});
test('missing playerId → error', function() {
  var r = createDepositIntent({ clubId:'C1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  assert(!r.ok); assert(r.errors.includes('missing_playerId'));
});
test('invalid cryptoSymbol → error', function() {
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'DOGE', network:'ERC20' });
  assert(!r.ok);
});
test('unregistered symbol+network → wallet_not_configured', function() {
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'ETH', network:'TRC20' }); // ETH not on TRC20
  assert(!r.ok); assert(r.error&&r.error.includes('wallet_not_configured'));
});
test('QR payload includes wallet address', function() {
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  assert(r.intent.qrPayload.includes(r.intent.assignedWalletAddress));
});

console.log('\n── submitTxHash ──');

test('player submits hash for own intent', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent);
  var sr = submitTxHash(store, r.intent.intentId, '0xabc123def456abc123def456abc123def456', 'P1');
  assert(sr.ok,'ok: '+(sr.error||'')); assertEq(sr.status,'hash_submitted');
  assertEq(store.get(r.intent.intentId).status,'hash_submitted');
});
test('different player cannot submit hash for another intent', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent);
  var sr = submitTxHash(store, r.intent.intentId, '0xabc123def456', 'P2'); // P2 submitting P1's intent
  assert(!sr.ok); assertEq(sr.error,'not_owner');
});
test('duplicate txHash across intents blocked', function() {
  var store = makeIntentStore();
  var r1 = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  var r2 = createDepositIntent({ clubId:'C1',playerId:'P2',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r1.intent); store.set(r2.intent);
  submitTxHash(store, r1.intent.intentId, '0xsamehash111222333444', 'P1');
  var sr = submitTxHash(store, r2.intent.intentId, '0xsamehash111222333444', 'P2');
  assertEq(sr.error,'duplicate_txHash');
});
test('expired intent cannot accept hash', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent);
  var futureMs = new Date(r.intent.expiresAt).getTime()+1000;
  var sr = submitTxHash(store, r.intent.intentId, '0xabc123def456abc123', 'P1', futureMs);
  assertEq(sr.error,'intent_expired');
});
test('too short txHash rejected', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent);
  assertEq(submitTxHash(store, r.intent.intentId, '0x12', 'P1').error,'invalid_txHash');
});

console.log('\n── confirmDeposit ──');

test('confirm credits diamonds', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:500,
    expectedUsd:50, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent);
  submitTxHash(store, r.intent.intentId, '0xabc123def456abc123def456abc123def456', 'P1');
  var cr = confirmDeposit(store, r.intent.intentId, 'H1', 'CONF_001');
  assert(cr.ok); assertEq(cr.diamonds,500);
  assertEq(store.get(r.intent.intentId).status,'credited');
});
test('duplicate confirm is idempotent', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:500,
    expectedUsd:50, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent);
  submitTxHash(store, r.intent.intentId, '0xabc123def456abc123def456abc123def456', 'P1');
  confirmDeposit(store, r.intent.intentId, 'H1', 'CONF_001');
  var cr2 = confirmDeposit(store, r.intent.intentId, 'H1', 'CONF_001');
  assert(cr2.ok&&cr2.idempotent,'idempotent');
});
test('cannot confirm created intent (no hash)', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent);
  var cr = confirmDeposit(store, r.intent.intentId, 'H1', 'CONF_002');
  assertEq(cr.error,'invalid_status_for_confirm:created');
});

console.log('\n── rejectDeposit ──');

test('reject with reason succeeds', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent);
  submitTxHash(store, r.intent.intentId, '0xabc123def456abc123def456abc123def456', 'P1');
  var rr = rejectDeposit(store, r.intent.intentId, 'H1', 'Invalid transaction');
  assert(rr.ok); assertEq(store.get(r.intent.intentId).status,'rejected');
  assertEq(store.get(r.intent.intentId).rejectReason,'Invalid transaction');
});
test('reject without reason → error', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent); store.get(r.intent.intentId).status='hash_submitted';
  assertEq(rejectDeposit(store, r.intent.intentId, 'H1', '').error,'missing_reject_reason');
});
test('cannot reject already credited intent', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent);
  submitTxHash(store, r.intent.intentId, '0xabc123def456abc123def456abc123def456', 'P1');
  confirmDeposit(store, r.intent.intentId, 'H1', 'CONF_001');
  assertEq(rejectDeposit(store, r.intent.intentId, 'H1', 'Mistake').error,'already_credited');
});

console.log('\n── Reconciliation flags ──');

test('no flags on fresh intent', function() {
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  var flagged = flagIntents([r.intent], new Date(r.intent.createdAt).getTime()+1000);
  assertEq(flagged[0].flags.length,0,'no flags on fresh');
});
test('missing hash after 30min flagged', function() {
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  var oldMs = new Date(r.intent.createdAt).getTime() + 31*60*1000;
  var flagged = flagIntents([r.intent], oldMs);
  assert(flagged[0].flags.includes('missing_hash'));
});
test('hash submitted but unconfirmed 30min → awaiting_review', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent);
  submitTxHash(store, r.intent.intentId, '0xabc123def456abc123def456abc123def456', 'P1');
  var submitted = store.get(r.intent.intentId);
  var oldMs = new Date(submitted.txHashSubmittedAt).getTime() + 31*60*1000;
  var flagged = flagIntents([submitted], oldMs);
  assert(flagged[0].flags.includes('awaiting_review'));
});
test('credited intent has no flags', function() {
  var store = makeIntentStore();
  var r = createDepositIntent({ clubId:'C1',playerId:'P1',packageAmountDiamonds:100,
    expectedUsd:10, cryptoSymbol:'USDT', network:'ERC20' });
  store.set(r.intent);
  submitTxHash(store, r.intent.intentId, '0xabc123def456abc123def456abc123def456', 'P1');
  confirmDeposit(store, r.intent.intentId, 'H1', 'CONF_001');
  var flagged = flagIntents([store.get(r.intent.intentId)], Date.now()+999999);
  assertEq(flagged[0].flags.length,0,'credited = no flags');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Crypto deposit tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ CRYPTO DEPOSIT TESTS FAILED'); process.exit(1); }
else console.log('✅ All crypto deposit rules verified');
