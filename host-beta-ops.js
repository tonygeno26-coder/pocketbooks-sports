/**
 * Host Beta Ops — testers, join requests, feedback inbox.
 * Presentation + host-scoped API only. No bankroll / grade / settle mutations.
 * Authoritative backend data only — real, empty, or error. No runtime fixtures.
 * Loaded by index.html (Host Dashboard).
 */
(function (global) {
  'use strict';

  var _opsPanel = 'overview'; // overview | requests | testers | feedback
  var _fbStatus = 'all'; // all | new | reviewed | resolved
  var _fbCategory = 'all';
  var _fbBetIssuesOnly = false;
  var _fbSearch = '';
  var _fbItems = [];
  var _fbCounts = { all: 0, new: 0, reviewed: 0, resolved: 0, betIssues: 0 };
  var _fbLoading = false;
  var _fbError = null;
  var _fbBusyId = null;
  var _opsSearchTimer = null;

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Deep-link panel from ?panel= (no data injection). */
  function _panelBoot() {
    try {
      var p = String(new URLSearchParams(location.search).get('panel') || '').toLowerCase();
      if (p === 'overview' || p === 'requests' || p === 'testers' || p === 'feedback') return p;
    } catch (_e) {}
    return null;
  }

  function _clubId() {
    if (typeof global._resolveHostClubId === 'function') {
      try { return global._resolveHostClubId(); } catch (_e) {}
    }
    return null;
  }

  function _pendingRequests() {
    try {
      if (global.pendingRequests && global.pendingRequests.length) return global.pendingRequests.slice();
      if (typeof global.loadJoinRequests === 'function') return global.loadJoinRequests() || [];
    } catch (_e) {}
    return [];
  }

  function _activeTesters() {
    var list = [];
    try {
      if (typeof global._hostPlayersFromDbOrLocal === 'function') {
        list = global._hostPlayersFromDbOrLocal() || [];
      } else if (Array.isArray(global._hostDbPlayers)) {
        list = global._hostDbPlayers.slice();
      }
    } catch (_e) { list = []; }
    return list;
  }

  function _fmtMoney(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '—';
    var sign = v < 0 ? '-' : '';
    return sign + '$' + Math.abs(v).toFixed(2);
  }

  function _fmtWhen(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
    } catch (_e) {
      return '';
    }
  }

  function _statusChip(st) {
    var s = String(st || 'new').toLowerCase();
    var cls = 'hbo-chip hbo-chip--' + s;
    return '<span class="' + cls + '">' + _esc(s) + '</span>';
  }

  function _categoryLabel(c) {
    var map = { bug: 'Bug', ux: 'UX', odds: 'Odds', ticket: 'Ticket', other: 'Other' };
    return map[String(c || '').toLowerCase()] || String(c || 'Other');
  }

  async function loadFeedbackInbox(opts) {
    opts = opts || {};
    _fbLoading = true;
    _fbError = null;
    if (!opts.silent) renderBetaOps();

    var clubId = _clubId();
    var params = [];
    if (clubId) params.push('clubId=' + encodeURIComponent(clubId));
    if (_fbStatus && _fbStatus !== 'all') params.push('status=' + encodeURIComponent(_fbStatus));
    if (_fbCategory && _fbCategory !== 'all') params.push('category=' + encodeURIComponent(_fbCategory));
    if (_fbBetIssuesOnly) params.push('betIssues=1');
    if (_fbSearch) params.push('q=' + encodeURIComponent(_fbSearch));
    params.push('limit=100');
    var path = '/api/host/feedback?' + params.join('&');

    try {
      var data = null;
      if (typeof global.apiCall === 'function') {
        data = await global.apiCall('GET', path);
      } else if (typeof global._pbFetch === 'function' && global.API) {
        var r = await global._pbFetch(global.API + path);
        data = await r.json();
      } else {
        throw new Error('api_unavailable');
      }
      if (!data || data.ok !== true) {
        throw new Error((data && data.error) || 'feedback_unavailable');
      }
      _fbItems = Array.isArray(data.items) ? data.items : [];
      _fbCounts = data.counts || { all: 0, new: 0, reviewed: 0, resolved: 0, betIssues: 0 };
      _fbLoading = false;
      _fbError = null;
    } catch (e) {
      _fbItems = [];
      _fbCounts = { all: 0, new: 0, reviewed: 0, resolved: 0, betIssues: 0 };
      _fbLoading = false;
      _fbError = (e && e.message) || 'Unable to load feedback';
    }
    renderBetaOps();
    _paintOpsBadge();
  }

  async function updateFeedbackStatus(id, status) {
    if (!id || !status) return;
    if (_fbBusyId) return;
    _fbBusyId = id;
    renderBetaOps();
    var clubId = _clubId();
    var body = { status: status };
    if (clubId) body.clubId = clubId;
    try {
      if (typeof global.apiCall === 'function') {
        var resp = await global.apiCall('PATCH', '/api/host/feedback/' + encodeURIComponent(id), body);
        if (!resp || resp.ok === false) {
          throw new Error((resp && resp.error) || 'update_failed');
        }
        if (resp.item) {
          _fbItems = _fbItems.map(function (it) {
            return String(it.id) === String(id) ? Object.assign({}, it, resp.item) : it;
          });
        } else {
          await loadFeedbackInbox({ silent: true });
        }
      } else {
        throw new Error('api_unavailable');
      }
      if (typeof global.showToastHost === 'function') {
        global.showToastHost('Marked ' + status);
      }
    } catch (e) {
      if (typeof global.showToastHost === 'function') {
        global.showToastHost((e && e.message) || 'Update failed');
      }
    }
    _fbBusyId = null;
    renderBetaOps();
    _paintOpsBadge();
  }

  function _paintOpsBadge() {
    var badge = document.getElementById('ops-badge');
    if (!badge) return;
    var n = Number(_fbCounts && _fbCounts.new) || 0;
    var pending = _pendingRequests().length;
    var total = n + pending;
    if (total > 0) {
      badge.textContent = String(total);
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }

  function _overviewMetricsHtml() {
    var pending = _pendingRequests().length;
    var testers = _activeTesters().length;
    var c = _fbCounts || {};
    return ''
      + '<div class="hbo-metrics">'
      +   '<div class="hbo-metric"><div class="hbo-metric-val" style="color:var(--pb-gold)">' + pending + '</div><div class="hbo-metric-lbl">Join requests</div></div>'
      +   '<div class="hbo-metric"><div class="hbo-metric-val" style="color:var(--pb-cyan)">' + testers + '</div><div class="hbo-metric-lbl">Active testers</div></div>'
      +   '<div class="hbo-metric"><div class="hbo-metric-val" style="color:var(--pb-accent)">' + (c.new || 0) + '</div><div class="hbo-metric-lbl">New feedback</div></div>'
      +   '<div class="hbo-metric"><div class="hbo-metric-val" style="color:var(--pb-red)">' + (c.betIssues || 0) + '</div><div class="hbo-metric-lbl">Bet issues</div></div>'
      + '</div>';
  }

  function _panelTabsHtml() {
    var tabs = [
      { id: 'overview', label: 'Overview' },
      { id: 'requests', label: 'Requests' },
      { id: 'testers', label: 'Testers' },
      { id: 'feedback', label: 'Feedback' }
    ];
    return '<div class="hbo-tabs">' + tabs.map(function (t) {
      var active = t.id === _opsPanel;
      return '<button type="button" class="hbo-tab' + (active ? ' is-active' : '') + '"'
        + ' onclick="PbHostBetaOps.setPanel(\'' + t.id + '\')">' + _esc(t.label) + '</button>';
    }).join('') + '</div>';
  }

  function _requestsHtml() {
    var reqs = _pendingRequests();
    if (!reqs.length) {
      return '<div class="hbo-empty"><div class="hbo-empty-title">No pending join requests</div>'
        + '<div class="hbo-empty-sub">New applicants appear here for Approve / Decline.</div></div>';
    }
    return reqs.map(function (r) {
      var name = r.playerName || r.display_name || r.username || 'Player';
      var pid = String(r.playerId || r.player_id || '').replace(/"/g, '');
      var mid = String(r.membershipId || r.id || '').replace(/"/g, '');
      var when = _fmtWhen(r.requestedAt || r.joined_at);
      return '<div class="hbo-card hbo-req">'
        + '<div class="hbo-card-main">'
        +   '<div class="hbo-card-title">' + _esc(name) + '</div>'
        +   '<div class="hbo-card-meta">' + (when ? _esc(when) : 'Pending review') + '</div>'
        + '</div>'
        + '<div class="hbo-card-actions">'
        +   '<button type="button" class="hbo-btn hbo-btn--ghost" data-pid="' + _esc(pid) + '"'
        +     (mid ? (' data-mid="' + _esc(mid) + '"') : '')
        +     ' onclick="onDenyRequestClick(this,event)">Decline</button>'
        +   '<button type="button" class="hbo-btn hbo-btn--primary" data-pid="' + _esc(pid) + '"'
        +     (mid ? (' data-mid="' + _esc(mid) + '"') : '')
        +     ' onclick="onApproveButtonClick(this,event)">Approve</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  function _testersHtml() {
    var players = _activeTesters();
    if (!players.length) {
      return '<div class="hbo-empty"><div class="hbo-empty-title">No active testers yet</div>'
        + '<div class="hbo-empty-sub">Approved players in this club show up here. Bankroll is display-only.</div></div>';
    }
    return players.map(function (p) {
      var name = p.playerName || p.displayName || p.username || p.playerId || 'Player';
      var uname = p.username && p.username !== name ? '@' + p.username : '';
      var bal = p.availableBalance != null ? p.availableBalance
        : (p.available_balance != null ? p.available_balance : null);
      var start = p.startingBalance != null ? p.startingBalance
        : (p.balance_start != null ? p.balance_start : null);
      var openBets = p.activeBetCount != null ? p.activeBetCount : 0;
      var st = p.status || 'approved';
      return '<div class="hbo-card hbo-tester">'
        + '<div class="hbo-card-main">'
        +   '<div class="hbo-card-title">' + _esc(name) + '</div>'
        +   '<div class="hbo-card-meta">' + _esc(uname || String(p.playerId || '').slice(0, 10))
        +     ' · ' + _esc(st)
        +     (openBets ? (' · ' + openBets + ' open') : '')
        +   '</div>'
        + '</div>'
        + '<div class="hbo-tester-bal">'
        +   '<div class="hbo-tester-bal-val">' + _esc(_fmtMoney(bal)) + '</div>'
        +   '<div class="hbo-tester-bal-lbl">Available'
        +     (start != null ? (' · start ' + _esc(_fmtMoney(start))) : '')
        +   '</div>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  function _feedbackFiltersHtml() {
    var statuses = [
      { id: 'all', label: 'All' },
      { id: 'new', label: 'New' },
      { id: 'reviewed', label: 'Reviewed' },
      { id: 'resolved', label: 'Resolved' }
    ];
    var cats = [
      { id: 'all', label: 'All categories' },
      { id: 'bug', label: 'Bug' },
      { id: 'ux', label: 'UX' },
      { id: 'odds', label: 'Odds' },
      { id: 'ticket', label: 'Ticket' },
      { id: 'other', label: 'Other' }
    ];
    return ''
      + '<div class="hbo-filters">'
      +   '<div class="hbo-filter-row">'
      +     statuses.map(function (s) {
        return '<button type="button" class="hbo-pill' + (_fbStatus === s.id ? ' is-active' : '') + '"'
          + ' onclick="PbHostBetaOps.setFbStatus(\'' + s.id + '\')">' + s.label + '</button>';
      }).join('')
      +   '</div>'
      +   '<div class="hbo-filter-row hbo-filter-row--wrap">'
      +     '<select class="hbo-select" onchange="PbHostBetaOps.setFbCategory(this.value)">'
      +       cats.map(function (c) {
        return '<option value="' + c.id + '"' + (_fbCategory === c.id ? ' selected' : '') + '>'
          + c.label + '</option>';
      }).join('')
      +     '</select>'
      +     '<button type="button" class="hbo-pill' + (_fbBetIssuesOnly ? ' is-active' : '') + '"'
      +       ' onclick="PbHostBetaOps.toggleBetIssues()">Bet Issues</button>'
      +   '</div>'
      +   '<div class="hbo-search">'
      +     '<input type="search" placeholder="Search player, ticket, message…"'
      +       ' value="' + _esc(_fbSearch) + '"'
      +       ' oninput="PbHostBetaOps.onSearch(this.value)" />'
      +   '</div>'
      + '</div>';
  }

  function _ticketContextHtml(ticket) {
    if (!ticket) {
      return '<div class="hbo-ticket hbo-ticket--missing">Ticket context unavailable</div>';
    }
    return '<div class="hbo-ticket">'
      + '<div class="hbo-ticket-id">' + _esc(ticket.id) + '</div>'
      + '<div class="hbo-ticket-meta">'
      +   _esc(ticket.status || '—')
      +   (ticket.type ? (' · ' + _esc(ticket.type)) : '')
      +   (ticket.riskAmount != null ? (' · risk ' + _esc(_fmtMoney(ticket.riskAmount))) : '')
      +   (ticket.odds != null ? (' · ' + _esc(String(ticket.odds))) : '')
      + '</div>'
      + '<div class="hbo-ticket-note">Read-only · no regrade / settle from here</div>'
      + '</div>';
  }

  function _feedbackListHtml() {
    if (_fbLoading) {
      return '<div class="hbo-empty"><div class="hbo-empty-title">Loading feedback…</div></div>';
    }
    if (_fbError) {
      return '<div class="hbo-empty hbo-empty--error"><div class="hbo-empty-title">Unable to load feedback</div>'
        + '<div class="hbo-empty-sub">' + _esc(_fbError) + '</div>'
        + '<button type="button" class="hbo-btn hbo-btn--ghost" onclick="PbHostBetaOps.reload()">Retry</button></div>';
    }
    if (!_fbItems.length) {
      return '<div class="hbo-empty"><div class="hbo-empty-title">No feedback yet</div>'
        + '<div class="hbo-empty-sub">Player reports and bet issues land here for triage.</div></div>';
    }
    return _fbItems.map(function (it) {
      var busy = String(_fbBusyId) === String(it.id);
      var actions = '';
      if (it.status !== 'new') {
        actions += '<button type="button" class="hbo-btn hbo-btn--ghost" ' + (busy ? 'disabled' : '')
          + ' onclick="PbHostBetaOps.setStatus(\'' + _esc(it.id) + '\',\'new\')">New</button>';
      }
      if (it.status !== 'reviewed') {
        actions += '<button type="button" class="hbo-btn hbo-btn--ghost" ' + (busy ? 'disabled' : '')
          + ' onclick="PbHostBetaOps.setStatus(\'' + _esc(it.id) + '\',\'reviewed\')">Reviewed</button>';
      }
      if (it.status !== 'resolved') {
        actions += '<button type="button" class="hbo-btn hbo-btn--primary" ' + (busy ? 'disabled' : '')
          + ' onclick="PbHostBetaOps.setStatus(\'' + _esc(it.id) + '\',\'resolved\')">Resolved</button>';
      }
      return '<article class="hbo-card hbo-fb' + (it.isBetIssue ? ' hbo-fb--issue' : '') + '">'
        + '<div class="hbo-fb-top">'
        +   '<div class="hbo-fb-who">'
        +     '<div class="hbo-card-title">' + _esc(it.playerLabel || it.playerId || 'Player') + '</div>'
        +     '<div class="hbo-card-meta">' + _esc(_fmtWhen(it.createdAt))
        +       (it.page ? (' · ' + _esc(it.page)) : '')
        +     '</div>'
        +   '</div>'
        +   '<div class="hbo-fb-tags">'
        +     _statusChip(it.status)
        +     '<span class="hbo-chip hbo-chip--cat">' + _esc(_categoryLabel(it.category)) + '</span>'
        +     (it.isBetIssue ? '<span class="hbo-chip hbo-chip--issue">Bet Issue</span>' : '')
        +   '</div>'
        + '</div>'
        + '<p class="hbo-fb-msg">' + _esc(it.message) + '</p>'
        + (it.isBetIssue ? _ticketContextHtml(it.ticket) : '')
        + '<div class="hbo-card-actions">' + actions + '</div>'
        + '</article>';
    }).join('');
  }

  function _overviewBodyHtml() {
    var pending = _pendingRequests().length;
    var testers = _activeTesters().length;
    var c = _fbCounts || {};
    return ''
      + '<div class="hbo-overview-grid">'
      +   '<button type="button" class="hbo-jump" onclick="PbHostBetaOps.setPanel(\'requests\')">'
      +     '<div class="hbo-jump-title">Join requests</div>'
      +     '<div class="hbo-jump-val">' + pending + ' pending</div>'
      +     '<div class="hbo-jump-cta">Review →</div>'
      +   '</button>'
      +   '<button type="button" class="hbo-jump" onclick="PbHostBetaOps.setPanel(\'testers\')">'
      +     '<div class="hbo-jump-title">Active testers</div>'
      +     '<div class="hbo-jump-val">' + testers + ' approved</div>'
      +     '<div class="hbo-jump-cta">View roster →</div>'
      +   '</button>'
      +   '<button type="button" class="hbo-jump" onclick="PbHostBetaOps.setPanel(\'feedback\')">'
      +     '<div class="hbo-jump-title">Feedback inbox</div>'
      +     '<div class="hbo-jump-val">' + (c.new || 0) + ' new · ' + (c.betIssues || 0) + ' bet issues</div>'
      +     '<div class="hbo-jump-cta">Open inbox →</div>'
      +   '</button>'
      + '</div>'
      + '<div class="hbo-note">Beta Ops is triage only — no bankroll edits, regrade, or settlement from this screen.</div>';
  }

  function renderBetaOps() {
    var el = document.getElementById('beta-ops-section');
    if (!el) return;
    var body = '';
    if (_opsPanel === 'requests') body = _requestsHtml();
    else if (_opsPanel === 'testers') body = _testersHtml();
    else if (_opsPanel === 'feedback') body = _feedbackFiltersHtml() + _feedbackListHtml();
    else body = _overviewBodyHtml();

    el.innerHTML = ''
      + '<div class="hbo-wrap">'
      +   '<div class="hbo-header">'
      +     '<div>'
      +       '<div class="hbo-title">Beta Ops</div>'
      +       '<div class="hbo-sub">Testers · join requests · feedback</div>'
      +     '</div>'
      +     '<button type="button" class="hbo-btn hbo-btn--ghost" onclick="PbHostBetaOps.reload()">Refresh</button>'
      +   '</div>'
      +   _overviewMetricsHtml()
      +   _panelTabsHtml()
      +   '<div class="hbo-body">' + body + '</div>'
      +   '<div style="height:88px"></div>'
      + '</div>';
    _paintOpsBadge();
  }

  function openBetaOps(panel) {
    if (panel) _opsPanel = panel;
    if (typeof global.switchHostTab === 'function') {
      global.switchHostTab('ops');
    } else if (typeof global.setBN === 'function') {
      var btn = document.querySelector('.bn[data-tab="ops"]');
      if (btn) global.setBN(btn, 'ops');
    }
    renderBetaOps();
    loadFeedbackInbox({ silent: true });
    if (typeof global.loadRequests === 'function') {
      global.loadRequests().then(function () { renderBetaOps(); }).catch(function () {});
    }
  }

  function setPanel(panel) {
    _opsPanel = panel || 'overview';
    renderBetaOps();
    if (_opsPanel === 'feedback') loadFeedbackInbox({ silent: true });
    if (_opsPanel === 'requests' && typeof global.loadRequests === 'function') {
      global.loadRequests().then(function () { renderBetaOps(); }).catch(function () {});
    }
  }

  function setFbStatus(st) {
    _fbStatus = st || 'all';
    loadFeedbackInbox();
  }
  function setFbCategory(cat) {
    _fbCategory = cat || 'all';
    loadFeedbackInbox();
  }
  function toggleBetIssues() {
    _fbBetIssuesOnly = !_fbBetIssuesOnly;
    loadFeedbackInbox();
  }
  function onSearch(val) {
    _fbSearch = String(val || '');
    if (_opsSearchTimer) clearTimeout(_opsSearchTimer);
    _opsSearchTimer = setTimeout(function () { loadFeedbackInbox(); }, 220);
  }

  function mountHomeCard() {
    var home = document.getElementById('home-content');
    if (!home || document.getElementById('hbo-home-card')) return;
    var card = document.createElement('div');
    card.id = 'hbo-home-card';
    card.className = 'hbo-home-card';
    card.innerHTML = ''
      + '<button type="button" class="hbo-home-btn" onclick="PbHostBetaOps.open()">'
      +   '<div class="hbo-home-btn-text">'
      +     '<div class="hbo-home-btn-title">Beta Ops</div>'
      +     '<div class="hbo-home-btn-sub">Manage testers, join requests, and feedback</div>'
      +   '</div>'
      +   '<span class="hbo-home-btn-cta">Open →</span>'
      + '</button>';
    var anchor = document.getElementById('requests-section');
    if (anchor && anchor.parentNode === home) {
      home.insertBefore(card, anchor);
    } else {
      var first = home.querySelector('.host-summary-label, .stats-row, .sec-hdr');
      if (first) home.insertBefore(card, first);
      else home.appendChild(card);
    }
  }

  function boot() {
    var panel = _panelBoot();
    if (panel) _opsPanel = panel;
  }

  var api = {
    open: openBetaOps,
    render: renderBetaOps,
    reload: function () {
      loadFeedbackInbox();
      if (typeof global.loadRequests === 'function') {
        global.loadRequests().then(function () { renderBetaOps(); }).catch(function () {});
      }
      if (typeof global.loadHostDashboardFromDb === 'function') {
        try { global.loadHostDashboardFromDb('beta_ops'); } catch (_e) {}
      }
    },
    setPanel: setPanel,
    setFbStatus: setFbStatus,
    setFbCategory: setFbCategory,
    toggleBetIssues: toggleBetIssues,
    onSearch: onSearch,
    setStatus: updateFeedbackStatus,
    mountHomeCard: mountHomeCard,
    _paintOpsBadge: _paintOpsBadge
  };

  global.PbHostBetaOps = api;

  function _onReady() {
    mountHomeCard();
    boot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _onReady);
  } else {
    _onReady();
  }
})(typeof window !== 'undefined' ? window : globalThis);
