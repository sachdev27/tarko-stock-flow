import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { StockEntryList } from './StockEntryList';

import { InventoryBatchUI, StockEntry } from '@/types/inventory-ui';

interface BatchStockCardProps {
  batch: InventoryBatchUI;
  onUpdate: () => void;
}

export const BatchStockCard = ({ batch, onUpdate }: BatchStockCardProps) => {
  const [expanded, setExpanded] = useState(false);

  // Group stock entries by type
  const stockByType = {
    FULL_ROLL: batch.stock_entries.filter(e => e.stock_type === 'FULL_ROLL'),
    CUT_ROLL: batch.stock_entries.filter(e => e.stock_type === 'CUT_ROLL'),
    BUNDLE: batch.stock_entries.filter(e => e.stock_type === 'BUNDLE'),
    SPARE: batch.stock_entries.filter(e => e.stock_type === 'SPARE')
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {/* Line 1: Ultra-Compact Header */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="font-extrabold text-[#111827] text-base truncate uppercase tracking-tight leading-none">{batch.brand_name}</span>
              <span className="text-[10px] text-muted-foreground/70 font-bold uppercase tracking-widest shrink-0 ml-1 opacity-80 leading-none">• {batch.product_type_name}</span>
              <span className="text-[10px] font-mono font-bold text-muted-foreground/40 ml-auto bg-muted/10 px-1.5 rounded-sm shrink-0">{batch.batch_code || batch.batch_no}</span>
            </div>
            {/* Sort parameters: OD first, then PN, then PE, rest alphabetically */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {Object.entries(batch.parameters)
                .sort(([keyA], [keyB]) => {
                  const order = ['OD', 'PN', 'PE'];
                  const indexA = order.indexOf(keyA);
                  const indexB = order.indexOf(keyB);
                  if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                  if (indexA !== -1) return -1;
                  if (indexB !== -1) return 1;
                  return keyA.localeCompare(keyB);
                })
                .map(([key, value]) => (
                  <Badge key={key} variant="outline" className="text-base font-mono px-3 py-1">
                    {key}: {String(value)}
                  </Badge>
                ))}
            </div>

            {/* Stock Summary on second line */}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              {stockByType.FULL_ROLL.length > 0 && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                  {stockByType.FULL_ROLL.reduce((sum, e) => sum + e.quantity, 0)} Full Rolls
                </Badge>
              )}
              {stockByType.CUT_ROLL.length > 0 && (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                  {stockByType.CUT_ROLL.reduce((sum, e) => sum + e.quantity, 0)} Cut Pieces
                </Badge>
              )}
              {stockByType.BUNDLE.length > 0 && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
                  {stockByType.BUNDLE.reduce((sum, e) => sum + e.quantity, 0)} Bundles
                </Badge>
              )}
              {stockByType.SPARE.length > 0 && (() => {
                const totalSparePieces = stockByType.SPARE.reduce((sum, e) => sum + (e.piece_count || e.total_available), 0);
                return (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                    {totalSparePieces} Spare Pieces
                  </Badge>
                );
              })()}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="ml-4 shrink-0"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Details
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <StockEntryList
            batchId={batch.id}
            stockEntries={batch.stock_entries}
            parameters={batch.parameters}
            onUpdate={onUpdate}
          />
        </CardContent>
      )}
    </Card>
  );
};
