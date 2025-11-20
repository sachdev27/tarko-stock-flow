import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search } from 'lucide-react';

interface StockFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedProduct: string;
  onProductChange: (value: string) => void;
  selectedStockType: string;
  onStockTypeChange: (value: string) => void;
  productTypes: string[];
  stockTypes: Array<{ value: string; label: string }>;
  resultsCount: number;
  totalCount: number;
  onClearFilters: () => void;
}

export const StockFilters = ({
  searchTerm,
  onSearchChange,
  selectedProduct,
  onProductChange,
  selectedStockType,
  onStockTypeChange,
  productTypes,
  stockTypes,
  resultsCount,
  totalCount,
  onClearFilters
}: StockFiltersProps) => {
  const hasActiveFilters = searchTerm || selectedProduct !== 'all' || selectedStockType !== 'all';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Search</label>
            <Input
              placeholder="Batch code, batch no, or brand..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          {/* Product Type Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Product Type</label>
            <select
              className="w-full h-10 px-3 border rounded-md"
              value={selectedProduct}
              onChange={(e) => onProductChange(e.target.value)}
            >
              {productTypes.map(type => (
                <option key={type} value={type}>
                  {type === 'all' ? 'All Products' : type}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Type Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Stock Type</label>
            <select
              className="w-full h-10 px-3 border rounded-md"
              value={selectedStockType}
              onChange={(e) => onStockTypeChange(e.target.value)}
            >
              {stockTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {resultsCount} of {totalCount} batches
            </p>
            <Button variant="ghost" size="sm" onClick={onClearFilters}>
              Clear Filters
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
