import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface Product {
  product_type: string;
  brand: string;
  total_sold: string | number;
  sales_count: number;
  unique_customers: number;
  parameters?: Record<string, string | number | boolean>;
}

interface TopProductsProps {
  products: Product[];
}

export const TopProducts = ({ products }: TopProductsProps) => {
  const formatNumber = (num: number | string) => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(2) + 'K';
    return value.toFixed(0);
  };

  const maxValue = products.length > 0 ? parseFloat(String(products[0].total_sold)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Selling Products</CardTitle>
        <CardDescription>Products with highest sales volume in selected period</CardDescription>
      </CardHeader>
      <CardContent>
        {products.length > 0 ? (
          <div className="space-y-4">
            {products.slice(0, 10).map((product, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">#{index + 1}</Badge>
                      <div className="font-semibold">{product.product_type}</div>
                      <Badge variant="secondary">{product.brand}</Badge>
                    </div>
                    {product.parameters && Object.keys(product.parameters).length > 0 && (
                      <div className="flex flex-wrap gap-1 ml-12">
                        {Object.entries(product.parameters).map(([key, value]) => (
                          <Badge key={key} variant="outline" className="text-xs">
                            {key}: {String(value)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-2xl font-bold">{formatNumber(product.total_sold)}</div>
                    <div className="text-xs text-muted-foreground">
                      {product.sales_count} orders • {product.unique_customers} customers
                    </div>
                  </div>
                </div>
                <Progress
                  value={(parseFloat(String(product.total_sold)) / maxValue) * 100}
                  className="h-2"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No product data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
