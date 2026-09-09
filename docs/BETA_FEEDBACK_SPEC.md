# Beta Feedback Spec

**Date:** 2026-09-09  
**Status:** FE-only (no production feedback inbox). Spec for a future safe backend.

## UX (shipped)

Settings → **Report a Problem** (player/lobby) and Host header **Report** open a modal that:

1. Captures a short user note
2. Attaches safe diagnostics
3. Copies a JSON report to the clipboard (mailto/backend optional later)

## Captured fields (allowed)

| Field | Source |
|---|---|
| `note` | User text (max 2000 chars) |
| `route` | pathname + query with secrets redacted |
| `host` | `location.hostname` |
| `viewport` | `innerWidth`, `innerHeight`, `devicePixelRatio` |
| `sport` | `_currentSport` when available |
| `build.sha` / `build.date` | `PBS_BUILD_SHA` / `PBS_BUILD_DATE` |
| `role` | `pb-actor-role` only |
| `ua` | truncated user agent |
| `ts` | ISO timestamp |

## Never capture

- `pb-sports-token`, `pb-session-token`, JWT bodies
- Authorization headers
- passwords / Signal secrets
- full `localStorage` dump
- ledger balances beyond what the user typed into the note

## Future backend (owner decision)

Suggested endpoint (not implemented):

`POST /api/beta/feedback`

```json
{
  "ok": true,
  "id": "fb_..."
}
```

Requirements before enabling:

1. Auth required (club session)
2. Rate limit (e.g. 5 / hour / actor)
3. Server-side strip of any token-like strings
4. Store only the allow-listed fields above
5. No automatic PagerDuty / prod financial side effects
