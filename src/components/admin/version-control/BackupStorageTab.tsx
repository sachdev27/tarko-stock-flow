import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Database, RotateCcw, Trash2, CloudUpload, Upload, Save, HardDrive, FolderOpen, RefreshCw, FileUp, Download } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { versionControl } from '@/lib/api';
import { toast } from 'sonner';

interface BackupStorageTabProps {
  snapshots: any[];
  cloudStatus: any;
  storageStats: any;
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

  useEffect(() => {
    fetchSuggestedPaths();
  }, []);

  const fetchSuggestedPaths = async () => {
    try {
      const response = await versionControl.getSuggestedPaths();
      setSuggestedPaths(response.data.suggestions || []);
      setSystemUsername(response.data.username || 'user');

      // Set first suggestion as default
      if (response.data.suggestions && response.data.suggestions.length > 0) {
        setSelectedPath(response.data.suggestions[0]);
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

      const response = await fetch('/api/version-control/snapshots/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
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
          <Button onClick={onCreateSnapshot} variant="default">
            <Save className="h-4 w-4 mr-2" />
            Create Snapshot
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
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
              {/* Upload Button */}
              <div className="flex justify-between items-center">
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
                >
                  <FileUp className="h-4 w-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload Snapshot'}
                </Button>
              </div>

              {snapshots.length > 0 ? (
                snapshots.map((snapshot) => (
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
                        <span>Created: {formatDate(snapshot.created_at)}</span>
                        <span>By: {snapshot.created_by_name || snapshot.created_by_username}</span>
                        <span>Size: {parseFloat(snapshot.file_size_mb || 0).toFixed(2)} MB</span>
                        {snapshot.table_counts && (
                          <span>
                            {Object.keys(snapshot.table_counts).length} tables
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
                      {externalSnapshots.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onExport({ id: 'new' })}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Export Here
                        </Button>
                      )}
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
                              onClick={() => {
                                const a = document.createElement('a');
                                a.href = `${selectedPath}/TarkoInventoryBackups/${snapshot.id}`;
                                a.download = snapshot.snapshot_name || snapshot.id;
                                a.click();
                                toast.success('Download started');
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
