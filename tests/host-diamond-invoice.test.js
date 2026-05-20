/**
 * PocketBooks Sports — Phase AD: Host Diamond Weekly Invoice Tests
 * Run: node tests/host-diamond-invoice.test.js
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

// ── Constants ─────────────────────────────────────────────────────────────────

const FEE = 15;

// ── Invoice builder (mirrors endpoint logic) ──────────────────────────────────

function buildInvoice(clubId, weekStart, activeBettors, ledgerRows, endingBalance, startingBalance) {
  var weekEndD = new Date(weekStart+'T00:00:00Z');
  weekEndD.setUTCDate(weekEndD.getUTCDate()+7);
  var weekEnd = weekEndD.toISOString().slice(0,10);

  var invoiceId = 'HDI_'+clubId+'_'+weekStart;

  var bettors = (activeBettors||[]).filter(function(b){
    var w = b.week_start||b.weekStart;
    return w===weekStart;
  });

  var ll = (ledgerRows||[]).filter(function(r){
    var at = r.created_at||r.createdAt||'';
    return at>=weekStart && at<weekEnd;
  });

  var totalCharges  = ll.filter(function(r){ return (r.event_type||r.eventType||'').includes('CHARGE'); })
    .reduce(function(s,r){ return s+parseFloat(r.amount_diamonds||r.amountDiamonds||0); },0);
  var totalTopups   = ll.filter(function(r){ return (r.event_type||r.eventType||'').includes('TOPUP'); })
    .reduce(function(s,r){ return s+parseFloat(r.amount_diamonds||r.amountDiamonds||0); },0);
  var totalAdj      = ll.filter(function(r){ return (r.event_type||r.eventType||'').includes('ADJUSTMENT'); })
    .reduce(function(s,r){ return s+parseFloat(r.amount_diamonds||r.amountDiamonds||0); },0);

  var lineItems = [];
  if (bettors.length>0) {
    lineItems.push({
      description:       'Active bettor fee',
      quantity:          bettors.length,
      unitPriceDiamonds: FEE,
      totalDiamonds:     bettors.length * FEE
    });
  }
  if (totalTopups>0) {
    lineItems.push({
      description:       'Diamond top-ups',
      quantity:          1,
      unitPriceDiamonds: totalTopups,
      totalDiamonds:     totalTopups
    });
  }
  if (totalAdj!==0) {
    lineItems.push({
      description:       'Adjustments',
      quantity:          1,
      unitPriceDiamonds: totalAdj,
      totalDiamonds:     totalAdj
    });
  }

  return {
    invoiceId,
    clubId,
    weekStart,
    weekEnd,
    feePerActiveBettor:         FEE,
    activeBettorCount:          bettors.length,
    totalActiveBettorCharges:   totalCharges,
    totalTopups,
    totalAdjustments:           totalAdj,
    startingBalance:            startingBalance!=null ? startingBalance : null,
    endingBalance:              endingBalance!=null   ? endingBalance   : null,
    lineItems,
    activeBettors: bettors.map(function(b){
      return {
        playerId:        b.player_id||b.playerId,
        firstTicketId:   b.first_ticket_id||b.firstTicketId||null,
        activatedAt:     b.activated_at||b.activatedAt,
        chargedDiamonds: parseFloat(b.charged_diamonds||b.chargedDiamonds||FEE)
      };
    }),
    generatedAt: new Date().toISOString()
  };
}

// ── RBAC ──────────────────────────────────────────────────────────────────────

const ROLE_RANK = { owner:5,full_admin:4,settlement_manager:3,risk_viewer:2,player:1,view_only:0 };
function canViewInvoice(role) {
  return (ROLE_RANK[role]||0) >= ROLE_RANK.settlement_manager;
}

// ── Invoice UI renderer stub ──────────────────────────────────────────────────

function renderInvoiceModal(invoice) {
  if (!invoice) return '<div class="inv-modal inv-modal--empty">No invoice data</div>';
  var html = '<div class="inv-modal">';
  html += '<div class="inv-modal__header">💎 Diamond Invoice — Week of '+invoice.weekStart+'</div>';
  html += '<div class="inv-modal__id">Invoice #: '+invoice.invoiceId+'</div>';
  html += '<table class="inv-modal__table">';
  html += '<thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>';
  html += '<tbody>';
  invoice.lineItems.forEach(function(item){
    html += '<tr><td>'+item.description+'</td><td>'+item.quantity+'</td>';
    html += '<td>'+item.unitPriceDiamonds+'d</td><td>'+item.totalDiamonds+'d</td></tr>';
  });
  html += '</tbody></table>';
  if (invoice.endingBalance!=null)
    html += '<div class="inv-modal__balance">Ending balance: '+invoice.endingBalance+'d</div>';
  html += '<div class="inv-modal__actions">';
  html += '<button class="inv-modal__print-btn" onclick="window.print()">🖨 Print</button>';
  html += '<button class="inv-modal__close-btn">Close</button>';
  html += '</div></div>';
  return html;
}

// ── Test data ─────────────────────────────────────────────────────────────────

var WEEK1 = '2026-05-18';
var WEEK2 = '2026-05-25';

var bettors = [
  { player_id:'P1', week_start:WEEK1, first_ticket_id:'T001',
    activated_at:WEEK1+'T10:00:00Z', charged_diamonds:15 },
  { player_id:'P2', week_start:WEEK1, first_ticket_id:'T002',
    activated_at:WEEK1+'T11:00:00Z', charged_diamonds:15 },
  { player_id:'P3', week_start:WEEK2, first_ticket_id:'T010',
    activated_at:WEEK2+'T09:00:00Z', charged_diamonds:15 }
];

var ledger = [
  { event_type:'HOST_DIAMOND_TOPUP',        direction:'credit', amount_diamonds:300,
    balance_before:0,   balance_after:300, created_at:WEEK1+'T08:00:00Z', reason:'fund' },
  { event_type:'HOST_ACTIVE_BETTOR_CHARGE', direction:'debit',  amount_diamonds:15,
    balance_before:300, balance_after:285, created_at:WEEK1+'T10:00:00Z', reason:'P1' },
  { event_type:'HOST_ACTIVE_BETTOR_CHARGE', direction:'debit',  amount_diamonds:15,
    balance_before:285, balance_after:270, created_at:WEEK1+'T11:00:00Z', reason:'P2' },
  { event_type:'HOST_DIAMOND_TOPUP',        direction:'credit', amount_diamonds:150,
    balance_before:270, balance_after:420, created_at:WEEK2+'T08:00:00Z', reason:'week2' },
  { event_type:'HOST_ACTIVE_BETTOR_CHARGE', direction:'debit',  amount_diamonds:15,
    balance_before:420, balance_after:405, created_at:WEEK2+'T09:00:00Z', reason:'P3' },
  { event_type:'HOST_DIAMOND_ADJUSTMENT',   direction:'credit', amount_diamonds:10,
    balance_before:405, balance_after:415, created_at:WEEK2+'T10:00:00Z', reason:'promo' }
];

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n── Invoice ID ──');

test('invoiceId is deterministic: HDI_<clubId>_<weekStart>', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  assertEq(inv.invoiceId, 'HDI_C1_'+WEEK1);
});

test('same clubId + weekStart always produces same invoiceId', function() {
  var inv1 = buildInvoice('CLUB_X', WEEK1, bettors, ledger, 100);
  var inv2 = buildInvoice('CLUB_X', WEEK1, bettors, ledger, 100);
  assertEq(inv1.invoiceId, inv2.invoiceId);
});

test('different weekStart produces different invoiceId', function() {
  var inv1 = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  var inv2 = buildInvoice('C1', WEEK2, bettors, ledger, 405);
  assert(inv1.invoiceId !== inv2.invoiceId, 'different IDs');
});

console.log('\n── Active bettor charge calculation ──');

test('activeBettorCount = bettors in that week only', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  assertEq(inv.activeBettorCount, 2, 'P1+P2 in WEEK1');
});

test('totalActiveBettorCharges = count × fee', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  assertEq(inv.totalActiveBettorCharges, 30, '2 × 15 = 30');
});

test('active bettor charge line item: quantity=count, unit=15, total=count×15', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  var line = inv.lineItems.find(function(l){ return l.description==='Active bettor fee'; });
  assert(line, 'line item exists');
  assertEq(line.quantity, 2);
  assertEq(line.unitPriceDiamonds, 15);
  assertEq(line.totalDiamonds, 30);
});

test('zero bettors: no active-bettor line item', function() {
  var inv = buildInvoice('C1', WEEK1, [], ledger, 300);
  var line = inv.lineItems.find(function(l){ return l.description==='Active bettor fee'; });
  assert(!line, 'no line item when zero bettors');
});

console.log('\n── Line items ──');

test('topup line item present when topups exist', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  var line = inv.lineItems.find(function(l){ return l.description==='Diamond top-ups'; });
  assert(line, 'topup line item');
  assertEq(line.totalDiamonds, 300);
});

test('adjustment line item present when adjustments exist', function() {
  var inv = buildInvoice('C1', WEEK2, bettors, ledger, 415);
  var line = inv.lineItems.find(function(l){ return l.description==='Adjustments'; });
  assert(line, 'adjustment line item');
  assertEq(line.totalDiamonds, 10);
});

test('no adjustment line when no adjustments', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270); // WEEK1 has no adjustments
  var line = inv.lineItems.find(function(l){ return l.description==='Adjustments'; });
  assert(!line, 'no adjustment line');
});

console.log('\n── Prior week invoice ──');

test('invoice for prior week (WEEK1) filters correctly', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  assertEq(inv.weekStart, WEEK1);
  assertEq(inv.activeBettorCount, 2);
  assertEq(inv.totalTopups, 300);
});

test('invoice for WEEK2 filters correctly', function() {
  var inv = buildInvoice('C1', WEEK2, bettors, ledger, 415);
  assertEq(inv.activeBettorCount, 1, 'only P3');
  assertEq(inv.totalTopups, 150, 'week2 topup');
  assertEq(inv.totalAdjustments, 10);
});

test('weekEnd is 7 days after weekStart', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  assertEq(inv.weekEnd, WEEK2, 'weekEnd = WEEK1 + 7 days');
});

test('endingBalance included in invoice', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  assertEq(inv.endingBalance, 270);
});

test('generatedAt is ISO timestamp', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  assert(inv.generatedAt && inv.generatedAt.includes('T'), 'ISO timestamp');
});

console.log('\n── RBAC ──');

test('settlement_manager can view invoice', function() {
  assert(canViewInvoice('settlement_manager'));
});
test('full_admin can view invoice', function() {
  assert(canViewInvoice('full_admin'));
});
test('owner can view invoice', function() {
  assert(canViewInvoice('owner'));
});
test('player cannot view invoice', function() {
  assert(!canViewInvoice('player'));
});
test('risk_viewer cannot view invoice', function() {
  assert(!canViewInvoice('risk_viewer'));
});

console.log('\n── Invoice UI render ──');

test('modal renders invoice ID', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  var html = renderInvoiceModal(inv);
  assert(html.includes('HDI_C1_'+WEEK1), 'invoice ID in modal');
});

test('modal renders week', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  var html = renderInvoiceModal(inv);
  assert(html.includes(WEEK1), 'week in modal');
});

test('modal renders active bettor line item with total', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  var html = renderInvoiceModal(inv);
  assert(html.includes('Active bettor fee'), 'line item description');
  assert(html.includes('30d'), 'total diamonds');
});

test('modal has print button with window.print()', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  var html = renderInvoiceModal(inv);
  assert(html.includes('window.print()'), 'print button');
  assert(html.includes('Print'), 'print label');
});

test('modal has close button', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  var html = renderInvoiceModal(inv);
  assert(html.includes('Close'), 'close button');
});

test('modal shows ending balance', function() {
  var inv = buildInvoice('C1', WEEK1, bettors, ledger, 270);
  var html = renderInvoiceModal(inv);
  assert(html.includes('270'), 'ending balance');
});

test('null invoice shows empty state', function() {
  var html = renderInvoiceModal(null);
  assert(html.includes('inv-modal--empty'), 'empty state');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n'+'─'.repeat(54));
console.log('Host diamond invoice tests: '+_pass+' passed, '+_fail+' failed');
if (_fail > 0) { console.error('❌ HOST DIAMOND INVOICE TESTS FAILED'); process.exit(1); }
else console.log('✅ All host diamond invoice rules verified');
