import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface InventoryItem {
  product_type: string;
  total_quantity: number;
  batch_count: number;
}

interface InventoryByTypeProps {
  data: InventoryItem[];
}

export const InventoryByType = ({ data }: InventoryByTypeProps) => {
  const getUnit = (productType: string) => {
    return productType.toLowerCase().includes('sprinkler') ? 'pieces' : 'meters';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Inventory by Product Type
        </CardTitle>
        <CardDescription>Current stock levels across products</CardDescription>
      </CardHeader>
      <CardContent>
        {data && data.length > 0 ? (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {data.map((item) => (
              <div
                key={item.product_type}
                className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                <div className="flex-1">
                  <div className="font-semibold">{item.product_type}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    <Badge variant="outline" className="text-xs">
                      {item.batch_count} {item.batch_count === 1 ? 'batch' : 'batches'}
                    </Badge>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-2xl font-bold text-primary">
                    {parseFloat(String(item.total_quantity)).toFixed(0)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {getUnit(item.product_type)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No inventory data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
