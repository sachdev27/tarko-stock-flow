-- Add CUT_ROLL to dispatch_items item_type constraint
-- Date: 2025-11-22
-- Purpose: Allow cut rolls to be properly identified in dispatches

BEGIN;

-- Drop the existing constraint
ALTER TABLE dispatch_items DROP CONSTRAINT IF EXISTS dispatch_items_item_type_check;

-- Add new constraint with CUT_ROLL included
ALTER TABLE dispatch_items ADD CONSTRAINT dispatch_items_item_type_check
  CHECK (item_type IN ('FULL_ROLL', 'CUT_ROLL', 'CUT_PIECE', 'BUNDLE', 'SPARE_PIECES'));

COMMIT;
