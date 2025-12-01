import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface RevertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  selectedCount: number;
  isReverting?: boolean;
}

export function RevertDialog({
  open,
  onOpenChange,
  onConfirm,
  selectedCount,
  isReverting = false,
}: RevertDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle>Revert Transactions?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3 pt-4">
            <p>
              You are about to revert{' '}
              <span className="font-semibold text-foreground">
                {selectedCount} transaction{selectedCount !== 1 ? 's' : ''}
              </span>
              .
            </p>
            <div className="rounded-md bg-muted p-3 space-y-2 text-sm">
              <p className="font-medium text-foreground">This will:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Return all rolls to inventory</li>
                <li>Restore original weights and meters</li>
                <li>Remove customer associations</li>
                <li>Delete transaction records permanently</li>
              </ul>
            </div>
            <p className="text-destructive font-medium">
              This action cannot be undone.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isReverting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isReverting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isReverting ? 'Reverting...' : 'Revert Transactions'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
