import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Box, Scissors } from 'lucide-react';
import { CutRollDialog } from './CutRollDialog';

interface StockEntry {
  stock_id: string;
  stock_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE';
  quantity: number;
  status: string;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  total_available: number;
  product_type_name: string;
}

interface StockEntryListProps {
  batchId: string;
  stockEntries: StockEntry[];
  parameters: Record<string, unknown>;
  onUpdate: () => void;
}

export const StockEntryList = ({ stockEntries, onUpdate }: StockEntryListProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockEntry | null>(null);

  // Group by stock type
  const fullRolls = stockEntries.filter(e => e.stock_type === 'FULL_ROLL');
  const cutRolls = stockEntries.filter(e => e.stock_type === 'CUT_ROLL');
  const bundles = stockEntries.filter(e => e.stock_type === 'BUNDLE');
  const spares = stockEntries.filter(e => e.stock_type === 'SPARE');

  const handleCutRoll = (entry: StockEntry) => {
    setSelectedStock(entry);
    setDialogOpen(true);
  };

  const handleCutSuccess = () => {
    onUpdate();
    setSelectedStock(null);
  };

  return (
    <div className="space-y-3">
      {/* Full Rolls */}
      {fullRolls.map(entry => (
        <div key={entry.stock_id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-3">
            <Box className="h-5 w-5 text-green-600" />
            <div>
              <div className="font-medium">{entry.quantity} Full Rolls</div>
              <div className="text-sm text-muted-foreground">
                {entry.length_per_unit}m each • {entry.total_available}m total
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleCutRoll(entry)}
            className="gap-1"
          >
            <Scissors className="h-4 w-4" />
            Cut Roll
          </Button>
        </div>
      ))}

      {/* Cut Rolls */}
      {cutRolls.map(entry => (
        <div key={entry.stock_id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
          <div className="flex items-center gap-3">
            <Scissors className="h-5 w-5 text-orange-600" />
            <div>
              <div className="font-medium">{entry.quantity} Cut Pieces</div>
              <div className="text-sm text-muted-foreground">
                {entry.total_available}m total
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleCutRoll(entry)}
            className="gap-1"
          >
            <Scissors className="h-4 w-4" />
            Cut Further
          </Button>
        </div>
      ))}

      {/* Bundles */}
      {bundles.map(entry => (
        <div key={entry.stock_id} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
          <div className="flex items-center gap-3">
            <Box className="h-5 w-5 text-purple-600" />
            <div>
              <div className="font-medium">{entry.quantity} Bundles</div>
              <div className="text-sm text-muted-foreground">
                {entry.pieces_per_bundle} pieces each • {entry.piece_length_meters}m per piece
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Spares */}
      {spares.map(entry => (
        <div key={entry.stock_id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-center gap-3">
            <Box className="h-5 w-5 text-amber-600" />
            <div>
              <div className="font-medium">{entry.total_available} Spare Pieces</div>
              <div className="text-sm text-muted-foreground">
                {entry.piece_length_meters}m per piece
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Cut Roll Dialog */}
      {selectedStock && (selectedStock.stock_type === 'FULL_ROLL' || selectedStock.stock_type === 'CUT_ROLL') && (
        <CutRollDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          stockId={selectedStock.stock_id}
          stockType={selectedStock.stock_type}
          quantity={selectedStock.quantity}
          lengthPerUnit={selectedStock.length_per_unit}
          totalAvailable={selectedStock.total_available}
          onSuccess={handleCutSuccess}
        />
      )}
    </div>
  );
};
