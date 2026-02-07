-- Migration: Cut Piece Schema Redesign (1:1 piece-to-stock model)
-- Date: 2026-02-07
-- Purpose: Create 1:1 relationship between cut pieces and inventory_stock entries
--          Each cut piece gets its own stock entry for clean identity management

BEGIN;

-- ============================================================================
-- PHASE 1: SCHEMA CHANGES
-- ============================================================================

-- 1a. Add CUT_PIECE and SPARE_PIECE to stock_type constraint
ALTER TABLE inventory_stock
DROP CONSTRAINT IF EXISTS inventory_stock_stock_type_check;

ALTER TABLE inventory_stock
ADD CONSTRAINT inventory_stock_stock_type_check
CHECK (stock_type = ANY (ARRAY[
    'FULL_ROLL'::text,
    'CUT_ROLL'::text,
    'CUT_PIECE'::text,
    'BUNDLE'::text,
    'SPARE'::text,
    'SPARE_PIECE'::text
]));

-- 1b. Add length_meters column to inventory_stock for CUT_PIECE entries
ALTER TABLE inventory_stock
ADD COLUMN IF NOT EXISTS length_meters numeric;

COMMENT ON COLUMN inventory_stock.length_meters IS
'Length in meters for CUT_PIECE type stock entries. NULL for other stock types.';

-- 1c. Add piece_id column to inventory_stock (FK to hdpe_cut_pieces)
ALTER TABLE inventory_stock
ADD COLUMN IF NOT EXISTS piece_id uuid;

-- Add FK constraint (initially without strict enforcement for migration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_piece'
    ) THEN
        ALTER TABLE inventory_stock
        ADD CONSTRAINT fk_stock_piece
        FOREIGN KEY (piece_id) REFERENCES hdpe_cut_pieces(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 1d. Create unique index on piece_id (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_stock_piece_id
ON inventory_stock(piece_id)
WHERE piece_id IS NOT NULL;

COMMENT ON COLUMN inventory_stock.piece_id IS
'For CUT_PIECE entries: links back to the hdpe_cut_pieces record. 1:1 relationship.';

-- ============================================================================
-- PHASE 2: DATA MIGRATION - Create stock entries for existing cut pieces
-- ============================================================================

-- 2a. Create a new inventory_stock entry for each existing cut piece
INSERT INTO inventory_stock (
    id,
    batch_id,
    product_variant_id,
    status,
    stock_type,
    quantity,
    length_meters,
    parent_stock_id,
    piece_id,
    notes,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid() as id,
    ist.batch_id,
    ist.product_variant_id,
    hcp.status,
    'CUT_PIECE' as stock_type,
    1 as quantity,
    hcp.length_meters,
    hcp.stock_id as parent_stock_id,  -- Link to original CUT_ROLL stock
    hcp.id as piece_id,
    'Migrated from CUT_ROLL aggregate: ' || hcp.stock_id::text as notes,
    hcp.created_at,
    NOW() as updated_at
FROM hdpe_cut_pieces hcp
JOIN inventory_stock ist ON hcp.stock_id = ist.id
WHERE hcp.deleted_at IS NULL
  AND ist.stock_type = 'CUT_ROLL'  -- Only migrate from CUT_ROLL aggregates
  AND NOT EXISTS (
      -- Don't create duplicates if already migrated
      SELECT 1 FROM inventory_stock
      WHERE piece_id = hcp.id AND stock_type = 'CUT_PIECE'
  );

-- 2b. Update each piece's stock_id to point to its new 1:1 stock entry
UPDATE hdpe_cut_pieces hcp
SET stock_id = new_stock.id,
    updated_at = NOW()
FROM inventory_stock new_stock
WHERE new_stock.piece_id = hcp.id
  AND new_stock.stock_type = 'CUT_PIECE'
  AND hcp.stock_id != new_stock.id;  -- Only update if not already pointing to new stock

-- ============================================================================
-- PHASE 3: CLEANUP - Mark old CUT_ROLL aggregates
-- ============================================================================

-- 3a. Set old CUT_ROLL entries to SOLD_OUT (they're now empty containers)
UPDATE inventory_stock
SET status = 'SOLD_OUT',
    quantity = 0,
    notes = COALESCE(notes, '') || ' [MIGRATED 2026-02-07: pieces now have individual CUT_PIECE stock entries]',
    updated_at = NOW()
WHERE stock_type = 'CUT_ROLL'
  AND id IN (
      SELECT DISTINCT parent_stock_id
      FROM inventory_stock
      WHERE stock_type = 'CUT_PIECE' AND parent_stock_id IS NOT NULL
  )
  AND status != 'SOLD_OUT';

-- ============================================================================
-- PHASE 4: VERIFICATION
-- ============================================================================

-- Log migration stats
DO $$
DECLARE
    piece_count integer;
    new_stock_count integer;
    migrated_roll_count integer;
BEGIN
    SELECT COUNT(*) INTO piece_count FROM hdpe_cut_pieces WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO new_stock_count FROM inventory_stock WHERE stock_type = 'CUT_PIECE';
    SELECT COUNT(*) INTO migrated_roll_count FROM inventory_stock WHERE stock_type = 'CUT_ROLL' AND status = 'SOLD_OUT';

    RAISE NOTICE 'Migration complete:';
    RAISE NOTICE '  - Active cut pieces: %', piece_count;
    RAISE NOTICE '  - New CUT_PIECE stock entries: %', new_stock_count;
    RAISE NOTICE '  - Migrated CUT_ROLL entries: %', migrated_roll_count;

    IF piece_count != new_stock_count THEN
        RAISE WARNING 'MISMATCH: piece count (%) != stock entry count (%) - verify migration!', piece_count, new_stock_count;
    ELSE
        RAISE NOTICE '  ✓ Counts match - migration successful';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT (run manually if needed)
-- ============================================================================
/*
BEGIN;

-- Restore piece stock_id to parent (original CUT_ROLL)
UPDATE hdpe_cut_pieces hcp
SET stock_id = ist.parent_stock_id
FROM inventory_stock ist
WHERE ist.piece_id = hcp.id
  AND ist.stock_type = 'CUT_PIECE'
  AND ist.parent_stock_id IS NOT NULL;

-- Restore CUT_ROLL status
UPDATE inventory_stock
SET status = 'IN_STOCK',
    quantity = (
        SELECT COUNT(*) FROM hdpe_cut_pieces
        WHERE stock_id = inventory_stock.id AND deleted_at IS NULL AND status = 'IN_STOCK'
    ),
    notes = REPLACE(notes, ' [MIGRATED 2026-02-07: pieces now have individual CUT_PIECE stock entries]', '')
WHERE stock_type = 'CUT_ROLL'
  AND notes LIKE '%MIGRATED 2026-02-07%';

-- Delete CUT_PIECE stock entries
DELETE FROM inventory_stock WHERE stock_type = 'CUT_PIECE';

-- Remove new columns (optional)
-- ALTER TABLE inventory_stock DROP COLUMN IF EXISTS piece_id;
-- ALTER TABLE inventory_stock DROP COLUMN IF EXISTS length_meters;

COMMIT;
*/
