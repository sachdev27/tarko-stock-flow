import { Badge } from '@/components/ui/badge';

interface ScrapItem {
  stock_type: string;
  quantity?: number;
  product_type: string;
  brand: string;
  batch_code?: string;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  parameters?: Record<string, unknown>;
  pieces?: Array<{
    piece_type: string;
    length_meters?: number;
  }>;
  estimated_value?: number;
  item_notes?: string;
}

interface ScrapItemsDisplayProps {
  items: ScrapItem[];
}

interface GroupedItem extends ScrapItem {
  batch_codes: string[];
  pieces: Array<{
    piece_type: string;
    length_meters?: number;
  }>;
}

export function ScrapItemsDisplay({ items }: ScrapItemsDisplayProps) {
  // Group items by stock_type, length/size, and parameters to consolidate display
  const groupedItems = items.reduce((acc: Record<string, GroupedItem>, item: ScrapItem) => {
    const paramStr = JSON.stringify(item.parameters || {});
    const key = `${item.stock_type}-${item.length_per_unit || ''}-${item.pieces_per_bundle || ''}-${item.piece_length_meters || ''}-${paramStr}`;

    if (!acc[key]) {
      acc[key] = {
        ...item,
        quantity: 0,
        batch_codes: [],
        pieces: []
      };
    }
    acc[key].quantity = (acc[key].quantity || 0) + (item.quantity || 0);

    // Collect batch codes
    if (item.batch_code && !acc[key].batch_codes.includes(item.batch_code)) {
      acc[key].batch_codes.push(item.batch_code);
    }

    // Aggregate pieces for CUT_ROLL
    if (item.pieces && Array.isArray(item.pieces)) {
      acc[key].pieces.push(...item.pieces);
    }

    return acc;
  }, {});

  return (
    <div>
      <div className="text-sm font-medium mb-3">Items Scrapped</div>
      <div className="space-y-3">
        {Object.values(groupedItems).map((item, idx) => (
          <div key={idx} className="border rounded-lg p-4 bg-rose-50/50 dark:bg-rose-950/50">
            <div className="flex items-center justify-between mb-3">
              <Badge variant="outline" className="text-base bg-rose-100 text-rose-700 border-rose-300">
                {item.stock_type?.replace('_', ' ')}
              </Badge>
              <span className="font-bold text-lg">Qty: {item.quantity}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Product:</span>
                <span className="ml-2 font-medium">{item.product_type}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Brand:</span>
                <span className="ml-2 font-medium">{item.brand}</span>
              </div>
              {item.length_per_unit && (
                <div>
                  <span className="text-muted-foreground">Length per {item.stock_type === 'FULL_ROLL' ? 'roll' : 'unit'}:</span>
                  <span className="ml-2 font-medium">{Number(item.length_per_unit).toFixed(2)}m</span>
                </div>
              )}
              {item.pieces_per_bundle && (
                <div>
                  <span className="text-muted-foreground">Bundle size:</span>
                  <span className="ml-2 font-medium">{item.pieces_per_bundle} pieces</span>
                </div>
              )}
              {item.piece_length_meters && (
                <div>
                  <span className="text-muted-foreground">Piece length:</span>
                  <span className="ml-2 font-medium">{Number(item.piece_length_meters).toFixed(2)}m</span>
                </div>
              )}
              {item.stock_type === 'CUT_ROLL' && item.pieces && item.pieces.length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Cut pieces:</span>
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-1">
                      {item.pieces
                        .filter((p) => p.piece_type === 'CUT_PIECE')
                        .map((piece, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {piece.length_meters}m
                          </Badge>
                        ))}
                    </div>
                  </div>
                </div>
              )}
              {item.estimated_value && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Estimated Value:</span>
                  <span className="ml-2 font-medium text-rose-600">₹{Number(item.estimated_value).toFixed(2)}</span>
                </div>
              )}
            </div>
            {item.parameters && Object.keys(item.parameters).length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-muted-foreground mb-2">Parameters:</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(item.parameters).map(([key, value]) => (
                    <Badge key={key} variant="secondary">
                      {key}: {String(value)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {item.item_notes && (
              <div className="mt-3 text-sm text-muted-foreground italic">
                Note: {item.item_notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
