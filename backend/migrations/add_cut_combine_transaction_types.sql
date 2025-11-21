-- Add CUT_BUNDLE and COMBINE_BUNDLE transaction types to the enum
-- This allows tracking when bundles are cut into spares or spares are combined into bundles

ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'CUT_BUNDLE';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'COMBINE_BUNDLE';

-- Add comments to document the new transaction types
COMMENT ON TYPE transaction_type IS 'Transaction types: PRODUCTION (new batch), SALE (dispatch), CUT_ROLL (cut HDPE roll), CUT_BUNDLE (cut bundle into spare pieces), COMBINE_BUNDLE (combine spare pieces into bundle), ADJUSTMENT, RETURN, TRANSFER_OUT, TRANSFER_IN, INTERNAL_USE';
