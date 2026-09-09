# PocketBooks Sports — Design System

**Canonical palette (dark sportsbook)**

| Token | Value | Use |
|---|---|---|
| `--bg-main` / `--bg` | `#080D18` | App background |
| `--bg-secondary` / `--bg-elev` | `#0C1424` | Recessed / elevated strips |
| `--bg-card` / `--card` | `#101A2E` | Cards, sheets (dark) |
| `--border` | `#1D2B42` | Hairlines, inputs |
| `--accent` / `--accent-blue` | `#1677FF` | Interactive primary on board |
| `--text-primary` / `--white` | `#F5F7FA` | Primary text |
| `--text-secondary` / `--light` | `#94A3B8` | Secondary |
| `--text-muted` / `--gray` | `#64748B` | Meta |
| `--positive` / `--win` | `#22C55E` | Credit / owe-you / Over |
| `--negative` / `--red` | `#EF4444` | Debit / owe-players / LIVE / Under |
| Slip Place Bet green | `#00c853` / `#00ff87` family | Bet slip CTA only (contrast sheet) |

**Radii:** card `16px`, controls `10–12px`, pills avoid `rounded-full` except avatars.  
**Spacing:** 8px base; card margin `12px`; section padding `14–16px`.  
**Type:** SF Pro / system; weights 700–900 for odds and titles.  
**Odds buttons:** dark recessed fill, 1px border; selected = accent border + soft fill, **no multi-layer glow**.  
**Cards:** one job; no hero cards in sportsbook list; floating logos (no tile boxes).  
**Images:** photo → logo → O/U/Draw glyph → text-only fallback. Never leave broken `<img>`.  
**Semantic money (host):** owe-you = green, owe-players = red — never invert.  
**Motion:** ≤150ms UI; honor `prefers-reduced-motion`. Touch targets ≥44px where interactive.  
**Responsive:** 390 · 430 · 768 · 1280 · 1440; fluid width, not fixed desktop-in-mobile.

**State chrome:** `.pb-loading`, `.pb-empty`, `.pb-error` + `.pb-retry-btn` for board/dashboard.  
**Do not:** purple-on-white themes, cream+serif newspaper layouts, excess blue flood, invent live scores.
