import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { StockEntryList } from './StockEntryList';

interface Batch {
  id: string;
  batch_code: string;
  batch_no: string;
  current_quantity: number;
  production_date: string;
  product_type_name: string;
  brand_name: string;
  parameters: Record<string, unknown>;
  stock_entries: StockEntry[];
}

interface StockEntry {
  stock_id: string;
  piece_ids?: string[];
  stock_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE';
  quantity: number;
  status: string;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  piece_count?: number;
  total_available: number;
  product_type_name: string;
  batch_id?: string;
  batch_code?: string;
}

interface ProductVariantCardProps {
  productTypeName: string;
  brandName: string;
  parameters: Record<string, unknown>;
  batches: Batch[];
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
    CUT_ROLL: allStockEntries.filter(e => e.stock_type === 'CUT_ROLL'),
    BUNDLE: allStockEntries.filter(e => e.stock_type === 'BUNDLE'),
    SPARE: allStockEntries.filter(e => e.stock_type === 'SPARE')
  };

  // Calculate totals
  const totalFullRolls = stockByType.FULL_ROLL.reduce((sum, e) => sum + e.quantity, 0);
  const totalCutPieces = stockByType.CUT_ROLL.reduce((sum, e) => sum + e.quantity, 0);
  const totalBundles = stockByType.BUNDLE.reduce((sum, e) => sum + e.quantity, 0);
  const totalSparePieces = stockByType.SPARE.reduce((sum, e) => sum + (e.piece_count || e.total_available), 0);

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setExpanded(!expanded)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {/* Single line with all info */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={productTypeName === 'HDPE Pipe' ? 'default' : 'secondary'} className="text-base px-4 py-1.5">
                {productTypeName}
              </Badge>
              <span className="text-lg font-bold">{brandName}</span>
              {/* Sort parameters: OD first, then PN, then PE, rest alphabetically */}
              {Object.entries(parameters)
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
              {totalFullRolls > 0 && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                  {totalFullRolls} Full Rolls
                </Badge>
              )}
              {totalCutPieces > 0 && (
                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                  {totalCutPieces} Cut Pieces
                </Badge>
              )}
              {totalBundles > 0 && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
                  {totalBundles} Bundles
                </Badge>
              )}
              {totalSparePieces > 0 && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                  {totalSparePieces} Spare Pieces
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 ml-4 shrink-0">
            {expanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
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
