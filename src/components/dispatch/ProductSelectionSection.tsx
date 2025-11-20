import { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableCombobox } from './SearchableCombobox';
import { X, Package } from 'lucide-react';

interface Roll {
  id: string;
  batch_code: string;
  length_meters: number;
  status: string;
  bundle_size?: number;
  roll_type?: string;
  parameters?: any;
  brand_name?: string;
  product_type_name?: string;
  quantity: number;
  dispatchLength?: number;
}

interface ProductGroup {
  batch_code: string;
  brand_name: string;
  parameters: any;
  total_rolls: number;
  total_meters: number;
  rolls: any[];
  has_cut_rolls: boolean;
  bundles: { size: number; count: number }[];
  spares_count: number;
}

interface SelectedRoll extends Roll {
  quantity: number;
  dispatchLength?: number;
}

interface ProductSelectionProps {
  productTypeId: string;
  onProductTypeChange: (id: string) => void;
  productSearch: string;
  onProductSearchChange: (search: string) => void;
  selectedRolls: SelectedRoll[];
  onRemoveRoll: (index: number) => void;
  onAddRoll: (roll: Roll) => void;
  onUpdateRollQuantity: (index: number, quantity: number, dispatchLength?: number) => void;
  productTypes: any[];
  availableRolls: Roll[];
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
  productTypeRef,
  productSearchRef
}: ProductSelectionProps) => {
  const [selections, setSelections] = useState<Record<string, { fullRolls: number; cutRolls: number; bundles: Record<string, number>; spares: number }>>({});

  // Group rolls by product (batch_code + parameters)
  const groupedProducts = useMemo(() => {
    const groups: Record<string, ProductGroup> = {};

    availableRolls.forEach((roll: any) => {
      const key = `${roll.batch_code}-${JSON.stringify(roll.parameters || {})}`;

      if (!groups[key]) {
        groups[key] = {
          batch_code: roll.batch_code,
          brand_name: roll.brand_name,
          parameters: roll.parameters || {},
          total_rolls: 0,
          total_meters: 0,
          rolls: [],
          has_cut_rolls: false,
          bundles: [],
          spares_count: 0
        };
      }

      groups[key].rolls.push(roll);
      groups[key].total_meters = (groups[key].total_meters || 0) + (parseFloat(roll.length_meters) || 0);

      // Categorize roll types
      if (roll.roll_type?.includes('bundle')) {
        const bundleSize = roll.bundle_size || 0;
        const existing = groups[key].bundles.find(b => b.size === bundleSize);
        if (existing) {
          existing.count++;
        } else {
          groups[key].bundles.push({ size: bundleSize, count: 1 });
        }
      } else if (roll.roll_type === 'spare') {
        groups[key].spares_count++;
      } else if (roll.is_cut_roll) {
        groups[key].has_cut_rolls = true;
        groups[key].total_rolls++;
      } else {
        groups[key].total_rolls++;
      }
    });

    return Object.values(groups);
  }, [availableRolls]);

  // Filter grouped products
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return groupedProducts;

    const searchLower = productSearch.toLowerCase();
    return groupedProducts.filter(product => {
      const batchCode = product.batch_code?.toLowerCase() || '';
      const brandName = product.brand_name?.toLowerCase() || '';
      const params = JSON.stringify(product.parameters).toLowerCase();

      return batchCode.includes(searchLower) ||
             brandName.includes(searchLower) ||
             params.includes(searchLower);
    });
  }, [groupedProducts, productSearch]);

  const getProductDisplayInfo = (product: ProductGroup) => {
    const params = product.parameters || {};
    const parts = [];

    if (params.size) parts.push(`${params.size}mm`);
    if (params.class) parts.push(`Class ${params.class}`);
    if (params.pressure) parts.push(`${params.pressure} Bar`);
    if (product.brand_name) parts.push(product.brand_name);

    return parts.join(' • ') || 'No details';
  };

  const handleAddProduct = (product: ProductGroup) => {
    const key = `${product.batch_code}-${JSON.stringify(product.parameters)}`;
    const selection = selections[key] || { fullRolls: 0, cutRolls: 0, bundles: {}, spares: 0 };

    // Add full rolls
    let addedCount = 0;
    if (selection.fullRolls > 0) {
      const fullRolls = product.rolls.filter((r: any) => !r.is_cut_roll && !r.roll_type?.includes('bundle') && r.roll_type !== 'spare');
      for (let i = 0; i < Math.min(selection.fullRolls, fullRolls.length); i++) {
        onAddRoll(fullRolls[i]);
        addedCount++;
      }
    }

    // Add cut rolls
    if (selection.cutRolls > 0) {
      const cutRolls = product.rolls.filter((r: any) => r.is_cut_roll);
      for (let i = 0; i < Math.min(selection.cutRolls, cutRolls.length); i++) {
        onAddRoll(cutRolls[i]);
        addedCount++;
      }
    }

    // Add bundles
    Object.entries(selection.bundles).forEach(([size, count]) => {
      const bundleRolls = product.rolls.filter((r: any) => r.bundle_size === parseInt(size));
      for (let i = 0; i < Math.min(count as number, bundleRolls.length); i++) {
        onAddRoll(bundleRolls[i]);
        addedCount++;
      }
    });

    // Add spares
    if (selection.spares > 0) {
      const spareRolls = product.rolls.filter((r: any) => r.roll_type === 'spare');
      for (let i = 0; i < Math.min(selection.spares, spareRolls.length); i++) {
        onAddRoll(spareRolls[i]);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      // Reset selections for this product
      const newSelections = { ...selections };
      delete newSelections[key];
      setSelections(newSelections);
    }
  };

  const updateSelection = (key: string, field: string, value: number) => {
    setSelections({
      ...selections,
      [key]: {
        ...selections[key],
        [field]: Math.max(0, value)
      }
    });
  };

  const updateBundleSelection = (key: string, bundleSize: number, value: number) => {
    const current = selections[key] || { fullRolls: 0, cutRolls: 0, bundles: {}, spares: 0 };
    setSelections({
      ...selections,
      [key]: {
        ...current,
        bundles: {
          ...current.bundles,
          [bundleSize]: Math.max(0, value)
        }
      }
    });
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg">
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
            placeholder="Type to filter..."
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">
            Showing {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Grouped Products */}
      {filteredProducts.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium mb-3 text-sm text-gray-700">
            Available Products ({filteredProducts.length})
          </h4>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filteredProducts.map((product) => {
              const key = `${product.batch_code}-${JSON.stringify(product.parameters)}`;
              const selection = selections[key] || { fullRolls: 0, cutRolls: 0, bundles: {}, spares: 0 };

              return (
                <div
                  key={key}
                  className="p-4 bg-white border-2 rounded-lg hover:border-blue-300 transition-colors"
                >
                  {/* Product Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="font-semibold text-base">{product.batch_code}</div>
                      <div className="text-sm text-gray-600 mt-1">{getProductDisplayInfo(product)}</div>
                    </div>
                    <Badge variant="outline" className="ml-2">
                      {product.total_meters.toFixed(0)}m total
                    </Badge>
                  </div>

                  {/* Selection Inputs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Full Rolls */}
                    {product.total_rolls > 0 && (
                      <div>
                        <Label className="text-xs text-gray-600">Full Rolls ({product.total_rolls})</Label>
                        <Input
                          type="number"
                          min="0"
                          max={product.total_rolls}
                          value={selection.fullRolls || ''}
                          onChange={(e) => updateSelection(key, 'fullRolls', parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="h-9"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddProduct(product);
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Cut Rolls */}
                    {product.has_cut_rolls && (
                      <div>
                        <Label className="text-xs text-gray-600">Cut Rolls</Label>
                        <Input
                          type="number"
                          min="0"
                          value={selection.cutRolls || ''}
                          onChange={(e) => updateSelection(key, 'cutRolls', parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="h-9"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddProduct(product);
                            }
                          }}
                        />
                      </div>
                    )}

                    {/* Bundles */}
                    {product.bundles.map((bundle) => (
                      <div key={bundle.size}>
                        <Label className="text-xs text-gray-600">Bundle {bundle.size} ({bundle.count})</Label>
                        <Input
                          type="number"
                          min="0"
                          max={bundle.count}
                          value={selection.bundles?.[bundle.size] || ''}
                          onChange={(e) => updateBundleSelection(key, bundle.size, parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="h-9"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddProduct(product);
                            }
                          }}
                        />
                      </div>
                    ))}

                    {/* Spares */}
                    {product.spares_count > 0 && (
                      <div>
                        <Label className="text-xs text-gray-600">Spares ({product.spares_count})</Label>
                        <Input
                          type="number"
                          min="0"
                          max={product.spares_count}
                          value={selection.spares || ''}
                          onChange={(e) => updateSelection(key, 'spares', parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="h-9"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddProduct(product);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Add Button */}
                  <Button
                    onClick={() => handleAddProduct(product)}
                    size="sm"
                    className="w-full mt-3"
                    disabled={!selection.fullRolls && !selection.cutRolls && !selection.spares && !Object.values(selection.bundles || {}).some(v => v > 0)}
                  >
                    Add Selected
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Rolls */}
      {selectedRolls.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium mb-2 flex items-center justify-between">
            <span>Selected Items ({selectedRolls.length})</span>
            <span className="text-sm text-gray-600">
              Total: {selectedRolls.reduce((sum, r) => sum + r.length_meters, 0).toFixed(2)}m
            </span>
          </h4>
          <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-2 bg-blue-50">
            {selectedRolls.map((roll, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 bg-white border border-blue-200 rounded"
              >
                <div className="flex-1">
                  <div className="font-medium text-sm">{roll.batch_code}</div>
                  <div className="text-xs text-gray-600">
                    {roll.length_meters}m
                    {roll.roll_type?.includes('bundle') && ` • Bundle ${roll.bundle_size}`}
                    {roll.roll_type === 'spare' && ' • Spare'}
                    {roll.is_cut_roll && ' • Cut Roll'}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveRoll(idx)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredProducts.length === 0 && availableRolls.length > 0 && (
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
  );
};