/**
 * Shared Buy Diamonds modal — player lobby + host dashboard.
 * Looks up _pbFetch / auth helpers at call time so include order is safe.
 */
(function (global) {
  'use strict';

  var PACKAGES = [100, 250, 500, 1000];
  var CRYPTOS = [
    { symbol: 'BTC',  network: 'Bitcoin_SegWit' },
    { symbol: 'ETH',  network: 'ERC20' },
    { symbol: 'USDT', network: 'ERC20' },
    { symbol: 'USDC', network: 'ERC20' }
  ];

  var _state = {
    screen: 'select',
    packageAmount: 100,
    cryptoSymbol: 'USDT',
    intent: null,
    error: '',
    busy: false,
    countdownTimer: null
  };

  function _token() {
    try {
      return localStorage.getItem('pb-session-token') || localStorage.getItem('pb-sports-token') || '';
    } catch (_e) { return ''; }
  }

  function _decodeJwt(token) {
    try {
      var parts = String(token || '').split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch (_e) { return null; }
  }

  function _lsJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch (_e) { return null; }
  }

  function _sessionIds() {
    var tok = _token();
    var jwt = _decodeJwt(tok) || {};
    var actorId = String(jwt.actorId || jwt.sub || '').trim();
    var clubId = String(jwt.clubId || '').trim();

    var pl = _lsJson('pb-player') || {};
    var host = _lsJson('pb-host') || {};
    var club = _lsJson('pb-active-club') || _lsJson('pb-club') || {};
    if (typeof currentClub !== 'undefined' && currentClub) {
      club = currentClub;
    }

    if (!actorId) {
      actorId = String(pl.id != null ? pl.id : (pl.username || host.id || host.hostId || '')).trim();
    }
    if (!clubId) {
      clubId = String(club.id != null ? club.id : (club.clubId || '')).trim();
    }

    // Backend create-intent requires playerId; hosts send their actor id.
    var playerId = actorId;
    return { token: tok, actorId: actorId, playerId: playerId, clubId: clubId, jwt: jwt };
  }

  function _promptLogin() {
    var msg = 'Sign in to buy diamonds';
    if (typeof _redirectToSignIn === 'function') {
      _redirectToSignIn();
      return;
    }
    try {
      global.location.href = 'lobby.html?screen=signin&msg=' + encodeURIComponent(msg);
    } catch (_e) {
      try { alert(msg); } catch (_a) {}
    }
  }

  function _requireAuth() {
    if (_token()) return true;
    _promptLogin();
    return false;
  }

  function _fetch(url, opts) {
    opts = opts || {};
    if (typeof _pbFetch === 'function') return _pbFetch(url, opts);
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    var tok = _token();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    return fetch(url, Object.assign({}, opts, { headers: headers }));
  }

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _networkFor(symbol) {
    var s = String(symbol || '').toUpperCase();
    return s === 'BTC' ? 'Bitcoin_SegWit' : 'ERC20';
  }

  function _ensureStyles() {
    if (document.getElementById('pb-diamonds-styles')) return;
    var css = document.createElement('style');
    css.id = 'pb-diamonds-styles';
    css.textContent = [
      '#pb-diamonds-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,0.82);display:flex;align-items:flex-end;justify-content:center;padding:0}',
      '@media (min-width:700px){#pb-diamonds-overlay{align-items:center;padding:24px}}',
      '#pb-diamonds-modal{width:100%;max-width:430px;max-height:92vh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#141414;color:#fff;border:1px solid #252525;border-radius:20px 20px 0 0;padding:20px 18px 28px;box-shadow:0 -8px 40px rgba(0,0,0,0.5)}',
      '@media (min-width:700px){#pb-diamonds-modal{border-radius:20px}}',
      '#pb-diamonds-modal .bd-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}',
      '#pb-diamonds-modal .bd-title{font-size:1.05rem;font-weight:900;letter-spacing:-0.2px}',
      '#pb-diamonds-modal .bd-close{background:#1c1c1c;border:1px solid #252525;color:#aaa;width:34px;height:34px;border-radius:50%;cursor:pointer;font-size:1rem}',
      '#pb-diamonds-modal .bd-lbl{font-size:0.68rem;font-weight:800;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 8px}',
      '#pb-diamonds-modal .bd-pkgs{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '#pb-diamonds-modal .bd-pkg{text-align:left;background:#1c1c1c;border:1.5px solid #252525;border-radius:14px;padding:14px 12px;color:#fff;cursor:pointer;font-weight:800}',
      '#pb-diamonds-modal .bd-pkg.sel{border-color:#00ff88;background:rgba(0,255,136,0.1);color:#00ff88}',
      '#pb-diamonds-modal .bd-pkg-amt{font-size:0.98rem;font-weight:900}',
      '#pb-diamonds-modal .bd-pkg-usd{font-size:0.72rem;color:#888;margin-top:3px;font-weight:700}',
      '#pb-diamonds-modal .bd-pkg.sel .bd-pkg-usd{color:rgba(0,255,136,0.75)}',
      '#pb-diamonds-modal select,#pb-diamonds-modal input[type=text]{width:100%;background:#1c1c1c;border:1.5px solid #252525;border-radius:12px;padding:12px 14px;color:#fff;font-size:0.9rem;font-weight:700;outline:none}',
      '#pb-diamonds-modal .bd-btn{width:100%;background:#00ff88;color:#000;border:none;padding:14px;border-radius:14px;font-size:0.92rem;font-weight:900;cursor:pointer;margin-top:16px}',
      '#pb-diamonds-modal .bd-btn:disabled{opacity:0.45;cursor:not-allowed}',
      '#pb-diamonds-modal .bd-btn-ghost{background:#1c1c1c;color:#fff;border:1px solid #252525}',
      '#pb-diamonds-modal .bd-warn{margin-top:12px;padding:10px 12px;background:rgba(245,200,66,0.08);border:1px solid rgba(245,200,66,0.28);border-radius:10px;color:#f5c842;font-size:0.75rem;font-weight:700;line-height:1.45}',
      '#pb-diamonds-modal .bd-err{margin-top:10px;color:#ff3d57;font-size:0.78rem;font-weight:700}',
      '#pb-diamonds-modal .bd-addr-row{display:flex;gap:8px;align-items:stretch}',
      '#pb-diamonds-modal .bd-addr{flex:1;font-family:monospace;font-size:0.72rem;word-break:break-all;background:#0a0a0a;border:1px solid #252525;border-radius:10px;padding:10px 12px;color:#00c2ff}',
      '#pb-diamonds-modal .bd-copy{background:#00ff88;color:#000;border:none;padding:0 14px;border-radius:10px;font-size:0.72rem;font-weight:900;cursor:pointer;white-space:nowrap}',
      '#pb-diamonds-modal .bd-qr{background:#fff;border-radius:12px;padding:10px;display:flex;justify-content:center;margin:12px 0}',
      '#pb-diamonds-modal .bd-qr img{width:200px;height:200px;display:block}',
      '#pb-diamonds-modal .bd-meta{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #252525;font-size:0.82rem}',
      '#pb-diamonds-modal .bd-meta span:last-child{font-weight:900}',
      '#pb-diamonds-modal .bd-pending{text-align:center;padding:12px 6px 4px;line-height:1.55;font-size:0.88rem;font-weight:700}',
      '#pb-diamonds-modal .bd-id{margin-top:12px;font-family:monospace;font-size:0.7rem;color:#00c2ff;word-break:break-all;background:#0a0a0a;border:1px solid #252525;border-radius:10px;padding:10px}'
    ].join('\n');
    document.head.appendChild(css);
  }

  function _root() {
    return document.getElementById('pb-diamonds-overlay');
  }

  function _clearCountdown() {
    if (_state.countdownTimer) {
      clearInterval(_state.countdownTimer);
      _state.countdownTimer = null;
    }
  }

  function _fmtCountdown(expiresAt) {
    var ms = new Date(expiresAt).getTime() - Date.now();
    if (!isFinite(ms) || ms <= 0) return 'Expired';
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var mm = (m < 10 ? '0' : '') + m;
    var ss = (s < 10 ? '0' : '') + s;
    return h > 0 ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss);
  }

  function _copyText(text, btn) {
    function flash() {
      if (!btn) return;
      var orig = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = orig || 'Copy'; }, 1400);
    }
    var ok = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_e) { ok = false; }
    if (ok) { flash(); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(flash).catch(function () {});
    }
  }

  function closeBuyDiamondsModal() {
    _clearCountdown();
    var el = _root();
    if (el) el.remove();
    _state.screen = 'select';
    _state.intent = null;
    _state.error = '';
    _state.busy = false;
  }

  function _render() {
    var overlay = _root();
    if (!overlay) return;
    var modal = overlay.querySelector('#pb-diamonds-modal');
    if (!modal) return;
    if (_state.screen === 'pay' && _state.intent) modal.innerHTML = _htmlPay();
    else if (_state.screen === 'pending') modal.innerHTML = _htmlPending();
    else modal.innerHTML = _htmlSelect();
    _wire(modal);
    if (_state.screen === 'pay' && _state.intent) _startCountdown(modal);
  }

  function _htmlSelect() {
    var pkgs = PACKAGES.map(function (n) {
      var sel = _state.packageAmount === n ? ' sel' : '';
      return '<button type="button" class="bd-pkg' + sel + '" data-bd-pkg="' + n + '">' +
        '<div class="bd-pkg-amt">💎 ' + n.toLocaleString('en-US') + ' Diamonds</div>' +
        '<div class="bd-pkg-usd">$' + n.toLocaleString('en-US') + '</div>' +
        '</button>';
    }).join('');
    var opts = CRYPTOS.map(function (c) {
      return '<option value="' + c.symbol + '"' + (_state.cryptoSymbol === c.symbol ? ' selected' : '') + '>' +
        c.symbol + '</option>';
    }).join('');
    return '' +
      '<div class="bd-hdr"><div class="bd-title">💎 Buy Diamonds</div>' +
      '<button type="button" class="bd-close" data-bd-close aria-label="Close">✕</button></div>' +
      '<div class="bd-lbl">Select Package</div>' +
      '<div class="bd-pkgs">' + pkgs + '</div>' +
      '<div class="bd-lbl">Crypto</div>' +
      '<select id="bd-crypto">' + opts + '</select>' +
      (_state.error ? '<div class="bd-err">' + _esc(_state.error) + '</div>' : '') +
      '<button type="button" class="bd-btn" data-bd-confirm' + (_state.busy ? ' disabled' : '') + '>' +
        (_state.busy ? 'Creating…' : 'Confirm') +
      '</button>';
  }

  function _htmlPay() {
    var intent = _state.intent || {};
    var wallet = intent.wallet || '';
    var payload = intent.qrPayload || wallet;
    var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(payload);
    var amt = _state.packageAmount;
    return '' +
      '<div class="bd-hdr"><div class="bd-title">💎 Send Payment</div>' +
      '<button type="button" class="bd-close" data-bd-close aria-label="Close">✕</button></div>' +
      '<div class="bd-meta"><span>Package</span><span>💎 ' + amt.toLocaleString('en-US') + '</span></div>' +
      '<div class="bd-meta"><span>Exact amount</span><span>$' + amt.toLocaleString('en-US') + ' ' + _esc(intent.cryptoSymbol || _state.cryptoSymbol) + '</span></div>' +
      '<div class="bd-meta"><span>Network</span><span>' + _esc(intent.network || _networkFor(_state.cryptoSymbol)) + '</span></div>' +
      '<div class="bd-meta"><span>Expires</span><span id="bd-countdown">' + _esc(_fmtCountdown(intent.expiresAt)) + '</span></div>' +
      '<div class="bd-lbl">Wallet address</div>' +
      '<div class="bd-addr-row">' +
        '<div class="bd-addr" id="bd-wallet">' + _esc(wallet) + '</div>' +
        '<button type="button" class="bd-copy" data-bd-copy>Copy</button>' +
      '</div>' +
      '<div class="bd-qr">' +
        '<img id="bd-qr-img" alt="Payment QR" src="' + _esc(qrUrl) + '">' +
      '</div>' +
      '<div id="bd-qr-fallback" style="display:none;font-size:0.75rem;color:#888;margin-bottom:8px">QR unavailable — copy the address above.</div>' +
      '<div class="bd-warn">Send exactly this amount to this address</div>' +
      '<div class="bd-lbl">Transaction hash</div>' +
      '<input id="bd-tx-hash" type="text" placeholder="Paste tx hash" autocomplete="off" spellcheck="false">' +
      (_state.error ? '<div class="bd-err">' + _esc(_state.error) + '</div>' : '') +
      '<button type="button" class="bd-btn" data-bd-submit' + (_state.busy ? ' disabled' : '') + '>' +
        (_state.busy ? 'Submitting…' : 'Submit transaction') +
      '</button>' +
      '<button type="button" class="bd-btn bd-btn-ghost" data-bd-back>Back</button>';
  }

  function _htmlPending() {
    var id = (_state.intent && _state.intent.intentId) || '';
    return '' +
      '<div class="bd-hdr"><div class="bd-title">💎 Buy Diamonds</div>' +
      '<button type="button" class="bd-close" data-bd-close aria-label="Close">✕</button></div>' +
      '<div class="bd-pending">✅ Transaction submitted — verifying on blockchain. Diamonds will be credited automatically within 30 minutes.</div>' +
      '<div class="bd-lbl">Intent ID</div>' +
      '<div class="bd-id">' + _esc(id) + '</div>' +
      '<button type="button" class="bd-btn" data-bd-close>Done</button>';
  }

  function _startCountdown(modal) {
    _clearCountdown();
    var el = modal.querySelector('#bd-countdown');
    var expiresAt = _state.intent && _state.intent.expiresAt;
    if (!el || !expiresAt) return;
    _state.countdownTimer = setInterval(function () {
      var live = document.getElementById('bd-countdown');
      if (!live) { _clearCountdown(); return; }
      live.textContent = _fmtCountdown(expiresAt);
    }, 1000);
  }

  function _wire(modal) {
    Array.prototype.forEach.call(modal.querySelectorAll('[data-bd-close]'), function (btn) {
      btn.addEventListener('click', closeBuyDiamondsModal);
    });
    Array.prototype.forEach.call(modal.querySelectorAll('[data-bd-pkg]'), function (btn) {
      btn.addEventListener('click', function () {
        _state.packageAmount = parseInt(btn.getAttribute('data-bd-pkg'), 10);
        _state.error = '';
        _render();
      });
    });
    var sel = modal.querySelector('#bd-crypto');
    if (sel) sel.addEventListener('change', function () {
      _state.cryptoSymbol = sel.value;
    });
    var confirmBtn = modal.querySelector('[data-bd-confirm]');
    if (confirmBtn) confirmBtn.addEventListener('click', _createIntent);
    var backBtn = modal.querySelector('[data-bd-back]');
    if (backBtn) backBtn.addEventListener('click', function () {
      _clearCountdown();
      _state.screen = 'select';
      _state.intent = null;
      _state.error = '';
      _render();
    });
    var copyBtn = modal.querySelector('[data-bd-copy]');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var addr = (_state.intent && _state.intent.wallet) || '';
      _copyText(addr, copyBtn);
    });
    var qrImg = modal.querySelector('#bd-qr-img');
    if (qrImg) qrImg.addEventListener('error', function () {
      qrImg.style.display = 'none';
      var fb = document.getElementById('bd-qr-fallback');
      if (fb) fb.style.display = 'block';
    });
    var submitBtn = modal.querySelector('[data-bd-submit]');
    if (submitBtn) submitBtn.addEventListener('click', _submitHash);
  }

  function _apiError(data, fallback) {
    if (!data) return fallback;
    if (data.error) return String(data.error);
    if (data.errors && data.errors.length) return data.errors.join(', ');
    return fallback;
  }

  async function _createIntent() {
    if (_state.busy) return;
    if (!_requireAuth()) return;
    var ids = _sessionIds();
    if (!ids.clubId || !ids.playerId) {
      _state.error = 'Missing club or account. Sign in again and retry.';
      _render();
      return;
    }
    var diamonds = _state.packageAmount;
    var symbol = String(_state.cryptoSymbol || 'USDT').toUpperCase();
    var network = _networkFor(symbol);
    var body = {
      clubId: ids.clubId,
      playerId: ids.playerId,
      packageAmountDiamonds: diamonds,
      expectedUsd: diamonds,
      cryptoSymbol: symbol,
      network: network,
      club_id: ids.clubId,
      player_id: ids.playerId,
      package_amount_diamonds: diamonds,
      expected_usd: diamonds,
      crypto_symbol: symbol
    };
    _state.busy = true;
    _state.error = '';
    _render();
    try {
      var resp = await _fetch('/api/crypto/deposits/create-intent', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      var data = {};
      try { data = await resp.json(); } catch (_e) { data = {}; }
      if (resp.status === 401 || resp.status === 403) {
        _state.busy = false;
        _promptLogin();
        return;
      }
      if (!resp.ok || !data.ok) {
        _state.busy = false;
        _state.error = _apiError(data, 'Could not create payment intent');
        _render();
        return;
      }
      _state.busy = false;
      _state.intent = {
        intentId: data.intentId,
        wallet: data.wallet,
        qrPayload: data.qrPayload,
        expiresAt: data.expiresAt,
        cryptoSymbol: data.cryptoSymbol || symbol,
        network: data.network || network
      };
      _state.screen = 'pay';
      _render();
    } catch (e) {
      _state.busy = false;
      _state.error = (e && e.message) || 'Network error';
      _render();
    }
  }

  async function _submitHash() {
    if (_state.busy) return;
    if (!_requireAuth()) return;
    var intent = _state.intent;
    if (!intent || !intent.intentId) {
      _state.error = 'No active payment intent';
      _render();
      return;
    }
    var inp = document.getElementById('bd-tx-hash');
    var txHash = inp ? String(inp.value || '').trim() : '';
    if (txHash.length < 10) {
      _state.error = 'Enter a valid transaction hash';
      _render();
      if (inp) inp.value = txHash;
      return;
    }
    _state.busy = true;
    _state.error = '';
    _render();
    var restored = document.getElementById('bd-tx-hash');
    if (restored) restored.value = txHash;
    try {
      var resp = await _fetch('/api/crypto/deposits/submit-hash', {
        method: 'POST',
        body: JSON.stringify({
          intentId: intent.intentId,
          txHash: txHash,
          intent_id: intent.intentId,
          tx_hash: txHash
        })
      });
      var data = {};
      try { data = await resp.json(); } catch (_e) { data = {}; }
      if (resp.status === 401 || resp.status === 403) {
        _state.busy = false;
        _promptLogin();
        return;
      }
      if (!resp.ok || !data.ok) {
        _state.busy = false;
        _state.error = _apiError(data, 'Could not submit transaction hash');
        _render();
        var again = document.getElementById('bd-tx-hash');
        if (again) again.value = txHash;
        return;
      }
      _state.busy = false;
      _state.screen = 'pending';
      _clearCountdown();
      _render();
    } catch (e) {
      _state.busy = false;
      _state.error = (e && e.message) || 'Network error';
      _render();
    }
  }

  function openBuyDiamondsModal() {
    if (!_requireAuth()) return;
    _ensureStyles();
    _clearCountdown();
    _state.screen = 'select';
    _state.intent = null;
    _state.error = '';
    _state.busy = false;
    if (!_state.packageAmount) _state.packageAmount = 100;
    if (!_state.cryptoSymbol) _state.cryptoSymbol = 'USDT';
    var existing = _root();
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'pb-diamonds-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Buy Diamonds');
    overlay.innerHTML = '<div id="pb-diamonds-modal"></div>';
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeBuyDiamondsModal();
    });
    document.body.appendChild(overlay);
    _render();
  }

  global.openBuyDiamondsModal = openBuyDiamondsModal;
  global.closeBuyDiamondsModal = closeBuyDiamondsModal;
})(typeof window !== 'undefined' ? window : this);
