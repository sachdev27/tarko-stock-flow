import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Package, Search, Box, Scissors, Layers } from 'lucide-react';
import { inventory as inventoryAPI } from '@/lib/api';
import { BatchStockCard } from '@/components/inventory/BatchStockCard';
import { StockFilters } from '@/components/inventory/StockFilters';
import { StockSummary } from '@/components/inventory/StockSummary';

interface Batch {
  id: string;
  batch_code: string;
  batch_no: string;
  current_quantity: number;
  production_date: string;
  product_type_name: string;
  brand_name: string;
  parameters: Record<string, unknown>;
  stock_entries: StockEntry[];
}

interface StockEntry {
  stock_id: string;
  stock_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE';
  quantity: number;
  status: string;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  total_available: number;
  product_type_name: string;
}

const InventoryNew = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [filteredBatches, setFilteredBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string>('HDPE Pipe');
  const [selectedStockType, setSelectedStockType] = useState<string>('all');

  const filterBatches = () => {
    let filtered = [...batches];

    // Filter by search term (batch code or batch no)
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(batch =>
        batch.batch_code.toLowerCase().includes(search) ||
        batch.batch_no.toLowerCase().includes(search) ||
        batch.brand_name.toLowerCase().includes(search)
      );
    }

    // Filter by product type (always filter, no 'all' option)
    filtered = filtered.filter(batch =>
      batch.product_type_name === selectedProduct
    );

    // Filter by stock type
    if (selectedStockType !== 'all') {
      filtered = filtered.filter(batch =>
        batch.stock_entries.some(entry => entry.stock_type === selectedStockType)
      );
    }

    setFilteredBatches(filtered);
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  useEffect(() => {
    filterBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, selectedProduct, selectedStockType, batches]);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const response = await inventoryAPI.getBatches();
      setBatches(response.data);
    } catch (error) {
      const err = error as { response?: { data?: { details?: string } }; message: string };
      toast.error('Failed to fetch inventory', {
        description: err.response?.data?.details || err.message
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate summary stats
  const stats = {
    totalBatches: batches.length,
    hdpeBatches: batches.filter(b => b.product_type_name === 'HDPE Pipe').length,
    sprinklerBatches: batches.filter(b => b.product_type_name === 'Sprinkler Pipe').length,
    totalFullRolls: batches.reduce((sum, b) =>
      sum + b.stock_entries.filter(e => e.stock_type === 'FULL_ROLL').reduce((s, e) => s + e.quantity, 0), 0
    ),
    totalCutRolls: batches.reduce((sum, b) =>
      sum + b.stock_entries.filter(e => e.stock_type === 'CUT_ROLL').reduce((s, e) => s + e.quantity, 0), 0
    ),
    totalBundles: batches.reduce((sum, b) =>
      sum + b.stock_entries.filter(e => e.stock_type === 'BUNDLE').reduce((s, e) => s + e.quantity, 0), 0
    ),
    totalSpares: batches.reduce((sum, b) =>
      sum + b.stock_entries.filter(e => e.stock_type === 'SPARE').reduce((s, e) => s + e.quantity, 0), 0
    )
  };

  const productTypes = [...new Set(batches.map(b => b.product_type_name))].sort();
  const stockTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'FULL_ROLL', label: 'Full Rolls', icon: Box },
    { value: 'CUT_ROLL', label: 'Cut Rolls', icon: Scissors },
    { value: 'BUNDLE', label: 'Bundles', icon: Layers },
    { value: 'SPARE', label: 'Spares', icon: Package }
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
            <p className="text-muted-foreground mt-1">
              Manage and track your stock inventory
            </p>
          </div>
          <Button onClick={fetchBatches} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {/* Summary Stats */}
        <StockSummary stats={stats} />

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <Input
                  placeholder="Batch code, batch no, or brand..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Product Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Product Type</label>
                <select
                  className="w-full h-10 px-3 border rounded-md"
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                >
                  {productTypes.map(type => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Stock Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Stock Type</label>
                <select
                  className="w-full h-10 px-3 border rounded-md"
                  value={selectedStockType}
                  onChange={(e) => setSelectedStockType(e.target.value)}
                >
                  {stockTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {searchTerm || selectedProduct !== 'all' || selectedStockType !== 'all' ? (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {filteredBatches.length} of {batches.length} batches
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedProduct('all');
                    setSelectedStockType('all');
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Batch List */}
        {loading ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                Loading inventory...
              </div>
            </CardContent>
          </Card>
        ) : filteredBatches.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No batches found</h3>
                <p className="text-muted-foreground">
                  {batches.length === 0
                    ? 'No inventory available'
                    : 'Try adjusting your filters'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredBatches.map(batch => (
              <BatchStockCard
                key={batch.id}
                batch={batch}
                onUpdate={fetchBatches}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default InventoryNew;
