import { useState, useEffect } from 'react';
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
import { Package2 } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';

interface SpareGroup {
  spare_id: string;
  piece_count: number;
}

interface CombineSparesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockId: string;
  spareGroups: SpareGroup[];
  pieceLength: number;
  onSuccess: () => void;
}

export const CombineSparesDialog = ({
  open,
  onOpenChange,
  stockId,
  spareGroups,
  pieceLength,
  onSuccess,
}: CombineSparesDialogProps) => {
  const [bundleSize, setBundleSize] = useState<string>('');
  const [numberOfBundles, setNumberOfBundles] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setBundleSize('');
      setNumberOfBundles('');
    }
  }, [open]);

  const totalAvailablePieces = spareGroups.reduce((sum, g) => sum + g.piece_count, 0);
  const targetBundleSize = parseInt(bundleSize) || 0;
  const targetNumberOfBundles = parseInt(numberOfBundles) || 0;
  const totalPiecesNeeded = targetBundleSize * targetNumberOfBundles;
  const remainder = totalAvailablePieces - totalPiecesNeeded;

  const handleSubmit = async () => {
    // Validate
    if (!targetBundleSize || targetBundleSize <= 0) {
      toast.error('Please enter a valid bundle size');
      return;
    }

    if (!targetNumberOfBundles || targetNumberOfBundles <= 0) {
      toast.error('Please enter a valid number of bundles');
      return;
    }

    if (totalPiecesNeeded > totalAvailablePieces) {
      toast.error(`Not enough pieces. Need ${totalPiecesNeeded}, have ${totalAvailablePieces}`);
      return;
    }

    setLoading(true);

    try {
      // Select spare groups to fulfill the requirement
      let piecesRemaining = totalPiecesNeeded;
      const selectedSpareIds: string[] = [];

      for (const group of spareGroups) {
        if (piecesRemaining <= 0) break;
        selectedSpareIds.push(group.spare_id);
        piecesRemaining -= group.piece_count;
      }

      console.log('=== Combine Spares Request ===');
      console.log('API_URL:', API_URL);
      console.log('Full URL:', `${API_URL}/inventory/combine-spares`);
      console.log('Request data:', {
        stock_id: stockId,
        spare_piece_ids: selectedSpareIds,
        bundle_size: targetBundleSize,
        number_of_bundles: targetNumberOfBundles,
      });

      await axios.post(`${API_URL}/inventory/combine-spares`, {
        stock_id: stockId,
        spare_piece_ids: selectedSpareIds,
        bundle_size: targetBundleSize,
        number_of_bundles: targetNumberOfBundles,
      }, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      toast.success(`Successfully created ${targetNumberOfBundles} bundle(s) of ${targetBundleSize} pieces`);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        toast.error('Failed to combine spares', {
          description: error.response?.data?.error || error.message,
        });
      } else {
        toast.error('Failed to combine spares', {
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
        className="sm:max-w-[600px]"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package2 className="h-5 w-5" />
            Combine Spare Pieces
          </DialogTitle>
          <DialogDescription>
            Select spare groups to combine into a bundle ({pieceLength}m each)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Available Spares */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">Available Spare Pieces:</span>
            <span className="text-base font-bold">{totalAvailablePieces} pieces</span>
          </div>

          {/* Bundle Size */}
          <div className="space-y-2">
            <Label>Bundle Size (pieces per bundle)</Label>
            <Input
              type="number"
              step="1"
              min="1"
              max={totalAvailablePieces}
              placeholder="e.g., 10"
              value={bundleSize}
              onChange={(e) => {
                const value = e.target.value;
                // Prevent negative, decimal, and non-integer input
                if (value.includes('-') || value.includes('.') || value.includes('e')) {
                  return;
                }
                setBundleSize(value);
              }}
              onKeyDown={(e) => {
                // Prevent minus, decimal point, and 'e' keys
                if (e.key === '-' || e.key === '.' || e.key === 'e' || e.key === 'E') {
                  e.preventDefault();
                }
              }}
              onBlur={(e) => {
                const value = parseInt(e.target.value);
                if (!value || value <= 0) {
                  setBundleSize('');
                }
              }}
            />
          </div>

          {/* Number of Bundles */}
          <div className="space-y-2">
            <Label>Number of Bundles</Label>
            <Input
              type="number"
              step="1"
              min="1"
              placeholder="e.g., 2"
              value={numberOfBundles}
              onChange={(e) => {
                const value = e.target.value;
                // Prevent negative, decimal, and non-integer input
                if (value.includes('-') || value.includes('.') || value.includes('e')) {
                  return;
                }
                setNumberOfBundles(value);
              }}
              onKeyDown={(e) => {
                // Prevent minus, decimal point, and 'e' keys
                if (e.key === '-' || e.key === '.' || e.key === 'e' || e.key === 'E') {
                  e.preventDefault();
                }
              }}
              onBlur={(e) => {
                const value = parseInt(e.target.value);
                if (!value || value <= 0) {
                  setNumberOfBundles('');
                }
              }}
            />
          </div>

          {/* Summary */}
          <div className="space-y-2 p-3 bg-muted rounded-lg">
            <div className="flex justify-between text-sm">
              <span>Bundle Size:</span>
              <span className="font-medium">{targetBundleSize} pieces/bundle</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Number of Bundles:</span>
              <span className="font-medium">{targetNumberOfBundles} bundles</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total Pieces Needed:</span>
              <span className="font-medium">{totalPiecesNeeded} pieces</span>
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
              Not enough spare pieces available!
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
            disabled={loading || remainder < 0 || targetBundleSize === 0 || targetNumberOfBundles === 0}
          >
            {loading ? 'Creating...' : 'Create Bundles'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
