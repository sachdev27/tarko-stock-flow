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
  is_cut_roll?: boolean;
  bundle_size?: number;
}

interface ProductVariant {
  product_label: string;
  product_type: string;
  brand: string;
  parameters: Record<string, any>;
  standard_rolls: Roll[];
  cut_rolls: Roll[];
  total_available_meters: number;
}

interface CartItem {
  product_label: string;
  product: ProductVariant;
  standard_roll_count: number;  // Number of standard rolls to dispatch
  cut_rolls: Roll[];  // Selected cut rolls
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
  const [searchQuery, setSearchQuery] = useState(''); // New unified search

  // Available inventory
  const [products, setProducts] = useState<ProductVariant[]>([]);
  const [allProducts, setAllProducts] = useState<ProductVariant[]>([]); // Store all products for filtering
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [cutRolls, setCutRolls] = useState<Roll[]>([]);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Sale details
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Dialogs
  const [cutDialogOpen, setCutDialogOpen] = useState(false);
  const [rollToCut, setRollToCut] = useState<Roll | null>(null);
  const [cutLengths, setCutLengths] = useState<string[]>(['']);
  const [cutLength, setCutLength] = useState<string>(''); // Single cut length
  const [isCuttingFromCart, setIsCuttingFromCart] = useState(false);
  const [cutRollDialogOpen, setCutRollDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductVariant | null>(null);

  useEffect(() => {
    fetchMasterData();
  }, []);

  // Auto-load products when product type and brand are selected
  useEffect(() => {
    if (searchProductType && searchBrand) {
      searchRolls();
    }
  }, [searchProductType, searchBrand]);

  useEffect(() => {
    // Filter products based on search query
    if (!searchQuery.trim()) {
      setProducts(allProducts);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = allProducts.filter(product => {
      // Check for comma-separated parameter search (e.g., "32,6,10" for OD,PN,PE)
      if (query.includes(',')) {
        const values = query.split(',').map(v => v.trim());
        const productParams = product.parameters || {};

        // Get parameter order based on product type
        const selectedProductType = productTypes.find(pt => pt.id === searchProductType);
        const isHDPE = selectedProductType?.name?.toLowerCase().includes('hdpe');
        const paramOrder = isHDPE ? ['OD', 'PN', 'PE'] : ['OD', 'PN', 'Type'];

        // Match each value in order against the parameter order
        return values.every((value, index) => {
          if (!value) return true; // Skip empty values
          const paramKey = paramOrder[index];
          if (!paramKey) return true;
          const paramValue = String(productParams[paramKey] || '').toLowerCase();
          return paramValue.includes(value);
        });
      }

      // Search in product type
      if (product.product_type.toLowerCase().includes(query)) return true;

      // Search in brand
      if (product.brand.toLowerCase().includes(query)) return true;

      // Search in parameter values
      if (product.parameters) {
        const paramValues = Object.values(product.parameters).map(v => String(v).toLowerCase());
        if (paramValues.some(v => v.includes(query))) return true;

        // Search in parameter keys + values (e.g., "od 32" or "pn 10")
        const paramEntries = Object.entries(product.parameters).map(([k, v]) =>
          `${k} ${v}`.toLowerCase()
        );
        if (paramEntries.some(e => e.includes(query))) return true;
      }

      return false;
    });

    setProducts(filtered);
  }, [searchQuery, allProducts, searchProductType, productTypes]);  const fetchMasterData = async () => {
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
    if (!searchProductType) {
      toast.error('Please select product type');
      return;
    }

    if (!searchBrand) {
      toast.error('Please select brand');
      return;
    }

    setLoading(true);
    try {
      // Filter out "all" placeholder values before sending to backend
      const filteredParameters = Object.fromEntries(
        Object.entries(searchParameters).filter(([_, value]) => value !== 'all')
      );

      const requestData: any = {
        product_type_id: searchProductType,
        parameters: filteredParameters,
      };

      // Only include brand_id if not "all"
      if (searchBrand !== 'all') {
        requestData.brand_id = searchBrand;
      }

      const response = await dispatchAPI.getAvailableRolls(requestData);

      const fetchedProducts = response.data?.products || [];
      setAllProducts(fetchedProducts);
      setProducts(fetchedProducts);
      setRolls([]);
      setCutRolls([]);

      if (fetchedProducts.length === 0) {
        toast.info('No products found');
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

  const addProductToCart = (product: ProductVariant, rollCount: number = 1) => {
    const existingItem = cart.find(item => item.product_label === product.product_label);
    if (existingItem) {
      // Update count
      setCart(cart.map(item =>
        item.product_label === product.product_label
          ? { ...item, standard_roll_count: item.standard_roll_count + rollCount }
          : item
      ));
      toast.success(`Updated quantity to ${existingItem.standard_roll_count + rollCount} rolls`);
    } else {
      const newItem: CartItem = {
        product_label: product.product_label,
        product: product,
        standard_roll_count: rollCount,
        cut_rolls: [],
      };
      setCart([...cart, newItem]);
      toast.success(`Added ${product.product_label} to cart`);
    }
  };

  const updateRollCount = (product_label: string, count: number) => {
    if (count <= 0) {
      setCart(cart.filter(item => item.product_label !== product_label));
      return;
    }
    setCart(cart.map(item =>
      item.product_label === product_label ? { ...item, standard_roll_count: count } : item
    ));
  };

  const addCutRollToCart = (product: ProductVariant, cutRoll: Roll) => {
    const existingItem = cart.find(item => item.product_label === product.product_label);
    if (existingItem) {
      if (existingItem.cut_rolls.some(r => r.id === cutRoll.id)) {
        toast.info('Cut roll already in cart');
        return;
      }
      setCart(cart.map(item =>
        item.product_label === product.product_label
          ? { ...item, cut_rolls: [...item.cut_rolls, cutRoll] }
          : item
      ));
    } else {
      const newItem: CartItem = {
        product_label: product.product_label,
        product: product,
        standard_roll_count: 0,
        cut_rolls: [cutRoll],
      };
      setCart([...cart, newItem]);
    }
    toast.success(`Added cut roll to cart`);
  };

  const removeCutRollFromCart = (product_label: string, cutRollId: string) => {
    setCart(cart.map(item => {
      if (item.product_label === product_label) {
        const newCutRolls = item.cut_rolls.filter(r => r.id !== cutRollId);
        return { ...item, cut_rolls: newCutRolls };
      }
      return item;
    }).filter(item => item.standard_roll_count > 0 || item.cut_rolls.length > 0));
  };

  const removeFromCart = (product_label: string) => {
    setCart(cart.filter(item => item.product_label !== product_label));
    toast.success('Removed from cart');
  };

  const openCutDialog = (roll: Roll, fromCart: boolean = false) => {
    setRollToCut(roll);
    setIsCuttingFromCart(fromCart);
    setCutLength('');
    setCutDialogOpen(true);
  };

  const handleCutRoll = async () => {
    if (!rollToCut) return;

    const cutLengthValue = parseFloat(cutLength);
    if (isNaN(cutLengthValue) || cutLengthValue <= 0) {
      toast.error('Please enter a valid cut length');
      return;
    }

    if (cutLengthValue >= rollToCut.length_meters) {
      toast.error(`Cut length must be less than roll length (${rollToCut.length_meters}m)`);
      return;
    }

    const remainingLength = rollToCut.length_meters - cutLengthValue;
    const lengths = [cutLengthValue, remainingLength];

    setLoading(true);
    try {
      await dispatchAPI.cutRoll({
        roll_id: rollToCut.id,
        cuts: lengths.map(length => ({ length })),
      });

      toast.success(`Roll cut into ${lengths.length} pieces`);
      setCutDialogOpen(false);

      // Refresh products list to show updated inventory
      await searchRolls();

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
      // Flatten cart items into individual roll dispatches
      const items = cart.flatMap(item => {
        const standardRollItems = item.product.standard_rolls
          .slice(0, item.standard_roll_count)
          .map(roll => ({
            roll_id: roll.id,
            type: 'full_roll',
            quantity: roll.length_meters,
          }));

        const cutRollItems = item.cut_rolls.map(roll => ({
          roll_id: roll.id,
          type: 'full_roll',
          quantity: roll.length_meters,
        }));

        return [...standardRollItems, ...cutRollItems];
      });

      await dispatchAPI.createDispatch({
        customer_id: selectedCustomerId,
        items: items,
        invoice_number: invoiceNumber || undefined,
        notes: notes || undefined,
      });

      toast.success('Sale completed successfully!');

      // Reset everything including clearing the product selection
      setCart([]);
      setSelectedCustomerId('');
      setInvoiceNumber('');
      setNotes('');
      setProducts([]);
      setAllProducts([]);
      setRolls([]);
      setCutRolls([]);
      setSearchProductType('');
      setSearchBrand('');
      setSearchParameters({});
      setSearchQuery('');
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

  const totalRolls = cart.reduce((sum, item) => sum + item.standard_roll_count + item.cut_rolls.length, 0);
  const totalMeters = cart.reduce((sum, item) => {
    const standardMeters = item.standard_roll_count > 0 ?
      item.product.standard_rolls.slice(0, item.standard_roll_count).reduce((s, r) => s + r.length_meters, 0) : 0;
    const cutMeters = item.cut_rolls.reduce((s, r) => s + r.length_meters, 0);
    return sum + standardMeters + cutMeters;
  }, 0);

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
                        <SelectItem value="all">All Brands</SelectItem>
                        {brands.map(brand => (
                          <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {loading && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading products...
                  </div>
                )}

                {loading && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading products...
                  </div>
                )}

                {allProducts.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAllProducts([]);
                      setProducts([]);
                      setSearchQuery('');
                      setSearchProductType('');
                      setSearchBrand('');
                    }}
                    className="w-full"
                  >
                    Clear Selection
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Smart Search Input */}
            {allProducts.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <Label>Filter Products</Label>
                    <div className="relative">
                      <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search: '32,6,10' for OD,PN,PE (HDPE) or 'OD,PN,Type' (Sprinkler) or any keyword..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {searchQuery && (
                      <p className="text-xs text-muted-foreground">
                        Showing {products.length} of {allProducts.length} products
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Available Products */}
            {products.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Available Inventory</CardTitle>
                  <CardDescription>
                    {products.length} product variant{products.length !== 1 ? 's' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {products.map((product, idx) => (
                    <div key={idx} className="border rounded-lg p-4 space-y-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                      {/* Product Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-base">{product.product_type}</h3>
                            <Badge variant="secondary" className="text-sm">
                              {product.brand}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {Object.entries(product.parameters || {}).map(([key, value]) => (
                              <Badge key={key} className="text-xs font-bold bg-primary/10 text-primary border-primary/20">
                                {key}: {value}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            <span className="font-bold text-lg">{product.standard_rolls.length + product.cut_rolls.length} rolls</span>
                            <span className="text-xs ml-2">({product.total_available_meters}m available)</span>
                          </p>
                        </div>
                      </div>

                      {/* Standard Rolls Summary */}
                      {product.standard_rolls.length > 0 && (
                        <div className="flex items-center justify-between">
                          <div className="text-sm">
                            <span className="font-bold text-base">{product.standard_rolls.length}</span>
                            <span className="text-muted-foreground ml-1">standard rolls</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedProduct(product);
                              setCutRollDialogOpen(true);
                            }}
                          >
                            <PackageIcon className="h-4 w-4 mr-1" />
                            View & Cut Rolls
                          </Button>
                        </div>
                      )}

                      {/* Cut Rolls - Grouped by Length */}
                      {product.cut_rolls.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-sm">
                            <span className="font-bold text-base">{product.cut_rolls.length}</span>
                            <span className="text-muted-foreground ml-1">cut rolls available</span>
                          </div>
                          <div className="space-y-1">
                            {(() => {
                              // Group cut rolls by length
                              const grouped = product.cut_rolls.reduce((acc, roll) => {
                                const key = roll.length_meters.toString();
                                if (!acc[key]) {
                                  acc[key] = [];
                                }
                                acc[key].push(roll);
                                return acc;
                              }, {} as Record<string, typeof product.cut_rolls>);

                              return Object.entries(grouped).map(([length, rolls]) => {
                                const allInCart = rolls.every(roll =>
                                  cart
                                    .find(item => item.product_label === product.product_label)
                                    ?.cut_rolls.some(r => r.id === roll.id)
                                );

                                return (
                                  <div
                                    key={length}
                                    className={`flex items-center justify-between p-2 rounded text-sm transition-colors ${
                                      allInCart
                                        ? 'bg-green-50 dark:bg-green-950/30 border border-green-200'
                                        : 'bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3 flex-1">
                                      <Badge variant="secondary" className="text-xs">CUT</Badge>
                                      <span className="font-bold text-base">{length}m</span>
                                      <span className="text-xs text-muted-foreground">× {rolls.length} pieces</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {!allInCart && rolls.map(roll => {
                                        const isInCart = cart
                                          .find(item => item.product_label === product.product_label)
                                          ?.cut_rolls.some(r => r.id === roll.id);

                                        return !isInCart ? (
                                          <Button
                                            key={roll.id}
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2"
                                            onClick={() => addCutRollToCart(product, roll)}
                                          >
                                            <PlusIcon className="h-3 w-3 mr-1" />
                                            Add
                                          </Button>
                                        ) : null;
                                      })}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2"
                                        onClick={() => {
                                          openCutDialog(rolls[0], false);
                                        }}
                                      >
                                        <ScissorsIcon className="h-3 w-3" />
                                      </Button>
                                      {allInCart && (
                                        <Badge variant="default" className="text-xs">All Added</Badge>
                                      )}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Add to Cart Controls */}
                      <div className="flex items-center gap-3 pt-2 border-t">
                        {/* Standard Rolls */}
                        {product.standard_rolls.length > 0 && (
                          <div className="flex-1 flex items-center gap-2">
                            <Label className="text-sm whitespace-nowrap">Standard Rolls:</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                max={product.standard_rolls.length}
                                defaultValue="0"
                                className="w-20 h-9"
                                id={`roll-count-${idx}`}
                              />
                              <span className="text-xs text-muted-foreground">/ {product.standard_rolls.length}</span>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => {
                                const input = document.getElementById(`roll-count-${idx}`) as HTMLInputElement;
                                let count = parseInt(input.value) || 0;
                                const maxAvailable = product.standard_rolls.length;

                                if (count > maxAvailable) {
                                  toast.error(`Only ${maxAvailable} rolls available`);
                                  input.value = maxAvailable.toString();
                                  count = maxAvailable;
                                }

                                if (count > 0) {
                                  addProductToCart(product, count);
                                  input.value = '0';
                                }
                              }}
                            >
                              <PlusIcon className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          </div>
                        )}


                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Cart & Sale */}
          <div className="space-y-6">
            {/* Cart */}
            <Card>
              <CardHeader>
                <CardTitle>Cart ({totalRolls} rolls)</CardTitle>
                <CardDescription>Total: <span className="font-bold">{totalMeters.toFixed(2)}m</span></CardDescription>
              </CardHeader>
              <CardContent>
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <PackageIcon className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>Cart is empty</p>
                    <p className="text-sm">Select quantity from products</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item, idx) => (
                      <div key={idx} className="p-3 border rounded-lg space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{item.product_label}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFromCart(item.product_label)}
                          >
                            <TrashIcon className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>

                        {/* Standard Rolls */}
                        {item.standard_roll_count > 0 && (
                          <div className="flex items-center justify-between text-sm bg-slate-50 dark:bg-slate-800 p-2 rounded">
                            <span className="text-muted-foreground">Standard Rolls:</span>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                max={item.product.standard_rolls.length}
                                value={item.standard_roll_count}
                                onChange={(e) => updateRollCount(item.product_label, parseInt(e.target.value) || 0)}
                                className="w-16 h-7 text-sm"
                              />
                              <span className="text-muted-foreground text-xs">
                                (<span className="font-bold">{item.product.standard_rolls.slice(0, item.standard_roll_count).reduce((s, r) => s + r.length_meters, 0).toFixed(0)}m</span>)
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Cut Rolls */}
                        {item.cut_rolls.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-muted-foreground">Cut Rolls:</div>
                            {item.cut_rolls.map((roll, ridx) => (
                              <div key={ridx} className="flex items-center justify-between text-sm bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
                                <span className="text-xs">{roll.batch_code} - <span className="font-bold">{roll.length_meters}m</span></span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={() => removeCutRollFromCart(item.product_label, roll.id)}
                                >
                                  <TrashIcon className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
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

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Cut Length (meters)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={rollToCut?.length_meters}
                  placeholder="Enter length to cut"
                  value={cutLength}
                  onChange={(e) => setCutLength(e.target.value)}
                  autoFocus
                />
              </div>

              {cutLength && rollToCut && parseFloat(cutLength) > 0 && parseFloat(cutLength) < rollToCut.length_meters && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-2">
                  <div className="text-sm font-medium">Result:</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 bg-white dark:bg-slate-800 rounded border">
                      <div className="text-xs text-muted-foreground">Cut Piece</div>
                      <div className="font-bold text-lg">{parseFloat(cutLength).toFixed(2)}m</div>
                    </div>
                    <div className="p-2 bg-white dark:bg-slate-800 rounded border">
                      <div className="text-xs text-muted-foreground">Remaining</div>
                      <div className="font-bold text-lg">{(rollToCut.length_meters - parseFloat(cutLength)).toFixed(2)}m</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Original roll length: {rollToCut?.length_meters}m
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

        {/* View & Cut Rolls Dialog */}
        <Dialog open={cutRollDialogOpen} onOpenChange={setCutRollDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>View & Cut Rolls</DialogTitle>
              <DialogDescription>
                {selectedProduct && (
                  <div className="flex items-center gap-2 mt-2">
                    <span>{selectedProduct.product_type} - {selectedProduct.brand}</span>
                    <div className="flex gap-1">
                      {Object.entries(selectedProduct.parameters || {}).map(([key, value]) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}: {value}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Standard Rolls */}
              {selectedProduct && selectedProduct.standard_rolls.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Standard Rolls ({selectedProduct.standard_rolls.length} total)</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {(() => {
                      // Group rolls by length and bundle size
                      const grouped = selectedProduct.standard_rolls.reduce((acc, roll) => {
                        const key = `${roll.length_meters}-${roll.bundle_size || 'none'}`;
                        if (!acc[key]) {
                          acc[key] = {
                            length: roll.length_meters,
                            bundle_size: roll.bundle_size,
                            rolls: []
                          };
                        }
                        acc[key].rolls.push(roll);
                        return acc;
                      }, {} as Record<string, { length: number; bundle_size?: number; rolls: Roll[] }>);

                      return Object.values(grouped).map((group, idx) => (
                        <div key={idx} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="font-bold text-lg">{group.length}m</div>
                              {group.bundle_size && (
                                <Badge variant="outline" className="text-xs">
                                  Bundle: {group.bundle_size}
                                </Badge>
                              )}
                              <span className="text-sm text-muted-foreground">
                                × {group.rolls.length} rolls
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                openCutDialog(group.rolls[0], false);
                                setCutRollDialogOpen(false);
                              }}
                            >
                              <ScissorsIcon className="h-4 w-4 mr-1" />
                              Cut One
                            </Button>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Batches: {[...new Set(group.rolls.map(r => r.batch_code))].join(', ')}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {/* Cut Rolls */}
              {selectedProduct && selectedProduct.cut_rolls.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Cut Rolls</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectedProduct.cut_rolls.map(roll => {
                      const alreadyInCart = cart
                        .find(item => item.product_label === selectedProduct.product_label)
                        ?.cut_rolls.some(r => r.id === roll.id);

                      return (
                        <div key={roll.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900">
                          <div className="flex items-center gap-3 flex-1">
                            <Badge variant="secondary" className="text-xs">CUT</Badge>
                            <div className="flex-1">
                              <div className="font-medium text-sm">{roll.batch_code}</div>
                              <div className="text-xs text-muted-foreground">
                                {roll.initial_length_meters}m → {roll.length_meters}m
                              </div>
                            </div>
                            <div className="font-bold">{roll.length_meters}m</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                openCutDialog(roll, false);
                                setCutRollDialogOpen(false);
                              }}
                            >
                              <ScissorsIcon className="h-4 w-4 mr-1" />
                              Cut Further
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                addCutRollToCart(selectedProduct, roll);
                              }}
                              disabled={alreadyInCart}
                            >
                              {alreadyInCart ? 'Added' : 'Add to Cart'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => setCutRollDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Dispatch;
