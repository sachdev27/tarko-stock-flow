import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  TrendingUp,
  Users,
  Package,
  MapPin,
  BarChart3,
  PieChart,
  Calendar,
  ArrowUp,
  ArrowDown,
  Minus,
  Target,
  ShoppingCart,
  DollarSign
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { reports } from '@/lib/api';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

interface AnalyticsData {
  summary: {
    total_customers: number;
    total_orders: number;
    products_sold_count: number;
    total_quantity_sold: number;
    total_quantity_produced: number;
  };
  top_products: any[];
  top_customers: any[];
  regional_analysis: any[];
  customer_preferences: any[];
  sales_trends: any[];
  product_performance: any[];
}

const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [dateRange, setDateRange] = useState<string>('30');
  const [regionalData, setRegionalData] = useState<any[]>([]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [dateRange]);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      const [overview, regions] = await Promise.all([
        reports.getAnalyticsOverview(parseInt(dateRange)),
        reports.getCustomerRegions(parseInt(dateRange))
      ]);

      setAnalyticsData(overview.data);
      setRegionalData(regions.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (current: number, target: number) => {
    if (current > target) return <ArrowUp className="h-4 w-4 text-green-600" />;
    if (current < target) return <ArrowDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-600" />;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return num.toFixed(0);
  };

  if (loading || !analyticsData) {
    return (
      <Layout>
        <div className="container mx-auto py-6">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const summary = analyticsData.summary;

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Business Analytics</h1>
            <p className="text-muted-foreground">Comprehensive insights into your business performance</p>
          </div>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="180">Last 6 Months</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Key Metrics Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Total Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatNumber(summary.total_orders || 0)}</div>
              <p className="text-xs text-muted-foreground mt-2">Completed transactions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Active Customers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatNumber(summary.total_customers || 0)}</div>
              <p className="text-xs text-muted-foreground mt-2">Unique buyers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package className="h-4 w-4" />
                Products Sold
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatNumber(summary.products_sold_count || 0)}</div>
              <p className="text-xs text-muted-foreground mt-2">Different product types</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Target className="h-4 w-4" />
                Total Quantity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatNumber(summary.total_quantity_sold || 0)}</div>
              <p className="text-xs text-muted-foreground mt-2">Meters sold</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different analytics views */}
        <Tabs defaultValue="products" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="products">
              <Package className="h-4 w-4 mr-2" />
              Products
            </TabsTrigger>
            <TabsTrigger value="customers">
              <Users className="h-4 w-4 mr-2" />
              Customers
            </TabsTrigger>
            <TabsTrigger value="regions">
              <MapPin className="h-4 w-4 mr-2" />
              Regions
            </TabsTrigger>
            <TabsTrigger value="performance">
              <TrendingUp className="h-4 w-4 mr-2" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="trends">
              <BarChart3 className="h-4 w-4 mr-2" />
              Trends
            </TabsTrigger>
          </TabsList>

          {/* Product Analytics */}
          <TabsContent value="products" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Selling Products</CardTitle>
                <CardDescription>Products with highest sales volume in selected period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analyticsData.top_products.slice(0, 10).map((product, index) => (
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
                                  {key}: {value as string}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right space-y-1">
                          <div className="text-2xl font-bold">{formatNumber(parseFloat(product.total_sold))}</div>
                          <div className="text-xs text-muted-foreground">
                            {product.sales_count} orders • {product.unique_customers} customers
                          </div>
                        </div>
                      </div>
                      <Progress
                        value={(parseFloat(product.total_sold) / parseFloat(analyticsData.top_products[0].total_sold)) * 100}
                        className="h-2"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customer Analytics */}
          <TabsContent value="customers" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Top Customers by Volume</CardTitle>
                  <CardDescription>Customers with highest purchase quantities</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analyticsData.top_customers.slice(0, 8).map((customer, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">#{index + 1}</Badge>
                            <div className="font-medium">{customer.customer_name}</div>
                          </div>
                          <div className="text-xs text-muted-foreground ml-9">
                            {customer.city && customer.state ? `${customer.city}, ${customer.state}` : 'Location not specified'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{formatNumber(parseFloat(customer.total_quantity))}</div>
                          <div className="text-xs text-muted-foreground">{customer.order_count} orders</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Customer Product Preferences</CardTitle>
                  <CardDescription>What customers are buying the most</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analyticsData.customer_preferences.slice(0, 8).map((pref, index) => (
                      <div key={index} className="flex items-start justify-between text-sm">
                        <div className="space-y-1 flex-1">
                          <div className="font-medium">{pref.customer_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {pref.preferred_product} • {pref.preferred_brand}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatNumber(parseFloat(pref.total_quantity))}</div>
                          <div className="text-xs text-muted-foreground">{pref.order_frequency}× ordered</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Regional Analytics */}
          <TabsContent value="regions" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Sales by Region</CardTitle>
                  <CardDescription>Geographic distribution of orders</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {regionalData.filter(r => r.order_count > 0).slice(0, 10).map((region, index) => (
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
                            <div className="font-semibold">{formatNumber(parseFloat(region.total_quantity || 0))}</div>
                            <div className="text-xs text-muted-foreground">
                              {region.order_count} orders • {region.customer_count} customers
                            </div>
                          </div>
                        </div>
                        <Progress
                          value={(parseFloat(region.total_quantity || 0) / parseFloat(regionalData[0]?.total_quantity || 1)) * 100}
                          className="h-1.5"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Regional Product Distribution</CardTitle>
                  <CardDescription>Most popular products by region</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analyticsData.regional_analysis
                      .filter(r => r.region !== 'Unknown')
                      .slice(0, 8)
                      .map((item, index) => (
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
                            <div className="font-semibold">{formatNumber(parseFloat(item.total_quantity))}</div>
                          </div>
                        </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Product Performance */}
          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Product Performance Metrics</CardTitle>
                <CardDescription>Production vs Sales analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analyticsData.product_performance.map((product, index) => {
                    const salesPercentage = parseFloat(product.sales_percentage || 0);
                    const getPerformanceColor = (pct: number) => {
                      if (pct >= 80) return 'text-green-600';
                      if (pct >= 50) return 'text-yellow-600';
                      return 'text-red-600';
                    };

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
                            <div className="text-lg font-semibold">{formatNumber(parseFloat(product.total_produced || 0))}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Sold</div>
                            <div className="text-lg font-semibold text-green-600">{formatNumber(parseFloat(product.total_sold || 0))}</div>
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sales Trends */}
          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Daily Sales Trends</CardTitle>
                <CardDescription>Order patterns over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analyticsData.sales_trends.slice(0, 20).map((trend, index) => (
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
                          <span className="ml-2 font-semibold">{formatNumber(parseFloat(trend.total_quantity))}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Customers:</span>
                          <span className="ml-2 font-semibold">{trend.unique_customers}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Reports;
