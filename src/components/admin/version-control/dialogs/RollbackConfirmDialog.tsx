import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

interface RollbackConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: any;
  onConfirm: () => void;
  loading: boolean;
}

export const RollbackConfirmDialog = ({
  open,
  onOpenChange,
  snapshot,
  onConfirm,
  loading,
}: RollbackConfirmDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Rollback</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to rollback to snapshot "{snapshot?.snapshot_name}"?
            This will restore the database to its state at {snapshot?.created_at && formatDate(snapshot.created_at)}.
            Current data will be backed up automatically before rollback.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? 'Rolling back...' : 'Confirm Rollback'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
