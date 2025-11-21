-- Cleanup script to delete inventory_stock entries with 0 quantity
-- This should be run periodically or added as a scheduled job

-- Soft delete (set deleted_at) for stock entries with 0 quantity
UPDATE inventory_stock
SET deleted_at = NOW(), updated_at = NOW()
WHERE quantity = 0
AND deleted_at IS NULL
AND status != 'SOLD_OUT';

-- Optional: Hard delete if you don't need audit trail
-- DELETE FROM inventory_stock WHERE quantity = 0 AND deleted_at IS NOT NULL;

-- Show count of entries that were soft-deleted
SELECT COUNT(*) as cleaned_entries
FROM inventory_stock
WHERE quantity = 0 AND deleted_at IS NOT NULL;
