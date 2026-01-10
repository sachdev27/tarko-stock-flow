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
  piece_ids?: string[];
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
  const [parameterKeysFilter, setParameterKeysFilter] = useState<string[] | null>(null);

  // For HDPE: Track number of full rolls to add
  const [fullRollsQuantity, setFullRollsQuantity] = useState<Record<string, number>>({});
  // For HDPE: Track number of cut pieces to add
  const [cutPiecesQuantity, setCutPiecesQuantity] = useState<Record<string, number>>({});

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
        piece_ids: roll.piece_ids,
        spare_id: roll.spare_id,
        spare_ids: roll.spare_ids, // Array of individual spare piece IDs from backend
        total_available: roll.total_available || roll.length_meters,
        product_type_name: roll.product_type_name,
        batch_code: roll.batch_code
      });
    });

    return Object.values(variants);
  }, [availableRolls]);

  const filteredVariants = useMemo(() => {
    if (!productSearch.trim()) {
      setParameterKeysFilter(null);
      return groupedVariants;
    }

    const searchLower = productSearch.toLowerCase().trim();

    // Advanced search patterns:
    // 1. "32,6,10 astral" -> OD=32 AND PN=6 AND PE=10, AND brand contains "astral"
    // 2. "32,6,10" -> OD=32 AND PN=6 AND PE=10 (or OD=32 AND PN=6 AND Type=C)
    // 3. "(OD,PN,PE)" -> show only these parameter keys

    // Check for parameter key filter pattern: (KEY1,KEY2,KEY3)
    const keyFilterMatch = searchLower.match(/^\(([^)]+)\)$/);
    if (keyFilterMatch) {
      const allowedKeys = keyFilterMatch[1].split(',').map(k => k.trim().toUpperCase());
      setParameterKeysFilter(allowedKeys);
      return groupedVariants;
    }

    setParameterKeysFilter(null);

    // Check for combined pattern: "numbers brand" or "numbers"
    const parts = searchLower.split(/\s+/).filter(Boolean);

    if (parts.length === 0) return groupedVariants;

    // First part could be comma-separated numbers (parameter values)
    const firstPart = parts[0];
    const hasCommas = firstPart.includes(',');

    if (hasCommas) {
      // Extract numbers and brand pattern
      const searchValues = firstPart.split(',').map(n => n.trim()).filter(Boolean);
      const brandPattern = parts.slice(1).join(' '); // Rest is brand search

      // Sort results with prioritization based on parameter order
      const matchedVariants = groupedVariants.filter(variant => {
        // Determine if HDPE or Sprinkler based on product type
        const isHDPE = variant.product_category?.includes('HDPE') || variant.product_type_name?.includes('HDPE');
        const isSprinkler = variant.product_category?.includes('Sprinkler') || variant.product_type_name?.includes('Sprinkler');

        // Define expected parameter order based on product type
        const expectedOrder = isHDPE ? ['OD', 'PN', 'PE'] : isSprinkler ? ['OD', 'PN', 'TYPE'] : ['OD', 'PN'];

        // Get parameter values in a normalized way
        const paramEntries = Object.entries(variant.parameters).map(([key, value]) => ({
          key: key.toUpperCase(),
          value: String(value).toLowerCase()
        }));

        // Check if parameters match in the expected order
        const matchesInOrder = searchValues.every((searchVal, index) => {
          if (index >= expectedOrder.length) return false;

          const expectedKey = expectedOrder[index];
          const param = paramEntries.find(p => p.key === expectedKey);

          if (!param) return false;

          // Check for exact match or match with common units
          return param.value === searchVal ||
                 param.value === `${searchVal}mm` ||
                 param.value === `${searchVal}bar` ||
                 param.value.startsWith(`${searchVal}mm`) ||
                 param.value === searchVal.replace(/mm$/, '') ||
                 param.value === searchVal.replace(/bar$/, '') ||
                 param.value.toLowerCase() === searchVal; // For Type parameter (e.g., 'L', 'C')
        });

        // If brand pattern provided, also check brand
        if (brandPattern) {
          const brandMatch = variant.brand_name?.toLowerCase().includes(brandPattern);
          return matchesInOrder && brandMatch;
        }

        return matchesInOrder;
      });

      // Sort matched variants: exact matches first (all params match in order)
      return matchedVariants.sort((a, b) => {
        const aIsHDPE = a.product_category?.includes('HDPE') || a.product_type_name?.includes('HDPE');
        const bIsHDPE = b.product_category?.includes('HDPE') || b.product_type_name?.includes('HDPE');

        // Calculate match score based on order
        const getMatchScore = (variant: ProductVariant) => {
          const isHDPE = variant.product_category?.includes('HDPE') || variant.product_type_name?.includes('HDPE');
          const expectedOrder = isHDPE ? ['OD', 'PN', 'PE'] : ['OD', 'PN', 'TYPE'];

          let score = 0;
          searchValues.forEach((searchVal, index) => {
            if (index < expectedOrder.length) {
              const expectedKey = expectedOrder[index];
              const paramValue = String(variant.parameters[expectedKey] || '').toLowerCase();

              if (paramValue === searchVal ||
                  paramValue === `${searchVal}mm` ||
                  paramValue === `${searchVal}bar` ||
                  paramValue.replace(/mm$/, '') === searchVal ||
                  paramValue.replace(/bar$/, '') === searchVal) {
                score += (expectedOrder.length - index); // Higher weight for earlier matches
              }
            }
          });

          return score;
        };

        const scoreA = getMatchScore(a);
        const scoreB = getMatchScore(b);

        return scoreB - scoreA; // Higher scores first
      });
    }

    // Fallback to original search (brand or any parameter)
    return groupedVariants.filter(variant => {
      const brandName = variant.brand_name?.toLowerCase() || '';
      const params = JSON.stringify(variant.parameters).toLowerCase();
      return searchLower.split(/\s+/).every(term =>
        brandName.includes(term) || params.includes(term)
      );
    });
  }, [groupedVariants, productSearch]);

  const handleCutRoll = (entry: StockEntry) => {
    // For CUT_ROLL, we need a specific piece_id
    // If piece_ids array exists, use the first one
    if (entry.stock_type === 'CUT_ROLL' && entry.piece_ids && entry.piece_ids.length > 0) {
      setSelectedStock({
        ...entry,
        piece_id: entry.piece_ids[0], // Use the first piece_id from the array
        quantity: 1 // Set quantity to 1 since we're cutting a single piece
      });
    } else {
      setSelectedStock(entry);
    }
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
  const handleAddFullRolls = (variant: ProductVariant, fullRollEntry: StockEntry, available: number, rollGroup?: StockEntry[]) => {
    const quantity = parseInt(fullRollsQuantity[fullRollEntry.stock_id]) || 0;
    if (quantity <= 0 || quantity > available) {
      toast.error(`Please enter a valid quantity (1-${available})`);
      return;
    }

    // If we have a roll group (aggregated rolls), we need to distribute the quantity across all entries
    if (rollGroup && rollGroup.length > 0) {
      let remainingQty = quantity;

      for (const entry of rollGroup) {
        if (remainingQty <= 0) break;

        // Calculate how many are already in cart from this specific entry
        const inCart = selectedRolls
          .filter(r => r.id === entry.stock_id && !r.piece_id)
          .reduce((sum, r) => sum + (r.quantity || 0), 0);
        const entryAvailable = entry.quantity - inCart;

        // Take as many as we can from this entry
        const qtyFromThisEntry = Math.min(remainingQty, entryAvailable);

        if (qtyFromThisEntry > 0) {
          const roll = {
            id: entry.stock_id,
            product_variant_id: variant.id,
            batch_code: entry.batch_code || '',
            length_meters: entry.length_per_unit || 0,
            status: 'AVAILABLE',
            stock_type: 'FULL_ROLL',
            parameters: variant.parameters,
            brand_name: variant.brand_name,
            product_type_name: variant.product_type_name,
            product_category: variant.product_category,
            quantity: qtyFromThisEntry
          };

          onAddRoll(roll);
          remainingQty -= qtyFromThisEntry;
        }
      }

      setFullRollsQuantity(prev => ({ ...prev, [fullRollEntry.stock_id]: 0 }));
      toast.success(`Added ${quantity} full roll${quantity > 1 ? 's' : ''}`);
    } else {
      // Single entry (original behavior)
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
    }
  };

  // HDPE: Add cut pieces (can add multiple from a group)
  const handleAddCutPieces = (variant: ProductVariant, entry: StockEntry, available: number) => {
    const stateKey = `${entry.stock_id}-${entry.length_per_unit}`;
    const quantity = parseInt(String(cutPiecesQuantity[stateKey] || '0')) || 0;

    if (quantity <= 0 || quantity > available) {
      toast.error('Invalid quantity');
      return;
    }

    // Get piece IDs that aren't already in cart
    const pieceIds = entry.piece_ids || [];
    const availablePieceIds = pieceIds.filter(pieceId =>
      !selectedRolls.some(r => r.piece_id === pieceId)
    );

    if (availablePieceIds.length < quantity) {
      toast.error(`Only ${availablePieceIds.length} pieces available`);
      return;
    }

    // Add as a single cart item with the quantity, storing all piece_ids
    const roll = {
      id: entry.stock_id,
      product_variant_id: variant.id,
      piece_ids: availablePieceIds.slice(0, quantity), // Store array of piece_ids being added
      batch_code: entry.batch_code || '',
      length_meters: entry.length_per_unit || 0,
      status: 'AVAILABLE',
      stock_type: 'CUT_ROLL',
      parameters: variant.parameters,
      brand_name: variant.brand_name,
      product_type_name: variant.product_type_name,
      product_category: variant.product_category,
      quantity: quantity
    };
    onAddRoll(roll);

    setCutPiecesQuantity(prev => ({ ...prev, [stateKey]: 0 }));
    toast.success(`Added ${quantity} cut piece${quantity > 1 ? 's' : ''} (${(entry.length_per_unit || 0).toFixed(1)}m each)`);
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
    console.log('available (passed from UI):', available);
    console.log('bundleEntries:', bundleEntries);
    console.log('bundleEntries.length:', bundleEntries.length);
    console.log('selectedRolls:', selectedRolls);

    if (quantity <= 0 || quantity > available) {
      toast.error(`Please enter a valid quantity (1-${available})`);
      return;
    }

    // Distribute bundles across multiple stock entries if needed
    let remainingQty = quantity;
    const rollsToAdd = [];

    for (const entry of bundleEntries) {
      if (remainingQty <= 0) break;

      // Calculate how many are already in cart from this specific entry
      // Must match: stock_id, stock_type, bundle_size, and piece_length
      const inCart = selectedRolls
        .filter(r => {
          if (r.id !== entry.stock_id) return false;
          if (r.stock_type !== 'BUNDLE') return false;
          if (r.bundle_size !== size) return false;
          // Compare piece length with small tolerance for floating point
          const cartLength = Number(r.piece_length_meters || 0);
          const entryLength = Number(length);
          return Math.abs(cartLength - entryLength) < 0.01;
        })
        .reduce((sum, r) => sum + (r.quantity || 0), 0);
      const entryAvailable = entry.quantity - inCart;

      console.log(`Entry ${entry.stock_id}: quantity=${entry.quantity}, inCart=${inCart}, available=${entryAvailable}, remainingQty=${remainingQty}`);

      // Take as many as we can from this entry
      const qtyFromThisEntry = Math.min(remainingQty, entryAvailable);

      if (qtyFromThisEntry > 0) {
        const roll = {
          id: entry.stock_id,
          product_variant_id: variant.id,
          batch_code: entry.batch_code || '',
          status: 'AVAILABLE',
          stock_type: 'BUNDLE',
          bundle_size: size,
          piece_count: size,
          piece_length_meters: length,
          parameters: variant.parameters,
          brand_name: variant.brand_name,
          product_type_name: variant.product_type_name,
          product_category: variant.product_category,
          quantity: qtyFromThisEntry
        };

        rollsToAdd.push(roll);
        remainingQty -= qtyFromThisEntry;
      }
    }

    // Add all rolls at once to avoid state batching issues
    rollsToAdd.forEach(roll => onAddRoll(roll));

    setBundleQuantities(prev => ({ ...prev, [stateKey]: '' }));
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

    // Each spareEntry has spare_ids array with individual piece IDs (foundational model)
    // We need to collect the exact unique IDs from the spare_ids arrays
    const spare_ids: string[] = [];
    let remaining = quantity;

    for (const entry of spareEntries) {
      if (remaining <= 0) break;

      const piecesFromThisGroup = Math.min(remaining, entry.piece_count || 1);

      // Use individual piece IDs from spare_ids array (each physical piece has unique ID)
      if (entry.spare_ids && entry.spare_ids.length > 0) {
        // Take the required number of unique IDs from this entry's spare_ids array
        const idsToTake = entry.spare_ids.slice(0, piecesFromThisGroup);
        spare_ids.push(...idsToTake);
        remaining -= idsToTake.length;
      } else if (entry.spare_id) {
        // Fallback for legacy single spare_id (shouldn't happen with new model)
        for (let i = 0; i < piecesFromThisGroup; i++) {
          spare_ids.push(entry.spare_id);
        }
        remaining -= piecesFromThisGroup;
      } else {
        console.error('Entry missing spare_ids:', entry);
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
          <Label>Advanced Search</Label>
          <Input
            value={productSearch}
            onChange={(e) => onProductSearchChange(e.target.value)}
            placeholder="e.g., 63,6 or 32,6,10 astral"
            className="w-full font-mono"
          />
          <p className="text-xs text-gray-500 mt-1">
            {filteredVariants.length} variant{filteredVariants.length !== 1 ? 's' : ''} •
            HDPE: <span className="font-mono">OD,PN,PE</span> • Sprinkler: <span className="font-mono">OD,PN,Type</span>
          </p>
        </div>
      </div>

      {/* Product Variants List */}
      {productTypeId && filteredVariants.length > 0 && (
        <div className="space-y-4">
          {filteredVariants.map((variant) => {
            const stockByType = {
              FULL_ROLL: variant.stock_entries.filter(e => e.stock_type === 'FULL_ROLL'),
              CUT_ROLL: variant.stock_entries.filter(e => e.stock_type === 'CUT_ROLL'),
              BUNDLE: variant.stock_entries.filter(e => e.stock_type === 'BUNDLE'),
              SPARE: variant.stock_entries.filter(e => e.stock_type === 'SPARE')
            };

            // Group bundles by size AND piece length (normalize length to number)
            const bundlesBySize = stockByType.BUNDLE.reduce((acc, entry) => {
              const size = entry.pieces_per_bundle || 0;
              const length = Number(entry.piece_length_meters || 0);
              const key = `${size}-${length}`;
              if (!acc[key]) acc[key] = [];
              acc[key].push(entry);
              return acc;
            }, {} as Record<string, StockEntry[]>);

            // Group full rolls by length (normalize to handle 500 vs 500.0)
            const fullRollsByLength = stockByType.FULL_ROLL.reduce((acc, entry) => {
              const length = Number(entry.length_per_unit || 0);
              if (!acc[length]) acc[length] = [];
              acc[length].push(entry);
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
                      .filter(([key]) => {
                        // If parameter key filter is active, only show those keys
                        if (parameterKeysFilter && parameterKeysFilter.length > 0) {
                          return parameterKeysFilter.includes(key.toUpperCase());
                        }
                        return true;
                      })
                      .sort(([keyA], [keyB]) => {
                        const order = ['OD', 'PN', 'PE', 'TYPE', 'outer_diameter', 'pressure_class', 'material'];
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
                      {Object.keys(fullRollsByLength).length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold flex items-center gap-2">
                              <Box className="h-4 w-4 text-green-600" />
                              Full Rolls
                            </h4>
                          </div>
                          {Object.entries(fullRollsByLength)
                            .sort(([a], [b]) => Number(b) - Number(a))
                            .map(([lengthKey, rollGroup]) => {
                              const length = Number(lengthKey);
                              const totalQuantity = rollGroup.reduce((sum, r) => sum + r.quantity, 0);
                              const totalMeters = totalQuantity * length;

                              // Use first entry's stock_id for the input key
                              const firstEntry = rollGroup[0];
                              const inputValue = fullRollsQuantity[firstEntry.stock_id] || '';

                              // Calculate how many are already in cart from ALL entries in this group
                              const inCart = selectedRolls
                                .filter(r => rollGroup.some(entry => entry.stock_id === r.id) && !r.piece_id)
                                .reduce((sum, r) => sum + (r.quantity || 0), 0);
                              const available = totalQuantity - inCart;

                              return (
                                <div key={`roll-${length}`} className="p-3 bg-green-50 rounded-lg border border-green-200">
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="font-medium text-base">
                                        {available} × ({length}m)
                                      </div>
                                      <div className="text-xs text-gray-600">Total: {(available * length).toFixed(0)}m</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleCutRoll(firstEntry)}
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
                                            setFullRollsQuantity(prev => ({ ...prev, [firstEntry.stock_id]: '' }));
                                          } else {
                                            const num = parseInt(val);
                                            if (!isNaN(num) && num >= 0) {
                                              setFullRollsQuantity(prev => ({
                                                ...prev,
                                                [firstEntry.stock_id]: Math.min(available, num)
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
                                            handleAddFullRolls(variant, firstEntry, available, rollGroup);
                                            setFullRollsQuantity(prev => ({ ...prev, [firstEntry.stock_id]: '' }));
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
                            })
                          }
                        </div>
                      )}

                      {/* Cut Pieces Section - Grouped by length with quantity input */}
                      {stockByType.CUT_ROLL.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-semibold flex items-center gap-2">
                            <Scissors className="h-4 w-4 text-orange-600" />
                            Cut Pieces
                          </h4>
                          <div className="space-y-1">
                            {stockByType.CUT_ROLL.map(entry => {
                              const length = parseFloat(entry.length_per_unit) || 0;
                              const quantity = entry.quantity || 1;
                              const stateKey = `${entry.stock_id}-${entry.length_per_unit}`;
                              const uniqueKey = entry.piece_ids ? entry.piece_ids.join(',') : entry.stock_id;

                              console.log('DEBUG Cut Entry:', {
                                length,
                                quantity,
                                stock_id: entry.stock_id,
                                piece_ids: entry.piece_ids,
                                piece_ids_length: entry.piece_ids?.length,
                                entry
                              });

                              // Count how many pieces from this group are already in cart
                              const pieceIds = entry.piece_ids || [];
                              const cutRollsInCart = selectedRolls.filter(r => r.stock_type === 'CUT_ROLL');
                              console.log('DEBUG Cut Rolls in Cart:', cutRollsInCart);

                              const inCartPieceIds = cutRollsInCart.flatMap(r => {
                                // Handle both single piece_id and array of piece_ids
                                if (r.piece_ids && Array.isArray(r.piece_ids)) {
                                  console.log('Found piece_ids array in cart item:', r.piece_ids.length);
                                  return r.piece_ids;
                                } else if (r.piece_id) {
                                  console.log('Found single piece_id in cart item:', r.piece_id);
                                  return [r.piece_id];
                                }
                                console.log('No piece_ids found in cart item:', r);
                                return [];
                              });
                              const inCartCount = pieceIds.filter(pieceId =>
                                inCartPieceIds.includes(pieceId)
                              ).length;
                              const available = quantity - inCartCount;

                              console.log('DEBUG Availability:', {
                                pieceIds_count: pieceIds.length,
                                inCartCount,
                                available,
                                inCartPieceIds_count: inCartPieceIds.length,
                                selectedRolls_cut: selectedRolls.filter(r => r.stock_type === 'CUT_ROLL'),
                                selectedRolls_count: selectedRolls.length
                              });

                              const inputValue = cutPiecesQuantity[stateKey] || '';

                              return (
                                <div
                                  key={uniqueKey}
                                  className="flex items-center justify-between p-3 rounded-lg border bg-orange-50 border-orange-200"
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <Scissors className="h-5 w-5 text-orange-600" />
                                    <div>
                                      <div className="font-mono text-base font-bold text-orange-700">{length.toFixed(1)}m</div>
                                      <div className="text-sm text-muted-foreground">
                                        {available} of {quantity} available
                                      </div>
                                    </div>
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
                                    <Input
                                      type="number"
                                      value={inputValue}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '') {
                                          setCutPiecesQuantity(prev => ({ ...prev, [stateKey]: '' }));
                                        } else {
                                          const num = parseInt(val);
                                          if (!isNaN(num) && num >= 0) {
                                            setCutPiecesQuantity(prev => ({
                                              ...prev,
                                              [stateKey]: Math.min(available, num)
                                            }));
                                          }
                                        }
                                      }}
                                      onFocus={(e) => e.target.select()}
                                      placeholder="0"
                                      className="w-20 h-8"
                                      min="0"
                                      max={available}
                                      disabled={available <= 0}
                                    />
                                    <span className="text-xs text-gray-500">/ {available}</span>
                                    <Button
                                      onClick={() => {
                                        const qty = parseInt(inputValue as string) || 0;
                                        if (qty > 0 && qty <= available) {
                                          handleAddCutPieces(variant, entry, available);
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
                            // Group spares by piece length (normalize to number)
                            const sparesByLength = stockByType.SPARE.reduce((acc, entry) => {
                              const length = Number(entry.piece_length_meters || 0);
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
                                    // Normalize both lengths for comparison
                                    const cartLength = Number(r.piece_length_meters || 0);
                                    const targetLength = Number(length);
                                    if (Math.abs(cartLength - targetLength) >= 0.01) return false;
                                    // Check if product variant matches
                                    if (r.product_variant_id !== variant.id) return false;
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
                Cart
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
                {(() => {
                  // Group rolls for display by product variant + stock type + specs
                  const grouped = selectedRolls.reduce((acc, roll, idx) => {
                    let key: string;
                    if (roll.stock_type === 'BUNDLE') {
                      // Normalize piece_length_meters to avoid 6.0 vs 6 issues
                      const normalizedLength = Number(roll.piece_length_meters || 0);
                      key = `${roll.product_variant_id}-BUNDLE-${roll.bundle_size}-${normalizedLength}`;
                    } else if (roll.stock_type === 'FULL_ROLL') {
                      // Normalize length_meters to avoid 500.0 vs 500 issues
                      const normalizedLength = Number(roll.length_meters || 0);
                      key = `${roll.product_variant_id}-FULL_ROLL-${normalizedLength}`;
                    } else if (roll.stock_type === 'SPARE') {
                      // Normalize piece_length_meters to avoid floating point issues
                      const normalizedLength = Number(roll.piece_length_meters || 0);
                      key = `${roll.product_variant_id}-SPARE-${normalizedLength}`;
                    } else if (roll.stock_type === 'CUT_ROLL') {
                      // Group cut rolls by product variant and length
                      const normalizedLength = Number(roll.length_meters || 0);
                      key = `${roll.product_variant_id}-CUT_ROLL-${normalizedLength}`;
                    } else {
                      // Other types - show individually
                      key = `${idx}-INDIVIDUAL`;
                    }

                    if (!acc[key]) {
                      acc[key] = { roll, indices: [], totalQty: 0 };
                    }
                    acc[key].indices.push(idx);
                    // For SPARE, aggregate piece_count instead of quantity
                    if (roll.stock_type === 'SPARE') {
                      acc[key].totalQty += roll.piece_count || 0;
                    } else {
                      acc[key].totalQty += roll.quantity || 1;
                    }
                    return acc;
                  }, {} as Record<string, { roll: any, indices: number[], totalQty: number }>);

                  return Object.values(grouped).map(({ roll, indices, totalQty }) => (
                  <div key={indices[0]} className="p-3 border rounded-lg space-y-2">
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
                        onClick={() => {
                          // Remove all items in this group by removing highest indices first
                          // This prevents index shifting issues
                          [...indices].sort((a, b) => b - a).forEach(idx => onRemoveRoll(idx));
                        }}
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
                            <span>{totalQty}x({(parseFloat(roll.length_meters) || 0).toFixed(1)}m)</span>
                          ) : roll.stock_type === 'SPARE' ? (
                            // For spare pieces, show total piece count directly without multiplier
                            <span>
                              {totalQty} pcs
                              {roll.piece_length_meters && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  @ {Number(roll.piece_length_meters).toFixed(1)}m
                                </span>
                              )}
                            </span>
                          ) : (
                            <>
                              {totalQty}x
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
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  ));
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Section */}
        {selectedRolls.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div className="flex flex-col items-center">
                    <div className="text-gray-600">Full Rolls</div>
                    <div className="font-bold text-lg mt-auto">
                      {selectedRolls.filter(r => r.stock_type === 'FULL_ROLL').reduce((sum, r) => sum + (r.quantity || 1), 0)}
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-gray-600">Cut Rolls</div>
                    <div className="font-bold text-lg mt-auto">
                      {selectedRolls.filter(r => r.stock_type === 'CUT_ROLL').reduce((sum, r) => sum + (r.quantity || 1), 0)}
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
