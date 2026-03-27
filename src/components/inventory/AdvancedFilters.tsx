import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, Check, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet';

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

  const FilterContent = ({ isMobile = false }) => (
    <div className={cn("space-y-4", isMobile ? "pb-6" : "flex items-end gap-2 flex-wrap")}>
      {/* Product Type */}
      <div className={cn("space-y-1", isMobile ? "" : "min-w-[140px]")}>
        <Label className="text-xs">Product Type</Label>
        <Select value={selectedProductType} onValueChange={onProductTypeChange}>
          <SelectTrigger className="h-9 sm:h-9 text-sm">
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
      <div className={cn("space-y-1", isMobile ? "" : "min-w-[120px]")} data-brand-filter>
        <Label className="text-xs">Brand</Label>
        <Select value={selectedBrand} onValueChange={onBrandChange}>
          <SelectTrigger className="h-9 sm:h-9 text-sm">
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

      {/* Parameter Filters */}
      {parameterOrder.map(param => {
        const values = availableParameterValues[param] || [];
        const selectedValue = parameterFilters[param] || '';

        return (
          <div key={param} className={cn("space-y-1", isMobile ? "" : "min-w-[100px]")} data-param-filters>
            <Label className="text-xs">{param}</Label>
            <Popover
              open={openPopovers[param]}
              onOpenChange={(open) => setOpenPopovers(prev => ({ ...prev, [param]: open }))}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="h-9 sm:h-9 text-sm w-full justify-between font-normal"
                >
                  {selectedValue || `Select ${param}...`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align={isMobile ? "center" : "start"}>
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
                            if (!isMobile) setOpenPopovers(prev => ({ ...prev, [param]: false }));
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
      <div className={cn("space-y-1", isMobile ? "" : "min-w-[120px]")}>
        <Label className="text-xs">Stock Type</Label>
        <Select value={selectedStockType} onValueChange={onStockTypeChange}>
          <SelectTrigger className="h-9 sm:h-9 text-sm">
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
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Inline Filters for Mobile & Desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-4 p-0.5">
        {/* Product Type */}
        <div className="space-y-1">
          <Label className="text-[10px] sm:text-xs uppercase font-bold text-muted-foreground/70">Type</Label>
          <Select value={selectedProductType} onValueChange={onProductTypeChange}>
            <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm bg-background border-muted-foreground/20">
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
        <div className="space-y-1">
          <Label className="text-[10px] sm:text-xs uppercase font-bold text-muted-foreground/70">Brand</Label>
          <Select value={selectedBrand} onValueChange={onBrandChange}>
            <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm bg-background border-muted-foreground/20">
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

        {/* Parameter Filters */}
        {parameterOrder.map(param => {
          const values = availableParameterValues[param] || [];
          const selectedValue = parameterFilters[param] || '';

          return (
            <div key={param} className="space-y-1">
              <Label className="text-[10px] sm:text-xs uppercase font-bold text-muted-foreground/70">{param}</Label>
              <Popover
                open={openPopovers[param]}
                onOpenChange={(open) => setOpenPopovers(prev => ({ ...prev, [param]: open }))}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="h-8 sm:h-9 text-xs sm:text-sm w-full justify-between font-normal bg-background border-muted-foreground/20"
                  >
                    {selectedValue || `All ${param}`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[180px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={`Search ${param}...`} className="h-8 text-xs" />
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
        <div className="space-y-1">
          <Label className="text-[10px] sm:text-xs uppercase font-bold text-muted-foreground/70">Stock</Label>
          <Select value={selectedStockType} onValueChange={onStockTypeChange}>
            <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm bg-background border-muted-foreground/20">
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
