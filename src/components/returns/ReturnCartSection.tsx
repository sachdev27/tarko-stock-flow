import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Trash2 } from 'lucide-react';

interface ReturnCartItem {
  product_type_name: string;
  brand_name: string;
  item_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE_PIECES';
  quantity: number;
  parameters?: Record<string, string>;
  rolls?: Array<{ length_meters: number }>;
  bundles?: Array<{ bundle_size: number; piece_length_meters: number }>;
  bundle_size?: number;
  piece_length_meters?: number;
  piece_count?: number;
}

interface ReturnCartSectionProps {
  items: ReturnCartItem[];
  onRemoveItem: (index: number) => void;
  onClearCart?: () => void;
}

const formatParameters = (params?: Record<string, string>) => {
  if (!params || Object.keys(params).length === 0) return null;
  return Object.entries(params)
    .map(([key, value]) => `${key}:${value}`)
    .join(', ');
};

const getItemTypeColor = (itemType: string) => {
  switch (itemType) {
    case 'FULL_ROLL': return 'bg-blue-500';
    case 'CUT_ROLL': return 'bg-yellow-500';
    case 'BUNDLE': return 'bg-green-500';
    case 'SPARE_PIECES': return 'bg-purple-500';
    default: return 'bg-gray-500';
  }
};

export const ReturnCartSection = ({ items, onRemoveItem, onClearCart }: ReturnCartSectionProps) => {
  const getTotalQuantity = () => {
    return items.reduce((sum, item) => {
      if (item.item_type === 'SPARE_PIECES') {
        return sum + (item.piece_count || 0);
      }
      return sum + item.quantity;
    }, 0);
  };

  const getTotalMeters = () => {
    return items.reduce((sum, item) => {
      if (item.rolls) {
        return sum + item.rolls.reduce((s, r) => s + r.length_meters, 0);
      }
      if (item.bundles) {
        return sum + item.bundles.reduce((s, b) => s + (b.bundle_size * b.piece_length_meters), 0);
      }
      if (item.item_type === 'SPARE_PIECES' && item.piece_count && item.piece_length_meters) {
        return sum + (item.piece_count * item.piece_length_meters);
      }
      return sum;
    }, 0);
  };

  const renderItemDetails = (item: ReturnCartItem) => {
    if (item.item_type === 'FULL_ROLL' || item.item_type === 'CUT_ROLL') {
      if (!item.rolls || item.rolls.length === 0) return null;

      // Check if all rolls have the same length
      const firstLength = item.rolls[0].length_meters;
      const allSameLength = item.rolls.every(r => r.length_meters === firstLength);
      const totalLength = item.rolls.reduce((sum, r) => sum + r.length_meters, 0);

      if (allSameLength) {
        // Simplified display: "5 × 500m"
        return (
          <div className="text-xs text-muted-foreground mt-1">
            <div className="font-medium">{item.quantity} × {firstLength}m</div>
            <div className="font-semibold">Total: {totalLength.toFixed(2)}m</div>
          </div>
        );
      } else {
        // Different lengths - show each one
        return (
          <div className="text-xs text-muted-foreground mt-1">
            {item.rolls.map((r, idx) => (
              <div key={idx}>Roll {idx + 1}: {r.length_meters}m</div>
            ))}
            <div className="font-semibold mt-1">Total: {totalLength.toFixed(2)}m</div>
          </div>
        );
      }
    }

    if (item.item_type === 'BUNDLE') {
      if (!item.bundles || item.bundles.length === 0) return null;

      // Check if all bundles have the same size and length
      const firstBundle = item.bundles[0];
      const allSame = item.bundles.every(
        b => b.bundle_size === firstBundle.bundle_size &&
             b.piece_length_meters === firstBundle.piece_length_meters
      );
      const totalMeters = item.bundles.reduce(
        (sum, b) => sum + (b.bundle_size * b.piece_length_meters), 0
      );

      if (allSame) {
        // Simplified display: "3 bundles × 10 pieces × 6m"
        return (
          <div className="text-xs text-muted-foreground mt-1">
            <div className="font-medium">
              {item.quantity} bundle(s) × {firstBundle.bundle_size} pieces × {firstBundle.piece_length_meters}m
            </div>
            <div className="font-semibold">Total: {totalMeters.toFixed(2)}m</div>
          </div>
        );
      } else {
        // Different bundles - show each one
        return (
          <div className="text-xs text-muted-foreground mt-1">
            {item.bundles.map((b, idx) => (
              <div key={idx}>
                Bundle {idx + 1}: {b.bundle_size} pieces × {b.piece_length_meters}m
              </div>
            ))}
            <div className="font-semibold mt-1">Total: {totalMeters.toFixed(2)}m</div>
          </div>
        );
      }
    }

    if (item.item_type === 'SPARE_PIECES') {
      const totalMeters = (item.piece_count || 0) * (item.piece_length_meters || 0);
      return (
        <div className="text-xs text-muted-foreground mt-1">
          <div className="font-medium">{item.piece_count} pieces × {item.piece_length_meters}m</div>
          <div className="font-semibold">Total: {totalMeters.toFixed(2)}m</div>
        </div>
      );
    }

    return null;
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Return Cart</h3>
        <Badge variant="secondary">{items.length} item(s)</Badge>
      </div>

      <Separator className="mb-4" />

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No items added yet</p>
          <p className="text-sm mt-2">Add products from the form on the left</p>
        </div>
      ) : (
        <>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {items.map((item, index) => (
                <Card key={index} className="p-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={getItemTypeColor(item.item_type)}>
                          {item.item_type.replace('_', ' ')}
                        </Badge>
                        <span className="text-sm font-medium">
                          {item.product_type_name} - {item.brand_name}
                        </span>
                      </div>

                      {formatParameters(item.parameters) && (
                        <div className="text-xs text-muted-foreground">
                          {formatParameters(item.parameters)}
                        </div>
                      )}

                      {renderItemDetails(item)}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveItem(index)}
                      className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <Separator className="my-4" />

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Items:</span>
                <span className="font-semibold">{getTotalQuantity()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Meters:</span>
                <span className="font-semibold">{getTotalMeters().toFixed(2)}m</span>
              </div>
            </div>

            {onClearCart && items.length > 0 && (
              <Button
                variant="outline"
                className="w-full text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={onClearCart}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Cart (Ctrl+Shift+R)
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
};
