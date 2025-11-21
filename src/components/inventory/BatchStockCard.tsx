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

interface BatchStockCardProps {
  batch: Batch;
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
            {/* Single line with all info */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={batch.product_type_name === 'HDPE Pipe' ? 'default' : 'secondary'} className="text-base px-4 py-1.5">
                {batch.product_type_name}
              </Badge>
              <span className="text-lg font-bold">{batch.brand_name}</span>
              {Object.entries(batch.parameters).map(([key, value]) => (
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
