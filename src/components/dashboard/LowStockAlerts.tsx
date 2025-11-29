import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface LowStockItem {
  batch_code: string;
  current_quantity: number;
  product_type: string;
  brand: string;
  parameters?: Record<string, string | number | boolean>;
}

interface LowStockAlertsProps {
  items: LowStockItem[];
}

export const LowStockAlerts = ({ items }: LowStockAlertsProps) => {
  const getUnit = (productType: string) => {
    return productType.toLowerCase().includes('sprinkler') ? 'pcs' : 'm';
  };

  return (
    <Card className="border-orange-200 dark:border-orange-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
          <AlertTriangle className="h-5 w-5" />
          Low Stock Alerts
        </CardTitle>
        <CardDescription>Items that need attention</CardDescription>
      </CardHeader>
      <CardContent>
        {items && items.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.batch_code}
                className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-900 hover:border-orange-300 dark:hover:border-orange-800 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm font-mono">{item.batch_code}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {item.product_type} • {item.brand}
                    </div>
                    {item.parameters && Object.keys(item.parameters).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(item.parameters).slice(0, 2).map(([key, value]) => (
                          <span key={key} className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Badge variant="destructive" className="ml-3 whitespace-nowrap">
                    {parseFloat(String(item.current_quantity)).toFixed(0)} {getUnit(item.product_type)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-2" />
            <p>All stock levels are healthy!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
