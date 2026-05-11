-- Migration: Prevent orphaned SOLD_OUT stock rows
-- Purpose: Ensure that stock rows marked SOLD_OUT are always soft-deleted
-- This prevents silent failures in batch revert logic

CREATE OR REPLACE FUNCTION prevent_orphaned_sold_out_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- If status is being set to SOLD_OUT, deleted_at MUST also be set
    IF NEW.status = 'SOLD_OUT' AND NEW.deleted_at IS NULL THEN
        RAISE EXCEPTION 'Invalid state: SOLD_OUT stock must have deleted_at set. This indicates incomplete batch revert or data corruption.';
    END IF;

    -- If deleted_at is being cleared (unharddelete), status must NOT be SOLD_OUT
    IF OLD.deleted_at IS NOT NULL
       AND NEW.deleted_at IS NULL
       AND NEW.status = 'SOLD_OUT' THEN
        RAISE EXCEPTION 'Cannot restore SOLD_OUT stock without cleanup. Check batch revert status.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_prevent_orphaned_sold_out_stock ON inventory_stock;

-- Create trigger
CREATE TRIGGER trigger_prevent_orphaned_sold_out_stock
BEFORE INSERT OR UPDATE ON inventory_stock
FOR EACH ROW
EXECUTE FUNCTION prevent_orphaned_sold_out_stock();

-- Comment for documentation
COMMENT ON FUNCTION prevent_orphaned_sold_out_stock() IS
'Prevents orphaned SOLD_OUT stock rows from existing. These indicate:
1. Incomplete batch revert (status changed but rows not soft-deleted)
2. Silent failure in transaction cleanup logic
3. Data corruption from interrupted operations

If this trigger fires, investigate:
- Why was status set to SOLD_OUT without deleted_at?
- Did batch revert fail partway through?
- Run: SELECT * FROM inventory_stock WHERE status=''SOLD_OUT'' AND deleted_at IS NULL
';
