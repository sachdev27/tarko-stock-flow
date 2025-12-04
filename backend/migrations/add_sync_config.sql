-- Add sync configuration table for continuous backup sync
CREATE TABLE IF NOT EXISTS sync_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    sync_type VARCHAR(50) NOT NULL CHECK (sync_type IN ('rsync', 'network', 'r2', 's3')),

    -- For rsync (NAS/local storage)
    rsync_destination TEXT,
    rsync_user VARCHAR(100),
    rsync_host VARCHAR(255),
    rsync_port INTEGER DEFAULT 22,
    ssh_key_path TEXT,

    -- For network storage (mounted NAS - SMB/CIFS/NFS)
    network_mount_path TEXT,

    -- For R2/S3
    cloud_provider VARCHAR(50),
    cloud_bucket VARCHAR(255),
    cloud_access_key TEXT,
    cloud_secret_key TEXT, -- encrypted
    cloud_endpoint TEXT,
    cloud_region VARCHAR(100),

    -- Sync settings
    is_enabled BOOLEAN DEFAULT TRUE,
    auto_sync_enabled BOOLEAN DEFAULT FALSE,
    sync_interval_seconds INTEGER DEFAULT 60, -- 1 minute default

    -- What to sync
    sync_postgres_data BOOLEAN DEFAULT FALSE,
    sync_database_snapshots BOOLEAN DEFAULT TRUE,
    sync_uploads BOOLEAN DEFAULT TRUE,
    sync_backups BOOLEAN DEFAULT TRUE,

    -- Status tracking
    last_sync_at TIMESTAMPTZ,
    last_sync_status VARCHAR(50), -- 'success', 'failed', 'in_progress'
    last_sync_error TEXT,
    last_sync_files_count INTEGER,
    last_sync_bytes_transferred BIGINT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_sync_config_enabled ON sync_config(is_enabled, auto_sync_enabled);
CREATE INDEX idx_sync_config_last_sync ON sync_config(last_sync_at);

-- Sync history for audit trail
CREATE TABLE IF NOT EXISTS sync_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_config_id UUID NOT NULL REFERENCES sync_config(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'in_progress'
    files_synced INTEGER DEFAULT 0,
    bytes_transferred BIGINT DEFAULT 0,
    duration_seconds NUMERIC(10,2),
    error_message TEXT,
    triggered_by VARCHAR(50) DEFAULT 'manual', -- 'manual', 'auto', 'schedule'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_history_config ON sync_history(sync_config_id, started_at DESC);
CREATE INDEX idx_sync_history_status ON sync_history(status, started_at DESC);

COMMENT ON TABLE sync_config IS 'Configuration for continuous sync to NAS or cloud storage';
COMMENT ON TABLE sync_history IS 'Audit trail of all sync operations';
