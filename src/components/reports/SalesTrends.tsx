import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

interface TrendData {
  sale_date: string;
  order_count: number;
  total_quantity: string | number;
  unique_customers: number;
}

interface SalesTrendsProps {
  trends: TrendData[];
}

export const SalesTrends = ({ trends }: SalesTrendsProps) => {
  const formatNumber = (num: number | string) => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(2) + 'K';
    return value.toFixed(0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Sales Trends</CardTitle>
        <CardDescription>Order patterns over time</CardDescription>
      </CardHeader>
      <CardContent>
        {trends.length > 0 ? (
          <div className="space-y-2">
            {trends.slice(0, 20).map((trend, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm font-medium">
                    {new Date(trend.sale_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">Orders:</span>
                    <span className="ml-2 font-semibold">{trend.order_count}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Quantity:</span>
                    <span className="ml-2 font-semibold">{formatNumber(trend.total_quantity)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Customers:</span>
                    <span className="ml-2 font-semibold">{trend.unique_customers}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No trend data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
