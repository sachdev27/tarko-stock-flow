import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface AdvancedFiltersProps {
  productTypes: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  selectedProductType: string;
  selectedBrand: string;
  parameterFilters: Record<string, string>;
  onProductTypeChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onParameterFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  availableParameters: string[];
  selectedStockType: string;
  onStockTypeChange: (value: string) => void;
  stockTypes: Array<{ value: string; label: string }>;
}

export const AdvancedFilters = ({
  productTypes,
  brands,
  selectedProductType,
  selectedBrand,
  parameterFilters,
  onProductTypeChange,
  onBrandChange,
  onParameterFilterChange,
  onClearFilters,
  availableParameters,
  selectedStockType,
  onStockTypeChange,
  stockTypes
}: AdvancedFiltersProps) => {
  const activeFiltersCount =
    (selectedProductType !== 'all' ? 1 : 0) +
    (selectedBrand !== 'all' ? 1 : 0) +
    (selectedStockType !== 'all' ? 1 : 0) +
    Object.values(parameterFilters).filter(v => v).length;

  return (
    <div className="space-y-3">
      {/* Compact single row filters */}
      <div className="flex items-end gap-2 flex-wrap">
        {/* Product Type */}
        <div className="space-y-1 min-w-[140px]">
          <Label className="text-xs">Product Type</Label>
          <Select value={selectedProductType} onValueChange={onProductTypeChange}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {productTypes.map(pt => (
                <SelectItem key={pt.id} value={pt.id}>
                  {pt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Brand */}
        <div className="space-y-1 min-w-[120px]">
          <Label className="text-xs">Brand</Label>
          <Select value={selectedBrand} onValueChange={onBrandChange}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map(brand => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Parameter Filters - Compact */}
        {availableParameters.map(param => (
          <div key={param} className="space-y-1 min-w-[100px]">
            <Label className="text-xs">{param}</Label>
            <Input
              placeholder={param}
              className="h-9 text-sm"
              value={parameterFilters[param] || ''}
              onChange={(e) => onParameterFilterChange(param, e.target.value)}
            />
          </div>
        ))}

        {/* Stock Type */}
        <div className="space-y-1 min-w-[120px]">
          <Label className="text-xs">Stock Type</Label>
          <Select value={selectedStockType} onValueChange={onStockTypeChange}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stockTypes.map(type => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clear Button */}
        {activeFiltersCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearFilters}
            className="h-9"
          >
            <X className="h-3 w-3 mr-1" />
            Clear ({activeFiltersCount})
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedProductType !== 'all' && (
            <Badge variant="secondary" className="gap-1 text-xs h-6">
              {productTypes.find(pt => pt.id === selectedProductType)?.name}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onProductTypeChange('all')}
              />
            </Badge>
          )}
          {selectedBrand !== 'all' && (
            <Badge variant="secondary" className="gap-1 text-xs h-6">
              {brands.find(b => b.id === selectedBrand)?.name}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onBrandChange('all')}
              />
            </Badge>
          )}
          {selectedStockType !== 'all' && (
            <Badge variant="secondary" className="gap-1 text-xs h-6">
              {stockTypes.find(st => st.value === selectedStockType)?.label}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onStockTypeChange('all')}
              />
            </Badge>
          )}
          {Object.entries(parameterFilters).map(([key, value]) =>
            value ? (
              <Badge key={key} variant="secondary" className="gap-1 text-xs h-6">
                {key}: {value}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => onParameterFilterChange(key, '')}
                />
              </Badge>
            ) : null
          )}
        </div>
      )}
    </div>
  );
};
