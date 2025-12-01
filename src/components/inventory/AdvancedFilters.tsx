import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdvancedFiltersProps {
  productTypes: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  selectedProductType: string;
  selectedBrand: string;
  parameterFilters: Record<string, string>;
  availableParameterValues: Record<string, string[]>;
  onProductTypeChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onParameterFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  selectedStockType: string;
  onStockTypeChange: (value: string) => void;
  stockTypes: Array<{ value: string; label: string }>;
  currentProductTypeName: string;
}

export const AdvancedFilters = ({
  productTypes,
  brands,
  selectedProductType,
  selectedBrand,
  parameterFilters,
  availableParameterValues,
  onProductTypeChange,
  onBrandChange,
  onParameterFilterChange,
  onClearFilters,
  selectedStockType,
  onStockTypeChange,
  stockTypes,
  currentProductTypeName
}: AdvancedFiltersProps) => {
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});

  const activeFiltersCount =
    (selectedProductType !== 'all' ? 1 : 0) +
    (selectedBrand !== 'all' ? 1 : 0) +
    (selectedStockType !== 'all' ? 1 : 0) +
    Object.values(parameterFilters).filter(v => v).length;

  // Determine which parameters to show based on product type
  const isHDPE = currentProductTypeName.toLowerCase().includes('hdpe');
  const isSprinkler = currentProductTypeName.toLowerCase().includes('sprinkler');

  // Parameter order: OD, PN, then PE (HDPE) or Type (Sprinkler)
  const parameterOrder = ['OD', 'PN', isHDPE ? 'PE' : isSprinkler ? 'Type' : 'PE'];

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
        <div className="space-y-1 min-w-[120px]" data-brand-filter>
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

        {/* Parameter Filters with Autocomplete */}
        {parameterOrder.map(param => {
          const values = availableParameterValues[param] || [];
          const selectedValue = parameterFilters[param] || '';

          return (
            <div key={param} className="space-y-1 min-w-[100px]" data-param-filters>
              <Label className="text-xs">{param}</Label>
              <Popover
                open={openPopovers[param]}
                onOpenChange={(open) => setOpenPopovers(prev => ({ ...prev, [param]: open }))}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="h-9 text-sm w-full justify-between font-normal"
                  >
                    {selectedValue || `Select ${param}...`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={`Search ${param}...`} />
                    <CommandList>
                      <CommandEmpty>No values found.</CommandEmpty>
                      <CommandGroup>
                        {values.map((value) => (
                          <CommandItem
                            key={value}
                            value={value}
                            onSelect={() => {
                              onParameterFilterChange(param, value === selectedValue ? '' : value);
                              setOpenPopovers(prev => ({ ...prev, [param]: false }));
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedValue === value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {value}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          );
        })}

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
