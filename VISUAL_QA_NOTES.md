# Visual QA — `cursor/design-system` (Workstream 3)

**Base SHA:** `867ff4e` (tip confirmed)  
**QA branch commit:** pending push (see `git log -1` after fixes)  
**Date:** 2026-09-09  
**Server:** `npx serve -l 8766` from repo root  
**Preview URL:** `/player?preview=1&testUser=visualqa` (clear `localStorage` if stale token redirects to lobby)

## Screenshots

Captured via Chrome DevTools MCP + in-session viewport screenshots.  
Puppeteer headless was unavailable in this environment (Chrome launch timeout).

| Viewport | Page | Method | Notes |
|----------|------|--------|-------|
| ~390–430 | `player` | DevTools resize (~485px min chrome width) | No horizontal overflow; `body` max-width 430px |
| 768 | `player` | DevTools | Tablet shell 760px; sport grid 6-col |
| 1280 | `player` | DevTools + screenshot | 2-col game grid; body 1240px after breakpoint fix |
| 1440 | `player` | DevTools + screenshot | body 1360px; wider card grid |
| 390 / 768 / 1280 | `lobby` | DevTools (`?preview=1`) | Auth/home shell; desktop MQ at ≥1100px |

## Fixes applied (this commit)

1. **`player.html` — `html` canvas:** `html { background: var(--bg); overflow-x: hidden }` so wide viewports don’t show transparent/white gutters outside the centered shell.
2. **`player.html` — tokenized muted labels:** `.split-label`, `.split-action`, `.value-bets-count`, `.split-bar`, `.mc-col-label` mapped to design tokens (`--gray`, `--light`, `--border`).
3. **`player.html` — preview auth guard:** `_authRedirectToLogin` / `_authHandleResponse` respect `?preview=1` (not only `testUser`) so visual QA isn’t bounced to lobby on stale tokens.
4. **`player.html` — duplicate breakpoint conflict:** Removed trailing `MOBILE-FIRST` rules that re-declared `body { max-width: 720/980/1100px }` and **overrode** the intended 768→760 / 1280→1240 / 1440→1360 layout from the responsive fix block.
5. **`lobby.html` — `html` canvas:** Same `html { background: var(--bg-main) }` gutter fix.

## Remaining issues

### P0
- None observed after breakpoint + html background fixes (no horizontal overflow at 768/1280/1440 with live MLB cards).

### P1
- **`index.html` (host):** Still requires auth token; visual QA needs signed-in session or a `?preview=1` boot bypass (host has preview helpers in JS but top-of-file redirect lacks preview escape).
- **390px exact:** DevTools minimum width ~485px; true iPhone 390 should be verified on device or Puppeteer with arm64 Node.
- **Sharp Value / EV chrome:** Legacy green `#00ff88` on EV badges intentionally distinct from board `--accent` blue — confirm product intent.
- **Lobby `preview-screen` inline `max-width:430px`:** Preview templates stay phone-width on desktop (cosmetic for QA overlays only).

### P2
- Duplicate focus-ring blocks (BETA UX + A11Y sections) — harmless but could be consolidated later.
- `serve` rewrites `player.html` → `/player`; document in QA runbook.

## Blockers (none for player/lobby static QA)

- Production API used for odds/games in preview mode (read-only). No settlement/financial writes performed.
