# SETTLEMENT RECORDING TERMINOLOGY — STATUS

**Date:** 2026-09-09  
**Branches:** FE+BE `cursor/settlement-option-a`  
**PROD WRITE:** NO

## STATUS: SETTLEMENT RECORDING TERMINOLOGY AUDIT — COMPLETE (pushed)

### RENAMES

| Former | New |
|---|---|
| `settlement_payments` (proposed table) | `settlement_records` |
| `payment_id` (PK) | `record_id` |
| `settle_payment_option_a_tx` | `record_settlement_option_a_tx` |
| `SETTLEMENT_OPTION_A_CASH_ENABLED` | `SETTLEMENT_RECORDING_ENABLED` |
| `settlement_cash_disabled` | `settlement_recording_disabled` |
| `overpay_blocked` | `over_settlement_blocked` |
| `settlement_payment` (ledger audit type) | `settlement_record` |
| GET `/settlement-payments` | GET `/settlement-records` (+ legacy alias) |
| POST `/settle-player` | POST `/record-settlement` (+ legacy alias) |
| UI Apply Settlement / Amount to Apply | Record Settlement / Amount Settled / Outstanding / Ledger Position |

### PAYMENT-PROCESSOR LANGUAGE FOUND

- Phase P routes still named `/api/host/settlements/payment*` — path language payment-like; Option A table is `settlement_records`
- `_callMoneyRpc` name is generic RPC wrapper (misleading, not payment rails)
- Direction enums `player_paid_host` / `host_paid_player` retained (off-platform event recorded)
- Diamonds “Send Payment” / live “Offer Cash Out” unrelated to Option A

### BEHAVIOR AS PAYMENT PROCESSOR

**None** in Option A path. Record RPC INSERT only; no `balance_start`/ticket mutation; flag default OFF.

### PROPOSED TABLE NAME

`settlement_records`

### FEATURE FLAG

`SETTLEMENT_RECORDING_ENABLED` (default OFF)

### DOCS/UI UPDATED

YES

### TESTS

BE settlement suite pass; FE settlement-partial-carry-ui pass (at terminology commit)

### PROD WRITE

NO

### SHAs

- BE: `ef78f89`
- FE terminology: `a9dafea`
- FE UX polish: `19adf36`

### RECOMMENDED NEXT

Owner C decisions + staged migrate of `settlement_records` only after approval; keep recording flag OFF until bootstrap verified.
