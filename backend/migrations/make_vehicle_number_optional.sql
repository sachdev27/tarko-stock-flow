-- Migration: Make vehicle_number optional
-- Date: 2026-01-10
-- Description: Allow vehicle creation with only driver_name by making vehicle_number optional

-- Drop the unique constraint on vehicle_number
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_vehicle_number_key;

-- Make vehicle_number nullable
ALTER TABLE vehicles ALTER COLUMN vehicle_number DROP NOT NULL;

-- Add a partial unique constraint that only applies to non-NULL vehicle_numbers
-- This ensures uniqueness when vehicle_number IS provided, but allows multiple NULLs
CREATE UNIQUE INDEX vehicles_vehicle_number_unique_idx
ON vehicles (vehicle_number)
WHERE vehicle_number IS NOT NULL AND deleted_at IS NULL;
