-- Add city and pincode columns to customers table
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS pincode TEXT,
ADD COLUMN IF NOT EXISTS state TEXT;

-- Update existing addresses if needed (optional - can be done through UI)
-- You can manually update existing customer data after running this migration
