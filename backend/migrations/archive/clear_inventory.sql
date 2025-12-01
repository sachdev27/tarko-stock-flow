-- Clear Inventory Script
-- WARNING: This will delete all production batches, rolls, and related transactions
-- Use with caution!

BEGIN;

-- Delete all transactions (keep audit trail in audit_logs)
DELETE FROM transactions WHERE deleted_at IS NULL;

-- Delete all rolls
DELETE FROM rolls WHERE deleted_at IS NULL;

-- Delete all batches
DELETE FROM batches WHERE deleted_at IS NULL;

-- Reset sequences if needed
-- (PostgreSQL doesn't need this for UUIDs)

COMMIT;

-- To verify:
SELECT 'Batches remaining:' as info, COUNT(*) as count FROM batches WHERE deleted_at IS NULL
UNION ALL
SELECT 'Rolls remaining:', COUNT(*) FROM rolls WHERE deleted_at IS NULL
UNION ALL
SELECT 'Transactions remaining:', COUNT(*) FROM transactions WHERE deleted_at IS NULL;
