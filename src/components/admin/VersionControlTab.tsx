import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Database, History, Cloud, Save } from 'lucide-react';
import { versionControl } from '@/lib/api-typed';
import { useState, useEffect } from 'react';
import type * as API from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BackupStorageTab } from './version-control/BackupStorageTab';
import { CloudBackupTab } from './version-control/CloudBackupTab';
import { RollbackHistoryTab } from './version-control/RollbackHistoryTab';
import {
  CreateSnapshotDialog,
  RollbackConfirmDialog,
  ExportDialog,
  ImportDialog,
  CloudConfigDialog,
  StoragePathDialog,
} from './version-control/dialogs';

interface VersionControlTabProps {
  snapshots: any[];
  rollbackHistory: any[];
  onDataChange: () => void;
}

export const VersionControlTab = ({ snapshots, rollbackHistory, onDataChange }: VersionControlTabProps) => {
  const [snapshotDialog, setSnapshotDialog] = useState(false);
  const [rollbackDialog, setRollbackDialog] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [snapshotForm, setSnapshotForm] = useState({
    snapshot_name: '',
    description: '',
    tags: [] as string[],
  });

  // Cloud storage state
  const [cloudStatus, setCloudStatus] = useState<any>(null);
  const [cloudSnapshots, setCloudSnapshots] = useState<any[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudConfigDialog, setCloudConfigDialog] = useState(false);
  const [cloudProvider, setCloudProvider] = useState('r2');
  const [autoSync, setAutoSync] = useState(true);

  // Progress tracking
  const [operationProgress, setOperationProgress] = useState<{
    type: 'upload' | 'download' | 'restore' | 'export' | 'import' | 'create' | null;
    progress: number;
    message: string;
    snapshotId?: string;
  }>({ type: null, progress: 0, message: '' });

  // External storage state
  const [externalDevices, setExternalDevices] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [externalSnapshots, setExternalSnapshots] = useState<any[]>([]);
  const [exportDialog, setExportDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [selectedExternalSnapshot, setSelectedExternalSnapshot] = useState<any>(null);
  const [detectingDevices, setDetectingDevices] = useState(false);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  // Local storage path state
  const [storagePathDialog, setStoragePathDialog] = useState(false);
  const [storageStats, setStorageStats] = useState<any>(null);

  // Auto-snapshot state
  const [autoSnapshotEnabled, setAutoSnapshotEnabled] = useState(false);
  const [autoSnapshotTime, setAutoSnapshotTime] = useState('00:00');

  useEffect(() => {
    fetchCloudStatus();
    fetchStorageStats();
    fetchAutoSnapshotSettings();
  }, []);

  const fetchStorageStats = async () => {
    try {
      const response = await versionControl.getStorageStats();
      setStorageStats(response.data);
    } catch (error: any) {
      console.error('Failed to fetch storage stats:', error);
    }
  };

  const fetchAutoSnapshotSettings = async () => {
    try {
      const response = await versionControl.getAutoSnapshotSettings();
      setAutoSnapshotEnabled(response.data.enabled);
      setAutoSnapshotTime(response.data.time);
    } catch (error: any) {
      console.error('Failed to fetch auto-snapshot settings:', error);
    }
  };

  const handleToggleAutoSnapshot = async (enabled: boolean) => {
    try {
      await versionControl.updateAutoSnapshotSettings({
        enabled,
        time: autoSnapshotTime
      });
      setAutoSnapshotEnabled(enabled);
      toast.success(`Daily auto-snapshot ${enabled ? 'enabled' : 'disabled'}${enabled && cloudStatus?.enabled ? ' with cloud sync' : ''}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update auto-snapshot settings');
    }
  };

  const fetchCloudStatus = async () => {
    try {
      const response = await versionControl.getCloudStatus();
      setCloudStatus(response.data);
    } catch (error: any) {
      console.error('Failed to fetch cloud status:', error);
    }
  };

  const fetchCloudSnapshots = async () => {
    if (!cloudStatus?.enabled) return;
    setCloudLoading(true);
    try {
      const response = await versionControl.getCloudSnapshots();
      setCloudSnapshots(response.data.snapshots || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load cloud snapshots');
    } finally {
      setCloudLoading(false);
    }
  };

  const fetchExternalDevices = async () => {
    setDetectingDevices(true);
    try {
      const response = await versionControl.detectExternalDevices();
      setExternalDevices(response.data.devices || []);
      if (response.data.devices?.length > 0) {
        toast.success(`Found ${response.data.devices.length} external device(s)`);
      } else {
        toast.info('No external devices detected');
      }
    } catch (error: any) {
      toast.error('Failed to detect devices');
      console.error('Failed to detect devices:', error);
    } finally {
      setDetectingDevices(false);
    }
  };

  const fetchExternalSnapshots = async (devicePath: string) => {
    setLoadingSnapshots(true);
    try {
      const response = await versionControl.listExternalSnapshots({ device_path: devicePath });
      setExternalSnapshots(response.data.snapshots || []);
      if (response.data.snapshots?.length > 0) {
        toast.success(`Found ${response.data.snapshots.length} snapshot(s) on device`);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to list external snapshots');
      setExternalSnapshots([]);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!snapshotForm.snapshot_name) {
      toast.error('Snapshot name is required');
      return;
    }

    setLoading(true);
    setOperationProgress({ type: 'create', progress: 10, message: 'Preparing snapshot...' });
    try {
      setOperationProgress({ type: 'create', progress: 30, message: 'Capturing database state...' });
      await versionControl.createSnapshot(snapshotForm);
      setOperationProgress({ type: 'create', progress: 80, message: 'Finalizing snapshot...' });
      toast.success('Snapshot created successfully' + (cloudStatus?.enabled ? ' and syncing to cloud...' : ''));
      setOperationProgress({ type: 'create', progress: 100, message: 'Complete!' });
      setTimeout(() => setOperationProgress({ type: null, progress: 0, message: '' }), 1000);
      setSnapshotDialog(false);
      setSnapshotForm({ snapshot_name: '', description: '', tags: [] });
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create snapshot');
      setOperationProgress({ type: null, progress: 0, message: '' });
    } finally {
      setLoading(false);
    }
  };

  const handleUploadToCloud = async (snapshotId: string) => {
    setOperationProgress({ type: 'upload', progress: 10, message: 'Preparing upload...', snapshotId });
    try {
      setOperationProgress({ type: 'upload', progress: 30, message: 'Uploading to cloud...', snapshotId });
      await versionControl.uploadToCloud(snapshotId);
      setOperationProgress({ type: 'upload', progress: 90, message: 'Finalizing...', snapshotId });
      toast.success('Snapshot uploaded to cloud successfully');
      setOperationProgress({ type: 'upload', progress: 100, message: 'Upload complete!', snapshotId });
      setTimeout(() => setOperationProgress({ type: null, progress: 0, message: '' }), 1000);
      fetchCloudSnapshots();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to upload to cloud');
      setOperationProgress({ type: null, progress: 0, message: '' });
    }
  };

  const handleDownloadFromCloud = async (snapshotId: string) => {
    setOperationProgress({ type: 'download', progress: 10, message: 'Connecting to cloud...', snapshotId });
    try {
      setOperationProgress({ type: 'download', progress: 30, message: 'Downloading from cloud...', snapshotId });
      await versionControl.downloadFromCloud(snapshotId);
      setOperationProgress({ type: 'download', progress: 80, message: 'Registering snapshot...', snapshotId });
      toast.success('Snapshot downloaded from cloud successfully');
      setOperationProgress({ type: 'download', progress: 100, message: 'Download complete!', snapshotId });
      setTimeout(() => setOperationProgress({ type: null, progress: 0, message: '' }), 1000);
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to download from cloud');
      setOperationProgress({ type: null, progress: 0, message: '' });
    }
  };

  const handleRestoreFromCloud = async (snapshotId: string) => {
    if (!confirm('Restore database from cloud snapshot? This will replace current data.')) return;

    setCloudLoading(true);
    setOperationProgress({ type: 'restore', progress: 10, message: 'Connecting to cloud...', snapshotId });
    try {
      // First download from cloud and register in database
      setOperationProgress({ type: 'restore', progress: 20, message: 'Downloading snapshot from cloud...', snapshotId });
      const downloadResponse = await versionControl.restoreFromCloud(snapshotId);

      if (downloadResponse.data.needs_rollback) {
        // Then automatically rollback to this snapshot
        setOperationProgress({ type: 'restore', progress: 50, message: 'Restoring database from snapshot...', snapshotId });
        const rollbackResponse = await versionControl.rollbackToSnapshot(snapshotId, true);

        setOperationProgress({ type: 'restore', progress: 90, message: 'Finalizing restore...', snapshotId });
        toast.success(`✅ Restore from cloud completed! ${rollbackResponse.data.affected_tables.length} tables restored.`);
      } else {
        toast.success('Database restored from cloud successfully');
      }

      setOperationProgress({ type: 'restore', progress: 100, message: 'Restore complete!', snapshotId });
      setTimeout(() => setOperationProgress({ type: null, progress: 0, message: '' }), 1500);
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to restore from cloud');
      setOperationProgress({ type: null, progress: 0, message: '' });
    } finally {
      setCloudLoading(false);
    }
  };

  const handleDeleteFromCloud = async (snapshotId: string) => {
    if (!confirm('Delete snapshot from cloud storage?')) return;

    try {
      await versionControl.deleteFromCloud(snapshotId);
      toast.success('Snapshot deleted from cloud');
      fetchCloudSnapshots();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete from cloud');
    }
  };

  const handleExportToExternal = async (destinationPath: string) => {
    if (!selectedSnapshot) {
      toast.error('Please select a snapshot');
      return;
    }

    setLoading(true);
    try {
      await versionControl.exportToExternal({
        snapshot_id: selectedSnapshot.id,
        destination_path: destinationPath,
        compress: true
      });
      toast.success('Snapshot exported successfully');
      setExportDialog(false);
      setSelectedSnapshot(null);

      // Refresh external snapshots if the path is currently selected
      if (selectedDevice === destinationPath) {
        await fetchExternalSnapshots(destinationPath);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to export snapshot');
    } finally {
      setLoading(false);
    }
  };

  const handleImportFromExternal = async (sourcePath: string) => {
    setLoading(true);
    setOperationProgress({ type: 'import', progress: 10, message: 'Reading external backup...' });
    try {
      // First import the snapshot (copies files and registers in DB)
      setOperationProgress({ type: 'import', progress: 30, message: 'Importing snapshot files...' });
      const importResponse = await versionControl.importFromExternal({
        source_path: sourcePath
      });
      const snapshotId = importResponse.data.snapshot_id;

      setOperationProgress({ type: 'import', progress: 50, message: 'Snapshot imported successfully' });
      toast.success('Snapshot imported successfully');

      // Then automatically rollback to this snapshot
      setOperationProgress({ type: 'import', progress: 60, message: 'Restoring database from snapshot...' });
      const rollbackResponse = await versionControl.rollbackToSnapshot(snapshotId, true);

      setOperationProgress({ type: 'import', progress: 90, message: 'Finalizing restore...' });
      toast.success(`✅ Restore completed! ${rollbackResponse.data.affected_tables.length} tables restored.`);
      setOperationProgress({ type: 'import', progress: 100, message: 'Import & restore complete!' });
      setTimeout(() => setOperationProgress({ type: null, progress: 0, message: '' }), 1500);
      setImportDialog(false);
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to import and restore snapshot');
      setOperationProgress({ type: null, progress: 0, message: '' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm('Are you sure you want to delete this snapshot?')) return;

    try {
      await versionControl.deleteSnapshot(snapshotId);
      toast.success('Snapshot deleted successfully');
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete snapshot');
    }
  };

  const handleRollback = async () => {
    if (!selectedSnapshot) return;

    setLoading(true);
    try {
      const response = await versionControl.rollbackToSnapshot(selectedSnapshot.id, true);
      toast.success(`Rollback completed! ${response.data.affected_tables.length} tables restored.`);
      setRollbackDialog(false);
      setSelectedSnapshot(null);
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Rollback failed');
    } finally {
      setLoading(false);
    }
  };

  const openRollbackDialog = (snapshot: any) => {
    setSelectedSnapshot(snapshot);
    setRollbackDialog(true);
  };

  const handleSelectDevice = (path: string) => {
    setSelectedDevice(path);
    fetchExternalSnapshots(path);
  };

  const handleImportClick = (snapshot?: any) => {
    if (snapshot) {
      setSelectedExternalSnapshot(snapshot);
    }
    setImportDialog(true);
  };

  const handleSaveCloudConfig = async (config: any) => {
    try {
      const response = await versionControl.configureCloud(config);
      toast.success('Cloud backup enabled successfully! 🎉');
      // Refresh cloud status and snapshots immediately
      await fetchCloudStatus();
      setTimeout(() => {
        fetchCloudSnapshots();
      }, 500);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save cloud configuration');
      throw error;
    }
  };

  const handleToggleAutoSync = async (enabled: boolean) => {
    setAutoSync(enabled);
    toast.success(`Auto-sync ${enabled ? 'enabled' : 'disabled'}`);
    // TODO: Save to backend preference
  };

  const handleManualSync = async () => {
    if (!cloudStatus?.enabled) {
      toast.error('Cloud backup is not configured');
      return;
    }

    setCloudLoading(true);
    try {
      // Find all local snapshots not in cloud
      const cloudIds = new Set(cloudSnapshots.map((s: any) => s.id));
      const unsyncedSnapshots = snapshots.filter((s: any) => !cloudIds.has(s.id));

      if (unsyncedSnapshots.length === 0) {
        toast.info('All snapshots are already synced to cloud');
        setCloudLoading(false);
        return;
      }

      toast.info(`Syncing ${unsyncedSnapshots.length} snapshot(s)...`);

      // Upload each unsynced snapshot
      for (const snapshot of unsyncedSnapshots) {
        await versionControl.uploadToCloud(snapshot.id);
      }

      toast.success(`Synced ${unsyncedSnapshots.length} snapshot(s) to cloud`);
      await fetchCloudSnapshots();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Sync failed');
    } finally {
      setCloudLoading(false);
    }
  };

  const handleCreateAndUpload = async () => {
    if (!cloudStatus?.enabled) {
      toast.error('Cloud backup is not configured');
      return;
    }

    // Open dialog with auto-upload intention
    setSnapshotForm({
      snapshot_name: `Cloud Backup ${new Date().toLocaleDateString()}`,
      description: 'Automatic cloud backup',
      tags: ['cloud', 'auto']
    });
    setSnapshotDialog(true);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="backups" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="backups">
            <Database className="h-4 w-4 mr-2" />
            Backup Storage
          </TabsTrigger>
          <TabsTrigger value="cloud" onClick={() => fetchCloudSnapshots()}>
            <Cloud className="h-4 w-4 mr-2" />
            Cloud Backup
            {cloudStatus?.enabled && <Badge variant="secondary" className="ml-2 text-xs">Active</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backups" className="space-y-4">
          <BackupStorageTab
            snapshots={snapshots}
            cloudStatus={cloudStatus}
            storageStats={storageStats}
            operationProgress={operationProgress}
            autoSnapshotEnabled={autoSnapshotEnabled}
            autoSnapshotTime={autoSnapshotTime}
            onToggleAutoSnapshot={handleToggleAutoSnapshot}
            onCreateSnapshot={() => setSnapshotDialog(true)}
            onRollback={openRollbackDialog}
            onDelete={handleDeleteSnapshot}
            onUploadToCloud={handleUploadToCloud}
            onExport={(snapshot) => {
              setSelectedSnapshot(snapshot);
              setExportDialog(true);
            }}
            onShowStoragePath={() => setStoragePathDialog(true)}
            onSelectDevice={handleSelectDevice}
            externalSnapshots={externalSnapshots}
            loadingSnapshots={loadingSnapshots}
            onImport={handleImportClick}
          />
        </TabsContent>

        <TabsContent value="cloud" className="space-y-4">
          <CloudBackupTab
            cloudStatus={cloudStatus}
            cloudSnapshots={cloudSnapshots}
            cloudLoading={cloudLoading}
            localSnapshots={snapshots}
            autoSync={autoSync}
            operationProgress={operationProgress}
            onConfigureCloud={() => setCloudConfigDialog(true)}
            onEditConfig={() => setCloudConfigDialog(true)}
            onDownload={handleDownloadFromCloud}
            onRestore={handleRestoreFromCloud}
            onDelete={handleDeleteFromCloud}
            onUploadToCloud={handleUploadToCloud}
            onToggleAutoSync={handleToggleAutoSync}
            onManualSync={handleManualSync}
            onCreateAndUpload={handleCreateAndUpload}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <RollbackHistoryTab rollbackHistory={rollbackHistory} />
        </TabsContent>
      </Tabs>

      <CreateSnapshotDialog
        open={snapshotDialog}
        onOpenChange={setSnapshotDialog}
        snapshotForm={snapshotForm}
        onFormChange={setSnapshotForm}
        onSubmit={handleCreateSnapshot}
        loading={loading}
        cloudEnabled={cloudStatus?.enabled}
      />

      <RollbackConfirmDialog
        open={rollbackDialog}
        onOpenChange={setRollbackDialog}
        snapshot={selectedSnapshot}
        onConfirm={handleRollback}
        loading={loading}
      />

      <ExportDialog
        open={exportDialog}
        onOpenChange={setExportDialog}
        snapshot={selectedSnapshot}
        onExport={handleExportToExternal}
        loading={loading}
        operationProgress={operationProgress}
        onProgressUpdate={setOperationProgress}
      />

        <ImportDialog
          open={importDialog}
          onOpenChange={setImportDialog}
          onImport={handleImportFromExternal}
          loading={loading}
          snapshot={selectedExternalSnapshot}
          devicePath={selectedDevice}
          operationProgress={operationProgress}
        />      <CloudConfigDialog
        open={cloudConfigDialog}
        onOpenChange={setCloudConfigDialog}
        provider={cloudProvider}
        onProviderChange={setCloudProvider}
        onSave={handleSaveCloudConfig}
        cloudStatus={cloudStatus}
      />

      <StoragePathDialog
        open={storagePathDialog}
        onOpenChange={setStoragePathDialog}
        storageStats={storageStats}
      />
    </div>
  );
};
