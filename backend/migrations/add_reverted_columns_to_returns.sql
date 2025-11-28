-- Add reverted_at and reverted_by columns to returns table
-- This aligns with the existing pattern used in dispatches and inventory_transactions tables

ALTER TABLE returns
ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES users(id);

-- Add index for querying active (non-reverted) returns
CREATE INDEX IF NOT EXISTS idx_returns_reverted_at
ON returns(reverted_at)
WHERE deleted_at IS NULL;

-- Update status check constraint to include REVERTED
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_status_check;
ALTER TABLE returns ADD CONSTRAINT returns_status_check
CHECK (status = ANY (ARRAY['RECEIVED'::text, 'INSPECTED'::text, 'RESTOCKED'::text, 'CANCELLED'::text, 'REVERTED'::text]));

COMMENT ON COLUMN returns.reverted_at IS 'Timestamp when the return was reverted (undone), soft-delete for returns that were entered incorrectly';
COMMENT ON COLUMN returns.reverted_by IS 'User who reverted this return';
