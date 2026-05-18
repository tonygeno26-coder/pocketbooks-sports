-- Migration 001: Fix ledger_entries constraints for Phase A mirror compatibility
-- Problem: ticket_id FK and player_id NOT NULL cause insert failures in fire-and-forget mirror
-- Run in Supabase SQL editor

-- 1. Drop FK on ticket_id (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='ledger_entries'
    AND constraint_type='FOREIGN KEY'
    AND constraint_name LIKE '%ticket_id%'
  ) THEN
    ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_ticket_id_fkey;
  END IF;
END$$;

-- 2. Make player_id nullable (was NOT NULL, breaks for guest/anonymous players)
ALTER TABLE ledger_entries ALTER COLUMN player_id DROP NOT NULL;

-- 3. Verify
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'ledger_entries'
ORDER BY ordinal_position;
