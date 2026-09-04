-- Migration 026: Club lock/unlock support
--
-- Adds is_locked to clubs table. When true, POST /api/club/join-request
-- returns 403 club_locked and no new member rows are created.
-- Backend toggle endpoint: POST /api/club/toggle-lock (settle_player permission).
-- Frontend toggle UI: host dashboard Settings tab (index.html).
--
-- Default FALSE ensures all existing clubs including
-- d616dc2a-95a6-473a-97b1-7da330878479 remain open after migration.

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- Update schema.sql reference club to confirmed-unlocked state (idempotent).
UPDATE clubs
  SET is_locked = FALSE
  WHERE id = 'd616dc2a-95a6-473a-97b1-7da330878479'
    AND is_locked IS DISTINCT FROM FALSE;
