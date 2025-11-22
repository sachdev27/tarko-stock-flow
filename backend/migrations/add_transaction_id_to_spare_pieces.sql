-- Add transaction_id to sprinkler_spare_pieces and hdpe_cut_pieces for proper revert tracking
-- This allows us to identify exactly which pieces were created by a specific transaction

-- Add transaction_id column to sprinkler_spare_pieces
ALTER TABLE sprinkler_spare_pieces
ADD COLUMN IF NOT EXISTS transaction_id UUID;

-- Add foreign key constraint
ALTER TABLE sprinkler_spare_pieces
ADD CONSTRAINT fk_sprinkler_spare_pieces_transaction
FOREIGN KEY (transaction_id) REFERENCES inventory_transactions(id) ON DELETE SET NULL;

-- Add transaction_id column to hdpe_cut_pieces
ALTER TABLE hdpe_cut_pieces
ADD COLUMN IF NOT EXISTS transaction_id UUID;

-- Add foreign key constraint
ALTER TABLE hdpe_cut_pieces
ADD CONSTRAINT fk_hdpe_cut_pieces_transaction
FOREIGN KEY (transaction_id) REFERENCES inventory_transactions(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sprinkler_spare_pieces_transaction_id
ON sprinkler_spare_pieces(transaction_id);

CREATE INDEX IF NOT EXISTS idx_hdpe_cut_pieces_transaction_id
ON hdpe_cut_pieces(transaction_id);
