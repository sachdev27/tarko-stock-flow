import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { BarChart, Download, Filter, Package, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { reports, inventory } from '@/lib/api';

interface ProductSalesData {
  product_type: string;
  brand: string;
  parameters: Record<string, string>;
  roll_configuration?: {
    type: string;
    quantity_based?: boolean;
  };
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
  const [allProductInventory, setAllProductInventory] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<string>('30');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');

  // Filter states
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [selectedProductType, setSelectedProductType] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [parameterFilters, setParameterFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchFiltersData();
  }, []);

  useEffect(() => {
    if (productTypes.length > 0) {
      fetchReportsData();
    }
  }, [dateRange, selectedProduct, selectedProductType, selectedBrand, parameterFilters]);

  const fetchFiltersData = async () => {
    try {
      const [typesRes, brandsRes, inventoryRes] = await Promise.all([
        inventory.getProductTypes(),
        inventory.getBrands(),
        inventory.getBatches(),
      ]);

      setProductTypes(typesRes.data);
      setBrands(brandsRes.data);

      // Set first product type as default if available
      if (typesRes.data.length > 0 && selectedProductType === 'all') {
        setSelectedProductType(typesRes.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching filter data:', error);
      toast.error('Failed to load filters');
    }
  };

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
      let products = response.data.map((item: any) => ({
        ...item,
        total_sold: parseFloat(item.total_sold || 0),
      }));

      // Filter by product type
      if (selectedProductType !== 'all') {
        const selectedPT = productTypes.find(pt => pt.id === selectedProductType);
        if (selectedPT) {
          products = products.filter((p: any) => p.product_type === selectedPT.name);
        }
      }

      // Filter by brand
      if (selectedBrand !== 'all') {
        const selectedBr = brands.find(b => b.id === selectedBrand);
        if (selectedBr) {
          products = products.filter((p: any) => p.brand === selectedBr.name);
        }
      }

      // Filter by parameters
      Object.entries(parameterFilters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          products = products.filter((p: any) => p.parameters[key] === value);
        }
      });

      // Filter by selected product (old filter for backward compatibility)
      if (selectedProduct !== 'all') {
        products = products.filter((p: any) =>
          `${p.brand}-${p.product_type}` === selectedProduct
        );
      }

      setTopProducts(products);
    } catch (error) {
      console.error('Error fetching top products:', error);
      toast.error('Failed to load top selling products');
    }
  };  const fetchLocationInventory = async () => {
    try {
      let brand, product_type;
      if (selectedProduct !== 'all') {
        [brand, product_type] = selectedProduct.split('-');
      }
      const response = await reports.getLocationInventory(brand, product_type);
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
      let brand, product_type;
      if (selectedProduct !== 'all') {
        [brand, product_type] = selectedProduct.split('-');
      }
      const response = await reports.getCustomerSales(parseInt(dateRange), brand, product_type);
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
      let products = response.data.map((item: any) => ({
        ...item,
        total_quantity: parseFloat(item.total_quantity || 0),
      }));
      setAllProductInventory(products);

      // Filter by product type
      if (selectedProductType !== 'all') {
        const selectedPT = productTypes.find(pt => pt.id === selectedProductType);
        if (selectedPT) {
          products = products.filter((p: any) => p.product_type === selectedPT.name);
        }
      }

      // Filter by brand
      if (selectedBrand !== 'all') {
        const selectedBr = brands.find(b => b.id === selectedBrand);
        if (selectedBr) {
          products = products.filter((p: any) => p.brand === selectedBr.name);
        }
      }

      // Filter by parameters
      Object.entries(parameterFilters).forEach(([key, value]) => {
        if (value && value !== 'all') {
          products = products.filter((p: any) => p.parameters[key] === value);
        }
      });

      // Filter based on selected product (old filter)
      if (selectedProduct !== 'all') {
        const filtered = products.filter((p: any) =>
          `${p.brand}-${p.product_type}` === selectedProduct
        );
        setProductInventory(filtered);
      } else {
        setProductInventory(products);
      }
    } catch (error) {
      console.error('Error fetching product inventory:', error);
      toast.error('Failed to load product inventory');
    }
  };  const exportToCSV = (data: any[], filename: string) => {
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

  const getFilterDescription = () => {
    const filters = [];
    if (selectedProductType !== 'all') {
      const pt = productTypes.find(p => p.id === selectedProductType);
      if (pt) filters.push(pt.name);
    }
    if (selectedBrand !== 'all') {
      const br = brands.find(b => b.id === selectedBrand);
      if (br) filters.push(br.name);
    }
    Object.entries(parameterFilters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        filters.push(`${key}: ${value}`);
      }
    });
    return filters.length > 0 ? filters.join(' • ') : null;
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

          <div className="flex gap-3">
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
        </div>

        {/* Filters Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="h-5 w-5 mr-2" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Product Type Filter */}
              <Select value={selectedProductType} onValueChange={setSelectedProductType}>
                <SelectTrigger className="h-12">
                  <div className="flex items-center">
                    <Package className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Product Type" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {productTypes.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Brand Filter */}
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger className="h-12">
                  <div className="flex items-center">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Brand" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Dynamic Parameter Filters */}
              {selectedProductType !== 'all' && (() => {
                const selectedPT = productTypes.find(pt => pt.id === selectedProductType);
                const paramSchema = selectedPT?.parameter_schema || [];
                return paramSchema.map((param: any) => (
                  <Select
                    key={param.name}
                    value={parameterFilters[param.name] || 'all'}
                    onValueChange={(value) => {
                      setParameterFilters(prev => ({
                        ...prev,
                        [param.name]: value === 'all' ? '' : value
                      }));
                    }}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder={`${param.name}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {param.name}</SelectItem>
                      {/* Get unique values from product inventory for this parameter */}
                      {Array.from(new Set(
                        allProductInventory
                          .filter(item => {
                            const selectedPTName = productTypes.find(pt => pt.id === selectedProductType)?.name;
                            return item.product_type === selectedPTName;
                          })
                          .map(item => item.parameters[param.name])
                          .filter(Boolean)
                      )).map((value: any) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ));
              })()}

              {/* Clear Filters Button */}
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedProductType(productTypes.length > 0 ? productTypes[0].id : 'all');
                  setSelectedBrand('all');
                  setParameterFilters({});
                  setSelectedProduct('all');
                }}
                className="h-12"
              >
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>        {/* Top Selling Products */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Selling Products</CardTitle>
              <CardDescription>
                {getFilterDescription() || 'Best performers in the selected period'}
              </CardDescription>
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
                      <div className="text-2xl font-bold">
                        {product.total_sold.toFixed(2)} {product.roll_configuration?.type === 'bundles' && product.roll_configuration?.quantity_based ? 'pcs' : 'm'}
                      </div>
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
              <CardDescription>
                {getFilterDescription() || 'Current stock by product type'}
              </CardDescription>
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
                          {key}: {String(value)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-lg px-4 py-1">
                    {product.roll_configuration?.type === 'bundles' && product.roll_configuration?.quantity_based
                      ? `${Math.floor(product.total_quantity)} pcs`
                      : `${product.total_quantity.toFixed(2)} m`
                    }
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
              <CardDescription>
                {getFilterDescription()
                  ? `${getFilterDescription()} distribution by location`
                  : 'Stock distribution across warehouses'
                }
              </CardDescription>
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
                      {location.total_quantity.toFixed(2)} units
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
              <CardDescription>
                {getFilterDescription()
                  ? `Top customers for ${getFilterDescription()}`
                  : 'Top customers by volume'
                }
              </CardDescription>
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
                        {customer.total_quantity.toFixed(2)} units
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
