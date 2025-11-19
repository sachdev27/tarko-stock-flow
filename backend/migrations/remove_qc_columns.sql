-- Remove QC (Quality Control) columns from batches table
-- These columns are not being used in the application

ALTER TABLE batches DROP COLUMN IF EXISTS qc_status;
ALTER TABLE batches DROP COLUMN IF EXISTS qc_date;
ALTER TABLE batches DROP COLUMN IF EXISTS qc_notes;

-- Also drop the qc_status enum type if it exists and is no longer used
DROP TYPE IF EXISTS qc_status CASCADE;
