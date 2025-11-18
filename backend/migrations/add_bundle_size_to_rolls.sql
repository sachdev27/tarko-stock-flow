-- Add bundle_size column to rolls table
-- This stores the number of pipes in a bundle (e.g., 10 or 20)

ALTER TABLE rolls ADD COLUMN IF NOT EXISTS bundle_size INTEGER;

COMMENT ON COLUMN rolls.bundle_size IS 'Number of pipes in bundle (10, 20, etc.) - only for bundle roll types';

-- Update existing bundles based on roll_type if they exist
UPDATE rolls SET bundle_size = 10 WHERE roll_type = 'bundle_10' AND bundle_size IS NULL;
UPDATE rolls SET bundle_size = 20 WHERE roll_type = 'bundle_20' AND bundle_size IS NULL;
