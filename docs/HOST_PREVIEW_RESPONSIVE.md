# Host preview / responsive final

**Branch:** `cursor/host-preview-responsive`  
**Base:** `cursor/host-risk-console` @ `fe320a4` (Host Risk Console overview)  
**Ported lineage:** morning `cursor/ux-host` responsive fixes (`46e93fc`…`440c07f`) + residual 390 harden  
**Scope:** design / display only — no settlement math or recording changes. Settlement recording remains as-shipped (QA does not exercise write paths).

## Why this base

Morning merge-gate residual **H3** (390 right-edge / Settle crop) lived on `cursor/ux-host`, but the active host overview tip is **Host Risk Console**, which lacked `?preview=1` escape and the five-tab / shell containment fixes. Building on HRC + porting/hardening ux-host containment closes preview + residual in one place.

## Fixes

1. **`?preview=1` auth escape** — top boot returns before lobby/JWT redirects (visual QA parity).
2. **Mobile shell pin (≤480)** — `.bnav` `left:0;right:0;transform:none;width:100%;max-width:100%` (no translate centering).
3. **Avoid `100vw`** — use `100%` so scrollbar gutter cannot re-crop Settle on 390.
4. **Five-tab nav** — `.bn{flex:1 1 0;min-width:0}` + no `overflow:hidden` on `.bnav`.
5. **Narrow MQ** — `@media (max-width:430px)` replaces mislabeled 375-only “390 phones” block.
6. **Modal / Settle containment** — sheets `max-width:min(430px,100%)`; settlements section `overflow-x:hidden`.
7. **HRC grids** — `minmax(0,1fr)` + shared `min-width:0` on overview shells.

## Widths checked

390 · 430 · 768 · 1024 · 1280 · 1440 (`?preview=1`)

## Residual

Cosmetic note ellipsis / empty backend banners in preview remain acceptable (MINOR). Device Safari spot-check still recommended once.
