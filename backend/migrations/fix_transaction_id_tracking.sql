-- Fix transaction_id tracking to be immutable and add proper operation tracking
-- This fixes the critical bug where COMBINE_SPARES overwrites the original transaction_id

-- Step 1: Add new columns for proper tracking
-- created_by_transaction_id: Immutable - set when piece is created, NEVER changed
-- last_modified_by_transaction_id: Tracks last operation that modified the piece
-- deleted_by_transaction_id: For inventory_stock soft deletes, tracks which transaction deleted it

-- For sprinkler_spare_pieces
ALTER TABLE sprinkler_spare_pieces
ADD COLUMN IF NOT EXISTS created_by_transaction_id UUID,
ADD COLUMN IF NOT EXISTS last_modified_by_transaction_id UUID;

-- For hdpe_cut_pieces
ALTER TABLE hdpe_cut_pieces
ADD COLUMN IF NOT EXISTS created_by_transaction_id UUID,
ADD COLUMN IF NOT EXISTS last_modified_by_transaction_id UUID;

-- For inventory_stock
ALTER TABLE inventory_stock
ADD COLUMN IF NOT EXISTS deleted_by_transaction_id UUID;

-- Step 2: Migrate existing data
-- For pieces that have transaction_id, copy it to created_by_transaction_id
-- (Assume current transaction_id is the creator)
UPDATE sprinkler_spare_pieces
SET created_by_transaction_id = transaction_id
WHERE transaction_id IS NOT NULL
AND created_by_transaction_id IS NULL;

UPDATE hdpe_cut_pieces
SET created_by_transaction_id = transaction_id
WHERE transaction_id IS NOT NULL
AND created_by_transaction_id IS NULL;

-- Step 3: Add foreign key constraints
ALTER TABLE sprinkler_spare_pieces
ADD CONSTRAINT fk_sprinkler_spare_pieces_created_by_transaction
FOREIGN KEY (created_by_transaction_id) REFERENCES inventory_transactions(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_sprinkler_spare_pieces_last_modified_by_transaction
FOREIGN KEY (last_modified_by_transaction_id) REFERENCES inventory_transactions(id) ON DELETE SET NULL;

ALTER TABLE hdpe_cut_pieces
ADD CONSTRAINT fk_hdpe_cut_pieces_created_by_transaction
FOREIGN KEY (created_by_transaction_id) REFERENCES inventory_transactions(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_hdpe_cut_pieces_last_modified_by_transaction
FOREIGN KEY (last_modified_by_transaction_id) REFERENCES inventory_transactions(id) ON DELETE SET NULL;

ALTER TABLE inventory_stock
ADD CONSTRAINT fk_inventory_stock_deleted_by_transaction
FOREIGN KEY (deleted_by_transaction_id) REFERENCES inventory_transactions(id) ON DELETE SET NULL;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sprinkler_spare_pieces_created_by_transaction
ON sprinkler_spare_pieces(created_by_transaction_id)
WHERE created_by_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sprinkler_spare_pieces_last_modified_by_transaction
ON sprinkler_spare_pieces(last_modified_by_transaction_id)
WHERE last_modified_by_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hdpe_cut_pieces_created_by_transaction
ON hdpe_cut_pieces(created_by_transaction_id)
WHERE created_by_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hdpe_cut_pieces_last_modified_by_transaction
ON hdpe_cut_pieces(last_modified_by_transaction_id)
WHERE last_modified_by_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_stock_deleted_by_transaction
ON inventory_stock(deleted_by_transaction_id)
WHERE deleted_by_transaction_id IS NOT NULL;

-- Step 5: Add comments for documentation
COMMENT ON COLUMN sprinkler_spare_pieces.created_by_transaction_id IS 'IMMUTABLE: Transaction that created this piece. Never updated after creation.';
COMMENT ON COLUMN sprinkler_spare_pieces.last_modified_by_transaction_id IS 'MUTABLE: Last transaction that modified this piece (e.g., COMBINE_SPARES). Can be updated.';
COMMENT ON COLUMN sprinkler_spare_pieces.transaction_id IS 'DEPRECATED: Use created_by_transaction_id instead. Will be removed in future version.';

COMMENT ON COLUMN hdpe_cut_pieces.created_by_transaction_id IS 'IMMUTABLE: Transaction that created this piece. Never updated after creation.';
COMMENT ON COLUMN hdpe_cut_pieces.last_modified_by_transaction_id IS 'MUTABLE: Last transaction that modified this piece. Can be updated.';
COMMENT ON COLUMN hdpe_cut_pieces.transaction_id IS 'DEPRECATED: Use created_by_transaction_id instead. Will be removed in future version.';

COMMENT ON COLUMN inventory_stock.deleted_by_transaction_id IS 'Transaction that soft-deleted this stock record. Used for precise revert matching instead of time windows.';

-- Step 6: Create a view for easy querying
CREATE OR REPLACE VIEW piece_tracking_audit AS
SELECT
    'SPRINKLER' as piece_type,
    ssp.id as piece_id,
    ssp.stock_id,
    ssp.piece_count as quantity,
    ssp.status,
    ssp.created_at,
    ssp.updated_at,
    ssp.created_by_transaction_id,
    ssp.last_modified_by_transaction_id,
    ssp.transaction_id as deprecated_transaction_id,
    it_created.transaction_type as created_by_type,
    it_modified.transaction_type as last_modified_by_type
FROM sprinkler_spare_pieces ssp
LEFT JOIN inventory_transactions it_created ON ssp.created_by_transaction_id = it_created.id
LEFT JOIN inventory_transactions it_modified ON ssp.last_modified_by_transaction_id = it_modified.id

UNION ALL

SELECT
    'HDPE' as piece_type,
    hcp.id as piece_id,
    hcp.stock_id,
    1 as quantity, -- HDPE pieces don't have piece_count, they're always 1 piece
    hcp.status,
    hcp.created_at,
    hcp.updated_at,
    hcp.created_by_transaction_id,
    hcp.last_modified_by_transaction_id,
    hcp.transaction_id as deprecated_transaction_id,
    it_created.transaction_type as created_by_type,
    it_modified.transaction_type as last_modified_by_type
FROM hdpe_cut_pieces hcp
LEFT JOIN inventory_transactions it_created ON hcp.created_by_transaction_id = it_created.id
LEFT JOIN inventory_transactions it_modified ON hcp.last_modified_by_transaction_id = it_modified.id;

COMMENT ON VIEW piece_tracking_audit IS 'Unified view of all pieces with their creation and modification tracking. Use this for debugging transaction history.';
