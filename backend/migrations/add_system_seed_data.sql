-- Migration: Add system seed data and deletion protection
-- Description: Adds core units and product types that are required for the system to function
-- Date: 2025-12-05

-- Add is_system flag to units table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'units'
                   AND column_name = 'is_system') THEN
        ALTER TABLE public.units ADD COLUMN is_system BOOLEAN DEFAULT FALSE NOT NULL;
        COMMENT ON COLUMN public.units.is_system IS 'System units cannot be deleted by users';
    END IF;
END $$;

-- Insert core units if they don't exist
INSERT INTO public.units (id, name, abbreviation, is_system, created_at, updated_at) VALUES
('f8c19461-bfe0-40c3-b077-a42511148b28', 'Meters', 'm', TRUE, NOW(), NOW()),
('e5d6e26d-f869-42f4-9c38-4dd7e980d8e1', 'Pieces', 'pcs', TRUE, NOW(), NOW()),
('a4d6cb7c-7895-494e-9d22-e857f78609a8', 'Kilograms', 'kg', TRUE, NOW(), NOW()),
('77b0cf16-13a5-4606-a3f6-17176bfcf1e9', 'Rolls', 'rolls', TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET is_system = TRUE;

-- Add is_system flag to users table for system accounts
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'users'
                   AND column_name = 'is_system') THEN
        ALTER TABLE public.users ADD COLUMN is_system BOOLEAN DEFAULT FALSE NOT NULL;
        COMMENT ON COLUMN public.users.is_system IS 'System users are used for automated tasks and cannot be deleted';
    END IF;
END $$;

-- Insert system user for automated tasks (auto-snapshots, scheduled jobs, etc.)
-- This user has a fixed UUID that can be referenced in application code
INSERT INTO public.users (
    id,
    email,
    username,
    full_name,
    password_hash,
    is_active,
    is_system,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'system@tarko.internal',
    'SYSTEM',
    'System Account',
    '$2b$12$system.account.not.for.login.hash',
    TRUE,
    TRUE,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET is_system = TRUE, is_active = TRUE;

-- Add is_system flag to product_types table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'product_types'
                   AND column_name = 'is_system') THEN
        ALTER TABLE public.product_types ADD COLUMN is_system BOOLEAN DEFAULT FALSE NOT NULL;
        COMMENT ON COLUMN public.product_types.is_system IS 'System product types cannot be deleted by users';
    END IF;
END $$;

-- Insert core product types if they don't exist
INSERT INTO public.product_types (id, name, description, unit_id, parameter_schema, roll_configuration, is_system, created_at, updated_at) VALUES
('8c7e8160-778d-418d-848b-78c55996c542',
 'HDPE Pipe',
 'High Density Polyethylene Pipes',
 'f8c19461-bfe0-40c3-b077-a42511148b28',
 '[{"name": "PE", "type": "select", "required": true}, {"name": "PN", "type": "number", "required": true}, {"name": "OD", "type": "number", "unit": "mm", "required": true}]'::jsonb,
 '{"type": "standard_rolls", "options": [{"label": "500m", "value": 500}, {"label": "300m", "value": 300}], "allow_cut_rolls": true}'::jsonb,
 TRUE,
 NOW(),
 NOW()),
('280f664a-cd54-41a9-aeb0-e0cd7148acc3',
 'Sprinkler Pipe',
 'Irrigation Sprinkler Pipes',
 'e5d6e26d-f869-42f4-9c38-4dd7e980d8e1',
 '[{"name": "OD", "type": "number", "unit": "mm", "required": true}, {"name": "PN", "type": "number", "required": true}, {"name": "Type", "type": "select", "required": true}]'::jsonb,
 '{"type": "bundles", "unit": "pieces", "allow_spare": true, "bundle_sizes": [10, 20], "quantity_based": true}'::jsonb,
 TRUE,
 NOW(),
 NOW())
ON CONFLICT (id) DO UPDATE SET is_system = TRUE;

-- Insert parameter options for PE, PN, OD, and Type
INSERT INTO public.parameter_options (parameter_name, option_value, created_at) VALUES
-- PE (Polyethylene) options
('PE', '63', NOW()),
('PE', '80', NOW()),
('PE', '100', NOW()),
-- PN (Pressure Nominal) options
('PN', '4', NOW()),
('PN', '6', NOW()),
('PN', '8', NOW()),
('PN', '10', NOW()),
('PN', '12.5', NOW()),
-- OD (Outer Diameter) options
('OD', '25', NOW()),
('OD', '32', NOW()),
('OD', '40', NOW()),
('OD', '50', NOW()),
('OD', '63', NOW()),
('OD', '75', NOW()),
('OD', '90', NOW()),
('OD', '110', NOW()),
('OD', '125', NOW()),
('OD', '140', NOW()),
('OD', '160', NOW()),
-- Type (Sprinkler Type) options
('Type', 'C', NOW()),
('Type', 'L', NOW())
ON CONFLICT (parameter_name, option_value) DO NOTHING;

-- Insert brand options
INSERT INTO public.brands (name, created_at, updated_at) VALUES
('AMDO', NOW(), NOW()),
('AQUAWAY', NOW(), NOW()),
('KARTEX', NOW(), NOW()),
('KISAN PRAJWAL', NOW(), NOW()),
('SP JAIN', NOW(), NOW()),
('SUPERFLOW', NOW(), NOW()),
('TARKO', NOW(), NOW()),
('Tarko Gold', NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Verification
SELECT 'Units created/updated:' as status, COUNT(*) as count FROM units WHERE is_system = TRUE;
SELECT 'Product Types created/updated:' as status, COUNT(*) as count FROM product_types WHERE is_system = TRUE;
SELECT 'Parameter Options created:' as status, COUNT(*) as count FROM parameter_options;
SELECT 'Brands created:' as status, COUNT(*) as count FROM brands WHERE deleted_at IS NULL;
