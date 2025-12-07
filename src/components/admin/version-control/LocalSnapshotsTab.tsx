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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 w-full min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Database className="h-5 w-5" />
              <span className="truncate">Local Database Snapshots</span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Create and manage snapshots stored locally
              {cloudStatus?.enabled && ' • Auto-syncs to cloud'}
            </CardDescription>
            {storageStats && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 min-w-0">
                  <HardDrive className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{storageStats.storage_path}</span>
                </span>
                <span className="whitespace-nowrap">{storageStats.snapshot_count} snapshots</span>
                <span className="whitespace-nowrap">
                  {storageStats.total_size_gb?.toFixed(2)} GB used
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 w-fit"
                  onClick={onShowStoragePath}
                >
                  <FolderOpen className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <Button onClick={onCreateSnapshot} size="sm" className="w-full sm:w-auto">
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
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold break-words">{snapshot.snapshot_name}</h3>
                  {snapshot.is_automatic && (
                    <Badge variant="secondary" className="text-xs">
                      Auto
                    </Badge>
                  )}
                </div>
                {snapshot.description && (
                  <p className="text-sm text-muted-foreground mt-1 break-words">
                    {snapshot.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="whitespace-nowrap">
                    Created: {formatDate(snapshot.created_at)}
                  </span>
                  <span className="whitespace-nowrap">
                    By: {snapshot.created_by_name || snapshot.created_by_username}
                  </span>
                  <span className="whitespace-nowrap">
                    Size: {parseFloat(snapshot.file_size_mb || 0).toFixed(2)} MB
                  </span>
                  {snapshot.table_counts && (
                    <span className="whitespace-nowrap">
                      {Object.keys(snapshot.table_counts).length} tables
                    </span>
                  )}
                </div>
              </div>

              {/* Desktop: Horizontal buttons - icons only on tablet, text on larger screens */}
              <div className="hidden sm:flex flex-shrink-0 gap-2 items-start">
                {cloudStatus?.enabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUploadToCloud(snapshot.id)}
                    title="Upload to cloud"
                    className="h-8 px-2 md:px-3"
                  >
                    <CloudUpload className="h-4 w-4" />
                    <span className="hidden md:inline ml-2">Cloud</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onExport(snapshot)}
                  title="Export to external device"
                  className="h-8 px-2 md:px-3"
                >
                  <Upload className="h-4 w-4" />
                  <span className="hidden md:inline ml-2">Export</span>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onRollback(snapshot)}
                  className="h-8 px-2 md:px-3"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span className="hidden md:inline ml-2">Rollback</span>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(snapshot.id)}
                  className="h-8 px-2 md:px-3"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden md:inline ml-2">Delete</span>
                </Button>
              </div>

              {/* Mobile: 2x2 Grid */}
              <div className="grid grid-cols-2 gap-2 w-full sm:hidden">
                {cloudStatus?.enabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUploadToCloud(snapshot.id)}
                    className="h-9"
                  >
                    <CloudUpload className="h-4 w-4 mr-1" />
                    <span className="text-xs">Cloud</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onExport(snapshot)}
                  className="h-9"
                >
                  <Upload className="h-4 w-4 mr-1" />
                  <span className="text-xs">Export</span>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onRollback(snapshot)}
                  className="h-9"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  <span className="text-xs">Rollback</span>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDelete(snapshot.id)}
                  className="h-9"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  <span className="text-xs">Delete</span>
                </Button>
              </div>
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
