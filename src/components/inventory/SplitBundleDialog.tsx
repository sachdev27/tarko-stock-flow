import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Package } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';

interface SplitBundleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockId: string;
  piecesPerBundle: number;
  pieceLength: number;
  onSuccess: () => void;
}

export const SplitBundleDialog = ({
  open,
  onOpenChange,
  stockId,
  piecesPerBundle,
  pieceLength,
  onSuccess,
}: SplitBundleDialogProps) => {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);

    try {
      await axios.post(`${API_URL}/inventory/split-bundle`, {
        stock_id: stockId,
        pieces_to_split: [piecesPerBundle], // Split entire bundle
      }, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      toast.success(`Successfully split entire bundle (${piecesPerBundle} pieces)`);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        toast.error('Failed to split bundle', {
          description: error.response?.data?.error || error.message,
        });
      } else {
        toast.error('Failed to split bundle', {
          description: (error as Error).message,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[500px]"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Split Bundle
          </DialogTitle>
          <DialogDescription>
            Convert this bundle into individual spare pieces
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Bundle Info */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Bundle Size:</span>
            <Badge variant="outline" className="text-base">
              {piecesPerBundle} pieces
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Piece Length:</span>
            <Badge variant="outline" className="text-base">
              {pieceLength}m each
            </Badge>
          </div>

          {/* Action Summary */}
          <div className="space-y-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-900">
              This will convert the entire bundle into {piecesPerBundle} individual spare pieces
            </p>
            <p className="text-xs text-blue-700">
              The spare pieces will be available for individual dispatch or combining
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? 'Splitting...' : 'Split Entire Bundle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
