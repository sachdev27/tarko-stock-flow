-- Version Control System
-- This migration adds functionality to create database snapshots and rollback

-- Table to store database snapshots
CREATE TABLE IF NOT EXISTS database_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_name TEXT NOT NULL,
  description TEXT,
  snapshot_data JSONB NOT NULL,
  table_counts JSONB NOT NULL, -- Store counts of records in each table
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_size_mb NUMERIC(10, 2),
  is_automatic BOOLEAN DEFAULT FALSE,
  tags TEXT[]
);

CREATE INDEX idx_snapshots_created_at ON database_snapshots(created_at DESC);
CREATE INDEX idx_snapshots_created_by ON database_snapshots(created_by);

-- Table to track rollback history
CREATE TABLE IF NOT EXISTS rollback_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID REFERENCES database_snapshots(id) NOT NULL,
  snapshot_name TEXT NOT NULL,
  rolled_back_by UUID REFERENCES users(id) NOT NULL,
  rolled_back_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_state_summary JSONB, -- Summary of state before rollback
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  affected_tables TEXT[]
);

CREATE INDEX idx_rollback_history_snapshot ON rollback_history(snapshot_id);
CREATE INDEX idx_rollback_history_rolled_back_at ON rollback_history(rolled_back_at DESC);

COMMENT ON TABLE database_snapshots IS 'Stores complete database snapshots for version control and rollback';
COMMENT ON TABLE rollback_history IS 'Tracks all rollback operations performed on the system';
