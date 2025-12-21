import { Badge } from '@/components/ui/badge';

interface ReturnItem {
  item_type: string;
  quantity?: number;
  product_type: string;
  brand: string;
  bundle_size?: number;
  piece_count?: number;
  piece_length?: number;
  length_meters?: number;
  parameters?: Record<string, unknown>;
}

interface ReturnItemsDisplayProps {
  items: ReturnItem[];
}

interface GroupedItem extends ReturnItem {
  quantity: number;
}

export function ReturnItemsDisplay({ items }: ReturnItemsDisplayProps) {
  // Group items by type, length, and parameters to avoid showing duplicates
  const groupedItems = items.reduce((acc: Record<string, GroupedItem>, item: ReturnItem) => {
    const paramStr = JSON.stringify(item.parameters || {});
    const key = `${item.item_type}-${item.length_meters || ''}-${item.piece_length || ''}-${item.bundle_size || ''}-${paramStr}`;

    if (!acc[key]) {
      acc[key] = { ...item, quantity: 0 };
    }
    acc[key].quantity += item.quantity || 0;
    return acc;
  }, {});

  return (
    <div>
      <div className="text-sm font-medium mb-3">Items in This Return</div>
      <div className="space-y-3">
        {Object.values(groupedItems).map((item, idx) => (
          <div key={idx} className="border rounded-lg p-4 bg-green-50/50">
            <div className="flex items-center justify-between mb-3">
              <Badge variant="outline" className="text-base">
                {item.item_type?.replace('_', ' ')}
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
              {item.bundle_size && (
                <div>
                  <span className="text-muted-foreground">Bundle Size:</span>
                  <span className="ml-2 font-medium">{item.bundle_size} pieces</span>
                </div>
              )}
              {item.piece_count && (
                <div>
                  <span className="text-muted-foreground">Pieces:</span>
                  <span className="ml-2 font-medium">{item.piece_count}</span>
                </div>
              )}
              {item.piece_length && (
                <div>
                  <span className="text-muted-foreground">Length per piece:</span>
                  <span className="ml-2 font-medium">{Number(item.piece_length).toFixed(2)}m</span>
                </div>
              )}
              {item.length_meters && item.item_type !== 'SPARE_PIECES' && item.item_type !== 'BUNDLE' && (
                <div>
                  <span className="text-muted-foreground">Length:</span>
                  <span className="ml-2 font-medium">
                    {item.quantity && item.quantity > 1
                      ? `${(Number(item.length_meters) / item.quantity).toFixed(2)}m per piece`
                      : `${Number(item.length_meters).toFixed(2)}m`}
                  </span>
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
          </div>
        ))}
      </div>
    </div>
  );
}
