# Sport Feed Health Matrix

**Date:** 2026-09-09  
**Frontend branch:** `cursor/sport-feed-health`  
**Backend (read-only):** `/Users/mycomp/.openclaw/workspace/pocketbooks-sports-backend`  
**Live spot-check base:** `https://pocketbooks-sports-backend-production.up.railway.app`  
**Method:** Code-path + fixture/flag wiring audit; cheap live GETs to `/api/odds/:sport`, `/api/props/:sport`, `/api/scores/:sport`, `/api/sports`. No grading/accounting changes.

## Legend

| Status | Meaning |
|---|---|
| **GOOD** | Wired end-to-end and returning usable data (or empty only for clear off-slate windows with healthy path) |
| **PARTIAL** | Wired but incomplete coverage, seasonal empty, missing score overlay, thin slate, or config-gated |
| **BROKEN** | Wiring contradicts itself or UI claims support the API rejects |
| **NO DATA** | Route exists / polled, but cache currently empty |
| **NOT SUPPORTED** | Explicitly excluded from provider path, props allow-list, or ESPN/Owls scoreboard map |

## Matrix

| Sport | EVENTS | ODDS | LIVE | SCORES | PROPS | LOGOS / IMAGES |
|---|---|---|---|---|---|---|
| NFL | GOOD | GOOD | PARTIAL | GOOD | GOOD | GOOD |
| MLB | GOOD | GOOD | PARTIAL | GOOD | GOOD | GOOD |
| NBA | GOOD | GOOD | PARTIAL | PARTIAL | GOOD | GOOD |
| NHL | GOOD | GOOD | PARTIAL | PARTIAL | PARTIAL | GOOD |
| NCAAF | GOOD | GOOD | PARTIAL | GOOD | GOOD | GOOD |
| NCAAB | NO DATA | NO DATA | NO DATA | NO DATA | PARTIAL | GOOD |
| Soccer | GOOD | GOOD | GOOD | PARTIAL | NOT SUPPORTED | GOOD |
| Tennis | GOOD | GOOD | GOOD | PARTIAL | NOT SUPPORTED | PARTIAL |
| Golf | GOOD | GOOD | PARTIAL | NOT SUPPORTED | NOT SUPPORTED | PARTIAL |
| Boxing | NO DATA | NO DATA | NO DATA | NOT SUPPORTED | NOT SUPPORTED | PARTIAL |
| MMA | GOOD | GOOD | PARTIAL | NOT SUPPORTED | NOT SUPPORTED | GOOD |
| Rugby | NO DATA | NO DATA | NO DATA | NOT SUPPORTED | NOT SUPPORTED | PARTIAL |
| NASCAR | PARTIAL | PARTIAL | NO DATA | NOT SUPPORTED | NOT SUPPORTED | PARTIAL |

## Compact per-sport notes

- **NFL** — `/api/odds/nfl` healthy (~50 games). Props populated. ESPN `football/nfl` + Owls live-score poll. Live betting wired; no live games at audit time.
- **MLB** — Odds + heavy props (~7k). Scores via ESPN + Owls `/scores/live`. Live flag path OK; quiet live slate at audit.
- **NBA** — Odds + props OK (preseason slate). ESPN path exists; `/api/scores/nba` empty at audit → PARTIAL scores.
- **NHL** — Odds OK. Props allow-listed but `count=0` (`owls_cache_fallback`) → PARTIAL. Scores path empty at audit.
- **NCAAF** — Odds + props + ESPN college-football scores healthy. Logos via `team-logos.js` + backend `ncaaf-team-logos`.
- **NCAAB** — Route + ESPN path + props allow-list present; catalog `sourceStatus=empty`, 0 games/props (offseason) → NO DATA / PARTIAL props.
- **Soccer** — Unified Owls `soccer` feed (FE now hits `/api/odds/soccer` only). Live games present. Score endpoint returns rows; live cards often lack `homeScore` overlay → PARTIAL scores. Props 400 `props_not_supported`.
- **Tennis** — Unified Owls `tennis` feed; many live matches. Scores endpoint has rows; card overlay often null. Props not supported. Headshots via `player-photos.js` (coverage PARTIAL).
- **Golf** — Bookmaker v2 rollup `/api/odds/golf` healthy; lobby filters outrights to matchups. Not in `OWLS_LIVE_SCORE_SPORTS`; no ESPN scoreboard path. Headshots PARTIAL.
- **Boxing** — Map + `/api/odds/boxing` exist, but **not** always-polled / **missing** from `/api/sports` catalog; 0 games → NO DATA. No scores/props. Tab icon OK; fighter photos share MMA CDN.
- **MMA** — Odds healthy (~80). Always advertised when Owls provider. No live-score poll / ESPN path. Fighter photos GOOD. Props not supported.
- **Rugby** — Bookmaker v2 poll + catalog row; `sourceStatus=empty` (0 games). No scores/props. Tab icon only.
- **NASCAR** — Bookmaker v2 motorsport filter; 1 event in cache; catalog `enabled=false` but still served → PARTIAL. No scores/props. Tab logo only.

## Wiring sources (authoritative)

| Area | Location |
|---|---|
| FE sport tabs | `player.html` sport tab strip (`nfl`…`rugby`) |
| FE odds routes | `player.html` `_ODDS_ROUTE_KEY`, `_SPORT_CATALOG_ALIASES`, `loadGames` |
| FE props allow-list | `player.html` `_PB_PROPS_SUPPORTED_SPORTS` |
| FE live tab | `player.html` `loadAllLiveGames` ← `/api/sports` + `/api/odds/:sport` |
| FE logos | `team-logos.js`, `player-photos.js` |
| BE Owls map / poll list | backend `OWLS_SPORT_MAP`, `CACHE_SPORTS`, `OWLS_*_TAB_KEYS` |
| BE props allow-list | backend `PROPS_SUPPORTED_SPORTS` + `GET /api/props/:sport` |
| BE ESPN scores | backend `_espnScoreboardPath` (MLB/NBA/WNBA/NFL/NCAAF/NCAAB/NHL only) |
| BE Owls live scores | backend `OWLS_LIVE_SCORE_SPORTS` = soccer, tennis, mlb, nfl, nba, nhl, ncaaf, ncaab |
| BE golf/rugby/nascar | backend Bookmaker v2 (`owls-bookmaker-adapter.js`) — unified v1 odds 404 |

## Live spot-check snapshot (2026-09-09)

| Endpoint | Result |
|---|---|
| `/api/sports` | provider `owls_insight`, healthy; boxing **absent**; nascar `enabled=false` w/ 1 game; ncaab/rugby empty |
| `/api/odds/{sport}` | mlb 15, nba 41, nfl 50, nhl 32, ncaaf 50, ncaab 0, soccer 50, tennis 50, golf 50, boxing 0, mma 80, rugby 0, nascar 1 |
| `/api/props/{sport}` | mlb/nba/nfl/ncaaf data; nhl/ncaab empty-but-ok; soccer/tennis/golf/boxing/mma/rugby/nascar → `props_not_supported` |
| `/api/scores/{sport}` | mlb/nfl/ncaaf/soccer/tennis rows; nba/nhl/ncaab/golf/boxing/mma/rugby/nascar `[]` |
| `/api/markets/health` | healthy, ~1600+ cached games |

## Frontend fixes shipped on this branch

1. **Props labeling** — removed `tennis` from `_PB_PROPS_SUPPORTED_SPORTS` so UI matches backend `PROPS_SUPPORTED_SPORTS` (stops false Props CTA → 400).
2. **Boxing avatars** — `_pbAvatarSportKey` maps boxing → MMA headshot path (same as `player-photos.js`).
3. **Soccer/tennis/rugby odds routes** — `_ODDS_ROUTE_KEY` + `_SPORT_CATALOG_ALIASES` now match backend unified rollups (`/api/odds/soccer`, `/tennis`, `/rugby`) instead of stale per-league FE segments.

## Explicit non-goals / blockers

- **No grading, settlement, ledger, or prod financial mutations.**
- **Boxing catalog/poll gap** is backend config (`OWLS_ENABLED_SPORTS` / missing always-advertise like MMA). FE tab remains; feed empty until backend polls boxing.
- **NASCAR `enabled=false`** while cache has games — backend enablement flag vs always-poll inconsistency.
- **Live score overlays** for soccer/tennis often null on odds cards despite `/api/scores/*` rows — presentation attach gap, not settlement.
- **Golf / combat / rugby / nascar scores** — no ESPN path and not in `OWLS_LIVE_SCORE_SPORTS` → NOT SUPPORTED for scoreboard.
- Spot-check only; seasonal emptiness (NCAAB, Rugby, Boxing) may change without code changes.
