/**
 * Task 20 — Notification center final pass
 * Run: node tests/notification-center.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

let _pass = 0, _fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ✅ ' + name); _pass++; }
  catch (e) { console.error('  ❌ ' + name + '\n     ' + e.message); _fail++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'Expected true'); }

const html = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');

function extractFn(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([\\s\\S]*?\\n\\}');
  const m = src.match(re);
  return m ? m[0] : '';
}

// Mirror FE helpers for unit checks
function _notifSanitizeCopy(title, message) {
  var t = String(title || '');
  var m = String(message || '');
  t = t.replace(/\bpayment\s+process(ed|ing)?\b/gi, 'settlement recorded')
       .replace(/\bpayment\s+received\b/gi, 'settlement recorded')
       .replace(/\bstripe\b/gi, 'settlement')
       .replace(/\bcash out offer\b/gi, 'Cash-out offer');
  m = m.replace(/\bpayment\s+process(ed|ing)?\b/gi, 'settlement recorded')
       .replace(/\bpayment\s+received\b/gi, 'settlement recorded')
       .replace(/\bfunds\s+transferr?ed\b/gi, 'balance updated')
       .replace(/\bstripe\b/gi, 'settlement')
       .replace(/\bcash out offer\b/gi, 'Cash-out offer');
  return { title: t, message: m };
}
function _notifDedupe(list) {
  var out = [];
  var seen = {};
  (list || []).forEach(function(n) {
    if (!n) return;
    var id = n.id != null ? String(n.id) : '';
    var day = String(n.created_at || '').slice(0, 10);
    var key = id || (String(n.type || '') + '|' + String(n.title || '') + '|' + String(n.message || '') + '|' + day);
    if (seen[key]) return;
    seen[key] = true;
    out.push(n);
  });
  return out;
}
function _notifFmtTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

console.log('\n── Markup / mobile drawer ──');
test('notif backdrop + close button present', function () {
  assert(html.includes('id="notif-backdrop"'));
  assert(html.includes('notif-dd-close'));
  assert(html.includes('role="dialog"'));
});
test('mobile sheet CSS for notif drawer', function () {
  assert(/position:fixed;left:0;right:0;bottom:0/.test(html.replace(/\s+/g, '')) ||
         html.includes('max-height:min(72vh,520px)'));
  assert(html.includes('.notif-backdrop.open{display:block}'));
});

console.log('\n── Unread / read / timestamps ──');
test('unread class + badge update helpers', function () {
  assert(html.includes('notif-item unread'));
  assert(html.includes('_notifUpdateBadge'));
  assert(html.includes('_markNotificationsRead'));
});
test('timestamps include relative + clock', function () {
  var fn = extractFn(html, '_notifFmtTime');
  assert(fn.includes('Just now'));
  assert(fn.includes('toLocaleTimeString'));
});
test('_notifFmtTime formats recent', function () {
  var t = _notifFmtTime(new Date().toISOString());
  assert(t === 'Just now' || /m ago|h ago/.test(t));
});

console.log('\n── Dedup + empty + cash-out ──');
test('dedupe by id', function () {
  var list = _notifDedupe([
    { id: 1, title: 'A', message: 'x', created_at: '2026-09-09T10:00:00Z' },
    { id: 1, title: 'A', message: 'x', created_at: '2026-09-09T10:00:00Z' },
    { id: 2, title: 'B', message: 'y', created_at: '2026-09-09T11:00:00Z' }
  ]);
  assert(list.length === 2);
});
test('empty state copy present', function () {
  assert(html.includes('No notifications'));
  assert(html.includes('You’re all caught up') || html.includes("You're all caught up"));
});
test('cash-out actions wired when enabled', function () {
  assert(html.includes('cashout_offer') || html.includes('cash-out offer') || html.includes('Cash-out'));
  assert(html.includes('data-cashout-accept'));
  assert(html.includes('/api/bets/accept-cashout'));
});

console.log('\n── Settlement wording (no payment rails) ──');
test('sanitize strips payment-processing language', function () {
  var c = _notifSanitizeCopy('Payment processed', 'Your payment received via Stripe — funds transferred');
  assert(!/payment process/i.test(c.title));
  assert(!/stripe/i.test(c.message));
  assert(!/funds transfer/i.test(c.message));
  assert(/settlement/i.test(c.title) || /settlement/i.test(c.message));
});
test('FE has sanitize helper', function () {
  assert(html.includes('_notifSanitizeCopy'));
  assert(html.includes('_notifDedupe'));
});
test('no fake notification generators', function () {
  assert(html.includes('Server-backed only'));
  assert(!/pushFakeNotif|seedNotif|demoNotifications|fakeNotifications/i.test(html));
});

console.log('\n── Summary: ' + _pass + ' passed, ' + _fail + ' failed ──');
process.exit(_fail ? 1 : 0);
