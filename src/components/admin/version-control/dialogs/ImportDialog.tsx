import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { versionControl } from '@/lib/api';
import { toast } from 'sonner';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (path: string) => void;
  loading: boolean;
  snapshot?: any; // Pre-selected snapshot from external backups
  devicePath?: string; // Pre-selected device path
}

export const ImportDialog = ({
  open,
  onOpenChange,
  onImport,
  loading: parentLoading,
  snapshot: providedSnapshot,
  devicePath,
}: ImportDialogProps) => {
  const [importPath, setImportPath] = useState(devicePath || '');
  const [snapshots, setSnapshots] = useState<any[]>(providedSnapshot ? [providedSnapshot] : []);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(providedSnapshot || null);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const isDirectRestore = !!providedSnapshot; // True if snapshot was provided directly

  // Update state when props change
  useEffect(() => {
    if (providedSnapshot) {
      setSelectedSnapshot(providedSnapshot);
      setSnapshots([providedSnapshot]);
    }
    if (devicePath) {
      setImportPath(devicePath);
    }
  }, [providedSnapshot, devicePath]);

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
          setImportPath(dirPath);
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
  };

  const loadSnapshots = async () => {
    if (!importPath) return;

    setLoadingSnapshots(true);
    try {
      const response = await versionControl.listExternalSnapshots({ device_path: importPath });
      setSnapshots(response.data.snapshots || []);
      if (response.data.snapshots?.length > 0) {
        setSelectedSnapshot(response.data.snapshots[0]);
      }
    } catch (error: any) {
      toast.error('Failed to load snapshots from this folder');
      setSnapshots([]);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  useEffect(() => {
    if (importPath) {
      loadSnapshots();
    } else {
      setSnapshots([]);
      setSelectedSnapshot(null);
    }
  }, [importPath]);

  const handleImport = () => {
    if (!selectedSnapshot?.path) {
      console.error('No snapshot path available', selectedSnapshot);
      toast.error('Snapshot path not found');
      return;
    }
    onImport(selectedSnapshot.path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isDirectRestore ? 'Restore from Backup' : 'Import Snapshot'}</DialogTitle>
          <DialogDescription>
            {isDirectRestore
              ? 'Confirm restoring database from this backup snapshot'
              : 'Select a folder containing backup snapshots'
            }
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isDirectRestore ? (
            /* Direct restore mode - just show snapshot info and confirm */
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">Snapshot Details</h3>
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Name:</span> <span className="font-medium">{selectedSnapshot?.snapshot_name || selectedSnapshot?.id}</span></p>
                  <p><span className="text-muted-foreground">Size:</span> {selectedSnapshot?.size_mb?.toFixed(2)} MB</p>
                  {selectedSnapshot?.exported_at && (
                    <p><span className="text-muted-foreground">Exported:</span> {new Date(selectedSnapshot.exported_at).toLocaleString()}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">📁 {devicePath}/TarkoInventoryBackups/{selectedSnapshot?.id}</p>
                </div>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  ⚠️ <strong>Warning:</strong> This will replace your current database with this backup.
                </p>
              </div>
            </div>
          ) : (
            /* Manual import mode - show path selection */
            <>
          <div className="space-y-2">
            <Label>Import Source Folder</Label>
            <div className="space-y-2">
              <Input
                value={importPath}
                onChange={(e) => setImportPath(e.target.value)}
                placeholder="Enter full path: /Users/yourname/Documents/backups"
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBrowse}
                  className="flex-1"
                >
                  Browse (if supported)
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setImportPath('/Users/' + (localStorage.getItem('username') || 'user') + '/Documents/tarko-backups')}
                  className="flex-1"
                >
                  Use Documents Folder
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              💡 Tip: Enter the full path manually where snapshots are stored.
              Browse button may not work on all systems.
            </p>
          </div>

          {importPath && (
            <div className="space-y-2">
              <Label>Available Snapshots</Label>
              {loadingSnapshots ? (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Scanning folder...
                </div>
              ) : snapshots.length > 0 ? (
                <Select
                  value={selectedSnapshot?.id || ''}
                  onValueChange={(value) => {
                    const snapshot = snapshots.find(s => s.id === value);
                    setSelectedSnapshot(snapshot);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose snapshot to import" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshots.map((snapshot, idx) => (
                      <SelectItem key={idx} value={snapshot.id}>
                        {snapshot.id} ({snapshot.size_mb?.toFixed(2)} MB)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    No snapshots found in this folder
                  </p>
                </div>
              )}
            </div>
          )}
            </>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              className="flex-1"
              disabled={parentLoading || !selectedSnapshot || loadingSnapshots}
            >
              {parentLoading ? (isDirectRestore ? 'Restoring...' : 'Importing...') : (isDirectRestore ? 'Confirm Restore' : 'Import')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
