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
import { TruckIcon, ScissorsIcon, PlusIcon, TrashIcon } from 'lucide-react';
import { inventory, dispatch as dispatchAPI, parameters as paramAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Roll {
  id: string;
  batch_code: string;
  batch_no: string;
  length_meters: number;
  initial_length_meters: number;
  status: string;
  roll_type: string;
  bundle_size?: number;
}

interface DispatchItem {
  roll_id: string;
  type: 'full_roll' | 'partial_roll';
  quantity: number;
  roll: Roll;
}

const Dispatch = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [productTypes, setProductTypes] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [parameterOptions, setParameterOptions] = useState<Record<string, any[]>>({});

  // Step 1: Product Selection
  const [selectedProductTypeId, setSelectedProductTypeId] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [selectedParameters, setSelectedParameters] = useState<Record<string, string>>({});

  // Step 2: Available Rolls
  const [availableRolls, setAvailableRolls] = useState<{
    standard_rolls: Roll[];
    cut_rolls: Roll[];
    bundles: Roll[];
    spares: Roll[];
    product_type: string;
    brand: string;
  } | null>(null);

  // Step 3: Dispatch Items
  const [dispatchItems, setDispatchItems] = useState<DispatchItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Cut roll dialog
  const [cutDialogOpen, setCutDialogOpen] = useState(false);
  const [rollToCut, setRollToCut] = useState<Roll | null>(null);
  const [cutLengths, setCutLengths] = useState<string[]>(['']);

  // Cut bundle dialog (for sprinkler pipes)
  const [cutBundleDialogOpen, setCutBundleDialogOpen] = useState(false);
  const [bundleToCut, setBundleToCut] = useState<Roll | null>(null);
  const [bundleCutPieces, setBundleCutPieces] = useState<string[]>(['']);

  // Combine spares dialog (for sprinkler pipes)
  const [combineSparesDialogOpen, setCombineSparesDialogOpen] = useState(false);
  const [selectedSpares, setSelectedSpares] = useState<string[]>([]);
  const [combineBundleSize, setCombineBundleSize] = useState('');
  const [combineNumBundles, setCombineNumBundles] = useState('1');

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

      if (productTypesRes.data) setProductTypes(productTypesRes.data);
      if (brandsRes.data) setBrands(brandsRes.data);
      if (paramsRes.data) setParameterOptions(paramsRes.data);
      if (customersRes.data) setCustomers(customersRes.data);
    } catch (error) {
      console.error('Error fetching master data:', error);
      toast.error('Failed to load master data');
    }
  };

  const fetchAvailableRolls = async () => {
    if (!selectedProductTypeId || !selectedBrandId) {
      toast.error('Please select product type and brand');
      return;
    }

    // Check if all required parameters are filled
    const selectedPT = productTypes.find(pt => pt.id === selectedProductTypeId);
    const requiredParams = selectedPT?.parameters || {};
    const missingParams = Object.keys(requiredParams).filter(key => !selectedParameters[key]);

    if (missingParams.length > 0) {
      toast.error(`Please select: ${missingParams.join(', ')}`);
      return;
    }

    try {
      setLoading(true);
      const response = await dispatchAPI.getAvailableRolls({
        product_type_id: selectedProductTypeId,
        brand_id: selectedBrandId,
        parameters: selectedParameters
      });

      const data = response.data || {};
      // Backend returns products array, take the first product or merge all
      const products = data.products || [];

      // If there are products, use the first one (or merge if multiple)
      let availableData = {
        standard_rolls: [],
        cut_rolls: [],
        bundles: [],
        spares: [],
        product_type: '',
        brand: ''
      };

      if (products.length > 0) {
        // Merge all products into one (in case multiple batches)
        availableData = {
          standard_rolls: products.flatMap((p: any) => p.standard_rolls || []),
          cut_rolls: products.flatMap((p: any) => p.cut_rolls || []),
          bundles: products.flatMap((p: any) => p.bundles || []),
          spares: products.flatMap((p: any) => p.spares || []),
          product_type: products[0].product_type || '',
          brand: products[0].brand || ''
        };
      }

      setAvailableRolls(availableData);

      if (availableData.standard_rolls.length === 0 &&
          availableData.cut_rolls.length === 0 &&
          availableData.bundles.length === 0 &&
          availableData.spares.length === 0) {
        toast.info('No available rolls found for this product');
      }
    } catch (error: any) {
      console.error('Error fetching rolls:', error);
      toast.error(error.response?.data?.error || 'Failed to fetch available rolls');
    } finally {
      setLoading(false);
    }
  };  const addFullRollToDispatch = (roll: Roll) => {
    const existing = dispatchItems.find(item => item.roll_id === roll.id);
    if (existing) {
      toast.info('This roll is already added');
      return;
    }

    setDispatchItems([...dispatchItems, {
      roll_id: roll.id,
      type: 'full_roll',
      quantity: 1,
      roll
    }]);
    toast.success('Roll added to dispatch');
  };

  const addPartialRollToDispatch = (roll: Roll, quantity: number) => {
    if (quantity <= 0 || quantity > roll.length_meters) {
      toast.error('Invalid quantity');
      return;
    }

    const existing = dispatchItems.find(item => item.roll_id === roll.id);
    if (existing) {
      toast.info('This roll is already added');
      return;
    }

    setDispatchItems([...dispatchItems, {
      roll_id: roll.id,
      type: 'partial_roll',
      quantity,
      roll
    }]);
    toast.success('Partial roll added to dispatch');
  };

  const removeDispatchItem = (rollId: string) => {
    setDispatchItems(dispatchItems.filter(item => item.roll_id !== rollId));
  };

  const handleCutRoll = async () => {
    if (!rollToCut) return;

    const cuts = cutLengths
      .map(l => parseFloat(l))
      .filter(l => l > 0);

    if (cuts.length === 0) {
      toast.error('Please enter at least one cut length');
      return;
    }

    const totalCut = cuts.reduce((sum, l) => sum + l, 0);
    if (totalCut > rollToCut.length_meters) {
      toast.error(`Total cut length (${totalCut}m) exceeds available length (${rollToCut.length_meters}m)`);
      return;
    }

    try {
      setLoading(true);
      await dispatchAPI.cutRoll({
        roll_id: rollToCut.id,
        cuts: cuts.map(length => ({ length }))
      });

      toast.success('Roll cut successfully!');
      setCutDialogOpen(false);
      setRollToCut(null);
      setCutLengths(['']);

      // Refresh available rolls
      fetchAvailableRolls();
    } catch (error: any) {
      console.error('Error cutting roll:', error);
      toast.error(error.response?.data?.error || 'Failed to cut roll');
    } finally {
      setLoading(false);
    }
  };

  const handleCutBundle = async () => {
    if (!bundleToCut) return;

    const pieces = bundleCutPieces
      .map(p => parseInt(p))
      .filter(p => p > 0);

    if (pieces.length === 0) {
      toast.error('Please enter at least one piece count');
      return;
    }

    const totalPieces = pieces.reduce((sum, p) => sum + p, 0);
    if (totalPieces > bundleToCut.bundle_size!) {
      toast.error(`Total pieces (${totalPieces}) exceeds bundle size (${bundleToCut.bundle_size})`);
      return;
    }

    try {
      setLoading(true);
      await dispatchAPI.cutBundle({
        roll_id: bundleToCut.id,
        cuts: pieces.map(pcs => ({ pieces: pcs }))
      });

      toast.success('Bundle cut successfully!');
      setCutBundleDialogOpen(false);
      setBundleToCut(null);
      setBundleCutPieces(['']);

      // Refresh available rolls
      fetchAvailableRolls();
    } catch (error: any) {
      console.error('Error cutting bundle:', error);
      toast.error(error.response?.data?.error || 'Failed to cut bundle');
    } finally {
      setLoading(false);
    }
  };

  const handleCombineSpares = async () => {
    if (selectedSpares.length === 0) {
      toast.error('Please select at least one spare piece');
      return;
    }

    const bundleSize = parseInt(combineBundleSize);
    const numBundles = parseInt(combineNumBundles);

    if (!bundleSize || bundleSize <= 0) {
      toast.error('Please enter a valid bundle size');
      return;
    }

    if (!numBundles || numBundles <= 0) {
      toast.error('Please enter a valid number of bundles');
      return;
    }

    // Calculate total pieces available
    const totalPieces = selectedSpares.reduce((sum, spareId) => {
      const spare = availableRolls?.spares.find(s => s.id === spareId);
      return sum + (spare?.bundle_size || 0);
    }, 0);

    const piecesNeeded = bundleSize * numBundles;
    if (piecesNeeded > totalPieces) {
      toast.error(`Not enough pieces. Need ${piecesNeeded}, have ${totalPieces}`);
      return;
    }

    try {
      setLoading(true);
      await dispatchAPI.combineSpares({
        spare_roll_ids: selectedSpares,
        bundle_size: bundleSize,
        number_of_bundles: numBundles
      });

      toast.success(`${numBundles} bundle(s) created successfully!`);
      setCombineSparesDialogOpen(false);
      setSelectedSpares([]);
      setCombineBundleSize('');
      setCombineNumBundles('1');

      // Refresh available rolls
      fetchAvailableRolls();
    } catch (error: any) {
      console.error('Error combining spares:', error);
      toast.error(error.response?.data?.error || 'Failed to combine spares');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDispatch = async () => {
    if (dispatchItems.length === 0) {
      toast.error('Please add at least one roll to dispatch');
      return;
    }

    if (!selectedCustomerId) {
      toast.error('Please select a customer');
      return;
    }

    try {
      setLoading(true);
      await dispatchAPI.createDispatch({
        customer_id: selectedCustomerId,
        invoice_number: invoiceNumber,
        notes,
        items: dispatchItems.map(item => ({
          type: item.type,
          roll_id: item.roll_id,
          quantity: item.quantity
        }))
      });

      toast.success('Dispatch created successfully!');

      // Reset form
      setDispatchItems([]);
      setSelectedCustomerId('');
      setInvoiceNumber('');
      setNotes('');
      setAvailableRolls(null);
      setSelectedProductTypeId('');
      setSelectedBrandId('');
      setSelectedParameters({});
    } catch (error: any) {
      console.error('Error creating dispatch:', error);
      toast.error(error.response?.data?.error || 'Failed to create dispatch');
    } finally {
      setLoading(false);
    }
  };

  const selectedProductType = productTypes.find(pt => pt.id === selectedProductTypeId);
  const requiredParameters = selectedProductType?.parameters || {};
  const paramOrder = ['PE', 'PN', 'OD', 'Type'];
  const sortedParamKeys = Object.keys(requiredParameters).sort((a, b) => {
    const indexA = paramOrder.indexOf(a);
    const indexB = paramOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  const totalDispatchQuantity = dispatchItems.reduce((sum, item) => {
    return sum + (item.type === 'full_roll' ? item.roll.length_meters : item.quantity);
  }, 0);

  return (
    <Layout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dispatch Entry</h1>
            <p className="text-muted-foreground">Select product, choose rolls, and create dispatch</p>
          </div>
          <TruckIcon className="h-8 w-8 text-muted-foreground" />
        </div>

        {/* Step 1: Product Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Select Product</CardTitle>
            <CardDescription>Choose the product type, brand, and parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Product Type */}
              <div className="space-y-2">
                <Label>Product Type *</Label>
                <Select
                  value={selectedProductTypeId}
                  onValueChange={(value) => {
                    setSelectedProductTypeId(value);
                    setSelectedParameters({});
                    setAvailableRolls(null);
                  }}
                >
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

              {/* Brand */}
              <div className="space-y-2">
                <Label>Brand *</Label>
                <Select
                  value={selectedBrandId}
                  onValueChange={(value) => {
                    setSelectedBrandId(value);
                    setAvailableRolls(null);
                  }}
                >
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

              {/* Parameters */}
              {sortedParamKeys.map(paramKey => (
                <div key={paramKey} className="space-y-2">
                  <Label>{paramKey} *</Label>
                  <Select
                    value={selectedParameters[paramKey] || ''}
                    onValueChange={(value) => {
                      setSelectedParameters({ ...selectedParameters, [paramKey]: value });
                      setAvailableRolls(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${paramKey}`} />
                    </SelectTrigger>
                    <SelectContent>
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

            <Button onClick={fetchAvailableRolls} disabled={loading}>
              {loading ? 'Loading...' : 'Show Available Rolls'}
            </Button>
          </CardContent>
        </Card>

        {/* Step 2: Available Rolls */}
        {availableRolls && (
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Available Rolls</CardTitle>
              <CardDescription>
                {availableRolls.brand} - {Object.entries(selectedParameters).map(([k, v]) => `${k}: ${v}`).join(', ')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Standard Rolls */}
              {(availableRolls.standard_rolls?.length ?? 0) > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Badge variant="default">Standard Rolls ({availableRolls.standard_rolls?.length ?? 0})</Badge>
                  </h3>
                  <div className="grid gap-3">
                    {availableRolls.standard_rolls?.map((roll) => (
                      <Card key={roll.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{roll.batch_code}</p>
                            <p className="text-sm text-muted-foreground">
                              {roll.length_meters.toFixed(2)}m available
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRollToCut(roll);
                                setCutDialogOpen(true);
                              }}
                            >
                              <ScissorsIcon className="h-4 w-4 mr-1" />
                              Cut
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => addFullRollToDispatch(roll)}
                            >
                              Add Full Roll
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const qty = prompt(`Enter quantity to dispatch (max ${roll.length_meters}m):`);
                                if (qty) addPartialRollToDispatch(roll, parseFloat(qty));
                              }}
                            >
                              Add Partial
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Cut Rolls */}
              {(availableRolls.cut_rolls?.length ?? 0) > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Badge variant="secondary">Cut Rolls ({availableRolls.cut_rolls?.length ?? 0})</Badge>
                  </h3>
                  <div className="grid gap-3">
                    {availableRolls.cut_rolls?.map((roll) => (
                      <Card key={roll.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{roll.batch_code} (Cut)</p>
                            <p className="text-sm text-muted-foreground">
                              {roll.length_meters.toFixed(2)}m available
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRollToCut(roll);
                                setCutDialogOpen(true);
                              }}
                            >
                              <ScissorsIcon className="h-4 w-4 mr-1" />
                              Cut Further
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => addFullRollToDispatch(roll)}
                            >
                              Add Full
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const qty = prompt(`Enter quantity to dispatch (max ${roll.length_meters}m):`);
                                if (qty) addPartialRollToDispatch(roll, parseFloat(qty));
                              }}
                            >
                              Add Partial
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Bundles */}
              {(availableRolls.bundles?.length ?? 0) > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Badge variant="outline">
                      Bundles ({availableRolls.bundles?.reduce((sum, b) => sum + (b.bundle_size || 0), 0) ?? 0} pieces total from {availableRolls.bundles?.length ?? 0} bundles)
                    </Badge>
                  </h3>
                  <div className="grid gap-3">
                    {(() => {
                      // Group bundles by size
                      const bundlesBySize = availableRolls.bundles?.reduce((acc, roll) => {
                        const size = roll.bundle_size || 0;
                        if (!acc[size]) {
                          acc[size] = [];
                        }
                        acc[size].push(roll);
                        return acc;
                      }, {} as Record<number, typeof availableRolls.bundles>);

                      return Object.entries(bundlesBySize || {}).map(([size, bundles]) => (
                        <div key={size} className="space-y-2">
                          <div className="text-sm font-medium text-muted-foreground">
                            Bundle Size: {size} pieces ({bundles.length} bundle{bundles.length > 1 ? 's' : ''})
                          </div>
                          {bundles.map((roll) => (
                            <Card key={roll.id} className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{roll.batch_code} - Bundle of {roll.bundle_size}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {roll.bundle_size} pieces per bundle
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  {availableRolls.product_type === 'Sprinkler Pipe' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setBundleToCut(roll);
                                        setCutBundleDialogOpen(true);
                                      }}
                                    >
                                      <ScissorsIcon className="h-4 w-4 mr-1" />
                                      Cut Bundle
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    onClick={() => addFullRollToDispatch(roll)}
                                  >
                                    Add Bundle
                                  </Button>
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {/* Spare Pieces */}
              {(availableRolls.spares?.length ?? 0) > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-300">
                      Spare Pieces ({availableRolls.spares?.reduce((sum, s) => sum + (s.bundle_size || 0), 0) ?? 0} pieces total)
                    </Badge>
                    {availableRolls.product_type === 'Sprinkler Pipe' && availableRolls.spares.length > 0 && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => setCombineSparesDialogOpen(true)}
                      >
                        <PlusIcon className="h-4 w-4 mr-1" />
                        Combine into Bundles
                      </Button>
                    )}
                  </h3>
                  <div className="grid gap-3">
                    {availableRolls.spares?.map((roll) => (
                      <Card key={roll.id} className="p-4 border-amber-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{roll.batch_code} - Spare Pieces</p>
                            <p className="text-sm text-muted-foreground">
                              {roll.bundle_size} pieces available
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => addFullRollToDispatch(roll)}
                          >
                            Add Spares
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Dispatch Items & Submit */}
        {dispatchItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Review & Dispatch</CardTitle>
              <CardDescription>Review items and complete the dispatch</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Dispatch Items List */}
              <div className="space-y-2">
                <Label>Items to Dispatch</Label>
                {dispatchItems.map((item) => (
                  <div key={item.roll_id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{item.roll.batch_code}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.type === 'full_roll'
                          ? `Full roll - ${item.roll.length_meters.toFixed(2)}m`
                          : `Partial - ${item.quantity.toFixed(2)}m`
                        }
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeDispatchItem(item.roll_id)}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <p className="font-semibold">Total: {totalDispatchQuantity.toFixed(2)}m</p>
                </div>
              </div>

              {/* Customer Selection */}
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(customer => (
                      <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Invoice Number */}
              <div className="space-y-2">
                <Label>Invoice Number (Optional)</Label>
                <Input
                  placeholder="Enter invoice number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  placeholder="Add any notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                onClick={handleCreateDispatch}
                disabled={loading || !selectedCustomerId}
                className="w-full"
                size="lg"
              >
                {loading ? 'Creating...' : 'Create Dispatch'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Cut Roll Dialog */}
        <Dialog open={cutDialogOpen} onOpenChange={setCutDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cut Roll</DialogTitle>
              <DialogDescription>
                {rollToCut && `Cutting ${rollToCut.batch_code} - ${rollToCut.length_meters.toFixed(2)}m available`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {cutLengths.map((length, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Length in meters"
                    value={length}
                    onChange={(e) => {
                      const newLengths = [...cutLengths];
                      newLengths[idx] = e.target.value;
                      setCutLengths(newLengths);
                    }}
                  />
                  {cutLengths.length > 1 && (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => {
                        setCutLengths(cutLengths.filter((_, i) => i !== idx));
                      }}
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
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Another Cut
              </Button>
              <div className="text-sm text-muted-foreground">
                Total: {cutLengths.reduce((sum, l) => sum + (parseFloat(l) || 0), 0).toFixed(2)}m
                {rollToCut && ` / ${rollToCut.length_meters.toFixed(2)}m`}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCutDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCutRoll} disabled={loading}>
                {loading ? 'Cutting...' : 'Cut Roll'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cut Bundle Dialog (Sprinkler Pipe) */}
        <Dialog open={cutBundleDialogOpen} onOpenChange={setCutBundleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cut Bundle into Spare Pieces</DialogTitle>
              <DialogDescription>
                {bundleToCut && `Cutting bundle: ${bundleToCut.batch_code} - ${bundleToCut.bundle_size} pieces available`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {bundleCutPieces.map((pieces, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="Number of pieces"
                    value={pieces}
                    onChange={(e) => {
                      const newPieces = [...bundleCutPieces];
                      newPieces[idx] = e.target.value;
                      setBundleCutPieces(newPieces);
                    }}
                  />
                  {bundleCutPieces.length > 1 && (
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => {
                        setBundleCutPieces(bundleCutPieces.filter((_, i) => i !== idx));
                      }}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBundleCutPieces([...bundleCutPieces, ''])}
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Another Spare Piece
              </Button>
              <div className="text-sm text-muted-foreground">
                Total pieces: {bundleCutPieces.reduce((sum, p) => sum + (parseInt(p) || 0), 0)}
                {bundleToCut && ` / ${bundleToCut.bundle_size} available`}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCutBundleDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCutBundle} disabled={loading}>
                {loading ? 'Cutting...' : 'Cut Bundle'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Combine Spares Dialog (Sprinkler Pipe) */}
        <Dialog open={combineSparesDialogOpen} onOpenChange={setCombineSparesDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Combine Spare Pieces into Bundles</DialogTitle>
              <DialogDescription>
                Select spare pieces and specify bundle size to create new bundles
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Available Spares */}
              <div className="space-y-2">
                <Label>Select Spare Pieces</Label>
                <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-2">
                  {availableRolls?.spares.map((spare) => (
                    <div
                      key={spare.id}
                      className="flex items-center justify-between p-2 border rounded hover:bg-accent cursor-pointer"
                      onClick={() => {
                        if (selectedSpares.includes(spare.id)) {
                          setSelectedSpares(selectedSpares.filter(id => id !== spare.id));
                        } else {
                          setSelectedSpares([...selectedSpares, spare.id]);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedSpares.includes(spare.id)}
                          onChange={() => {}}
                          className="h-4 w-4"
                        />
                        <div>
                          <p className="font-medium text-sm">{spare.batch_code}</p>
                          <p className="text-xs text-muted-foreground">{spare.bundle_size} pieces</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {selectedSpares.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Total pieces selected: {selectedSpares.reduce((sum, id) => {
                      const spare = availableRolls?.spares.find(s => s.id === id);
                      return sum + (spare?.bundle_size || 0);
                    }, 0)}
                  </p>
                )}
              </div>

              {/* Bundle Configuration */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bundle Size (pieces per bundle)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="e.g., 10"
                    value={combineBundleSize}
                    onChange={(e) => setCombineBundleSize(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Number of Bundles</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="e.g., 1"
                    value={combineNumBundles}
                    onChange={(e) => setCombineNumBundles(e.target.value)}
                  />
                </div>
              </div>

              {/* Preview */}
              {combineBundleSize && combineNumBundles && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md text-sm">
                  <p className="font-medium text-blue-700 dark:text-blue-300">
                    Will create: {combineNumBundles} bundle(s) × {combineBundleSize} pieces = {parseInt(combineNumBundles) * parseInt(combineBundleSize)} pieces total
                  </p>
                  {selectedSpares.length > 0 && (
                    <p className="text-muted-foreground mt-1">
                      Remaining: {selectedSpares.reduce((sum, id) => {
                        const spare = availableRolls?.spares.find(s => s.id === id);
                        return sum + (spare?.bundle_size || 0);
                      }, 0) - (parseInt(combineNumBundles) * parseInt(combineBundleSize))} pieces
                    </p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCombineSparesDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCombineSpares} disabled={loading || selectedSpares.length === 0}>
                {loading ? 'Combining...' : 'Combine Spares'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default Dispatch;
