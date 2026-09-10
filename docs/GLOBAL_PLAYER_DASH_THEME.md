# Global Player-Dash Theme Pass

**Branch:** `cursor/global-player-dash-theme`  
**Base:** clean FE main `8bbff41` (not `efa7ed7`)  
**Source of truth:** live Player Dashboard tokens in `player.html` (wins over older docs/`#1677FF` host palette)

## Shared tokens (`pb-theme.css` + `--pb-*`)

| Token | Value | Role |
|---|---|---|
| `--pb-bg` | `#070b12` | App floor |
| `--pb-bg-elev` | `#0c121c` | Elevated strips |
| `--pb-card` / `--pb-card2` | `#121a27` / `#162032` | Surfaces |
| `--pb-border` | `#1e2a3c` | Hairlines |
| `--pb-accent` | `#3d8bfd` | Interactive only |
| `--pb-win` | `#3dd68c` | Financial / result positive |
| `--pb-loss` / `--pb-red` | `#ff4d6a` | Financial / result negative |
| `--pb-cyan` | `#5eb1ff` | Secondary highlight |
| `--pb-slip-*` | light sheet + `#00c853` CTA | Bet-slip contrast (intentional) |

Aliases: `--green` → `--pb-accent` (interactive), `--win` → `--pb-win`.

## Legacy colors removed (classification)

| Legacy | Was used as | Disposition |
|---|---|---|
| `#00ff87` / `#00ff88` neon | Interactive tabs, odds sel, auth CTA, nav | **Removed** from interactive → `--pb-accent`; **kept** only as `--pb-slip-bar` / slip sheet |
| `#00c853` | Place-bet CTA + light-theme | **Kept** as `--pb-slip-cta` (financial commit on slip) |
| `#1677FF` / `#080D18` host docs palette | Host + lobby | **Replaced** by dashboard `#3d8bfd` / `#070b12` |
| `#7c3aed` purple | Dev grade / badges | **Removed** from interactive → accent/cyan |
| `#0f0f0f` / `#1a1a1a` early player root | Pre-dashboard | **Replaced** by `--pb-*` first-paint root |
| Flat black survivor (`#0a0a0a`) | Survivor chrome | **Replaced** by dashboard navy + accent |

## Non-goals preserved

- No financial / grading / auth / idempotency / correlation / settlement logic changes  
- Settlement recording remains OFF  
- No local financial fallback  
- Logo/photo text-only failure policy unchanged  
- Nav persistence unchanged  
- No main merge

## Visual QA

Screenshots + grades: `docs/visual-qa/global-player-dash-theme/` (390 / 430 / 768 / 1280 / 1440).  
Token probe: `--pb-bg/#070b12`, `--pb-accent/#3d8bfd`, `--green` aliases accent.
