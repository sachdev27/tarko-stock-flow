-- Cloud Backup Configuration Table
-- Stores encrypted cloud storage credentials in database instead of .env files

CREATE TABLE IF NOT EXISTS cloud_backup_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('r2', 's3')),
    account_id TEXT,
    access_key_id TEXT NOT NULL,
    secret_access_key TEXT NOT NULL, -- Encrypted
    bucket_name TEXT NOT NULL,
    region TEXT,
    endpoint_url TEXT,
    is_enabled BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_cloud_backup_config_active ON cloud_backup_config(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_cloud_backup_config_provider ON cloud_backup_config(provider);

COMMENT ON TABLE cloud_backup_config IS 'Stores encrypted cloud storage credentials for R2/S3 backups';
COMMENT ON COLUMN cloud_backup_config.secret_access_key IS 'Encrypted using Fernet encryption';
COMMENT ON COLUMN cloud_backup_config.is_active IS 'Only one config can be active at a time';
