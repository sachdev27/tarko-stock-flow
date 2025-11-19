-- Backfill piece_length for existing Sprinkler Pipe batches
-- This extracts the piece length from the first spare roll's initial_length_meters

UPDATE batches b
SET piece_length = (
    SELECT MAX(initial_length_meters)
    FROM rolls r
    WHERE r.batch_id = b.id
      AND r.deleted_at IS NULL
      AND r.roll_type IN ('spare', 'bundle_6', 'bundle_10', 'bundle_20')
    LIMIT 1
)
WHERE b.piece_length IS NULL
  AND b.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM product_variants pv
    JOIN product_types pt ON pv.product_type_id = pt.id
    WHERE pv.id = b.product_variant_id
      AND pt.name = 'Sprinkler Pipe'
  );

-- Show updated batches
SELECT
    b.batch_code,
    b.piece_length,
    pt.name as product_type
FROM batches b
JOIN product_variants pv ON b.product_variant_id = pv.id
JOIN product_types pt ON pv.product_type_id = pt.id
WHERE pt.name = 'Sprinkler Pipe'
  AND b.deleted_at IS NULL
ORDER BY b.created_at DESC;
