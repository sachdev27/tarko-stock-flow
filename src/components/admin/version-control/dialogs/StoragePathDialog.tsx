import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface StoragePathDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storageStats: any;
}

export const StoragePathDialog = ({
  open,
  onOpenChange,
  storageStats,
}: StoragePathDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Local Storage Information</DialogTitle>
          <DialogDescription>
            Database snapshots stored on the server
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Snapshots</div>
              <div className="text-2xl font-bold">{storageStats?.snapshot_count || 0}</div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Total Size</div>
              <div className="text-2xl font-bold">{storageStats?.total_size_gb?.toFixed(2) || 0.00} GB</div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground border-t pt-4">
            <p className="mb-2">💡 <strong>Backup Strategy:</strong></p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>Local:</strong> Quick restore, no internet needed</li>
              <li><strong>Cloud:</strong> Disaster recovery, automatic sync</li>
              <li><strong>External:</strong> Physical backup for offline storage</li>
            </ul>
          </div>

          <Button onClick={() => onOpenChange(false)} className="w-full">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
