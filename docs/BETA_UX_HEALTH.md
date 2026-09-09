# Beta UX Health Report

**Date:** 2026-09-08  
**Scope:** Player sportsbook + host operator chrome (presentation). Settlement accounting unchanged.

## Grades (A–F)

| Area | Grade | Notes |
|---|---|---|
| Brand / tokens | **B+** | Aligned to `#080D18` / `#1677FF` on polish branches; legacy neon remnants remain in early CSS |
| Player dashboard chrome | **B** | Sticky header + chips clearer; still dense on small phones |
| Game cards | **B** | LIVE→teams→score→odds hierarchy improved; hover quieter |
| Bet slip | **B+** | Light sheet + Place Bet clarity; logo hierarchy preserved |
| Props | **B** | Search + O/U contrast; grouping already strong |
| Live | **B** | Graceful empty; missing scoreboard omitted (no invented scores) |
| Host dashboard | **B-** | Operator polish started; tables/modals still dense |
| Mobile | **B** | Breakpoints added; more QA needed on real devices |
| Empty/loading/error | **B-** | Shared empty cards; not all spinners converted |
| A11y | **C+** | Focus rings + reduced-motion; contrast audit incomplete |
| Design system docs | **B** | `DESIGN_SYSTEM.md` landed |
| Settlement UX (carry) | **B** (feature branch) | FE `6cfe713` — do not merge until RPC gate clears |

**Overall beta UX:** **B-**

## Must (before wider beta)

1. Human visual QA on 390 / 768 / 1280 with real clubs  
2. Settlement RPC exists + club-scope migration reviewed before financial merge  
3. Kill remaining neon token drift in early `player.html` `:root` when safe  

## Should

1. Convert remaining inline empties/loaders to `.pb-empty` / `.pb-loading`  
2. Host tables: sticky headers, horizontal scroll without crushing names  
3. Props `data-side` class hooks for Over/Under already in render — verify all sports  

## Nice

1. Skeleton loaders for market lists  
2. Superdesign / Mobbin reference pass when subscriptions available  
3. Consolidate duplicate CSS blocks in `player.html`  

## Research blockers

- **Mobbin MCP:** paid plan required — unavailable  
- **Superdesign:** CLI skill available; deferred to avoid long init during financial-gated autonomous queue  
