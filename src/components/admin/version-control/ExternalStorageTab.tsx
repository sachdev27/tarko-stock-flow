import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FolderOpen, Download, Upload } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useState } from 'react';

interface ExternalStorageTabProps {
  externalSnapshots: any[];
  loadingSnapshots?: boolean;
  onSelectDevice: (path: string) => void;
  onImport: (snapshot?: any) => void;
  onExport: (path: string) => void;
}

export const ExternalStorageTab = ({
  externalSnapshots,
  loadingSnapshots = false,
  onSelectDevice,
  onImport,
  onExport,
}: ExternalStorageTabProps) => {
  const [selectedPath, setSelectedPath] = useState('');

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Backup Storage Locations
        </CardTitle>
        <CardDescription>
          Select a folder containing snapshot backups to view and import
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Folder Selection */}
          <div className="space-y-3">
            <Label>Snapshot Folder Location</Label>
            <div className="space-y-2">
              <Input
                value={selectedPath}
                onChange={(e) => {
                  setSelectedPath(e.target.value);
                  if (e.target.value) {
                    onSelectDevice(e.target.value);
                  }
                }}
                placeholder="Enter full path: /Users/yourname/Documents/tarko-backups"
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleBrowse}
                  className="flex-1"
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Browse (if supported)
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const defaultPath = '/Users/' + (localStorage.getItem('username') || 'user') + '/Documents/tarko-backups';
                    setSelectedPath(defaultPath);
                    onSelectDevice(defaultPath);
                  }}
                  className="flex-1"
                >
                  Use Documents Folder
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              💡 Enter the full path manually, or click "Use Documents Folder". Common locations:
              • macOS: /Users/yourname/Documents/tarko-backups
              • Windows: C:\Users\yourname\Documents\tarko-backups
              • Linux: /home/yourname/Documents/tarko-backups
            </p>
          </div>

          {/* Snapshots List */}
          {selectedPath && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">
                  Available Snapshots {externalSnapshots.length > 0 && `(${externalSnapshots.length})`}
                </h3>
                {externalSnapshots.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onExport(selectedPath)}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Export Here
                  </Button>
                )}
              </div>

              {loadingSnapshots ? (
                <div className="text-center py-8 text-muted-foreground border rounded-lg">
                  <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-50 animate-pulse" />
                  <p>Scanning folder for snapshots...</p>
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
                          <span className="font-medium">{snapshot.id}</span>
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
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => onImport(snapshot)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Import
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border rounded-lg">
                  <FolderOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-sm text-muted-foreground mb-2">
                    No snapshots found in this folder
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Try selecting a different folder or export snapshots here first
                  </p>
                </div>
              )}
            </div>
          )}

          {!selectedPath && (
            <div className="text-center py-12 border rounded-lg bg-muted/20">
              <FolderOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-semibold mb-2">Select a Snapshot Folder</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                Click Browse or enter a path to a folder where you've previously exported snapshots.
                This can be a local folder, external USB drive, or network location.
              </p>
              <Button onClick={handleBrowse}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Browse for Folder
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
