/**
 * PocketBooks Sports — shared a11y helpers (modal focus trap, odds keyboard/labels, live region).
 */
(function (global) {
  'use strict';

  var _sessions = new WeakMap();
  var _stack = []; // top-most modal only handles Escape
  var _liveEl = null;

  function _focusable(root) {
    if (!root || !root.querySelectorAll) return [];
    var sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.slice.call(root.querySelectorAll(sel)).filter(function (el) {
      if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 || r.height > 0 || el === document.activeElement;
    });
  }

  function _resolveDialog(overlay) {
    if (!overlay) return null;
    if (overlay.getAttribute('role') === 'dialog') return overlay;
    return overlay.querySelector('[role="dialog"]') || overlay.querySelector('.modal') ||
      overlay.querySelector('#pb-diamonds-modal') || overlay.firstElementChild || overlay;
  }

  function activate(overlay, opts) {
    opts = opts || {};
    if (!overlay) return;
    deactivate(overlay);
    var dialog = _resolveDialog(overlay);
    if (!dialog) return;

    var prevFocus = document.activeElement;
    var keyHandler = function (e) {
      // ESC closes only the top-most active modal (stack).
      if (e.key === 'Escape') {
        if (_stack.length && _stack[_stack.length - 1] !== overlay) return;
        e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        if (typeof opts.onEscape === 'function') opts.onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      if (_stack.length && _stack[_stack.length - 1] !== overlay) return;
      var focusables = _focusable(dialog);
      if (!focusables.length) {
        e.preventDefault();
        return;
      }
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      var active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', keyHandler, true);
    _sessions.set(overlay, { prevFocus: prevFocus, keyHandler: keyHandler });
    _stack.push(overlay);

    var initial = null;
    if (opts.initialFocus && dialog.querySelector) {
      initial = dialog.querySelector(opts.initialFocus);
    }
    var focusables = _focusable(dialog);
    var target = initial || focusables[0] || dialog;
    if (target && typeof target.focus === 'function') {
      try { target.focus(); } catch (_e) {}
    }
  }

  function deactivate(overlay) {
    if (!overlay) return;
    var session = _sessions.get(overlay);
    if (!session) return;
    document.removeEventListener('keydown', session.keyHandler, true);
    _sessions.delete(overlay);
    var idx = _stack.indexOf(overlay);
    if (idx >= 0) _stack.splice(idx, 1);
    if (session.prevFocus && typeof session.prevFocus.focus === 'function') {
      try { session.prevFocus.focus(); } catch (_e) {}
    }
  }

  function _attr(cell, name) {
    if (!cell) return '';
    if (cell.getAttribute) {
      var v = cell.getAttribute(name);
      if (v) return v;
    }
    if (cell.dataset) {
      var key = name.indexOf('data-') === 0 ? name.slice(5).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }) : name;
      if (cell.dataset[key]) return cell.dataset[key];
    }
    return '';
  }

  function oddsAriaLabel(cell) {
    if (!cell) return 'Odds';
    var existing = cell.getAttribute && cell.getAttribute('aria-label');
    if (existing) return existing;
    var parts = [];
    var game = _attr(cell, 'data-game');
    var market = _attr(cell, 'data-market');
    var pick = _attr(cell, 'data-pick');
    var odds = _attr(cell, 'data-odds');
    var player = _attr(cell, 'data-player-name');
    var propType = _attr(cell, 'data-prop-type');
    var side = _attr(cell, 'data-side');
    if (game) parts.push(game);
    if (player && propType) parts.push(player + ' ' + propType);
    else if (market) parts.push(market);
    if (side) parts.push(side);
    else if (pick) parts.push(pick);
    if (odds) {
      var n = parseInt(odds, 10);
      parts.push((!isNaN(n) && n > 0 ? '+' : '') + odds);
    }
    var selected = cell.classList && (cell.classList.contains('selected') || cell.classList.contains('sel'));
    if (selected) parts.push('selected');
    return parts.filter(Boolean).join(', ') || 'Odds selection';
  }

  function _oddsLabel(cell) {
    return oddsAriaLabel(cell);
  }

  function enhanceOddsCell(cell) {
    if (!cell || !cell.classList || !cell.classList.contains('odds-cell')) return;
    if (!cell.getAttribute('role')) cell.setAttribute('role', 'button');
    if (!cell.hasAttribute('tabindex')) cell.setAttribute('tabindex', '0');
    if (!cell.getAttribute('aria-label')) cell.setAttribute('aria-label', _oddsLabel(cell));
    var selected = cell.classList.contains('selected') || cell.classList.contains('sel');
    cell.setAttribute('aria-pressed', selected ? 'true' : 'false');
    if (cell.getAttribute('data-pb-odds-key') === '1') return;
    cell.setAttribute('data-pb-odds-key', '1');
    cell.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        cell.click();
      }
    });
  }

  function enhanceOddsIn(root) {
    var scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return;
    Array.prototype.forEach.call(scope.querySelectorAll('.odds-cell'), enhanceOddsCell);
  }

  function announce(msg, priority) {
    if (!msg || typeof document === 'undefined') return;
    if (!_liveEl) _liveEl = document.getElementById('pb-a11y-live');
    if (!_liveEl) {
      _liveEl = document.createElement('div');
      _liveEl.id = 'pb-a11y-live';
      _liveEl.className = 'pb-sr-only';
      _liveEl.setAttribute('aria-atomic', 'true');
      if (document.body) document.body.appendChild(_liveEl);
    }
    _liveEl.setAttribute('aria-live', priority === 'assertive' ? 'assertive' : 'polite');
    _liveEl.textContent = '';
    setTimeout(function () { _liveEl.textContent = String(msg); }, 40);
  }

  global.PbA11y = {
    activate: activate,
    deactivate: deactivate,
    enhanceOddsCell: enhanceOddsCell,
    enhanceOddsIn: enhanceOddsIn,
    announce: announce,
    oddsAriaLabel: oddsAriaLabel
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
