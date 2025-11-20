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
}

interface ProductSelectionProps {
  productTypeId: string;
  onProductTypeChange: (id: string) => void;
  productSearch: string;
  onProductSearchChange: (search: string) => void;
  selectedRolls: Roll[];
  onRemoveRoll: (index: number) => void;
  onAddRoll: (roll: Roll) => void;
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
  onSearchProducts,
  productTypeRef,
  productSearchRef
}: ProductSelectionProps) => {
  return (
    <div className="space-y-4 p-4 border rounded-lg">
      <h3 className="font-semibold text-lg flex items-center gap-2">
        <Package className="h-5 w-5" />
        Product Selection
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div ref={productTypeRef}>
          <Label>Product Type</Label>
          <SearchableCombobox
            value={productTypeId}
            onChange={onProductTypeChange}
            options={productTypes}
            placeholder="Select product type"
            displayFormat={(pt) => pt.name}
          />
          <p className="text-xs text-gray-500 mt-1">Press Tab to move to search</p>
        </div>

        <div ref={productSearchRef}>
          <Label>Product Search</Label>
          <div className="flex gap-2">
            <Input
              value={productSearch}
              onChange={(e) => onProductSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSearchProducts();
                }
              }}
              placeholder="e.g., 32,6,10 Tarko Gold"
              className="flex-1"
            />
            <Button onClick={onSearchProducts} variant="secondary">
              Search
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Format: Size, Class, Pressure Brand or use alias
          </p>
        </div>
      </div>

      {/* Available Rolls */}
      {availableRolls.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium mb-2 text-sm text-gray-700">
            Available Rolls ({availableRolls.length})
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
            {availableRolls.map((roll) => (
              <div
                key={roll.id}
                onClick={() => onAddRoll(roll)}
                className="p-2 border rounded cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
              >
                <div className="text-sm font-medium">{roll.batch_code}</div>
                <div className="text-xs text-gray-600">
                  {roll.length_meters}m
                  {roll.bundle_size && ` (${roll.bundle_size})`}
                </div>
                <Badge variant="outline" className="text-xs mt-1">
                  {roll.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected Rolls */}
      {selectedRolls.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium mb-2 flex items-center justify-between">
            <span>Selected Rolls ({selectedRolls.length})</span>
            <span className="text-sm text-gray-600">
              Total: {selectedRolls.reduce((sum, r) => sum + r.length_meters, 0).toFixed(2)}m
            </span>
          </h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {selectedRolls.map((roll, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-white border rounded-lg hover:border-gray-300 transition-colors"
              >
                <div className="flex-1">
                  <div className="font-medium">{roll.batch_code}</div>
                  <div className="text-sm text-gray-600">
                    {roll.length_meters}m
                    {roll.bundle_size && ` • Bundle: ${roll.bundle_size}`}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveRoll(idx)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedRolls.length === 0 && availableRolls.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p>Search for products to begin selection</p>
        </div>
      )}
    </div>
  );
};
