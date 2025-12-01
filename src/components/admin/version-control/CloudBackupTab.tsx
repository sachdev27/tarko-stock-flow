import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Cloud, CloudDownload, RotateCcw, Trash2, Settings, RefreshCw, CloudUpload, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface CloudBackupTabProps {
  cloudStatus: any;
  cloudSnapshots: any[];
  cloudLoading: boolean;
  localSnapshots: any[];
  autoSync: boolean;
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
  const getUnsyncedSnapshots = () => {
    if (!localSnapshots || !cloudSnapshots) return [];
    const cloudIds = new Set(cloudSnapshots.map(s => s.id));
    return localSnapshots.filter(s => !cloudIds.has(s.id));
  };

  const unsyncedSnapshots = getUnsyncedSnapshots();

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
              <h3 className="font-semibold text-sm mb-3">Cloud Backups ({cloudSnapshots.length})</h3>
              {cloudLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading cloud snapshots...</div>
              ) : cloudSnapshots.length > 0 ? (
                <div className="space-y-2">
                  {cloudSnapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Cloud className="h-4 w-4 text-blue-500" />
                          <h3 className="font-semibold">{snapshot.id}</h3>
                          <Badge variant="outline" className="text-xs">{snapshot.provider}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>Uploaded: {formatDate(snapshot.uploaded_at)}</span>
                          <span>Size: {snapshot.total_size_mb?.toFixed(2)} MB</span>
                          <span>{snapshot.file_count} files</span>
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
