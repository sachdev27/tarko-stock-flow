-- Migration: Make vehicle_number optional in vehicles table
-- Date: 2026-01-10
-- Reason: Business requirement change - vehicles can be created with only driver name

-- Step 1: Drop the UNIQUE constraint on vehicle_number (can't have multiple NULLs with UNIQUE)
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_vehicle_number_key;

-- Step 2: Make vehicle_number nullable
ALTER TABLE vehicles ALTER COLUMN vehicle_number DROP NOT NULL;

-- Step 3: Make driver_name required (it's now the primary identifier)
ALTER TABLE vehicles ALTER COLUMN driver_name SET NOT NULL;

-- Step 4: Add a partial UNIQUE constraint (only enforce uniqueness when vehicle_number is not NULL)
CREATE UNIQUE INDEX vehicles_vehicle_number_unique_idx
ON vehicles (vehicle_number)
WHERE vehicle_number IS NOT NULL AND deleted_at IS NULL;

-- Note: This allows multiple NULL vehicle_numbers but ensures uniqueness when provided
