import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ArrowRightLeft, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TransactionFormData {
  type: string;
  batchId: string;
  rollId: string;
  quantity: string;
  customerId: string;
  invoiceNo: string;
  fromLocationId: string;
  toLocationId: string;
  notes: string;
}

const Transactions = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batches, setBatches] = useState<any[]>([]);
  const [rolls, setRolls] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);

  const [formData, setFormData] = useState<TransactionFormData>({
    type: 'SALE',
    batchId: '',
    rollId: '',
    quantity: '',
    customerId: '',
    invoiceNo: '',
    fromLocationId: '',
    toLocationId: '',
    notes: '',
  });

  useEffect(() => {
    fetchMasterData();
    fetchTransactions();
  }, []);

  useEffect(() => {
    if (formData.batchId) {
      fetchRollsForBatch(formData.batchId);
      const batch = batches.find(b => b.id === formData.batchId);
      setSelectedBatch(batch);
    } else {
      setRolls([]);
      setSelectedBatch(null);
    }
  }, [formData.batchId]);

  const fetchMasterData = async () => {
    try {
      const [batchesRes, customersRes, locationsRes] = await Promise.all([
        supabase
          .from('batches')
          .select(`
            *,
            locations(name),
            product_variants(
              parameters,
              product_types(name),
              brands(name)
            )
          `)
          .is('deleted_at', null)
          .gt('current_quantity', 0),
        supabase.from('customers').select('*').is('deleted_at', null),
        supabase.from('locations').select('*').is('deleted_at', null),
      ]);

      if (batchesRes.data) setBatches(batchesRes.data);
      if (customersRes.data) setCustomers(customersRes.data);
      if (locationsRes.data) setLocations(locationsRes.data);
    } catch (error) {
      console.error('Error fetching master data:', error);
      toast.error('Failed to load master data');
    }
  };

  const fetchRollsForBatch = async (batchId: string) => {
    try {
      const { data, error } = await supabase
        .from('rolls')
        .select('*')
        .eq('batch_id', batchId)
        .gt('length_meters', 0)
        .is('deleted_at', null);

      if (error) throw error;
      setRolls(data || []);
    } catch (error) {
      console.error('Error fetching rolls:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          batches(batch_code),
          customers(name),
          from_location:from_location_id(name),
          to_location:to_location_id(name)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.type || !formData.batchId) {
      toast.error('Please select transaction type and batch');
      return;
    }

    const quantity = parseFloat(formData.quantity);
    if (!quantity || quantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    // Validate based on transaction type
    if (['SALE', 'CUT_ROLL'].includes(formData.type) && !formData.rollId) {
      toast.error('Please select a roll');
      return;
    }

    if (formData.type === 'SALE' && !formData.customerId) {
      toast.error('Please select a customer');
      return;
    }

    if (formData.type === 'TRANSFER_OUT' && (!formData.fromLocationId || !formData.toLocationId)) {
      toast.error('Please select from and to locations for transfer');
      return;
    }

    setLoading(true);

    try {
      const roll = rolls.find(r => r.id === formData.rollId);

      // Validate quantity against roll/batch
      if (formData.rollId && roll && quantity > roll.length_meters) {
        toast.error(`Quantity cannot exceed roll length (${roll.length_meters} m)`);
        setLoading(false);
        return;
      }

      if (!formData.rollId && selectedBatch && quantity > selectedBatch.current_quantity) {
        toast.error(`Quantity cannot exceed batch quantity (${selectedBatch.current_quantity} m)`);
        setLoading(false);
        return;
      }

      // Determine quantity change based on transaction type
      let quantityChange = quantity;
      if (['PRODUCTION', 'RETURN'].includes(formData.type)) {
        quantityChange = quantity; // positive
      } else {
        quantityChange = -quantity; // negative for sales, cuts, transfers out
      }

      // Create transaction
      const transactionData: any = {
        batch_id: formData.batchId,
        transaction_type: formData.type,
        quantity_change: quantityChange,
        notes: formData.notes,
        created_by: user?.id,
      };

      if (formData.rollId) {
        transactionData.roll_id = formData.rollId;
      }

      if (formData.customerId) {
        transactionData.customer_id = formData.customerId;
      }

      if (formData.invoiceNo) {
        transactionData.invoice_no = formData.invoiceNo;
      }

      if (formData.fromLocationId) {
        transactionData.from_location_id = formData.fromLocationId;
      }

      if (formData.toLocationId) {
        transactionData.to_location_id = formData.toLocationId;
      }

      const { data: txnData, error: txnError } = await supabase
        .from('transactions')
        .insert(transactionData)
        .select()
        .single();

      if (txnError) throw txnError;

      // Update roll if specified
      if (formData.rollId && roll) {
        const newLength = roll.length_meters - quantity;
        const newStatus = newLength <= 0 ? 'SOLD_OUT' : newLength < roll.initial_length_meters ? 'PARTIAL' : 'AVAILABLE';

        const { error: rollError } = await supabase
          .from('rolls')
          .update({
            length_meters: newLength,
            status: newStatus,
          })
          .eq('id', formData.rollId);

        if (rollError) throw rollError;
      }

      // Update batch quantity
      const newBatchQuantity = selectedBatch.current_quantity + quantityChange;
      const { error: batchError } = await supabase
        .from('batches')
        .update({
          current_quantity: newBatchQuantity,
        })
        .eq('id', formData.batchId);

      if (batchError) throw batchError;

      // Log audit
      await supabase.from('audit_logs').insert({
        user_id: user?.id,
        action_type: `${formData.type}_TRANSACTION`,
        entity_type: 'TRANSACTION',
        entity_id: txnData.id,
        description: `${formData.type} transaction: ${quantity} units`,
      });

      toast.success('Transaction recorded successfully!');

      // Reset form
      setFormData({
        type: 'SALE',
        batchId: '',
        rollId: '',
        quantity: '',
        customerId: '',
        invoiceNo: '',
        fromLocationId: '',
        toLocationId: '',
        notes: '',
      });

      setDialogOpen(false);
      fetchMasterData();
      fetchTransactions();
    } catch (error: any) {
      console.error('Error creating transaction:', error);
      toast.error(error.message || 'Failed to record transaction');
    } finally {
      setLoading(false);
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'PRODUCTION': return 'bg-green-500';
      case 'SALE': return 'bg-blue-500';
      case 'CUT_ROLL': return 'bg-orange-500';
      case 'RETURN': return 'bg-purple-500';
      case 'ADJUSTMENT': return 'bg-yellow-500';
      case 'TRANSFER_OUT': return 'bg-red-500';
      case 'TRANSFER_IN': return 'bg-teal-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <ArrowRightLeft className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
              <p className="text-muted-foreground">Record sales, cuts, transfers, and adjustments</p>
            </div>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="h-12">
                <Plus className="h-5 w-5 mr-2" />
                New Transaction
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Transaction</DialogTitle>
                <DialogDescription>Record a new inventory transaction</DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Transaction Type */}
                <div className="space-y-2">
                  <Label htmlFor="type">Transaction Type *</Label>
                  <Select value={formData.type} onValueChange={(value) => setFormData({...formData, type: value})}>
                    <SelectTrigger id="type" className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SALE">Sale</SelectItem>
                      <SelectItem value="CUT_ROLL">Cut Roll</SelectItem>
                      <SelectItem value="RETURN">Return</SelectItem>
                      <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                      <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
                      <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Batch Selection */}
                <div className="space-y-2">
                  <Label htmlFor="batch">Batch *</Label>
                  <Select value={formData.batchId} onValueChange={(value) => setFormData({...formData, batchId: value, rollId: ''})}>
                    <SelectTrigger id="batch" className="h-12">
                      <SelectValue placeholder="Select batch" />
                    </SelectTrigger>
                    <SelectContent>
                      {batches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          {batch.batch_code} - {batch.product_variants.brands.name} {batch.product_variants.product_types.name}
                          ({batch.current_quantity.toFixed(2)} m available)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Roll Selection (for SALE and CUT_ROLL) */}
                {['SALE', 'CUT_ROLL'].includes(formData.type) && formData.batchId && (
                  <div className="space-y-2">
                    <Label htmlFor="roll">Roll *</Label>
                    <Select value={formData.rollId} onValueChange={(value) => setFormData({...formData, rollId: value})}>
                      <SelectTrigger id="roll" className="h-12">
                        <SelectValue placeholder="Select roll" />
                      </SelectTrigger>
                      <SelectContent>
                        {rolls.map((roll, idx) => (
                          <SelectItem key={roll.id} value={roll.id}>
                            Roll #{idx + 1} - {roll.length_meters.toFixed(2)} m ({roll.status})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Quantity */}
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity (meters) *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.001"
                    inputMode="decimal"
                    placeholder="Enter quantity"
                    value={formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                    className="h-12 text-lg"
                  />
                </div>

                {/* Customer (for SALE) */}
                {formData.type === 'SALE' && (
                  <div className="space-y-2">
                    <Label htmlFor="customer">Customer *</Label>
                    <Select value={formData.customerId} onValueChange={(value) => setFormData({...formData, customerId: value})}>
                      <SelectTrigger id="customer" className="h-12">
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Invoice Number (for SALE) */}
                {formData.type === 'SALE' && (
                  <div className="space-y-2">
                    <Label htmlFor="invoiceNo">Invoice Number</Label>
                    <Input
                      id="invoiceNo"
                      type="text"
                      placeholder="Enter invoice number"
                      value={formData.invoiceNo}
                      onChange={(e) => setFormData({...formData, invoiceNo: e.target.value})}
                      className="h-12"
                    />
                  </div>
                )}

                {/* Transfer Locations */}
                {formData.type === 'TRANSFER_OUT' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fromLocation">From Location *</Label>
                      <Select value={formData.fromLocationId} onValueChange={(value) => setFormData({...formData, fromLocationId: value})}>
                        <SelectTrigger id="fromLocation" className="h-12">
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="toLocation">To Location *</Label>
                      <Select value={formData.toLocationId} onValueChange={(value) => setFormData({...formData, toLocationId: value})}>
                        <SelectTrigger id="toLocation" className="h-12">
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Additional notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    rows={3}
                  />
                </div>

                <div className="flex space-x-3">
                  <Button type="submit" className="flex-1 h-12" disabled={loading}>
                    {loading ? 'Recording...' : 'Record Transaction'}
                  </Button>
                  <Button type="button" variant="outline" className="h-12" onClick={() => setDialogOpen(false)}>
                    Cancel
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
            <CardDescription>Last 50 inventory movements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {transactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No transactions yet</p>
              ) : (
                transactions.map((txn) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <Badge className={getTransactionColor(txn.transaction_type)}>
                          {txn.transaction_type}
                        </Badge>
                        <code className="text-sm font-mono">{txn.batches.batch_code}</code>
                        {txn.customers && (
                          <span className="text-sm text-muted-foreground">
                            → {txn.customers.name}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {txn.quantity_change > 0 ? '+' : ''}{txn.quantity_change.toFixed(2)} m
                        {txn.invoice_no && ` | Invoice: ${txn.invoice_no}`}
                        {txn.notes && ` | ${txn.notes}`}
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      {new Date(txn.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Transactions;
