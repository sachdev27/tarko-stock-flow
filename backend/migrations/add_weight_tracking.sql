-- Add weight tracking fields to batches table
ALTER TABLE batches
ADD COLUMN weight_per_meter DECIMAL(10, 3),  -- kg/m for all pipes
ADD COLUMN total_weight DECIMAL(15, 3);       -- Total weight in kg

-- Add comment
COMMENT ON COLUMN batches.weight_per_meter IS 'Weight in kilograms per meter (kg/m)';
COMMENT ON COLUMN batches.total_weight IS 'Total weight of the batch in kilograms (kg)';
