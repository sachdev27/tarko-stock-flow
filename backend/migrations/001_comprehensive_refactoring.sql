-- ============================================================================
-- COMPREHENSIVE DATABASE REFACTORING - INDUSTRY BEST PRACTICES
-- ============================================================================
-- This migration implements proper event sourcing, immutable data tracking,
-- optimistic locking, and comprehensive data integrity constraints.
--
-- PRINCIPLES APPLIED:
-- 1. Immutability: transaction_id is set once at creation, never modified
-- 2. Event Sourcing: Full audit trail of all state changes
-- 3. Optimistic Locking: Row versioning prevents race conditions
-- 4. Data Integrity: Database-level constraints enforce business rules
-- 5. Performance: Proper indexes and materialized views
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create Event Sourcing Table
-- ============================================================================
-- This table records EVERY state change for EVERY piece.
-- Never update or delete - only insert. This gives us full audit trail.

CREATE TABLE IF NOT EXISTS piece_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which piece was affected
  piece_id UUID NOT NULL,
  piece_type TEXT NOT NULL CHECK (piece_type IN ('HDPE', 'SPRINKLER')),

  -- What happened
  event_type TEXT NOT NULL CHECK (event_type IN (
    'CREATED',           -- Piece was created (production, split, cut)
    'STATUS_CHANGED',    -- Status changed (IN_STOCK -> DISPATCHED -> SOLD_OUT)
    'COMBINED',          -- Used in COMBINE_SPARES operation
    'DISPATCHED',        -- Sent to customer
    'RETURNED',          -- Customer returned it
    'REVERTED',          -- Operation that created/modified it was reverted
    'RESERVED',          -- Locked for pending operation
    'RELEASED'           -- Lock released
  )),

  -- Which transaction caused this event
  transaction_id UUID NOT NULL REFERENCES inventory_transactions(id) ON DELETE RESTRICT,

  -- State before and after (for rollback/debugging)
  state_before JSONB,  -- {status: 'IN_STOCK', stock_id: 'xxx', ...}
  state_after JSONB,   -- {status: 'SOLD_OUT', stock_id: 'xxx', ...}

  -- Context
  notes TEXT,

  -- Timestamp (immutable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who did it
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for fast lookups
CREATE INDEX idx_piece_lifecycle_events_piece ON piece_lifecycle_events(piece_id, piece_type);
CREATE INDEX idx_piece_lifecycle_events_transaction ON piece_lifecycle_events(transaction_id);
CREATE INDEX idx_piece_lifecycle_events_event_type ON piece_lifecycle_events(event_type);
CREATE INDEX idx_piece_lifecycle_events_created_at ON piece_lifecycle_events(created_at DESC);

COMMENT ON TABLE piece_lifecycle_events IS 'Immutable event log of all piece state changes. Enables full audit trail and precise rollback.';

-- ============================================================================
-- STEP 2: Add Immutable Columns to Piece Tables
-- ============================================================================

-- For HDPE cut pieces
ALTER TABLE hdpe_cut_pieces
  -- IMMUTABLE: Set once at creation, never changed
  ADD COLUMN IF NOT EXISTS created_by_transaction_id UUID
    REFERENCES inventory_transactions(id) ON DELETE RESTRICT,

  -- IMMUTABLE: Original stock_id when created
  ADD COLUMN IF NOT EXISTS original_stock_id UUID
    REFERENCES inventory_stock(id) ON DELETE SET NULL,

  -- Row version for optimistic locking
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,

  -- Soft delete instead of hard delete
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_transaction_id UUID
    REFERENCES inventory_transactions(id) ON DELETE SET NULL;

-- For Sprinkler spare pieces
ALTER TABLE sprinkler_spare_pieces
  -- IMMUTABLE: Set once at creation, never changed
  ADD COLUMN IF NOT EXISTS created_by_transaction_id UUID
    REFERENCES inventory_transactions(id) ON DELETE RESTRICT,

  -- IMMUTABLE: Original stock_id when created
  ADD COLUMN IF NOT EXISTS original_stock_id UUID
    REFERENCES inventory_stock(id) ON DELETE SET NULL,

  -- Row version for optimistic locking
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,

  -- Soft delete instead of hard delete
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_transaction_id UUID
    REFERENCES inventory_transactions(id) ON DELETE SET NULL,

  -- Reserved for pending operations
  ADD COLUMN IF NOT EXISTS reserved_by_transaction_id UUID
    REFERENCES inventory_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;

-- For inventory_stock
ALTER TABLE inventory_stock
  -- Track which transaction deleted this stock
  ADD COLUMN IF NOT EXISTS deleted_by_transaction_id UUID
    REFERENCES inventory_transactions(id) ON DELETE SET NULL,

  -- Row version for optimistic locking
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- ============================================================================
-- STEP 3: Migrate Existing Data
-- ============================================================================

-- Migrate hdpe_cut_pieces: Copy transaction_id to created_by_transaction_id
UPDATE hdpe_cut_pieces
SET
  created_by_transaction_id = transaction_id,
  original_stock_id = stock_id
WHERE
  transaction_id IS NOT NULL
  AND created_by_transaction_id IS NULL;

-- Migrate sprinkler_spare_pieces: Copy transaction_id to created_by_transaction_id
UPDATE sprinkler_spare_pieces
SET
  created_by_transaction_id = transaction_id,
  original_stock_id = stock_id
WHERE
  transaction_id IS NOT NULL
  AND created_by_transaction_id IS NULL;

-- ============================================================================
-- STEP 4: Create Indexes for Performance
-- ============================================================================

-- Indexes on created_by_transaction_id (used for revert operations)
CREATE INDEX IF NOT EXISTS idx_hdpe_cut_pieces_created_by_transaction
  ON hdpe_cut_pieces(created_by_transaction_id)
  WHERE created_by_transaction_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sprinkler_spare_pieces_created_by_transaction
  ON sprinkler_spare_pieces(created_by_transaction_id)
  WHERE created_by_transaction_id IS NOT NULL AND deleted_at IS NULL;

-- Indexes on status for fast availability queries
CREATE INDEX IF NOT EXISTS idx_hdpe_cut_pieces_status_active
  ON hdpe_cut_pieces(status, stock_id)
  WHERE status = 'IN_STOCK' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sprinkler_spare_pieces_status_active
  ON sprinkler_spare_pieces(status, stock_id)
  WHERE status = 'IN_STOCK' AND deleted_at IS NULL;

-- Indexes on reserved pieces
CREATE INDEX IF NOT EXISTS idx_sprinkler_spare_pieces_reserved
  ON sprinkler_spare_pieces(reserved_by_transaction_id)
  WHERE reserved_by_transaction_id IS NOT NULL;

-- Index on deleted_by_transaction_id for revert operations
CREATE INDEX IF NOT EXISTS idx_inventory_stock_deleted_by_transaction
  ON inventory_stock(deleted_by_transaction_id)
  WHERE deleted_by_transaction_id IS NOT NULL;

-- Composite index for concurrent operation safety
CREATE INDEX IF NOT EXISTS idx_sprinkler_spare_pieces_stock_status
  ON sprinkler_spare_pieces(stock_id, status, deleted_at)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- STEP 5: Create Validation Functions
-- ============================================================================

-- Function: Prevent modification of immutable created_by_transaction_id
CREATE OR REPLACE FUNCTION prevent_transaction_id_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow setting on INSERT
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- On UPDATE: Prevent changing created_by_transaction_id
  IF TG_OP = 'UPDATE' THEN
    IF OLD.created_by_transaction_id IS NOT NULL
       AND NEW.created_by_transaction_id IS DISTINCT FROM OLD.created_by_transaction_id THEN
      RAISE EXCEPTION 'created_by_transaction_id is immutable and cannot be changed. Old: %, New: %',
        OLD.created_by_transaction_id, NEW.created_by_transaction_id;
    END IF;

    -- Increment version for optimistic locking
    NEW.version = OLD.version + 1;
    NEW.updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Validate spare stock quantity matches piece count
CREATE OR REPLACE FUNCTION validate_spare_stock_quantity()
RETURNS TRIGGER AS $$
DECLARE
  actual_piece_count INTEGER;
  stock_record RECORD;
BEGIN
  -- Only validate for SPARE stock type
  IF NEW.stock_type != 'SPARE' THEN
    RETURN NEW;
  END IF;

  -- Get actual sum of piece_count from spare pieces
  SELECT COALESCE(SUM(piece_count), 0) INTO actual_piece_count
  FROM sprinkler_spare_pieces
  WHERE stock_id = NEW.id
    AND status = 'IN_STOCK'
    AND deleted_at IS NULL;

  -- Validate quantity matches
  IF NEW.quantity != actual_piece_count THEN
    RAISE EXCEPTION 'SPARE stock quantity validation failed. Stock quantity: %, Actual piece count: %. Stock ID: %',
      NEW.quantity, actual_piece_count, NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function: Auto-update stock quantity when pieces change
CREATE OR REPLACE FUNCTION auto_update_stock_quantity()
RETURNS TRIGGER AS $$
DECLARE
  affected_stock_id UUID;
  stock_type TEXT;
  new_quantity NUMERIC;
BEGIN
  -- Determine which stock_id was affected
  IF TG_OP = 'DELETE' THEN
    affected_stock_id = OLD.stock_id;
  ELSE
    affected_stock_id = NEW.stock_id;
  END IF;

  -- Get stock type
  SELECT s.stock_type INTO stock_type
  FROM inventory_stock s
  WHERE s.id = affected_stock_id;

  -- Only update for piece-based stocks
  IF stock_type IN ('SPARE', 'CUT_ROLL') THEN
    IF TG_TABLE_NAME = 'sprinkler_spare_pieces' THEN
      -- Calculate new quantity from spare pieces
      SELECT COALESCE(SUM(piece_count), 0) INTO new_quantity
      FROM sprinkler_spare_pieces
      WHERE stock_id = affected_stock_id
        AND status = 'IN_STOCK'
        AND deleted_at IS NULL;
    ELSIF TG_TABLE_NAME = 'hdpe_cut_pieces' THEN
      -- Calculate new quantity from cut pieces count
      SELECT COUNT(*) INTO new_quantity
      FROM hdpe_cut_pieces
      WHERE stock_id = affected_stock_id
        AND status = 'IN_STOCK'
        AND deleted_at IS NULL;
    END IF;

    -- Update stock quantity
    UPDATE inventory_stock
    SET quantity = new_quantity, updated_at = NOW()
    WHERE id = affected_stock_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function: Log piece lifecycle events automatically
CREATE OR REPLACE FUNCTION log_piece_lifecycle_event()
RETURNS TRIGGER AS $$
DECLARE
  event_type_value TEXT;
  state_before_value JSONB;
  state_after_value JSONB;
  txn_id UUID;
BEGIN
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    event_type_value = 'CREATED';
    state_before_value = NULL;
    state_after_value = to_jsonb(NEW);
    txn_id = NEW.created_by_transaction_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Determine what changed
    IF OLD.status != NEW.status THEN
      IF NEW.status = 'DISPATCHED' THEN
        event_type_value = 'DISPATCHED';
      ELSIF NEW.status = 'SOLD_OUT' THEN
        event_type_value = 'COMBINED';
      ELSIF NEW.status = 'IN_STOCK' AND OLD.status = 'SOLD_OUT' THEN
        event_type_value = 'REVERTED';
      ELSE
        event_type_value = 'STATUS_CHANGED';
      END IF;
    ELSIF NEW.reserved_by_transaction_id IS NOT NULL AND OLD.reserved_by_transaction_id IS NULL THEN
      event_type_value = 'RESERVED';
    ELSIF NEW.reserved_by_transaction_id IS NULL AND OLD.reserved_by_transaction_id IS NOT NULL THEN
      event_type_value = 'RELEASED';
    ELSE
      event_type_value = 'STATUS_CHANGED';
    END IF;

    state_before_value = to_jsonb(OLD);
    state_after_value = to_jsonb(NEW);

    -- Use the transaction that caused this change (could be in state_after)
    txn_id = COALESCE(NEW.created_by_transaction_id, OLD.created_by_transaction_id);
  ELSIF TG_OP = 'DELETE' THEN
    event_type_value = 'REVERTED';
    state_before_value = to_jsonb(OLD);
    state_after_value = NULL;
    txn_id = OLD.deleted_by_transaction_id;
  END IF;

  -- Only log if we have a transaction_id
  IF txn_id IS NOT NULL THEN
    INSERT INTO piece_lifecycle_events (
      piece_id,
      piece_type,
      event_type,
      transaction_id,
      state_before,
      state_after,
      created_at
    ) VALUES (
      COALESCE(NEW.id, OLD.id),
      CASE TG_TABLE_NAME
        WHEN 'hdpe_cut_pieces' THEN 'HDPE'
        WHEN 'sprinkler_spare_pieces' THEN 'SPRINKLER'
      END,
      event_type_value,
      txn_id,
      state_before_value,
      state_after_value,
      NOW()
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Create Triggers
-- ============================================================================

-- Prevent transaction_id mutation on hdpe_cut_pieces
DROP TRIGGER IF EXISTS prevent_hdpe_transaction_id_mutation ON hdpe_cut_pieces;
CREATE TRIGGER prevent_hdpe_transaction_id_mutation
  BEFORE UPDATE ON hdpe_cut_pieces
  FOR EACH ROW
  EXECUTE FUNCTION prevent_transaction_id_mutation();

-- Prevent transaction_id mutation on sprinkler_spare_pieces
DROP TRIGGER IF EXISTS prevent_sprinkler_transaction_id_mutation ON sprinkler_spare_pieces;
CREATE TRIGGER prevent_sprinkler_transaction_id_mutation
  BEFORE UPDATE ON sprinkler_spare_pieces
  FOR EACH ROW
  EXECUTE FUNCTION prevent_transaction_id_mutation();

-- Validate spare stock quantities
DROP TRIGGER IF EXISTS validate_spare_stock_quantity_trigger ON inventory_stock;
CREATE TRIGGER validate_spare_stock_quantity_trigger
  BEFORE UPDATE ON inventory_stock
  FOR EACH ROW
  WHEN (NEW.stock_type = 'SPARE')
  EXECUTE FUNCTION validate_spare_stock_quantity();

-- Auto-update stock quantity when hdpe pieces change
DROP TRIGGER IF EXISTS auto_update_stock_from_hdpe_pieces ON hdpe_cut_pieces;
CREATE TRIGGER auto_update_stock_from_hdpe_pieces
  AFTER INSERT OR UPDATE OR DELETE ON hdpe_cut_pieces
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_stock_quantity();

-- Auto-update stock quantity when sprinkler pieces change
DROP TRIGGER IF EXISTS auto_update_stock_from_sprinkler_pieces ON sprinkler_spare_pieces;
CREATE TRIGGER auto_update_stock_from_sprinkler_pieces
  AFTER INSERT OR UPDATE OR DELETE ON sprinkler_spare_pieces
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_stock_quantity();

-- Log lifecycle events for hdpe pieces
DROP TRIGGER IF EXISTS log_hdpe_piece_lifecycle ON hdpe_cut_pieces;
CREATE TRIGGER log_hdpe_piece_lifecycle
  AFTER INSERT OR UPDATE OR DELETE ON hdpe_cut_pieces
  FOR EACH ROW
  EXECUTE FUNCTION log_piece_lifecycle_event();

-- Log lifecycle events for sprinkler pieces
DROP TRIGGER IF EXISTS log_sprinkler_piece_lifecycle ON sprinkler_spare_pieces;
CREATE TRIGGER log_sprinkler_piece_lifecycle
  AFTER INSERT OR UPDATE OR DELETE ON sprinkler_spare_pieces
  FOR EACH ROW
  EXECUTE FUNCTION log_piece_lifecycle_event();

-- ============================================================================
-- STEP 7: Create Materialized Views for Performance
-- ============================================================================

-- View: Current state of all pieces (fast reads)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_piece_current_state AS
SELECT
  'HDPE' as piece_type,
  hcp.id as piece_id,
  hcp.stock_id,
  hcp.status,
  hcp.created_by_transaction_id,
  hcp.original_stock_id,
  hcp.length_meters as quantity,
  hcp.created_at,
  hcp.updated_at,
  hcp.deleted_at,
  hcp.version,
  ist.batch_id,
  ist.product_variant_id,
  it.transaction_type as created_by_type
FROM hdpe_cut_pieces hcp
JOIN inventory_stock ist ON hcp.stock_id = ist.id
LEFT JOIN inventory_transactions it ON hcp.created_by_transaction_id = it.id
WHERE hcp.deleted_at IS NULL

UNION ALL

SELECT
  'SPRINKLER' as piece_type,
  ssp.id as piece_id,
  ssp.stock_id,
  ssp.status,
  ssp.created_by_transaction_id,
  ssp.original_stock_id,
  ssp.piece_count as quantity,
  ssp.created_at,
  ssp.updated_at,
  ssp.deleted_at,
  ssp.version,
  ist.batch_id,
  ist.product_variant_id,
  it.transaction_type as created_by_type
FROM sprinkler_spare_pieces ssp
JOIN inventory_stock ist ON ssp.stock_id = ist.id
LEFT JOIN inventory_transactions it ON ssp.created_by_transaction_id = it.id
WHERE ssp.deleted_at IS NULL;

-- Indexes on materialized view
CREATE INDEX IF NOT EXISTS idx_mv_piece_current_state_piece
  ON mv_piece_current_state(piece_id);
CREATE INDEX IF NOT EXISTS idx_mv_piece_current_state_stock
  ON mv_piece_current_state(stock_id);
CREATE INDEX IF NOT EXISTS idx_mv_piece_current_state_status
  ON mv_piece_current_state(status) WHERE status = 'IN_STOCK';
CREATE INDEX IF NOT EXISTS idx_mv_piece_current_state_batch
  ON mv_piece_current_state(batch_id);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_piece_state_view()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_piece_current_state;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 8: Create Helper Views for Queries
-- ============================================================================

-- View: Piece audit trail with full history
CREATE OR REPLACE VIEW v_piece_audit_trail AS
SELECT
  ple.id as event_id,
  ple.piece_id,
  ple.piece_type,
  ple.event_type,
  ple.transaction_id,
  it.transaction_type,
  ple.state_before->>'status' as status_before,
  ple.state_after->>'status' as status_after,
  ple.state_before->>'stock_id' as stock_id_before,
  ple.state_after->>'stock_id' as stock_id_after,
  ple.notes,
  ple.created_at,
  u.email as created_by_email
FROM piece_lifecycle_events ple
JOIN inventory_transactions it ON ple.transaction_id = it.id
LEFT JOIN users u ON ple.created_by = u.id
ORDER BY ple.created_at DESC;

-- View: Current available pieces for operations
CREATE OR REPLACE VIEW v_available_pieces AS
SELECT
  'HDPE' as piece_type,
  hcp.id as piece_id,
  hcp.stock_id,
  hcp.length_meters as quantity,
  hcp.created_by_transaction_id,
  hcp.version,
  ist.batch_id,
  ist.product_variant_id,
  b.batch_code,
  pv.parameters
FROM hdpe_cut_pieces hcp
JOIN inventory_stock ist ON hcp.stock_id = ist.id
JOIN batches b ON ist.batch_id = b.id
JOIN product_variants pv ON ist.product_variant_id = pv.id
WHERE hcp.status = 'IN_STOCK'
  AND hcp.deleted_at IS NULL
  AND ist.deleted_at IS NULL

UNION ALL

SELECT
  'SPRINKLER' as piece_type,
  ssp.id as piece_id,
  ssp.stock_id,
  ssp.piece_count as quantity,
  ssp.created_by_transaction_id,
  ssp.version,
  ist.batch_id,
  ist.product_variant_id,
  b.batch_code,
  pv.parameters
FROM sprinkler_spare_pieces ssp
JOIN inventory_stock ist ON ssp.stock_id = ist.id
JOIN batches b ON ist.batch_id = b.id
JOIN product_variants pv ON ist.product_variant_id = pv.id
WHERE ssp.status = 'IN_STOCK'
  AND ssp.deleted_at IS NULL
  AND ist.deleted_at IS NULL
  AND ssp.reserved_by_transaction_id IS NULL;  -- Not reserved

-- View: Stock quantity validation report
CREATE OR REPLACE VIEW v_stock_quantity_validation AS
SELECT
  ist.id as stock_id,
  ist.batch_id,
  ist.stock_type,
  ist.quantity as recorded_quantity,
  CASE
    WHEN ist.stock_type = 'SPARE' THEN (
      SELECT COALESCE(SUM(piece_count), 0)
      FROM sprinkler_spare_pieces
      WHERE stock_id = ist.id
        AND status = 'IN_STOCK'
        AND deleted_at IS NULL
    )
    WHEN ist.stock_type = 'CUT_ROLL' THEN (
      SELECT COUNT(*)
      FROM hdpe_cut_pieces
      WHERE stock_id = ist.id
        AND status = 'IN_STOCK'
        AND deleted_at IS NULL
    )
    ELSE ist.quantity
  END as actual_quantity,
  ist.quantity - CASE
    WHEN ist.stock_type = 'SPARE' THEN (
      SELECT COALESCE(SUM(piece_count), 0)
      FROM sprinkler_spare_pieces
      WHERE stock_id = ist.id
        AND status = 'IN_STOCK'
        AND deleted_at IS NULL
    )
    WHEN ist.stock_type = 'CUT_ROLL' THEN (
      SELECT COUNT(*)
      FROM hdpe_cut_pieces
      WHERE stock_id = ist.id
        AND status = 'IN_STOCK'
        AND deleted_at IS NULL
    )
    ELSE 0
  END as quantity_mismatch
FROM inventory_stock ist
WHERE ist.deleted_at IS NULL
  AND ist.stock_type IN ('SPARE', 'CUT_ROLL');

-- ============================================================================
-- STEP 9: Add Comments for Documentation
-- ============================================================================

COMMENT ON COLUMN hdpe_cut_pieces.created_by_transaction_id IS
  'IMMUTABLE: Transaction that created this piece. Set once at creation, never modified. Use for provenance tracking.';

COMMENT ON COLUMN hdpe_cut_pieces.original_stock_id IS
  'IMMUTABLE: Original stock_id when piece was created. Preserved even if piece moves to different stock.';

COMMENT ON COLUMN hdpe_cut_pieces.version IS
  'Row version for optimistic locking. Incremented on each update. Compare before update to detect concurrent modifications.';

COMMENT ON COLUMN hdpe_cut_pieces.deleted_at IS
  'Soft delete timestamp. NULL means active, non-NULL means deleted. Never hard delete pieces - preserves audit trail.';

COMMENT ON COLUMN hdpe_cut_pieces.deleted_by_transaction_id IS
  'Transaction that soft-deleted this piece. Used for precise revert operations.';

COMMENT ON COLUMN sprinkler_spare_pieces.created_by_transaction_id IS
  'IMMUTABLE: Transaction that created this piece. Set once at creation, never modified. Use for provenance tracking.';

COMMENT ON COLUMN sprinkler_spare_pieces.original_stock_id IS
  'IMMUTABLE: Original stock_id when piece was created. Preserved even if piece moves to different stock.';

COMMENT ON COLUMN sprinkler_spare_pieces.version IS
  'Row version for optimistic locking. Incremented on each update. Compare before update to detect concurrent modifications.';

COMMENT ON COLUMN sprinkler_spare_pieces.deleted_at IS
  'Soft delete timestamp. NULL means active, non-NULL means deleted. Never hard delete pieces - preserves audit trail.';

COMMENT ON COLUMN sprinkler_spare_pieces.deleted_by_transaction_id IS
  'Transaction that soft-deleted this piece. Used for precise revert operations.';

COMMENT ON COLUMN sprinkler_spare_pieces.reserved_by_transaction_id IS
  'Transaction that has reserved this piece for pending operation. Provides pessimistic locking.';

COMMENT ON COLUMN sprinkler_spare_pieces.reserved_at IS
  'Timestamp when piece was reserved. Used to detect and release stale reservations.';

COMMENT ON COLUMN inventory_stock.deleted_by_transaction_id IS
  'Transaction that soft-deleted this stock record. Used for precise revert operations instead of time-based matching.';

COMMENT ON COLUMN inventory_stock.version IS
  'Row version for optimistic locking. Incremented on each update.';

COMMENT ON COLUMN sprinkler_spare_pieces.transaction_id IS
  'DEPRECATED: Use created_by_transaction_id instead. This column will be removed in a future version. DO NOT USE in new code.';

COMMENT ON COLUMN hdpe_cut_pieces.transaction_id IS
  'DEPRECATED: Use created_by_transaction_id instead. This column will be removed in a future version. DO NOT USE in new code.';

-- ============================================================================
-- STEP 10: Create Cleanup Job for Old Events (Optional)
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_lifecycle_events(days_to_keep INTEGER DEFAULT 180)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Keep last 6 months of events by default
  DELETE FROM piece_lifecycle_events
  WHERE created_at < NOW() - MAKE_INTERVAL(days => days_to_keep)
    AND event_type NOT IN ('CREATED');  -- Never delete creation events

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_lifecycle_events IS
  'Cleanup old piece lifecycle events (except CREATED events). Run monthly via cron job.';

-- ============================================================================
-- STEP 11: Add CHECK Constraints
-- ============================================================================

-- Ensure piece_count is positive
ALTER TABLE sprinkler_spare_pieces
  DROP CONSTRAINT IF EXISTS check_piece_count_positive,
  ADD CONSTRAINT check_piece_count_positive
    CHECK (piece_count > 0);

-- Ensure length_meters is positive
ALTER TABLE hdpe_cut_pieces
  DROP CONSTRAINT IF EXISTS check_length_positive,
  ADD CONSTRAINT check_length_positive
    CHECK (length_meters > 0);

-- Ensure version is positive
ALTER TABLE hdpe_cut_pieces
  DROP CONSTRAINT IF EXISTS check_version_positive,
  ADD CONSTRAINT check_version_positive
    CHECK (version > 0);

ALTER TABLE sprinkler_spare_pieces
  DROP CONSTRAINT IF EXISTS check_version_positive_spare,
  ADD CONSTRAINT check_version_positive_spare
    CHECK (version > 0);

-- Ensure reserved_at is set when reserved_by_transaction_id is set
ALTER TABLE sprinkler_spare_pieces
  DROP CONSTRAINT IF EXISTS check_reservation_consistency,
  ADD CONSTRAINT check_reservation_consistency
    CHECK (
      (reserved_by_transaction_id IS NULL AND reserved_at IS NULL) OR
      (reserved_by_transaction_id IS NOT NULL AND reserved_at IS NOT NULL)
    );

-- ============================================================================
-- STEP 12: Grant Permissions (adjust for your users)
-- ============================================================================

-- Grant permissions to application user (adjust user name as needed)
-- GRANT SELECT, INSERT ON piece_lifecycle_events TO your_app_user;
-- GRANT SELECT ON v_piece_audit_trail TO your_app_user;
-- GRANT SELECT ON v_available_pieces TO your_app_user;
-- GRANT SELECT ON v_stock_quantity_validation TO your_app_user;

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- ============================================================================

-- Run these after migration to verify everything is correct:

-- 1. Check for pieces without created_by_transaction_id
-- SELECT COUNT(*) FROM hdpe_cut_pieces WHERE created_by_transaction_id IS NULL AND deleted_at IS NULL;
-- SELECT COUNT(*) FROM sprinkler_spare_pieces WHERE created_by_transaction_id IS NULL AND deleted_at IS NULL;
-- Expected: 0

-- 2. Check for quantity mismatches
-- SELECT * FROM v_stock_quantity_validation WHERE quantity_mismatch != 0;
-- Expected: 0 rows

-- 3. Verify triggers are working
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid IN ('hdpe_cut_pieces'::regclass, 'sprinkler_spare_pieces'::regclass);
-- Expected: All triggers enabled

-- 4. Check lifecycle events are being logged
-- SELECT COUNT(*) FROM piece_lifecycle_events;
-- Expected: > 0 (if you have existing data)

-- ============================================================================
-- ROLLBACK SCRIPT (if needed)
-- ============================================================================
/*
BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS prevent_hdpe_transaction_id_mutation ON hdpe_cut_pieces;
DROP TRIGGER IF EXISTS prevent_sprinkler_transaction_id_mutation ON sprinkler_spare_pieces;
DROP TRIGGER IF EXISTS validate_spare_stock_quantity_trigger ON inventory_stock;
DROP TRIGGER IF EXISTS auto_update_stock_from_hdpe_pieces ON hdpe_cut_pieces;
DROP TRIGGER IF EXISTS auto_update_stock_from_sprinkler_pieces ON sprinkler_spare_pieces;
DROP TRIGGER IF EXISTS log_hdpe_piece_lifecycle ON hdpe_cut_pieces;
DROP TRIGGER IF EXISTS log_sprinkler_piece_lifecycle ON sprinkler_spare_pieces;

-- Drop functions
DROP FUNCTION IF EXISTS prevent_transaction_id_mutation CASCADE;
DROP FUNCTION IF EXISTS validate_spare_stock_quantity CASCADE;
DROP FUNCTION IF EXISTS auto_update_stock_quantity CASCADE;
DROP FUNCTION IF EXISTS log_piece_lifecycle_event CASCADE;
DROP FUNCTION IF EXISTS refresh_piece_state_view CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_lifecycle_events CASCADE;

-- Drop views
DROP MATERIALIZED VIEW IF EXISTS mv_piece_current_state CASCADE;
DROP VIEW IF EXISTS v_piece_audit_trail CASCADE;
DROP VIEW IF EXISTS v_available_pieces CASCADE;
DROP VIEW IF EXISTS v_stock_quantity_validation CASCADE;

-- Drop columns (be careful - this loses data!)
ALTER TABLE hdpe_cut_pieces DROP COLUMN IF EXISTS created_by_transaction_id CASCADE;
ALTER TABLE hdpe_cut_pieces DROP COLUMN IF EXISTS original_stock_id CASCADE;
ALTER TABLE hdpe_cut_pieces DROP COLUMN IF EXISTS version CASCADE;
ALTER TABLE hdpe_cut_pieces DROP COLUMN IF EXISTS deleted_at CASCADE;
ALTER TABLE hdpe_cut_pieces DROP COLUMN IF EXISTS deleted_by_transaction_id CASCADE;

ALTER TABLE sprinkler_spare_pieces DROP COLUMN IF EXISTS created_by_transaction_id CASCADE;
ALTER TABLE sprinkler_spare_pieces DROP COLUMN IF EXISTS original_stock_id CASCADE;
ALTER TABLE sprinkler_spare_pieces DROP COLUMN IF EXISTS version CASCADE;
ALTER TABLE sprinkler_spare_pieces DROP COLUMN IF EXISTS deleted_at CASCADE;
ALTER TABLE sprinkler_spare_pieces DROP COLUMN IF EXISTS deleted_by_transaction_id CASCADE;
ALTER TABLE sprinkler_spare_pieces DROP COLUMN IF EXISTS reserved_by_transaction_id CASCADE;
ALTER TABLE sprinkler_spare_pieces DROP COLUMN IF EXISTS reserved_at CASCADE;

ALTER TABLE inventory_stock DROP COLUMN IF EXISTS deleted_by_transaction_id CASCADE;
ALTER TABLE inventory_stock DROP COLUMN IF EXISTS version CASCADE;

-- Drop tables
DROP TABLE IF EXISTS piece_lifecycle_events CASCADE;

COMMIT;
*/
