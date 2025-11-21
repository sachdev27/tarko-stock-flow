import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Download, FileText, Eye, Package, Scissors, Box, Boxes } from 'lucide-react';
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
  product_type?: string;
  batch_total_weight?: number;
  batch_weight_per_meter?: number;
  batch_initial_quantity?: number;
  batch_current_quantity?: number;
  batch_piece_length?: number;
  production_date?: string;
  // Cut operation details
  from_length?: number;
  cut_piece_details?: string | Array<{ length: number; piece_id: string; is_remainder?: boolean }>;
  // Stock counts
  full_rolls?: number;
  cut_rolls?: number;
  bundles?: number;
  spares?: number;
  // Roll snapshot for detailed info
  roll_snapshot?: Record<string, unknown>;
}

interface LedgerSummary {
  total_transactions: number;
  total_produced: number;
  total_sold: number;
  total_cut_operations: number;
  total_split_operations: number;
  total_combine_operations: number;
  total_adjustments: number;
  total_returns: number;
  current_stock: {
    full_rolls: number;
    cut_rolls: number;
    bundles: number;
    spares: number;
    total_length: number;
    total_weight: number;
  };
}

interface ProductHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productVariantId: string | null;
  productName: string;
}

export const ProductHistoryDialog = ({ open, onOpenChange, productVariantId, productName }: ProductHistoryDialogProps) => {
  const [history, setHistory] = useState<TransactionRecord[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [product, setProduct] = useState<{ product_type?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null);

  const fetchHistory = async () => {
    if (!productVariantId) return;

    setLoading(true);
    try {
      const { data } = await ledgerAPI.getProductLedger(productVariantId);
      setHistory(data.transactions || []);
      setSummary(data.summary || null);
      setProduct(data.product || null);

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

    const headers = ['Date', 'Type', 'Batch Code', 'Description', 'Weight', 'Customer', 'Invoice'];
    const rows = history.map((txn) => {
      let description = '';
      if (txn.transaction_type === 'PRODUCTION') {
        description = `Produced ${Math.abs(txn.quantity_change || 0)} units`;
      } else if (txn.transaction_type === 'DISPATCH' || txn.transaction_type === 'SALE') {
        description = `Sold ${Math.abs(txn.quantity_change || 0)} units`;
      } else {
        description = txn.notes || '-';
      }

      return [
        new Date(txn.transaction_date).toLocaleString('en-IN'),
        txn.transaction_type,
        txn.batch_code || '-',
        description,
        txn.batch_total_weight ? formatWeight(txn.batch_total_weight) : '-',
        txn.customer_name || '-',
        txn.invoice_no || '-'
      ];
    });

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

  const formatWeight = (weightInKg: number | string | null | undefined): string => {
    if (weightInKg == null) return '-';
    const weight = typeof weightInKg === 'string' ? parseFloat(weightInKg) : weightInKg;
    if (isNaN(weight)) return '-';
    const tons = weight / 1000;
    return tons >= 1 ? `${tons.toFixed(2)} t` : `${weight.toFixed(2)} kg`;
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
                {/* Summary Card Section */}
                {summary && product && (() => {
                  const isHDPE = product.product_type?.toLowerCase().includes('hdpe');
                  const isSprinkler = product.product_type?.toLowerCase().includes('sprinkler');

                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      {/* HDPE Products - Show Full Rolls & Cut Pieces */}
                      {isHDPE && (
                        <>
                          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">Full Rolls</p>
                                  <p className="text-2xl font-bold">{summary.current_stock.full_rolls}</p>
                                </div>
                                <Package className="h-8 w-8 text-blue-600 opacity-60" />
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 border-orange-200">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">Cut Pieces</p>
                                  <p className="text-2xl font-bold">{summary.current_stock.cut_rolls}</p>
                                </div>
                                <Scissors className="h-8 w-8 text-orange-600 opacity-60" />
                              </div>
                            </CardContent>
                          </Card>
                        </>
                      )}

                      {/* Sprinkler Products - Show Bundles & Spares */}
                      {isSprinkler && (
                        <>
                          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">Bundles</p>
                                  <p className="text-2xl font-bold">{summary.current_stock.bundles}</p>
                                </div>
                                <Box className="h-8 w-8 text-purple-600 opacity-60" />
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">Spares</p>
                                  <p className="text-2xl font-bold">{summary.current_stock.spares}</p>
                                </div>
                                <Boxes className="h-8 w-8 text-amber-600 opacity-60" />
                              </div>
                            </CardContent>
                          </Card>
                        </>
                      )}

                      {/* Total Length - Show for HDPE only */}
                      {isHDPE && summary.current_stock.total_length > 0 && (
                        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-green-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Total Length</p>
                                <p className="text-2xl font-bold">{summary.current_stock.total_length.toFixed(0)} m</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Total Weight - Show for both */}
                      {summary.current_stock.total_weight > 0 && (
                        <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 border-slate-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Total Weight</p>
                                <p className="text-2xl font-bold">{formatWeight(summary.current_stock.total_weight)}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Activity Summary - Show relevant operations based on product type */}
                      <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 border-indigo-200">
                        <CardContent className="p-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Activity</p>
                            <div className="grid grid-cols-2 gap-1 text-xs mt-2">
                              <div>
                                <span className="text-green-600 font-semibold">{summary.total_produced}</span>
                                <span className="text-muted-foreground ml-1">Produced</span>
                              </div>
                              <div>
                                <span className="text-red-600 font-semibold">{summary.total_sold}</span>
                                <span className="text-muted-foreground ml-1">Sold</span>
                              </div>
                              {isHDPE && summary.total_cut_operations > 0 && (
                                <div>
                                  <span className="text-orange-600 font-semibold">{summary.total_cut_operations}</span>
                                  <span className="text-muted-foreground ml-1">Cuts</span>
                                </div>
                              )}
                              {isSprinkler && summary.total_split_operations > 0 && (
                                <div>
                                  <span className="text-purple-600 font-semibold">{summary.total_split_operations}</span>
                                  <span className="text-muted-foreground ml-1">Splits</span>
                                </div>
                              )}
                              {isSprinkler && summary.total_combine_operations > 0 && (
                                <div>
                                  <span className="text-blue-600 font-semibold">{summary.total_combine_operations}</span>
                                  <span className="text-muted-foreground ml-1">Combines</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}

                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {history.length} transaction{history.length !== 1 ? 's' : ''} found
                  </p>
                  <Button onClick={exportToCSV} variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>

                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Weight</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((txn) => {
                        const isHDPE = txn.product_type?.toLowerCase().includes('hdpe');
                        const isSprinkler = txn.product_type?.toLowerCase().includes('sprinkler');

                        // Extract meaningful transaction information
                        let transactionDetails = '';

                        if (txn.transaction_type === 'PRODUCTION') {
                          // For production, show what was produced from roll_snapshot
                          if (txn.roll_snapshot && typeof txn.roll_snapshot === 'object') {
                            const snapshot = txn.roll_snapshot as Record<string, unknown>;
                            const items: string[] = [];

                            if (isHDPE) {
                              const fullRolls = Number(snapshot.full_rolls) || 0;
                              const cutRolls = Number(snapshot.cut_rolls) || 0;
                              if (fullRolls > 0) items.push(`${fullRolls} Full Roll${fullRolls > 1 ? 's' : ''}`);
                              if (cutRolls > 0) items.push(`${cutRolls} Cut Piece${cutRolls > 1 ? 's' : ''}`);
                            } else if (isSprinkler) {
                              const bundles = Number(snapshot.bundles) || 0;
                              const spares = Number(snapshot.spares) || 0;
                              if (bundles > 0) items.push(`${bundles} Bundle${bundles > 1 ? 's' : ''}`);
                              if (spares > 0) items.push(`${spares} Spare${spares > 1 ? 's' : ''}`);
                            }

                            transactionDetails = items.length > 0 ? `Produced: ${items.join(', ')}` : 'Batch produced';
                          } else {
                            transactionDetails = `Produced ${Math.abs(txn.quantity_change || 0)} units`;
                          }
                        } else if (txn.transaction_type === 'DISPATCH' || txn.transaction_type === 'SALE') {
                          transactionDetails = `Sold ${Math.abs(txn.quantity_change || 0)} units`;
                          if (txn.customer_name) transactionDetails += ` to ${txn.customer_name}`;
                        } else if (txn.transaction_type === 'CUT_ROLL') {
                          // Extract from notes: "Cut 1 full roll into 3 pieces: 50m, 30m, 20m"
                          transactionDetails = txn.notes || 'Roll cut operation';
                        } else if (txn.transaction_type === 'SPLIT_BUNDLE') {
                          // Extract from notes: "Split 1 bundle into 3 spare groups: 5 pcs, 3 pcs, 2 pcs"
                          transactionDetails = txn.notes || 'Bundle split into spares';
                        } else if (txn.transaction_type === 'COMBINE_SPARES') {
                          // Extract from notes: "Combined 20 spare pieces into 2 bundle(s) of 10 pieces each"
                          transactionDetails = txn.notes || 'Spares combined into bundles';
                        } else {
                          transactionDetails = txn.notes || '-';
                        }

                        return (
                          <TableRow key={txn.id}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {new Date(txn.transaction_date).toLocaleDateString('en-IN')}
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                txn.transaction_type === 'PRODUCTION' ? 'default' :
                                txn.transaction_type === 'DISPATCH' || txn.transaction_type === 'SALE' ? 'destructive' :
                                txn.transaction_type === 'CUT_ROLL' ? 'outline' :
                                txn.transaction_type === 'SPLIT_BUNDLE' ? 'outline' :
                                txn.transaction_type === 'COMBINE_SPARES' ? 'outline' :
                                'secondary'
                              }>
                                {txn.transaction_type === 'CUT_ROLL' ? 'CUT' :
                                 txn.transaction_type === 'SPLIT_BUNDLE' ? 'SPLIT' :
                                 txn.transaction_type === 'COMBINE_SPARES' ? 'COMBINE' :
                                 txn.transaction_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {txn.batch_code || txn.batch_no}
                            </TableCell>
                            <TableCell className="text-sm max-w-md">
                              <span className="text-muted-foreground">{transactionDetails}</span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {(txn.transaction_type === 'CUT_ROLL' ||
                                txn.transaction_type === 'SPLIT_BUNDLE' ||
                                txn.transaction_type === 'COMBINE_SPARES')
                                ? '-'
                                : (txn.batch_total_weight ? formatWeight(txn.batch_total_weight) : '-')}
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
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Transaction Detail Dialog - Simplified */}
      <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>
              {selectedTransaction && new Date(selectedTransaction.transaction_date).toLocaleString('en-IN')}
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              {/* Transaction Type Badge */}
              <div className="flex items-center gap-3">
                <Badge variant={
                  selectedTransaction.transaction_type === 'PRODUCTION' ? 'default' :
                  selectedTransaction.transaction_type === 'DISPATCH' || selectedTransaction.transaction_type === 'SALE' ? 'destructive' :
                  'outline'
                } className="text-base px-3 py-1">
                  {selectedTransaction.transaction_type === 'CUT_ROLL' ? 'CUT ROLL' :
                   selectedTransaction.transaction_type === 'SPLIT_BUNDLE' ? 'SPLIT BUNDLE' :
                   selectedTransaction.transaction_type === 'COMBINE_SPARES' ? 'COMBINE SPARES' :
                   selectedTransaction.transaction_type}
                </Badge>
                {selectedTransaction.created_by_name && (
                  <span className="text-sm text-muted-foreground">by {selectedTransaction.created_by_name}</span>
                )}
              </div>

              {/* Batch Code */}
              <div className="p-3 bg-muted/50 rounded-lg border">
                <p className="text-xs text-muted-foreground mb-1">Batch</p>
                <p className="text-base font-mono font-semibold">{selectedTransaction.batch_code || selectedTransaction.batch_no}</p>
              </div>

              {/* Description */}
              {selectedTransaction.notes && (
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <p className="text-sm">{selectedTransaction.notes}</p>
                </div>
              )}

              {/* Cut Piece Details (for CUT_ROLL transactions) */}
              {selectedTransaction.transaction_type === 'CUT_ROLL' && selectedTransaction.cut_piece_details && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Cut Piece Details</h4>
                  {selectedTransaction.from_length && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Original Length: </span>
                      <span className="font-semibold">{selectedTransaction.from_length}m</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    {(() => {
                      try {
                        const pieces = typeof selectedTransaction.cut_piece_details === 'string'
                          ? JSON.parse(selectedTransaction.cut_piece_details)
                          : selectedTransaction.cut_piece_details;

                        if (Array.isArray(pieces) && pieces.length > 0) {
                          return pieces.map((piece: { length: number; piece_id: string; is_remainder?: boolean }, index: number) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                              <span className="text-sm">
                                {piece.is_remainder ? '↳ Remainder' : `Piece ${index + 1}`}
                              </span>
                              <span className="font-mono font-semibold">{piece.length}m</span>
                            </div>
                          ));
                        }
                      } catch (e) {
                        return null;
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}

              {/* Customer & Invoice (for Sales) */}
              {(selectedTransaction.customer_name || selectedTransaction.invoice_no) && (
                <div className="grid grid-cols-2 gap-3">
                  {selectedTransaction.customer_name && (
                    <div className="p-3 bg-muted/50 rounded-lg border">
                      <p className="text-xs text-muted-foreground mb-1">Customer</p>
                      <p className="text-sm font-semibold">{selectedTransaction.customer_name}</p>
                    </div>
                  )}
                  {selectedTransaction.invoice_no && (
                    <div className="p-3 bg-muted/50 rounded-lg border">
                      <p className="text-xs text-muted-foreground mb-1">Invoice</p>
                      <p className="text-sm font-mono">{selectedTransaction.invoice_no}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Batch Details */}
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground">Batch Information</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedTransaction.production_date && (
                    <div>
                      <span className="text-muted-foreground">Produced: </span>
                      <span className="font-medium">{new Date(selectedTransaction.production_date).toLocaleDateString('en-IN')}</span>
                    </div>
                  )}
                  {selectedTransaction.batch_total_weight && (
                    <div>
                      <span className="text-muted-foreground">Weight: </span>
                      <span className="font-medium">{formatWeight(selectedTransaction.batch_total_weight)}</span>
                    </div>
                  )}
                  {selectedTransaction.batch_initial_quantity && (
                    <div>
                      <span className="text-muted-foreground">Initial Qty: </span>
                      <span className="font-medium">{selectedTransaction.batch_initial_quantity}m</span>
                    </div>
                  )}
                  {selectedTransaction.batch_piece_length && (
                    <div>
                      <span className="text-muted-foreground">Piece Length: </span>
                      <span className="font-medium">{selectedTransaction.batch_piece_length}m</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
