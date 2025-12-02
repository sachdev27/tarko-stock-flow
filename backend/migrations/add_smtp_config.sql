-- Migration: Add SMTP Configuration Table
-- Purpose: Store encrypted SMTP server settings in database
-- Date: 2025-12-03

-- Create SMTP configuration table
CREATE TABLE IF NOT EXISTS smtp_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    smtp_server VARCHAR(255) NOT NULL DEFAULT 'smtp.gmail.com',
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_email VARCHAR(255) NOT NULL,
    smtp_password_encrypted TEXT NOT NULL,  -- Fernet encrypted password
    use_tls BOOLEAN NOT NULL DEFAULT TRUE,
    use_ssl BOOLEAN NOT NULL DEFAULT FALSE,
    from_name VARCHAR(255) DEFAULT 'Tarko Inventory',
    reply_to_email VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    test_email_sent_at TIMESTAMP,
    test_email_status VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- Create index on active status
CREATE INDEX idx_smtp_config_active ON smtp_config(is_active);

-- Comments
COMMENT ON TABLE smtp_config IS 'Stores encrypted SMTP server configuration for email sending';
COMMENT ON COLUMN smtp_config.smtp_password_encrypted IS 'Fernet encrypted SMTP password';
COMMENT ON COLUMN smtp_config.is_active IS 'Only one configuration should be active at a time';
COMMENT ON COLUMN smtp_config.test_email_status IS 'Status of last test email: success, failed, pending';
