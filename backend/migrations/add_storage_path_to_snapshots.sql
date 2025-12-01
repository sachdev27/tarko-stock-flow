-- Migration: Add storage_path column to database_snapshots table
-- This tracks where each snapshot's files are stored on disk

-- Add storage_path column (nullable for existing snapshots)
ALTER TABLE database_snapshots 
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Add comment to column
COMMENT ON COLUMN database_snapshots.storage_path IS 'Absolute path where snapshot files are stored on disk';

-- Update existing snapshots to use default path
UPDATE database_snapshots 
SET storage_path = './snapshots'
WHERE storage_path IS NULL;
