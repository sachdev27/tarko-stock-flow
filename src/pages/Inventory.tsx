import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Package, Search, Filter, QrCode, ChevronDown, ChevronUp, MapPin, Edit2, CheckCircle, XCircle, Clock, Paperclip, Calendar, FileText, Download } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { inventory as inventoryAPI, transactions as transactionsAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toISTDateTimeLocal, fromISTDateTimeLocal } from '@/lib/utils';

interface ProductInventory {
  product_type: string;
  product_type_id: string;
  brand: string;
  brand_id: string;
  product_variant_id: string;  // THE KEY - used for exact matching
  parameters: any;
  total_quantity: number;
  batches: BatchInventory[];
  roll_config?: any; // Configuration for determining units
}

interface BatchInventory {
  id: string;
  batch_code: string;
  batch_no: string;
  current_quantity: number;
  production_date: string;
  attachment_url?: string;
  rolls: RollInventory[];
}

interface RollInventory {
  id: string;
  length_meters: number;
  initial_length_meters: number;
  status: string;
  is_cut_roll?: boolean;
  roll_type?: string; // 'standard', 'cut', 'bundle_10', 'bundle_20', 'spare'
  bundle_size?: number; // 10 or 20 for bundles
}

interface TransactionRecord {
  id: string;
  transaction_type: string;
  quantity_change: number;
  transaction_date: string;
  invoice_no?: string;
  notes?: string;
  created_at: string;
  batch_code: string;
  batch_no: string;
  initial_quantity: number;
  weight_per_meter?: number;
  total_weight?: number;
  attachment_url?: string;
  production_date: string;
  product_type: string;
  product_type_id: string;
  brand_id: string;
  product_variant_id: string | number;
  brand: string;
  parameters: Record<string, string>;
  roll_length_meters?: number;
  roll_initial_length_meters?: number;
  roll_is_cut?: boolean;
  roll_type?: string;
  roll_bundle_size?: number;
  roll_weight?: number;
  unit_abbreviation?: string;
  customer_name?: string;
  created_by_email?: string;
  created_by_username?: string;
  created_by_name?: string;
}

interface TransactionDiagnostic {
  id: string;
  matchType: boolean;
  matchBrand: boolean;
  matchParams: boolean;
  txnParams: Record<string, string>;
}

const Inventory = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<ProductInventory[]>([]);
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [selectedProductType, setSelectedProductType] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [parameterFilters, setParameterFilters] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyCutRolls, setShowOnlyCutRolls] = useState(false);

  // Edit dialogs
  const [editingBatch, setEditingBatch] = useState<any>(null);
  const [editingRoll, setEditingRoll] = useState<any>(null);

  // Product history dialog
  const [productHistoryDialogOpen, setProductHistoryDialogOpen] = useState(false);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<ProductInventory | null>(null);
  const [productHistory, setProductHistory] = useState<TransactionRecord[]>([]);
  const [productHistoryDiagnostics, setProductHistoryDiagnostics] = useState<TransactionDiagnostic[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchProductTypes();
    fetchBrands();
    fetchInventory();
  }, [selectedProductType, selectedBrand, parameterFilters]);

  const fetchProductTypes = async () => {
    try {
      const { data } = await inventoryAPI.getProductTypes();
      setProductTypes(data || []);
      // Set default to first product type if currently 'all'
      if (selectedProductType === 'all' && data && data.length > 0) {
        setSelectedProductType(data[0].id);
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

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const { data } = await inventoryAPI.getBatches();

      // Transform backend flat batch data to grouped ProductInventory structure
      const productMap = new Map<string, ProductInventory>();

      (data || []).forEach((batch: any) => {
        const key = `${batch.product_type_name}-${batch.brand_name}-${batch.product_variant_id}`;

        if (!productMap.has(key)) {
          // Get product type config to determine unit
          const productType = productTypes.find(pt => pt.id === batch.product_type_id);
          const rollConfig = productType?.roll_configuration || { type: 'standard_rolls' };

          productMap.set(key, {
            product_type: batch.product_type_name,
            product_type_id: batch.product_type_id,
            brand: batch.brand_name,
            brand_id: batch.brand_id,
            product_variant_id: batch.product_variant_id, // Store for exact matching
            parameters: batch.parameters,
            total_quantity: 0,
            batches: [],
            roll_config: rollConfig, // Store config for unit display
          });
        }

        const product = productMap.get(key)!;

        // Calculate quantity based on product type
        if (product.roll_config?.type === 'bundles' && product.roll_config?.quantity_based) {
          // For quantity-based bundles (sprinkler), count pieces not meters
          const bundleRolls = (batch.rolls || []).filter((r: any) => r.roll_type?.startsWith('bundle_'));
          const spareRolls = (batch.rolls || []).filter((r: any) => r.roll_type === 'spare');

          // Count total pieces from bundles
          const bundlePieces = bundleRolls.reduce((sum, r) => {
            const bundleSize = r.bundle_size || parseInt(r.roll_type?.split('_')[1] || '0');
            return sum + bundleSize;
          }, 0);

          // Count total pieces from spare rolls (each spare roll has bundle_size field with quantity)
          const sparePieces = spareRolls.reduce((sum, r) => sum + (r.bundle_size || 1), 0);
          product.total_quantity += bundlePieces + sparePieces;
        } else if (product.roll_config?.type === 'bundles') {
          // For length-based bundles, count pieces but still use meters
          const bundleRolls = (batch.rolls || []).filter((r: any) => r.roll_type?.startsWith('bundle_'));
          const spareRolls = (batch.rolls || []).filter((r: any) => r.roll_type === 'spare');
          product.total_quantity += bundleRolls.length + spareRolls.length;
        } else {
          // For standard rolls, use meters
          product.total_quantity += parseFloat(batch.current_quantity || 0);
        }

        product.batches.push({
          id: batch.id,
          batch_code: batch.batch_code,
          batch_no: batch.batch_no,
          current_quantity: parseFloat(batch.current_quantity || 0),
          production_date: batch.production_date,
          attachment_url: batch.attachment_url,
          rolls: (batch.rolls || []).map((roll: any) => ({
            ...roll,
            length_meters: parseFloat(roll.length_meters || 0),
            initial_length_meters: parseFloat(roll.initial_length_meters || 0),
          })),
        });
      });

      setInventory(Array.from(productMap.values()));
    } catch (error) {
      console.error('Error fetching inventory:', error);
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const fetchProductHistory = async (product: ProductInventory) => {
    setLoadingHistory(true);
    try {
      // Fetch all transactions
      const { data } = await transactionsAPI.getAll();

      // Diagnostic log to see raw transactions returned by the API
      console.log('fetchProductHistory - raw transactions:', data);

      const normalizeVariantId = (value: string | number | null | undefined) =>
        value === null || value === undefined ? '' : String(value);

      const targetVariantId = normalizeVariantId(product.product_variant_id);
      console.log('Target product_variant_id:', targetVariantId);

      // EXACT MATCH ONLY using product_variant_id - no complex comparisons needed!
      const allTxns = (data || []) as TransactionRecord[];
      const diagnostics: TransactionDiagnostic[] = [];
      const filtered: TransactionRecord[] = [];

      for (const txn of allTxns) {
        // Simple exact match on product_variant_id
        const txnVariantId = normalizeVariantId(txn.product_variant_id);
        const isExactMatch = txnVariantId === targetVariantId;
        console.log('Comparing:', { txnVariantId, targetVariantId, isExactMatch, txnId: txn.id });

        diagnostics.push({
          id: txn.id,
          matchType: true,  // Not needed with product_variant_id
          matchBrand: true, // Not needed with product_variant_id
          matchParams: isExactMatch,
          txnParams: txn.parameters
        });

        if (isExactMatch) {
          filtered.push(txn);
        }
      }

      console.log('fetchProductHistory - per-transaction diagnostics:', diagnostics);
      console.log('fetchProductHistory - filtered transactions:', filtered);
      setProductHistoryDiagnostics(diagnostics);
      setProductHistory(filtered);
    } catch (error) {
      console.error('Error fetching product history:', error);
      toast.error('Failed to load product history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const openProductHistory = (product: ProductInventory) => {
    setSelectedProductForHistory(product);
    setProductHistoryDialogOpen(true);
    fetchProductHistory(product);
  };

  const formatWeight = (weightInGrams: number | null | undefined): string => {
    if (weightInGrams == null) return '-';
    if (weightInGrams >= 1000) {
      return `${(weightInGrams / 1000).toFixed(2)} kg`;
    }
    return `${weightInGrams.toFixed(0)} g`;
  };

  const exportProductHistoryCSV = () => {
    if (!selectedProductForHistory || productHistory.length === 0) return;

    const headers = ['Date', 'Type', 'Batch Code', 'Quantity', 'Customer', 'Invoice', 'Notes'];
    const headersWithRoll = [...headers, 'Roll Length (m)', 'Roll Weight', 'Roll Type', 'Is Cut'];
    const rows = productHistory.map((txn) => [
      new Date(txn.transaction_date).toLocaleString('en-IN'),
      txn.transaction_type,
      txn.batch_code || '-',
      `${txn.quantity_change} m`,
      txn.customer_name || '-',
      txn.invoice_no || '-',
      txn.notes || '-',
      txn.roll_length_meters != null ? txn.roll_length_meters : '-',
      formatWeight(txn.roll_weight),
      txn.roll_type || '-',
      txn.roll_is_cut ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headersWithRoll.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedProductForHistory.product_type}-${selectedProductForHistory.brand}-history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredInventory = inventory.filter((item) => {
    // Product type filter
    if (selectedProductType !== 'all' && item.product_type_id !== selectedProductType) {
      return false;
    }

    // Brand filter
    if (selectedBrand !== 'all' && item.brand_id !== selectedBrand) {
      return false;
    }

    // Parameter filters
    for (const [paramKey, paramValue] of Object.entries(parameterFilters)) {
      if (paramValue && item.parameters[paramKey] !== paramValue) {
        return false;
      }
    }

    // Cut rolls filter
    if (showOnlyCutRolls) {
      const hasCutRolls = item.batches.some(batch =>
        batch.rolls.some(roll => roll.is_cut_roll || roll.roll_type === 'cut')
      );
      if (!hasCutRolls) {
        return false;
      }
    }

    // Search query
    const searchLower = searchQuery.toLowerCase();
    if (searchQuery && !(
      item.product_type.toLowerCase().includes(searchLower) ||
      item.brand.toLowerCase().includes(searchLower) ||
      JSON.stringify(item.parameters).toLowerCase().includes(searchLower) ||
      item.batches.some(b =>
        b.batch_code.toLowerCase().includes(searchLower) ||
        b.batch_no.toLowerCase().includes(searchLower)
      )
    )) {
      return false;
    }

    return true;
  });

  const getRollStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return 'bg-green-500';
      case 'PARTIAL': return 'bg-orange-500';
      case 'SOLD_OUT': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const handleRollUpdate = async () => {
    if (!editingRoll) return;

    try {
      // Check if status changed to SOLD_OUT
      const statusChangedToSoldOut = editingRoll.originalStatus !== 'SOLD_OUT' && editingRoll.status === 'SOLD_OUT';

      await inventoryAPI.updateRoll(editingRoll.id, {
        length_meters: editingRoll.length_meters,
        status: editingRoll.status,
        create_transaction: statusChangedToSoldOut
      });

      toast.success(statusChangedToSoldOut
        ? 'Roll marked as sold out and transaction created'
        : 'Roll updated successfully'
      );
      setEditingRoll(null);
      fetchInventory();
    } catch (error) {
      console.error('Error updating roll:', error);
      toast.error('Failed to update roll');
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Package className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
              <p className="text-muted-foreground">Track stock across products, batches, and rolls</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products, batches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12"
                />
              </div>

              {/* Product Type Filter */}
              <Select value={selectedProductType} onValueChange={setSelectedProductType}>
                <SelectTrigger className={`h-12 ${selectedProductType === 'all' ? 'border-red-500 border-2' : ''}`}>
                  <div className="flex items-center">
                    <Package className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Select Product Type *" />
                  </div>
                </SelectTrigger>
                <SelectContent>
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
                    <SelectValue placeholder="All Brands" />
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
                      <SelectValue placeholder={`All ${param.name}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {param.name}</SelectItem>
                      {/* Get unique values from inventory for this parameter */}
                      {Array.from(new Set(
                        inventory
                          .filter(item => item.product_type_id === selectedProductType)
                          .map(item => item.parameters[param.name])
                          .filter(Boolean)
                      )).map((value: any) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ));
              })()}

              {/* Cut Rolls Filter */}
              <div className="flex items-center space-x-2 border rounded-md px-3 h-12">
                <input
                  type="checkbox"
                  id="cut-rolls-filter"
                  checked={showOnlyCutRolls}
                  onChange={(e) => setShowOnlyCutRolls(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="cut-rolls-filter" className="text-sm font-medium cursor-pointer">
                  Show Only Cut Rolls
                </Label>
              </div>

              {/* Clear Filters Button */}
              {(selectedBrand !== 'all' || showOnlyCutRolls || Object.keys(parameterFilters).length > 0) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedBrand('all');
                    setParameterFilters({});
                    setShowOnlyCutRolls(false);
                  }}
                  className="h-12"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{filteredInventory.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {filteredInventory.reduce((acc, p) => acc + p.batches.length, 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Rolls/Bundles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {filteredInventory.reduce((acc, p) =>
                  acc + p.batches.reduce((bAcc, b) => bAcc + b.rolls.length, 0), 0
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {(() => {
                  const bundleProducts = filteredInventory.filter(p => p.roll_config?.type === 'bundles');
                  const rollProducts = filteredInventory.filter(p => p.roll_config?.type !== 'bundles');
                  const bundleQty = bundleProducts.reduce((acc, p) => acc + p.total_quantity, 0);
                  const rollQty = rollProducts.reduce((acc, p) => acc + p.total_quantity, 0);

                  if (bundleQty > 0 && rollQty > 0) {
                    return `${rollQty.toFixed(2)} m / ${bundleQty} pcs`;
                  } else if (bundleQty > 0) {
                    return `${bundleQty} pieces`;
                  } else {
                    return `${rollQty.toFixed(2)} m`;
                  }
                })()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Inventory List */}
        {loading ? (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-muted animate-pulse rounded"></div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : filteredInventory.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">No inventory found</p>
            </CardContent>
          </Card>
        ) : (
          /* Product View with Colorful Pills and Aggregated Rolls */
          <div className="space-y-4">
            {filteredInventory.map((product, idx) => {
              const isBundle = product.roll_config?.type === 'bundles';
              const unit = isBundle ? 'pieces' : 'm';
              const displayQty = isBundle ? product.total_quantity : product.total_quantity.toFixed(2);

              // Aggregate ALL rolls from ALL batches
              let allRolls = product.batches.flatMap(batch => batch.rolls);

              // Apply cut rolls filter if active
              if (showOnlyCutRolls) {
                allRolls = allRolls.filter(r => r.is_cut_roll || r.roll_type === 'cut');
              }

              // Standard rolls grouped by length
              const standardRolls = allRolls.filter(r => r.roll_type === 'standard' || (!r.roll_type && !r.is_cut_roll));
              const standardByLength = standardRolls.reduce((acc, roll) => {
                const length = roll.initial_length_meters;
                if (!acc[length]) {
                  acc[length] = [];
                }
                acc[length].push(roll);
                return acc;
              }, {} as Record<number, typeof standardRolls>);

              // Cut rolls grouped by length
              const cutRolls = allRolls.filter(r => r.roll_type === 'cut' || r.is_cut_roll);
              const cutByLength = cutRolls.reduce((acc, roll) => {
                const length = roll.initial_length_meters;
                if (!acc[length]) {
                  acc[length] = [];
                }
                acc[length].push(roll);
                return acc;
              }, {} as Record<number, typeof cutRolls>);

              // Bundles grouped by size
              const bundleRolls = allRolls.filter(r => r.roll_type?.startsWith('bundle_'));
              const bundlesBySize = bundleRolls.reduce((acc, roll) => {
                const bundleSize = roll.bundle_size || parseInt(roll.roll_type?.split('_')[1] || '0');
                if (!acc[bundleSize]) {
                  acc[bundleSize] = [];
                }
                acc[bundleSize].push(roll);
                return acc;
              }, {} as Record<number, typeof bundleRolls>);

              // Spare pipes
              const spareRolls = allRolls.filter(r => r.roll_type === 'spare');

              return (
                <Card key={idx}>
                  <Collapsible>
                    <CardHeader>
                      <div className="flex items-center justify-between w-full gap-4">
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between flex-1 gap-3 cursor-pointer">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary" className="text-base px-3 py-1">
                                {product.brand}
                              </Badge>
                              {(() => {
                                // Sort parameters in order: PE, PN, OD
                                const paramOrder = ['PE', 'PN', 'OD'];
                                const sortedParams = Object.entries(product.parameters).sort(([keyA], [keyB]) => {
                                  const indexA = paramOrder.indexOf(keyA);
                                  const indexB = paramOrder.indexOf(keyB);
                                  if (indexA === -1 && indexB === -1) return 0;
                                  if (indexA === -1) return 1;
                                  if (indexB === -1) return -1;
                                  return indexA - indexB;
                                });

                                return sortedParams.map(([key, value]) => (
                                  <Badge key={key} variant="outline" className="text-base px-3 py-1">
                                    {key}: {String(value)}
                                  </Badge>
                                ));
                              })()}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-2xl whitespace-nowrap">
                                <span className="font-bold">{displayQty}</span> {unit}
                              </span>
                              <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openProductHistory(product);
                          }}
                          className="ml-2"
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          History
                        </Button>
                      </div>
                    </CardHeader>

                    <CollapsibleContent>
                    <CardContent>
                      <div className="space-y-6">
                        {/* Standard Rolls - Hide for quantity-based products */}
                        {!product.roll_config?.quantity_based && Object.keys(standardByLength).length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-muted-foreground mb-3">
                              Standard Rolls ({standardRolls.length} total)
                            </div>
                            <div className="space-y-2">
                              {Object.entries(standardByLength)
                                .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
                                .map(([length, rolls]) => {
                                  const totalLength = rolls.reduce((sum, r) => sum + r.length_meters, 0);
                                  return (
                                    <div
                                      key={length}
                                      className="p-4 bg-secondary/50 rounded-lg flex items-center justify-between"
                                    >
                                      <div className="flex-1">
                                        <div className="text-base font-semibold">
                                          <span className="font-bold">{parseFloat(length).toFixed(0)}m</span> × {rolls.length}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                          {rolls.length} roll{rolls.length > 1 ? 's' : ''}
                                        </div>
                                      </div>
                                      <div className="text-3xl text-primary">
                                        <span className="font-bold">{totalLength.toFixed(0)}m</span>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}

                        {/* Cut Rolls - Hide for quantity-based products */}
                        {!product.roll_config?.quantity_based && Object.keys(cutByLength).length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-muted-foreground mb-3">
                              Cut Rolls ({cutRolls.length} total)
                            </div>
                            <div className="space-y-2">
                              {Object.entries(cutByLength)
                                .sort(([a], [b]) => parseFloat(b) - parseFloat(a))
                                .map(([length, rolls]) => {
                                  const totalLength = rolls.reduce((sum, r) => sum + r.length_meters, 0);
                                  return (
                                    <div
                                      key={length}
                                      className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg flex items-center justify-between border border-amber-200 dark:border-amber-800"
                                    >
                                      <div className="flex-1">
                                        <div className="text-base font-semibold">
                                          <span className="font-bold">{parseFloat(length).toFixed(0)}m</span> × {rolls.length}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                          {rolls.length} cut roll{rolls.length > 1 ? 's' : ''}
                                        </div>
                                      </div>
                                      <div className="text-3xl text-amber-600">
                                        <span className="font-bold">{totalLength.toFixed(0)}m</span>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}

                        {/* Bundles */}
                        {Object.keys(bundlesBySize).length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-muted-foreground mb-3">
                              Bundles ({bundleRolls.length} total)
                            </div>
                            <div className="space-y-2">
                              {Object.entries(bundlesBySize)
                                .sort(([a], [b]) => parseInt(b) - parseInt(a))
                                .map(([bundleSize, rolls]) => {
                                  const totalPieces = rolls.reduce((sum, r) => {
                                    const size = r.bundle_size || parseInt(r.roll_type?.split('_')[1] || '0');
                                    return sum + size;
                                  }, 0);
                                  const totalLength = rolls.reduce((sum, r) => sum + r.length_meters, 0);

                                  return (
                                    <div
                                      key={bundleSize}
                                      className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg flex items-center justify-between border border-blue-200 dark:border-blue-800"
                                    >
                                      <div className="flex-1">
                                        <div className="text-base font-semibold">
                                          Bundle of {bundleSize} × {rolls.length}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                          {totalPieces} pieces total
                                          {!product.roll_config?.quantity_based && ` (${totalLength.toFixed(2)} m)`}
                                        </div>
                                      </div>
                                      <div className="text-3xl font-bold text-blue-600">
                                        {totalPieces} pcs
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}

                        {/* Spare Pipes */}
                        {spareRolls.length > 0 && (
                          <div>
                            <div className="text-sm font-semibold text-muted-foreground mb-3">
                              Spare Pipes ({spareRolls.length} total)
                            </div>
                            <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg flex items-center justify-between border border-purple-200 dark:border-purple-800">
                              <div className="flex-1">
                                <div className="text-base font-semibold">
                                  Spare Pipes × {spareRolls.length}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {spareRolls.reduce((sum, r) => sum + (r.bundle_size || 1), 0)} pieces total
                                  {!product.roll_config?.quantity_based && ` (${spareRolls.reduce((sum, r) => sum + r.length_meters, 0).toFixed(2)} m)`}
                                </div>
                              </div>
                              <div className="text-3xl font-bold text-purple-600">
                                {spareRolls.reduce((sum, r) => sum + (r.bundle_size || 1), 0)} pcs
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
            })}
          </div>
        )}
      </div>

      {/* Roll Edit Dialog */}
      {/* Roll Edit Dialog */}
      <Dialog open={!!editingRoll} onOpenChange={() => setEditingRoll(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Roll</DialogTitle>
            <DialogDescription>
              Update roll length and status
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Length (meters)</Label>
              <Input
                type="number"
                step="0.01"
                value={editingRoll?.length_meters || ''}
                onChange={(e) => setEditingRoll({...editingRoll, length_meters: parseFloat(e.target.value)})}
              />
              <p className="text-xs text-muted-foreground">
                Initial length: {editingRoll?.initial_length_meters?.toFixed(2)} m
              </p>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editingRoll?.status} onValueChange={(value) => setEditingRoll({...editingRoll, status: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">Available</SelectItem>
                  <SelectItem value="PARTIAL">Partial</SelectItem>
                  <SelectItem value="SOLD_OUT">Sold Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRoll(null)}>Cancel</Button>
            <Button onClick={handleRollUpdate}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product History Dialog */}
      <Dialog open={productHistoryDialogOpen} onOpenChange={setProductHistoryDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              Product History - {selectedProductForHistory?.product_type} ({selectedProductForHistory?.brand})
              {selectedProductForHistory?.parameters && (() => {
                const paramOrder = ['PE', 'PN', 'OD'];
                const sortedParams = Object.entries(selectedProductForHistory.parameters).sort(([keyA], [keyB]) => {
                  const indexA = paramOrder.indexOf(keyA);
                  const indexB = paramOrder.indexOf(keyB);
                  if (indexA === -1 && indexB === -1) return 0;
                  if (indexA === -1) return 1;
                  if (indexB === -1) return -1;
                  return indexA - indexB;
                });
                return sortedParams.map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="text-sm px-3 py-1 bg-primary/10 text-primary border-primary/20">
                    {key}: {String(value)}
                  </Badge>
                ));
              })()}
            </DialogTitle>
            <DialogDescription>
              Complete transaction history and current outstanding inventory
            </DialogDescription>
          </DialogHeader>

          {loadingHistory ? (
            <div className="text-center py-8">Loading history...</div>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground">Total Produced</div>
                    <div className="text-2xl font-bold text-green-600">
                      {productHistory
                        .filter((txn) => txn.transaction_type === 'PRODUCTION')
                        .reduce((sum, txn) => sum + Math.abs(txn.quantity_change || 0), 0)
                        .toFixed(2)} m
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground">Total Sold</div>
                    <div className="text-2xl font-bold text-red-600">
                      {productHistory
                        .filter((txn) => txn.transaction_type === 'SALE')
                        .reduce((sum, txn) => sum + Math.abs(txn.quantity_change || 0), 0)
                        .toFixed(2)} m
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground">Current Outstanding</div>
                    <div className="text-2xl font-bold text-primary">
                      {selectedProductForHistory?.total_quantity.toFixed(2)} {selectedProductForHistory?.roll_config?.type === 'bundles' ? 'pcs' : 'm'}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Diagnostics when no exact matches */}
              {productHistory.length === 0 && productHistoryDiagnostics.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">Potential Matches (no exact matches)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {productHistoryDiagnostics.map((d) => (
                        <div key={d.id} className="p-2 border rounded flex items-start justify-between">
                          <div className="flex-1 mr-4">
                            <div className="text-sm font-medium break-words">{d.id}</div>
                            <div className="text-xs text-muted-foreground mt-1 truncate">params: {JSON.stringify(d.txnParams)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={d.matchType ? 'secondary' : 'outline'} className="text-xs">{d.matchType ? 'Type' : 'Type ✗'}</Badge>
                            <Badge variant={d.matchBrand ? 'secondary' : 'outline'} className="text-xs">{d.matchBrand ? 'Brand' : 'Brand ✗'}</Badge>
                            <Badge variant={d.matchParams ? 'secondary' : 'outline'} className="text-xs">{d.matchParams ? 'Params' : 'Params ✗'}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Transaction Table */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Batch Code</TableHead>
                      <TableHead>Roll</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productHistory.map((txn) => (
                      <TableRow key={txn.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(txn.transaction_date).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={txn.transaction_type === 'PRODUCTION' ? 'default' : 'destructive'}>
                            {txn.transaction_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{txn.batch_code || '-'}</TableCell>
                        <TableCell>
                          {txn.roll_length_meters != null ? (
                            <div className="text-sm">
                              <div>{txn.roll_length_meters} m</div>
                              <div className="text-xs text-muted-foreground">{formatWeight(txn.roll_weight)}</div>
                              <div className="text-xs text-muted-foreground">{txn.roll_type || ''}{txn.roll_is_cut ? ' • Cut' : ''}</div>
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">-</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {txn.transaction_type === 'PRODUCTION' ? '+' : '-'}
                          {Math.abs(txn.quantity_change || 0).toFixed(2)} m
                        </TableCell>
                        <TableCell>{txn.customer_name || '-'}</TableCell>
                        <TableCell>{txn.invoice_no || '-'}</TableCell>
                        <TableCell className="max-w-xs truncate">{txn.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setProductHistoryDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={exportProductHistoryCSV} disabled={productHistory.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Inventory;
