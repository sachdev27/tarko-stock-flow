-- Add piece_length column to batches table for Sprinkler Pipe products
-- This stores the length of each individual piece (e.g., 6m per piece)

ALTER TABLE batches ADD COLUMN IF NOT EXISTS piece_length NUMERIC;

COMMENT ON COLUMN batches.piece_length IS 'Length of each individual piece in meters (for quantity-based products like Sprinkler Pipe)';
