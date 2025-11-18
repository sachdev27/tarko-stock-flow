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
import { Package, Search, Filter, QrCode, ChevronDown, ChevronUp, MapPin, Edit2, CheckCircle, XCircle, Clock, Paperclip } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { inventory as inventoryAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface ProductInventory {
  product_type: string;
  product_type_id: string;
  brand: string;
  brand_id: string;
  parameters: any;
  total_quantity: number;
  batches: BatchInventory[];
  roll_config?: any; // Configuration for determining units
}

interface BatchInventory {
  id: string;
  batch_code: string;
  batch_no: string;
  location: string;
  current_quantity: number;
  qc_status: string;
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

const Inventory = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<ProductInventory[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedProductType, setSelectedProductType] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [parameterFilters, setParameterFilters] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'product' | 'batch' | 'roll'>('product');

  // Edit dialogs
  const [editingBatch, setEditingBatch] = useState<any>(null);
  const [editingRoll, setEditingRoll] = useState<any>(null);
  const [qcDialogBatch, setQcDialogBatch] = useState<any>(null);
  const [qcStatus, setQcStatus] = useState('');
  const [qcNotes, setQcNotes] = useState('');

  useEffect(() => {
    fetchLocations();
    fetchProductTypes();
    fetchBrands();
    fetchInventory();
  }, [selectedLocation, selectedProductType, selectedBrand, parameterFilters]);

  const fetchLocations = async () => {
    try {
      const { data } = await inventoryAPI.getLocations();
      setLocations(data || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchProductTypes = async () => {
    try {
      const { data } = await inventoryAPI.getProductTypes();
      setProductTypes(data || []);
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
      const { data } = await inventoryAPI.getBatches(selectedLocation === 'all' ? undefined : selectedLocation);

      // Transform backend flat batch data to grouped ProductInventory structure
      const productMap = new Map<string, ProductInventory>();

      (data || []).forEach((batch: any) => {
        const key = `${batch.product_type_name}-${batch.brand_name}-${JSON.stringify(batch.parameters)}`;

        if (!productMap.has(key)) {
          // Get product type config to determine unit
          const productType = productTypes.find(pt => pt.id === batch.product_type_id);
          const rollConfig = productType?.roll_configuration || { type: 'standard_rolls' };

          productMap.set(key, {
            product_type: batch.product_type_name,
            product_type_id: batch.product_type_id,
            brand: batch.brand_name,
            brand_id: batch.brand_id,
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

          // Spare rolls are individual pieces for quantity-based products
          product.total_quantity += bundlePieces + spareRolls.length;
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
          location: batch.location_name,
          current_quantity: parseFloat(batch.current_quantity || 0),
          qc_status: batch.qc_status,
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

  const getQCStatusColor = (status: string) => {
    switch (status) {
      case 'PASSED': return 'bg-green-500';
      case 'FAILED': return 'bg-red-500';
      case 'PENDING': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getRollStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return 'bg-green-500';
      case 'PARTIAL': return 'bg-orange-500';
      case 'SOLD_OUT': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const handleQCUpdate = async () => {
    if (!qcDialogBatch || !qcStatus) return;

    try {
      await inventoryAPI.updateBatchQC(qcDialogBatch.id, {
        qc_status: qcStatus,
        notes: qcNotes
      });

      toast.success(`QC status updated to ${qcStatus}`);
      setQcDialogBatch(null);
      setQcStatus('');
      setQcNotes('');
      fetchInventory();
    } catch (error) {
      console.error('Error updating QC:', error);
      toast.error('Failed to update QC status');
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

              {/* Location Filter */}
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="h-12">
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="All Locations" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

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

              {/* View Mode */}
              <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="View Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Product View</SelectItem>
                  <SelectItem value="batch">Batch View</SelectItem>
                  <SelectItem value="roll">Roll View</SelectItem>
                </SelectContent>
              </Select>

              {/* Clear Filters Button */}
              {(selectedLocation !== 'all' || selectedBrand !== 'all' || Object.keys(parameterFilters).length > 0) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedLocation('all');
                    setSelectedBrand('all');
                    setParameterFilters({});
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
        ) : viewMode === 'product' ? (
          /* Product View - Grouped by Product */
          <div className="space-y-4">
            {filteredInventory.map((product, idx) => {
              const isBundle = product.roll_config?.type === 'bundles';
              const unit = isBundle ? 'pieces' : 'm';
              const displayQty = isBundle ? product.total_quantity : product.total_quantity.toFixed(2);

              return (
                <Card key={idx}>
                  <Collapsible>
                    <CardHeader className="cursor-pointer">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <CardTitle className="text-xl">
                                {product.brand} - {product.product_type}
                              </CardTitle>
                              <Badge variant="secondary">
                                {displayQty} {unit}
                              </Badge>
                            </div>
                            <CardDescription className="mt-2">
                              {Object.entries(product.parameters).map(([key, value]) => (
                                <span key={key} className="mr-4">
                                  <strong>{key}:</strong> {String(value)}
                                </span>
                              ))}
                            </CardDescription>
                          </div>
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </CollapsibleTrigger>
                    </CardHeader>

                    <CollapsibleContent>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="text-sm font-semibold text-muted-foreground mb-2">
                          Batches ({product.batches.length})
                        </div>
                        {product.batches.map((batch) => (
                          <Collapsible key={batch.id}>
                            <Card className="border-l-4 border-l-primary">
                              <CardHeader className="py-3">
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center justify-between cursor-pointer">
                                    <div className="flex-1">
                                      <div className="flex items-center space-x-3">
                                        <code className="text-sm font-mono bg-secondary px-2 py-1 rounded">
                                          {batch.batch_code}
                                        </code>
                                        <Badge className={getQCStatusColor(batch.qc_status)}>
                                          {batch.qc_status}
                                        </Badge>
                                        <span className="text-sm text-muted-foreground flex items-center">
                                          <MapPin className="h-3 w-3 mr-1" />
                                          {batch.location}
                                        </span>
                                        {batch.attachment_url && (
                                          <a
                                            href={batch.attachment_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="text-sm text-primary hover:text-primary/80 flex items-center"
                                            title="View attachment"
                                          >
                                            <Paperclip className="h-3 w-3 mr-1" />
                                            Attachment
                                          </a>
                                        )}
                                      </div>
                                      <div className="mt-2 text-sm text-muted-foreground">
                                        Batch No: {batch.batch_no} |
                                        Stock: {product.roll_config?.quantity_based
                                          ? (() => {
                                              const bundleRolls = batch.rolls.filter((r: any) => r.roll_type?.startsWith('bundle_'));
                                              const spareRolls = batch.rolls.filter((r: any) => r.roll_type === 'spare');
                                              const bundlePieces = bundleRolls.reduce((sum, r) => {
                                                const bundleSize = r.bundle_size || parseInt(r.roll_type?.split('_')[1] || '0');
                                                return sum + bundleSize;
                                              }, 0);
                                              return `${bundlePieces + spareRolls.length} pcs`;
                                            })()
                                          : `${batch.current_quantity.toFixed(2)} m`
                                        } |
                                        {(() => {
                                          const standardRolls = batch.rolls.filter(r => r.roll_type === 'standard' || (!r.roll_type && !r.is_cut_roll)).length;
                                          const cutRolls = batch.rolls.filter(r => r.roll_type === 'cut' || r.is_cut_roll).length;
                                          const bundles = batch.rolls.filter(r => r.roll_type?.startsWith('bundle_')).length;
                                          const sparePipes = batch.rolls.filter(r => r.roll_type === 'spare').length;

                                          const parts = [];
                                          if (standardRolls > 0) parts.push(`${standardRolls} Rolls`);
                                          if (cutRolls > 0) parts.push(`${cutRolls} Cuts`);
                                          if (bundles > 0) parts.push(`${bundles} Bundles`);
                                          if (sparePipes > 0) parts.push(`${sparePipes} Spare`);

                                          return parts.join(', ') || 'No items';
                                        })()} |
                                        Produced: {new Date(batch.production_date).toLocaleDateString()}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {isAdmin && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setQcDialogBatch(batch);
                                            setQcStatus(batch.qc_status);
                                          }}
                                        >
                                          {batch.qc_status === 'PASSED' ? <CheckCircle className="h-4 w-4" /> :
                                           batch.qc_status === 'FAILED' ? <XCircle className="h-4 w-4" /> :
                                           <Clock className="h-4 w-4" />}
                                          <span className="ml-1">QC</span>
                                        </Button>
                                      )}
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                              </CardHeader>

                              <CollapsibleContent>
                                <CardContent className="pt-0">
                                  <div className="pl-4 border-l-2 border-secondary">
                                    {/* Standard Rolls */}
                                    {batch.rolls.some(r => r.roll_type === 'standard' || (!r.roll_type && !r.is_cut_roll)) && (
                                      <div className="mb-4">
                                        <div className="text-xs font-semibold text-muted-foreground mb-2">
                                          Standard Rolls ({batch.rolls.filter(r => r.roll_type === 'standard' || (!r.roll_type && !r.is_cut_roll)).length})
                                        </div>
                                        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                          {batch.rolls.filter(r => r.roll_type === 'standard' || (!r.roll_type && !r.is_cut_roll)).map((roll, rollIdx) => (
                                            <div
                                              key={roll.id}
                                              className="p-3 bg-secondary/50 rounded-lg flex items-center justify-between"
                                            >
                                              <div className="flex-1">
                                                <div className="text-sm font-medium">Roll #{rollIdx + 1}</div>
                                                <div className="text-xs text-muted-foreground">
                                                  {roll.length_meters.toFixed(2)} m
                                                  {roll.length_meters !== roll.initial_length_meters && (
                                                    <span className="ml-1">
                                                      (was {roll.initial_length_meters.toFixed(2)} m)
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <Badge
                                                  variant="secondary"
                                                  className={getRollStatusColor(roll.status)}
                                                >
                                                  {roll.status}
                                                </Badge>
                                                {isAdmin && (
                                                  <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-6 w-6"
                                                    onClick={() => setEditingRoll({...roll, originalStatus: roll.status})}
                                                  >
                                                    <Edit2 className="h-3 w-3" />
                                                  </Button>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Cut Rolls */}
                                    {batch.rolls.some(r => r.roll_type === 'cut' || r.is_cut_roll) && (
                                      <div className="mb-4">
                                        <div className="text-xs font-semibold text-muted-foreground mb-2">
                                          Cut Rolls ({batch.rolls.filter(r => r.roll_type === 'cut' || r.is_cut_roll).length})
                                        </div>
                                        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                          {batch.rolls.filter(r => r.roll_type === 'cut' || r.is_cut_roll).map((roll, rollIdx) => (
                                            <div
                                              key={roll.id}
                                              className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg flex items-center justify-between border border-amber-200 dark:border-amber-800"
                                            >
                                              <div className="flex-1">
                                                <div className="text-sm font-medium">Cut #{rollIdx + 1}</div>
                                                <div className="text-xs text-muted-foreground">
                                                  {roll.length_meters.toFixed(2)} m
                                                  {roll.length_meters !== roll.initial_length_meters && (
                                                    <span className="ml-1">
                                                      (was {roll.initial_length_meters.toFixed(2)} m)
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <Badge
                                                  variant="secondary"
                                                  className={getRollStatusColor(roll.status)}
                                                >
                                                  {roll.status}
                                                </Badge>
                                                {isAdmin && (
                                                  <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-6 w-6"
                                                    onClick={() => setEditingRoll({...roll, originalStatus: roll.status})}
                                                  >
                                                    <Edit2 className="h-3 w-3" />
                                                  </Button>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Bundles */}
                                    {batch.rolls.some(r => r.roll_type?.startsWith('bundle_')) && (
                                      <div className="mb-4">
                                        <div className="text-xs font-semibold text-muted-foreground mb-2">
                                          Bundles ({batch.rolls.filter(r => r.roll_type?.startsWith('bundle_')).length})
                                        </div>
                                        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                                          {batch.rolls.filter(r => r.roll_type?.startsWith('bundle_')).map((roll, rollIdx) => (
                                            <div
                                              key={roll.id}
                                              className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg flex items-center justify-between border border-blue-200 dark:border-blue-800"
                                            >
                                              <div className="flex-1">
                                                <div className="text-sm font-medium">
                                                  Bundle #{rollIdx + 1} ({roll.bundle_size || roll.roll_type?.split('_')[1]} {product.roll_config?.quantity_based ? 'pieces' : 'pipes'})
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                  {product.roll_config?.quantity_based
                                                    ? `${roll.bundle_size || roll.roll_type?.split('_')[1]} pieces`
                                                    : `${roll.length_meters.toFixed(2)} m total`
                                                  }
                                                </div>
                                              </div>
                                              <div className="flex items-center gap-1">
                                                <Badge
                                                  variant="secondary"
                                                  className={getRollStatusColor(roll.status)}
                                                >
                                                  {roll.status}
                                                </Badge>
                                                {isAdmin && (
                                                  <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-6 w-6"
                                                    onClick={() => setEditingRoll({...roll, originalStatus: roll.status})}
                                                  >
                                                    <Edit2 className="h-3 w-3" />
                                                  </Button>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Spare Pipes */}
                                    {batch.rolls.some(r => r.roll_type === 'spare') && (
                                      <div className="mb-4">
                                        <div className="text-xs font-semibold text-muted-foreground mb-2">
                                          Spare {product.roll_config?.quantity_based ? 'Pieces' : 'Pipes'} (Custom)
                                        </div>
                                        <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
                                          <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                              <div className="text-sm font-medium">
                                                Total Spare {product.roll_config?.quantity_based ? 'Pieces' : 'Pipes'}: {product.roll_config?.quantity_based
                                                  ? batch.rolls.filter(r => r.roll_type === 'spare').reduce((sum, r) => sum + (r.bundle_size || 1), 0)
                                                  : batch.rolls.filter(r => r.roll_type === 'spare').length
                                                }
                                              </div>
                                              <div className="text-xs text-muted-foreground">
                                                {product.roll_config?.quantity_based
                                                  ? `${batch.rolls.filter(r => r.roll_type === 'spare').reduce((sum, r) => sum + (r.bundle_size || 1), 0)} pieces`
                                                  : `Total Length: ${batch.rolls.filter(r => r.roll_type === 'spare').reduce((sum, r) => sum + r.length_meters, 0).toFixed(2)} m`
                                                }
                                              </div>
                                            </div>
                                            <Badge variant="secondary">
                                              SPARE
                                            </Badge>
                                          </div>
                                          {/* Individual spare pipes - only show for length-based products */}
                                          {!product.roll_config?.quantity_based && (
                                            <div className="mt-2 grid gap-1 text-xs">
                                              {batch.rolls.filter(r => r.roll_type === 'spare').map((roll, idx) => (
                                                <div key={roll.id} className="flex justify-between items-center py-1 px-2 bg-white/50 dark:bg-black/20 rounded">
                                                  <span>Pipe #{idx + 1}: {roll.length_meters.toFixed(2)} m</span>
                                                  <Badge variant="secondary" className={getRollStatusColor(roll.status)}>
                                                    {roll.status}
                                                  </Badge>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </CollapsibleContent>
                            </Card>
                          </Collapsible>
                        ))}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
            })}
          </div>
        ) : viewMode === 'batch' ? (
          /* Batch View - All batches flat */
          <div className="space-y-4">
            {filteredInventory.flatMap(product =>
              product.batches.map(batch => ({...batch, product_type: product.product_type, brand: product.brand, parameters: product.parameters, roll_config: product.roll_config}))
            ).map((batch) => {
              const isBundle = batch.roll_config?.type === 'bundles';
              return (
                <Card key={batch.id} className="border-l-4 border-l-primary">
                  <Collapsible>
                    <CardHeader className="cursor-pointer">
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3">
                              <code className="text-sm font-mono bg-secondary px-2 py-1 rounded">
                                {batch.batch_code}
                              </code>
                              <CardTitle className="text-lg">
                                {batch.brand} - {batch.product_type}
                              </CardTitle>
                              <Badge className={getQCStatusColor(batch.qc_status)}>
                                {batch.qc_status}
                              </Badge>
                              {batch.attachment_url && (
                                <a
                                  href={batch.attachment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm text-primary hover:text-primary/80 flex items-center"
                                  title="View attachment"
                                >
                                  <Paperclip className="h-3 w-3 mr-1" />
                                  Attachment
                                </a>
                              )}
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              Location: {batch.location} |
                              Batch No: {batch.batch_no} |
                              Stock: {isBundle ? `${batch.rolls.length} pieces` : `${batch.current_quantity.toFixed(2)} m`} |
                              Produced: {new Date(batch.production_date).toLocaleDateString()}
                            </div>
                          </div>
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </CollapsibleTrigger>
                    </CardHeader>
                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        {/* Same roll display as product view */}
                        <div className="pl-4 border-l-2 border-secondary">
                          {/* Rolls content here - reuse from product view */}
                          {batch.rolls.length > 0 ? (
                            <div className="text-sm">Rolls: {batch.rolls.length}</div>
                          ) : (
                            <div className="text-sm text-muted-foreground">No rolls</div>
                          )}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        ) : (
          /* Roll View - All rolls flat */
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredInventory.flatMap(product =>
              product.batches.flatMap(batch =>
                batch.rolls.map(roll => ({
                  ...roll,
                  batch_code: batch.batch_code,
                  batch_no: batch.batch_no,
                  location: batch.location,
                  product_type: product.product_type,
                  brand: product.brand,
                  qc_status: batch.qc_status,
                  roll_config: product.roll_config
                }))
              )
            ).map((roll) => {
              const isBundle = roll.roll_type?.startsWith('bundle_');
              const isSpare = roll.roll_type === 'spare';
              const isCut = roll.roll_type === 'cut' || roll.is_cut_roll;

              return (
                <Card key={roll.id} className={
                  isBundle ? 'border-l-4 border-l-blue-500' :
                  isSpare ? 'border-l-4 border-l-purple-500' :
                  isCut ? 'border-l-4 border-l-amber-500' :
                  'border-l-4 border-l-green-500'
                }>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-sm">
                          {roll.brand} - {roll.product_type}
                        </CardTitle>
                        <code className="text-xs font-mono text-muted-foreground">
                          {roll.batch_code}
                        </code>
                      </div>
                      <Badge variant="secondary" className={getRollStatusColor(roll.status)}>
                        {roll.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {isBundle && (
                        <div>
                          <strong>Type:</strong> Bundle ({roll.bundle_size || roll.roll_type?.split('_')[1]} pipes)
                        </div>
                      )}
                      {isSpare && (
                        <div>
                          <strong>Type:</strong> Spare Pipe
                        </div>
                      )}
                      {isCut && (
                        <div>
                          <strong>Type:</strong> Cut Roll
                        </div>
                      )}
                      {!isBundle && (
                        <div>
                          <strong>Length:</strong> {roll.length_meters.toFixed(2)} m
                          {roll.length_meters !== roll.initial_length_meters && (
                            <span className="text-muted-foreground ml-1">
                              (was {roll.initial_length_meters.toFixed(2)} m)
                            </span>
                          )}
                        </div>
                      )}
                      {isBundle && (
                        <div>
                          <strong>Total Length:</strong> {roll.length_meters.toFixed(2)} m
                        </div>
                      )}
                      <div>
                        <strong>Location:</strong> {roll.location}
                      </div>
                      <div>
                        <Badge className={getQCStatusColor(roll.qc_status)}>
                          QC: {roll.qc_status}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* QC Status Dialog */}
      <Dialog open={!!qcDialogBatch} onOpenChange={() => setQcDialogBatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update QC Status</DialogTitle>
            <DialogDescription>
              Update quality check status for batch {qcDialogBatch?.batch_code}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>QC Status</Label>
              <Select value={qcStatus} onValueChange={setQcStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="PASSED">Passed</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Add QC notes..."
                value={qcNotes}
                onChange={(e) => setQcNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQcDialogBatch(null)}>Cancel</Button>
            <Button onClick={handleQCUpdate}>Update Status</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </Layout>
  );
};

export default Inventory;
