import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { MapPin } from 'lucide-react';

interface RegionalData {
  region: string;
  city: string;
  total_quantity: string | number;
  order_count: number;
  customer_count: number;
}

interface RegionalSalesProps {
  data: RegionalData[];
}

export const RegionalSales = ({ data }: RegionalSalesProps) => {
  const formatNumber = (num: number | string) => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(2) + 'K';
    return value.toFixed(0);
  };

  const filteredData = data.filter(r => r.order_count > 0);
  const maxValue = filteredData.length > 0 ? parseFloat(String(filteredData[0].total_quantity || 1)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales by Region</CardTitle>
        <CardDescription>Geographic distribution of orders</CardDescription>
      </CardHeader>
      <CardContent>
        {filteredData.length > 0 ? (
          <div className="space-y-3">
            {filteredData.slice(0, 10).map((region, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{region.region}</div>
                      <div className="text-xs text-muted-foreground">{region.city}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatNumber(region.total_quantity)}</div>
                    <div className="text-xs text-muted-foreground">
                      {region.order_count} orders • {region.customer_count} customers
                    </div>
                  </div>
                </div>
                <Progress
                  value={(parseFloat(String(region.total_quantity || 0)) / maxValue) * 100}
                  className="h-1.5"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No regional data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
