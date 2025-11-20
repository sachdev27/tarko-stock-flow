import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ArrowRightLeft, Package, Weight, FileText, User, Calendar, Truck, Scale, Ruler, Undo2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { transactions as transactionsAPI } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';

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
  roll_id?: string;
  standard_rolls_count?: number;
  cut_rolls_count?: number;
  bundles_count?: number;
  spare_pieces_count?: number;
}

const Transactions = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [reverting, setReverting] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const { data } = await transactionsAPI.getAll();
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to fetch transactions');
    }
  };

  const toggleSelectTransaction = (id: string) => {
    const newSelected = new Set(selectedTransactionIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTransactionIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedTransactionIds.size === transactions.length) {
      setSelectedTransactionIds(new Set());
    } else {
      setSelectedTransactionIds(new Set(transactions.map(t => t.id)));
    }
  };

  const handleRevertTransactions = async () => {
    if (selectedTransactionIds.size === 0) {
      toast.error('No transactions selected');
      return;
    }

    setReverting(true);
    try {
      const { data } = await transactionsAPI.revert(Array.from(selectedTransactionIds));

      const { reverted_count, total_requested, failed_transactions } = data;

      if (reverted_count > 0) {
        toast.success(`Successfully reverted ${reverted_count} transaction${reverted_count > 1 ? 's' : ''}`);
        if (failed_transactions && failed_transactions.length > 0) {
          toast.warning(`Failed to revert ${failed_transactions.length} transaction${failed_transactions.length > 1 ? 's' : ''}`);
        }
        await fetchTransactions();
        setSelectedTransactionIds(new Set());
        setRevertDialogOpen(false);
      } else {
        toast.error('Failed to revert transactions');
      }
    } catch (error: any) {
      console.error('Error reverting transactions:', error);
      toast.error(error.response?.data?.error || 'Failed to revert transactions');
    } finally {
      setReverting(false);
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Transactions</CardTitle>
                <CardDescription>Latest inventory movements</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {selectedTransactionIds.size > 0 && (
                  <>
                    <Badge variant="secondary" className="text-sm">
                      {selectedTransactionIds.size} selected
                    </Badge>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setRevertDialogOpen(true)}
                      disabled={reverting}
                    >
                      <Undo2 className="h-4 w-4 mr-2" />
                      Revert Selected
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedTransactionIds.size === transactions.length && transactions.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
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
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No transactions recorded yet
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.slice(0, 20).map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedTransactionIds.has(transaction.id)}
                          onCheckedChange={() => toggleSelectTransaction(transaction.id)}
                        />
                      </TableCell>
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
                        {transaction.roll_id ? 'Roll' : '-'}
                      </TableCell>
                      <TableCell>
                        {transaction.quantity_change} {transaction.product_type === 'Sprinkler Pipe' ? 'pcs' : 'm'}
                      </TableCell>
                      <TableCell>
                        {transaction.customer_name || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {transaction.created_by_username || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Revert Confirmation Dialog */}
      <Dialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revert Transactions</DialogTitle>
            <DialogDescription>
              Are you sure you want to revert {selectedTransactionIds.size} selected transaction{selectedTransactionIds.size > 1 ? 's' : ''}?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex gap-2">
                <Undo2 className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm space-y-2">
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    This will:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-200">
                    <li>Reverse the inventory changes</li>
                    <li>Restore affected rolls and batches</li>
                    <li>Mark transactions as deleted</li>
                    <li>Create audit log entries</li>
                  </ul>
                  <p className="text-amber-700 dark:text-amber-300 mt-2 font-medium">
                    ⚠️ This action cannot be undone!
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevertDialogOpen(false)}
              disabled={reverting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevertTransactions}
              disabled={reverting}
            >
              {reverting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Reverting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Revert {selectedTransactionIds.size} Transaction{selectedTransactionIds.size > 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Transactions;
