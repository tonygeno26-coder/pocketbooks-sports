# PocketBooks Sports — Regression Test Suite

Run this checklist before every deployment. All items must pass.

---

## 1. BET SLIP — OPEN / CLOSE

| # | Test | Expected | Pass |
|---|------|----------|------|
| 1.1 | Tap any odds cell | Bet slip opens, pick appears | ☐ |
| 1.2 | Tap ✕ in header | Bet slip closes | ☐ |
| 1.3 | Tap overlay (dark area outside slip) | Bet slip closes | ☐ |
| 1.4 | After close, tap league tabs | Tabs respond (no click-blocking) | ☐ |
| 1.5 | After close, tap bottom nav | Nav responds (no click-blocking) | ☐ |
| 1.6 | After close, tap odds cells | Cells respond, new slip opens | ☐ |
| 1.7 | Open slip, close, reopen | Stake input is blank | ☐ |

---

## 2. SINGLES BET FLOW

| # | Test | Expected | Pass |
|---|------|----------|------|
| 2.1 | Add 1 pick | Slip shows 1 card in Singles tab | ☐ |
| 2.2 | Add 6 picks | Slip shows 6 cards, count badge = 6 | ☐ |
| 2.3 | Type $80 in Stake All | All 6 cards update to $80 stake | ☐ |
| 2.4 | Each card shows payout label | e.g. "Payout: $141.06" per card | ☐ |
| 2.5 | Footer shows "Place 6 Bets $480.00" | Button text = risk, not payout | ☐ |
| 2.6 | Payout row shows "Total Payout $X" | Sum of all leg payouts | ☐ |
| 2.7 | Backspace in Stake All | All cards update, payout labels update | ☐ |
| 2.8 | Click X on one leg | Leg removed, count = 5, odds/payout recalc | ☐ |
| 2.9 | Remove leg below 1 | Slip shows empty state | ☐ |
| 2.10 | Click Place 6 Bets | Confirm sheet opens | ☐ |
| 2.11 | Confirm sheet header | Shows "Singles · 6 picks" | ☐ |
| 2.12 | Confirm sheet legs | Each pick shows Risk → Payout | ☐ |
| 2.13 | Confirm sheet footer | Shows Current Balance, Risk, Total Payout, Remaining Balance | ☐ |
| 2.14 | Footer button label | "Confirm 6 Bets →" | ☐ |
| 2.15 | Cancel button | Closes confirm sheet, slip remains open | ☐ |
| 2.16 | Click Confirm 6 Bets | Console shows [CONFIRM BUTTON CLICKED] | ☐ |
| 2.17 | After confirm | Balance deducted by $480 immediately | ☐ |
| 2.18 | My Bets tab | Shows 6 separate Single tickets | ☐ |
| 2.19 | Each ticket | Correct pick, odds, stake, payout | ☐ |
| 2.20 | Bet slip | Cleared after confirm | ☐ |
| 2.21 | Toast | "✅ 6 bets placed · Balance: $X" | ☐ |

---

## 3. PARLAY BET FLOW

| # | Test | Expected | Pass |
|---|------|----------|------|
| 3.1 | Add 2 picks, switch to Parlay tab | Parlay card shows combined odds | ☐ |
| 3.2 | Type $100 wager | Footer: "Place Parlay $100.00" | ☐ |
| 3.3 | Total Payout row | Combined payout shown | ☐ |
| 3.4 | Click X on one leg | Leg removed, odds recalc, auto-switch to Singles if <2 | ☐ |
| 3.5 | Click Place Parlay | Confirm sheet opens | ☐ |
| 3.6 | Confirm footer | Correct combined risk/payout/profit | ☐ |
| 3.7 | Click Confirm | 1 combined Parlay ticket created | ☐ |
| 3.8 | My Bets | Shows 1 Parlay ticket with all legs | ☐ |
| 3.9 | Balance deducted | Exactly $100 | ☐ |
| 3.10 | SGP (same-game parlay) | Warning shown, 0.75 discount applied | ☐ |

---

## 4. TEASER BET FLOW

| # | Test | Expected | Pass |
|---|------|----------|------|
| 4.1 | Add 2+ spread/total picks, switch to Teaser | Teaser table shows adjusted lines | ☐ |
| 4.2 | Toggle +6 / +6.5 / +7 pills | Lines update, odds update | ☐ |
| 4.3 | ML picks show warning | "X moneyline pick(s) excluded" | ☐ |
| 4.4 | Enter wager, click Place Teaser | Confirm sheet shows teaser odds/payout | ☐ |
| 4.5 | Confirm | 1 Teaser ticket, correct payout math | ☐ |

---

## 5. ROUND ROBIN BET FLOW

| # | Test | Expected | Pass |
|---|------|----------|------|
| 5.1 | Add 4 picks, switch to R.Robin | Size rows shown (2-pick, 3-pick) | ☐ |
| 5.2 | Enter $10 per 2-pick combo | 6 combos × $10 = $60 risk shown | ☐ |
| 5.3 | Payout per row | e.g. "Est. Payout: $218.67" per size | ☐ |
| 5.4 | Place Round Robin | Confirm sheet opens with correct totals | ☐ |
| 5.5 | Confirm | 1 RR ticket, correct risk/payout | ☐ |
| 5.6 | Math check (6 legs, -110 each, $10/2-pick) | Risk $150, Payout ~$546 | ☐ |

---

## 6. BALANCE SYSTEM

| # | Test | Expected | Pass |
|---|------|----------|------|
| 6.1 | Starting balance | Shows $1,000.00 on fresh state | ☐ |
| 6.2 | After $100 bet placed | Balance shows $900.00 immediately | ☐ |
| 6.3 | Debug banner | "BALANCE RECALCULATED · Starting: $1000 · Open Risk: $100 · Available: $900" | ☐ |
| 6.4 | Balance derives from tickets | availableBalance = starting - openRisk + settledGains + refunds | ☐ |
| 6.5 | Balance display elements | player-balance-display, header-balance updated on every change | ☐ |
| 6.6 | Insufficient balance | Confirm button disabled, warning shown | ☐ |
| 6.7 | Ledger entries | pb-ledger in localStorage, one entry per bet | ☐ |

---

## 7. MY BETS TAB

| # | Test | Expected | Pass |
|---|------|----------|------|
| 7.1 | My Bets tab after singles | Shows 6 Active tickets | ☐ |
| 7.2 | Each ticket card | Type, picks, odds, Risk / To Win / Est Payout | ☐ |
| 7.3 | Ticket ID shown | e.g. "Ticket: T1234567890" | ☐ |
| 7.4 | Active vs Settled sections | Active bets shown separately | ☐ |
| 7.5 | Check Results button | Present on My Bets header | ☐ |
| 7.6 | Canceled ticket | Shows "BET CANCELED" badge + refund note | ☐ |
| 7.7 | Delete Requested ticket | Shows "DELETE REQUESTED" badge + "⏳ Waiting…" | ☐ |

---

## 8. BET DELETE REQUEST FLOW (PLAYER)

| # | Test | Expected | Pass |
|---|------|----------|------|
| 8.1 | Active ticket → "✕ Request Delete" button | Button visible and clickable | ☐ |
| 8.2 | Click Request Delete | Modal opens: "Request bet deletion?" | ☐ |
| 8.3 | Cancel button | Modal closes, bet unchanged | ☐ |
| 8.4 | Send Request | bet.deleteRequestStatus = 'pending', badge changes | ☐ |
| 8.5 | After request sent | Button disabled, "⏳ Waiting for host approval…" | ☐ |
| 8.6 | Duplicate request prevented | Can't click again on same bet | ☐ |

---

## 9. HOST APPROVE / DENY FLOW

| # | Test | Expected | Pass |
|---|------|----------|------|
| 9.1 | Host Bets tab | Red "⚠️ Delete Requests Pending" section appears | ☐ |
| 9.2 | Request card | Shows player name, ticket ID, risk, payout, request time | ☐ |
| 9.3 | Deny button | Bet stays active, player sees "❌ Delete request denied" | ☐ |
| 9.4 | Approve Delete | Bet status → "canceled" | ☐ |
| 9.5 | After approval | Player balance refunded (riskAmount restored) | ☐ |
| 9.6 | Refund note | My Bets shows "✅ Bet canceled · $X refunded" | ☐ |
| 9.7 | Canceled bet excluded | Not counted in Handle, Hold%, Profit, At Risk | ☐ |
| 9.8 | Audit fields on ticket | canceledAt, canceledBy, refundAmount, cancellationReason | ☐ |

---

## 10. HOST DASHBOARD STATS

| # | Test | Expected | Pass |
|---|------|----------|------|
| 10.1 | Handle | Sum of riskAmount on active + settled (not canceled/voided) | ☐ |
| 10.2 | Settled Hold % | hostProfit / settledHandle × 100 (shows "—" if no settled bets) | ☐ |
| 10.3 | Profit | Sum(riskAmount on lost) - Sum(potentialProfit on won) | ☐ |
| 10.4 | Host Exposure | Sum of potentialProfit on active bets (not player wager) | ☐ |
| 10.5 | Active Bets count | Correct count, updates after cancel | ☐ |
| 10.6 | Stats refresh | Updates when Bets tab is opened | ☐ |

---

## 11. RETURN TO LOBBY NAVIGATION

| # | Test | Expected | Pass |
|---|------|----------|------|
| 11.1 | Player ← button | Navigates to lobby.html | ☐ |
| 11.2 | Host ← button | Navigates to lobby.html | ☐ |
| 11.3 | Lobby loads | Shows Join Club / Create Club / My Clubs (not sign-in) | ☐ |
| 11.4 | localStorage preserved | pb-tickets, pb-balance-start, pb-clubs all intact | ☐ |
| 11.5 | Console confirms | "[FIXED] lobby forced before auth gate" | ☐ |
| 11.6 | Refresh on lobby | Still shows lobby home (not sign-in) | ☐ |
| 11.7 | No sign-in if state exists | Any pb-* key = bypass auth gate | ☐ |

---

## 12. CONFIRM SHEET LAYOUT

| # | Test | Expected | Pass |
|---|------|----------|------|
| 12.1 | Sheet opens | Slides up within bet slip (not a page overlay) | ☐ |
| 12.2 | Header fixed | Drag handle + title + ✕ always visible at top | ☐ |
| 12.3 | Leg list scrolls | Can scroll through all picks | ☐ |
| 12.4 | Footer always visible | Cancel + Confirm buttons never hidden | ☐ |
| 12.5 | Summary visible | Current Balance / Risk / Total Payout / Remaining Balance in footer | ☐ |
| 12.6 | Scrolling doesn't hide buttons | Scroll leg list fully — buttons still present | ☐ |
| 12.7 | Cancel from header ✕ | Closes sheet, returns to slip | ☐ |
| 12.8 | Cancel from footer | Same behavior | ☐ |

---

## 13. MOBILE LAYOUT

| # | Test | Expected | Pass |
|---|------|----------|------|
| 13.1 | Bet slip on iPhone | Full width, 85vh, rounded top corners | ☐ |
| 13.2 | Stake input accessible | Not hidden behind keyboard or button | ☐ |
| 13.3 | Place Bet button | Visible above entry footer, not overlapping input | ☐ |
| 13.4 | Bottom nav | Always visible, all 5 tabs tappable | ☐ |
| 13.5 | Safe area padding | No content behind iPhone home indicator | ☐ |
| 13.6 | Confirm sheet on mobile | All elements visible, no cut-off | ☐ |
| 13.7 | Scrolling in confirm body | Touch scroll works | ☐ |

---

## 14. CLICK BLOCKING (REGRESSION)

| # | Test | Expected | Pass |
|---|------|----------|------|
| 14.1 | Open bet slip | Slip interactive, all tabs clickable | ☐ |
| 14.2 | Close bet slip | Page fully interactive, no invisible blocker | ☐ |
| 14.3 | Parlay X buttons | Each X removes leg, no click-through failure | ☐ |
| 14.4 | Teaser X buttons | Same | ☐ |
| 14.5 | Singles X buttons | Same | ☐ |
| 14.6 | Tab switching | Singles/Parlay/Teaser/RR tabs all respond | ☐ |
| 14.7 | After confirm sheet closes | Bet slip tabs responsive again | ☐ |
| 14.8 | elementFromPoint check | After close: returns content element, not .dkslip or overlay | ☐ |

---

## 15. PAYOUT MATH VERIFICATION

| # | Test | Expected | Pass |
|---|------|----------|------|
| 15.1 | $14 at -108 | Profit: $12.96, Payout: $26.96 | ☐ |
| 15.2 | $100 at +100 | Profit: $100.00, Payout: $200.00 | ☐ |
| 15.3 | $100 at -110 | Profit: $90.91, Payout: $190.91 | ☐ |
| 15.4 | Parlay 2-leg (-110 × -110) | Combined decimal ≈ 3.644, $100 → $364.40 | ☐ |
| 15.5 | RR 6-leg 2-pick $10 each | 15 combos, risk $150, payout ~$546.69 | ☐ |
| 15.6 | No double-counting risk | Button shows stake, not payout | ☐ |
| 15.7 | Confirm modal math | Risk + Profit = Est. Payout | ☐ |

---

## 15. CONFIRM SNAPSHOT (BUG #5 — stake immutability)

`openBetConfirm` captures a frozen snapshot of `bsType`, `betSlip`, `bsStakes`,
`rrStakes`, `teaserPts`, plus computed `risk`/`payout`/`profit`. `confirmBet`
reads ONLY from this snapshot — live globals are not consulted. The snapshot is
cleared by `closeBetConfirm`, `clearSlip`, and after a successful confirm.

| #    | Test                                                                                       | Expected                                                            | Pass |
|------|--------------------------------------------------------------------------------------------|---------------------------------------------------------------------|------|
| 15.1 | Add 1 pick, $50, open Confirm, paste "9999" into stake input, click Confirm               | Ticket riskAmount = $50 (NOT $9999); balance debit = $50            | ☐    |
| 15.2 | Add 2 picks (singles, $40 each), open Confirm, edit one Stake All to $200, click Confirm | Two tickets each riskAmount $40 (snapshot frozen, not $200/leg)     | ☐    |
| 15.3 | Add 3 picks, switch to Parlay, $100, open Confirm, switch tab to Singles in slip background, click Confirm | Single Parlay ticket created (not 3 singles); riskAmount $100        | ☐    |
| 15.4 | Open RR Confirm with $10 by-2s, open browser console: `rrStakes[2]=99999; rrStakes[3]=500`, click Confirm | RR ticket riskAmount = $30 (3 combos × $10 snapshot)                | ☐    |
| 15.5 | Open Teaser Confirm with 6-pt, change pill to 7-pt in slip background, click Confirm     | Ticket placed under 6-pt teaser odds (snapshot)                     | ☐    |
| 15.6 | Open Confirm, click Cancel, then console: `confirmBet()`                                  | Toast "Bet expired · reopen confirmation"; no ticket written         | ☐    |
| 15.7 | Open Confirm, hit Confirm successfully, check `_pendingSnapshot` in console               | `null` after success                                                | ☐    |
| 15.8 | Open Confirm, modify slip in background (add leg), click Confirm                          | Only original snapshot legs ticketed (phantom leg ignored)          | ☐    |
| 15.9 | Sequential opens: open with $25, close, change to $75, open, confirm                      | Ticket riskAmount = $75 (latest snapshot wins)                      | ☐    |

**Automated coverage:** `/tmp/pb-snapshot-regression.mjs` — 36/36 tests pass
including frozenness, late-mutation isolation, multi-cycle snapshot independence,
and snapshot invalidation on close/clear/success.

---

## Quick Smoke Test (run before every deploy)

```
1. Fresh browser / incognito tab
2. Open player.html
3. Add 3 picks → switch to Parlay → wager $50 → Place Parlay → Confirm
4. Check: balance deducted, 1 ticket in My Bets, slip cleared
5. Open same ticket, click Request Delete
6. Open host dashboard, approve delete
7. Check: balance restored, ticket shows BET CANCELED
8. Click ← Return to Lobby
9. Check: lobby home shows (not sign-in)
10. All pass = green for deploy
```

---

*Last updated: 2026-05-06*
*Update this file whenever a new feature or bug fix is added.*
