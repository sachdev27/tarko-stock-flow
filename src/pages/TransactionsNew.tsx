import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { FileText, Download, Filter, X, Calendar } from 'lucide-react';
import { transactions as transactionsAPI, inventory, parameters as paramAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate, toISTDateTimeLocal, fromISTDateTimeLocal } from '@/lib/utils';

interface Transaction {
  id: string;
  transaction_type: 'PRODUCTION' | 'SALE';
  transaction_date: string;
  product_type: string;
  brand: string;
  parameters: Record<string, string>;
  quantity: number;
  weight_per_meter?: number;
  total_weight?: number;
  customer_name?: string;
  batch_code?: string;
  batch_no?: string;
  invoice_no?: string;
  notes?: string;
  created_by_name: string;
  unit: string;
  attachment_url?: string;
}

const Transactions = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);

  // Master data
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [parameterOptions, setParameterOptions] = useState<Record<string, any[]>>({});

  // Filters
  const [filterType, setFilterType] = useState<string>('all'); // all, PRODUCTION, SALE
  const [filterProductType, setFilterProductType] = useState<string>('all');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterCustomer, setFilterCustomer] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterParameters, setFilterParameters] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [dateRangePreset, setDateRangePreset] = useState<string>('custom');

  useEffect(() => {
    fetchMasterData();
    fetchTransactions();
  }, []);

  // Function to set date range based on preset
  const applyDateRangePreset = (preset: string) => {
    setDateRangePreset(preset);

    if (preset === 'custom') {
      return; // Don't change dates for custom
    }

    const now = new Date();
    // Since DB stores IST and browser is in IST, use local time directly
    // Format for datetime-local: YYYY-MM-DDTHH:MM
    const formatForDateTimeLocal = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const toDateTime = formatForDateTimeLocal(now);
    let fromDateTime = '';

    switch (preset) {
      case 'last24h':
        // For last 24h, go back exactly 24 hours from now
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        fromDateTime = formatForDateTimeLocal(yesterday);
        break;
      case 'last3days':
        fromDateTime = formatForDateTimeLocal(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000));
        break;
      case 'last7days':
        fromDateTime = formatForDateTimeLocal(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
        break;
      case 'last2weeks':
        fromDateTime = formatForDateTimeLocal(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000));
        break;
      case 'last30days':
        fromDateTime = formatForDateTimeLocal(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
        break;
      default:
        return;
    }

    setFilterDateFrom(fromDateTime);
    setFilterDateTo(toDateTime);
  };

  useEffect(() => {
    applyFilters();
  }, [transactions, filterType, filterProductType, filterBrand, filterCustomer, filterParameters, searchTerm]);

  // Re-fetch when date filters change
  useEffect(() => {
    fetchTransactions();
  }, [filterDateFrom, filterDateTo]);

  const fetchMasterData = async () => {
    try {
      const [productTypesRes, brandsRes, customersRes, paramsRes] = await Promise.all([
        inventory.getProductTypes(),
        inventory.getBrands(),
        inventory.getCustomers(),
        paramAPI.getOptions(),
      ]);

      setProductTypes(productTypesRes.data || []);
      setBrands(brandsRes.data || []);
      setCustomers(customersRes.data || []);
      setParameterOptions(paramsRes.data || {});
    } catch (error) {
      console.error('Error fetching master data:', error);
      toast.error('Failed to load master data');
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);

      // Build query params for date filtering
      const params: { start_date?: string; end_date?: string } = {};

      if (filterDateFrom && filterDateTo) {
        // Database stores IST times, so send datetime-local value directly
        // datetime-local format: "2025-11-19T14:30" - append seconds for ISO format
        params.start_date = filterDateFrom + ':00';  // Add seconds
        params.end_date = filterDateTo + ':00';      // Add seconds

        console.log('🔍 Date Filter Debug:');
        console.log('  From (input):', filterDateFrom);
        console.log('  To (input):', filterDateTo);
        console.log('  From (sent):', params.start_date);
        console.log('  To (sent):', params.end_date);
      } else {
        console.log('🔍 No date filter applied');
      }

      const paramsToSend = Object.keys(params).length > 0 ? params : undefined;
      console.log('📤 Calling API with params:', paramsToSend);

      const response = await transactionsAPI.getAll(paramsToSend);

      console.log('📊 Received transactions:', response.data?.length || 0);

      // Transform transactions data and remove duplicates
      const seenIds = new Set();
      const transformedData = (response.data || []).filter((txn: any) => {
        // Remove duplicates based on id
        if (seenIds.has(txn.id)) return false;
        seenIds.add(txn.id);
        return true;
      }).map((txn: any) => ({
        id: txn.id,
        transaction_type: txn.transaction_type === 'SALE' ? 'SALE' : 'PRODUCTION',
        transaction_date: txn.transaction_date || txn.created_at,
        product_type: txn.product_type,
        brand: txn.brand,
        parameters: txn.parameters || {},
        quantity: Math.abs(txn.quantity_change || txn.initial_quantity || 0),
        weight_per_meter: txn.weight_per_meter,
        total_weight: txn.total_weight,
        customer_name: txn.customer_name,
        batch_code: txn.batch_code,
        batch_no: txn.batch_no,
        invoice_no: txn.invoice_no,
        notes: txn.notes,
        created_by_name: txn.created_by_name || 'System',
        unit: txn.unit_abbreviation || 'm',
        attachment_url: txn.attachment_url
      }));

      // Sort by date, latest first
      transformedData.sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());

      setTransactions(transformedData);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...transactions];

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(t => t.transaction_type === filterType);
    }

    // Filter by product type
    if (filterProductType !== 'all') {
      filtered = filtered.filter(t => t.product_type === filterProductType);
    }

    // Filter by brand
    if (filterBrand !== 'all') {
      filtered = filtered.filter(t => t.brand === filterBrand);
    }

    // Filter by customer (for SALE only)
    if (filterCustomer !== 'all') {
      filtered = filtered.filter(t => t.customer_name === filterCustomer);
    }

    // Date filtering is now handled by the backend, no need to filter client-side
    // The backend already filters based on filterDateFrom and filterDateTo

    // Filter by parameters
    Object.entries(filterParameters).forEach(([key, value]) => {
      if (value && value !== 'all') {
        filtered = filtered.filter(t => t.parameters[key] === value);
      }
    });

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(t =>
        t.batch_code?.toLowerCase().includes(term) ||
        t.batch_no?.toLowerCase().includes(term) ||
        t.invoice_no?.toLowerCase().includes(term) ||
        t.customer_name?.toLowerCase().includes(term) ||
        t.notes?.toLowerCase().includes(term)
      );
    }

    setFilteredTransactions(filtered);
  };

  const clearFilters = () => {
    setFilterType('all');
    setFilterProductType('all');
    setFilterBrand('all');
    setFilterCustomer('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterParameters({});
    setSearchTerm('');
    setDateRangePreset('custom');
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Type', 'Product Type', 'Brand', 'Parameters', 'Quantity', 'Unit', 'Weight/m (g)', 'Total Weight (g)', 'Customer', 'Batch Code', 'Invoice', 'Notes'];

    const rows = filteredTransactions.map(t => [
      formatDate(t.transaction_date),
      t.transaction_type,
      t.product_type,
      t.brand,
      Object.entries(t.parameters).map(([k, v]) => `${k}:${v}`).join(', '),
      t.quantity,
      t.unit,
      t.weight_per_meter || '',
      t.total_weight || '',
      t.customer_name || '',
      t.batch_code || '',
      t.invoice_no || '',
      t.notes || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // Calculate summary statistics
  const summary = {
    totalProduction: filteredTransactions
      .filter(t => t.transaction_type === 'PRODUCTION')
      .reduce((sum, t) => sum + t.quantity, 0),
    totalSales: filteredTransactions
      .filter(t => t.transaction_type === 'SALE')
      .reduce((sum, t) => sum + t.quantity, 0),
    totalWeight: filteredTransactions
      .filter(t => t.transaction_type === 'PRODUCTION' && t.total_weight)
      .reduce((sum, t) => sum + (t.total_weight || 0), 0),
    productionCount: filteredTransactions.filter(t => t.transaction_type === 'PRODUCTION').length,
    salesCount: filteredTransactions.filter(t => t.transaction_type === 'SALE').length,
  };

  // Get available parameter keys from selected product type
  const selectedProductType = productTypes.find(pt => pt.name === filterProductType);
  const parameterSchema = selectedProductType?.parameter_schema || [];
  const availableParamNames = parameterSchema.map((p: any) => p.name);

  const paramOrder = ['PE', 'PN', 'OD', 'Type'];

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Transaction History</h1>
            <p className="text-muted-foreground">Complete history of production and sales</p>
          </div>
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Production</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalProduction.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{summary.productionCount} batches</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Sales</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.totalSales.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{summary.salesCount} transactions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Weight</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(summary.totalWeight / 1000).toFixed(2)} kg</div>
              <p className="text-xs text-muted-foreground">From production</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Net Balance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(summary.totalProduction - summary.totalSales).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">In stock</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Filters</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
                <Button variant="outline" size="sm" onClick={exportToCSV}>
                  <Download className="h-4 w-4 mr-1" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Transaction Type */}
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="PRODUCTION">Production</SelectItem>
                    <SelectItem value="SALE">Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Product Type */}
              <div className="space-y-2">
                <Label>Product Type</Label>
                <Select value={filterProductType} onValueChange={setFilterProductType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {productTypes.map(pt => (
                      <SelectItem key={pt.id} value={pt.name}>{pt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Brand */}
              <div className="space-y-2">
                <Label>Brand</Label>
                <Select value={filterBrand} onValueChange={setFilterBrand}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Brands</SelectItem>
                    {brands.map(brand => (
                      <SelectItem key={brand.id} value={brand.name}>{brand.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Customer (for sales) */}
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers.map(customer => (
                      <SelectItem key={customer.id} value={customer.name}>{customer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date Range */}
            <div className="space-y-4 pt-2 border-t">
              <div className="space-y-2">
                <Label>Date Range Preset</Label>
                <Select
                  value={dateRangePreset}
                  onValueChange={(value) => applyDateRangePreset(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom Range</SelectItem>
                    <SelectItem value="last24h">Last 24 Hours</SelectItem>
                    <SelectItem value="last3days">Last 3 Days</SelectItem>
                    <SelectItem value="last7days">Last 7 Days</SelectItem>
                    <SelectItem value="last2weeks">Last 2 Weeks</SelectItem>
                    <SelectItem value="last30days">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={filterDateFrom}
                    onChange={(e) => {
                      setFilterDateFrom(e.target.value);
                      setDateRangePreset('custom');
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>To Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={filterDateTo}
                    onChange={(e) => {
                      setFilterDateTo(e.target.value);
                      setDateRangePreset('custom');
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Parameter Filters */}
            {availableParamNames.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
                {paramOrder.filter(key => availableParamNames.includes(key)).map(paramKey => (
                  <div key={paramKey} className="space-y-2">
                    <Label>{paramKey}</Label>
                    <Select
                      value={filterParameters[paramKey] || 'all'}
                      onValueChange={(value) => setFilterParameters({ ...filterParameters, [paramKey]: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All {paramKey}</SelectItem>
                        {(parameterOptions[paramKey] || []).map((option: any) => (
                          <SelectItem key={option.id} value={option.value}>
                            {option.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="space-y-2">
              <Label>Search</Label>
              <Input
                placeholder="Search by batch code, invoice, customer, notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Transactions ({filteredTransactions.length})</CardTitle>
            <CardDescription>
              {filterType !== 'all' && `Showing ${filterType === 'PRODUCTION' ? 'production' : 'sales'} transactions`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No transactions found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time (IST)</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Parameters</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Weight/m</TableHead>
                      <TableHead className="text-right">Total Weight</TableHead>
                      <TableHead>Attachment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((txn) => {
                      // DB already stores IST time - format directly
                      const date = new Date(txn.transaction_date);
                      const timeStr = date.toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      });                      return (
                      <TableRow key={txn.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex flex-col">
                            <span>{formatDate(txn.transaction_date)}</span>
                            <span className="text-xs text-muted-foreground">{timeStr}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={txn.transaction_type === 'PRODUCTION' ? 'default' : 'destructive'}>
                            {txn.transaction_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{txn.product_type}</TableCell>
                        <TableCell>{txn.brand}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(txn.parameters)
                              .sort(([a], [b]) => {
                                const idxA = paramOrder.indexOf(a);
                                const idxB = paramOrder.indexOf(b);
                                return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
                              })
                              .map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-xs">
                                  {key}: {value}
                                </Badge>
                              ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {txn.quantity.toFixed(2)} {txn.unit}
                        </TableCell>
                        <TableCell className="text-right">
                          {txn.weight_per_meter ? `${parseFloat(txn.weight_per_meter.toString()).toFixed(2)} g` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {txn.total_weight ? `${(parseFloat(txn.total_weight.toString()) / 1000).toFixed(2)} kg` : '-'}
                        </TableCell>
                        <TableCell>
                          {txn.attachment_url ? (
                            <a
                              href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${txn.attachment_url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-sm"
                            >
                              View
                            </a>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Transactions;
