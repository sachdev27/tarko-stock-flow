-- Add attachment_url column to batches table
ALTER TABLE batches ADD COLUMN IF NOT EXISTS attachment_url TEXT;
