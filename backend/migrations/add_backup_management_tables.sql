-- Migration: Add backup management tables
-- Description: Store cloud credentials, backup policies, and archive settings in database

-- Cloud storage credentials (encrypted)
CREATE TABLE IF NOT EXISTS cloud_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL, -- 'r2', 's3', 'azure', 'gcs'
    account_id VARCHAR(255),
    access_key_id VARCHAR(255) NOT NULL,
    secret_access_key TEXT NOT NULL, -- Will be encrypted
    bucket_name VARCHAR(255) NOT NULL,
    region VARCHAR(100),
    endpoint_url VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    is_encrypted BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by_user_id UUID REFERENCES users(id),
    UNIQUE(provider, bucket_name)
);

-- Backup retention policies
CREATE TABLE IF NOT EXISTS backup_retention_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_name VARCHAR(100) NOT NULL UNIQUE,
    backup_type VARCHAR(50) NOT NULL, -- 'local', 'cloud'
    retention_days INTEGER NOT NULL DEFAULT 7,
    auto_delete_enabled BOOLEAN DEFAULT true,
    keep_weekly BOOLEAN DEFAULT true, -- Keep one backup per week beyond retention
    keep_monthly BOOLEAN DEFAULT true, -- Keep one backup per month beyond retention
    max_backups INTEGER, -- Maximum number of backups to keep (null = unlimited)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by_user_id UUID REFERENCES users(id)
);

-- Archive bucket for cherry-picked backups
CREATE TABLE IF NOT EXISTS archive_buckets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_name VARCHAR(255) NOT NULL UNIQUE,
    provider VARCHAR(50) NOT NULL,
    credentials_id UUID REFERENCES cloud_credentials(id) ON DELETE SET NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by_user_id UUID REFERENCES users(id)
);

-- Track archived backups (cherry-picked ones)
CREATE TABLE IF NOT EXISTS archived_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_backup_id VARCHAR(255) NOT NULL, -- Reference to snapshots.id or cloud backup
    backup_type VARCHAR(50) NOT NULL, -- 'local', 'cloud'
    archive_bucket_id UUID REFERENCES archive_buckets(id) ON DELETE CASCADE,
    archive_path VARCHAR(500) NOT NULL,
    archive_size_bytes BIGINT,
    archived_at TIMESTAMPTZ DEFAULT now(),
    archived_by_user_id UUID REFERENCES users(id),
    notes TEXT,
    tags VARCHAR(255)[], -- Array of tags for categorization
    UNIQUE(original_backup_id, archive_bucket_id)
);

-- Backup deletion log (audit trail)
CREATE TABLE IF NOT EXISTS backup_deletion_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_id VARCHAR(255) NOT NULL,
    backup_type VARCHAR(50) NOT NULL,
    backup_path VARCHAR(500),
    deletion_reason VARCHAR(100), -- 'retention_policy', 'manual', 'cherry_picked'
    deleted_at TIMESTAMPTZ DEFAULT now(),
    deleted_by_user_id UUID REFERENCES users(id),
    policy_id UUID REFERENCES backup_retention_policies(id) ON DELETE SET NULL
);

-- Insert default retention policies
INSERT INTO backup_retention_policies (policy_name, backup_type, retention_days, auto_delete_enabled, keep_weekly, keep_monthly)
VALUES
    ('Local Default', 'local', 7, true, true, false),
    ('Cloud Default', 'cloud', 30, true, true, true)
ON CONFLICT (policy_name) DO NOTHING;

-- Create indexes
CREATE INDEX idx_cloud_credentials_active ON cloud_credentials(is_active);
CREATE INDEX idx_cloud_credentials_provider ON cloud_credentials(provider);
CREATE INDEX idx_backup_policies_active ON backup_retention_policies(is_active, backup_type);
CREATE INDEX idx_archived_backups_type ON archived_backups(backup_type);
CREATE INDEX idx_archived_backups_bucket ON archived_backups(archive_bucket_id);
CREATE INDEX idx_deletion_log_date ON backup_deletion_log(deleted_at);
CREATE INDEX idx_deletion_log_type ON backup_deletion_log(backup_type);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_backup_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cloud_credentials_timestamp
    BEFORE UPDATE ON cloud_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_backup_config_timestamp();

CREATE TRIGGER update_backup_retention_policies_timestamp
    BEFORE UPDATE ON backup_retention_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_backup_config_timestamp();
