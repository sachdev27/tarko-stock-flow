import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { ledger as ledgerAPI } from '@/lib/api';

interface TransactionRecord {
  id: string;
  transaction_type: string;
  quantity_change: number;
  transaction_date: string;
  invoice_no?: string;
  notes?: string;
  batch_code: string;
  batch_no: string;
  customer_name?: string;
  created_by_name?: string;
  roll_length_meters?: number;
  roll_weight?: number;
  roll_type?: string;
  roll_is_cut?: boolean;
}

interface ProductHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productVariantId: string | null;
  productName: string;
}

export const ProductHistoryDialog = ({ open, onOpenChange, productVariantId, productName }: ProductHistoryDialogProps) => {
  const [history, setHistory] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null);

  const fetchHistory = async () => {
    if (!productVariantId) return;

    setLoading(true);
    try {
      const { data } = await ledgerAPI.getProductLedger(productVariantId);
      setHistory(data.transactions || []);

      if (!data.transactions || data.transactions.length === 0) {
        toast.info('No transaction history found');
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      toast.error('Failed to load product history');
    } finally {
      setLoading(false);
    }
  };

  // Fetch history when dialog opens
  useEffect(() => {
    if (open && productVariantId) {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productVariantId]);

  const exportToCSV = () => {
    if (history.length === 0) return;

    const headers = ['Date', 'Type', 'Batch Code', 'Quantity', 'Customer', 'Invoice', 'Notes', 'Roll Length', 'Roll Type'];
    const rows = history.map((txn) => [
      new Date(txn.transaction_date).toLocaleString('en-IN'),
      txn.transaction_type,
      txn.batch_code || '-',
      `${txn.quantity_change}`,
      txn.customer_name || '-',
      txn.invoice_no || '-',
      txn.notes || '-',
      txn.roll_length_meters ? `${txn.roll_length_meters}m` : '-',
      txn.roll_type || '-'
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${productName}-history.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('History exported to CSV');
  };

  const formatWeight = (weightInGrams: number | null | undefined): string => {
    if (weightInGrams == null) return '-';
    if (weightInGrams >= 1000) {
      return `${(weightInGrams / 1000).toFixed(2)} kg`;
    }
    return `${weightInGrams.toFixed(0)} g`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Product History - {productName}</DialogTitle>
            <DialogDescription>
              Complete transaction history for this product variant
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading history...
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No transaction history found</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {history.length} transaction{history.length !== 1 ? 's' : ''} found
                  </p>
                  <Button onClick={exportToCSV} variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>

                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((txn) => (
                        <TableRow key={txn.id}>
                          <TableCell className="text-sm">
                            {new Date(txn.transaction_date).toLocaleDateString('en-IN')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              txn.transaction_type === 'PRODUCTION' ? 'default' :
                              txn.transaction_type === 'DISPATCH' ? 'destructive' :
                              'secondary'
                            }>
                              {txn.transaction_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {txn.batch_code || txn.batch_no}
                          </TableCell>
                          <TableCell className="font-medium">
                            {txn.quantity_change > 0 ? '+' : ''}{txn.quantity_change}
                          </TableCell>
                          <TableCell className="text-sm">
                            {txn.customer_name || '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedTransaction(txn)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Transaction Detail Dialog */}
      <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Date</p>
                  <p className="text-sm">{new Date(selectedTransaction.transaction_date).toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Type</p>
                  <Badge>{selectedTransaction.transaction_type}</Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Batch</p>
                  <p className="text-sm">{selectedTransaction.batch_code || selectedTransaction.batch_no}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Quantity Change</p>
                  <p className="text-sm font-bold">{selectedTransaction.quantity_change > 0 ? '+' : ''}{selectedTransaction.quantity_change}</p>
                </div>
                {selectedTransaction.customer_name && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Customer</p>
                    <p className="text-sm">{selectedTransaction.customer_name}</p>
                  </div>
                )}
                {selectedTransaction.invoice_no && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Invoice</p>
                    <p className="text-sm">{selectedTransaction.invoice_no}</p>
                  </div>
                )}
                {selectedTransaction.roll_length_meters && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Roll Length</p>
                    <p className="text-sm">{selectedTransaction.roll_length_meters}m</p>
                  </div>
                )}
                {selectedTransaction.roll_weight && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Roll Weight</p>
                    <p className="text-sm">{formatWeight(selectedTransaction.roll_weight)}</p>
                  </div>
                )}
                {selectedTransaction.roll_type && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Roll Type</p>
                    <p className="text-sm">{selectedTransaction.roll_type}</p>
                  </div>
                )}
                {selectedTransaction.created_by_name && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Created By</p>
                    <p className="text-sm">{selectedTransaction.created_by_name}</p>
                  </div>
                )}
              </div>
              {selectedTransaction.notes && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm p-3 bg-muted rounded-md">{selectedTransaction.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
