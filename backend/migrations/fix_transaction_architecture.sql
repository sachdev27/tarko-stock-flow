-- Migration: Fix transaction architecture for proper product variant tracking
-- This ensures all transactions have proper product variant references for exact matching

-- Step 1: Add missing fields to batches table
ALTER TABLE batches ADD COLUMN IF NOT EXISTS weight_per_meter NUMERIC;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS total_weight NUMERIC;
ALTER TABLE batches DROP COLUMN IF EXISTS location_id; -- Remove location tracking from batches (not needed)

-- Step 2: Add critical fields to rolls table for proper tracking
ALTER TABLE rolls ADD COLUMN IF NOT EXISTS is_cut_roll BOOLEAN DEFAULT FALSE;
ALTER TABLE rolls ADD COLUMN IF NOT EXISTS roll_type TEXT DEFAULT 'standard';
ALTER TABLE rolls ADD COLUMN IF NOT EXISTS bundle_size INTEGER;

-- Step 3: Add product_variant_id directly to transactions for guaranteed exact matching
-- This is THE KEY FIX - transactions must reference product_variant_id directly
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product_variant_id UUID REFERENCES product_variants(id);

-- Step 4: Backfill product_variant_id for existing transactions from their batches
UPDATE transactions t
SET product_variant_id = b.product_variant_id
FROM batches b
WHERE t.batch_id = b.id
  AND t.product_variant_id IS NULL;

-- Step 5: Make product_variant_id NOT NULL after backfill
ALTER TABLE transactions ALTER COLUMN product_variant_id SET NOT NULL;

-- Step 6: Create index for fast filtering by product variant
CREATE INDEX IF NOT EXISTS idx_transactions_product_variant ON transactions(product_variant_id) WHERE deleted_at IS NULL;

-- Step 7: Add computed weight column to transactions for roll-level weight tracking
-- This will be populated by triggers when roll_id is set
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS roll_weight NUMERIC;

-- Step 8: Create function to auto-populate transaction metadata from roll
CREATE OR REPLACE FUNCTION populate_transaction_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- If roll_id is set, populate roll-specific metadata
  IF NEW.roll_id IS NOT NULL THEN
    -- Get roll and batch data
    SELECT
      r.length_meters,
      r.initial_length_meters,
      r.is_cut_roll,
      r.roll_type,
      r.bundle_size,
      CASE
        WHEN b.weight_per_meter IS NOT NULL THEN (r.length_meters * b.weight_per_meter)
        ELSE NULL
      END as computed_weight
    INTO
      NEW.roll_weight
    FROM rolls r
    JOIN batches b ON r.batch_id = b.id
    WHERE r.id = NEW.roll_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Create trigger to auto-populate transaction metadata
DROP TRIGGER IF EXISTS populate_transaction_metadata_trigger ON transactions;
CREATE TRIGGER populate_transaction_metadata_trigger
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION populate_transaction_metadata();

-- Step 10: Create materialized view for fast product variant lookups
-- This denormalizes product variant data for query performance
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_product_variant_details AS
SELECT
  pv.id as variant_id,
  pv.product_type_id,
  pv.brand_id,
  pv.parameters,
  pt.name as product_type_name,
  br.name as brand_name,
  pt.parameter_schema
FROM product_variants pv
JOIN product_types pt ON pv.product_type_id = pt.id
JOIN brands br ON pv.brand_id = br.id
WHERE pv.deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_product_variant_details_variant_id
  ON mv_product_variant_details(variant_id);

-- Step 11: Create function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_product_variant_details()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_variant_details;
END;
$$ LANGUAGE plpgsql;

-- Step 12: Add comments explaining the architecture
COMMENT ON COLUMN transactions.product_variant_id IS 'Direct reference to product variant - ensures exact matching in transaction history queries';
COMMENT ON COLUMN transactions.roll_id IS 'Reference to specific roll - enables roll-level transaction tracking';
COMMENT ON COLUMN transactions.roll_weight IS 'Computed weight of the roll at transaction time (length * weight_per_meter)';
COMMENT ON INDEX idx_transactions_product_variant IS 'Fast filtering of transactions by product variant for history queries';
