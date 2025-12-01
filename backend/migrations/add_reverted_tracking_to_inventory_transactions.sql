-- Add reverted tracking columns to inventory_transactions table
-- This allows us to track when inventory operations (CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES) are reverted
-- Similar to the dispatch reverted tracking

-- Add reverted_at and reverted_by columns
ALTER TABLE inventory_transactions
ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reverted
ON inventory_transactions(reverted_at)
WHERE reverted_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN inventory_transactions.reverted_at IS 'Timestamp when the transaction was reverted';
COMMENT ON COLUMN inventory_transactions.reverted_by IS 'User who reverted the transaction';
