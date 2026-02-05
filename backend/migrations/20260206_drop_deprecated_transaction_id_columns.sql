-- Migration: Drop deprecated transaction_id columns
-- Date: 2026-02-06
-- Purpose: Remove deprecated transaction_id columns from piece tables
--          These columns are replaced by created_by_transaction_id (immutable)
--          and last_modified_by_transaction_id (mutable)

-- Safety check: Verify columns are not used by checking if all values are NULL
-- If any rows have transaction_id values, review before proceeding
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM hdpe_cut_pieces
        WHERE transaction_id IS NOT NULL AND created_by_transaction_id IS NULL
        LIMIT 1
    ) THEN
        RAISE EXCEPTION 'hdpe_cut_pieces has transaction_id values not migrated to created_by_transaction_id';
    END IF;

    IF EXISTS (
        SELECT 1 FROM sprinkler_spare_pieces
        WHERE transaction_id IS NOT NULL AND created_by_transaction_id IS NULL
        LIMIT 1
    ) THEN
        RAISE EXCEPTION 'sprinkler_spare_pieces has transaction_id values not migrated to created_by_transaction_id';
    END IF;
END $$;

-- Drop dependent view first
DROP VIEW IF EXISTS piece_tracking_audit;

-- Drop deprecated columns from hdpe_cut_pieces
ALTER TABLE hdpe_cut_pieces DROP COLUMN IF EXISTS transaction_id;

-- Drop deprecated columns from sprinkler_spare_pieces
ALTER TABLE sprinkler_spare_pieces DROP COLUMN IF EXISTS transaction_id;

-- Recreate view WITHOUT deprecated column
CREATE VIEW piece_tracking_audit AS
 SELECT 'SPRINKLER'::text AS piece_type,
    ssp.id AS piece_id,
    ssp.stock_id,
    ssp.piece_count AS quantity,
    ssp.status,
    ssp.created_at,
    ssp.updated_at,
    ssp.created_by_transaction_id,
    ssp.last_modified_by_transaction_id,
    it_created.transaction_type AS created_by_type,
    it_modified.transaction_type AS last_modified_by_type
   FROM ((sprinkler_spare_pieces ssp
     LEFT JOIN inventory_transactions it_created ON ((ssp.created_by_transaction_id = it_created.id)))
     LEFT JOIN inventory_transactions it_modified ON ((ssp.last_modified_by_transaction_id = it_modified.id)))
UNION ALL
 SELECT 'HDPE'::text AS piece_type,
    hcp.id AS piece_id,
    hcp.stock_id,
    1 AS quantity,
    hcp.status,
    hcp.created_at,
    hcp.updated_at,
    hcp.created_by_transaction_id,
    hcp.last_modified_by_transaction_id,
    it_created.transaction_type AS created_by_type,
    it_modified.transaction_type AS last_modified_by_type
   FROM ((hdpe_cut_pieces hcp
     LEFT JOIN inventory_transactions it_created ON ((hcp.created_by_transaction_id = it_created.id)))
     LEFT JOIN inventory_transactions it_modified ON ((hcp.last_modified_by_transaction_id = it_modified.id)));

COMMENT ON VIEW piece_tracking_audit IS 'Unified view of all pieces with their creation and modification tracking. Use this for debugging transaction history.';

-- Update comments to reflect schema cleanup
COMMENT ON TABLE hdpe_cut_pieces IS 'Individual HDPE pipe cut pieces. Use created_by_transaction_id for tracking.';
COMMENT ON TABLE sprinkler_spare_pieces IS 'Individual sprinkler spare pieces. Use created_by_transaction_id for tracking.';

-- Log the change
INSERT INTO audit_logs (action_type, entity_type, description, created_at)
VALUES ('SCHEMA_MIGRATION', 'DATABASE', 'Dropped deprecated transaction_id columns and recreated piece_tracking_audit view', NOW());
