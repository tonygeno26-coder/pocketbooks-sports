# Notification Center — OWNER-AWAY Task 20

**Date:** 2026-09-09  
**Branch:** `cursor/away-authz-survivor`

## Pass checklist

| Item | Status |
|------|--------|
| Unread badge + unread row styling | OK |
| Mark read on open (`POST /api/notifications/read`) | OK |
| Timestamps (relative + clock) | OK |
| Deduplicate by id / type+title+message+day | OK |
| Survivor types render from server list | OK |
| Cash-out accept/decline when `cashout_offer` | OK |
| Settlement wording sanitized (no payment-processing / Stripe language) | OK |
| Empty state | OK |
| Mobile bottom drawer + backdrop + close | OK |
| No fake / demo notifications | OK |

## Authz

Notifications always scoped to authenticated actor (foreign `playerId` ignored).

## Tests

`node tests/notification-center.test.js`
