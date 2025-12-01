-- Comprehensive Updates Migration
-- Date: 2025-11-18

-- 1. Add username support to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE deleted_at IS NULL;

-- 2. Add created_by tracking to all tables that don't have it
ALTER TABLE locations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE brands ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE product_types ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE parameter_options ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- 3. Add roll_type column for product-specific configurations
-- HDPE: 'standard', 'cut'
-- Sprinkler: 'bundle', 'spare'
ALTER TABLE product_types ADD COLUMN IF NOT EXISTS roll_configuration JSONB DEFAULT '{"type": "standard_rolls", "options": [{"value": 500, "label": "500m"}, {"value": 300, "label": "300m"}]}'::jsonb;

-- Add roll_type to rolls table to distinguish different types
ALTER TABLE rolls ADD COLUMN IF NOT EXISTS roll_type VARCHAR(50) DEFAULT 'standard';

-- Update existing is_cut_roll data to roll_type
UPDATE rolls SET roll_type = 'cut' WHERE is_cut_roll = TRUE AND roll_type = 'standard';
UPDATE rolls SET roll_type = 'standard' WHERE is_cut_roll = FALSE AND roll_type = 'standard';

-- 4. Enhanced audit logging
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS changes JSONB;
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time ON audit_logs(user_id, created_at DESC);

-- 5. User management enhancements
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);

-- 6. Add comments for documentation
COMMENT ON COLUMN users.username IS 'Username for login (alternative to email)';
COMMENT ON COLUMN users.full_name IS 'User full display name';
COMMENT ON COLUMN users.is_active IS 'Whether user account is active';
COMMENT ON COLUMN users.created_by_user_id IS 'Admin who created this user account';
COMMENT ON COLUMN product_types.roll_configuration IS 'JSON config for roll types: standard_rolls, bundles, spare_pipes, cut_rolls';
COMMENT ON COLUMN rolls.roll_type IS 'Type: standard, cut, bundle_10, bundle_20, spare';

-- 7. Create view for enhanced transaction history with user info
CREATE OR REPLACE VIEW transaction_history AS
SELECT
    t.*,
    u.email as created_by_email,
    u.username as created_by_username,
    u.full_name as created_by_name,
    b.batch_code,
    b.batch_no,
    c.name as customer_name,
    l_from.name as from_location_name,
    l_to.name as to_location_name
FROM transactions t
LEFT JOIN users u ON t.created_by = u.id
LEFT JOIN batches b ON t.batch_id = b.id
LEFT JOIN customers c ON t.customer_id = c.id
LEFT JOIN locations l_from ON t.from_location_id = l_from.id
LEFT JOIN locations l_to ON t.to_location_id = l_to.id
WHERE t.deleted_at IS NULL;

-- 8. Create view for detailed audit logs with user information
CREATE OR REPLACE VIEW audit_logs_detailed AS
SELECT
    al.*,
    u.email as user_email,
    u.username as user_username,
    u.full_name as user_name
FROM audit_logs al
LEFT JOIN users u ON al.user_id = u.id
ORDER BY al.created_at DESC;
