# Sportsbook dark-logo contrast (follow-up)

**Branch:** `cursor/sportsbook-dark-logo-contrast`  
**Base:** `main` @ `d1b5925` (sportsbook board merged)

## Scope

Visual-only edge separation for dark official marks on PocketBooks dark cards.

- No logo recolor
- No white boxes / circles
- Transparent background preserved
- Aspect ratio preserved (`object-fit: contain`)
- Subtle drop-shadow rim tiers: default / `soft` / `strong`
- Team-specific overrides only for known dark outliers (Yankees, Rockies, White Sox, Nets, Raiders, …)
- No betting / accounting / API / settlement changes

## Owner review

DEV gallery: `docs/visual-qa/logo-presence-gallery.html`  
Fixture: `docs/visual-qa/sportsbook-card-fixture.html`

**Do not merge without owner visual PASS.**
