import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useState, useEffect } from 'react';
import { versionControl } from '@/lib/api';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: any;
  onExport: (path: string) => void;
  loading: boolean;
  operationProgress?: {
    type: 'upload' | 'download' | 'restore' | 'export' | 'import' | 'create' | null;
    progress: number;
    message: string;
    snapshotId?: string;
  };
  onProgressUpdate?: (progress: any) => void;
}

export const ExportDialog = ({
  open,
  onOpenChange,
  snapshot,
  onExport,
  loading,
  operationProgress,
  onProgressUpdate,
}: ExportDialogProps) => {
  const [exportPath, setExportPath] = useState('');
  const [suggestedPaths, setSuggestedPaths] = useState<string[]>([]);
  const [downloadFormat, setDownloadFormat] = useState<string>('zip');
  const [os, setOs] = useState<string>('unknown');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchSuggestedPaths();
      detectOS();
    }
  }, [open]);

  const detectOS = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (userAgent.includes('mac')) {
      setOs('mac');
      setDownloadFormat('zip');
    } else if (userAgent.includes('win')) {
      setOs('windows');
      setDownloadFormat('zip');
    } else if (userAgent.includes('linux')) {
      setOs('linux');
      setDownloadFormat('tar.gz');
    } else {
      setOs('unknown');
      setDownloadFormat('zip');
    }
  };

  const fetchSuggestedPaths = async () => {
    try {
      const response = await versionControl.getSuggestedPaths();
      setSuggestedPaths(response.data.suggestions || []);

      // Set first suggestion as default
      if (response.data.suggestions && response.data.suggestions.length > 0) {
        setExportPath(response.data.suggestions[0]);
      }
    } catch (error) {
      console.error('Failed to fetch suggested paths:', error);
    }
  };

  const handleExport = () => {
    if (!exportPath) return;
    onExport(exportPath);
  };

  const handleDownload = async () => {
    if (!snapshot?.id) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    onProgressUpdate?.({ type: 'export', progress: 5, message: 'Preparing download...', snapshotId: snapshot.id });

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';
      const url = `${API_URL}/version-control/snapshots/${snapshot.id}/download?format=${downloadFormat}`;

      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();

      xhr.open('GET', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
      xhr.responseType = 'blob';

      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setDownloadProgress(percentComplete);
          onProgressUpdate?.({
            type: 'export',
            progress: percentComplete,
            message: `Downloading... ${percentComplete}%`,
            snapshotId: snapshot.id
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const blob = xhr.response;

          // Check if blob is suspiciously small (might be an error)
          if (blob.size < 1000) {
            console.error('Downloaded file is suspiciously small:', blob.size, 'bytes');
            throw new Error('Downloaded file appears to be invalid (too small)');
          }

          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          const extension = downloadFormat === 'tar.gz' ? '.tar.gz' : '.zip';
          a.download = `${snapshot.snapshot_name || snapshot.id}${extension}`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(blobUrl);
          document.body.removeChild(a);

          onProgressUpdate?.({ type: 'export', progress: 100, message: 'Download complete!', snapshotId: snapshot.id });
          toast.success('Snapshot downloaded to your Downloads folder');

          setTimeout(() => {
            setIsDownloading(false);
            setDownloadProgress(0);
            onProgressUpdate?.({ type: null, progress: 0, message: '' });
            onOpenChange(false);
          }, 1000);
        } else {
          throw new Error(`Download failed with status ${xhr.status}`);
        }
      };

      xhr.onerror = () => {
        throw new Error('Network error during download');
      };

      xhr.send();
    } catch (error: any) {
      toast.error(error.message || 'Failed to download snapshot');
      console.error('Download error:', error);
      setIsDownloading(false);
      setDownloadProgress(0);
      onProgressUpdate?.({ type: null, progress: 0, message: '' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Snapshot</DialogTitle>
          <DialogDescription>
            Download or export snapshot to a specific location
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">{snapshot?.snapshot_name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Size: {parseFloat(snapshot?.file_size_mb || 0).toFixed(2)} MB
            </p>
          </div>

          {/* Download Progress */}
          {isDownloading && (
            <div className="p-4 border rounded-lg bg-primary/5 space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="font-medium text-sm">Downloading... {downloadProgress}%</span>
              </div>
              <Progress value={downloadProgress} className="h-2" />
            </div>
          )}

          {/* Quick Download Option */}
          <div className="border rounded-lg p-4 bg-primary/5">
            <h3 className="font-semibold text-sm mb-2">Quick Download</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Download snapshot to your Downloads folder
            </p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Format</Label>
                <Select value={downloadFormat} onValueChange={setDownloadFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zip">.zip (Universal - Recommended for macOS/Windows)</SelectItem>
                    <SelectItem value="tar.gz">.tar.gz (Linux/Unix)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleDownload}
                className="w-full"
                variant="default"
                disabled={!snapshot?.id || snapshot.id === 'new'}
              >
                <Download className="h-4 w-4 mr-2" />
                {!snapshot?.id || snapshot.id === 'new'
                  ? 'Select a snapshot first'
                  : `Download as ${downloadFormat === 'tar.gz' ? '.tar.gz' : '.zip'}`}
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or export to server location
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Server Export Path</Label>
            <Input
              value={exportPath}
              onChange={(e) => setExportPath(e.target.value)}
              placeholder={suggestedPaths[0] || "Enter server path"}
              className="flex-1"
            />
            <p className="text-xs text-muted-foreground">
              💡 Suggested: {suggestedPaths[0] || 'Loading...'}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              variant="secondary"
              className="flex-1"
              disabled={loading || !exportPath}
            >
              {loading ? 'Exporting...' : 'Export to Server'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
