-- Add missing columns to hdpe_cut_pieces
ALTER TABLE hdpe_cut_pieces
ADD COLUMN IF NOT EXISTS reserved_by_transaction_id UUID REFERENCES inventory_transactions(id);

ALTER TABLE hdpe_cut_pieces
ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMP;

-- Create index for reservation queries
CREATE INDEX IF NOT EXISTS idx_hdpe_reserved_by_transaction
ON hdpe_cut_pieces(reserved_by_transaction_id)
WHERE reserved_by_transaction_id IS NOT NULL;
