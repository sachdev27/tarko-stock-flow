-- Add weight_per_piece column to batches table for quantity-based products
-- This stores the weight of each individual piece (e.g., grams per piece for Sprinkler Pipe)

ALTER TABLE batches ADD COLUMN IF NOT EXISTS weight_per_piece NUMERIC;

COMMENT ON COLUMN batches.weight_per_piece IS 'Weight of each individual piece in grams (for quantity-based products like Sprinkler Pipe)';
