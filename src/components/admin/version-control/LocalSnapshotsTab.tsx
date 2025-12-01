import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, RotateCcw, Trash2, CloudUpload, Upload, Save, HardDrive, FolderOpen } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface LocalSnapshotsTabProps {
  snapshots: any[];
  cloudStatus: any;
  storageStats: any;
  onCreateSnapshot: () => void;
  onRollback: (snapshot: any) => void;
  onDelete: (snapshotId: string) => void;
  onUploadToCloud: (snapshotId: string) => void;
  onExport: (snapshot: any) => void;
  onShowStoragePath: () => void;
}

export const LocalSnapshotsTab = ({
  snapshots,
  cloudStatus,
  storageStats,
  onCreateSnapshot,
  onRollback,
  onDelete,
  onUploadToCloud,
  onExport,
  onShowStoragePath,
}: LocalSnapshotsTabProps) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Local Database Snapshots
            </CardTitle>
            <CardDescription>
              Create and manage snapshots stored locally
              {cloudStatus?.enabled && ' • Auto-syncs to cloud'}
            </CardDescription>
            {storageStats && (
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />
                  {storageStats.storage_path}
                </span>
                <span>{storageStats.snapshot_count} snapshots</span>
                <span>{storageStats.total_size_gb?.toFixed(2)} GB used</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={onShowStoragePath}
                >
                  <FolderOpen className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <Button onClick={onCreateSnapshot}>
            <Save className="h-4 w-4 mr-2" />
            Create Snapshot
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {snapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{snapshot.snapshot_name}</h3>
                  {snapshot.is_automatic && (
                    <Badge variant="secondary" className="text-xs">Auto</Badge>
                  )}
                </div>
                {snapshot.description && (
                  <p className="text-sm text-muted-foreground mt-1">{snapshot.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Created: {formatDate(snapshot.created_at)}</span>
                  <span>By: {snapshot.created_by_name || snapshot.created_by_username}</span>
                  <span>Size: {parseFloat(snapshot.file_size_mb || 0).toFixed(2)} MB</span>
                  {snapshot.table_counts && (
                    <span>
                      {Object.keys(snapshot.table_counts).length} tables
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {cloudStatus?.enabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUploadToCloud(snapshot.id)}
                    title="Upload to cloud"
                  >
                    <CloudUpload className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onExport(snapshot)}
                  title="Export to external device"
                >
                  <Upload className="h-4 w-4" />
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onRollback(snapshot)}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Rollback
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
          {snapshots.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No snapshots created yet. Create your first snapshot to enable version control.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
