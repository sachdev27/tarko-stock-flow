import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Customer {
  customer_name: string;
  city?: string;
  state?: string;
  total_quantity: string | number;
  order_count: number;
}

interface TopCustomersProps {
  customers: Customer[];
}

export const TopCustomers = ({ customers }: TopCustomersProps) => {
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
        <CardTitle>Top Customers by Volume</CardTitle>
        <CardDescription>Customers with highest purchase quantities</CardDescription>
      </CardHeader>
      <CardContent>
        {customers.length > 0 ? (
          <div className="space-y-4">
            {customers.slice(0, 8).map((customer, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">#{index + 1}</Badge>
                    <div className="font-medium">{customer.customer_name}</div>
                  </div>
                  <div className="text-xs text-muted-foreground ml-9">
                    {customer.city && customer.state
                      ? `${customer.city}, ${customer.state}`
                      : 'Location not specified'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{formatNumber(customer.total_quantity)}</div>
                  <div className="text-xs text-muted-foreground">{customer.order_count} orders</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No customer data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
