-- Add SCRAPPED status to hdpe_cut_pieces and sprinkler_spare_pieces
-- This allows pieces to be marked as scrapped

-- Drop existing constraint and recreate with SCRAPPED status
ALTER TABLE hdpe_cut_pieces
DROP CONSTRAINT IF EXISTS hdpe_cut_pieces_status_check;

ALTER TABLE hdpe_cut_pieces
ADD CONSTRAINT hdpe_cut_pieces_status_check
CHECK (status IN ('IN_STOCK', 'DISPATCHED', 'SOLD_OUT', 'SCRAPPED'));

-- Do the same for spare pieces
ALTER TABLE sprinkler_spare_pieces
DROP CONSTRAINT IF EXISTS sprinkler_spare_pieces_status_check;

ALTER TABLE sprinkler_spare_pieces
ADD CONSTRAINT sprinkler_spare_pieces_status_check
CHECK (status IN ('IN_STOCK', 'DISPATCHED', 'SOLD_OUT', 'SCRAPPED'));

-- Add index for scrapped pieces for faster queries
CREATE INDEX IF NOT EXISTS idx_hdpe_cut_pieces_scrapped
ON hdpe_cut_pieces(status) WHERE status = 'SCRAPPED';

CREATE INDEX IF NOT EXISTS idx_spare_pieces_scrapped
ON sprinkler_spare_pieces(status) WHERE status = 'SCRAPPED';
