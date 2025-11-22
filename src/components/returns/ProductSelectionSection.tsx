import { useState, useRef, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface ProductType {
  id: string;
  name: string;
}

interface Brand {
  id: string;
  name: string;
}

interface ReturnItem {
  product_type_id: string;
  brand_id: string;
  product_type_name: string;
  brand_name: string;
  item_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE_PIECES';
  quantity: number;
  parameters?: Record<string, string>;
  rolls?: { length_meters: number }[];
  bundles?: { bundle_size: number; piece_length_meters: number }[];
  bundle_size?: number;
  piece_length_meters?: number;
  piece_count?: number;
  notes?: string;
}

interface ProductSelectionProps {
  productTypes: ProductType[];
  brands: Brand[];
  onAddItem: (item: ReturnItem) => void;
  productTypeRef?: React.RefObject<HTMLDivElement>;
  productSearchRef?: React.RefObject<HTMLDivElement>;
}

export const ProductSelectionSection = ({
  productTypes,
  brands,
  onAddItem,
  productTypeRef,
  productSearchRef
}: ProductSelectionProps) => {
  const [selectedProductType, setSelectedProductType] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [itemType, setItemType] = useState<'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE_PIECES' | ''>('');
  const [advancedSearch, setAdvancedSearch] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [validTypeOptions, setValidTypeOptions] = useState<string[]>([]);

  // For HDPE rolls - single length for all
  const [rollLength, setRollLength] = useState('');

  // For Sprinkler bundles - single size and length for all
  const [bundleSize, setBundleSize] = useState('');
  const [bundlePieceLength, setBundlePieceLength] = useState('');

  // For Sprinkler spare pieces
  const [pieceCount, setPieceCount] = useState('');
  const [pieceLength, setPieceLength] = useState('');

  const productTypeRefInput = useRef<HTMLButtonElement>(null);
  const brandRefInput = useRef<HTMLButtonElement>(null);
  const itemTypeRefInput = useRef<HTMLButtonElement>(null);
  const parameterRefInput = useRef<HTMLInputElement>(null);

  // Get product type name
  const productTypeName = productTypes.find(pt => pt.id === selectedProductType)?.name || '';
  const isHDPE = productTypeName.toUpperCase().includes('HDPE');
  const isSprinkler = productTypeName.toUpperCase().includes('SPRINKLER');

  // Fetch valid Type options for Sprinkler when product type changes
  useEffect(() => {
    const fetchTypeOptions = async () => {
      if (isSprinkler) {
        try {
          const response = await fetch('/api/parameters/options/Type', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          const data = await response.json();
          setValidTypeOptions(data.map((opt: any) => opt.value));
        } catch (error) {
          console.error('Error fetching Type options:', error);
          // Fallback to L and C if fetch fails
          setValidTypeOptions(['L', 'C']);
        }
      } else {
        setValidTypeOptions([]);
      }
    };
    fetchTypeOptions();
  }, [isSprinkler]);

  // Parse and validate advanced search parameters
  const parseAdvancedSearch = (search: string) => {
    if (!search.trim()) return { params: {}, error: null };

    const parts = search.split(',').map(p => p.trim());

    if (isHDPE) {
      // HDPE format: int,int,int (like 32,6,10)
      if (parts.length !== 3) {
        return { params: {}, error: 'HDPE format: OD,PN,PE (e.g., 32,6,10)' };
      }

      const [od, pn, pe] = parts;

      // Validate all three are integers
      if (!/^\d+$/.test(od) || !/^\d+$/.test(pn) || !/^\d+$/.test(pe)) {
        return { params: {}, error: 'OD, PN, and PE must all be integers' };
      }

      return {
        params: { OD: od, PN: pn, PE: pe },
        error: null
      };
    } else if (isSprinkler) {
      // Sprinkler format: int,int,char (like 32,6,L)
      if (parts.length !== 3) {
        return { params: {}, error: 'Sprinkler format: OD,PN,Type (e.g., 32,6,L)' };
      }

      const [od, pn, type] = parts;

      // Validate OD and PN are integers
      if (!/^\d+$/.test(od) || !/^\d+$/.test(pn)) {
        return { params: {}, error: 'OD and PN must be integers' };
      }

      // Type must be single char, case insensitive
      if (!/^[a-zA-Z]$/.test(type)) {
        return { params: {}, error: 'Type must be a single letter' };
      }

      const typeValue = type.toUpperCase();
      // Validate against database-defined Type options
      if (validTypeOptions.length > 0 && !validTypeOptions.includes(typeValue)) {
        return { params: {}, error: `Type must be one of: ${validTypeOptions.join(', ')}` };
      }

      return {
        params: { OD: od, PN: pn, Type: typeValue },
        error: null
      };
    }

    return { params: {}, error: null };
  };

  // Update item type when product type changes
  useEffect(() => {
    if (isHDPE) {
      setItemType('FULL_ROLL');
    } else if (isSprinkler) {
      setItemType('BUNDLE');
    } else if (selectedProductType) {
      setItemType('');
    }
  }, [selectedProductType, productTypeName]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P - Focus product type
      if (e.ctrlKey && e.key === 'p' && !e.shiftKey) {
        e.preventDefault();
        productTypeRefInput.current?.click();
      }
      // Ctrl+B - Focus brand
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        brandRefInput.current?.click();
      }
      // Ctrl+T - Focus item type
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        itemTypeRefInput.current?.click();
      }
      // Ctrl+Shift+P - Focus parameter
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        parameterRefInput.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAddItem = () => {
    if (!selectedProductType || !selectedBrand) {
      toast.error('Please select product type and brand');
      return;
    }

    if (!itemType) {
      toast.error('Please select item type');
      return;
    }

    // Validate parameters are required for HDPE and Sprinkler
    if ((isHDPE || isSprinkler) && !advancedSearch.trim()) {
      toast.error('Please enter parameters');
      return;
    }

    // Validate and parse parameters
    const { params: parameters, error: paramError } = parseAdvancedSearch(advancedSearch);
    if (paramError) {
      toast.error(paramError);
      return;
    }

    const brandName = brands.find(b => b.id === selectedBrand)?.name || '';

    const item: ReturnItem = {
      product_type_id: selectedProductType,
      brand_id: selectedBrand,
      product_type_name: productTypeName,
      brand_name: brandName,
      item_type: itemType as 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE_PIECES',
      quantity: 1,
      parameters,
      notes: ''
    };

    // Validate based on item type
    if (itemType === 'FULL_ROLL' || itemType === 'CUT_ROLL') {
      const qty = parseInt(quantity) || 1;
      const length = parseFloat(rollLength);

      if (isNaN(qty) || qty < 1 || qty > 100) {
        toast.error('Quantity must be between 1 and 100');
        return;
      }

      if (isNaN(length) || length <= 0) {
        toast.error('Please enter valid roll length');
        return;
      }

      // Create multiple rolls with the same length
      item.rolls = Array(qty).fill(null).map(() => ({ length_meters: length }));
      item.quantity = qty;
    } else if (itemType === 'BUNDLE') {
      const qty = parseInt(quantity) || 1;
      const size = parseInt(bundleSize);
      const length = parseFloat(bundlePieceLength);

      if (isNaN(qty) || qty < 1 || qty > 100) {
        toast.error('Quantity must be between 1 and 100');
        return;
      }

      if (isNaN(size) || size < 1) {
        toast.error('Please enter valid bundle size');
        return;
      }
      if (isNaN(length) || length <= 0) {
        toast.error('Please enter valid piece length');
        return;
      }

      // Create multiple bundles with the same size and length
      item.bundles = Array(qty).fill(null).map(() => ({
        bundle_size: size,
        piece_length_meters: length
      }));
      item.quantity = qty;
    } else if (itemType === 'SPARE_PIECES') {
      const count = parseInt(pieceCount);
      const length = parseFloat(pieceLength);

      if (isNaN(count) || count < 1) {
        toast.error('Please enter valid piece count');
        return;
      }
      if (isNaN(length) || length <= 0) {
        toast.error('Please enter valid piece length');
        return;
      }

      item.piece_count = count;
      item.piece_length_meters = length;
    }

    onAddItem(item);

    // Reset form but keep product type, brand, and parameters
    setItemType('');
    setQuantity('1');
    setRollLength('');
    setBundleSize('');
    setBundlePieceLength('');
    setPieceCount('');
    setPieceLength('');

    toast.success('Item added to cart');

    // Focus management: if product/brand/params are still set, focus on item type for quick next entry
    // Otherwise focus on product type
    setTimeout(() => {
      if (selectedProductType && selectedBrand && advancedSearch) {
        itemTypeRefInput.current?.focus();
      } else {
        productTypeRefInput.current?.focus();
      }
    }, 100);
  };

  const getParameterPlaceholder = () => {
    if (isHDPE) return 'e.g., 32,6,10';
    if (isSprinkler) {
      const typeHint = validTypeOptions.length > 0 ? validTypeOptions[0] : 'L';
      return `e.g., 32,6,${typeHint}`;
    }
    if (!selectedProductType) return 'Select product type first';
    return 'Enter parameters';
  };

  const getParameterHint = () => {
    if (isHDPE) return '(OD,PN,PE - all integers)';
    if (isSprinkler) {
      const typeOptions = validTypeOptions.length > 0 ? validTypeOptions.join('/') : 'L/C';
      return `(OD,PN,Type - Type: ${typeOptions})`;
    }
    return '';
  };

  return (
    <div className="space-y-6">
      {/* Main product selection - 4 column grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Product Type */}
        <div ref={productTypeRef}>
          <Label className="text-xs font-semibold block h-8 flex items-center">Product Type * (Ctrl+P)</Label>
          <Select value={selectedProductType} onValueChange={setSelectedProductType}>
            <SelectTrigger ref={productTypeRefInput} className="h-10">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {productTypes.map((pt) => (
                <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Brand */}
        <div>
          <Label className="text-xs font-semibold block h-8 flex items-center">Brand * (Ctrl+B)</Label>
          <Select value={selectedBrand} onValueChange={setSelectedBrand}>
            <SelectTrigger ref={brandRefInput} className="h-10">
              <SelectValue placeholder="Select brand" />
            </SelectTrigger>
            <SelectContent>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Item Type - Only show valid options */}
        <div>
          <Label className="text-xs font-semibold block h-8 flex items-center">Item Type * (Ctrl+T)</Label>
          <Select value={itemType} onValueChange={(v) => setItemType(v as typeof itemType)} disabled={!selectedProductType}>
            <SelectTrigger ref={itemTypeRefInput} className="h-10">
              <SelectValue placeholder="Select item type">
                {itemType === 'FULL_ROLL' && 'Full Roll'}
                {itemType === 'CUT_ROLL' && 'Cut Roll'}
                {itemType === 'BUNDLE' && 'Bundle'}
                {itemType === 'SPARE_PIECES' && 'Spare Pieces'}
                {!itemType && 'Select item type'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {isHDPE ? (
                <>
                  <SelectItem value="FULL_ROLL">Full Roll</SelectItem>
                  <SelectItem value="CUT_ROLL">Cut Roll</SelectItem>
                </>
              ) : isSprinkler ? (
                <>
                  <SelectItem value="BUNDLE">Bundle</SelectItem>
                  <SelectItem value="SPARE_PIECES">Spare Pieces</SelectItem>
                </>
              ) : (
                <SelectItem value="PLACEHOLDER" disabled>Select product type first</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Advanced Search/Parameters */}
        <div ref={productSearchRef}>
          <div className="h-8 flex flex-col justify-center">
            <Label className="text-xs font-semibold">
              Parameters (Ctrl+Shift+P)
            </Label>
            <span className="text-[10px] text-muted-foreground leading-tight">{getParameterHint()}</span>
          </div>
          <Input
            ref={parameterRefInput}
            value={advancedSearch}
            onChange={(e) => setAdvancedSearch(e.target.value)}
            placeholder={getParameterPlaceholder()}
            className="h-10"
            disabled={!selectedProductType}
          />
        </div>
      </div>

      {/* Item details section - only shows when item type is selected */}
      {itemType && (
        <div className="space-y-4 border-t pt-4">
          {/* For HDPE Rolls - Quantity and Length */}
          {isHDPE && (itemType === 'FULL_ROLL' || itemType === 'CUT_ROLL') && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-semibold">Quantity (Rolls) *</Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Enter quantity"
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Length (meters) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={rollLength}
                  onChange={(e) => setRollLength(e.target.value)}
                  placeholder="e.g., 100"
                  className="h-10"
                />
              </div>
              <div className="flex items-end">
                <p className="text-xs text-muted-foreground pb-2">
                  This length will be applied to all {quantity} roll(s)
                </p>
              </div>
            </div>
          )}

          {/* For Sprinkler Bundles - Quantity, Size, and Length */}
          {isSprinkler && itemType === 'BUNDLE' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs font-semibold">Quantity (Bundles) *</Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Enter quantity"
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Bundle Size *</Label>
                <Input
                  type="number"
                  min="1"
                  value={bundleSize}
                  onChange={(e) => setBundleSize(e.target.value)}
                  placeholder="Pieces per bundle"
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Piece Length (m) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={bundlePieceLength}
                  onChange={(e) => setBundlePieceLength(e.target.value)}
                  placeholder="Meters per piece"
                  className="h-10"
                />
              </div>
              <div className="flex items-end">
                <p className="text-xs text-muted-foreground pb-2">
                  Will create {quantity} bundle(s) with these specs
                </p>
              </div>
            </div>
          )}

          {/* For Sprinkler Spare Pieces */}
          {isSprinkler && itemType === 'SPARE_PIECES' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">Piece Count *</Label>
                <Input
                  type="number"
                  min="1"
                  value={pieceCount}
                  onChange={(e) => setPieceCount(e.target.value)}
                  placeholder="Count"
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Piece Length (m) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={pieceLength}
                  onChange={(e) => setPieceLength(e.target.value)}
                  placeholder="Meters"
                  className="h-10"
                />
              </div>
            </div>
          )}

          {/* Add to Cart Button */}
          <div className="flex justify-start pt-2">
            <Button onClick={handleAddItem} className="h-10 px-6" disabled={!selectedProductType || !selectedBrand}>
              <Plus className="h-4 w-4 mr-2" />
              Add to Cart
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
