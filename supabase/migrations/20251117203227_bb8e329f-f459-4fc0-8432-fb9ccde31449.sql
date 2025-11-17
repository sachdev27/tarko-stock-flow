-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'reader');

-- Create enum for QC status
CREATE TYPE public.qc_status AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- Create enum for transaction types
CREATE TYPE public.transaction_type AS ENUM (
  'PRODUCTION',
  'SALE',
  'CUT_ROLL',
  'ADJUSTMENT',
  'RETURN',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'INTERNAL_USE'
);

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create function to check if user has role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- Create locations table
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Create brands table
CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Create units table
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create product_types table
CREATE TABLE public.product_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  unit_id UUID REFERENCES public.units(id) NOT NULL,
  parameter_schema JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Create product_variants table
CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type_id UUID REFERENCES public.product_types(id) NOT NULL,
  brand_id UUID REFERENCES public.brands(id) NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  sku TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Create customers table
CREATE TABLE public.customers (
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

-- Create batches table
CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no TEXT NOT NULL UNIQUE,
  batch_code TEXT NOT NULL UNIQUE,
  product_variant_id UUID REFERENCES public.product_variants(id) NOT NULL,
  location_id UUID REFERENCES public.locations(id) NOT NULL,
  production_date TIMESTAMPTZ NOT NULL,
  initial_quantity DECIMAL(15, 3) NOT NULL CHECK (initial_quantity > 0),
  current_quantity DECIMAL(15, 3) NOT NULL CHECK (current_quantity >= 0),
  qc_status qc_status NOT NULL DEFAULT 'PENDING',
  qc_date TIMESTAMPTZ,
  qc_notes TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Create index on batch_code for fast lookups
CREATE INDEX idx_batches_batch_code ON public.batches(batch_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_batches_location ON public.batches(location_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_batches_product_variant ON public.batches(product_variant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_batches_production_date ON public.batches(production_date) WHERE deleted_at IS NULL;

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.batches(id) NOT NULL,
  transaction_type transaction_type NOT NULL,
  quantity_change DECIMAL(15, 3) NOT NULL,
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_id UUID REFERENCES public.customers(id),
  invoice_no TEXT,
  from_location_id UUID REFERENCES public.locations(id),
  to_location_id UUID REFERENCES public.locations(id),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Create indexes for transactions
CREATE INDEX idx_transactions_batch ON public.transactions(batch_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_date ON public.transactions(transaction_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_customer ON public.transactions(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_type ON public.transactions(transaction_type) WHERE deleted_at IS NULL;

-- Create attached_documents table
CREATE TABLE public.attached_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linked_to_type TEXT NOT NULL,
  linked_to_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by UUID REFERENCES auth.users(id) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attached_documents_linked ON public.attached_documents(linked_to_type, linked_to_id);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
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

CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attached_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles (only admins can manage)
CREATE POLICY "Admins can manage all user roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for locations
CREATE POLICY "Everyone can view locations"
  ON public.locations FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins can manage locations"
  ON public.locations FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- RLS Policies for brands
CREATE POLICY "Everyone can view brands"
  ON public.brands FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins can manage brands"
  ON public.brands FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- RLS Policies for units
CREATE POLICY "Everyone can view units"
  ON public.units FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage units"
  ON public.units FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- RLS Policies for product_types
CREATE POLICY "Everyone can view product types"
  ON public.product_types FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins can manage product types"
  ON public.product_types FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- RLS Policies for product_variants
CREATE POLICY "Everyone can view product variants"
  ON public.product_variants FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins can manage product variants"
  ON public.product_variants FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- RLS Policies for customers
CREATE POLICY "Everyone can view customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins and users can manage customers"
  ON public.customers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

-- RLS Policies for batches
CREATE POLICY "Everyone can view batches"
  ON public.batches FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins and users can create batches"
  ON public.batches FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

CREATE POLICY "Admins and users can update batches"
  ON public.batches FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

CREATE POLICY "Only admins can delete batches"
  ON public.batches FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- RLS Policies for transactions
CREATE POLICY "Everyone can view transactions"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins and users can create transactions"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

CREATE POLICY "Admins and users can update transactions"
  ON public.transactions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

CREATE POLICY "Only admins can delete transactions"
  ON public.transactions FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- RLS Policies for attached_documents
CREATE POLICY "Everyone can view attached documents"
  ON public.attached_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins and users can upload documents"
  ON public.attached_documents FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'user'));

CREATE POLICY "Admins can delete documents"
  ON public.attached_documents FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- RLS Policies for audit_logs (read-only for everyone, system inserts)
CREATE POLICY "Everyone can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_brands_updated_at
  BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_units_updated_at
  BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_types_updated_at
  BEFORE UPDATE ON public.product_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_batches_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert seed data for units
INSERT INTO public.units (name, abbreviation) VALUES
  ('Meters', 'm'),
  ('Kilograms', 'kg'),
  ('Pieces', 'pcs'),
  ('Rolls', 'rolls');

-- Insert seed data for brands
INSERT INTO public.brands (name) VALUES
  ('Tarko Premium'),
  ('Tarko Standard'),
  ('Tarko Eco');

-- Insert seed data for locations
INSERT INTO public.locations (name, address) VALUES
  ('Main Warehouse', 'Main Factory Building, Sector A'),
  ('Plant Godown', 'Production Plant, Sector B'),
  ('Storage Yard', 'Outdoor Storage Area, Sector C');

-- Insert seed data for product types
-- HDPE Pipe
INSERT INTO public.product_types (name, description, unit_id, parameter_schema)
SELECT 
  'HDPE Pipe',
  'High Density Polyethylene Pipes',
  id,
  '[
    {"name": "PE", "type": "select", "options": ["PE63", "PE80", "PE100"], "required": true},
    {"name": "PN", "type": "number", "required": true},
    {"name": "OD", "type": "number", "unit": "mm", "required": true}
  ]'::jsonb
FROM public.units WHERE abbreviation = 'm';

-- Sprinkler Pipe
INSERT INTO public.product_types (name, description, unit_id, parameter_schema)
SELECT 
  'Sprinkler Pipe',
  'Irrigation Sprinkler Pipes',
  id,
  '[
    {"name": "OD", "type": "number", "unit": "mm", "required": true},
    {"name": "PN", "type": "number", "required": true},
    {"name": "Type", "type": "select", "options": ["L", "C"], "required": true}
  ]'::jsonb
FROM public.units WHERE abbreviation = 'm';