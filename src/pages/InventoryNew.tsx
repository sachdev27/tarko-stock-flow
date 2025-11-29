import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Package, Search, Box, Scissors, Layers, MessageCircle, Upload, Download, FileText, Keyboard } from 'lucide-react';
import { inventory as inventoryAPI } from '@/lib/api';
import { ProductVariantCard } from '@/components/inventory/ProductVariantCard';
import { StockSummary } from '@/components/inventory/StockSummary';
import { WhatsAppShareDialog } from '@/components/inventory/WhatsAppShareDialog';
import { ImportExportDialog } from '@/components/inventory/ImportExportDialog';
import { AdvancedFilters } from '@/components/inventory/AdvancedFilters';
import { KeyboardShortcutsDialog } from '@/components/inventory/KeyboardShortcutsDialog';
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
  product_variant_id: string;
  stock_entries: StockEntry[];
}

interface StockEntry {
  stock_id: string;
  piece_ids?: string[];
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
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [importExportDialogOpen, setImportExportDialogOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);

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
    console.log('[InventoryNew] Component mounted - Initial data fetch');
    fetchProductTypes();
    fetchBrands();
    fetchBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh when page becomes visible (e.g., after navigating back from transactions)
  useEffect(() => {
    console.log('[InventoryNew] Setting up visibility/focus listeners for auto-refresh');

    const handleVisibilityChange = () => {
      console.log('[InventoryNew] Visibility changed - hidden:', document.hidden);
      if (!document.hidden) {
        console.log('[InventoryNew] Page became visible - refreshing inventory');
        fetchBatches();
      }
    };

    const handleFocus = () => {
      console.log('[InventoryNew] Window focused - refreshing inventory');
      fetchBatches();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      console.log('[InventoryNew] Cleaning up visibility/focus listeners');
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    console.log('[InventoryNew] Filters/batches changed - Running filterBatches()', {
      totalBatches: batches.length,
      searchTerm,
      selectedProduct,
      selectedBrand,
      selectedStockType
    });
    filterBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, selectedProduct, selectedBrand, selectedStockType, parameterFilters, batches]);

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs or textareas
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Open shortcuts dialog with '?'
      if (e.key === '?') {
        e.preventDefault();
        setKeyboardShortcutsOpen(true);
        return;
      }

      // Load shortcuts from localStorage or use defaults
      interface KeyboardShortcut {
        key: string;
        action: string;
        label: string;
        ctrlKey?: boolean;
        shiftKey?: boolean;
        altKey?: boolean;
      }

      const defaultShortcuts: KeyboardShortcut[] = [
        { key: '/', action: 'clear_filters', label: 'Clear All Filters' },
        { key: 'b', action: 'focus_brand', label: 'Focus Brand Filter' },
        { key: 'o', action: 'focus_parameter_OD', label: 'Focus OD Filter' },
        { key: 'n', action: 'focus_parameter_PN', label: 'Focus PN Filter' },
        { key: 'e', action: 'focus_parameter_PE', label: 'Focus PE Filter' },
        { key: 't', action: 'focus_parameter_Type', label: 'Focus Type Filter' },
      ];

      const savedShortcuts = localStorage.getItem('inventory_keyboard_shortcuts');
      let shortcuts: KeyboardShortcut[] = savedShortcuts
        ? JSON.parse(savedShortcuts)
        : defaultShortcuts;

      // Merge default shortcuts that aren't in saved shortcuts
      if (savedShortcuts) {
        const savedActions = shortcuts.map(s => s.action);
        defaultShortcuts.forEach(defaultShortcut => {
          if (!savedActions.includes(defaultShortcut.action)) {
            shortcuts.push(defaultShortcut);
          }
        });
      }
      const key = e.key.toLowerCase();

      // Match shortcut with modifier keys
      const ctrlKey = e.ctrlKey || e.metaKey;
      const shiftKey = e.shiftKey;
      const altKey = e.altKey;

      const shortcut = shortcuts.find((s) =>
        s.key === key &&
        (s.ctrlKey || false) === ctrlKey &&
        (s.shiftKey || false) === shiftKey &&
        (s.altKey || false) === altKey
      );

      if (shortcut) {
        e.preventDefault();
        const [type, value] = shortcut.action.split('_');

        if (shortcut.action === 'clear_filters') {
          // Clear all filters
          setSelectedProduct('');
          setSelectedBrand('');
          setSelectedStockType('all');
          setParameterFilters({});
          setSearchTerm('');
          toast.success('All filters cleared');
        } else if (shortcut.action === 'focus_parameters') {
          // Focus on parameter filters - scroll to or activate parameter filter section
          const paramSection = document.querySelector('[data-param-filters]');
          if (paramSection) {
            paramSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            // Find first button in parameter section and click it to open dropdown
            const firstButton = paramSection.querySelector('button');
            if (firstButton) {
              (firstButton as HTMLButtonElement).click();
            }
          }
          toast.success('Focused on parameter filters');
        } else if (shortcut.action === 'focus_brand') {
          // Focus on brand filter
          const brandSection = document.querySelector('[data-brand-filter]');
          if (brandSection) {
            brandSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            // Find the select trigger button and click it to open dropdown
            const selectButton = brandSection.querySelector('button');
            if (selectButton) {
              (selectButton as HTMLButtonElement).click();
            }
          }
          toast.success('Focused on brand filter');
        } else if (shortcut.action.startsWith('focus_parameter_')) {
          // Focus on specific parameter filter (OD, PN, PE, Type)
          const paramName = shortcut.action.replace('focus_parameter_', '');
          // Find the parameter filter by looking for a button with the parameter name
          const allParamSections = document.querySelectorAll('[data-param-filters]');
          let found = false;

          allParamSections.forEach((section) => {
            const label = section.querySelector('label');
            if (label && label.textContent?.trim() === paramName) {
              section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              const button = section.querySelector('button');
              if (button) {
                (button as HTMLButtonElement).click();
                found = true;
              }
            }
          });

          if (found) {
            toast.success(`Focused on ${paramName} filter`);
          } else {
            toast.info(`${paramName} filter not available for current product`);
          }
        } else if (type === 'product' && value === 'type') {
          // Handle product_type_0, product_type_1, etc.
          const index = parseInt(shortcut.action.split('_')[2]);
          if (productTypes[index]) {
            setSelectedProduct(productTypes[index].id);
            toast.success(`Filtered by ${productTypes[index].name}`);
          }
        } else if (type === 'brand') {
          // Handle brand_0, brand_1, etc.
          const index = parseInt(value);
          if (brands[index]) {
            setSelectedBrand(brands[index].id);
            toast.success(`Filtered by ${brands[index].name}`);
          }
        } else if (type === 'stock') {
          // Handle stock_type_FULL_ROLL, stock_type_all, etc.
          const stockType = shortcut.action.replace('stock_type_', '');
          setSelectedStockType(stockType);
          const stockTypeLabel = stockTypes.find(st => st.value === stockType)?.label || stockType;
          toast.success(`Filtered by ${stockTypeLabel}`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productTypes, brands]);

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
      console.log('[InventoryNew] fetchBatches() called - Starting API request');
      setLoading(true);
      const response = await inventoryAPI.getBatches();
      console.log('[InventoryNew] API response received:', {
        batchCount: response.data?.length,
        batches: response.data?.map((b: any) => ({
          batch_code: b.batch_code,
          full_rolls: b.full_roll_count,
          bundles: b.bundle_count,
          cut_pieces: b.cut_roll_count,
          spare_pieces: b.spare_piece_count
        }))
      });
      setBatches(response.data);
      console.log('[InventoryNew] State updated with', response.data?.length, 'batches');
    } catch (error) {
      const err = error as { response?: { data?: { details?: string } }; message: string };
      console.error('[InventoryNew] Error fetching batches:', err);
      toast.error('Failed to fetch inventory', {
        description: err.response?.data?.details || err.message
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate summary stats
  const groupedProducts = batches.reduce((acc, batch) => {
    const key = `${batch.product_type_name}_${batch.brand_name}_${JSON.stringify(batch.parameters)}`;
    if (!acc[key]) {
      acc[key] = {
        productTypeName: batch.product_type_name,
        batches: []
      };
    }
    acc[key].batches.push(batch);
    return acc;
  }, {} as Record<string, { productTypeName: string; batches: Batch[] }>);

  const stats = {
    hdpeProducts: Object.values(groupedProducts).filter(p => p.productTypeName === 'HDPE Pipe').length,
    sprinklerProducts: Object.values(groupedProducts).filter(p => p.productTypeName === 'Sprinkler Pipe').length,
    totalFullRolls: batches.reduce((sum, b) =>
      sum + b.stock_entries.filter(e => e.stock_type === 'FULL_ROLL' && e.quantity > 0).reduce((s, e) => s + e.quantity, 0), 0
    ),
    totalCutRolls: batches.reduce((sum, b) =>
      sum + b.stock_entries.filter(e => e.stock_type === 'CUT_ROLL' && e.quantity > 0).reduce((s, e) => s + e.quantity, 0), 0
    ),
    totalBundles: batches.reduce((sum, b) =>
      sum + b.stock_entries.filter(e => e.stock_type === 'BUNDLE' && e.quantity > 0).reduce((s, e) => s + e.quantity, 0), 0
    ),
    totalSpares: batches.reduce((sum, b) =>
      sum + b.stock_entries.filter(e => e.stock_type === 'SPARE' && (e.piece_count || e.total_available || 0) > 0).reduce((s, e) => s + (e.piece_count || e.total_available || 0), 0), 0
    )
  };

  // Get available parameters from batches
  const availableParameters = Array.from(
    new Set(
      batches.flatMap(b => Object.keys(b.parameters as Record<string, unknown>))
    )
  ).sort();

  // Get available values for each parameter from current filtered batches (before parameter filter)
  const availableParameterValues: Record<string, string[]> = {};
  const batchesForParamValues = batches.filter(batch => {
    // Apply product type and brand filters only
    if (selectedProduct !== 'all' && batch.product_type_name !== productTypes.find(pt => pt.id === selectedProduct)?.name) {
      return false;
    }
    if (selectedBrand !== 'all' && batch.brand_name !== brands.find(b => b.id === selectedBrand)?.name) {
      return false;
    }
    return true;
  });

  availableParameters.forEach(param => {
    const values = new Set<string>();
    batchesForParamValues.forEach(batch => {
      const value = (batch.parameters as Record<string, unknown>)[param];
      if (value !== null && value !== undefined) {
        values.add(String(value));
      }
    });
    availableParameterValues[param] = Array.from(values).sort((a, b) => {
      // Try to sort numerically if possible
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
  });

  // Get current product type name
  const currentProductTypeName = selectedProduct && selectedProduct !== 'all'
    ? productTypes.find(pt => pt.id === selectedProduct)?.name || ''
    : '';

  const stockTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'FULL_ROLL', label: 'Full Rolls', icon: Box },
    { value: 'CUT_ROLL', label: 'Cut Rolls', icon: Scissors },
    { value: 'BUNDLE', label: 'Bundles', icon: Layers },
    { value: 'SPARE', label: 'Spares', icon: Package }
  ];

  // Helper to get product variant ID from batches
  const getProductVariantId = (batches: Batch[]): string => {
    // All batches in a variant group should have the same product_variant_id
    return batches[0]?.product_variant_id || '';
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

  // Group batches by product variant (product type + brand + parameters)
  const groupedByProductVariant = filteredBatches.reduce((acc, batch) => {
    const key = `${batch.product_type_name}_${batch.brand_name}_${JSON.stringify(batch.parameters)}`;
    if (!acc[key]) {
      acc[key] = {
        productTypeName: batch.product_type_name,
        brandName: batch.brand_name,
        parameters: batch.parameters,
        batches: []
      };
    }
    acc[key].batches.push(batch);
    return acc;
  }, {} as Record<string, { productTypeName: string; brandName: string; parameters: Record<string, unknown>; batches: Batch[] }>);

  const isAdmin = user?.role === 'admin';

  // Handle stat card clicks to apply filters
  const handleStatCardClick = (filterType: 'hdpe' | 'sprinkler' | 'full_roll' | 'cut_roll' | 'bundle' | 'spare') => {
    // Find product type IDs
    const hdpeType = productTypes.find(pt => pt.name.toLowerCase().includes('hdpe'));
    const sprinklerType = productTypes.find(pt => pt.name.toLowerCase().includes('sprinkler'));

    switch (filterType) {
      case 'hdpe':
        // Filter by HDPE product type only
        if (hdpeType) {
          setSelectedProduct(hdpeType.id);
          setSelectedStockType('all');
          toast.success('Filtered by HDPE products');
        }
        break;
      case 'sprinkler':
        // Filter by Sprinkler product type only
        if (sprinklerType) {
          setSelectedProduct(sprinklerType.id);
          setSelectedStockType('all');
          toast.success('Filtered by Sprinkler products');
        }
        break;
      case 'full_roll':
        // Filter by HDPE + Full Rolls
        if (hdpeType) {
          setSelectedProduct(hdpeType.id);
          setSelectedStockType('FULL_ROLL');
          toast.success('Filtered by HDPE Full Rolls');
        }
        break;
      case 'cut_roll':
        // Filter by HDPE + Cut Rolls
        if (hdpeType) {
          setSelectedProduct(hdpeType.id);
          setSelectedStockType('CUT_ROLL');
          toast.success('Filtered by HDPE Cut Rolls');
        }
        break;
      case 'bundle':
        // Filter by Sprinkler + Bundles
        if (sprinklerType) {
          setSelectedProduct(sprinklerType.id);
          setSelectedStockType('BUNDLE');
          toast.success('Filtered by Sprinkler Bundles');
        }
        break;
      case 'spare':
        // Filter by Sprinkler + Spares
        if (sprinklerType) {
          setSelectedProduct(sprinklerType.id);
          setSelectedStockType('SPARE');
          toast.success('Filtered by Sprinkler Spares');
        }
        break;
    }
  };

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setKeyboardShortcutsOpen(true)}
              title="Configure Keyboard Shortcuts (?)"
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Shortcuts
            </Button>
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
        <StockSummary stats={stats} onCardClick={handleStatCardClick} />

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
              availableParameterValues={availableParameterValues}
              onProductTypeChange={setSelectedProduct}
              onBrandChange={setSelectedBrand}
              onParameterFilterChange={handleParameterFilterChange}
              onClearFilters={clearAllFilters}
              selectedStockType={selectedStockType}
              onStockTypeChange={setSelectedStockType}
              stockTypes={stockTypes}
              currentProductTypeName={currentProductTypeName}
            />

            {/* Results Count */}
            <div className="text-xs text-muted-foreground">
              Showing {filteredBatches.length} batches
            </div>
          </CardContent>
        </Card>

        {/* Product Variant List */}
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
            {Object.entries(groupedByProductVariant).map(([key, variant]) => (
              <ProductVariantCard
                key={key}
                productTypeName={variant.productTypeName}
                brandName={variant.brandName}
                parameters={variant.parameters}
                batches={variant.batches}
                productVariantId={getProductVariantId(variant.batches)}
                onUpdate={fetchBatches}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
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

      <KeyboardShortcutsDialog
        open={keyboardShortcutsOpen}
        onOpenChange={setKeyboardShortcutsOpen}
        productTypes={productTypes}
        brands={brands}
        stockTypes={stockTypes}
        availableParameterValues={availableParameterValues}
        onProductTypeChange={setSelectedProduct}
        onBrandChange={setSelectedBrand}
        onStockTypeChange={setSelectedStockType}
        onParameterFilterChange={handleParameterFilterChange}
      />
    </Layout>
  );
};

export default InventoryNew;
