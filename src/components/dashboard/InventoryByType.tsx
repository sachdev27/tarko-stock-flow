import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, CircleDot, Scissors } from 'lucide-react';

interface InventoryData {
  product_type: string;
  total_quantity?: number;
  total_meters?: number;
  batch_count: number;
  full_roll_count?: number;
  cut_roll_count?: number;
  total_rolls?: number;
}

interface InventoryByTypeProps {
  data: InventoryData[];
}

const formatNumber = (num: number | undefined) => {
  if (!num) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toFixed(0);
};

export const InventoryByType = ({ data }: InventoryByTypeProps) => {
  return (
    <Card className="backdrop-blur-sm bg-card/80 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          Stock Overview
        </CardTitle>
        <CardDescription>Current inventory breakdown</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data && data.length > 0 ? (
          data.map((item) => {
            const meters = item.total_meters ?? item.total_quantity ?? 0;
            const fullRolls = item.full_roll_count ?? 0;
            const cutRolls = item.cut_roll_count ?? 0;
            const totalRolls = item.total_rolls ?? (fullRolls + cutRolls);

            return (
              <div
                key={item.product_type}
                className="p-4 rounded-xl bg-muted/50 border border-border/30 hover:bg-muted/70 transition-colors"
              >
                {/* Product type header */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{item.product_type}</h3>
                  <Badge variant="outline" className="text-xs">
                    {item.batch_count} batches
                  </Badge>
                </div>

                {/* Main stats grid */}
                <div className="grid grid-cols-3 gap-3">
                  {/* Total meters */}
                  <div className="text-center p-2 rounded-lg bg-background/50">
                    <p className="text-xs text-muted-foreground mb-0.5">Meters</p>
                    <p className="text-xl font-bold text-primary">{formatNumber(meters)}</p>
                    <p className="text-xs text-muted-foreground">total</p>
                  </div>

                  {/* Full rolls */}
                  <div className="text-center p-2 rounded-lg bg-background/50">
                    <p className="text-xs text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                      <CircleDot className="h-3 w-3" /> Full
                    </p>
                    <p className="text-xl font-bold text-emerald-600">{fullRolls}</p>
                    <p className="text-xs text-muted-foreground">rolls</p>
                  </div>

                  {/* Cut rolls */}
                  <div className="text-center p-2 rounded-lg bg-background/50">
                    <p className="text-xs text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
                      <Scissors className="h-3 w-3" /> Cut
                    </p>
                    <p className="text-xl font-bold text-violet-600">{cutRolls}</p>
                    <p className="text-xs text-muted-foreground">rolls</p>
                  </div>
                </div>

                {/* Total summary */}
                {totalRolls > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total Rolls</span>
                    <span className="font-bold text-lg">{totalRolls}</span>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-8">
            <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">No inventory data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
