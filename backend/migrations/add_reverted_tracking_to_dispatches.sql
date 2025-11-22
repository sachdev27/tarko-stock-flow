-- Migration: Add reverted tracking columns to dispatches table
-- This allows us to show reverted dispatches in activity feed instead of hiding them
-- Following industry best practices for audit trails and data retention

-- Add columns to track revert information
ALTER TABLE dispatches
ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES users(id);

-- Add index for efficient querying of reverted dispatches
CREATE INDEX IF NOT EXISTS idx_dispatches_reverted_at ON dispatches(reverted_at) WHERE reverted_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN dispatches.reverted_at IS 'Timestamp when this dispatch was reverted. NULL means not reverted.';
COMMENT ON COLUMN dispatches.reverted_by IS 'User who reverted this dispatch. NULL means not reverted.';

-- Migration notes:
-- 1. Existing dispatches with deleted_at != NULL will need data migration if they should be marked as reverted
-- 2. Going forward, we'll use reverted_at instead of deleted_at for revert operations
-- 3. deleted_at will be reserved for actual hard deletes (if ever needed)
