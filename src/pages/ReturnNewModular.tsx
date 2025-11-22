import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { PackageX, Plus, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Customer {
  id: string;
  name: string;
  city?: string;
  phone?: string;
}

interface ProductType {
  id: string;
  name: string;
}

interface Brand {
  id: string;
  name: string;
}

interface ProductVariant {
  id: string;
  product_type_id: string;
  brand_id: string;
  parameters: any;
  product_type_name?: string;
  brand_name?: string;
}

interface ReturnItem {
  product_variant_id: string;
  product_type_name: string;
  brand_name: string;
  item_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE_PIECES';
  quantity: number;
  rolls?: { length_meters: number }[];
  bundles?: { bundle_size: number; piece_length_meters: number }[];
  piece_count?: number;
  piece_length_meters?: number;
  notes?: string;
}

const ReturnNewModular = () => {
  const { token } = useAuth();

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [returnDate, setReturnDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ReturnItem[]>([]);

  // Data state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  // New item form state
  const [newItemType, setNewItemType] = useState<'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE_PIECES'>('FULL_ROLL');
  const [newProductType, setNewProductType] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newQuantity, setNewQuantity] = useState('1');
  const [newRolls, setNewRolls] = useState<{ length_meters: number }[]>([]);
  const [newBundles, setNewBundles] = useState<{ bundle_size: number; piece_length_meters: number }[]>([]);
  const [newPieceCount, setNewPieceCount] = useState('');
  const [newPieceLength, setNewPieceLength] = useState('');

  const [loading, setLoading] = useState(false);

  // Fetch initial data
  useEffect(() => {
    if (token) {
      fetchCustomers();
      fetchProductTypes();
      fetchBrands();
    }
  }, [token]);

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/api/dispatch/customers');
      setCustomers(response.data.customers || []);
    } catch (error) {
      toast.error('Failed to fetch customers');
    }
  };

  const fetchProductTypes = async () => {
    try {
      const response = await api.get('/api/parameters/product-types');
      setProductTypes(response.data || []);
    } catch (error) {
      toast.error('Failed to fetch product types');
    }
  };

  const fetchBrands = async () => {
    try {
      const response = await api.get('/api/parameters/brands');
      setBrands(response.data || []);
    } catch (error) {
      toast.error('Failed to fetch brands');
    }
  };

  useEffect(() => {
    if (newProductType && newBrand) {
      fetchVariants();
    }
  }, [newProductType, newBrand]);

  const fetchVariants = async () => {
    try {
      const response = await api.get('/api/parameters/product-variants', {
        params: {
          product_type_id: newProductType,
          brand_id: newBrand
        }
      });
      setVariants(response.data || []);
    } catch (error) {
      console.error('Failed to fetch variants:', error);
    }
  };

  const addItem = () => {
    if (!newProductType || !newBrand) {
      toast.error('Please select product type and brand');
      return;
    }

    const quantity = parseInt(newQuantity);
    if (isNaN(quantity) || quantity < 1) {
      toast.error('Invalid quantity');
      return;
    }

    // Find variant
    const variant = variants.find(v =>
      v.product_type_id === newProductType && v.brand_id === newBrand
    );

    if (!variant) {
      toast.error('Product variant not found');
      return;
    }

    const productTypeName = productTypes.find(pt => pt.id === newProductType)?.name || '';
    const brandName = brands.find(b => b.id === newBrand)?.name || '';

    let newItem: ReturnItem = {
      product_variant_id: variant.id,
      product_type_name: productTypeName,
      brand_name: brandName,
      item_type: newItemType,
      quantity,
      notes: ''
    };

    // Validate based on item type
    if (newItemType === 'FULL_ROLL' || newItemType === 'CUT_ROLL') {
      if (newRolls.length !== quantity) {
        toast.error(`Please add exactly ${quantity} roll(s)`);
        return;
      }
      newItem.rolls = newRolls;
    } else if (newItemType === 'BUNDLE') {
      if (newBundles.length !== quantity) {
        toast.error(`Please add exactly ${quantity} bundle(s)`);
        return;
      }
      newItem.bundles = newBundles;
    } else if (newItemType === 'SPARE_PIECES') {
      const pieceCount = parseInt(newPieceCount);
      const pieceLength = parseFloat(newPieceLength);

      if (isNaN(pieceCount) || pieceCount < 1) {
        toast.error('Invalid piece count');
        return;
      }
      if (isNaN(pieceLength) || pieceLength <= 0) {
        toast.error('Invalid piece length');
        return;
      }

      newItem.piece_count = pieceCount;
      newItem.piece_length_meters = pieceLength;
      newItem.quantity = 1; // Spare pieces is a single entry
    }

    setItems([...items, newItem]);
    toast.success('Item added to return');

    // Reset form
    resetNewItemForm();
  };

  const resetNewItemForm = () => {
    setNewProductType('');
    setNewBrand('');
    setNewQuantity('1');
    setNewRolls([]);
    setNewBundles([]);
    setNewPieceCount('');
    setNewPieceLength('');
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
    toast.success('Item removed');
  };

  const addRoll = () => {
    setNewRolls([...newRolls, { length_meters: 0 }]);
  };

  const updateRollLength = (index: number, length: string) => {
    const updated = [...newRolls];
    updated[index].length_meters = parseFloat(length) || 0;
    setNewRolls(updated);
  };

  const removeRoll = (index: number) => {
    setNewRolls(newRolls.filter((_, i) => i !== index));
  };

  const addBundle = () => {
    setNewBundles([...newBundles, { bundle_size: 0, piece_length_meters: 0 }]);
  };

  const updateBundle = (index: number, field: 'bundle_size' | 'piece_length_meters', value: string) => {
    const updated = [...newBundles];
    updated[index][field] = parseFloat(value) || 0;
    setNewBundles(updated);
  };

  const removeBundle = (index: number) => {
    setNewBundles(newBundles.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!customerId) {
      toast.error('Please select a customer');
      return;
    }

    if (items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    try {
      setLoading(true);

      const payload = {
        customer_id: customerId,
        return_date: format(returnDate, 'yyyy-MM-dd'),
        notes,
        items
      };

      const response = await api.post('/api/returns/create', payload);

      toast.success(`Return ${response.data.return_number} created successfully`);

      // Reset form
      setCustomerId('');
      setReturnDate(new Date());
      setNotes('');
      setItems([]);
      resetNewItemForm();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create return');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-6">
        <PackageX className="h-8 w-8 text-orange-600" />
        <h1 className="text-3xl font-bold">Create Return</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Return Details */}
        <Card>
          <CardHeader>
            <CardTitle>Return Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Customer *</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name} {customer.city ? `- ${customer.city}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Return Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !returnDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {returnDate ? format(returnDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={returnDate}
                    onSelect={(date) => date && setReturnDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about this return..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Right Column - Add Item Form */}
        <Card>
          <CardHeader>
            <CardTitle>Add Item</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Item Type *</Label>
              <Select value={newItemType} onValueChange={(v: any) => {
                setNewItemType(v);
                setNewRolls([]);
                setNewBundles([]);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL_ROLL">Full Roll</SelectItem>
                  <SelectItem value="CUT_ROLL">Cut Roll</SelectItem>
                  <SelectItem value="BUNDLE">Bundle</SelectItem>
                  <SelectItem value="SPARE_PIECES">Spare Pieces</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Product Type *</Label>
              <Select value={newProductType} onValueChange={setNewProductType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product type" />
                </SelectTrigger>
                <SelectContent>
                  {productTypes.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Brand *</Label>
              <Select value={newBrand} onValueChange={setNewBrand}>
                <SelectTrigger>
                  <SelectValue placeholder="Select brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(newItemType === 'FULL_ROLL' || newItemType === 'CUT_ROLL') && (
              <>
                <div>
                  <Label>Number of Rolls *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Roll Lengths (meters)</Label>
                    <Button size="sm" variant="outline" onClick={addRoll}>
                      <Plus className="h-4 w-4 mr-1" /> Add Roll
                    </Button>
                  </div>
                  {newRolls.map((roll, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={`Roll ${index + 1} length`}
                        value={roll.length_meters || ''}
                        onChange={(e) => updateRollLength(index, e.target.value)}
                      />
                      <Button size="sm" variant="ghost" onClick={() => removeRoll(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {newItemType === 'BUNDLE' && (
              <>
                <div>
                  <Label>Number of Bundles *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Bundle Details</Label>
                    <Button size="sm" variant="outline" onClick={addBundle}>
                      <Plus className="h-4 w-4 mr-1" /> Add Bundle
                    </Button>
                  </div>
                  {newBundles.map((bundle, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Bundle size"
                        value={bundle.bundle_size || ''}
                        onChange={(e) => updateBundle(index, 'bundle_size', e.target.value)}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Piece length"
                        value={bundle.piece_length_meters || ''}
                        onChange={(e) => updateBundle(index, 'piece_length_meters', e.target.value)}
                      />
                      <Button size="sm" variant="ghost" onClick={() => removeBundle(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {newItemType === 'SPARE_PIECES' && (
              <>
                <div>
                  <Label>Number of Pieces *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newPieceCount}
                    onChange={(e) => setNewPieceCount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Piece Length (meters) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newPieceLength}
                    onChange={(e) => setNewPieceLength(e.target.value)}
                  />
                </div>
              </>
            )}

            <Button onClick={addItem} className="w-full">
              <Plus className="h-4 w-4 mr-2" /> Add to Return
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Items List */}
      {items.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Return Items ({items.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="flex items-start justify-between p-3 border rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">
                      {item.product_type_name} - {item.brand_name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Type: {item.item_type.replace('_', ' ')} | Quantity: {item.quantity}
                    </div>
                    {item.rolls && (
                      <div className="text-sm">
                        Rolls: {item.rolls.map(r => `${r.length_meters}m`).join(', ')}
                      </div>
                    )}
                    {item.bundles && (
                      <div className="text-sm">
                        Bundles: {item.bundles.map(b => `${b.bundle_size} pcs × ${b.piece_length_meters}m`).join(', ')}
                      </div>
                    )}
                    {item.piece_count && (
                      <div className="text-sm">
                        {item.piece_count} pieces × {item.piece_length_meters}m
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeItem(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Button */}
      <div className="flex justify-end gap-3 mt-6">
        <Button onClick={handleSubmit} disabled={loading || items.length === 0}>
          {loading ? 'Creating...' : 'Create Return'}
        </Button>
      </div>
    </div>
  );
};

export default ReturnNewModular;
