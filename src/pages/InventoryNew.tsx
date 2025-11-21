import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Package, Search, Box, Scissors, Layers, MessageCircle, Upload, Download, FileText, History } from 'lucide-react';
import { inventory as inventoryAPI } from '@/lib/api';
import { BatchStockCard } from '@/components/inventory/BatchStockCard';
import { StockSummary } from '@/components/inventory/StockSummary';
import { ProductHistoryDialog } from '@/components/inventory/ProductHistoryDialog';
import { WhatsAppShareDialog } from '@/components/inventory/WhatsAppShareDialog';
import { ImportExportDialog } from '@/components/inventory/ImportExportDialog';
import { AdvancedFilters } from '@/components/inventory/AdvancedFilters';
import { useAuth } from '@/contexts/AuthContext';

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
  piece_count?: number;
  total_available: number;
  product_type_name: string;
}

const InventoryNew = () => {
  const { user } = useAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [filteredBatches, setFilteredBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string>(''); // Will be set to HDPE after data loads
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedStockType, setSelectedStockType] = useState<string>('all');
  const [parameterFilters, setParameterFilters] = useState<Record<string, string>>({});

  // Product types and brands
  const [productTypes, setProductTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);

  // Dialogs
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedProductVariantId, setSelectedProductVariantId] = useState<string | null>(null);
  const [selectedProductName, setSelectedProductName] = useState('');

  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [importExportDialogOpen, setImportExportDialogOpen] = useState(false);

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

    // Filter by product type
    if (selectedProduct !== 'all') {
      filtered = filtered.filter(batch =>
        batch.product_type_name === productTypes.find(pt => pt.id === selectedProduct)?.name
      );
    }

    // Filter by brand
    if (selectedBrand !== 'all') {
      filtered = filtered.filter(batch =>
        batch.brand_name === brands.find(b => b.id === selectedBrand)?.name
      );
    }

    // Filter by parameters
    Object.entries(parameterFilters).forEach(([key, value]) => {
      if (value) {
        filtered = filtered.filter(batch => {
          const params = batch.parameters as Record<string, string>;
          return params[key]?.toString().toLowerCase().includes(value.toLowerCase());
        });
      }
    });

    // Filter by stock type
    if (selectedStockType !== 'all') {
      filtered = filtered.filter(batch =>
        batch.stock_entries.some(entry => entry.stock_type === selectedStockType)
      );
    }

    setFilteredBatches(filtered);
  };

  useEffect(() => {
    fetchProductTypes();
    fetchBrands();
    fetchBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filterBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, selectedProduct, selectedBrand, selectedStockType, parameterFilters, batches]);

  const fetchProductTypes = async () => {
    try {
      const { data } = await inventoryAPI.getProductTypes();
      setProductTypes(data || []);
      // Set HDPE as default if available
      if (selectedProduct === '' && data && data.length > 0) {
        const hdpeType = data.find((pt: { name: string }) => pt.name.toLowerCase().includes('hdpe'));
        setSelectedProduct(hdpeType ? hdpeType.id : data[0].id);
      }
    } catch (error) {
      console.error('Error fetching product types:', error);
    }
  };

  const fetchBrands = async () => {
    try {
      const { data } = await inventoryAPI.getBrands();
      setBrands(data || []);
    } catch (error) {
      console.error('Error fetching brands:', error);
    }
  };

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
      sum + b.stock_entries.filter(e => e.stock_type === 'SPARE').reduce((s, e) => s + (e.piece_count || e.total_available || 0), 0), 0
    )
  };

  // Get available parameters from batches
  const availableParameters = Array.from(
    new Set(
      batches.flatMap(b => Object.keys(b.parameters as Record<string, unknown>))
    )
  ).sort();

  const stockTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'FULL_ROLL', label: 'Full Rolls', icon: Box },
    { value: 'CUT_ROLL', label: 'Cut Rolls', icon: Scissors },
    { value: 'BUNDLE', label: 'Bundles', icon: Layers },
    { value: 'SPARE', label: 'Spares', icon: Package }
  ];

  const openProductHistory = (productVariantId: string, productName: string) => {
    setSelectedProductVariantId(productVariantId);
    setSelectedProductName(productName);
    setHistoryDialogOpen(true);
  };

  const handleParameterFilterChange = (key: string, value: string) => {
    setParameterFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearAllFilters = () => {
    setSelectedProduct('all');
    setSelectedBrand('all');
    setSelectedStockType('all');
    setParameterFilters({});
    setSearchTerm('');
  };

  const isAdmin = user?.role === 'admin';

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
            <p className="text-muted-foreground mt-1">
              Manage and track your stock inventory
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => setImportExportDialogOpen(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Import/Export
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setWhatsappDialogOpen(true)}
              className="bg-green-50 hover:bg-green-100 border-green-200"
            >
              <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
              <span className="text-green-700">WhatsApp</span>
            </Button>
            <Button onClick={fetchBatches} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <StockSummary stats={stats} />

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              Search & Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Search Bar */}
            <Input
              placeholder="Search by batch code, batch no, or brand..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9"
            />

            {/* Advanced Filters */}
            <AdvancedFilters
              productTypes={productTypes}
              brands={brands}
              selectedProductType={selectedProduct}
              selectedBrand={selectedBrand}
              parameterFilters={parameterFilters}
              onProductTypeChange={setSelectedProduct}
              onBrandChange={setSelectedBrand}
              onParameterFilterChange={handleParameterFilterChange}
              onClearFilters={clearAllFilters}
              availableParameters={availableParameters}
              selectedStockType={selectedStockType}
              onStockTypeChange={setSelectedStockType}
              stockTypes={stockTypes}
            />

            {/* Results Count */}
            <div className="text-xs text-muted-foreground">
              Showing {filteredBatches.length} of {batches.length} batches
            </div>
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

      {/* Dialogs */}
      <ProductHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        productVariantId={selectedProductVariantId}
        productName={selectedProductName}
      />

      <WhatsAppShareDialog
        open={whatsappDialogOpen}
        onOpenChange={setWhatsappDialogOpen}
        batches={filteredBatches}
      />

      <ImportExportDialog
        open={importExportDialogOpen}
        onOpenChange={setImportExportDialogOpen}
        batches={batches}
        productTypes={productTypes}
        brands={brands}
        onImportComplete={fetchBatches}
      />
    </Layout>
  );
};

export default InventoryNew;
