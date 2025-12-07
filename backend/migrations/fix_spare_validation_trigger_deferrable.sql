-- Migration: Fix SPARE stock validation trigger to be DEFERRABLE
-- Date: 2025-12-07
-- Issue: Validation trigger fires during multi-row UPDATE causing false positives
-- Solution: Make trigger DEFERRABLE so it runs after all row updates complete

-- Drop ALL existing validation triggers (there might be multiple)
DROP TRIGGER IF EXISTS validate_spare_quantity ON inventory_stock;
DROP TRIGGER IF EXISTS validate_spare_stock_quantity_trigger ON inventory_stock;

-- Recreate as CONSTRAINT trigger (DEFERRABLE - runs after statement completes)
-- This allows the trigger to see the final consistent state after all piece updates
CREATE CONSTRAINT TRIGGER validate_spare_quantity
AFTER UPDATE ON inventory_stock
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.stock_type = 'SPARE' AND OLD.quantity IS DISTINCT FROM NEW.quantity)
EXECUTE FUNCTION validate_spare_stock_quantity();

-- Note: This fixes the issue where reverting scraps would fail with:
-- "SPARE stock quantity validation failed. Stock quantity: X, Actual pieces: Y"
-- The trigger now runs AFTER all sprinkler_spare_pieces are updated, not during.
