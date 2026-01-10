import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Cloud, CloudDownload, RotateCcw, Trash2, Settings, RefreshCw, CloudUpload, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { versionControl } from '@/lib/api-typed';
import { toast } from 'sonner';
import type * as API from '@/types';

interface CloudBackupTabProps {
  cloudStatus: any;
  cloudSnapshots: any[];
  cloudLoading: boolean;
  localSnapshots: any[];
  autoSync: boolean;
  operationProgress?: {
    type: 'upload' | 'download' | 'restore' | 'export' | 'import' | 'create' | null;
    progress: number;
    message: string;
    snapshotId?: string;
  };
  onConfigureCloud: () => void;
  onEditConfig: () => void;
  onDownload: (snapshotId: string) => void;
  onRestore: (snapshotId: string) => void;
  onDelete: (snapshotId: string) => void;
  onUploadToCloud: (snapshotId: string) => void;
  onToggleAutoSync: (enabled: boolean) => void;
  onManualSync: () => void;
  onCreateAndUpload: () => void;
}

export const CloudBackupTab = ({
  cloudStatus,
  cloudSnapshots,
  cloudLoading,
  localSnapshots,
  autoSync,
  operationProgress,
  onConfigureCloud,
  onEditConfig,
  onDownload,
  onRestore,
  onDelete,
  onUploadToCloud,
  onToggleAutoSync,
  onManualSync,
  onCreateAndUpload,
}: CloudBackupTabProps) => {
  // Debug logging
  React.useEffect(() => {
    console.log('CloudBackupTab - cloudStatus:', cloudStatus);
    console.log('CloudBackupTab - cloudStatus?.enabled:', cloudStatus?.enabled);
  }, [cloudStatus]);

  const [selectedCloudSnapshots, setSelectedCloudSnapshots] = React.useState<Set<string>>(new Set());
  const [selectAllCloud, setSelectAllCloud] = React.useState(false);

  const getUnsyncedSnapshots = () => {
    if (!localSnapshots || !cloudSnapshots) return [];
    const cloudIds = new Set(cloudSnapshots.map(s => s.id));
    return localSnapshots.filter(s => !cloudIds.has(s.id));
  };

  const unsyncedSnapshots = getUnsyncedSnapshots();

  const isOperationActive = operationProgress && operationProgress.type && ['upload', 'download', 'restore'].includes(operationProgress.type);

  const handleSelectCloudSnapshot = (snapshotId: string) => {
    const newSelected = new Set(selectedCloudSnapshots);
    if (newSelected.has(snapshotId)) {
      newSelected.delete(snapshotId);
    } else {
      newSelected.add(snapshotId);
    }
    setSelectedCloudSnapshots(newSelected);
    setSelectAllCloud(newSelected.size === cloudSnapshots.length);
  };

  const handleSelectAllCloud = () => {
    if (selectAllCloud) {
      setSelectedCloudSnapshots(new Set());
      setSelectAllCloud(false);
    } else {
      setSelectedCloudSnapshots(new Set(cloudSnapshots.map(s => s.id)));
      setSelectAllCloud(true);
    }
  };

  const handleBulkDeleteCloud = async () => {
    if (selectedCloudSnapshots.size === 0) {
      toast.error('No cloud snapshots selected');
      return;
    }

    if (!confirm(`Delete ${selectedCloudSnapshots.size} selected cloud snapshot(s)?`)) return;

    try {
      const response = await versionControl.bulkDeleteCloudSnapshots(Array.from(selectedCloudSnapshots));
      toast.success(response.data.message);
      setSelectedCloudSnapshots(new Set());
      setSelectAllCloud(false);
      window.location.reload();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete cloud snapshots');
    }
  };

  const handleCleanupOldCloud = async (days: number) => {
    if (!confirm(`Delete all cloud snapshots older than ${days} days?`)) return;

    try {
      const response = await versionControl.cleanupOldCloudSnapshots(days);
      toast.success(response.data.message);
      window.location.reload();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to cleanup old cloud snapshots');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Cloud Backup Storage
              {cloudStatus?.enabled ? (
                <Badge variant="default" className="ml-2">Connected</Badge>
              ) : (
                <Badge variant="secondary" className="ml-2">Disabled</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {cloudStatus?.enabled
                ? `${cloudStatus.provider?.toUpperCase()} • ${cloudSnapshots.length} backups • ${cloudStatus.stats?.total_size_gb?.toFixed(2) || 0} GB used`
                : 'Cloud backup is not enabled. Configure credentials below.'}
            </CardDescription>
          </div>
          {cloudStatus?.enabled ? (
            <div className="flex gap-2">
              {selectedCloudSnapshots.size > 0 && (
                <Button onClick={handleBulkDeleteCloud} variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedCloudSnapshots.size})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onEditConfig}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button variant="default" size="sm" onClick={onCreateAndUpload}>
                <CloudUpload className="h-4 w-4 mr-2" />
                Create & Upload
              </Button>
              <Button size="sm" onClick={onManualSync} disabled={cloudLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${cloudLoading ? 'animate-spin' : ''}`} />
                Sync Now
              </Button>
            </div>
          ) : (
            <Button onClick={onConfigureCloud}>
              <Cloud className="h-4 w-4 mr-2" />
              Configure Cloud
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!cloudStatus?.enabled ? (
          <div className="text-center py-8">
            <Cloud className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">Cloud Backup Not Configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enable cloud backup to automatically sync snapshots to Cloudflare R2 or AWS S3
            </p>
            <Button onClick={onConfigureCloud}>
              <Cloud className="h-4 w-4 mr-2" />
              Setup Cloud Backup
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Progress Indicator */}
            {isOperationActive && (
              <div className="p-4 border rounded-lg bg-primary/5 space-y-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="font-medium text-sm">{operationProgress.message}</span>
                </div>
                <Progress value={operationProgress.progress} className="h-2" />
                <div className="text-xs text-muted-foreground text-right">
                  {operationProgress.progress}%
                </div>
              </div>
            )}

            {/* Sync Settings */}
            <div className="p-4 border rounded-lg bg-muted/20">
              <div className="flex items-center justify-between mb-4">
                <div className="space-y-1">
                  <Label className="text-base font-semibold">Auto-Sync</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically upload new snapshots to cloud
                  </p>
                </div>
                <Switch
                  checked={autoSync}
                  onCheckedChange={onToggleAutoSync}
                />
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  {autoSync ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>Auto-sync: {autoSync ? 'Enabled' : 'Disabled'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Cloud className="h-4 w-4" />
                  <span>{cloudSnapshots.length} in cloud</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{unsyncedSnapshots.length} pending</span>
                </div>
              </div>
            </div>

            {/* Unsynced Snapshots */}
            {unsyncedSnapshots.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">Local Snapshots Not in Cloud ({unsyncedSnapshots.length})</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unsyncedSnapshots.forEach(s => onUploadToCloud(s.id))}
                  >
                    <CloudUpload className="h-4 w-4 mr-2" />
                    Sync All
                  </Button>
                </div>
                <div className="space-y-2">
                  {unsyncedSnapshots.slice(0, 3).map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="flex items-center justify-between p-3 border rounded-lg bg-amber-50 dark:bg-amber-950/20"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-amber-600" />
                          <span className="font-medium text-sm">{snapshot.snapshot_name}</span>
                          <Badge variant="secondary" className="text-xs">Not Synced</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatDate(snapshot.created_at)} • {parseFloat(snapshot.file_size_mb || 0).toFixed(2)} MB
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onUploadToCloud(snapshot.id)}
                      >
                        <CloudUpload className="h-4 w-4 mr-2" />
                        Upload
                      </Button>
                    </div>
                  ))}
                  {unsyncedSnapshots.length > 3 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      +{unsyncedSnapshots.length - 3} more snapshots
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Cloud Snapshots */}
            <div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-2">
                <h3 className="font-semibold text-sm">Cloud Backups ({cloudSnapshots.length})</h3>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCleanupOldCloud(7)}
                    title="Delete cloud snapshots older than 7 days"
                    className="flex-1 sm:flex-initial"
                  >
                    Clean 7d+
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCleanupOldCloud(30)}
                    title="Delete cloud snapshots older than 30 days"
                    className="flex-1 sm:flex-initial"
                  >
                    Clean 30d+
                  </Button>
                </div>
              </div>

              {/* Select All Checkbox */}
              {cloudSnapshots.length > 0 && (
                <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30 mb-3">
                  <input
                    type="checkbox"
                    checked={selectAllCloud}
                    onChange={handleSelectAllCloud}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <label className="text-sm font-medium cursor-pointer" onClick={handleSelectAllCloud}>
                    Select All ({selectedCloudSnapshots.size}/{cloudSnapshots.length})
                  </label>
                </div>
              )}

              {cloudLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading cloud snapshots...</div>
              ) : cloudSnapshots.length > 0 ? (
                <div className="space-y-2">
                  {cloudSnapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className={`flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
                        selectedCloudSnapshots.has(snapshot.id) ? 'bg-primary/5 border-primary' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCloudSnapshots.has(snapshot.id)}
                        onChange={() => handleSelectCloudSnapshot(snapshot.id)}
                        className="h-4 w-4 cursor-pointer"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Cloud className="h-4 w-4 text-blue-500" />
                          <h3 className="font-semibold">{snapshot.id}</h3>
                          <Badge variant="outline" className="text-xs">{snapshot.provider}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>📅 {new Date(snapshot.uploaded_at).toLocaleDateString()}</span>
                          <span>🕐 {new Date(snapshot.uploaded_at).toLocaleTimeString()}</span>
                          <span>💾 {snapshot.total_size_mb?.toFixed(2)} MB</span>
                          <span>📂 {snapshot.file_count} files</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDownload(snapshot.id)}
                          title="Download to local"
                        >
                          <CloudDownload className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => onRestore(snapshot.id)}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Restore
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(snapshot.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground border rounded-lg">
                  <Cloud className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>No snapshots in cloud storage yet</p>
                  {unsyncedSnapshots.length > 0 && (
                    <p className="text-sm mt-2">Upload local snapshots above to get started</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
