import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { TrendingUp, Users, Package, MapPin, BarChart3 } from 'lucide-react';
import { reports } from '@/lib/api';
import {
  SummaryCards,
  TopProducts,
  TopCustomers,
  CustomerPreferences,
  RegionalSales,
  RegionalProductDistribution,
  ProductPerformance,
  SalesTrends
} from '@/components/reports';

interface AnalyticsData {
  summary: {
    total_customers: number;
    total_orders: number;
    products_sold_count: number;
    total_quantity_sold: number;
    total_quantity_produced: number;
  };
  top_products: Array<{
    product_type: string;
    brand: string;
    total_sold: string | number;
    sales_count: number;
    unique_customers: number;
    parameters?: Record<string, string | number | boolean>;
  }>;
  top_customers: Array<{
    customer_name: string;
    city?: string;
    state?: string;
    total_quantity: string | number;
    order_count: number;
  }>;
  regional_analysis: Array<{
    region: string;
    product_type: string;
    brand: string;
    total_quantity: string | number;
    customer_count: number;
    order_count: number;
  }>;
  customer_preferences: Array<{
    customer_name: string;
    preferred_product: string;
    preferred_brand: string;
    total_quantity: string | number;
    order_frequency: number;
  }>;
  sales_trends: Array<{
    sale_date: string;
    order_count: number;
    total_quantity: string | number;
    unique_customers: number;
  }>;
  product_performance: Array<{
    product_type: string;
    total_produced: string | number;
    total_sold: string | number;
    batches_produced: number;
    times_sold: number;
    sales_percentage: string | number;
  }>;
}

interface RegionalData {
  region: string;
  city: string;
  total_quantity: string | number;
  order_count: number;
  customer_count: number;
}

const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [dateRange, setDateRange] = useState<string>('30');
  const [regionalData, setRegionalData] = useState<RegionalData[]>([]);

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

  useEffect(() => {
    fetchAnalyticsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

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
        <SummaryCards data={analyticsData.summary} />

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
            <TopProducts products={analyticsData.top_products} />
          </TabsContent>

          {/* Customer Analytics */}
          <TabsContent value="customers" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TopCustomers customers={analyticsData.top_customers} />
              <CustomerPreferences preferences={analyticsData.customer_preferences} />
            </div>
          </TabsContent>

          {/* Regional Analytics */}
          <TabsContent value="regions" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <RegionalSales data={regionalData} />
              <RegionalProductDistribution data={analyticsData.regional_analysis} />
            </div>
          </TabsContent>

          {/* Product Performance */}
          <TabsContent value="performance" className="space-y-4">
            <ProductPerformance data={analyticsData.product_performance} />
          </TabsContent>

          {/* Sales Trends */}
          <TabsContent value="trends" className="space-y-4">
            <SalesTrends trends={analyticsData.sales_trends} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Reports;
