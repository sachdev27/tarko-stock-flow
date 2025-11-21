import { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SearchableCombobox } from './SearchableCombobox';
import { X, Package, Scissors, Box, Package2, Plus, TruckIcon } from 'lucide-react';
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
  id: string;
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

interface Customer {
  id: string;
  name: string;
}

interface Transport {
  id: string;
  name: string;
}

interface Vehicle {
  id: string;
  name: string;
}

interface BillTo {
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
  onClearCart: () => void;
  onAddRoll: (roll: any) => void;
  onUpdateRollQuantity: (index: number, quantity: number, dispatchLength?: number) => void;
  productTypes: ProductType[];
  availableRolls: any[];
  onSearchProducts: () => void;
  productTypeRef?: React.RefObject<HTMLDivElement>;
  productSearchRef?: React.RefObject<HTMLDivElement>;
  customerId: string;
  transportId: string;
  customers: Customer[];
  transports: Transport[];
  vehicleId: string;
  billToId: string;
  vehicles: Vehicle[];
  billToList: BillTo[];
  onDispatch: () => void;
  loading: boolean;
}

export const ProductSelectionSection = ({
  productTypeId,
  onProductTypeChange,
  productSearch,
  onProductSearchChange,
  selectedRolls,
  onRemoveRoll,
  onClearCart,
  onAddRoll,
  productTypes,
  availableRolls,
  onSearchProducts,
  productTypeRef,
  productSearchRef,
  customerId,
  transportId,
  customers,
  transports,
  vehicleId,
  billToId,
  vehicles,
  billToList,
  onDispatch,
  loading
}: ProductSelectionProps) => {
  const [cutDialogOpen, setCutDialogOpen] = useState(false);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [combineDialogOpen, setCombineDialogOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockEntry | null>(null);

  // For HDPE: Track number of full rolls to add
  const [fullRollsQuantity, setFullRollsQuantity] = useState<Record<string, number>>({});

  // For Sprinkler: Track bundle quantities
  const [bundleQuantities, setBundleQuantities] = useState<Record<string, number>>({});
  // For Sprinkler: Track spare piece quantities
  const [spareQuantities, setSpareQuantities] = useState<Record<string, number>>({});

  // Group available rolls by product variant
  const groupedVariants = useMemo(() => {
    const variants: Record<string, ProductVariant> = {};

    // Debug: Check if spare_id exists in raw data
    const sparesInRaw = availableRolls.filter(r => r.stock_type === 'SPARE' || r.bundle_type === 'spare');
    if (sparesInRaw.length > 0) {
      console.log('Spare rolls in raw data:', sparesInRaw.slice(0, 2));
    }

    availableRolls.forEach((roll) => {
      const paramStr = JSON.stringify(roll.parameters || {});
      const key = `${roll.brand_name}-${paramStr}`;

      if (!variants[key]) {
        variants[key] = {
          id: roll.product_variant_id,
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
    console.log('=== handleCombineSpares called ===');
    console.log('spares:', spares);
    console.log('spares.length:', spares.length);
    console.log('spare IDs:', spares.map(s => ({ stock_id: s.stock_id, spare_id: s.spare_id, piece_count: s.piece_count })));

    if (spares.length > 0) {
      // Store the first entry for basic info, but keep all entries
      const stockWithAllSpares = {
        ...spares[0],
        allSpares: spares  // Add all spare entries
      };
      console.log('stockWithAllSpares:', stockWithAllSpares);
      setSelectedStock(stockWithAllSpares);
      setCombineDialogOpen(true);
    }
  };

  const handleDialogSuccess = () => {
    onSearchProducts();
    setSelectedStock(null);
  };

  // HDPE: Add full rolls
  const handleAddFullRolls = (variant: ProductVariant, fullRollEntry: StockEntry, available: number) => {
    const quantity = parseInt(fullRollsQuantity[fullRollEntry.stock_id]) || 0;
    if (quantity <= 0 || quantity > available) {
      toast.error(`Please enter a valid quantity (1-${available})`);
      return;
    }

    const roll = {
      id: fullRollEntry.stock_id,
      product_variant_id: variant.id,
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

  // HDPE: Add individual cut roll
  const handleAddCutRoll = (variant: ProductVariant, entry: StockEntry) => {
    const roll = {
      id: entry.stock_id,
      product_variant_id: variant.id,
      piece_id: entry.piece_id,
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
    toast.success(`Added cut piece: ${(entry.length_per_unit || 0).toFixed(1)}m`);
  };

  // Sprinkler: Add bundles
  const handleAddBundles = (variant: ProductVariant, bundleEntries: StockEntry[], size: number, length: number, available: number, compositeKey: string) => {
    // Use the original composite key from bundlesBySize
    const stateKey = `${variant.variant_key}-bundle-${compositeKey}`;
    const rawValue = bundleQuantities[stateKey];
    const quantity = parseInt(String(rawValue || '0')) || 0;

    console.log('=== handleAddBundles Debug ===');
    console.log('variant.variant_key:', variant.variant_key);
    console.log('size:', size, 'length:', length);
    console.log('compositeKey (from param):', compositeKey);
    console.log('stateKey:', stateKey);
    console.log('bundleQuantities:', bundleQuantities);
    console.log('rawValue:', rawValue, 'type:', typeof rawValue);
    console.log('quantity:', quantity);
    console.log('available:', available);

    if (quantity <= 0 || quantity > available) {
      toast.error(`Please enter a valid quantity (1-${available})`);
      return;
    }

    // Use first bundle entry as template
    const firstBundle = bundleEntries[0];
    const roll = {
      id: firstBundle.stock_id,
      product_variant_id: variant.id,
      batch_code: firstBundle.batch_code || '',
      status: 'AVAILABLE',
      stock_type: 'BUNDLE',
      bundle_size: size,
      piece_count: size,
      piece_length_meters: length,
      parameters: variant.parameters,
      brand_name: variant.brand_name,
      product_type_name: variant.product_type_name,
      product_category: variant.product_category,
      quantity
    };

    onAddRoll(roll);
    toast.success(`Added ${quantity} bundle${quantity > 1 ? 's' : ''} of ${size} pieces`);
  };

  // Sprinkler: Add spare pieces
  const handleAddSpares = (variant: ProductVariant, spareEntries: StockEntry[], lengthKey: string, available: number) => {
    const key = `${variant.variant_key}-spare-${lengthKey}`;
    const quantity = parseInt(String(spareQuantities[key])) || 0;

    console.log('handleAddSpares:', { key, spareQuantities, rawValue: spareQuantities[key], quantity, available });
    console.log('spareEntries received:', spareEntries);
    console.log('First entry details:', spareEntries[0]);

    if (quantity <= 0 || quantity > available) {
      toast.error(`Please enter a valid quantity (1-${available} pieces)`);
      return;
    }

    // Each spareEntry represents a GROUP of spare pieces with the same length and piece_count
    // The spare_id is the ID of the sprinkler_spare_pieces record (the group)
    // We need to collect spare_ids, potentially repeating them if we take multiple pieces from one group
    const spare_ids: string[] = [];
    let remaining = quantity;

    for (const entry of spareEntries) {
      if (remaining <= 0) break;

      const piecesFromThisGroup = Math.min(remaining, entry.piece_count || 1);

      // Add this group's spare_id once for each piece we're taking from it
      if (entry.spare_id) {
        for (let i = 0; i < piecesFromThisGroup; i++) {
          spare_ids.push(entry.spare_id);
        }
        remaining -= piecesFromThisGroup;
      } else {
        console.error('Entry missing spare_id:', entry);
      }
    }

    console.log('Collection result:', { spare_ids, length: spare_ids.length, needed: quantity });

    if (spare_ids.length !== quantity) {
      console.error('spare_ids collection failed:', {
        collected: spare_ids.length,
        needed: quantity,
        spare_ids,
        entries: spareEntries
      });
      toast.error(`Unable to collect all spare piece IDs (got ${spare_ids.length}/${quantity})`);
      return;
    }

    const firstSpare = spareEntries[0];
    const roll = {
      id: firstSpare.stock_id,
      product_variant_id: variant.id,
      batch_code: firstSpare.batch_code || '',
      status: 'AVAILABLE',
      stock_type: 'SPARE',
      piece_count: quantity,
      piece_length_meters: firstSpare.piece_length_meters,
      parameters: variant.parameters,
      brand_name: variant.brand_name,
      product_type_name: variant.product_type_name,
      product_category: variant.product_category,
      quantity: 1, // For spares, quantity represents number of pieces
      spare_ids: spare_ids // Array of individual spare piece IDs
    };

    onAddRoll(roll);
    setSpareQuantities(prev => ({ ...prev, [key]: 0 }));
    toast.success(`Added ${quantity} spare piece${quantity > 1 ? 's' : ''}`);
  };

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Left side - Product Selection */}
      <div className="md:col-span-2 space-y-6">
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

            // Group bundles by size AND piece length
            const bundlesBySize = stockByType.BUNDLE.reduce((acc, entry) => {
              const size = entry.pieces_per_bundle || 0;
              const length = entry.piece_length_meters || 0;
              const key = `${size}-${length}`;
              if (!acc[key]) acc[key] = [];
              acc[key].push(entry);
              return acc;
            }, {} as Record<string, StockEntry[]>);

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
                            const inputValue = fullRollsQuantity[entry.stock_id] || '';
                            // Calculate how many are already in cart
                            const inCart = selectedRolls
                              .filter(r => r.id === entry.stock_id && !r.piece_id)
                              .reduce((sum, r) => sum + (r.quantity || 0), 0);
                            const available = entry.quantity - inCart;
                            return (
                              <div key={entry.stock_id} className="p-3 bg-green-50 rounded-lg border border-green-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium text-base">
                                      {available} × ({entry.length_per_unit}m)
                                    </div>
                                    <div className="text-xs text-gray-600">Total: {totalMeters.toFixed(0)}m</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleCutRoll(entry)}
                                      className="gap-1 h-8"
                                      disabled={available <= 0}
                                    >
                                      <Scissors className="h-3 w-3" />
                                      Cut
                                    </Button>
                                    <Input
                                      type="number"
                                      value={inputValue}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') {
                                          setFullRollsQuantity(prev => ({ ...prev, [entry.stock_id]: '' }));
                                        } else {
                                          const num = parseInt(val);
                                          if (!isNaN(num) && num >= 0) {
                                            setFullRollsQuantity(prev => ({
                                              ...prev,
                                              [entry.stock_id]: Math.min(available, num)
                                            }));
                                          }
                                        }
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      placeholder="0"
                                      className="w-20 h-8"
                                      min="0"
                                      max={available}
                                    />
                                    <span className="text-xs text-gray-500">/ {available}</span>
                                    <Button
                                      onClick={() => {
                                        const qty = parseInt(inputValue as string) || 0;
                                        if (qty > 0 && qty <= available) {
                                          handleAddFullRolls(variant, entry, available);
                                          setFullRollsQuantity(prev => ({ ...prev, [entry.stock_id]: '' }));
                                        }
                                      }}
                                      disabled={!inputValue || parseInt(String(inputValue)) <= 0 || available <= 0}
                                      size="sm"
                                      className="h-8"
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Add
                                    </Button>
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
                          <h4 className="font-semibold flex items-center gap-2">
                            <Scissors className="h-4 w-4 text-orange-600" />
                            Cut Pieces ({stockByType.CUT_ROLL.length})
                          </h4>
                          <div className="space-y-1">
                            {stockByType.CUT_ROLL.map(entry => {
                              const length = parseFloat(entry.length_per_unit) || 0;
                              const uniqueKey = entry.piece_id || entry.stock_id;
                              const alreadyInCart = selectedRolls.some(r =>
                                (r.piece_id && r.piece_id === entry.piece_id) ||
                                (!r.piece_id && r.id === entry.stock_id)
                              );
                              return (
                                <div
                                  key={uniqueKey}
                                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                                    alreadyInCart
                                      ? 'bg-green-50 border-green-300'
                                      : 'bg-orange-50 border-orange-200 hover:bg-orange-100'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <Badge variant="secondary" className="text-xs px-2">CUT</Badge>
                                    <span className="font-mono text-lg font-bold text-orange-700">{length.toFixed(1)}m</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleCutRoll(entry)}
                                      className="gap-1 h-7"
                                      disabled={alreadyInCart}
                                    >
                                      <Scissors className="h-3 w-3" />
                                      Cut
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleAddCutRoll(variant, entry)}
                                      disabled={alreadyInCart}
                                      className="h-7 px-2"
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      {alreadyInCart ? 'Added' : 'Add'}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
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
                            .sort(([a], [b]) => {
                              const [sizeA] = a.split('-').map(Number);
                              const [sizeB] = b.split('-').map(Number);
                              return sizeB - sizeA;
                            })
                            .map(([key, entries]) => {
                              const [size, length] = key.split('-');
                              const totalBundles = entries.reduce((sum, e) => sum + e.quantity, 0);
                              const firstEntry = entries[0];
                              const stateKey = `${variant.variant_key}-bundle-${key}`;
                              const inputValue = bundleQuantities[stateKey] || '';

                              console.log('=== Bundle Display Debug ===');
                              console.log('key from bundlesBySize:', key);
                              console.log('size:', size, 'length:', length);
                              console.log('variant.variant_key:', variant.variant_key);
                              console.log('stateKey:', stateKey);
                              console.log('inputValue:', inputValue, 'type:', typeof inputValue);

                              // Calculate how many are already in cart
                              const sizeNum = Number(size);
                              const lengthNum = Number(length);
                              const inCart = selectedRolls
                                .filter(r => {
                                  if (r.stock_type !== 'BUNDLE') return false;
                                  if (r.bundle_size !== sizeNum) return false;
                                  // Check if brand matches
                                  if (r.brand_name !== variant.brand_name) return false;
                                  // Check if parameters match
                                  if (JSON.stringify(r.parameters) !== JSON.stringify(variant.parameters)) return false;
                                  // Compare piece length with small tolerance for floating point
                                  const cartLength = Number(r.piece_length_meters);
                                  return Math.abs(cartLength - lengthNum) < 0.01;
                                })
                                .reduce((sum, r) => sum + (r.quantity || 0), 0);
                              const available = totalBundles - inCart;

                              return (
                                <div key={key} className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="font-medium text-base">
                                        {available} × ({size})
                                      </div>
                                      <div className="text-xs text-gray-600">
                                        {length}m per piece
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleSplitBundle(firstEntry)}
                                        className="gap-1 h-8"
                                        disabled={available <= 0}
                                      >
                                        <Scissors className="h-3 w-3" />
                                        Split
                                      </Button>
                                      <Input
                                        type="number"
                                        value={inputValue}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          console.log('=== Bundle Input onChange ===');
                                          console.log('val:', val, 'type:', typeof val);
                                          console.log('stateKey:', stateKey);

                                          if (val === '') {
                                            setBundleQuantities(prev => ({ ...prev, [stateKey]: '' }));
                                          } else {
                                            const num = parseInt(val);
                                            console.log('parsed num:', num, 'available:', available);
                                            if (!isNaN(num) && num >= 0) {
                                              const clamped = Math.min(available, num);
                                              console.log('Setting to:', clamped);
                                              setBundleQuantities(prev => ({
                                                ...prev,
                                                [stateKey]: clamped
                                              }));
                                            }
                                          }
                                        }}
                                        onFocus={(e) => e.target.select()}
                                        placeholder="0"
                                        className="w-20 h-8"
                                        min="0"
                                        max={available}
                                      />
                                      <span className="text-xs text-gray-500">/ {available}</span>
                                      <Button
                                        onClick={() => {
                                          console.log('=== Bundle Add Button Click ===');
                                          console.log('stateKey:', stateKey);
                                          console.log('inputValue:', inputValue);
                                          console.log('size:', size, 'length:', length);
                                          console.log('original key:', key);

                                          const qty = parseInt(inputValue as string) || 0;
                                          console.log('qty:', qty, 'available:', available);

                                          if (qty > 0 && qty <= available) {
                                            // Pass the original key instead of reconstructing from size/length
                                            handleAddBundles(variant, entries, Number(size), Number(length), available, key);
                                            setBundleQuantities(prev => ({ ...prev, [stateKey]: '' }));
                                          } else {
                                            console.log('Validation failed: qty <= 0 or qty > available');
                                          }
                                        }}
                                        disabled={!inputValue || parseInt(String(inputValue)) <= 0 || available <= 0}
                                        size="sm"
                                        className="h-8"
                                      >
                                        <Plus className="h-4 w-4 mr-1" />
                                        Add
                                      </Button>
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
                            // Group spares by piece length
                            const sparesByLength = stockByType.SPARE.reduce((acc, entry) => {
                              const length = entry.piece_length_meters || 0;
                              if (!acc[length]) acc[length] = [];
                              acc[length].push(entry);
                              return acc;
                            }, {} as Record<number, StockEntry[]>);

                            return Object.entries(sparesByLength)
                              .sort(([a], [b]) => Number(b) - Number(a))
                              .map(([length, entries]) => {
                                const totalSpares = entries.reduce((sum, e) => sum + (e.piece_count || 0), 0);
                                const key = `${variant.variant_key}-spare-${length}`;
                                const inputValue = spareQuantities[key] || '';
                                // Calculate how many are already in cart
                                const inCart = selectedRolls
                                  .filter(r => {
                                    if (r.stock_type !== 'SPARE') return false;
                                    if (r.piece_length_meters !== Number(length)) return false;
                                    // Check if brand matches
                                    if (r.brand_name !== variant.brand_name) return false;
                                    // Check if parameters match
                                    if (JSON.stringify(r.parameters) !== JSON.stringify(variant.parameters)) return false;
                                    return true;
                                  })
                                  .reduce((sum, r) => sum + (r.piece_count || 0), 0);
                                const available = totalSpares - inCart;

                                return (
                                  <div key={length} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <div className="font-medium text-base">
                                          {available} pcs
                                        </div>
                                        <div className="text-xs text-gray-600">
                                          {length}m per piece
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleCombineSpares(entries)}
                                          className="gap-1 h-8"
                                          disabled={available <= 0}
                                        >
                                          <Package2 className="h-3 w-3" />
                                          Combine
                                        </Button>
                                        <Input
                                          type="number"
                                          value={inputValue}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') {
                                              setSpareQuantities(prev => ({ ...prev, [key]: '' }));
                                            } else {
                                              const num = parseInt(val);
                                              if (!isNaN(num) && num >= 0) {
                                                setSpareQuantities(prev => ({
                                                  ...prev,
                                                  [key]: Math.min(available, num)
                                                }));
                                              }
                                            }
                                          }}
                                          onFocus={(e) => e.target.select()}
                                          placeholder="0"
                                          className="w-20 h-8"
                                          min="0"
                                          max={available}
                                        />
                                        <span className="text-xs text-gray-500">/ {available}</span>
                                        <Button
                                          onClick={() => {
                                            console.log('Add Spares button clicked:', {
                                              key,
                                              inputValue,
                                              spareQuantitiesState: spareQuantities,
                                              available,
                                              length,
                                              variantKey: variant.variant_key
                                            });
                                            handleAddSpares(variant, entries, length, available);
                                          }}
                                          disabled={!inputValue || parseInt(String(inputValue)) <= 0 || available <= 0}
                                          size="sm"
                                          className="h-8"
                                        >
                                          <Plus className="h-4 w-4 mr-1" />
                                          Add
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              });
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

      {/* Right side - Cart */}
      <div className="space-y-6">
        <Card className="bg-gray-50">
          <CardHeader>
            <h4 className="font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Cart ({selectedRolls.length} {selectedRolls.length === 1 ? 'item' : 'items'})
              </span>
              {selectedRolls.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearCart}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear Cart
                </Button>
              )}
            </h4>
          </CardHeader>
          <CardContent>
            {selectedRolls.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>Cart is empty</p>
                <p className="text-sm">Select quantity from products</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedRolls.map((roll, idx) => (
                  <div key={idx} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-sm">
                          {roll.product_type_name || (roll.product_category?.includes('HDPE') ? 'HDPE Pipe' : 'Sprinkler Pipe')}
                        </div>
                        <div className="text-xs font-medium text-gray-700">{roll.brand_name}</div>
                        <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-1">
                          {Object.entries(roll.parameters || {}).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {key}: {value}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onRemoveRoll(idx)}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-sm bg-slate-50 p-2 rounded">
                      <span className="text-muted-foreground">
                        {roll.stock_type === 'CUT_ROLL' && 'Cut Roll'}
                        {roll.stock_type === 'FULL_ROLL' && (roll.product_category?.includes('Sprinkler') ? 'Bundles' : 'Rolls')}
                        {roll.stock_type === 'BUNDLE' && 'Bundles'}
                        {roll.stock_type === 'SPARE' && 'Spare Pieces'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {roll.stock_type === 'CUT_ROLL' ? (
                            <span>{(parseFloat(roll.length_meters) || 0).toFixed(1)}m</span>
                          ) : (
                            <>
                              {roll.quantity}x
                              {roll.product_category?.includes('HDPE') && roll.stock_type === 'FULL_ROLL' && (
                                <span className="ml-1">({(parseFloat(roll.length_meters) || 0).toFixed(1)}m)</span>
                              )}
                              {roll.stock_type === 'BUNDLE' && (
                                <span className="ml-1">
                                  {roll.bundle_size} pcs
                                  {roll.piece_length_meters && (
                                    <span className="text-xs text-muted-foreground ml-1">
                                      @ {Number(roll.piece_length_meters).toFixed(1)}m
                                    </span>
                                  )}
                                </span>
                              )}
                              {roll.stock_type === 'SPARE' && (
                                <span className="ml-1">
                                  {roll.piece_count} pcs
                                  {roll.piece_length_meters && (
                                    <span className="text-xs text-muted-foreground ml-1">
                                      @ {Number(roll.piece_length_meters).toFixed(1)}m
                                    </span>
                                  )}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Section */}
        {selectedRolls.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
                  <div className="flex flex-col items-center">
                    <div className="text-gray-600">Total Items</div>
                    <div className="font-bold text-lg mt-auto">{selectedRolls.length}</div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-gray-600">Full Rolls</div>
                    <div className="font-bold text-lg mt-auto">
                      {selectedRolls.filter(r => r.stock_type === 'FULL_ROLL').reduce((sum, r) => sum + (r.quantity || 1), 0)}
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-gray-600">Cut Rolls</div>
                    <div className="font-bold text-lg mt-auto">
                      {selectedRolls.filter(r => r.stock_type === 'CUT_ROLL').length}
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-gray-600">Bundles</div>
                    <div className="font-bold text-lg mt-auto">
                      {selectedRolls.filter(r => r.stock_type === 'BUNDLE').reduce((sum, r) => sum + (r.quantity || 1), 0)}
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-gray-600">Spare Pcs</div>
                    <div className="font-bold text-lg mt-auto">
                      {selectedRolls.filter(r => r.stock_type === 'SPARE').reduce((sum, r) => sum + (r.piece_count || 0), 0)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mt-4 pt-4 border-t border-blue-300">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 font-medium">Customer:</span>
                    <span className="font-semibold">
                      {customers.find(c => c.id === customerId)?.name || '-'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 font-medium">Transport:</span>
                    <span className="font-semibold">
                      {transports.find(t => t.id === transportId)?.name || '-'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 font-medium">Vehicle:</span>
                    <span className="font-semibold">
                      {vehicles.find(v => v.id === vehicleId)?.driver_name || '-'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600 font-medium">Bill To:</span>
                    <span className="font-semibold">
                      {billToList.find(b => b.id === billToId)?.name || '-'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dispatch Button */}
        {selectedRolls.length > 0 && (
          <div className="flex gap-2 justify-end pt-4">
            <Button
              onClick={onDispatch}
              disabled={loading || !customerId || selectedRolls.length === 0}
              size="lg"
              className="gap-2"
            >
              <TruckIcon className="h-4 w-4" />
              {loading ? 'Dispatching...' : 'Dispatch Sale'}
            </Button>
          </div>
        )}
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
          spareGroups={
            (selectedStock as any).allSpares
              ? (selectedStock as any).allSpares.map((spare: StockEntry) => {
                  const group = {
                    spare_id: spare.spare_id || spare.stock_id,
                    piece_count: spare.piece_count || 0
                  };
                  console.log('Mapping spare to group:', { spare, group });
                  return group;
                })
              : [{
                  spare_id: selectedStock.spare_id || selectedStock.stock_id,
                  piece_count: selectedStock.piece_count || 0
                }]
          }
          pieceLength={selectedStock.piece_length_meters || 0}
          onSuccess={handleDialogSuccess}
        />
      )}
    </div>
  );
};
