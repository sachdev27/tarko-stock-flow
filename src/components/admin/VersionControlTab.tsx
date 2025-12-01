import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Database, History, Cloud, Save } from 'lucide-react';
import { versionControl } from '@/lib/api';
import { useState, useEffect } from 'react';
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

  useEffect(() => {
    fetchCloudStatus();
    fetchStorageStats();
  }, []);

  const fetchStorageStats = async () => {
    try {
      const response = await versionControl.getStorageStats();
      setStorageStats(response.data);
    } catch (error: any) {
      console.error('Failed to fetch storage stats:', error);
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
    try {
      await versionControl.createSnapshot(snapshotForm);
      toast.success('Snapshot created successfully' + (cloudStatus?.enabled ? ' and syncing to cloud...' : ''));
      setSnapshotDialog(false);
      setSnapshotForm({ snapshot_name: '', description: '', tags: [] });
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create snapshot');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadToCloud = async (snapshotId: string) => {
    try {
      await versionControl.uploadToCloud(snapshotId);
      toast.success('Snapshot uploaded to cloud successfully');
      fetchCloudSnapshots();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to upload to cloud');
    }
  };

  const handleDownloadFromCloud = async (snapshotId: string) => {
    try {
      await versionControl.downloadFromCloud(snapshotId);
      toast.success('Snapshot downloaded from cloud successfully');
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to download from cloud');
    }
  };

  const handleRestoreFromCloud = async (snapshotId: string) => {
    if (!confirm('Restore database from cloud snapshot? This will replace current data.')) return;

    setCloudLoading(true);
    try {
      await versionControl.restoreFromCloud(snapshotId);
      toast.success('Database restored from cloud successfully');
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to restore from cloud');
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
    try {
      await versionControl.importFromExternal({
        source_path: sourcePath
      });
      toast.success('Snapshot imported successfully');
      setImportDialog(false);
      onDataChange();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to import snapshot');
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
      // Refresh cloud status immediately
      setTimeout(() => {
        fetchCloudStatus();
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
      />

        <ImportDialog
          open={importDialog}
          onOpenChange={setImportDialog}
          onImport={handleImportFromExternal}
          loading={loading}
          snapshot={selectedExternalSnapshot}
          devicePath={selectedDevice}
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
