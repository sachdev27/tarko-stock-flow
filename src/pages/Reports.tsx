import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { BarChart, Download, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { reports } from '@/lib/api';

interface ProductSalesData {
  product_type: string;
  brand: string;
  parameters: Record<string, string>;
  total_sold: number;
  sales_count: number;
}

interface LocationInventory {
  location: string;
  total_quantity: number;
  batch_count: number;
}

interface CustomerSales {
  customer_name: string;
  total_quantity: number;
  transaction_count: number;
  total_amount: number;
}

const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<ProductSalesData[]>([]);
  const [locationInventory, setLocationInventory] = useState<LocationInventory[]>([]);
  const [customerSales, setCustomerSales] = useState<CustomerSales[]>([]);
  const [productInventory, setProductInventory] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<string>('30');

  useEffect(() => {
    fetchReportsData();
  }, [dateRange]);

  const fetchReportsData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchTopSellingProducts(),
        fetchLocationInventory(),
        fetchCustomerSales(),
        fetchProductInventory(),
      ]);
    } catch (error) {
      console.error('Error fetching reports data:', error);
      toast.error('Failed to load reports data');
    } finally {
      setLoading(false);
    }
  };

  const fetchTopSellingProducts = async () => {
    try {
      const response = await reports.getTopSellingProducts(parseInt(dateRange));
      setTopProducts(response.data.map((item: any) => ({
        ...item,
        total_sold: parseFloat(item.total_sold || 0),
      })));
    } catch (error) {
      console.error('Error fetching top products:', error);
      toast.error('Failed to load top selling products');
    }
  };

  const fetchLocationInventory = async () => {
    try {
      const response = await reports.getLocationInventory();
      setLocationInventory(response.data.map((item: any) => ({
        ...item,
        total_quantity: parseFloat(item.total_quantity || 0),
      })));
    } catch (error) {
      console.error('Error fetching location inventory:', error);
      toast.error('Failed to load location inventory');
    }
  };

  const fetchCustomerSales = async () => {
    try {
      const response = await reports.getCustomerSales(parseInt(dateRange));
      setCustomerSales(response.data.map((item: any) => ({
        ...item,
        total_quantity: parseFloat(item.total_quantity || 0),
        total_amount: parseFloat(item.total_amount || 0),
      })));
    } catch (error) {
      console.error('Error fetching customer sales:', error);
      toast.error('Failed to load customer sales');
    }
  };

  const fetchProductInventory = async () => {
    try {
      const response = await reports.getProductInventory();
      setProductInventory(response.data.map((item: any) => ({
        ...item,
        total_quantity: parseFloat(item.total_quantity || 0),
      })));
    } catch (error) {
      console.error('Error fetching product inventory:', error);
      toast.error('Failed to load product inventory');
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header];
          if (typeof value === 'object') {
            return JSON.stringify(value);
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Report exported successfully');
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <BarChart className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Reports & Analytics</h1>
              <p className="text-muted-foreground">Business insights and inventory analysis</p>
            </div>
          </div>

          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-48 h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Top Selling Products */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Selling Products</CardTitle>
              <CardDescription>Best performers in the selected period</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(topProducts, 'top-selling-products')}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded"></div>
                ))}
              </div>
            ) : topProducts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No sales data available</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center font-bold text-primary-foreground">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-semibold">
                          {product.brand} - {product.product_type}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {Object.entries(product.parameters).map(([key, value]) => (
                            <span key={key} className="mr-3">
                              {key}: {value}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">{product.total_sold.toFixed(2)} m</div>
                      <div className="text-sm text-muted-foreground">
                        {product.sales_count} transactions
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product-wise Current Inventory */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Product-wise Inventory</CardTitle>
              <CardDescription>Current stock by product type</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(productInventory, 'product-inventory')}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {productInventory.map((product, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                >
                  <div>
                    <div className="font-medium">
                      {product.brand} - {product.product_type}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {Object.entries(product.parameters).map(([key, value]) => (
                        <span key={key} className="mr-3">
                          {key}: {value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-lg px-4 py-1">
                    {product.total_quantity.toFixed(2)} m
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Location-wise Inventory */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Location-wise Inventory</CardTitle>
              <CardDescription>Stock distribution across warehouses</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(locationInventory, 'location-inventory')}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {locationInventory.map((location, idx) => (
                <Card key={idx}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{location.location}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-2">
                      {location.total_quantity.toFixed(2)} m
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {location.batch_count} batches
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Customer-wise Sales */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Customer-wise Sales</CardTitle>
              <CardDescription>Top customers by volume</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(customerSales, 'customer-sales')}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            {customerSales.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No customer sales data</p>
            ) : (
              <div className="space-y-3">
                {customerSales.map((customer, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center font-bold">
                        {customer.customer_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold">{customer.customer_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {customer.transaction_count} transactions
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        {customer.total_quantity.toFixed(2)} m
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Reports;
