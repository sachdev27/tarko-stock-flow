import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface RegionalProduct {
  region: string;
  product_type: string;
  brand: string;
  total_quantity: string | number;
  customer_count: number;
  order_count: number;
}

interface RegionalProductDistributionProps {
  data: RegionalProduct[];
}

export const RegionalProductDistribution = ({ data }: RegionalProductDistributionProps) => {
  const formatNumber = (num: number | string) => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(2) + 'K';
    return value.toFixed(0);
  };

  const filteredData = data.filter(r => r.region !== 'Unknown');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regional Product Distribution</CardTitle>
        <CardDescription>Most popular products by region</CardDescription>
      </CardHeader>
      <CardContent>
        {filteredData.length > 0 ? (
          <div className="space-y-4">
            {filteredData.slice(0, 8).map((item, index) => (
              <div key={index} className="flex items-start justify-between text-sm">
                <div className="space-y-1 flex-1">
                  <div className="font-medium">{item.region}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.product_type} • {item.brand}
                  </div>
                  <div className="text-xs text-blue-600">
                    {item.customer_count} customers • {item.order_count} orders
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatNumber(item.total_quantity)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No regional product data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
