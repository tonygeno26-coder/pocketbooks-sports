# API Error Contract (FE normalize)

**Date:** 2026-09-09  
**Scope:** Frontend parsing only. No dangerous backend rewrite in this pass.

## Problem

PocketBooks API responses use inconsistent error shapes across routes, for example:

| Shape | Example fields |
|---|---|
| String code | `{ "error": "expired_token" }` |
| Code + message | `{ "error": "membership_not_found", "message": "..." }` |
| Alternate code key | `{ "code": "club_scope_mismatch" }` |
| Provider code | `{ "error_code": "OUT_OF_USAGE_CREDITS" }` |
| Array | `{ "errors": ["stake_above_max", ...] }` |
| Nested | `{ "error": { "code": "...", "message": "..." } }` |
| Human string in `error` | `{ "error": "Cannot POST /api/..." }` |
| Success envelope | `{ "ok": true, ... }` / `{ "ok": false, "error": "..." }` |

## Recommended common contract (BE target)

```json
{
  "ok": false,
  "error": "snake_case_machine_code",
  "message": "Human-readable explanation for UI",
  "details": null
}
```

Rules:

1. `error` is always a stable snake_case code (never a sentence).
2. `message` is safe to show in toasts (no tokens/secrets).
3. `details` is optional structured context (field errors, limits, etc.).
4. HTTP status remains authoritative for transport (401/403/429/5xx).
5. Success responses keep `{ "ok": true, ... }`.

## FE normalize (shipped)

`beta-polish.js` exports:

- `_pbNormalizeApiError(data, status)` → `{ ok:false, error, message, status, details }`
- `_pbErrorToastMessage(data, status)` → string for toasts

`player.html` `api()` and `index.html` `apiCall()` attach `_pbNormalized` on non-OK JSON without deleting original fields. Confirm-bet rejection toasts prefer the normalized message when present.

## Explicit non-goals

- Do not mass-rewrite Railway/backend handlers in this beta polish branch.
- Do not hide meaningful backend failures from the console or UI.
- Do not put tokens, Authorization headers, or passwords into error `details`.
