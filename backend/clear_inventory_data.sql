-- Clear all inventory and batch data to start fresh
-- Run this script to reset the database

BEGIN;

-- Clear transactions first (has foreign keys)
DELETE FROM inventory_transactions;
DELETE FROM transactions;

-- Clear stock-related tables
DELETE FROM hdpe_cut_pieces;
DELETE FROM sprinkler_spare_pieces;
DELETE FROM inventory_stock;

-- Clear batches
DELETE FROM batches;

-- Clear audit logs (optional - keeps history clean)
DELETE FROM audit_logs WHERE entity_type IN ('BATCH', 'STOCK', 'ROLL');

-- Reset any sequence counters if needed
-- This ensures batch numbers start from 1 again

COMMIT;

-- Verify the cleanup
SELECT 'inventory_stock' as table_name, COUNT(*) as row_count FROM inventory_stock
UNION ALL
SELECT 'hdpe_cut_pieces', COUNT(*) FROM hdpe_cut_pieces
UNION ALL
SELECT 'sprinkler_spare_pieces', COUNT(*) FROM sprinkler_spare_pieces
UNION ALL
SELECT 'inventory_transactions', COUNT(*) FROM inventory_transactions
UNION ALL
SELECT 'batches', COUNT(*) FROM batches
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions;
