-- Create database
-- Run: createdb tarko_inventory

-- Create enum types
CREATE TYPE app_role AS ENUM ('admin', 'user', 'reader');
CREATE TYPE transaction_type AS ENUM (
  'PRODUCTION', 'SALE', 'CUT_ROLL', 'ADJUSTMENT',
  'RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'INTERNAL_USE'
);

-- Users table (replaces Supabase auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- User roles table
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Locations table
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Brands table
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Units table
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Product types table
CREATE TABLE product_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  unit_id UUID REFERENCES units(id) NOT NULL,
  parameter_schema JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Product variants table
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id UUID REFERENCES product_types(id) NOT NULL,
  brand_id UUID REFERENCES brands(id) NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  sku TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Batches table
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no TEXT NOT NULL UNIQUE,
  batch_code TEXT NOT NULL UNIQUE,
  product_variant_id UUID REFERENCES product_variants(id) NOT NULL,
  location_id UUID REFERENCES locations(id) NOT NULL,
  production_date TIMESTAMPTZ NOT NULL,
  initial_quantity DECIMAL(15, 3) NOT NULL CHECK (initial_quantity > 0),
  current_quantity DECIMAL(15, 3) NOT NULL CHECK (current_quantity >= 0),
  notes TEXT,
  weight_per_meter NUMERIC,
  total_weight NUMERIC,
  piece_length NUMERIC,
  attachment_url TEXT,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_batches_batch_code ON batches(batch_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_batches_location ON batches(location_id) WHERE deleted_at IS NULL;

-- Rolls table
CREATE TABLE rolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id),
  length_meters NUMERIC NOT NULL CHECK (length_meters >= 0),
  initial_length_meters NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'PARTIAL', 'SOLD_OUT')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_rolls_batch_id ON rolls(batch_id);
CREATE INDEX idx_rolls_status ON rolls(status);

-- Transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batches(id) NOT NULL,
  roll_id UUID REFERENCES rolls(id),
  transaction_type transaction_type NOT NULL,
  quantity_change DECIMAL(15, 3) NOT NULL,
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_id UUID REFERENCES customers(id),
  invoice_no TEXT,
  from_location_id UUID REFERENCES locations(id),
  to_location_id UUID REFERENCES locations(id),
  notes TEXT,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_transactions_batch ON transactions(batch_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_date ON transactions(transaction_date) WHERE deleted_at IS NULL;

-- Attached documents table
CREATE TABLE attached_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linked_to_type TEXT NOT NULL,
  linked_to_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by UUID REFERENCES users(id) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attached_documents_linked ON attached_documents(linked_to_type, linked_to_id);

-- Audit logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  description TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_units_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_types_updated_at
  BEFORE UPDATE ON product_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batches_updated_at
  BEFORE UPDATE ON batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rolls_updated_at
  BEFORE UPDATE ON rolls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed data
INSERT INTO units (name, abbreviation) VALUES
  ('Meters', 'm'),
  ('Kilograms', 'kg'),
  ('Pieces', 'pcs'),
  ('Rolls', 'rolls');

INSERT INTO brands (name) VALUES
  ('Tarko Premium'),
  ('Tarko Standard'),
  ('Tarko Eco');

INSERT INTO locations (name, address) VALUES
  ('Main Warehouse', 'Main Factory Building, Sector A'),
  ('Plant Godown', 'Production Plant, Sector B'),
  ('Storage Yard', 'Outdoor Storage Area, Sector C');

-- Insert product types
INSERT INTO product_types (name, description, unit_id, parameter_schema)
SELECT
  'HDPE Pipe',
  'High Density Polyethylene Pipes',
  id,
  '[
    {"name": "PE", "type": "select", "options": ["PE63", "PE80", "PE100"], "required": true},
    {"name": "PN", "type": "number", "required": true},
    {"name": "OD", "type": "number", "unit": "mm", "required": true}
  ]'::jsonb
FROM units WHERE abbreviation = 'm';

INSERT INTO product_types (name, description, unit_id, parameter_schema)
SELECT
  'Sprinkler Pipe',
  'Irrigation Sprinkler Pipes',
  id,
  '[
    {"name": "OD", "type": "number", "unit": "mm", "required": true},
    {"name": "PN", "type": "number", "required": true},
    {"name": "Type", "type": "select", "options": ["L", "C"], "required": true}
  ]'::jsonb
FROM units WHERE abbreviation = 'm';
