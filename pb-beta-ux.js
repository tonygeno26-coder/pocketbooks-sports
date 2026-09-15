/**
 * PocketBooks beta onboarding + feedback UX.
 * Safe context only — never attach JWTs, tokens, passwords, or secrets.
 * Persistence: POST /api/feedback; success only after server confirmation.
 */
(function (global) {
  'use strict';

  var STORAGE_ONBOARD = 'pb-beta-onboard-v1';
  var STORAGE_FEEDBACK_Q = 'pb-beta-feedback-queue';
  var MAX_QUEUE = 25;
  var MAX_MSG = 1200;
  var FEEDBACK_PATH = '/api/feedback';

  var FEEDBACK_CATEGORIES = [
    { id: 'bug', label: 'Bug' },
    { id: 'ux', label: 'Confusing / UX' },
    { id: 'odds', label: 'Odds / markets' },
    { id: 'ticket', label: 'Ticket / grading' },
    { id: 'other', label: 'Other' }
  ];

  var ERROR_COPY = {
    session_expired: {
      title: 'Session expired',
      body: 'Sign in again from the lobby to keep betting securely.'
    },
    too_many_requests: {
      title: 'Slow down',
      body: 'Too many requests. Wait a minute, then return to the lobby and sign in again.'
    },
    markets_unavailable: {
      title: 'Markets unavailable',
      body: 'Lines aren’t posting right now. Try another sport or check back shortly.'
    },
    bet_rejected: {
      title: 'Bet not placed',
      body: 'Your ticket wasn’t accepted. Adjust the slip and try again — nothing was charged.'
    },
    stale_odds: {
      title: 'Odds moved',
      body: 'Review the updated line, then place again if you still want the bet.'
    },
    membership_pending: {
      title: 'Waiting for host approval',
      body: 'You can’t place bets until the host approves your join request.'
    },
    network: {
      title: 'Connection issue',
      body: 'Check your network and retry. If you just placed a bet, open Recent Bets before trying again.'
    },
    results_unavailable: {
      title: 'Results unavailable',
      body: 'We couldn’t refresh results. Your tickets were not changed locally — try again in a moment.'
    }
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, kind) {
    if (typeof global.showToast === 'function') {
      try { global.showToast(msg, kind || 'info'); return; } catch (_e) {}
    }
    try { console.info('[pb-beta-ux]', msg); } catch (_e2) {}
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_e) {
      return fallback;
    }
  }

  function writeJson(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_e) {}
  }

  /** Strip secrets from any accidental payload fields. */
  function sanitizeContext(ctx) {
    var out = {};
    var src = ctx && typeof ctx === 'object' ? ctx : {};
    var allow = [
      'page', 'path', 'viewport', 'userAgentShort', 'clubId', 'ticketId',
      'ticketStatus', 'market', 'sport', 'betType', 'appVersion', 'ts',
      'category', 'source'
    ];
    allow.forEach(function (k) {
      if (src[k] != null && src[k] !== '') out[k] = src[k];
    });
    // Never include these even if passed
    ['token', 'jwt', 'authorization', 'password', 'secret', 'session',
      'pb-sports-token', 'pb-session-token', 'accessToken', 'refreshToken'
    ].forEach(function (bad) { delete out[bad]; });
    return out;
  }

  function buildSafeContext(extra) {
    var clubId = null;
    try {
      var club = JSON.parse(localStorage.getItem('pb-club') || localStorage.getItem('pb-active-club') || 'null');
      if (club) clubId = club.id || club.clubId || null;
    } catch (_e) {}
    var ua = '';
    try { ua = String(navigator.userAgent || '').slice(0, 80); } catch (_e2) {}
    var base = {
      page: (document.title || '').slice(0, 80),
      path: (location.pathname || '').split('/').pop() || '',
      viewport: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
      userAgentShort: ua,
      clubId: clubId ? String(clubId) : null,
      ts: new Date().toISOString(),
      appVersion: 'beta-ux-1'
    };
    return sanitizeContext(Object.assign(base, extra || {}));
  }

  function queueFeedback(entry) {
    var q = readJson(STORAGE_FEEDBACK_Q, []);
    if (!Array.isArray(q)) q = [];
    q.unshift(entry);
    if (q.length > MAX_QUEUE) q = q.slice(0, MAX_QUEUE);
    writeJson(STORAGE_FEEDBACK_Q, q);
    return entry;
  }

  function getAuthToken() {
    try {
      return localStorage.getItem('pb-sports-token')
        || localStorage.getItem('pb-session-token')
        || '';
    } catch (_e) {
      return '';
    }
  }

  function getApiBase() {
    try {
      if (typeof global.API === 'string' && global.API) return global.API.replace(/\/$/, '');
    } catch (_e) {}
    try {
      if (typeof global.window !== 'undefined' && typeof global.window.API === 'string' && global.window.API) {
        return global.window.API.replace(/\/$/, '');
      }
    } catch (_e2) {}
    return '';
  }

  /** Submit feedback to server. Never puts tokens/secrets in the body. */
  function submitFeedback(entry) {
    var token = getAuthToken();
    if (!token) {
      return Promise.resolve({
        ok: false,
        error: 'unauthenticated',
        retryable: true,
        message: 'Sign in again, then retry sending feedback.'
      });
    }
    var base = getApiBase();
    var url = (base || '') + FEEDBACK_PATH;
    var body = {
      category: entry.category,
      message: entry.message,
      context: sanitizeContext(entry.context || {})
    };
    // Never mirror auth material into the JSON body.
    delete body.token;
    delete body.jwt;
    delete body.authorization;
    delete body.password;

    var headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
    try {
      var clubId = body.context && body.context.clubId;
      if (clubId) headers['X-Club-Id'] = String(clubId);
    } catch (_eHdr) {}

    return fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    }).then(function (resp) {
      return resp.json().catch(function () { return {}; }).then(function (data) {
        if (resp.status === 429) {
          return {
            ok: false,
            error: 'rate_limited',
            retryable: true,
            message: 'Too many reports. Wait a bit, then try again.'
          };
        }
        if (!resp.ok || !data || data.ok !== true || !data.id) {
          var err = (data && data.error) || ('http_' + resp.status);
          var msg = 'Couldn’t send feedback. Check your connection and try again.';
          if (err === 'unauthenticated' || err === 'invalid_token' || err === 'session_revoked'
              || err === 'expired_token' || err === 'legacy_token_missing_jti') {
            msg = 'Session expired. Sign in again, then retry.';
          } else if (err === 'ticket_not_allowed') {
            msg = 'That ticket can’t be reported from this account.';
          } else if (err === 'invalid_category' || err === 'message_required' || err === 'message_too_long') {
            msg = 'Check your message and try again.';
          }
          return { ok: false, error: err, retryable: true, message: msg };
        }
        return { ok: true, id: String(data.id) };
      });
    }).catch(function () {
      return {
        ok: false,
        error: 'network',
        retryable: true,
        message: 'Connection issue. Feedback was not sent — try again.'
      };
    });
  }

  function closeOverlay(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (global.PbA11y) {
      try { PbA11y.deactivate(el); } catch (_e) {}
    }
    el.remove();
  }

  function openSheet(opts) {
    opts = opts || {};
    var id = opts.id || 'pb-beta-sheet';
    closeOverlay(id);
    var ov = document.createElement('div');
    ov.id = id;
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', opts.title || 'Dialog');
    ov.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483646!important;background:rgba(0,0,0,0.82)!important;display:flex!important;align-items:flex-end!important;justify-content:center!important;padding:0!important;';
    ov.innerHTML =
      '<div style="background:#0a101a;color:#f4f7fb;width:100%;max-width:430px;max-height:92vh;border-radius:20px 20px 0 0;border:1px solid #1d2b42;display:flex;flex-direction:column;box-sizing:border-box">' +
        '<div style="padding:14px 16px;border-bottom:1px solid #1d2b42;display:flex;justify-content:space-between;align-items:center;gap:10px">' +
          '<div><div style="font-size:0.62rem;color:#8b93a7;text-transform:uppercase;letter-spacing:0.5px">' + esc(opts.kicker || 'Beta') + '</div>' +
          '<div style="font-size:1rem;font-weight:900">' + esc(opts.title || '') + '</div></div>' +
          '<button type="button" data-pb-beta-close style="background:#141c2c;border:1px solid #1d2b42;color:#fff;width:34px;height:34px;border-radius:50%;font-size:1rem;cursor:pointer" aria-label="Close">✕</button>' +
        '</div>' +
        '<div style="flex:1;overflow-y:auto;padding:16px">' + (opts.bodyHtml || '') + '</div>' +
        (opts.footerHtml ? '<div style="padding:12px 16px 18px;border-top:1px solid #1d2b42">' + opts.footerHtml + '</div>' : '') +
      '</div>';
    (document.documentElement || document.body).appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov) closeOverlay(id);
    });
    var closeBtn = ov.querySelector('[data-pb-beta-close]');
    if (closeBtn) closeBtn.addEventListener('click', function () { closeOverlay(id); });
    if (global.PbA11y) {
      try {
        PbA11y.activate(ov, {
          onEscape: function () { closeOverlay(id); },
          initialFocus: opts.initialFocus || '[data-pb-beta-close]'
        });
      } catch (_e) {}
    }
    return ov;
  }

  function categoryChipsHtml(selected) {
    return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px" role="group" aria-label="Feedback category">' +
      FEEDBACK_CATEGORIES.map(function (c) {
        var on = c.id === selected;
        return '<button type="button" data-fb-cat="' + esc(c.id) + '" style="padding:8px 12px;border-radius:999px;font-size:0.72rem;font-weight:800;cursor:pointer;border:1px solid ' +
          (on ? '#3d8bfd' : '#1d2b42') + ';background:' + (on ? 'rgba(61,139,253,0.18)' : '#101a2e') + ';color:' +
          (on ? '#9ec5ff' : '#94a3b8') + '">' + esc(c.label) + '</button>';
      }).join('') +
      '</div>';
  }

  function openFeedbackModal(opts) {
    opts = opts || {};
    var category = opts.category || 'bug';
    var prefill = opts.message || '';
    var contextExtra = opts.context || {};
    var source = opts.source || 'settings';
    var leadHtml = opts.leadHtml || '';

    var body =
      leadHtml +
      '<p style="font-size:0.78rem;color:#94a3b8;line-height:1.45;margin:0 0 12px">Tell us what went wrong. We attach only safe diagnostics (page, club id, viewport) — never passwords or tokens.</p>' +
      '<div style="font-size:0.62rem;color:#8b93a7;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Category</div>' +
      '<div id="pb-fb-cats">' + categoryChipsHtml(category) + '</div>' +
      '<div style="font-size:0.62rem;color:#8b93a7;text-transform:uppercase;letter-spacing:0.5px;margin:4px 0 8px">Message</div>' +
      '<textarea id="pb-fb-msg" maxlength="' + MAX_MSG + '" rows="5" placeholder="What happened? What did you expect?" style="width:100%;box-sizing:border-box;background:#070b12;border:1px solid #1d2b42;border-radius:12px;padding:12px;color:#f4f7fb;font-size:0.85rem;line-height:1.45;resize:vertical;min-height:110px;outline:none">' + esc(prefill) + '</textarea>' +
      '<div id="pb-fb-ctx" style="margin-top:12px;font-size:0.68rem;color:#64748b;line-height:1.4"></div>';

    var footer =
      '<button type="button" id="pb-fb-submit" style="width:100%;padding:14px;background:#3d8bfd;border:none;color:#fff;border-radius:12px;font-size:0.92rem;font-weight:900;cursor:pointer">Send Feedback</button>';

    var ov = openSheet({
      id: 'pb-feedback-overlay',
      kicker: 'Support',
      title: opts.title || 'Send Feedback',
      bodyHtml: body,
      footerHtml: footer,
      initialFocus: '#pb-fb-msg'
    });

    function refreshCtxPreview() {
      var ctx = buildSafeContext(Object.assign({ source: source, category: category }, contextExtra));
      var el = ov.querySelector('#pb-fb-ctx');
      if (!el) return;
      el.textContent = 'Attached: ' + [
        ctx.path && ('page=' + ctx.path),
        ctx.clubId && ('club=' + String(ctx.clubId).slice(0, 8) + '…'),
        ctx.ticketId && ('ticket=' + ctx.ticketId),
        ctx.viewport && ('screen=' + ctx.viewport)
      ].filter(Boolean).join(' · ');
    }

    function wireCats() {
      Array.prototype.forEach.call(ov.querySelectorAll('[data-fb-cat]'), function (btn) {
        btn.onclick = function () {
          category = btn.getAttribute('data-fb-cat') || 'other';
          var wrap = ov.querySelector('#pb-fb-cats');
          if (wrap) wrap.innerHTML = categoryChipsHtml(category);
          wireCats();
          refreshCtxPreview();
        };
      });
    }
    wireCats();
    refreshCtxPreview();

    var submit = ov.querySelector('#pb-fb-submit');
    if (submit) {
      submit.addEventListener('click', function () {
        if (submit.getAttribute('data-busy') === '1') return;
        var ta = ov.querySelector('#pb-fb-msg');
        var msg = ta ? String(ta.value || '').trim() : '';
        if (!msg) {
          toast('Add a short message so we can help.', 'warning');
          return;
        }
        if (msg.length > MAX_MSG) msg = msg.slice(0, MAX_MSG);
        var entry = {
          category: category,
          message: msg,
          context: buildSafeContext(Object.assign({ source: source, category: category }, contextExtra)),
          createdAt: new Date().toISOString()
        };
        submit.setAttribute('data-busy', '1');
        submit.textContent = 'Sending…';
        submit.style.opacity = '0.75';
        submitFeedback(entry).then(function (result) {
          submit.removeAttribute('data-busy');
          submit.textContent = 'Send Feedback';
          submit.style.opacity = '1';
          if (!result || !result.ok) {
            toast((result && result.message) || 'Couldn’t send feedback. Try again.', 'warning');
            return;
          }
          // Keep a local receipt only after server confirmation (not a fake success queue).
          queueFeedback({
            id: result.id,
            category: entry.category,
            message: entry.message,
            context: entry.context,
            createdAt: entry.createdAt,
            status: 'sent',
            serverId: result.id
          });
          closeOverlay('pb-feedback-overlay');
          toast('Thanks — feedback sent.', 'success');
        });
      });
    }
  }

  function openReportBetIssue(ticket) {
    ticket = ticket || {};
    var ticketId = ticket.id || ticket.ticketId || '';
    var status = ticket.status || ticket.displayStatus || '';
    var market = '';
    var legs = Array.isArray(ticket.selections) ? ticket.selections
      : (Array.isArray(ticket.legs) ? ticket.legs : []);
    if (legs.length) {
      var leg0 = legs[0] || {};
      market = leg0.market || leg0.marketType || leg0.betType || leg0.pick || '';
    }
    if (!market) market = ticket.market || ticket.type || ticket.betType || 'Bet';

    var leadHtml =
      '<div data-pb-bet-summary="1" style="background:#101a2e;border:1px solid #1d2b42;border-radius:12px;padding:12px;margin-bottom:14px;font-size:0.78rem;line-height:1.5">' +
        '<div style="display:flex;justify-content:space-between;gap:8px"><span style="color:#8b93a7">Ticket</span><span style="font-weight:800;word-break:break-all">' + esc(ticketId || '—') + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px"><span style="color:#8b93a7">Status</span><span style="font-weight:800">' + esc(String(status || '—').toUpperCase()) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px"><span style="color:#8b93a7">Market</span><span style="font-weight:800;text-align:right;max-width:62%">' + esc(market) + '</span></div>' +
      '</div>' +
      '<p style="font-size:0.78rem;color:#94a3b8;line-height:1.45;margin:0 0 10px">Support only — reporting does not cancel, grade, or change this ticket.</p>';

    openFeedbackModal({
      title: 'Report a Bet Issue',
      category: 'ticket',
      source: 'report_bet',
      leadHtml: leadHtml,
      context: {
        ticketId: ticketId ? String(ticketId) : null,
        ticketStatus: status ? String(status).toLowerCase() : null,
        market: market ? String(market).slice(0, 80) : null,
        betType: ticket.type || ticket.betType || ticket.bet_type || null
      }
    });
  }

  function hasSeenOnboarding() {
    try { return localStorage.getItem(STORAGE_ONBOARD) === '1'; } catch (_e) { return true; }
  }

  function markOnboardingSeen() {
    try { localStorage.setItem(STORAGE_ONBOARD, '1'); } catch (_e) {}
  }

  function mountOnboardingTip(host) {
    if (!host || hasSeenOnboarding()) return null;
    if (document.getElementById('pb-onboard-tip')) return null;
    var tip = document.createElement('div');
    tip.id = 'pb-onboard-tip';
    tip.setAttribute('role', 'region');
    tip.setAttribute('aria-label', 'Quick tips');
    tip.className = 'pb-onboard-tip';
    tip.innerHTML =
      '<div class="pb-onboard-tip-inner">' +
        '<div class="pb-onboard-kicker">Quick start</div>' +
        '<div class="pb-onboard-title">Tap a line to build a slip. Place from the bet slip. Track tickets in Recent Bets.</div>' +
        '<div class="pb-onboard-actions">' +
          '<button type="button" class="pb-onboard-dismiss" data-pb-onboard-dismiss>Got it</button>' +
          '<button type="button" class="pb-onboard-feedback" data-pb-onboard-fb>Send feedback</button>' +
        '</div>' +
      '</div>';
    host.insertBefore(tip, host.firstChild);
    tip.querySelector('[data-pb-onboard-dismiss]').addEventListener('click', function () {
      markOnboardingSeen();
      tip.remove();
    });
    tip.querySelector('[data-pb-onboard-fb]').addEventListener('click', function () {
      openFeedbackModal({ source: 'onboarding', category: 'ux' });
    });
    return tip;
  }

  function ensureOnboardingStyles() {
    if (document.getElementById('pb-beta-ux-css')) return;
    var style = document.createElement('style');
    style.id = 'pb-beta-ux-css';
    style.textContent =
      '.pb-onboard-tip{margin:10px 12px 6px;}' +
      '.pb-onboard-tip-inner{background:linear-gradient(180deg,#122038,#0d1626);border:1px solid #243552;border-radius:14px;padding:12px 14px;}' +
      '.pb-onboard-kicker{font-size:0.62rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#7eb0ff;margin-bottom:4px}' +
      '.pb-onboard-title{font-size:0.8rem;font-weight:700;color:#e8eef8;line-height:1.4;margin-bottom:10px}' +
      '.pb-onboard-actions{display:flex;gap:8px;flex-wrap:wrap}' +
      '.pb-onboard-dismiss,.pb-onboard-feedback{min-height:40px;padding:8px 14px;border-radius:10px;font-size:0.75rem;font-weight:800;cursor:pointer}' +
      '.pb-onboard-dismiss{background:#3d8bfd;border:none;color:#fff}' +
      '.pb-onboard-feedback{background:transparent;border:1px solid #2a3d5c;color:#9ec5ff}' +
      '.pb-report-bet-btn{display:block;width:100%;margin-top:8px;padding:10px 12px;background:transparent;border:1px dashed #2a3d5c;color:#9ec5ff;border-radius:10px;font-size:0.72rem;font-weight:800;cursor:pointer;text-align:center}' +
      '.pb-report-bet-btn:hover{border-color:#3d8bfd}' +
      '.bet-menu-item.bet-menu-item--report{color:#9ec5ff!important;border-top:1px solid #252525}' +
      '.pb-results-empty{text-align:center;padding:22px 16px;margin:0 16px 12px;background:#101a2e;border:1px solid #1d2b42;border-radius:14px}' +
      '.pb-results-empty-title{font-size:0.95rem;font-weight:900;color:#f4f7fb;margin-bottom:6px}' +
      '.pb-results-empty-sub{font-size:0.78rem;color:#8b93a7;line-height:1.45}' +
      '@media (min-width:768px){.pb-onboard-tip{max-width:560px;margin-left:auto;margin-right:auto}}' +
      '@media (min-width:1100px){.pb-onboard-tip{max-width:720px}}';
    document.head.appendChild(style);
  }

  function initPlayerOnboarding() {
    ensureOnboardingStyles();
    var host = document.getElementById('sportsbook-section');
    if (!host) return;
    mountOnboardingTip(host);
  }

  function friendlyError(code, fallback) {
    var key = String(code || '').toLowerCase();
    if (ERROR_COPY[key]) return ERROR_COPY[key];
    return { title: 'Something went wrong', body: fallback || 'Please try again.' };
  }

  function mapBetRejectMessage(code, userMessage) {
    if (userMessage) return String(userMessage);
    var c = String(code || '').toLowerCase();
    var map = {
      insufficient_balance: 'Insufficient balance for this stake.',
      market_closed: 'This market is closed.',
      game_started: 'This game has already started.',
      line_changed: 'The line moved — review and place again.',
      odds_changed: 'Odds moved — review and place again.',
      sport_blocked: 'Your host has disabled this sport.',
      sport_not_allowed: 'Your host has disabled this sport.',
      live_betting_disabled: 'Live betting is turned off for this club.',
      membership_inactive: 'Your membership isn’t active yet. Wait for host approval.',
      membership_pending: 'Your membership is pending host approval.',
      membership_not_found: 'Join a club from the lobby before betting.',
      player_suspended: 'Betting is paused for your account. Contact your host.',
      stake_below_min: 'Stake is below the club minimum.',
      stake_above_max: 'Stake is above the club maximum.',
      network: ERROR_COPY.network.body
    };
    if (map[c]) return map[c];
    if (c) return 'Bet not placed: ' + c.replace(/_/g, ' ') + '. Nothing was charged.';
    return ERROR_COPY.bet_rejected.body;
  }

  global.PbBetaUx = {
    openFeedbackModal: openFeedbackModal,
    openReportBetIssue: openReportBetIssue,
    initPlayerOnboarding: initPlayerOnboarding,
    buildSafeContext: buildSafeContext,
    sanitizeContext: sanitizeContext,
    queueFeedback: queueFeedback,
    submitFeedback: submitFeedback,
    getFeedbackQueue: function () { return readJson(STORAGE_FEEDBACK_Q, []); },
    friendlyError: friendlyError,
    mapBetRejectMessage: mapBetRejectMessage,
    ERROR_COPY: ERROR_COPY,
    FEEDBACK_CATEGORIES: FEEDBACK_CATEGORIES,
    STORAGE_FEEDBACK_Q: STORAGE_FEEDBACK_Q,
    API_CONTRACT: {
      method: 'POST',
      path: FEEDBACK_PATH,
      body: {
        category: 'bug|ux|odds|ticket|other',
        message: 'string<=1200',
        context: {
          path: 'string',
          clubId: 'uuid|null',
          ticketId: 'string|null',
          ticketStatus: 'string|null',
          market: 'string|null',
          viewport: 'string',
          ts: 'iso'
        }
      },
      notes: 'Auth via Bearer session header only — never put tokens in body. Success only after server {ok,id}. Rate-limit per actor.'
    }
  };

  try {
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureOnboardingStyles);
      } else {
        ensureOnboardingStyles();
      }
    }
  } catch (_eStyle) {}
})(typeof window !== 'undefined' ? window : globalThis);
