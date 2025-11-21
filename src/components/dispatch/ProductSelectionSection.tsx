import { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableCombobox } from './SearchableCombobox';
import { X, Package, Scissors, Box, Package2, Plus, Minus, Check } from 'lucide-react';
import { CutRollDialog } from '../inventory/CutRollDialog';
import { SplitBundleDialog } from '../inventory/SplitBundleDialog';
import { CombineSparesDialog } from '../inventory/CombineSparesDialog';
import { toast } from 'sonner';

interface StockEntry {
  stock_id: string;
  stock_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE';
  quantity: number;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  piece_count?: number;
  piece_id?: string;
  spare_id?: string;
  total_available?: number;
  product_type_name?: string;
  batch_code?: string;
}

interface ProductVariant {
  variant_key: string;
  brand_name: string;
  product_type_name: string;
  product_category: string;
  parameters: Record<string, unknown>;
  stock_entries: StockEntry[];
}

interface ProductType {
  id: string;
  name: string;
}

interface ProductSelectionProps {
  productTypeId: string;
  onProductTypeChange: (id: string) => void;
  productSearch: string;
  onProductSearchChange: (search: string) => void;
  selectedRolls: any[];
  onRemoveRoll: (index: number) => void;
  onAddRoll: (roll: any) => void;
  onUpdateRollQuantity: (index: number, quantity: number, dispatchLength?: number) => void;
  productTypes: ProductType[];
  availableRolls: any[];
  onSearchProducts: () => void;
  productTypeRef?: React.RefObject<HTMLDivElement>;
  productSearchRef?: React.RefObject<HTMLDivElement>;
}

export const ProductSelectionSection = ({
  productTypeId,
  onProductTypeChange,
  productSearch,
  onProductSearchChange,
  selectedRolls,
  onRemoveRoll,
  onAddRoll,
  productTypes,
  availableRolls,
  onSearchProducts,
  productTypeRef,
  productSearchRef
}: ProductSelectionProps) => {
  const [cutDialogOpen, setCutDialogOpen] = useState(false);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [combineDialogOpen, setCombineDialogOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockEntry | null>(null);

  // For HDPE: Track number of full rolls to add
  const [fullRollsQuantity, setFullRollsQuantity] = useState<Record<string, number>>({});
  // For HDPE: Track selected cut pieces (checkbox)
  const [selectedCutPieces, setSelectedCutPieces] = useState<Set<string>>(new Set());

  // For Sprinkler: Track bundle quantities
  const [bundleQuantities, setBundleQuantities] = useState<Record<string, number>>({});
  // For Sprinkler: Track spare piece quantities
  const [spareQuantities, setSpareQuantities] = useState<Record<string, number>>({});

  // Group available rolls by product variant
  const groupedVariants = useMemo(() => {
    const variants: Record<string, ProductVariant> = {};

    availableRolls.forEach((roll) => {
      const paramStr = JSON.stringify(roll.parameters || {});
      const key = `${roll.brand_name}-${paramStr}`;

      if (!variants[key]) {
        variants[key] = {
          variant_key: key,
          brand_name: roll.brand_name || '',
          product_type_name: roll.product_type_name || '',
          product_category: roll.product_category || 'HDPE',
          parameters: roll.parameters || {},
          stock_entries: []
        };
      }

      const stockType = roll.stock_type || (roll.is_cut_roll ? 'CUT_ROLL' : roll.bundle_type === 'bundle' ? 'BUNDLE' : roll.bundle_type === 'spare' ? 'SPARE' : 'FULL_ROLL');

      variants[key].stock_entries.push({
        stock_id: roll.id || roll.stock_id,
        stock_type: stockType,
        quantity: roll.quantity || 1,
        length_per_unit: roll.length_meters,
        pieces_per_bundle: roll.bundle_size,
        piece_length_meters: roll.piece_length_meters,
        piece_count: roll.piece_count,
        piece_id: roll.piece_id,
        spare_id: roll.spare_id,
        total_available: roll.total_available || roll.length_meters,
        product_type_name: roll.product_type_name,
        batch_code: roll.batch_code
      });
    });

    return Object.values(variants);
  }, [availableRolls]);

  const filteredVariants = useMemo(() => {
    if (!productSearch.trim()) return groupedVariants;

    const searchLower = productSearch.toLowerCase();
    return groupedVariants.filter(variant => {
      const brandName = variant.brand_name?.toLowerCase() || '';
      const params = JSON.stringify(variant.parameters).toLowerCase();
      return brandName.includes(searchLower) || params.includes(searchLower);
    });
  }, [groupedVariants, productSearch]);

  const handleCutRoll = (entry: StockEntry) => {
    setSelectedStock(entry);
    setCutDialogOpen(true);
  };

  const handleSplitBundle = (entry: StockEntry) => {
    setSelectedStock(entry);
    setSplitDialogOpen(true);
  };

  const handleCombineSpares = (spares: StockEntry[]) => {
    if (spares.length > 0) {
      setSelectedStock(spares[0]);
      setCombineDialogOpen(true);
    }
  };

  const handleDialogSuccess = () => {
    onSearchProducts();
    setSelectedStock(null);
  };

  // HDPE: Add full rolls
  const handleAddFullRolls = (variant: ProductVariant, fullRollEntry: StockEntry) => {
    const quantity = fullRollsQuantity[fullRollEntry.stock_id] || 0;
    if (quantity <= 0 || quantity > fullRollEntry.quantity) {
      toast.error(`Please enter a valid quantity (1-${fullRollEntry.quantity})`);
      return;
    }

    const roll = {
      id: fullRollEntry.stock_id,
      batch_code: fullRollEntry.batch_code || '',
      length_meters: fullRollEntry.length_per_unit || 0,
      status: 'AVAILABLE',
      stock_type: 'FULL_ROLL',
      parameters: variant.parameters,
      brand_name: variant.brand_name,
      product_type_name: variant.product_type_name,
      product_category: variant.product_category,
      quantity
    };

    onAddRoll(roll);
    setFullRollsQuantity(prev => ({ ...prev, [fullRollEntry.stock_id]: 0 }));
    toast.success(`Added ${quantity} full roll${quantity > 1 ? 's' : ''}`);
  };

  // HDPE: Add selected cut pieces
  const handleAddSelectedCutPieces = (variant: ProductVariant, cutPieces: StockEntry[]) => {
    if (selectedCutPieces.size === 0) {
      toast.error('Please select at least one cut piece');
      return;
    }

    cutPieces.forEach(entry => {
      if (selectedCutPieces.has(entry.stock_id)) {
        const roll = {
          id: entry.stock_id,
          batch_code: entry.batch_code || '',
          length_meters: entry.length_per_unit || 0,
          status: 'AVAILABLE',
          stock_type: 'CUT_ROLL',
          parameters: variant.parameters,
          brand_name: variant.brand_name,
          product_type_name: variant.product_type_name,
          product_category: variant.product_category,
          quantity: 1
        };
        onAddRoll(roll);
      }
    });

    toast.success(`Added ${selectedCutPieces.size} cut piece${selectedCutPieces.size > 1 ? 's' : ''}`);
    setSelectedCutPieces(new Set());
  };

  // Sprinkler: Add bundles
  const handleAddBundles = (variant: ProductVariant, bundleEntries: StockEntry[], size: number) => {
    const key = `${variant.variant_key}-bundle-${size}`;
    const quantity = bundleQuantities[key] || 0;
    const totalAvailable = bundleEntries.reduce((sum, e) => sum + e.quantity, 0);

    if (quantity <= 0 || quantity > totalAvailable) {
      toast.error(`Please enter a valid quantity (1-${totalAvailable})`);
      return;
    }

    // Use first bundle entry as template
    const firstBundle = bundleEntries[0];
    const roll = {
      id: firstBundle.stock_id,
      batch_code: firstBundle.batch_code || '',
      status: 'AVAILABLE',
      stock_type: 'BUNDLE',
      bundle_size: size,
      piece_count: size,
      piece_length_meters: firstBundle.piece_length_meters,
      parameters: variant.parameters,
      brand_name: variant.brand_name,
      product_type_name: variant.product_type_name,
      product_category: variant.product_category,
      quantity
    };

    onAddRoll(roll);
    setBundleQuantities(prev => ({ ...prev, [key]: 0 }));
    toast.success(`Added ${quantity} bundle${quantity > 1 ? 's' : ''} of ${size} pieces`);
  };

  // Sprinkler: Add spare pieces
  const handleAddSpares = (variant: ProductVariant, spareEntries: StockEntry[]) => {
    const key = variant.variant_key;
    const quantity = spareQuantities[key] || 0;
    const totalAvailable = spareEntries.reduce((sum, e) => sum + (e.piece_count || 0), 0);

    if (quantity <= 0 || quantity > totalAvailable) {
      toast.error(`Please enter a valid quantity (1-${totalAvailable} pieces)`);
      return;
    }

    const firstSpare = spareEntries[0];
    const roll = {
      id: firstSpare.stock_id,
      batch_code: firstSpare.batch_code || '',
      status: 'AVAILABLE',
      stock_type: 'SPARE',
      piece_count: quantity,
      piece_length_meters: firstSpare.piece_length_meters,
      parameters: variant.parameters,
      brand_name: variant.brand_name,
      product_type_name: variant.product_type_name,
      product_category: variant.product_category,
      quantity: 1 // For spares, quantity represents number of pieces
    };

    onAddRoll(roll);
    setSpareQuantities(prev => ({ ...prev, [key]: 0 }));
    toast.success(`Added ${quantity} spare piece${quantity > 1 ? 's' : ''}`);
  };

  const toggleCutPiece = (stockId: string) => {
    setSelectedCutPieces(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stockId)) {
        newSet.delete(stockId);
      } else {
        newSet.add(stockId);
      }
      return newSet;
    });
  };

  return (
    <div className="flex gap-4 p-4 border rounded-lg">
      {/* Left side - Product Selection */}
      <div className="flex-1 space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Package className="h-5 w-5" />
          Product Selection
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div ref={productTypeRef}>
          <Label>Product Type *</Label>
          <SearchableCombobox
            value={productTypeId}
            onChange={onProductTypeChange}
            options={productTypes}
            placeholder="Select product type"
            displayFormat={(pt) => pt.name}
          />
        </div>

        <div ref={productSearchRef}>
          <Label>Filter Products</Label>
          <Input
            value={productSearch}
            onChange={(e) => onProductSearchChange(e.target.value)}
            placeholder="Search by brand or specs..."
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">
            Showing {filteredVariants.length} product variant{filteredVariants.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Product Variants List */}
      {filteredVariants.length > 0 && (
        <div className="space-y-4">
          {filteredVariants.map((variant) => {
            const stockByType = {
              FULL_ROLL: variant.stock_entries.filter(e => e.stock_type === 'FULL_ROLL'),
              CUT_ROLL: variant.stock_entries.filter(e => e.stock_type === 'CUT_ROLL'),
              BUNDLE: variant.stock_entries.filter(e => e.stock_type === 'BUNDLE'),
              SPARE: variant.stock_entries.filter(e => e.stock_type === 'SPARE')
            };

            // Group bundles by size
            const bundlesBySize = stockByType.BUNDLE.reduce((acc, entry) => {
              const size = entry.pieces_per_bundle || 0;
              if (!acc[size]) acc[size] = [];
              acc[size].push(entry);
              return acc;
            }, {} as Record<number, StockEntry[]>);

            const isHDPE = variant.product_category?.includes('HDPE') || variant.product_type_name?.includes('HDPE');
            const isSprinkler = variant.product_category?.includes('Sprinkler') || variant.product_type_name?.includes('Sprinkler');

            return (
              <Card key={variant.variant_key}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant={isHDPE ? 'default' : 'secondary'} className="text-base px-4 py-1.5">
                      {variant.product_type_name}
                    </Badge>
                    <span className="text-lg font-bold">{variant.brand_name}</span>
                    {Object.entries(variant.parameters)
                      .sort(([keyA], [keyB]) => {
                        const order = ['OD', 'PN', 'PE', 'outer_diameter', 'pressure_class', 'material'];
                        const indexA = order.indexOf(keyA);
                        const indexB = order.indexOf(keyB);
                        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                        if (indexA !== -1) return -1;
                        if (indexB !== -1) return 1;
                        return keyA.localeCompare(keyB);
                      })
                      .map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-base font-mono px-3 py-1">
                          {key}: {String(value)}
                        </Badge>
                      ))}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {isHDPE && (
                    <>
                      {/* Full Rolls Section */}
                      {stockByType.FULL_ROLL.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold flex items-center gap-2">
                              <Box className="h-4 w-4 text-green-600" />
                              Full Rolls
                            </h4>
                          </div>
                          {stockByType.FULL_ROLL.map(entry => {
                            const totalMeters = (entry.length_per_unit || 0) * (entry.quantity || 0);
                            const inputValue = fullRollsQuantity[entry.stock_id] || 0;
                            return (
                              <div key={entry.stock_id} className="p-3 bg-green-50 rounded-lg border border-green-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium text-sm">
                                      {entry.quantity} rolls available @ {entry.length_per_unit}m each
                                    </div>
                                    <div className="text-xs text-gray-600">Total: {totalMeters.toFixed(0)}m</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleCutRoll(entry)}
                                      className="gap-1 h-8"
                                    >
                                      <Scissors className="h-3 w-3" />
                                      Cut
                                    </Button>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setFullRollsQuantity(prev => ({
                                          ...prev,
                                          [entry.stock_id]: Math.max(0, (prev[entry.stock_id] || 0) - 1)
                                        }))}
                                        disabled={inputValue <= 0}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <Input
                                        type="number"
                                        value={inputValue}
                                        onChange={(e) => setFullRollsQuantity(prev => ({
                                          ...prev,
                                          [entry.stock_id]: Math.min(entry.quantity, Math.max(0, parseInt(e.target.value) || 0))
                                        }))}
                                        className="w-16 h-8 text-center"
                                        min="0"
                                        max={entry.quantity}
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setFullRollsQuantity(prev => ({
                                          ...prev,
                                          [entry.stock_id]: Math.min(entry.quantity, (prev[entry.stock_id] || 0) + 1)
                                        }))}
                                        disabled={inputValue >= entry.quantity}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        onClick={() => handleAddFullRolls(variant, entry)}
                                        disabled={inputValue <= 0}
                                        size="sm"
                                        className="h-8 ml-1"
                                      >
                                        <Check className="h-3 w-3 mr-1" />
                                        Add
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Cut Pieces Section */}
                      {stockByType.CUT_ROLL.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold flex items-center gap-2">
                              <Scissors className="h-4 w-4 text-orange-600" />
                              Cut Pieces ({stockByType.CUT_ROLL.length})
                            </h4>
                            <Button
                              onClick={() => handleAddSelectedCutPieces(variant, stockByType.CUT_ROLL)}
                              disabled={selectedCutPieces.size === 0}
                              size="sm"
                              variant="default"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Add Selected ({selectedCutPieces.size})
                            </Button>
                          </div>
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-12">Select</TableHead>
                                  <TableHead>Length</TableHead>
                                  <TableHead className="w-24">Action</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {stockByType.CUT_ROLL.map(entry => {
                                  const length = entry.length_per_unit || entry.total_available || 0;
                                  console.log('Cut piece entry:', entry); // Debug
                                  return (
                                    <TableRow key={entry.stock_id} className="bg-orange-50">
                                      <TableCell>
                                        <Checkbox
                                          checked={selectedCutPieces.has(entry.stock_id)}
                                          onCheckedChange={() => toggleCutPiece(entry.stock_id)}
                                        />
                                      </TableCell>
                                      <TableCell className="font-mono font-semibold text-base">
                                        {length > 0 ? length.toFixed(1) : '0.0'}m
                                      </TableCell>
                                      <TableCell>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleCutRoll(entry)}
                                          className="gap-1 h-7"
                                        >
                                          <Scissors className="h-3 w-3" />
                                          Cut
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {isSprinkler && (
                    <>
                      {/* Bundles Section */}
                      {Object.keys(bundlesBySize).length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold flex items-center gap-2">
                            <Package className="h-4 w-4 text-purple-600" />
                            Bundles
                          </h4>
                          {Object.entries(bundlesBySize)
                            .sort(([a], [b]) => Number(b) - Number(a))
                            .map(([size, entries]) => {
                              const totalBundles = entries.reduce((sum, e) => sum + e.quantity, 0);
                              const firstEntry = entries[0];
                              const key = `${variant.variant_key}-bundle-${size}`;
                              const inputValue = bundleQuantities[key] || 0;

                              return (
                                <div key={size} className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="font-medium text-sm">
                                        Bundle of {size} pieces ({totalBundles} available)
                                      </div>
                                      <div className="text-xs text-gray-600">
                                        {firstEntry.piece_length_meters}m per piece
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleSplitBundle(firstEntry)}
                                        className="gap-1 h-8"
                                      >
                                        <Scissors className="h-3 w-3" />
                                        Split
                                      </Button>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setBundleQuantities(prev => ({
                                            ...prev,
                                            [key]: Math.max(0, (prev[key] || 0) - 1)
                                          }))}
                                          disabled={inputValue <= 0}
                                          className="h-8 w-8 p-0"
                                        >
                                          <Minus className="h-3 w-3" />
                                        </Button>
                                        <Input
                                          type="number"
                                          value={inputValue}
                                          onChange={(e) => setBundleQuantities(prev => ({
                                            ...prev,
                                            [key]: Math.min(totalBundles, Math.max(0, parseInt(e.target.value) || 0))
                                          }))}
                                          className="w-16 h-8 text-center"
                                          min="0"
                                          max={totalBundles}
                                        />
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setBundleQuantities(prev => ({
                                            ...prev,
                                            [key]: Math.min(totalBundles, (prev[key] || 0) + 1)
                                          }))}
                                          disabled={inputValue >= totalBundles}
                                          className="h-8 w-8 p-0"
                                        >
                                          <Plus className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          onClick={() => handleAddBundles(variant, entries, Number(size))}
                                          disabled={inputValue <= 0}
                                          size="sm"
                                          className="h-8 ml-1"
                                        >
                                          <Check className="h-3 w-3 mr-1" />
                                          Add
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}

                      {/* Spare Pieces Section */}
                      {stockByType.SPARE.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold flex items-center gap-2">
                            <Box className="h-4 w-4 text-amber-600" />
                            Spare Pieces
                          </h4>
                          {(() => {
                            const totalSpares = stockByType.SPARE.reduce((sum, e) => sum + (e.piece_count || 0), 0);
                            const pieceLength = stockByType.SPARE[0]?.piece_length_meters || 0;
                            const key = variant.variant_key;
                            const inputValue = spareQuantities[key] || 0;

                            return (
                              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium text-sm">
                                      {totalSpares} pieces available @ {pieceLength}m each
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleCombineSpares(stockByType.SPARE)}
                                      className="gap-1 h-8"
                                    >
                                      <Package2 className="h-3 w-3" />
                                      Combine
                                    </Button>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setSpareQuantities(prev => ({
                                          ...prev,
                                          [key]: Math.max(0, (prev[key] || 0) - 1)
                                        }))}
                                        disabled={inputValue <= 0}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <Input
                                        type="number"
                                        value={inputValue}
                                        onChange={(e) => setSpareQuantities(prev => ({
                                          ...prev,
                                          [key]: Math.min(totalSpares, Math.max(0, parseInt(e.target.value) || 0))
                                        }))}
                                        className="w-16 h-8 text-center"
                                        min="0"
                                        max={totalSpares}
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setSpareQuantities(prev => ({
                                          ...prev,
                                          [key]: Math.min(totalSpares, (prev[key] || 0) + 1)
                                        }))}
                                        disabled={inputValue >= totalSpares}
                                        className="h-8 w-8 p-0"
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        onClick={() => handleAddSpares(variant, stockByType.SPARE)}
                                        disabled={inputValue <= 0}
                                        size="sm"
                                        className="h-8 ml-1"
                                      >
                                        <Check className="h-3 w-3 mr-1" />
                                        Add
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty States */}
      {filteredVariants.length === 0 && availableRolls.length > 0 && (
        <div className="text-center py-8 text-gray-500">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p>No products match your filter</p>
        </div>
      )}

      {availableRolls.length === 0 && productTypeId && (
        <div className="text-center py-8 text-gray-500">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p>No available products for this type</p>
        </div>
      )}
      </div>

      {/* Right side - Selected Items Cart */}
      <div className="w-80 flex-shrink-0">
        <div className="sticky top-4 space-y-4">
          <div className="border rounded-lg bg-white shadow-lg">
            <div className="p-3 border-b bg-blue-50">
              <h4 className="font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Cart ({selectedRolls.length})
                </span>
                {selectedRolls.some(r => r.product_category?.includes('HDPE')) && (
                  <span className="text-xs text-gray-600 font-normal">
                    {selectedRolls
                      .filter(r => r.product_category?.includes('HDPE'))
                      .reduce((sum, r) => sum + (r.length_meters || 0) * (r.quantity || 1), 0)
                      .toFixed(1)}m
                  </span>
                )}
              </h4>
            </div>
            {selectedRolls.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No items selected</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto p-3">
                {selectedRolls.map((roll, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between p-2 bg-gray-50 border rounded hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{roll.brand_name}</div>
                      <div className="text-xs text-gray-600 space-y-0.5">
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            {roll.quantity}x
                          </Badge>
                          {roll.product_category?.includes('HDPE') && (
                            <span className="font-mono">
                              {roll.length_meters}m
                              {roll.stock_type === 'CUT_ROLL' && ' (cut)'}
                            </span>
                          )}
                          {roll.product_category?.includes('Sprinkler') && (
                            <span>
                              {roll.stock_type === 'BUNDLE' && `Bundle ${roll.bundle_size}`}
                              {roll.stock_type === 'SPARE' && `${roll.piece_count} pcs`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveRoll(idx)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0 flex-shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {selectedStock && (selectedStock.stock_type === 'FULL_ROLL' || selectedStock.stock_type === 'CUT_ROLL') && (
        <CutRollDialog
          open={cutDialogOpen}
          onOpenChange={setCutDialogOpen}
          stockId={selectedStock.stock_id}
          pieceId={selectedStock.piece_id}
          stockType={selectedStock.stock_type}
          quantity={selectedStock.quantity}
          lengthPerUnit={selectedStock.length_per_unit}
          totalAvailable={selectedStock.total_available}
          onSuccess={handleDialogSuccess}
        />
      )}

      {selectedStock && selectedStock.stock_type === 'BUNDLE' && (
        <SplitBundleDialog
          open={splitDialogOpen}
          onOpenChange={setSplitDialogOpen}
          stockId={selectedStock.stock_id}
          piecesPerBundle={selectedStock.pieces_per_bundle || 0}
          pieceLength={selectedStock.piece_length_meters || 0}
          onSuccess={handleDialogSuccess}
        />
      )}

      {selectedStock && selectedStock.stock_type === 'SPARE' && (
        <CombineSparesDialog
          open={combineDialogOpen}
          onOpenChange={setCombineDialogOpen}
          stockId={selectedStock.stock_id}
          spareGroups={[{
            spare_id: selectedStock.spare_id || selectedStock.stock_id,
            piece_count: selectedStock.piece_count || 0
          }]}
          pieceLength={selectedStock.piece_length_meters || 0}
          onSuccess={handleDialogSuccess}
        />
      )}
    </div>
  );
};
