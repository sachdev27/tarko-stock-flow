import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { versionControl } from '@/lib/api';

interface CreateSnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshotForm: {
    snapshot_name: string;
    description: string;
    tags: string[];
  };
  onFormChange: (form: any) => void;
  onSubmit: () => void;
  loading: boolean;
  cloudEnabled: boolean;
}

export const CreateSnapshotDialog = ({
  open,
  onOpenChange,
  snapshotForm,
  onFormChange,
  onSubmit,
  loading,
  cloudEnabled,
}: CreateSnapshotDialogProps) => {
  const [customPath, setCustomPath] = useState('');
  const [suggestedPaths, setSuggestedPaths] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      fetchSuggestedPaths();
    }
  }, [open]);

  const fetchSuggestedPaths = async () => {
    try {
      const response = await versionControl.getSuggestedPaths();
      setSuggestedPaths(response.data.suggestions || []);

      // Set first suggestion as default
      if (response.data.suggestions && response.data.suggestions.length > 0) {
        const defaultPath = response.data.suggestions[0];
        setCustomPath(defaultPath);
        onFormChange({ ...snapshotForm, storage_path: defaultPath });
      }
    } catch (error) {
      console.error('Failed to fetch suggested paths:', error);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Database Snapshot</DialogTitle>
          <DialogDescription>
            Save the current database state to your local file system
            {cloudEnabled && ' (will auto-sync to cloud)'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="snapshot_name">Snapshot Name *</Label>
            <Input
              id="snapshot_name"
              value={snapshotForm.snapshot_name}
              onChange={(e) => onFormChange({ ...snapshotForm, snapshot_name: e.target.value })}
              placeholder="e.g., before-major-update"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="snapshot_desc">Description</Label>
            <Textarea
              id="snapshot_desc"
              value={snapshotForm.description}
              onChange={(e) => onFormChange({ ...snapshotForm, description: e.target.value })}
              placeholder="Optional description of what's being saved"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Server Storage Path</Label>
            <Input
              value={customPath}
              onChange={(e) => {
                setCustomPath(e.target.value);
                onFormChange({ ...snapshotForm, storage_path: e.target.value });
              }}
              placeholder={suggestedPaths[0] || "Server path"}
              className="flex-1"
            />
            <p className="text-xs text-muted-foreground">
              Suggested: {suggestedPaths[0] || 'Loading...'}
            </p>
          </div>

          <Button
            onClick={onSubmit}
            disabled={loading || !customPath}
            className="w-full"
          >
            {loading ? 'Creating Snapshot...' : 'Create Snapshot'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
