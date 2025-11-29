import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface PerformanceData {
  product_type: string;
  total_produced: string | number;
  total_sold: string | number;
  batches_produced: number;
  times_sold: number;
  sales_percentage: string | number;
}

interface ProductPerformanceProps {
  data: PerformanceData[];
}

export const ProductPerformance = ({ data }: ProductPerformanceProps) => {
  const formatNumber = (num: number | string) => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(2) + 'K';
    return value.toFixed(0);
  };

  const getPerformanceColor = (pct: number) => {
    if (pct >= 80) return 'text-green-600';
    if (pct >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Performance Metrics</CardTitle>
        <CardDescription>Production vs Sales analysis</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <div className="space-y-4">
            {data.map((product, index) => {
              const salesPercentage = parseFloat(String(product.sales_percentage || 0));

              return (
                <div key={index} className="space-y-3 pb-4 border-b last:border-0">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="font-semibold text-lg">{product.product_type}</div>
                      <div className="text-sm text-muted-foreground">
                        Sold {product.times_sold} times from {product.batches_produced} batches
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${getPerformanceColor(salesPercentage)}`}>
                        {salesPercentage.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">Sales rate</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Produced</div>
                      <div className="text-lg font-semibold">{formatNumber(product.total_produced)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Sold</div>
                      <div className="text-lg font-semibold text-green-600">{formatNumber(product.total_sold)}</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Sales Progress</span>
                      <span>{salesPercentage.toFixed(1)}%</span>
                    </div>
                    <Progress value={salesPercentage} className="h-2" />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No performance data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
