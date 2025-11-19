-- Clear all inventory and transaction data for fresh start
-- This will delete all batches, rolls, and transactions

-- Delete in correct order due to foreign key constraints
DELETE FROM transactions;
DELETE FROM rolls;
DELETE FROM batches;
DELETE FROM audit_logs WHERE entity_type IN ('BATCH', 'TRANSACTION', 'ROLL');

-- Reset sequences if needed (optional)
-- This ensures new records start from clean IDs
-- Uncomment if you want to reset ID sequences
-- ALTER SEQUENCE IF EXISTS transactions_id_seq RESTART WITH 1;
-- ALTER SEQUENCE IF EXISTS rolls_id_seq RESTART WITH 1;
-- ALTER SEQUENCE IF EXISTS batches_id_seq RESTART WITH 1;

-- Vacuum to reclaim space (optional)
VACUUM ANALYZE transactions;
VACUUM ANALYZE rolls;
VACUUM ANALYZE batches;
VACUUM ANALYZE audit_logs;

-- Confirm deletion
SELECT 'Transactions deleted: ' || COUNT(*) FROM transactions;
SELECT 'Rolls deleted: ' || COUNT(*) FROM rolls;
SELECT 'Batches deleted: ' || COUNT(*) FROM batches;
