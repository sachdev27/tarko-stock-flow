-- Add roll snapshot columns to transactions table
-- This preserves roll information at the time of transaction
-- so that historical data is not lost when rolls are deleted

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS roll_snapshot JSONB;

COMMENT ON COLUMN transactions.roll_snapshot IS 'Snapshot of roll data at time of transaction (length, type, bundle_size, etc.)';

-- Backfill existing transactions with roll data
UPDATE transactions t
SET roll_snapshot = (
    SELECT jsonb_build_object(
        'roll_id', r.id,
        'length_meters', r.length_meters,
        'initial_length_meters', r.initial_length_meters,
        'is_cut_roll', r.is_cut_roll,
        'roll_type', r.roll_type,
        'bundle_size', r.bundle_size,
        'status', r.status
    )
    FROM rolls r
    WHERE r.id = t.roll_id
)
WHERE t.roll_id IS NOT NULL
  AND t.roll_snapshot IS NULL;

-- Show sample of updated transactions
SELECT
    t.id,
    t.transaction_type,
    t.quantity_change,
    t.roll_snapshot->>'roll_type' as roll_type,
    t.roll_snapshot->>'length_meters' as length_meters,
    t.created_at
FROM transactions t
WHERE t.roll_id IS NOT NULL
ORDER BY t.created_at DESC
LIMIT 10;
