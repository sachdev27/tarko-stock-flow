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

  // Group full rolls by length (normalize to handle 500 vs 500.0)
  const fullRollsByLength = fullRolls.reduce((acc, entry) => {
    const length = Number(entry.length_per_unit || 0);
    if (!acc[length]) {
      acc[length] = [];
    }
    acc[length].push(entry);
    return acc;
  }, {} as Record<number, StockEntry[]>);

  // Group bundles by size AND piece length (normalize length to number)
  const bundlesBySize = bundles.reduce((acc, entry) => {
    const size = entry.pieces_per_bundle || 0;
    const length = Number(entry.piece_length_meters || 0);
    const key = `${size}-${length}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(entry);
    return acc;
  }, {} as Record<string, StockEntry[]>);

  const handleCutRoll = (entry: StockEntry) => {
    setSelectedStock(entry);
    setCutDialogOpen(true);
  };

  const handleSplitBundle = (entry: StockEntry) => {
    setSelectedStock(entry);
    setSplitDialogOpen(true);
  };

  const handleCombineSpares = (spareGroup: StockEntry[]) => {
    if (spareGroup.length > 0) {
      // Store first spare for basic info, but keep all spares from this length group
      const stockWithAllSpares = {
        ...spareGroup[0],
        allSpares: spareGroup
      };
      setSelectedStock(stockWithAllSpares);
      setCombineDialogOpen(true);
    }
  };

  const handleSuccess = () => {
    onUpdate();
    setSelectedStock(null);
  };

  return (
    <div className="space-y-3">
      {/* Full Rolls - Grouped by length */}
      {Object.entries(fullRollsByLength)
        .sort(([a], [b]) => Number(b) - Number(a)) // Sort by length descending
        .map(([lengthKey, rollGroup]) => {
          const length = Number(lengthKey);
          const totalQuantity = rollGroup.reduce((sum, r) => sum + r.quantity, 0);
          const totalMeters = rollGroup.reduce((sum, r) => sum + (r.quantity * (r.length_per_unit || 0)), 0);
          const firstRoll = rollGroup[0];

          return (
            <div key={`roll-${length}`} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-3">
                <Box className="h-5 w-5 text-green-600" />
                <div>
                  <div className="font-medium">{totalQuantity} Full Rolls</div>
                  <div className="text-sm text-muted-foreground">
                    {length}m each • {totalMeters}m total
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCutRoll(firstRoll)}
                className="gap-1"
              >
                <Scissors className="h-4 w-4" />
                Cut Roll
              </Button>
            </div>
          );
        })
      }

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

      {/* Bundles - Grouped by size and piece length */}
      {Object.entries(bundlesBySize)
        .sort(([a], [b]) => {
          const [sizeA] = a.split('-').map(Number);
          const [sizeB] = b.split('-').map(Number);
          return sizeB - sizeA;
        })
        .map(([key, bundleGroup]) => {
          const [size, length] = key.split('-');
          const firstBundle = bundleGroup[0];
          const totalBundles = bundleGroup.reduce((sum, b) => sum + b.quantity, 0);

          return (
            <div key={`bundle-${key}`} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-purple-600" />
                <div>
                  <div className="font-medium">{totalBundles} Bundles</div>
                  <div className="text-sm text-muted-foreground">
                    {size} pieces each • {length}m per piece
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

      {/* Spare Pieces - Grouped by piece length */}
      {(() => {
        // Group spares by piece length (normalize to number)
        const sparesByLength = spares.reduce((acc, entry) => {
          const length = Number(entry.piece_length_meters || 0);
          if (!acc[length]) {
            acc[length] = [];
          }
          acc[length].push(entry);
          return acc;
        }, {} as Record<number, StockEntry[]>);

        return Object.entries(sparesByLength)
          .sort(([a], [b]) => Number(b) - Number(a))
          .map(([length, spareGroup]) => {
            const totalSpares = spareGroup.reduce((sum, s) => sum + (s.piece_count || 0), 0);

            return (
              <div key={`spare-${length}`} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center gap-3">
                  <Box className="h-5 w-5 text-amber-600" />
                  <div>
                    <div className="font-medium">{totalSpares} Spare Pieces</div>
                    <div className="text-sm text-muted-foreground">
                      {length}m per piece
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCombineSpares(spareGroup)}
                  className="gap-1"
                >
                  <Package2 className="h-4 w-4" />
                  Bundle Spares
                </Button>
              </div>
            );
          });
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
          spareGroups={
            (selectedStock as any).allSpares
              ? (selectedStock as any).allSpares.map((s: StockEntry) => ({
                  spare_id: s.spare_id || s.stock_id,
                  piece_count: s.piece_count || 0,
                }))
              : [{
                  spare_id: selectedStock.spare_id || selectedStock.stock_id,
                  piece_count: selectedStock.piece_count || 0,
                }]
          }
          pieceLength={selectedStock.piece_length_meters || 0}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
};
