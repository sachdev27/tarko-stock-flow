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
  const [splitPieces, setSplitPieces] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const splitCount = parseInt(splitPieces) || 0;
  const remainder = piecesPerBundle - splitCount;

  const handleSubmit = async () => {
    // Validate
    if (!splitCount || splitCount <= 0) {
      toast.error('Please enter a valid piece count');
      return;
    }

    if (splitCount > piecesPerBundle) {
      toast.error(`Split count (${splitCount}) exceeds bundle size (${piecesPerBundle})`);
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API_URL}/inventory/split-bundle`, {
        stock_id: stockId,
        pieces_to_split: [splitCount],
      }, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      toast.success(`Successfully split ${splitCount} pieces from bundle`);
      onSuccess();
      onOpenChange(false);

      // Reset form
      setSplitPieces('');
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Split Bundle
          </DialogTitle>
          <DialogDescription>
            Split bundle into spare pieces ({pieceLength}m each)
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

          {/* Split Count */}
          <div className="space-y-2">
            <Label>Number of Pieces to Split</Label>
            <Input
              type="number"
              step="1"
              min="1"
              max={piecesPerBundle}
              placeholder="Enter piece count"
              value={splitPieces}
              onChange={(e) => setSplitPieces(e.target.value)}
            />
          </div>

          {/* Summary */}
          <div className="space-y-2 p-3 bg-muted rounded-lg">
            <div className="flex justify-between text-sm">
              <span>Split Group:</span>
              <span className="font-medium">{splitCount} pieces</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Remainder:</span>
              <span className={`font-medium ${remainder < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {remainder} pieces
              </span>
            </div>
          </div>

          {remainder < 0 && (
            <p className="text-sm text-red-600">
              Split count exceeds bundle size!
            </p>
          )}
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
            disabled={loading || remainder < 0 || splitCount === 0}
          >
            {loading ? 'Splitting...' : 'Split Bundle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
