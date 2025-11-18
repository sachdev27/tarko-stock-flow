import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { TruckIcon, ScissorsIcon, PlusIcon, TrashIcon, SearchIcon, PackageIcon } from 'lucide-react';
import { inventory, dispatch as dispatchAPI, parameters as paramAPI } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/utils';

interface Roll {
  id: string;
  batch_code: string;
  batch_no: string;
  length_meters: number;
  initial_length_meters: number;
  status: string;
  roll_type: string;
  is_cut_roll: boolean;
  bundle_size?: number;
}

interface CartItem {
  roll_id: string;
  roll: Roll;
  quantity: number; // meters or pieces
  type: 'full' | 'partial';
}

const Dispatch = () => {
  const [loading, setLoading] = useState(false);
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [parameterOptions, setParameterOptions] = useState<Record<string, any[]>>({});

  // Search filters
  const [searchProductType, setSearchProductType] = useState('');
  const [searchBrand, setSearchBrand] = useState('');
  const [searchParameters, setSearchParameters] = useState<Record<string, string>>({});

  // Available inventory
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [cutRolls, setCutRolls] = useState<Roll[]>([]);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Sale details
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Cut dialog
  const [cutDialogOpen, setCutDialogOpen] = useState(false);
  const [rollToCut, setRollToCut] = useState<Roll | null>(null);
  const [cutLengths, setCutLengths] = useState<string[]>(['']);
  const [isCuttingFromCart, setIsCuttingFromCart] = useState(false);

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    try {
      const [productTypesRes, brandsRes, paramsRes, customersRes] = await Promise.all([
        inventory.getProductTypes(),
        inventory.getBrands(),
        paramAPI.getOptions(),
        inventory.getCustomers(),
      ]);

      setProductTypes(productTypesRes.data || []);
      setBrands(brandsRes.data || []);
      setParameterOptions(paramsRes.data || {});
      setCustomers(customersRes.data || []);
    } catch (error) {
      console.error('Error fetching master data:', error);
      toast.error('Failed to load master data');
    }
  };

  const searchRolls = async () => {
    if (!searchProductType || !searchBrand) {
      toast.error('Please select product type and brand');
      return;
    }

    setLoading(true);
    try {
      const response = await dispatchAPI.getAvailableRolls({
        product_type_id: searchProductType,
        brand_id: searchBrand,
        parameters: searchParameters,
      });

      setRolls(response.data?.standard_rolls || []);
      setCutRolls(response.data?.cut_rolls || []);

      if (!response.data?.standard_rolls?.length && !response.data?.cut_rolls?.length) {
        toast.info('No rolls found for selected product');
      }
    } catch (error: any) {
      console.error('Error fetching rolls:', error);
      toast.error(error.response?.data?.message || 'Failed to fetch available rolls');
      setRolls([]);
      setCutRolls([]);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (roll: Roll, isFull: boolean = true) => {
    const existingItem = cart.find(item => item.roll_id === roll.id);
    if (existingItem) {
      toast.info('Roll already in cart');
      return;
    }

    const newItem: CartItem = {
      roll_id: roll.id,
      roll: roll,
      quantity: isFull ? roll.length_meters : 0,
      type: isFull ? 'full' : 'partial',
    };

    setCart([...cart, newItem]);
    toast.success(`Added ${roll.batch_code} to cart`);
  };

  const updateCartQuantity = (roll_id: string, quantity: number) => {
    setCart(cart.map(item =>
      item.roll_id === roll_id ? { ...item, quantity } : item
    ));
  };

  const removeFromCart = (roll_id: string) => {
    setCart(cart.filter(item => item.roll_id !== roll_id));
    toast.success('Removed from cart');
  };

  const openCutDialog = (roll: Roll, fromCart: boolean = false) => {
    setRollToCut(roll);
    setIsCuttingFromCart(fromCart);
    setCutLengths(['']);
    setCutDialogOpen(true);
  };

  const handleCutRoll = async () => {
    if (!rollToCut) return;

    const lengths = cutLengths
      .map(l => parseFloat(l))
      .filter(l => !isNaN(l) && l > 0);

    if (lengths.length === 0) {
      toast.error('Please enter at least one valid length');
      return;
    }

    const totalCutLength = lengths.reduce((sum, l) => sum + l, 0);
    if (totalCutLength > rollToCut.length_meters) {
      toast.error(`Total cut length (${totalCutLength}m) exceeds roll length (${rollToCut.length_meters}m)`);
      return;
    }

    setLoading(true);
    try {
      await dispatchAPI.cutRoll({
        roll_id: rollToCut.id,
        lengths: lengths,
      });

      toast.success(`Roll cut into ${lengths.length} pieces`);
      setCutDialogOpen(false);

      // Remove from cart if cutting from cart
      if (isCuttingFromCart) {
        removeFromCart(rollToCut.id);
      }

      // Refresh rolls
      await searchRolls();
    } catch (error: any) {
      console.error('Error cutting roll:', error);
      toast.error(error.response?.data?.error || 'Failed to cut roll');
    } finally {
      setLoading(false);
    }
  };

  const handleDispatch = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }

    if (!selectedCustomerId) {
      toast.error('Please select a customer');
      return;
    }

    setLoading(true);
    try {
      const items = cart.map(item => ({
        roll_id: item.roll_id,
        type: item.type === 'full' ? 'full_roll' : 'partial_roll',
        quantity: item.quantity,
      }));

      await dispatchAPI.createDispatch({
        customer_id: selectedCustomerId,
        items: items,
        invoice_number: invoiceNumber || undefined,
        notes: notes || undefined,
      });

      toast.success('Sale completed successfully!');

      // Reset
      setCart([]);
      setSelectedCustomerId('');
      setInvoiceNumber('');
      setNotes('');
      setRolls([]);
      setCutRolls([]);
      setSearchProductType('');
      setSearchBrand('');
      setSearchParameters({});
    } catch (error: any) {
      console.error('Error creating dispatch:', error);
      toast.error(error.response?.data?.error || 'Failed to create sale');
    } finally {
      setLoading(false);
    }
  };

  const selectedProductTypeData = productTypes.find(pt => pt.id === searchProductType);
  const parameterSchema = selectedProductTypeData?.parameter_schema || [];
  const paramOrder = ['PE', 'PN', 'OD', 'Type'];

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dispatch / Sale</h1>
            <p className="text-muted-foreground">Search for products and create sales</p>
          </div>
          <TruckIcon className="h-8 w-8 text-muted-foreground" />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Search & Inventory */}
          <div className="md:col-span-2 space-y-6">
            {/* Search Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Search Products</CardTitle>
                <CardDescription>Find rolls and cut rolls by product details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Product Type *</Label>
                    <Select value={searchProductType} onValueChange={setSearchProductType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select product type" />
                      </SelectTrigger>
                      <SelectContent>
                        {productTypes.map(pt => (
                          <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Brand *</Label>
                    <Select value={searchBrand} onValueChange={setSearchBrand}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map(brand => (
                          <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Dynamic Parameters */}
                {parameterSchema.length > 0 && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {paramOrder
                      .filter(key => parameterSchema.find((p: any) => p.name === key))
                      .map(paramKey => (
                        <div key={paramKey} className="space-y-2">
                          <Label>{paramKey}</Label>
                          <Select
                            value={searchParameters[paramKey] || ''}
                            onValueChange={(value) => setSearchParameters({ ...searchParameters, [paramKey]: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={`Select ${paramKey}`} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">All {paramKey}</SelectItem>
                              {(parameterOptions[paramKey] || []).map((option: any) => (
                                <SelectItem key={option.id} value={option.value}>
                                  {option.value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                  </div>
                )}

                <Button onClick={searchRolls} disabled={loading} className="w-full">
                  <SearchIcon className="h-4 w-4 mr-2" />
                  {loading ? 'Searching...' : 'Search'}
                </Button>
              </CardContent>
            </Card>

            {/* Available Rolls */}
            {(rolls.length > 0 || cutRolls.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Available Inventory</CardTitle>
                  <CardDescription>
                    {rolls.length} standard rolls, {cutRolls.length} cut rolls
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Standard Rolls */}
                  {rolls.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-sm flex items-center gap-2">
                        <PackageIcon className="h-4 w-4" />
                        Standard Rolls
                      </h3>
                      <div className="space-y-2">
                        {rolls.map(roll => (
                          <div key={roll.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex-1">
                              <div className="font-medium">{roll.batch_code}</div>
                              <div className="text-sm text-muted-foreground">
                                {roll.length_meters}m available
                                {roll.bundle_size && ` • Bundle of ${roll.bundle_size}`}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openCutDialog(roll, false)}
                              >
                                <ScissorsIcon className="h-4 w-4 mr-1" />
                                Cut
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => addToCart(roll, true)}
                                disabled={cart.some(item => item.roll_id === roll.id)}
                              >
                                <PlusIcon className="h-4 w-4 mr-1" />
                                Add Full
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cut Rolls */}
                  {cutRolls.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-medium text-sm flex items-center gap-2">
                        <ScissorsIcon className="h-4 w-4" />
                        Cut Rolls
                      </h3>
                      <div className="space-y-2">
                        {cutRolls.map(roll => (
                          <div key={roll.id} className="flex items-center justify-between p-3 border rounded-lg bg-amber-50 dark:bg-amber-950/20">
                            <div className="flex-1">
                              <div className="font-medium">{roll.batch_code}</div>
                              <div className="text-sm text-muted-foreground">
                                {roll.length_meters}m available
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openCutDialog(roll, false)}
                              >
                                <ScissorsIcon className="h-4 w-4 mr-1" />
                                Cut Further
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => addToCart(roll, true)}
                                disabled={cart.some(item => item.roll_id === roll.id)}
                              >
                                <PlusIcon className="h-4 w-4 mr-1" />
                                Add
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Cart & Sale */}
          <div className="space-y-6">
            {/* Cart */}
            <Card>
              <CardHeader>
                <CardTitle>Cart ({cart.length})</CardTitle>
                <CardDescription>Total: {totalQuantity.toFixed(2)}m</CardDescription>
              </CardHeader>
              <CardContent>
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <PackageIcon className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>Cart is empty</p>
                    <p className="text-sm">Add rolls from inventory</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map(item => (
                      <div key={item.roll_id} className="p-3 border rounded-lg space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{item.roll.batch_code}</div>
                            <Badge variant="outline" className="text-xs mt-1">
                              {item.roll.is_cut_roll ? 'Cut Roll' : 'Standard'}
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFromCart(item.roll_id)}
                          >
                            <TrashIcon className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              max={item.roll.length_meters}
                              value={item.quantity}
                              onChange={(e) => updateCartQuantity(item.roll_id, parseFloat(e.target.value) || 0)}
                              className="h-8"
                            />
                            <span className="text-sm text-muted-foreground">
                              / {item.roll.length_meters}m
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => openCutDialog(item.roll, true)}
                          >
                            <ScissorsIcon className="h-3 w-3 mr-1" />
                            Cut Roll
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sale Details */}
            {cart.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Sale Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Customer *</Label>
                    <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map(customer => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Invoice Number</Label>
                    <Input
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional notes"
                      rows={3}
                    />
                  </div>

                  <Button
                    onClick={handleDispatch}
                    disabled={loading || !selectedCustomerId}
                    className="w-full"
                  >
                    <TruckIcon className="h-4 w-4 mr-2" />
                    {loading ? 'Processing...' : 'Complete Sale'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Cut Roll Dialog */}
        <Dialog open={cutDialogOpen} onOpenChange={setCutDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cut Roll</DialogTitle>
              <DialogDescription>
                {rollToCut && `Cutting ${rollToCut.batch_code} (${rollToCut.length_meters}m available)`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {cutLengths.map((length, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Length (m)"
                    value={length}
                    onChange={(e) => {
                      const newLengths = [...cutLengths];
                      newLengths[index] = e.target.value;
                      setCutLengths(newLengths);
                    }}
                  />
                  {cutLengths.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setCutLengths(cutLengths.filter((_, i) => i !== index))}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCutLengths([...cutLengths, ''])}
                className="w-full"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Another Piece
              </Button>

              <div className="text-sm text-muted-foreground">
                Total: {cutLengths.reduce((sum, l) => sum + (parseFloat(l) || 0), 0).toFixed(2)}m
                {rollToCut && ` / ${rollToCut.length_meters}m`}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCutDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCutRoll} disabled={loading}>
                {loading ? 'Cutting...' : 'Cut Roll'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Dispatch;
