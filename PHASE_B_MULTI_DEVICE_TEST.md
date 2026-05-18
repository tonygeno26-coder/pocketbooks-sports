# Phase B Multi-Device Persistence Test

## Goal
Verify that a ticket placed in Browser A appears correctly in Browser B via Supabase,
proving DB-primary reads work across devices.

## Pre-conditions
- Supabase env configured in Railway pocketbooks-sports-backend
- Both browsers on same player/club identity (P1001 or demo-club)
- Vercel live SHA matches GitHub main

---

## Setup

**Both browsers:** Open `https://pocketbooks-sports.vercel.app/player.html`

**Browser A (normal Chrome):**
```js
// Set dev identity in localStorage
localStorage.setItem('pb-player', JSON.stringify({ id:'P1001', username:'testplayer' }))
localStorage.setItem('pb-club',   JSON.stringify({ id:'demo-club' }))
// Reload — DB primary reads should auto-enable (P1001 is in dev list)
// Verify:
checkDbPrimaryReadStatus()   // → { enabled: true }
```

**Browser B (Incognito Chrome):**
```js
localStorage.setItem('pb-player', JSON.stringify({ id:'P1001', username:'testplayer' }))
localStorage.setItem('pb-club',   JSON.stringify({ id:'demo-club' }))
// Reload
checkDbPrimaryReadStatus()   // → { enabled: true }
```

---

## Test Steps

### Step 1: Baseline both browsers

**Browser A:**
```js
runMultiDevicePersistenceCheck()
// Note: localCount, dbCount, lastTicketId
```

**Browser B (Incognito — fresh localStorage):**
```js
runMultiDevicePersistenceCheck()
// Expected: localCount=0, dbCount=X (mirrors from A if any exist)
// status: ✅ counts match (both 0 or same)
```

---

### Step 2: Place bet in Browser A

1. Select MLB game
2. Add moneyline pick ($100)
3. Confirm bet
4. Verify console:
   ```
   [ticket persist] ... localStorageWriteSuccess: true
   [supabase mirror] ticketId: T_xxx success: true
   ```
5. Note the ticketId

---

### Step 3: Reload Browser B (Incognito)

Hard refresh Browser B. Then:

```js
runMultiDevicePersistenceCheck()
// Expected:
//   localCount:    1   ← hydrated from DB
//   dbCount:       1
//   lastTicketId:  T_xxx  ← same as Browser A
//   cacheHydrated: true
//   status:        ✅ counts match
```

**Verify My Bets in Browser B shows the ticket placed in Browser A.**

---

### Step 4: Full persistence audit from Browser B

```js
runFullPersistenceAudit()
// Expected: ✅ FULLY IN SYNC (DB-only ledger rows are warnings, not failures)
```

---

### Step 5: Balance check

Both browsers should show the same available balance:
```js
calcAvailableBalance().available
// Browser A: $900.00 (placed $100)
// Browser B: $900.00 (same — DB is source of truth)
```

---

### Step 6: No duplicates

```js
// Both browsers:
var ids = JSON.parse(localStorage.getItem('pb-tickets')||'[]').map(t=>t.id)
new Set(ids).size === ids.length  // → true (no duplicates)
```

---

### Step 7: Phase B validation

```js
runPhaseBReadValidation()
// Both browsers:
// [Phase B] RESULT: ✅ DB-PRIMARY READS VALIDATED
```

---

## Acceptance Criteria

- [ ] Browser B sees Browser A's ticket after reload
- [ ] Balance identical in both browsers
- [ ] No duplicate tickets
- [ ] `sourceUsed: db` in both browsers
- [ ] `runFullPersistenceAudit()` = ✅ FULLY IN SYNC in both
- [ ] `runPhaseBReadValidation()` = ✅ VALIDATED in both
- [ ] Fallback still works (disable DB reads, localStorage shows same data)

---

## Auto-Enable Identities (dev only)

DB primary reads auto-enable for:
```js
_DEV_PLAYER_IDS = ['P1001', 'dev', 'test', 'demo']
_DEV_CLUB_IDS   = ['demo-club', 'dev-club', 'test-club']
```

Production identities **never** auto-enable. Manual only via:
```js
enableDbPrimaryReadsForSession()
```
