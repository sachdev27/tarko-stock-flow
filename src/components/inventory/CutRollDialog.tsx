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
import { Scissors, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

interface CutRollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockId: string;
  stockType: 'FULL_ROLL' | 'CUT_ROLL';
  quantity: number;
  lengthPerUnit?: number;
  totalAvailable: number;
  onSuccess: () => void;
}

interface CutPiece {
  id: string;
  length: string;
}

export const CutRollDialog = ({
  open,
  onOpenChange,
  stockId,
  stockType,
  quantity,
  lengthPerUnit,
  totalAvailable,
  onSuccess,
}: CutRollDialogProps) => {
  const [cutPieces, setCutPieces] = useState<CutPiece[]>([
    { id: '1', length: '' },
  ]);
  const [loading, setLoading] = useState(false);

  // For FULL_ROLL, we cut from a single roll's length, not total
  const availableLength = stockType === 'FULL_ROLL' ? (lengthPerUnit || 0) : totalAvailable;

  const addCutPiece = () => {
    setCutPieces([...cutPieces, { id: Date.now().toString(), length: '' }]);
  };

  const removeCutPiece = (id: string) => {
    if (cutPieces.length > 1) {
      setCutPieces(cutPieces.filter(p => p.id !== id));
    }
  };

  const updateCutPieceLength = (id: string, length: string) => {
    setCutPieces(cutPieces.map(p => p.id === id ? { ...p, length } : p));
  };

  const totalCutLength = cutPieces.reduce((sum, p) => {
    const length = parseFloat(p.length) || 0;
    return sum + length;
  }, 0);

  const remainingLength = availableLength - totalCutLength;

  const handleSubmit = async () => {
    // Validate
    const lengths = cutPieces.map(p => parseFloat(p.length)).filter(l => l > 0);
    
    if (lengths.length === 0) {
      toast.error('Please enter at least one cut length');
      return;
    }

    if (totalCutLength > availableLength) {
      toast.error(`Total cut length (${totalCutLength}m) exceeds available length (${availableLength}m)`);
      return;
    }    if (totalCutLength === 0) {
      toast.error('Cut lengths must be greater than 0');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/inventory/cut-roll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          stock_id: stockId,
          cut_lengths: lengths,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cut roll');
      }

      toast.success(`Successfully cut ${lengths.length} pieces from roll`);
      onSuccess();
      onOpenChange(false);

      // Reset form
      setCutPieces([{ id: '1', length: '' }]);
    } catch (error) {
      const err = error as Error;
      toast.error('Failed to cut roll', {
        description: err.message,
      });
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
              : `Cut the existing cut pieces further (${totalAvailable}m total available)`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Available Length */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">
              {stockType === 'FULL_ROLL' ? 'Roll Length:' : 'Available Length:'}
            </span>
            <Badge variant="outline" className="text-base">
              {availableLength}m
            </Badge>
          </div>

          {/* Cut Pieces */}
          <div className="space-y-2">
            <Label>Cut Lengths (meters)</Label>
            {cutPieces.map((piece, index) => (
              <div key={piece.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={availableLength}
                    placeholder="Enter length in meters"
                    value={piece.length}
                    onChange={(e) => updateCutPieceLength(piece.id, e.target.value)}
                  />
                </div>
                {cutPieces.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCutPiece(piece.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Add More Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCutPiece}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Another Cut Piece
          </Button>

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
