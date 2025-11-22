import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TransactionFilters as Filters, ProductType, Brand } from '@/types/transaction';

interface TransactionFiltersProps {
  filters: Filters;
  onFilterChange: (key: keyof Filters, value: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  showFilters: boolean;
  onToggleFilters: () => void;
  productTypes: ProductType[];
  brands: Brand[];
  parameterOptions: {
    odOptions: string[];
    pnOptions: string[];
    peOptions: string[];
    typeOptions: string[];
  };
}

export function TransactionFilters({
  filters,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
  showFilters,
  onToggleFilters,
  productTypes,
  brands,
  parameterOptions,
}: TransactionFiltersProps) {
  const timePresets = [
    { label: 'All Time', value: '' },
    { label: 'Today', value: 'today' },
    { label: 'Last 7 Days', value: '7days' },
    { label: 'Last 30 Days', value: '30days' },
    { label: 'This Month', value: 'month' },
    { label: 'Last Month', value: 'lastmonth' },
  ];

  return (
    <div className="space-y-4">
      {/* Filter Toggle Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search by batch, roll, customer, invoice, or product..."
            value={filters.searchQuery}
            onChange={(e) => onFilterChange('searchQuery', e.target.value)}
            className="w-full"
          />
        </div>
        <Button
          variant="outline"
          onClick={onToggleFilters}
          className="flex items-center gap-2"
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {hasActiveFilters && (
            <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {Object.values(filters).filter((v) => v && v !== '').length}
            </span>
          )}
        </Button>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        )}
      </div>

      {/* Expanded Filters Panel */}
      {showFilters && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Activity Type Filter */}
            <div className="space-y-2">
              <Label htmlFor="type-filter">Activity Type</Label>
              <Select
                value={filters.typeFilter}
                onValueChange={(value) => onFilterChange('typeFilter', value)}
              >
                <SelectTrigger id="type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="PRODUCTION">Production</SelectItem>
                  <SelectItem value="DISPATCH">Dispatch</SelectItem>
                  <SelectItem value="RETURN">Return</SelectItem>
                  <SelectItem value="CUT_ROLL">Cut Roll</SelectItem>
                  <SelectItem value="SPLIT_BUNDLE">Split Bundle</SelectItem>
                  <SelectItem value="COMBINE_SPARES">Combine Spares</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Product Type Filter */}
            <div className="space-y-2">
              <Label htmlFor="product-filter">Product Type</Label>
              <Select
                value={filters.productTypeFilter}
                onValueChange={(value) => onFilterChange('productTypeFilter', value)}
              >
                <SelectTrigger id="product-filter">
                  <SelectValue placeholder="All Products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {productTypes.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id.toString()}>
                      {pt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Brand Filter */}
            <div className="space-y-2">
              <Label htmlFor="brand-filter">Brand</Label>
              <Select
                value={filters.brandFilter}
                onValueChange={(value) => onFilterChange('brandFilter', value)}
              >
                <SelectTrigger id="brand-filter">
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id.toString()}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Period Filter */}
            <div className="space-y-2">
              <Label htmlFor="time-filter">Time Period</Label>
              <Select
                value={filters.timePreset}
                onValueChange={(value) => onFilterChange('timePreset', value)}
              >
                <SelectTrigger id="time-filter">
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  {timePresets.map((preset) => (
                    <SelectItem key={preset.value || 'all'} value={preset.value || 'all'}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Parameter Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* OD Filter */}
            <div className="space-y-2">
              <Label htmlFor="od-filter">Outer Diameter (OD)</Label>
              <Select
                value={filters.odFilter}
                onValueChange={(value) => onFilterChange('odFilter', value)}
              >
                <SelectTrigger id="od-filter">
                  <SelectValue placeholder="All OD" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All OD</SelectItem>
                  {parameterOptions.odOptions.map((od) => (
                    <SelectItem key={od} value={od}>
                      {od}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* PN Filter */}
            <div className="space-y-2">
              <Label htmlFor="pn-filter">Pressure Nominal (PN)</Label>
              <Select
                value={filters.pnFilter}
                onValueChange={(value) => onFilterChange('pnFilter', value)}
              >
                <SelectTrigger id="pn-filter">
                  <SelectValue placeholder="All PN" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All PN</SelectItem>
                  {parameterOptions.pnOptions.map((pn) => (
                    <SelectItem key={pn} value={pn}>
                      {pn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* PE Filter */}
            <div className="space-y-2">
              <Label htmlFor="pe-filter">PE Grade</Label>
              <Select
                value={filters.peFilter}
                onValueChange={(value) => onFilterChange('peFilter', value)}
              >
                <SelectTrigger id="pe-filter">
                  <SelectValue placeholder="All PE" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All PE</SelectItem>
                  {parameterOptions.peOptions.map((pe) => (
                    <SelectItem key={pe} value={pe}>
                      {pe}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type Filter */}
            <div className="space-y-2">
              <Label htmlFor="type-param-filter">Type</Label>
              <Select
                value={filters.typeParamFilter}
                onValueChange={(value) => onFilterChange('typeParamFilter', value)}
              >
                <SelectTrigger id="type-param-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {parameterOptions.typeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Customer Filter (full width) */}
          <div className="space-y-2">
            <Label htmlFor="customer-filter">Customer</Label>
            <Input
              id="customer-filter"
              placeholder="Filter by customer name..."
              value={filters.searchQuery}
              onChange={(e) => onFilterChange('searchQuery', e.target.value)}
            />
          </div>

          {/* Date Range Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date & Time</Label>
              <Input
                id="start-date"
                type="datetime-local"
                value={filters.startDate}
                onChange={(e) => onFilterChange('startDate', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date & Time</Label>
              <Input
                id="end-date"
                type="datetime-local"
                value={filters.endDate}
                onChange={(e) => onFilterChange('endDate', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
