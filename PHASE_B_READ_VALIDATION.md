# Phase B Step 2 — DB-Primary Read Validation Checklist

## Purpose
Controlled validation that Supabase can be used as the primary read source for tickets
without affecting app behavior, balance math, or UI rendering.

**Default: OFF.** Enable per-session only. Never default to DB reads until this checklist
passes cleanly for 7 consecutive sessions.

---

## Pre-Validation Setup

```bash
# Confirm Vercel is serving latest SHA
curl -s https://pocketbooks-sports.vercel.app/build.json
# Expected: sha matches GitHub main

# Confirm backend Supabase env
curl -s https://pocketbooks-sports-backend-production.up.railway.app/api/env-check
# Expected: hasSupabaseUrl: true, hasSupabaseServiceKey: true
```

---

## Validation Steps

### Step 1: Baseline (DB reads OFF)

1. Hard refresh `https://pocketbooks-sports.vercel.app/player.html`
2. Open browser console
3. Verify:
   ```
   [PBS globals] runSupabaseMirrorAudit: function | grade: function ...
   ```
4. Check no stale banner
5. Run:
   ```js
   checkDbPrimaryReadStatus()
   // Expected: { enabled: false }
   ```
6. Note current ticket count and balance:
   ```js
   JSON.parse(localStorage.getItem('pb-tickets')||'[]').length
   calcAvailableBalance().available
   ```
7. ✅ Baseline recorded

---

### Step 2: Enable DB Primary Reads

```js
enableDbPrimaryReadsForSession()
// → 'DB primary reads enabled. Reload or call _initDbPrimaryRead() to apply.'
```

Hard refresh page. Then:

```js
// Should see in console on load:
// [db primary read]
//   enabled:         true
//   sourceUsed:      db    ← must be 'db'
//   localCount:      X
//   dbCount:         X
//   fallbackReason:  none
//   hydrated:        true
//   cacheUpdated:    true
//   status:          ✅ db_primary
```

**Verify debug badge visible** (bottom-left of screen):
```
🗄️ DB | db:X local:X
```

✅ Step 2 pass: sourceUsed = 'db'

---

### Step 3: Place Single Bet

1. Select an MLB game
2. Add moneyline pick
3. Enter $100 stake
4. Confirm bet
5. Verify console:
   ```
   [ticket persist] beforeCount: N afterCount: N+1 localStorageWriteSuccess: true
   [supabase mirror] ticketId: T_xxx success: true
   [supabase mirror] ledger Lxxx type: bet_placed success: true
   ```
6. Verify My Bets shows new ticket
7. Verify balance decreased by $100
8. ✅ Single bet pass

---

### Step 4: Place Parlay

1. Select 2 different games
2. Switch to Parlay tab
3. Enter $25 stake
4. Confirm bet
5. Verify both legs appear in confirmation
6. Verify console shows mirror for ticket + 2 legs
7. ✅ Parlay pass

---

### Step 5: Cancel a Ticket

1. Open My Bets
2. Request Cancel on the single bet
3. Verify ticket status updates
4. Run:
   ```js
   runLedgerMirrorAudit()
   // Expected: localCount === dbCount, status: ✅ in sync
   ```
5. ✅ Cancel pass

---

### Step 6: Full Persistence Audit

```js
runFullPersistenceAudit()
// Expected:
// [supabase mirror audit] status: ✅ in sync
// [supabase leg audit]    status: ✅ in sync
// [supabase ledger audit] status: ✅ in sync
// [supabase full audit]   RESULT: ✅ FULLY IN SYNC
```

✅ Step 6 pass

---

### Step 7: Phase B Read Validation

```js
runPhaseBReadValidation()
// Expected:
// [Phase B] 1. feature flag: ✅ enabled
// [Phase B] 2. backend Supabase env: ✅ configured
// [Phase B] 3. DB read trial: sourceUsed=db fallback=null
// [Phase B] 4. duplicate tickets: ✅ none
// [Phase B] 5. available balance: $X.XX
// [Phase B] RESULT: ✅ DB-PRIMARY READS VALIDATED
```

✅ Step 7 pass

---

### Step 8: Reload Verification

Hard refresh page. Verify:
- Ticket count unchanged
- Balance unchanged
- My Bets shows same tickets (from DB)
- Debug badge shows `🗄️ DB | db:X local:X`
- No tickets duplicated

✅ Step 8 pass

---

### Step 9: Disable + Re-baseline

```js
disableDbPrimaryReadsForSession()
```

Hard refresh. Verify:
- Debug badge gone
- `checkDbPrimaryReadStatus()` → `{ enabled: false }`
- Tickets still visible (from localStorage cache)
- Balance unchanged

✅ Step 9 pass

---

## Fallback Tests (run separately)

### Fallback: DB missing active ticket
1. Manually delete a ticket from Supabase dashboard
2. Reload with DB reads enabled
3. Expected: `fallbackReason: db_missing_active_tickets:T_xxx`
4. Expected: badge shows `📦 Local | ...`
5. Expected: UI unchanged (local data)

### Fallback: DB offline
1. Temporarily remove `SUPABASE_SERVICE_ROLE_KEY` from Railway
2. Reload
3. Expected: `fallbackReason: db_disabled`
4. Expected: localStorage used, no errors

---

## Acceptance Criteria

All must pass before enabling DB reads by default:

- [ ] Step 1: baseline clean
- [ ] Step 2: sourceUsed = 'db' after enable + reload
- [ ] Step 3: single bet mirrors correctly
- [ ] Step 4: parlay mirrors correctly
- [ ] Step 5: cancel ledger entry mirrors
- [ ] Step 6: `runFullPersistenceAudit()` = ✅ FULLY IN SYNC
- [ ] Step 7: `runPhaseBReadValidation()` = ✅ VALIDATED
- [ ] Step 8: reload shows same data
- [ ] Step 9: disable/re-enable works cleanly
- [ ] Zero duplicate tickets ever rendered
- [ ] Balance identical before/after DB reads
- [ ] My Bets layout visually unchanged
- [ ] 7 consecutive clean sessions
