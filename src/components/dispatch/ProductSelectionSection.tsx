import { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableCombobox } from './SearchableCombobox';
import { X, Package, Scissors } from 'lucide-react';

interface Roll {
  id: string;
  batch_code: string;
  length_meters: number;
  status: string;
  bundle_size?: number;
  bundle_type?: string;
  is_cut_roll?: boolean;
  parameters?: Record<string, unknown>;
  brand_name?: string;
  product_type_name?: string;
  product_category?: string;
  quantity: number;
  dispatchLength?: number;
  piece_count?: number;
  piece_length_meters?: number;
}

interface ProductGroup {
  product_key: string;
  brand_name: string;
  parameters: Record<string, unknown>;
  product_category: string;
  // HDPE
  standard_rolls: Array<{ id: string; length: number }>;
  cut_rolls: Array<{ id: string; length: number }>;
  total_hdpe_meters: number;
  // Sprinkler
  bundles: { size: number; count: number; ids: string[] }[];
  spares: Array<{ id: string; pieces: number }>;
  total_sprinkler_pieces: number;
}

interface SelectedRoll extends Roll {
  quantity: number;
  dispatchLength?: number;
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
  selectedRolls: SelectedRoll[];
  onRemoveRoll: (index: number) => void;
  onAddRoll: (roll: Roll) => void;
  onUpdateRollQuantity: (index: number, quantity: number, dispatchLength?: number) => void;
  productTypes: ProductType[];
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
  // Group rolls by product (brand + parameters, NOT batch)
  const groupedProducts = useMemo(() => {
    const groups: Record<string, ProductGroup> = {};

    availableRolls.forEach((roll) => {
      // Create key from brand + parameters (ignore batch_code)
      const paramStr = JSON.stringify(roll.parameters || {});
      const key = `${roll.brand_name}-${paramStr}`;

      if (!groups[key]) {
        groups[key] = {
          product_key: key,
          brand_name: roll.brand_name,
          parameters: roll.parameters || {},
          product_category: roll.product_category || 'HDPE',
          standard_rolls: [],
          cut_rolls: [],
          total_hdpe_meters: 0,
          bundles: [],
          spares: [],
          total_sprinkler_pieces: 0
        };
      }

      const group = groups[key];

      // Categorize by product type
      if (roll.product_category === 'HDPE') {
        const rollData = { id: roll.id, length: parseFloat(String(roll.length_meters)) || 0 };
        if (roll.is_cut_roll) {
          group.cut_rolls.push(rollData);
        } else {
          group.standard_rolls.push(rollData);
        }
        group.total_hdpe_meters += rollData.length;
      } else if (roll.product_category === 'SPRINKLER') {
        if (roll.bundle_type === 'bundle') {
          const bundleSize = roll.bundle_size || 0;
          const existing = group.bundles.find(b => b.size === bundleSize);
          if (existing) {
            existing.count++;
            existing.ids.push(roll.id);
          } else {
            group.bundles.push({ size: bundleSize, count: 1, ids: [roll.id] });
          }
          group.total_sprinkler_pieces += roll.piece_count || 0;
        } else if (roll.bundle_type === 'spare') {
          group.spares.push({ id: roll.id, pieces: roll.piece_count || 1 });
          group.total_sprinkler_pieces += roll.piece_count || 1;
        }
      }
    });

    return Object.values(groups);
  }, [availableRolls]);

  // Filter grouped products
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return groupedProducts;

    const searchLower = productSearch.toLowerCase();
    return groupedProducts.filter(product => {
      const brandName = product.brand_name?.toLowerCase() || '';
      const params = JSON.stringify(product.parameters).toLowerCase();

      return brandName.includes(searchLower) || params.includes(searchLower);
    });
  }, [groupedProducts, productSearch]);

  // Format product name from parameters
  const getProductDisplayName = (product: ProductGroup) => {
    const params = product.parameters || {};
    const parts = [];

    // Extract key specs
    if (params.outer_diameter) parts.push(`${params.outer_diameter}mm`);
    if (params.material) parts.push(params.material);
    if (params.pressure_class) parts.push(params.pressure_class);

    const specs = parts.join(' ');
    return specs ? `${specs} - ${product.brand_name}` : product.brand_name;
  };

  // Handle adding individual HDPE rolls
  const handleAddHdpeRoll = (rollId: string, length: number) => {
    const roll = availableRolls.find(r => r.id === rollId);
    if (roll) {
      onAddRoll(roll);
    }
  };

  // Handle adding sprinkler bundles
  const handleAddBundle = (bundleIds: string[], size: number) => {
    if (bundleIds.length > 0) {
      const roll = availableRolls.find(r => r.id === bundleIds[0]);
      if (roll) {
        onAddRoll(roll);
      }
    }
  };

  // Handle adding sprinkler spares
  const handleAddSpare = (spareId: string) => {
    const roll = availableRolls.find(r => r.id === spareId);
    if (roll) {
      onAddRoll(roll);
    }
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
            placeholder="Search by brand or specs..."
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
          <div className="space-y-4 max-h-[500px] overflow-y-auto">
            {filteredProducts.map((product) => {
              const key = product.product_key;

              return (
                <div
                  key={key}
                  className="p-4 bg-white border-2 rounded-lg hover:border-blue-300 transition-colors"
                >
                  {/* Product Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="font-semibold text-lg">{getProductDisplayName(product)}</div>
                    </div>
                    {product.product_category === 'HDPE' && (
                      <Badge variant="outline" className="ml-2">
                        {product.total_hdpe_meters.toFixed(0)}m total
                      </Badge>
                    )}
                    {product.product_category === 'SPRINKLER' && (
                      <Badge variant="outline" className="ml-2">
                        {product.total_sprinkler_pieces} pieces total
                      </Badge>
                    )}
                  </div>

                  {/* HDPE Rolls Display */}
                  {product.product_category === 'HDPE' && (
                    <div className="space-y-3">
                      {/* Standard Rolls */}
                      {product.standard_rolls.length > 0 && (
                        <div className="bg-blue-50 p-3 rounded-md">
                          <div className="flex items-center gap-2 mb-2">
                            <Package className="h-4 w-4 text-blue-600" />
                            <Label className="text-sm font-medium">Full Rolls ({product.standard_rolls.length})</Label>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {product.standard_rolls.map((roll) => (
                              <Button
                                key={roll.id}
                                onClick={() => handleAddHdpeRoll(roll.id, roll.length)}
                                variant="outline"
                                size="sm"
                                className="h-auto py-2"
                              >
                                {roll.length.toFixed(0)}m
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Cut Rolls */}
                      {product.cut_rolls.length > 0 && (
                        <div className="bg-orange-50 p-3 rounded-md">
                          <div className="flex items-center gap-2 mb-2">
                            <Scissors className="h-4 w-4 text-orange-600" />
                            <Label className="text-sm font-medium">Cut Rolls ({product.cut_rolls.length})</Label>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {product.cut_rolls.map((roll) => (
                              <Button
                                key={roll.id}
                                onClick={() => handleAddHdpeRoll(roll.id, roll.length)}
                                variant="outline"
                                size="sm"
                                className="h-auto py-2"
                              >
                                Cut - {roll.length.toFixed(1)}m
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sprinkler Bundles Display */}
                  {product.product_category === 'SPRINKLER' && (
                    <div className="space-y-3">
                      {/* Bundles */}
                      {product.bundles.length > 0 && (
                        <div className="bg-green-50 p-3 rounded-md">
                          <div className="flex items-center gap-2 mb-2">
                            <Package className="h-4 w-4 text-green-600" />
                            <Label className="text-sm font-medium">Bundles</Label>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {product.bundles.map((bundle) => (
                              <Button
                                key={`bundle-${bundle.size}`}
                                onClick={() => handleAddBundle(bundle.ids, bundle.size)}
                                variant="outline"
                                size="sm"
                                className="h-auto py-2"
                              >
                                Bundle {bundle.size} ({bundle.count} avail)
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Spares */}
                      {product.spares.length > 0 && (
                        <div className="bg-purple-50 p-3 rounded-md">
                          <div className="flex items-center gap-2 mb-2">
                            <Package className="h-4 w-4 text-purple-600" />
                            <Label className="text-sm font-medium">Spares ({product.spares.length})</Label>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {product.spares.map((spare) => (
                              <Button
                                key={spare.id}
                                onClick={() => handleAddSpare(spare.id)}
                                variant="outline"
                                size="sm"
                                className="h-auto py-2"
                              >
                                {spare.pieces} piece{spare.pieces !== 1 ? 's' : ''}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
            {selectedRolls.some(r => r.product_category === 'HDPE') && (
              <span className="text-sm text-gray-600">
                Total: {selectedRolls
                  .filter(r => r.product_category === 'HDPE')
                  .reduce((sum, r) => sum + (r.length_meters || 0), 0)
                  .toFixed(2)}m
              </span>
            )}
          </h4>
          <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-2 bg-blue-50">
            {selectedRolls.map((roll, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 bg-white border border-blue-200 rounded"
              >
                <div className="flex-1">
                  <div className="font-medium text-sm">{roll.brand_name} - {roll.product_type_name}</div>
                  <div className="text-xs text-gray-600">
                    {roll.product_category === 'HDPE' && (
                      <>
                        {roll.length_meters}m
                        {roll.is_cut_roll && ' • Cut Roll'}
                      </>
                    )}
                    {roll.product_category === 'SPRINKLER' && (
                      <>
                        {roll.bundle_type === 'bundle' && `Bundle ${roll.bundle_size}`}
                        {roll.bundle_type === 'spare' && `Spare - ${roll.piece_count} pieces`}
                      </>
                    )}
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