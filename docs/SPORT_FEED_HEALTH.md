# Sport Feed Health Matrix

**Date:** 2026-09-09 (Agent A refresh)  
**Frontend branch:** `cursor/away-sports-live`  
**Backend (read-only):** `/Users/mycomp/.openclaw/workspace/pocketbooks-sports-backend`  
**Live spot-check base:** `https://pocketbooks-sports-backend-production.up.railway.app`  
**Method:** Code-path + fixture/flag wiring audit; cheap live GETs to `/api/odds/:sport`, `/api/props/:sport`, `/api/scores/:sport`, `/api/sports`. No grading/accounting changes. Settlement recording OFF.

## Legend

| Status | Meaning |
|---|---|
| **GOOD** | Wired end-to-end and returning usable data (or empty only for clear off-slate windows with healthy path) |
| **PARTIAL** | Wired but incomplete coverage, seasonal empty, missing score overlay, thin slate, or config-gated |
| **BROKEN** | Wiring contradicts itself or UI claims support the API rejects |
| **NO DATA** | Route exists / polled, but cache currently empty |
| **NOT SUPPORTED** | Explicitly excluded from provider path, props allow-list, or ESPN/Owls scoreboard map |
| **RISKY** | Odds may exist but auto-grade / result identity is unsafe — prefer empty slate over wagering |

## Matrix

| Sport | EVENTS | ODDS | LIVE | SCORES | PROPS | LOGOS / IMAGES |
|---|---|---|---|---|---|---|
| NFL | GOOD | GOOD | PARTIAL | GOOD | GOOD | GOOD |
| MLB | GOOD | GOOD | PARTIAL | GOOD | GOOD | GOOD |
| NBA | GOOD | GOOD | PARTIAL | PARTIAL | GOOD | GOOD |
| NHL | GOOD | GOOD | PARTIAL | PARTIAL | PARTIAL | GOOD |
| NCAAF | GOOD | GOOD | PARTIAL | GOOD | GOOD | GOOD |
| NCAAB | NO DATA | NO DATA | NO DATA | NO DATA | PARTIAL | GOOD |
| Soccer | GOOD | GOOD | GOOD | PARTIAL→improving | NOT SUPPORTED | GOOD |
| Tennis | GOOD | GOOD | GOOD | PARTIAL→improving | NOT SUPPORTED | PARTIAL |
| Golf | GOOD | GOOD | PARTIAL | NOT SUPPORTED | NOT SUPPORTED | PARTIAL |
| Boxing | NO DATA | NO DATA | NO DATA | NOT SUPPORTED | NOT SUPPORTED | PARTIAL |
| MMA | GOOD | GOOD | PARTIAL | NOT SUPPORTED | NOT SUPPORTED | GOOD |
| Rugby | NO DATA | NO DATA | NO DATA | NOT SUPPORTED | NOT SUPPORTED | PARTIAL |
| NASCAR | PARTIAL→empty FE | PARTIAL (futures only) | NO DATA | NOT SUPPORTED | NOT SUPPORTED | PARTIAL |

## TASK 3 — Independent 7-point audit (BOXING / NASCAR / NCAAB / RUGBY)

Policy: **do not enable betting for sports that cannot safely grade.** Prefer **“No events available”** over incomplete wagering.

| # | Checkpoint | BOXING | NASCAR | NCAAB | RUGBY |
|---|---|---|---|---|---|
| 1 | Provider events? | Mapped `boxing_boxing`; **0** live events | Bookmaker v2 `motorsport`→nascar-*; **5 futures/outrights** (no 2-way matchups) | Owls `basketball_ncaab`; **0** (offseason) | Bookmaker v2 `rugby`; **0** |
| 2 | Backend polls? | Map exists; **not always-advertised** like MMA; absent from `/api/sports` | Always polled via Bookmaker v2; catalog `enabled=false` | In `OWLS_SAFE_SPORTS_DEFAULT` / enabled list | Always advertised when Owls; poll wired |
| 3 | Normalization? | Unified v1 odds path | Bookmaker adapter stamps `sport_key=nascar` | Standard basketball normalize | Bookmaker adapter → ML only |
| 4 | API exposes? | `/api/odds/boxing` → `[]` | `/api/odds/nascar` → 5 outright boards | `/api/odds/ncaab` → `[]` | `/api/odds/rugby` → `[]` |
| 5 | FE catalog? | Hardcoded tab; catalog miss → badge 0 | Tab present; FE zeros badge when `enabled=false` | Tab + catalog `empty` | Tab + catalog `empty` |
| 6 | Cards render? | Empty → **No events available** | Outrights **filtered**; empty slate | Empty → **No events available** | Empty → **No events available** |
| 7 | Grading support? | **RISKY** — no scores/results path | **RISKY** — futures only; no matchup grade path | **OK when slate returns** — ESPN + Owls live-score sports + basketball ML/spread/total | **RISKY** — odds only; not in `OWLS_LIVE_SCORE_SPORTS` / no ESPN path |

### Grading gap notes (do not enable until fixed)

- **Boxing** — Needs fight-result / winner feed + always-advertise/poll parity with MMA before any real money path.
- **NASCAR** — Current cache is championship / race-winner / manufacturer boards (`home=Outright`). FE filters these; do not treat futures as gradeable matchups.
- **NCAAB** — Wiring complete; seasonal empty is healthy. Safe to show cards when provider returns games.
- **Rugby** — Bookmaker ML can populate later, but settlement identity lacks scoreboard poll → keep empty-over-wager until scores/results exist.

## Compact per-sport notes

- **NCAAB** — Route + ESPN path + props allow-list present; catalog `sourceStatus=empty`, 0 games (offseason) → NO DATA / PARTIAL props. Grading path exists for when slate returns.
- **Soccer** — Unified Owls feed. Live score overlay now uses deterministic matching + `/api/scores/soccer` hydration; HT / FT / postponed / suspended labels when provider supplies. Still suppress score if identity uncertain.
- **Tennis** — Same matcher; sets / games / current set; retirement / walkover labels when provider supplies. Props not supported (FE allow-list aligned).
- **Boxing** — Missing from `/api/sports`; 0 odds. FE tab remains for discovery; empty slate. Photos share MMA CDN.
- **Rugby** — Catalog row + Bookmaker poll; 0 games. No scores/props.
- **NASCAR** — 5 futures in cache, `enabled=false`. FE filters outrights → **No events available** (safe).

## Wiring sources (authoritative)

| Area | Location |
|---|---|
| FE sport tabs | `player.html` sport tab strip (`nfl`…`rugby`) |
| FE odds routes | `player.html` `_ODDS_ROUTE_KEY`, `_SPORT_CATALOG_ALIASES`, `loadGames` |
| FE props allow-list | `player.html` `_PB_PROPS_SUPPORTED_SPORTS` |
| FE live scores | `scripts/owls-live-scores.js` + `player.html` hydrate (`/api/markets/live`, `/api/odds/live`, `/api/scores/:sport`) |
| FE outright filter | `player.html` `_pbIsOutrightBoard` (golf + nascar) |
| BE Owls map / poll list | backend `OWLS_SPORT_MAP`, `CACHE_SPORTS`, `OWLS_*_TAB_KEYS` |
| BE props allow-list | backend `PROPS_SUPPORTED_SPORTS` + `GET /api/props/:sport` |
| BE ESPN scores | backend `_espnScoreboardPath` (MLB/NBA/WNBA/NFL/NCAAF/NCAAB/NHL only) |
| BE Owls live scores | backend `OWLS_LIVE_SCORE_SPORTS` = soccer, tennis, mlb, nfl, nba, nhl, ncaaf, ncaab |
| BE golf/rugby/nascar | backend Bookmaker v2 (`owls-bookmaker-adapter.js`) — unified v1 odds 404 |

## Live spot-check snapshot (2026-09-09, Agent A)

| Endpoint | Result |
|---|---|
| `/api/sports` | boxing **absent**; nascar `enabled=false` w/ 5 games; ncaab/rugby `empty`; soccer 514; tennis 436 |
| `/api/odds/{sport}` | boxing 0, nascar 5 (all Outright), ncaab 0, rugby 0, soccer 50, tennis 50 |
| `/api/scores/{sport}` | soccer ~16 live rows; tennis ~10; boxing/nascar/ncaab/rugby `[]` |
| `/api/props/{sport}` | boxing/nascar/rugby → `props_not_supported`; ncaab empty-but-ok |

## Frontend fixes on this branch

1. **Props labeling** — removed `tennis` from `_PB_PROPS_SUPPORTED_SPORTS` (matches backend).
2. **Boxing avatars** — `_pbAvatarSportKey` maps boxing → MMA headshot path.
3. **Soccer/tennis/rugby odds routes** — unified rollups (`/api/odds/soccer|tennis|rugby`).
4. **Live overlay 2** — deterministic Owls matching; `/api/scores` hydration; HT/FT/postponed/suspended; tennis sets/games/retirement/walkover; suppress when identity uncertain.
5. **NASCAR/golf outrights** — `_pbIsOutrightBoard` filters futures → empty slate (“No events available”).
6. **Catalog badges** — nascar `enabled=false` and missing boxing catalog entry → count 0.

## Explicit non-goals / blockers

- **No grading, settlement, ledger, or prod financial mutations.**
- **Boxing** always-advertise/poll is a **backend** change (not applied here; BE read-only).
- **NASCAR enablement** vs futures-only slate — FE fails closed to empty; BE should not mark enabled until matchups + grade path exist.
- **Rugby / combat scores** — not in `OWLS_LIVE_SCORE_SPORTS` → NOT SUPPORTED for scoreboard/auto-grade.
- Spot-check only; seasonal emptiness (NCAAB, Rugby, Boxing) may change without code changes.
