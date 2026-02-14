-- Migration: Transaction Architecture Cleanup
-- Date: 2026-02-07
-- Purpose: Clean up transaction tables - drop ghost roll_id column, create unified view

BEGIN;

-- ============================================================================
-- PHASE 1: DROP GHOST COLUMN
-- ============================================================================

-- Drop the roll_id column that references non-existent 'rolls' table
-- First drop any comments on it
COMMENT ON COLUMN public.transactions.roll_id IS NULL;

-- Drop the column
ALTER TABLE transactions DROP COLUMN IF EXISTS roll_id;

-- ============================================================================
-- PHASE 2: CREATE UNIFIED TRANSACTION VIEW
-- ============================================================================

-- Create a unified view for consolidated reporting across both tables
CREATE OR REPLACE VIEW unified_transaction_history AS

-- Modern inventory_transactions (primary operational source)
SELECT
    it.id,
    it.transaction_type,
    'inventory_transactions' as source_table,
    it.from_stock_id,
    it.to_stock_id,
    it.from_quantity as quantity,
    it.from_length as length_meters,
    it.batch_id,
    it.dispatch_id,
    it.dispatch_item_id,
    it.cut_piece_details,
    it.notes,
    it.created_by,
    it.created_at,
    it.reverted_at,
    it.reverted_by,
    NULL::jsonb as roll_snapshot,
    NULL::uuid as customer_id,
    NULL::text as invoice_no
FROM inventory_transactions it
WHERE it.reverted_at IS NULL  -- Exclude reverted transactions

UNION ALL

-- Legacy transactions (for historical PRODUCTION records with snapshots)
SELECT
    t.id,
    t.transaction_type::text,
    'transactions' as source_table,
    NULL::uuid as from_stock_id,
    NULL::uuid as to_stock_id,
    t.quantity_change::integer as quantity,
    NULL::numeric as length_meters,
    t.batch_id,
    t.dispatch_id,
    NULL::uuid as dispatch_item_id,
    NULL::jsonb as cut_piece_details,
    t.notes,
    t.created_by,
    t.created_at,
    NULL::timestamp with time zone as reverted_at,
    NULL::uuid as reverted_by,
    t.roll_snapshot,
    t.customer_id,
    t.invoice_no
FROM transactions t
WHERE t.deleted_at IS NULL;

COMMENT ON VIEW unified_transaction_history IS
'Unified view combining transactions (legacy batch-level) and inventory_transactions (modern stock-level) for consolidated reporting. Use source_table column to identify origin.';

-- ============================================================================
-- PHASE 3: VERIFICATION
-- ============================================================================

DO $$
DECLARE
    transactions_count integer;
    inventory_transactions_count integer;
    unified_count integer;
BEGIN
    SELECT COUNT(*) INTO transactions_count FROM transactions WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO inventory_transactions_count FROM inventory_transactions WHERE reverted_at IS NULL;
    SELECT COUNT(*) INTO unified_count FROM unified_transaction_history;

    RAISE NOTICE 'Cleanup complete:';
    RAISE NOTICE '  - Transactions (legacy): %', transactions_count;
    RAISE NOTICE '  - Inventory transactions: %', inventory_transactions_count;
    RAISE NOTICE '  - Unified view total: %', unified_count;

    IF transactions_count + inventory_transactions_count = unified_count THEN
        RAISE NOTICE '  ✓ Counts match - view working correctly';
    ELSE
        RAISE WARNING 'Count mismatch! Expected %, got %',
            transactions_count + inventory_transactions_count, unified_count;
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT (run manually if needed)
-- ============================================================================
/*
BEGIN;

-- Re-add roll_id column
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS roll_id uuid;
COMMENT ON COLUMN public.transactions.roll_id IS
'Reference to specific roll - enables roll-level transaction tracking';

-- Drop the unified view
DROP VIEW IF EXISTS unified_transaction_history;

COMMIT;
*/
