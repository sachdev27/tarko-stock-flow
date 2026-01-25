-- Migration: Add status and revert tracking to batches table
-- This follows the foundational model used by dispatches and returns tables
-- Batches can have the following statuses:
-- - ACTIVE: Production is active and has available stock
-- - CONSUMED: All stock has been dispatched/sold (current_quantity = 0)
-- - REVERTED: Production was reverted by admin

-- Add status field (following the pattern of dispatches and returns)
ALTER TABLE batches
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CONSUMED', 'REVERTED'));

-- Add reverted_at and reverted_by columns (following the pattern of dispatches and returns)
ALTER TABLE batches
ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES users(id);

-- Add comments
COMMENT ON COLUMN batches.status IS 'Status of the production batch: ACTIVE (has stock), CONSUMED (all stock sold), REVERTED (admin reverted)';
COMMENT ON COLUMN batches.reverted_at IS 'Timestamp when this production batch was reverted by admin. NULL means not reverted.';
COMMENT ON COLUMN batches.reverted_by IS 'User who reverted this production batch. NULL means not reverted.';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_reverted_at ON batches(reverted_at) WHERE reverted_at IS NOT NULL;

-- Create trigger function to auto-update batch status based on quantity
-- This is the FOUNDATIONAL approach - centralized logic in database
CREATE OR REPLACE FUNCTION update_batch_status_on_quantity_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update status if not already REVERTED (admin reverts are permanent)
    IF NEW.status != 'REVERTED' THEN
        IF NEW.current_quantity = 0 AND OLD.current_quantity > 0 THEN
            -- Batch just became empty - mark as CONSUMED
            NEW.status = 'CONSUMED';
        ELSIF NEW.current_quantity > 0 AND OLD.current_quantity = 0 THEN
            -- Batch was restored (e.g., dispatch revert) - mark as ACTIVE
            NEW.status = 'ACTIVE';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on batches table
DROP TRIGGER IF EXISTS trigger_update_batch_status ON batches;
CREATE TRIGGER trigger_update_batch_status
    BEFORE UPDATE OF current_quantity ON batches
    FOR EACH ROW
    EXECUTE FUNCTION update_batch_status_on_quantity_change();

-- Add comment for trigger
COMMENT ON FUNCTION update_batch_status_on_quantity_change() IS
'Automatically updates batch status to CONSUMED when current_quantity reaches 0,
and back to ACTIVE when quantity is restored. Does not override REVERTED status.';

-- Update existing batches to have proper status
-- Set to CONSUMED if current_quantity = 0 and not reverted
UPDATE batches
SET status = 'CONSUMED'
WHERE current_quantity = 0
  AND reverted_at IS NULL
  AND (status IS NULL OR status = 'ACTIVE');

-- Set to ACTIVE for all others that don't have a status
UPDATE batches
SET status = 'ACTIVE'
WHERE status IS NULL;

-- Note: When reverting a production:
-- 1. Set status = 'REVERTED', reverted_at = NOW(), reverted_by = user_id on the batch
-- 2. Soft delete inventory_stock (deleted_at = NOW())
-- 3. Soft delete the production transaction (deleted_at = NOW())
-- This follows the same pattern as dispatches and returns
