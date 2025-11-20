-- Add city field to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;

-- Create bill_to table (companies/entities that can be billed)
CREATE TABLE IF NOT EXISTS bill_to (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  gstin TEXT,
  address TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bill_to_name ON bill_to(name) WHERE deleted_at IS NULL;

-- Create transports table
CREATE TABLE IF NOT EXISTS transports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  contact_person TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transports_name ON transports(name) WHERE deleted_at IS NULL;

-- Create vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number TEXT NOT NULL UNIQUE,
  vehicle_type TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vehicles_number ON vehicles(vehicle_number) WHERE deleted_at IS NULL;

-- Add new fields to transactions table for dispatch information
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bill_to_id UUID REFERENCES bill_to(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transport_id UUID REFERENCES transports(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);

-- Create product_aliases table for quick search
CREATE TABLE IF NOT EXISTS product_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE NOT NULL,
  alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_variant_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_product_aliases_alias ON product_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_product_aliases_variant ON product_aliases(product_variant_id);

-- Add trigger to update updated_at on bill_to
CREATE TRIGGER update_bill_to_updated_at BEFORE UPDATE ON bill_to
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add trigger to update updated_at on transports
CREATE TRIGGER update_transports_updated_at BEFORE UPDATE ON transports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add trigger to update updated_at on vehicles
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
