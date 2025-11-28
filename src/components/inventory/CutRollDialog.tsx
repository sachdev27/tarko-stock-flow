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
import { Scissors } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';

interface CutRollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockId: string;
  pieceId?: string;
  stockType: 'FULL_ROLL' | 'CUT_ROLL';
  quantity: number;
  lengthPerUnit?: number;
  totalAvailable: number;
  onSuccess: () => void;
}

export const CutRollDialog = ({
  open,
  onOpenChange,
  stockId,
  pieceId,
  stockType,
  quantity,
  lengthPerUnit,
  totalAvailable,
  onSuccess,
}: CutRollDialogProps) => {
  const [cutLength, setCutLength] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // For FULL_ROLL, we cut from a single roll's length
  // For CUT_ROLL, when cutting a specific piece, use lengthPerUnit (individual piece length)
  // not totalAvailable (sum of all grouped pieces)
  const availableLength = lengthPerUnit || 0;

  const totalCutLength = parseFloat(cutLength) || 0;

  const remainingLength = availableLength - totalCutLength;

  const handleSubmit = async () => {
    // Validate
    const length = parseFloat(cutLength);

    if (!length || length <= 0) {
      toast.error('Please enter a valid cut length');
      return;
    }

    if (length > availableLength) {
      toast.error(`Cut length (${length}m) exceeds available length (${availableLength}m)`);
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/inventory/cut-roll`, {
        stock_id: stockId,
        piece_id: pieceId,
        cut_lengths: [length],
      }, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      toast.success(`Successfully cut ${length}m piece from roll`);
      onSuccess();
      onOpenChange(false);

      // Reset form
      setCutLength('');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        toast.error('Failed to cut roll', {
          description: error.response?.data?.error || error.message,
        });
      } else {
        toast.error('Failed to cut roll', {
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
            <Scissors className="h-5 w-5" />
            Cut {stockType === 'FULL_ROLL' ? 'Full Roll' : 'Cut Roll'}
          </DialogTitle>
          <DialogDescription>
            {stockType === 'FULL_ROLL'
              ? `Cutting 1 roll from ${quantity} available (${lengthPerUnit}m per roll)`
              : `Cut 1 piece from ${quantity} available (${lengthPerUnit}m per piece)`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Available Length */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">
              {stockType === 'FULL_ROLL' ? 'Roll Length:' : 'Piece Length:'}
            </span>
            <Badge variant="outline" className="text-base">
              {availableLength}m
            </Badge>
          </div>

          {/* Cut Length */}
          <div className="space-y-2">
            <Label>Cut Length (meters)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max={availableLength}
              placeholder="Enter length in meters"
              value={cutLength}
              onChange={(e) => setCutLength(e.target.value)}
            />
          </div>

          {/* Summary */}
          <div className="space-y-2 p-3 bg-muted rounded-lg">
            <div className="flex justify-between text-sm">
              <span>Total Cut Length:</span>
              <span className="font-medium">{totalCutLength.toFixed(2)}m</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Remaining Length:</span>
              <span className={`font-medium ${remainingLength < 0 ? 'text-red-600' : 'text-green-600'}`}>
                {remainingLength.toFixed(2)}m
              </span>
            </div>
          </div>

          {remainingLength < 0 && (
            <p className="text-sm text-red-600">
              Total cut length exceeds available length!
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
            disabled={loading || remainingLength < 0 || totalCutLength === 0}
          >
            {loading ? 'Cutting...' : 'Cut Roll'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
