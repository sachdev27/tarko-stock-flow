-- Clear all inventory, transaction, and audit data
-- Run these in order to respect foreign key constraints

-- 1. Delete transactions
DELETE FROM transactions;

-- 2. Delete rolls
DELETE FROM rolls;

-- 3. Delete cut_rolls
DELETE FROM cut_rolls;

-- 4. Delete spare_pipes
DELETE FROM spare_pipes;

-- 5. Delete batches
DELETE FROM batches;

-- 6. Delete product_variants
DELETE FROM product_variants;

-- 7. Delete audit logs
DELETE FROM audit_logs;

-- Verify cleanup
SELECT
    (SELECT COUNT(*) FROM transactions) as transactions_count,
    (SELECT COUNT(*) FROM rolls) as rolls_count,
    (SELECT COUNT(*) FROM cut_rolls) as cut_rolls_count,
    (SELECT COUNT(*) FROM spare_pipes) as spare_pipes_count,
    (SELECT COUNT(*) FROM batches) as batches_count,
    (SELECT COUNT(*) FROM product_variants) as product_variants_count,
    (SELECT COUNT(*) FROM audit_logs) as audit_logs_count;
