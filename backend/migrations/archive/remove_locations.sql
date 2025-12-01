-- Migration to remove location feature
-- This removes location_id from batches and transactions tables

-- Remove location indexes
DROP INDEX IF EXISTS idx_batches_location;
DROP INDEX IF EXISTS idx_transactions_from_location;
DROP INDEX IF EXISTS idx_transactions_to_location;

-- Drop views that depend on location columns
DROP VIEW IF EXISTS transaction_history CASCADE;

-- Remove location_id columns from batches
ALTER TABLE batches DROP COLUMN IF EXISTS location_id;

-- Remove location columns from transactions
ALTER TABLE transactions DROP COLUMN IF EXISTS from_location_id CASCADE;
ALTER TABLE transactions DROP COLUMN IF EXISTS to_location_id CASCADE;

-- Note: We keep the locations table in case it's needed in the future
-- but it won't be actively used
