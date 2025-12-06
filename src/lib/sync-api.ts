import api from './api';

export type SyncType = 'rsync' | 'network' | 'r2' | 's3';

export interface SyncConfig {
  name: string;
  sync_type: SyncType;
  // Rsync fields
  rsync_destination?: string;
  rsync_user?: string;
  rsync_host?: string;
  rsync_port?: number;
  ssh_key_path?: string;
  // Network storage
  network_mount_path?: string;
  // Cloud fields
  cloud_provider?: string;
  cloud_bucket?: string;
  cloud_access_key?: string;
  cloud_secret_key?: string;
  cloud_endpoint?: string;
  cloud_region?: string;
  // Settings
  is_enabled?: boolean;
  auto_sync_enabled?: boolean;
  sync_interval_seconds?: number;
  // Which PostgreSQL backup method to use
  backup_method?: 'pg_dump' | 'pg_basebackup' | 'both';
  // @deprecated - System now only syncs PostgreSQL data directory
  sync_postgres_data?: boolean;
  // @deprecated - No longer supported, system only syncs PostgreSQL data
  sync_database_snapshots?: boolean;
  // @deprecated - No longer supported, system only syncs PostgreSQL data
  sync_uploads?: boolean;
  // @deprecated - No longer supported, system only syncs PostgreSQL data
  sync_backups?: boolean;
}

export interface SyncConfigResponse extends SyncConfig {
  id: string;
  created_at: string;
  updated_at: string;
  last_sync_at?: string;
  last_sync_status?: 'pending' | 'running' | 'success' | 'failed';
  last_sync_error?: string;
  last_sync_files_count?: number;
  last_sync_bytes_transferred?: number;
}

export interface SyncHistoryItem {
  id: string;
  config_id: string;
  config_name: string;
  sync_type: SyncType;
  status: 'pending' | 'running' | 'success' | 'failed';
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  files_synced: number;
  bytes_transferred: number;
  error_message?: string;
  triggered_by: 'auto' | 'manual';
}

export interface SyncStatusConfig {
  id: string;
  name: string;
  sync_type: SyncType;
  auto_sync_enabled: boolean;
  last_sync_at?: string;
  last_sync_status?: 'pending' | 'running' | 'success' | 'failed';
  last_sync_files_count?: number;
  last_sync_bytes_transferred?: number;
  is_synced: boolean;
}

export interface SyncStatus {
  configs: SyncStatusConfig[];
  all_synced: boolean;
  any_auto_sync_enabled: boolean;
  last_check?: string;
}

export const sync = {
  // Get current sync status for all configurations
  getStatus: () => api.get<SyncStatus>('/sync/status'),

  // Get all sync configurations
  getConfigs: () => api.get('/sync/config'),

  // Create new sync configuration
  createConfig: (data: SyncConfig) => api.post('/sync/config', data),

  // Update sync configuration
  updateConfig: (id: string, data: Partial<SyncConfig>) => api.put(`/sync/config/${id}`, data),

  // Delete sync configuration
  deleteConfig: (id: string) => api.delete(`/sync/config/${id}`),

  // Test sync connection with config data (before saving)
  testConfigData: (data: SyncConfig) => api.post('/sync/config/test', data),

  // Test existing sync configuration
  testConfig: (id: string) => api.post(`/sync/config/${id}/test`),

  // Manually trigger sync
  triggerSync: (configId: string) => api.post('/sync/trigger', { config_id: configId }),

  // Get sync history
  getHistory: (params?: { limit?: number; config_id?: string }) =>
    api.get('/sync/history', { params }),
};
