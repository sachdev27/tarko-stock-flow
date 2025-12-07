import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Database, RotateCcw, Trash2, CloudUpload, Upload, Save, HardDrive, FolderOpen, RefreshCw, FileUp, Download, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { versionControl } from '@/lib/api-typed';
import { toast } from 'sonner';
import type * as API from '@/types';

interface BackupStorageTabProps {
  snapshots: any[];
  cloudStatus: any;
  storageStats: any;
  operationProgress?: {
    type: 'upload' | 'download' | 'restore' | 'export' | 'import' | 'create' | null;
    progress: number;
    message: string;
    snapshotId?: string;
  };
  autoSnapshotEnabled?: boolean;
  autoSnapshotTime?: string;
  onToggleAutoSnapshot?: (enabled: boolean) => void;
  onCreateSnapshot: () => void;
  onRollback: (snapshot: any) => void;
  onDelete: (snapshotId: string) => void;
  onUploadToCloud: (snapshotId: string) => void;
  onExport: (snapshot: any) => void;
  onShowStoragePath: () => void;
  onSelectDevice: (path: string) => void;
  externalSnapshots: any[];
  loadingSnapshots?: boolean;
  onImport: (snapshot?: any) => void;
}

export const BackupStorageTab = ({
  snapshots,
  cloudStatus,
  storageStats,
  operationProgress,
  autoSnapshotEnabled = false,
  autoSnapshotTime = '00:00',
  onToggleAutoSnapshot,
  onCreateSnapshot,
  onRollback,
  onDelete,
  onUploadToCloud,
  onExport,
  onShowStoragePath,
  onSelectDevice,
  externalSnapshots,
  loadingSnapshots = false,
  onImport,
}: BackupStorageTabProps) => {
  const [selectedPath, setSelectedPath] = useState('');
  const [activeSection, setActiveSection] = useState<'local' | 'external'>('local');
  const [suggestedPaths, setSuggestedPaths] = useState<string[]>([]);
  const [systemUsername, setSystemUsername] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Multi-select state
  const [selectedSnapshots, setSelectedSnapshots] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    fetchSuggestedPaths();
  }, []);

  const fetchSuggestedPaths = async () => {
    try {
      const response = await versionControl.getSuggestedPaths();
      setSuggestedPaths(response?.data?.suggestions || response?.suggestions || []);
      setSystemUsername(response?.data?.username || response?.username || 'user');

      // Set first suggestion as default
      const suggestions = response?.data?.suggestions || response?.suggestions || [];
      if (suggestions && suggestions.length > 0) {
        setSelectedPath(suggestions[0]);
      }
    } catch (error) {
      console.error('Failed to fetch suggested paths:', error);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.zip', '.tar.gz', '.tar', '.tgz'];
    const isValid = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!isValid) {
      toast.error('Please select a valid archive file (.zip, .tar.gz, .tar, or .tgz)');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';
      const response = await fetch(`${API_URL}/version-control/snapshots/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.error || 'Upload failed');
        }
        throw new Error(`Upload failed with status ${response.status}`);
      }

      const data = await response.json();
      toast.success(`Snapshot uploaded successfully: ${data.snapshot_id}`);

      // Refresh the local snapshots list
      window.location.reload();
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload snapshot');
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSelectSnapshot = (snapshotId: string) => {
    const newSelected = new Set(selectedSnapshots);
    if (newSelected.has(snapshotId)) {
      newSelected.delete(snapshotId);
    } else {
      newSelected.add(snapshotId);
    }
    setSelectedSnapshots(newSelected);
    setSelectAll(newSelected.size === snapshots.length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedSnapshots(new Set());
      setSelectAll(false);
    } else {
      setSelectedSnapshots(new Set(snapshots.map(s => s.id)));
      setSelectAll(true);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSnapshots.size === 0) {
      toast.error('No snapshots selected');
      return;
    }

    if (!confirm(`Delete ${selectedSnapshots.size} selected snapshot(s)?`)) return;

    try {
      const response = await versionControl.bulkDeleteSnapshots(Array.from(selectedSnapshots));
      toast.success(response.data.message);
      setSelectedSnapshots(new Set());
      setSelectAll(false);
      window.location.reload();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete snapshots');
    }
  };

  const handleCleanupOld = async (days: number) => {
    if (!confirm(`Delete all automatic snapshots older than ${days} days?`)) return;

    try {
      const response = await versionControl.cleanupOldSnapshots(days);
      toast.success(response.data.message);
      window.location.reload();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to cleanup old snapshots');
    }
  };

  const handleBrowse = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '';
    input.style.display = 'none';
    input.style.position = 'fixed';
    input.style.top = '-100px';
    (input as any).webkitdirectory = true;
    (input as any).directory = true;
    (input as any).mozdirectory = true;
    input.multiple = false;

    input.onchange = (event: any) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        let dirPath = '';

        if (file.path) {
          const fullPath = file.path;
          dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        } else if (file.webkitRelativePath) {
          const relativePath = file.webkitRelativePath;
          const parts = relativePath.split('/');
          parts.pop();
          if (parts.length > 0) {
            dirPath = parts[0];
          }
        }

        if (dirPath) {
          setSelectedPath(dirPath);
          onSelectDevice(dirPath);
          setActiveSection('external');
        }
      }

      try {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
        }
      } catch (e) {
        console.error('Error removing input:', e);
      }
    };

    input.oncancel = () => {
      try {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
        }
      } catch (e) {
        console.error('Error removing input:', e);
      }
    };

    document.body.appendChild(input);
    setTimeout(() => input.click(), 0);
  };  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Backup Storage
            </CardTitle>
            <CardDescription>
              Create, manage, and restore database snapshots
              {cloudStatus?.enabled && ' • Auto-syncs to cloud'}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {selectedSnapshots.size > 0 && (
              <Button onClick={handleBulkDelete} variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete ({selectedSnapshots.size})
              </Button>
            )}
            <Button onClick={onCreateSnapshot} variant="default">
              <Save className="h-4 w-4 mr-2" />
              Create Snapshot
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Auto-Snapshot Toggle */}
          <div className="p-4 border rounded-lg bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-base font-semibold flex items-center gap-2">
                  🤖 Daily Auto-Snapshot
                </Label>
                <p className="text-sm text-muted-foreground">
                  Automatically create snapshots daily at {autoSnapshotTime}
                  {cloudStatus?.enabled && ' and sync to cloud'}
                </p>
              </div>
              <Switch
                checked={autoSnapshotEnabled}
                onCheckedChange={onToggleAutoSnapshot}
              />
            </div>
          </div>

          {/* Progress Indicator */}
          {operationProgress && operationProgress.type && ['upload', 'import', 'export'].includes(operationProgress.type) && (
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

          {/* Section Tabs */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setActiveSection('local')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeSection === 'local'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Database className="h-4 w-4 inline mr-2" />
              Local Snapshots ({snapshots.length})
            </button>
            <button
              onClick={() => {
                setActiveSection('external');
                // Always trigger refresh when clicking this tab
                const pathToUse = selectedPath || (suggestedPaths && suggestedPaths.length > 0 ? suggestedPaths[0] : '');
                if (pathToUse) {
                  setSelectedPath(pathToUse);
                  onSelectDevice(pathToUse);
                  toast.info('Scanning for backups...');
                }
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeSection === 'external'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FolderOpen className="h-4 w-4 inline mr-2" />
              External Backups {selectedPath && `(${externalSnapshots.length})`}
            </button>
          </div>

          {/* Local Snapshots Section */}
          {activeSection === 'local' && (
            <div className="space-y-4">
              {/* Upload and Cleanup Actions */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2">
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.tar.gz,.tar,.tgz"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUploadClick}
                    disabled={uploading}
                    className="flex-1 sm:flex-initial"
                  >
                    <FileUp className="h-4 w-4 mr-2" />
                    {uploading ? 'Uploading...' : 'Upload Snapshot'}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCleanupOld(7)}
                    title="Delete automatic snapshots older than 7 days"
                    className="flex-1 sm:flex-initial"
                  >
                    Clean 7d+
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCleanupOld(30)}
                    title="Delete automatic snapshots older than 30 days"
                    className="flex-1 sm:flex-initial"
                  >
                    Clean 30d+
                  </Button>
                </div>
              </div>

              {/* Select All Checkbox */}
              {snapshots.length > 0 && (
                <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <label className="text-sm font-medium cursor-pointer" onClick={handleSelectAll}>
                    Select All ({selectedSnapshots.size}/{snapshots.length})
                  </label>
                </div>
              )}

              {snapshots.length > 0 ? (
                snapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className={`flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
                      selectedSnapshots.has(snapshot.id) ? 'bg-primary/5 border-primary' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSnapshots.has(snapshot.id)}
                      onChange={() => handleSelectSnapshot(snapshot.id)}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{snapshot.snapshot_name}</h3>
                        {snapshot.is_automatic && (
                          <Badge variant="secondary" className="text-xs">Auto</Badge>
                        )}
                        {snapshot.files_exist === false && (
                          <Badge variant="destructive" className="text-xs">⚠️ Files Missing</Badge>
                        )}
                      </div>
                      {snapshot.files_exist === false && (
                        <p className="text-xs text-destructive mt-1">
                          ⚠️ Snapshot files not found on disk. Export/Rollback unavailable.
                        </p>
                      )}
                      {snapshot.description && (
                        <p className="text-sm text-muted-foreground mt-1">{snapshot.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>📅 {new Date(snapshot.created_at).toLocaleDateString()}</span>
                        <span>🕐 {new Date(snapshot.created_at).toLocaleTimeString()}</span>
                        <span>👤 {snapshot.created_by_name || snapshot.created_by_username}</span>
                        <span>💾 {parseFloat(snapshot.file_size_mb || 0).toFixed(2)} MB</span>
                        {snapshot.table_counts && (
                          <span>
                            📊 {Object.keys(snapshot.table_counts).length} tables
                          </span>
                        )}
                      </div>
                      {snapshot.resolved_storage_path && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <HardDrive className="h-3 w-3" />
                          <code className="text-xs bg-muted px-1 rounded">{snapshot.resolved_storage_path}</code>
                        </div>
                      )}
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
                        disabled={snapshot.files_exist === false}
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => onRollback(snapshot)}
                        disabled={snapshot.files_exist === false}
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
                ))
              ) : (
                <div className="text-center py-12 border rounded-lg bg-muted/20">
                  <Database className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-semibold mb-2">No Snapshots Created Yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create your first snapshot to enable version control and backup capabilities
                  </p>
                  <Button onClick={onCreateSnapshot}>
                    <Save className="h-4 w-4 mr-2" />
                    Create First Snapshot
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* External Backups Section */}
          {activeSection === 'external' && (
            <div className="space-y-4">
              {/* Folder Selection */}
              <div className="space-y-3">
                <Label>Backup Folder Location</Label>
                <div className="space-y-2">
                  <Input
                    value={selectedPath}
                    onChange={(e) => {
                      setSelectedPath(e.target.value);
                      if (e.target.value) {
                        onSelectDevice(e.target.value);
                      }
                    }}
                    placeholder={suggestedPaths[0] || "Enter full path"}
                    className="flex-1"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Suggested paths for {systemUsername}:
                  {suggestedPaths.map((path, idx) => (
                    <span key={idx}>
                      <br />• {path}
                    </span>
                  ))}
                </p>
              </div>

              {/* External Snapshots List */}
              {selectedPath && (
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">
                      Available Backups {externalSnapshots.length > 0 && `(${externalSnapshots.length})`}
                    </h3>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onSelectDevice(selectedPath);
                          toast.info('Refreshing...');
                        }}
                        disabled={loadingSnapshots}
                      >
                        <RefreshCw className={`h-4 w-4 ${loadingSnapshots ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                  </div>

                  {loadingSnapshots ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg">
                      <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-50 animate-pulse" />
                      <p>Scanning folder for backups...</p>
                    </div>
                  ) : externalSnapshots.length > 0 ? (
                    <div className="space-y-2 border rounded-lg p-4">
                      {externalSnapshots.map((snapshot, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{snapshot.snapshot_name || snapshot.id}</span>
                              <Badge variant="outline" className="text-xs">
                                {snapshot.size_mb?.toFixed(2)} MB
                              </Badge>
                            </div>
                            {snapshot.exported_at && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Exported: {formatDate(snapshot.exported_at)}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  toast.info('Preparing download...');
                                  const response = await versionControl.downloadExternalSnapshot({
                                    snapshot_path: snapshot.path,
                                    format: 'zip'
                                  });

                                  const blob = new Blob([response.data], { type: 'application/zip' });
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `${snapshot.snapshot_name || snapshot.id}.zip`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  window.URL.revokeObjectURL(url);
                                  toast.success('Download completed');
                                } catch (error: any) {
                                  toast.error('Download failed');
                                  console.error('Download error:', error);
                                }
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => onImport(snapshot)}
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Restore
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 border rounded-lg">
                      <FolderOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                      <p className="text-sm text-muted-foreground mb-2">
                        No backups found in this folder
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedPath.includes('Documents') || selectedPath.includes('Desktop')
                          ? '⚠️ macOS may block access to Documents/Desktop. Try using Downloads folder or grant Full Disk Access in System Settings > Privacy & Security'
                          : 'Try selecting a different folder or export snapshots here first'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!selectedPath && (
                <div className="text-center py-12 border rounded-lg bg-muted/20">
                  <FolderOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-semibold mb-2">Select a Backup Folder</h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                    Browse or enter a path to a folder where you've previously exported snapshots.
                    This can be a local folder, external USB drive, or network location.
                  </p>
                  <Button onClick={handleBrowse}>
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Browse for Folder
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
