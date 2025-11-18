-- Migration: Add cut roll support
-- Add is_cut_roll column to rolls table to distinguish cut rolls from standard rolls

ALTER TABLE rolls
ADD COLUMN is_cut_roll BOOLEAN NOT NULL DEFAULT FALSE;

-- Add index for filtering
CREATE INDEX idx_rolls_is_cut_roll ON rolls(is_cut_roll) WHERE deleted_at IS NULL;

-- Add comment
COMMENT ON COLUMN rolls.is_cut_roll IS 'Indicates if this roll is a custom cut roll (non-standard length)';
