/**
 * Beta polish helpers — console gating, API error normalize, onboarding,
 * feedback payload (no secrets), release id, dead-feature gates.
 * Safe to include from player / lobby / host pages.
 */
(function (global) {
  'use strict';

  var ONBOARD_KEY = 'pb-beta-onboarding-v1';
  var FEEDBACK_DRAFT_KEY = 'pb-beta-feedback-draft';
  var _warnOnce = {};

  function _pbIsDebug() {
    try {
      if (new URLSearchParams(location.search).get('debug') === '1') return true;
      if (localStorage.getItem('pb-debug') === '1') return true;
    } catch (_e) {}
    return false;
  }

  /** Debug-only warn — keeps prod console clean without swallowing real errors. */
  function _pbDebugWarn() {
    if (!_pbIsDebug()) return;
    try { console.warn.apply(console, arguments); } catch (_e) {}
  }

  /** Rate-limited warn (once per key per page load). Meaningful, not spam. */
  function _pbWarnOnce(key, msg) {
    if (_warnOnce[key]) return;
    _warnOnce[key] = true;
    try { console.warn(msg); } catch (_e) {}
  }

  /**
   * Normalize inconsistent BE error shapes into a common FE contract.
   * Recommended contract (docs/API_ERROR_CONTRACT.md):
   *   { ok:false, error:"snake_case_code", message:"Human readable", details?:any }
   */
  function _pbNormalizeApiError(data, status) {
    data = (data && typeof data === 'object') ? data : {};
    var code = null;
    if (typeof data.error === 'string' && data.error.indexOf(' ') < 0) code = data.error;
    if (!code && typeof data.code === 'string') code = data.code;
    if (!code && typeof data.error_code === 'string') code = data.error_code;
    if (!code && data.error && typeof data.error === 'object') {
      code = data.error.code || data.error.error || null;
    }

    var message = null;
    if (typeof data.message === 'string' && data.message.trim()) message = data.message.trim();
    if (!message && typeof data.error === 'string' && data.error.indexOf(' ') >= 0) message = data.error;
    if (!message && data.error && typeof data.error === 'object' && data.error.message) {
      message = String(data.error.message);
    }
    if (!message && Array.isArray(data.errors) && data.errors.length) {
      message = data.errors.map(function (e) {
        if (typeof e === 'string') return e;
        if (e && typeof e === 'object') return e.message || e.code || '';
        return '';
      }).filter(Boolean).join(', ');
    }
    if (!message && code) message = String(code).replace(/_/g, ' ');
    if (!message && status) message = 'Request failed (' + status + ')';
    if (!message) message = 'Something went wrong';

    return {
      ok: false,
      error: code ? String(code) : 'unknown_error',
      message: String(message),
      status: status != null ? status : (data.status != null ? data.status : null),
      details: data.details != null ? data.details : (data.errors != null ? data.errors : null)
    };
  }

  function _pbErrorToastMessage(data, status) {
    return _pbNormalizeApiError(data, status).message;
  }

  /** Strip secrets from query strings for feedback / diagnostics. */
  function _pbSafeRoute() {
    try {
      var loc = global.location || {};
      var path = loc.pathname || '';
      var q = String(loc.search || '');
      q = q
        .replace(/([?&])(token|access_token|refresh_token|authorization|password|pass|secret|api[_-]?key)=[^&]*/gi, '$1$2=[redacted]')
        .replace(/([?&])(pb-sports-token|pb-session-token)=[^&]*/gi, '$1$2=[redacted]');
      return path + q;
    } catch (_e) {
      return '(unknown)';
    }
  }

  function _pbBuildFeedbackPayload(userNote) {
    var sport = null;
    try {
      if (typeof global._currentSport !== 'undefined') sport = global._currentSport;
    } catch (_e) {}
    var role = null;
    try { role = global.localStorage && global.localStorage.getItem('pb-actor-role') || null; } catch (_e2) {}
    var loc = global.location || {};
    var nav = global.navigator || {};
    var win = global.window || global;
    return {
      note: String(userNote || '').slice(0, 2000),
      route: _pbSafeRoute(),
      host: loc.hostname || '',
      viewport: {
        w: win.innerWidth != null ? win.innerWidth : null,
        h: win.innerHeight != null ? win.innerHeight : null,
        dpr: win.devicePixelRatio || 1
      },
      sport: sport,
      build: {
        sha: global.PBS_BUILD_SHA || null,
        date: global.PBS_BUILD_DATE || null
      },
      role: role,
      ua: String(nav.userAgent || '').slice(0, 180),
      ts: new Date().toISOString()
      // Intentionally omitted: tokens, Authorization, passwords, full localStorage
    };
  }

  function _pbCopyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; });
      }
    } catch (_e) {}
    return Promise.resolve(false).then(function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (_e2) { return false; }
    });
  }

  function _pbOpenFeedbackModal() {
    var existing = document.getElementById('pb-feedback-overlay');
    if (existing) existing.remove();
    var ov = document.createElement('div');
    ov.id = 'pb-feedback-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.85);display:flex;align-items:flex-end;justify-content:center';
    var meta = _pbBuildFeedbackPayload('');
    ov.innerHTML =
      '<div style="background:#0a0a0a;color:#fff;width:100%;max-width:430px;max-height:90vh;border-radius:20px 20px 0 0;border:1px solid #252525;display:flex;flex-direction:column">' +
        '<div style="padding:14px 16px;border-bottom:1px solid #252525;display:flex;justify-content:space-between;align-items:center">' +
          '<div><div style="font-size:0.62rem;color:#888;text-transform:uppercase;letter-spacing:0.5px">Beta</div>' +
          '<div style="font-size:1rem;font-weight:900">Report a Problem</div></div>' +
          '<button type="button" id="pb-fb-close" style="background:#1c1c1c;border:1px solid #252525;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer">✕</button>' +
        '</div>' +
        '<div style="flex:1;overflow:auto;padding:16px">' +
          '<div style="font-size:0.78rem;color:#aaa;margin-bottom:10px;line-height:1.45">Describe what went wrong. We attach route, viewport, sport, and build — never tokens or passwords.</div>' +
          '<textarea id="pb-fb-note" rows="5" placeholder="What happened? What did you expect?" style="width:100%;box-sizing:border-box;background:#141414;border:1px solid #252525;border-radius:12px;padding:12px;color:#fff;font-size:0.85rem;resize:vertical;outline:none"></textarea>' +
          '<div style="margin-top:12px;padding:10px 12px;background:#141414;border:1px solid #252525;border-radius:10px;font-size:0.65rem;color:#777;font-family:ui-monospace,monospace;line-height:1.5">' +
            'route: ' + String(meta.route).replace(/</g, '&lt;') + '<br>' +
            'viewport: ' + meta.viewport.w + '×' + meta.viewport.h + '<br>' +
            'sport: ' + (meta.sport || '—') + '<br>' +
            'build: ' + (meta.build.sha || 'unknown') +
          '</div>' +
          '<div style="font-size:0.62rem;color:#555;margin-top:8px">No backend inbox yet — copies a safe report you can paste to the team.</div>' +
        '</div>' +
        '<div style="padding:12px 16px 18px;border-top:1px solid #252525;display:flex;gap:8px">' +
          '<button type="button" id="pb-fb-copy" style="flex:1;padding:14px;background:#00c2ff;border:none;color:#000;border-radius:12px;font-size:0.88rem;font-weight:900;cursor:pointer">Copy report</button>' +
        '</div>' +
      '</div>';
    (document.documentElement || document.body).appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    ov.querySelector('#pb-fb-close').addEventListener('click', function () { ov.remove(); });
    ov.querySelector('#pb-fb-copy').addEventListener('click', function () {
      var note = (ov.querySelector('#pb-fb-note') || {}).value || '';
      var payload = _pbBuildFeedbackPayload(note);
      try { localStorage.setItem(FEEDBACK_DRAFT_KEY, JSON.stringify(payload)); } catch (_e) {}
      var text = 'PocketBooks Beta Problem Report\n' + JSON.stringify(payload, null, 2);
      _pbCopyText(text).then(function (ok) {
        if (typeof global.showToast === 'function') {
          global.showToast(ok ? 'Report copied — paste to the team' : 'Could not copy — select and copy manually', ok ? 'success' : 'warning');
        }
        if (ok) ov.remove();
      });
    });
  }

  function _pbOnboardingDone() {
    try { return localStorage.getItem(ONBOARD_KEY) === 'done'; } catch (_e) { return false; }
  }

  function _pbMarkOnboardingDone() {
    try { localStorage.setItem(ONBOARD_KEY, 'done'); } catch (_e) {}
  }

  function _pbRole() {
    try { return String(localStorage.getItem('pb-actor-role') || '').toLowerCase(); } catch (_e) { return ''; }
  }

  function _pbIsHostContext() {
    var role = _pbRole();
    if (role === 'host' || role === 'owner' || role === 'admin' || role === 'full_admin') return true;
    try {
      var path = String(location.pathname || '');
      if (/index\.html$/i.test(path) || path === '/' || path.endsWith('/')) {
        // host dashboard is index.html in this app
        if (document.getElementById('settlements-section') || document.querySelector('.hrc-kpi-val')) return true;
      }
    } catch (_e2) {}
    return false;
  }

  function _pbPlayerSteps() {
    return [
      { id: 'bankroll', title: 'Bankroll', body: 'Your available balance is in the header. It comes from the club ledger — not a local guess.' },
      { id: 'sport', title: 'Pick a sport', body: 'Use the sport tabs to open lines. Live games appear under Live.' },
      { id: 'addbet', title: 'Add a bet', body: 'Tap odds to build a slip. Review stake before confirming. (Beta: avoid real money tests on prod.)' },
      { id: 'mybets', title: 'My Bets', body: 'Open My Bets to track open and settled tickets.' },
      { id: 'roles', title: 'Host vs Player', body: 'Players wager in the sportsbook. Hosts run the club from the Host dashboard (risk, players, settlement ledger).' }
    ];
  }

  function _pbHostSteps() {
    return [
      { id: 'home', title: 'Host overview', body: 'Home shows club risk and activity. Read-only checks first.' },
      { id: 'players', title: 'Players', body: 'Review members, limits, and join requests from the Players tab.' },
      { id: 'settle', title: 'Settlement ledger', body: 'Settle is a recording ledger for hosts. Settlement recording stays OFF until owner bootstrap — do not treat it as live payouts yet.' },
      { id: 'roles', title: 'Host vs Player', body: 'Use Lines to preview the player sportsbook. Financial writes on production are out of scope for beta smoke.' }
    ];
  }

  function _pbOpenOnboarding(force) {
    if (!force && _pbOnboardingDone()) return;
    var existing = document.getElementById('pb-onboard-overlay');
    if (existing) existing.remove();
    var host = _pbIsHostContext();
    var steps = host ? _pbHostSteps() : _pbPlayerSteps();
    var idx = 0;
    var ov = document.createElement('div');
    ov.id = 'pb-onboard-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.72);display:flex;align-items:flex-end;justify-content:center;padding:0';
    function paint() {
      var s = steps[idx];
      ov.innerHTML =
        '<div style="background:#0a0a0a;color:#fff;width:100%;max-width:430px;border-radius:20px 20px 0 0;border:1px solid #252525;padding:18px 16px 20px">' +
          '<div style="font-size:0.62rem;color:#00c2ff;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">Beta tip ' + (idx + 1) + '/' + steps.length + (host ? ' · Host' : ' · Player') + '</div>' +
          '<div style="font-size:1.05rem;font-weight:900;margin-bottom:8px">' + s.title + '</div>' +
          '<div style="font-size:0.82rem;color:#aaa;line-height:1.5;margin-bottom:16px">' + s.body + '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button type="button" id="pb-ob-skip" style="flex:1;padding:12px;background:#1c1c1c;border:1px solid #333;color:#888;border-radius:12px;font-weight:800;cursor:pointer">Skip</button>' +
            '<button type="button" id="pb-ob-next" style="flex:2;padding:12px;background:#00c2ff;border:none;color:#000;border-radius:12px;font-weight:900;cursor:pointer">' +
              (idx >= steps.length - 1 ? 'Got it' : 'Next') +
            '</button>' +
          '</div>' +
        '</div>';
      ov.querySelector('#pb-ob-skip').onclick = function () { _pbMarkOnboardingDone(); ov.remove(); };
      ov.querySelector('#pb-ob-next').onclick = function () {
        if (idx >= steps.length - 1) { _pbMarkOnboardingDone(); ov.remove(); return; }
        idx++;
        paint();
      };
    }
    paint();
    (document.documentElement || document.body).appendChild(ov);
  }

  function _pbBuildShaLabel() {
    var sha = global.PBS_BUILD_SHA || 'unknown';
    var d = global.PBS_BUILD_DATE || '';
    var shortDate = '';
    try {
      if (d) shortDate = new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_e) {}
    return { sha: sha, dateLabel: shortDate || d || '—' };
  }

  /** Features gated for beta (BROKEN / DEAD / NOT IMPLEMENTED). */
  var BETA_HIDDEN_FEATURES = {
    predictions: { status: 'NOT_IMPLEMENTED', reason: 'Prediction markets placeholder only' },
    search_tab: { status: 'NOT_IMPLEMENTED', reason: 'Global search coming soon toast only' },
    mkt_props_specials: { status: 'NOT_IMPLEMENTED', reason: 'Legacy markets modal props/specials tabs' },
    settlement_recording: { status: 'OFF', reason: 'SETTLEMENT_RECORDING_ENABLED must stay OFF' },
    crypto_bottom_nav: { status: 'REMOVED', reason: 'Diamonds flow replaces crypto tab' }
  };

  function _pbIsBetaFeatureHidden(key) {
    return !!BETA_HIDDEN_FEATURES[key];
  }

  function _pbSettingsExtrasHtml() {
    var b = _pbBuildShaLabel();
    return '' +
      '<div style="background:#141414;border:1px solid #252525;border-radius:12px;padding:14px;margin-bottom:12px" id="ps-about-box">' +
        '<div style="font-size:0.62rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">About / Developer</div>' +
        '<div style="font-size:0.78rem;color:#aaa">Build <span style="color:#fff;font-family:ui-monospace,monospace">' + b.sha + '</span></div>' +
        '<div style="font-size:0.62rem;color:#555;margin-top:4px">' + String(b.dateLabel).replace(/</g, '&lt;') + '</div>' +
        '<button type="button" id="ps-feedback-btn" style="width:100%;margin-top:12px;padding:12px;background:#1c1c1c;border:1px solid #444;color:#eee;border-radius:10px;font-size:0.82rem;font-weight:800;cursor:pointer">Report a Problem</button>' +
        '<button type="button" id="ps-onboard-btn" style="width:100%;margin-top:8px;padding:12px;background:#1c1c1c;border:1px solid #333;color:#aaa;border-radius:10px;font-size:0.78rem;font-weight:700;cursor:pointer">Replay beta tips</button>' +
      '</div>';
  }

  function _pbWireSettingsExtras(root) {
    if (!root) return;
    var fb = root.querySelector('#ps-feedback-btn');
    if (fb) fb.addEventListener('click', function () { _pbOpenFeedbackModal(); });
    var ob = root.querySelector('#ps-onboard-btn');
    if (ob) ob.addEventListener('click', function () { _pbOpenOnboarding(true); });
  }

  function _pbMaybeStartOnboarding() {
    try {
      if (_pbOnboardingDone()) return;
      // Don't interrupt session-expired / preview boot storms
      if (document.getElementById('session-expired-modal')) return;
      setTimeout(function () { _pbOpenOnboarding(false); }, 1200);
    } catch (_e) {}
  }

  // Exports
  global._pbIsDebug = _pbIsDebug;
  global._pbDebugWarn = _pbDebugWarn;
  global._pbWarnOnce = _pbWarnOnce;
  global._pbNormalizeApiError = _pbNormalizeApiError;
  global._pbErrorToastMessage = _pbErrorToastMessage;
  global._pbBuildFeedbackPayload = _pbBuildFeedbackPayload;
  global._pbOpenFeedbackModal = _pbOpenFeedbackModal;
  global._pbOpenOnboarding = _pbOpenOnboarding;
  global._pbBuildShaLabel = _pbBuildShaLabel;
  global._pbSettingsExtrasHtml = _pbSettingsExtrasHtml;
  global._pbWireSettingsExtras = _pbWireSettingsExtras;
  global._pbMaybeStartOnboarding = _pbMaybeStartOnboarding;
  global._pbIsBetaFeatureHidden = _pbIsBetaFeatureHidden;
  global.BETA_HIDDEN_FEATURES = BETA_HIDDEN_FEATURES;
})(typeof window !== 'undefined' ? window : globalThis);
