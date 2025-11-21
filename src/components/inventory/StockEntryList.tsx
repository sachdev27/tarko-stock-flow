import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Box, Scissors, Package, Package2 } from 'lucide-react';
import { CutRollDialog } from './CutRollDialog';
import { SplitBundleDialog } from './SplitBundleDialog';
import { CombineSparesDialog } from './CombineSparesDialog';

interface StockEntry {
  stock_id: string;
  piece_id?: string;
  spare_id?: string;
  stock_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE';
  quantity: number;
  status: string;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  piece_count?: number;
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
  const [cutDialogOpen, setCutDialogOpen] = useState(false);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [combineDialogOpen, setCombineDialogOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockEntry | null>(null);

  // Group by stock type
  const fullRolls = stockEntries.filter(e => e.stock_type === 'FULL_ROLL');
  const cutRolls = stockEntries.filter(e => e.stock_type === 'CUT_ROLL');
  const bundles = stockEntries.filter(e => e.stock_type === 'BUNDLE');
  const spares = stockEntries.filter(e => e.stock_type === 'SPARE');

  // Group bundles by size
  const bundlesBySize = bundles.reduce((acc, entry) => {
    const size = entry.pieces_per_bundle || 0;
    if (!acc[size]) {
      acc[size] = [];
    }
    acc[size].push(entry);
    return acc;
  }, {} as Record<number, StockEntry[]>);

  const handleCutRoll = (entry: StockEntry) => {
    setSelectedStock(entry);
    setCutDialogOpen(true);
  };

  const handleSplitBundle = (entry: StockEntry) => {
    setSelectedStock(entry);
    setSplitDialogOpen(true);
  };

  const handleCombineSpares = () => {
    if (spares.length > 0) {
      setSelectedStock(spares[0]); // Use first spare for stock_id
      setCombineDialogOpen(true);
    }
  };

  const handleSuccess = () => {
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

      {/* Cut Rolls - Each piece shown separately */}
      {cutRolls.map(entry => (
        <div key={entry.piece_id || entry.stock_id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
          <div className="flex items-center gap-3">
            <Scissors className="h-5 w-5 text-orange-600" />
            <div>
              <div className="font-medium">Cut Piece</div>
              <div className="text-sm font-mono font-semibold">
                {entry.length_per_unit}m
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

      {/* Bundles - Grouped by size */}
      {Object.entries(bundlesBySize)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([size, bundleGroup]) => {
          const firstBundle = bundleGroup[0];
          const totalBundles = bundleGroup.reduce((sum, b) => sum + b.quantity, 0);

          return (
            <div key={`bundle-${size}`} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-purple-600" />
                <div>
                  <div className="font-medium">{totalBundles} Bundles</div>
                  <div className="text-sm text-muted-foreground">
                    {size} pieces each • {firstBundle.piece_length_meters}m per piece
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSplitBundle(firstBundle)}
                className="gap-1"
              >
                <Scissors className="h-4 w-4" />
                Split Bundle
              </Button>
            </div>
          );
        })}

      {/* Spare Pieces - Show as one aggregated entity */}
      {spares.length > 0 && (() => {
        const totalSpares = spares.reduce((sum, s) => sum + (s.piece_count || 0), 0);
        const pieceLength = spares[0]?.piece_length_meters || 0;

        return (
          <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-center gap-3">
              <Box className="h-5 w-5 text-amber-600" />
              <div>
                <div className="font-medium">{totalSpares} Spare Pieces</div>
                <div className="text-sm text-muted-foreground">
                  {pieceLength}m per piece
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCombineSpares}
              className="gap-1"
            >
              <Package2 className="h-4 w-4" />
              Bundle Spares
            </Button>
          </div>
        );
      })()}

      {/* Cut Roll Dialog */}
      {selectedStock && (selectedStock.stock_type === 'FULL_ROLL' || selectedStock.stock_type === 'CUT_ROLL') && (
        <CutRollDialog
          open={cutDialogOpen}
          onOpenChange={setCutDialogOpen}
          stockId={selectedStock.stock_id}
          pieceId={selectedStock.piece_id}
          stockType={selectedStock.stock_type}
          quantity={selectedStock.quantity}
          lengthPerUnit={selectedStock.length_per_unit}
          totalAvailable={selectedStock.total_available}
          onSuccess={handleSuccess}
        />
      )}

      {/* Split Bundle Dialog */}
      {selectedStock && selectedStock.stock_type === 'BUNDLE' && (
        <SplitBundleDialog
          open={splitDialogOpen}
          onOpenChange={setSplitDialogOpen}
          stockId={selectedStock.stock_id}
          piecesPerBundle={selectedStock.pieces_per_bundle || 0}
          pieceLength={selectedStock.piece_length_meters || 0}
          onSuccess={handleSuccess}
        />
      )}

      {/* Combine Spares Dialog */}
      {selectedStock && selectedStock.stock_type === 'SPARE' && (
        <CombineSparesDialog
          open={combineDialogOpen}
          onOpenChange={setCombineDialogOpen}
          stockId={selectedStock.stock_id}
          spareGroups={spares.map(s => ({
            spare_id: s.spare_id || s.stock_id,
            piece_count: s.piece_count || 0,
          }))}
          pieceLength={selectedStock.piece_length_meters || 0}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};
