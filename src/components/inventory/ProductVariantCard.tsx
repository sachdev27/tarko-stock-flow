import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Box, Scissors, Package, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StockEntryList } from './StockEntryList';

import { InventoryBatchUI, StockEntry } from '@/types/inventory-ui';

interface ProductVariantCardProps {
  productTypeName: string;
  brandName: string;
  parameters: Record<string, unknown>;
  batches: InventoryBatchUI[];
  productVariantId: string;
  onUpdate: () => void;
}

export const ProductVariantCard = ({
  productTypeName,
  brandName,
  parameters,
  batches,
  productVariantId,
  onUpdate
}: ProductVariantCardProps) => {
  const [expanded, setExpanded] = useState(false);

  // Aggregate all stock entries from all batches
  const allStockEntries: StockEntry[] = batches.flatMap(batch =>
    batch.stock_entries.map(entry => ({
      ...entry,
      batch_id: batch.id,
      batch_code: batch.batch_code
    }))
  );

  // Group stock entries by type
  const stockByType = {
    FULL_ROLL: allStockEntries.filter(e => e.stock_type === 'FULL_ROLL'),
    CUT_ROLL: allStockEntries.filter(e => e.stock_type === 'CUT_ROLL' || e.stock_type === 'CUT_PIECE'),
    BUNDLE: allStockEntries.filter(e => e.stock_type === 'BUNDLE'),
    SPARE: allStockEntries.filter(e => e.stock_type === 'SPARE' || e.stock_type === 'SPARE_PIECES')
  };

  // Calculate totals
  const totalFullRolls = stockByType.FULL_ROLL.reduce((sum, e) => sum + e.quantity, 0);
  const totalCutPieces = stockByType.CUT_ROLL.reduce((sum, e) => sum + e.quantity, 0);
  const totalBundles = stockByType.BUNDLE.reduce((sum, e) => sum + e.quantity, 0);
  const totalSparePieces = stockByType.SPARE.reduce((sum, e) => sum + (e.piece_count || e.total_available), 0);

  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-md transition-all border-l-4",
        productTypeName === 'HDPE Pipe' ? "border-l-primary" : "border-l-secondary",
        expanded && "shadow-inner bg-accent/5"
      )} 
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader className="p-2 sm:p-4 pb-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Header Line: Brand + Stock */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-extrabold text-[#111827] text-sm truncate uppercase tracking-tight">{brandName}</span>
                <span className="text-[10px] text-muted-foreground font-bold opacity-60 uppercase">{productTypeName}</span>
              </div>
              
              {/* Compact Stock on right */}
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {totalFullRolls > 0 && (
                  <div className="flex items-center gap-0.5 text-green-700">
                    <Box className="h-3 w-3" />
                    <span className="text-[10px] font-bold">{totalFullRolls}</span>
                  </div>
                )}
                {totalCutPieces > 0 && (
                  <div className="flex items-center gap-0.5 text-orange-700">
                    <Scissors className="h-3 w-3" />
                    <span className="text-[10px] font-bold">{totalCutPieces}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Parameters Line */}
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/80 overflow-x-auto no-scrollbar whitespace-nowrap">
              {Object.entries(parameters)
                .sort(([keyA], [keyB]) => {
                  const order = ['OD', 'PN', 'PE'];
                  const indexA = order.indexOf(keyA);
                  const indexB = order.indexOf(keyB);
                  if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                  return indexA !== -1 ? -1 : indexB !== -1 ? 1 : keyA.localeCompare(keyB);
                })
                .map(([key, value], idx, arr) => (
                  <span key={key} className="flex items-center gap-0.5 border border-muted-foreground/20 px-1 rounded bg-muted/30">
                    <span className="opacity-60">{key}</span>
                    <span className="text-foreground">{String(value)}</span>
                  </span>
                ))}
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-1">
             {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground/40" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <StockEntryList
            batchId=""
            stockEntries={allStockEntries}
            parameters={parameters}
            onUpdate={onUpdate}
          />
        </CardContent>
      )}
    </Card>
  );
};
