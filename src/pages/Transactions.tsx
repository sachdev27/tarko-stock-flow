import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ArrowRightLeft, Package, Weight, FileText, User, Calendar, Truck, Scale, Ruler } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { transactions as transactionsAPI } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface TransactionRecord {
  id: string;
  transaction_type: string;
  quantity_change: number;
  transaction_date: string;
  invoice_no?: string;
  notes?: string;
  created_at: string;
  batch_code: string;
  batch_no: string;
  initial_quantity: number;
  weight_per_meter?: number;
  total_weight?: number;
  attachment_url?: string;
  production_date: string;
  product_type: string;
  product_type_id: string;
  brand_id: string;
  product_variant_id: string | number;
  brand: string;
  parameters: Record<string, string>;
  roll_length_meters?: number;
  roll_initial_length_meters?: number;
  roll_is_cut?: boolean;
  roll_type?: string;
  roll_bundle_size?: number;
  roll_weight?: number;
  unit_abbreviation?: string;
  customer_name?: string;
  created_by_email?: string;
  created_by_username?: string;
  created_by_name?: string;
}

const Transactions = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchMasterData = async () => {
    try {
      const [batchesRes, customersRes, productTypesRes, brandsRes] = await Promise.all([
        inventoryAPI.getBatches(),
        inventoryAPI.getCustomers(),
        inventoryAPI.getProductTypes(),
        inventoryAPI.getBrands(),
      ]);

      setBatches(batchesRes.data || []);
      setCustomers(customersRes.data || []);
      setProductTypes(productTypesRes.data || []);
      setBrands(brandsRes.data || []);
    } catch (error) {
      console.error('Error fetching master data:', error);
      toast.error('Failed to fetch master data');
    }
  };

  const fetchTransactions = async () => {
    try {
      const { data } = await transactionsAPI.getAll();
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to fetch transactions');
    }
  };

  const getAvailableParameters = () => {
    if (!selectedProductType || selectedProductType === 'all') return {};

    const filteredByType = batches.filter(
      b => b.product_type_id === parseInt(selectedProductType)
    );

    const params: Record<string, Set<string>> = {};
    filteredByType.forEach(batch => {
      if (batch.parameters) {
        Object.entries(batch.parameters).forEach(([key, value]) => {
          if (!params[key]) params[key] = new Set();
          params[key].add(value as string);
        });
      }
    });

    return params;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addToCart = (batch: any, roll: any | null) => {
    const existingIndex = cart.findIndex(
      item => item.batchId === batch.id && item.rollId === (roll?.id || null)
    );

    if (existingIndex >= 0) {
      toast.error('Item already in cart');
      return;
    }

    const unit = batch.product_type_name === 'Sprinkler Pipe' ? 'pcs' : 'm';
    const availableQty = roll ? roll.length_meters : batch.current_quantity;

    const newItem: SelectedItem = {
      batchId: batch.id,
      rollId: roll?.id || null,
      batchCode: batch.batch_code,
      rollLabel: roll ? `Roll ${roll.roll_number}` : 'Batch',
      productType: batch.product_type_name,
      brand: batch.brand_name,
      availableQuantity: availableQty,
      quantity: 0,
      unit,
    };

    setCart([...cart, newItem]);
    toast.success('Added to cart');
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const updateCartQuantity = (index: number, quantity: number) => {
    const newCart = [...cart];
    newCart[index].quantity = quantity;
    setCart(newCart);
  };

  const clearFilters = () => {
    setSelectedProductType('all');
    setSelectedBrand('all');
    setParameterFilters({});
  };

  const resetForm = () => {
    setFormData({
      type: 'SALE',
      customerId: '',
      invoiceNo: '',
      notes: '',
    });
    setCart([]);
    clearFilters();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.type) {
      toast.error('Please select transaction type');
      return;
    }

    if (cart.length === 0) {
      toast.error('Please add at least one item to cart');
      return;
    }

    // Validate quantities
    for (const item of cart) {
      if (!item.quantity || item.quantity <= 0) {
        toast.error(`Please enter valid quantity for ${item.batchCode} - ${item.rollLabel}`);
        return;
      }
      if (item.quantity > item.availableQuantity) {
        toast.error(`Quantity for ${item.batchCode} - ${item.rollLabel} exceeds available (${item.availableQuantity} ${item.unit})`);
        return;
      }
    }

    // Type-specific validation
    if (formData.type === 'SALE' && !formData.customerId) {
      toast.error('Please select a customer for sale');
      return;
    }



    setLoading(true);

    try {
      // Create transactions for each item in cart
      const transactionPromises = cart.map(item => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transactionData: any = {
          batch_id: item.batchId,
          transaction_type: formData.type,
          quantity_change: item.quantity,
          notes: formData.notes,
        };

        if (item.rollId) {
          transactionData.roll_id = item.rollId;
        }

        if (formData.customerId) {
          transactionData.customer_id = formData.customerId;
        }

        if (formData.invoiceNo) {
          transactionData.invoice_no = formData.invoiceNo;
        }

        return transactionsAPI.create(transactionData);
      });

      await Promise.all(transactionPromises);

      toast.success(`${cart.length} transaction(s) recorded successfully`);
      setDialogOpen(false);
      resetForm();
      fetchMasterData();
      fetchTransactions();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error creating transactions:', error);
      toast.error(error.response?.data?.error || 'Failed to record transactions');
    } finally {
      setLoading(false);
    }
  };

  const getTransactionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'SALE': 'Sale',
      'CUT_ROLL': 'Cut Roll',
      'RETURN': 'Return',
      'TRANSFER_OUT': 'Transfer Out',
      'TRANSFER_IN': 'Transfer In',
    };
    return labels[type] || type;
  };

  const getTransactionTypeBadge = (type: string) => {
    const variants: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
      'SALE': 'destructive',
      'CUT_ROLL': 'default',
      'RETURN': 'secondary',
      'TRANSFER_OUT': 'outline',
      'TRANSFER_IN': 'default',
    };
    return variants[type] || 'default';
  };

  const availableParams = getAvailableParameters();

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Transactions</h1>
            <p className="text-muted-foreground">Record inventory movements and sales</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => resetForm()}>
                <Plus className="mr-2 h-4 w-4" />
                New Transaction
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Record Transaction</DialogTitle>
                <DialogDescription>
                  Select transaction type, filter products, and add items to cart
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Transaction Type Selection */}
                <div className="space-y-2">
                  <Label>Transaction Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SALE">Sale</SelectItem>
                      <SelectItem value="CUT_ROLL">Cut Roll</SelectItem>
                      <SelectItem value="RETURN">Return</SelectItem>
                      <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
                      <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Filters Section */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Product Filters</CardTitle>
                      {(selectedProductType !== 'all' || selectedBrand !== 'all') && (
                        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                          <X className="mr-1 h-3 w-3" />
                          Clear
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Product Type</Label>
                        <Select value={selectedProductType} onValueChange={setSelectedProductType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            {productTypes.map(pt => (
                              <SelectItem key={pt.id} value={pt.id.toString()}>
                                {pt.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Brand</Label>
                        <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Brands</SelectItem>
                            {brands.map(brand => (
                              <SelectItem key={brand.id} value={brand.id.toString()}>
                                {brand.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                    </div>

                    {/* Parameter Filters */}
                    {selectedProductType !== 'all' && Object.keys(availableParams).length > 0 && (
                      <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                        {Object.entries(availableParams).map(([param, values]) => (
                          <div key={param} className="space-y-2">
                            <Label className="text-xs">{param}</Label>
                            <Select
                              value={parameterFilters[param] || 'all'}
                              onValueChange={(value) =>
                                setParameterFilters({ ...parameterFilters, [param]: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All</SelectItem>
                                {Array.from(values).map(v => (
                                  <SelectItem key={v} value={v}>
                                    {v}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Available Items */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">
                      Available Items ({filteredBatches.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {filteredBatches.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                          No items match your filters
                        </p>
                      ) : (
                        filteredBatches.map(batch => (
                          <Card key={batch.id} className="p-3">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{batch.batch_code}</span>
                                  <Badge variant="outline">{batch.product_type_name}</Badge>
                                  <Badge variant="secondary">{batch.brand_name}</Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {batch.parameters && Object.entries(batch.parameters).map(([key, value]) => (
                                    <span key={key} className="mr-3">
                                      {key}: {value as string}
                                    </span>
                                  ))}
                                </div>
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Available: </span>
                                  <span className="font-medium">
                                    {batch.current_quantity} {batch.product_type_name === 'Sprinkler Pipe' ? 'pcs' : 'm'}
                                  </span>
                                  {batch.location_name && (
                                    <span className="ml-3 text-muted-foreground">
                                      @ {batch.location_name}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {(['SALE', 'CUT_ROLL'].includes(formData.type) && batch.rolls && batch.rolls.length > 0) ? (
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  batch.rolls.map((roll: any) => (
                                    <Button
                                      key={roll.id}
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => addToCart(batch, roll)}
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Roll {roll.roll_number}
                                    </Button>
                                  ))
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => addToCart(batch, null)}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Batch
                                  </Button>
                                )}
                              </div>
                            </div>
                          </Card>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Cart */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        Cart ({cart.length})
                      </CardTitle>
                      {cart.length > 0 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setCart([])}>
                          <X className="h-3 w-3 mr-1" />
                          Clear Cart
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {cart.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        Cart is empty. Add items from available inventory above.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Batch</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Available</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cart.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{item.batchCode}</TableCell>
                              <TableCell>{item.rollLabel}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="text-sm">{item.productType}</div>
                                  <div className="text-xs text-muted-foreground">{item.brand}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {item.availableQuantity} {item.unit}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  max={item.availableQuantity}
                                  step="0.01"
                                  value={item.quantity || ''}
                                  onChange={(e) => updateCartQuantity(index, parseFloat(e.target.value))}
                                  placeholder="0"
                                  className="w-24"
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeFromCart(index)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {/* Transaction Details */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Transaction Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {formData.type === 'SALE' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Customer *</Label>
                          <Select
                            value={formData.customerId}
                            onValueChange={(value) => setFormData({ ...formData, customerId: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                            <SelectContent>
                              {customers.map(customer => (
                                <SelectItem key={customer.id} value={customer.id.toString()}>
                                  {customer.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Invoice Number</Label>
                          <Input
                            value={formData.invoiceNo}
                            onChange={(e) => setFormData({ ...formData, invoiceNo: e.target.value })}
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Optional notes"
                        rows={3}
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading || cart.length === 0}>
                    {loading ? 'Processing...' : `Record ${cart.length} Transaction(s)`}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Latest inventory movements</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Roll</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Customer/Location</TableHead>
                  <TableHead>User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No transactions recorded yet
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.slice(0, 20).map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        {new Date(transaction.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTransactionTypeBadge(transaction.transaction_type)}>
                          {getTransactionTypeLabel(transaction.transaction_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {transaction.batch_code}
                      </TableCell>
                      <TableCell>
                        {transaction.roll_number ? `Roll ${transaction.roll_number}` : '-'}
                      </TableCell>
                      <TableCell>
                        {transaction.quantity_change} {transaction.product_type_name === 'Sprinkler Pipe' ? 'pcs' : 'm'}
                      </TableCell>
                      <TableCell>
                        {transaction.customer_name || transaction.to_location_name || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {transaction.username}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Transactions;
