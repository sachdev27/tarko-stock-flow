-- Add dispatch_id to group multiple rolls in a single dispatch
ALTER TABLE transactions
ADD COLUMN dispatch_id UUID;

COMMENT ON COLUMN transactions.dispatch_id IS 'Groups multiple transactions from the same dispatch/sale operation';

-- Create index for efficient dispatch grouping queries
CREATE INDEX idx_transactions_dispatch ON transactions(dispatch_id) WHERE deleted_at IS NULL AND dispatch_id IS NOT NULL;

-- Backfill: Group existing transactions by created_at, customer_id, and invoice_no
-- Transactions within 1 second of each other with same customer are likely from same dispatch
WITH dispatch_groups AS (
  SELECT
    id,
    customer_id,
    invoice_no,
    created_at,
    -- Generate a dispatch_id for the first transaction in each group
    FIRST_VALUE(id) OVER (
      PARTITION BY
        customer_id,
        COALESCE(invoice_no, ''),
        DATE_TRUNC('second', created_at)
      ORDER BY created_at
    ) as group_dispatch_id
  FROM transactions
  WHERE transaction_type = 'SALE'
    AND customer_id IS NOT NULL
    AND deleted_at IS NULL
)
UPDATE transactions t
SET dispatch_id = dg.group_dispatch_id
FROM dispatch_groups dg
WHERE t.id = dg.id
  AND dg.id != dg.group_dispatch_id; -- Only update non-first transactions to share the first one's ID

-- Show summary of grouped dispatches
SELECT
  dispatch_id,
  COUNT(*) as transaction_count,
  STRING_AGG(CONCAT('txn_', id::text), ', ' ORDER BY created_at) as transaction_ids,
  MIN(created_at) as dispatch_time
FROM transactions
WHERE dispatch_id IS NOT NULL
  AND deleted_at IS NULL
GROUP BY dispatch_id
ORDER BY dispatch_time DESC
LIMIT 10;
