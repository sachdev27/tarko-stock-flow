import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TransactionRecord } from '@/types/transaction';
import { TransactionTypeBadge } from './TransactionTypeBadge';
import { ParameterBadges } from './ParameterBadges';
import { formatWeight, formatDateTime, formatDate, getProductName } from '@/utils/transactions/formatters';
import {
  Calendar,
  Package,
  User,
  FileText,
  Weight,
  Ruler,
  Box,
  Factory,
  Tag,
} from 'lucide-react';

interface TransactionDetailModalProps {
  transaction: TransactionRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransactionDetailModal({
  transaction,
  open,
  onOpenChange,
}: TransactionDetailModalProps) {
  if (!transaction) return null;

  // Check if this is an inventory operation (CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES)
  const isInventoryOperation = ['CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES'].includes(transaction.transaction_type);

  // Check if this is a dispatch transaction
  const isDispatch = transaction.transaction_type === 'DISPATCH';

  // Check if this is a return transaction
  const isReturn = transaction.transaction_type === 'RETURN';

  // Check if this is a scrap transaction
  const isScrap = transaction.transaction_type === 'SCRAP';

  // Check if this is a reverted transaction
  const isReverted = transaction.transaction_type === 'REVERTED';

  // Check if dispatch has mixed products
  const hasMixedProducts = isDispatch && transaction.roll_snapshot?.mixed_products === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <TransactionTypeBadge transaction={transaction} />
            <span>
              {transaction.product_type === 'Mixed' && transaction.brand === 'Mixed'
                ? 'Mixed Products'
                : getProductName(transaction)}
            </span>
          </DialogTitle>
          <DialogDescription>
            Transaction ID: {transaction.id}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          {isInventoryOperation || isReverted ? (
            // Simplified view for inventory operations
            <div className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Operation Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Date
                    </div>
                    <div className="font-medium">
                      {formatDateTime(transaction.transaction_date)}
                    </div>
                  </div>

                  {transaction.notes && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">What Happened</div>
                      <div className="text-sm bg-muted p-3 rounded-md">
                        {transaction.notes}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Product details for reverted operations */}
              {isReverted && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Product Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Product Type</div>
                          <div className="font-medium">{transaction.product_type}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                            <Tag className="h-4 w-4" />
                            Brand
                          </div>
                          <Badge variant="outline">{transaction.brand}</Badge>
                        </div>
                      </div>

                      {transaction.parameters && Object.keys(transaction.parameters).length > 0 && (
                        <div>
                          <div className="text-sm text-muted-foreground mb-2">Parameters</div>
                          <ParameterBadges parameters={transaction.parameters} />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Stock Details for both regular and reverted operations */}
              {transaction.roll_snapshot?.stock_entries && transaction.roll_snapshot.stock_entries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Box className="h-5 w-5" />
                      {isReverted ? 'What Was Reverted' : 'Result'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {transaction.roll_snapshot.stock_entries.map((entry, idx) => (
                      <div key={idx} className="border rounded-lg p-4">
                        {entry.stock_type === 'SPLIT_BUNDLE' ? (
                          // SPLIT_BUNDLE specific display
                          <div className="space-y-3">
                            <div className="font-medium text-lg">
                              Split from bundle of {entry.from_bundle_size} pieces
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Piece length: {entry.piece_length?.toFixed(2)}m each
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Result: {entry.spare_groups} spare group{entry.spare_groups !== 1 ? 's' : ''}
                            </div>
                          </div>
                        ) : entry.stock_type === 'BUNDLE' ? (
                          // COMBINE_SPARES specific display
                          <div className="space-y-3">
                            <div className="font-medium text-lg">
                              {entry.bundles_created} × BUNDLE
                            </div>
                            <div>
                              <span className="text-sm text-muted-foreground">Bundles Created:</span>
                              <div className="mt-2 space-y-2">
                                <div className="text-sm bg-purple-100 dark:bg-purple-900 px-3 py-2 rounded">
                                  <span className="font-medium">{entry.bundles_created} bundle{entry.bundles_created !== 1 ? 's' : ''}</span>
                                  <span className="text-muted-foreground"> • </span>
                                  <span>{entry.bundle_size} pieces per bundle</span>
                                  <span className="text-muted-foreground"> • </span>
                                  <span>{entry.piece_length?.toFixed(2)}m per piece</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          // CUT_ROLL display
                          <>
                            <div className="font-medium text-lg mb-3">
                              {entry.cut_piece_lengths && entry.cut_piece_lengths.length > 0
                                ? `${entry.cut_piece_lengths.length} × CUT PIECES`
                                : `${entry.quantity} × ${entry.stock_type.replace('_', ' ')}`
                              }
                            </div>
                            {entry.cut_piece_lengths && entry.cut_piece_lengths.length > 0 && (
                              <div>
                                <span className="text-sm text-muted-foreground">Pieces:</span>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {entry.cut_piece_lengths.map((length, idx) => (
                                    <span key={idx} className="text-sm bg-amber-100 dark:bg-amber-900 px-3 py-1.5 rounded font-medium">
                                      {length.toFixed(2)}m
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            // Full tabbed view for other transaction types
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="product">Product</TabsTrigger>
                {isDispatch ? (
                  <>
                    <TabsTrigger value="logistics">Logistics</TabsTrigger>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  </>
                ) : isScrap ? (
                  <>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  </>
                ) : !isReturn ? (
                  <>
                    <TabsTrigger value="rolls">Stock</TabsTrigger>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  </>
                ) : (
                  <>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                  </>
                )}
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4 mt-4">
              {/* Transaction Info Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Transaction Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Transaction Date
                      </div>
                      <div className="font-medium">
                        {transaction.transaction_type === 'DISPATCH'
                          ? formatDate(transaction.transaction_date)
                          : formatDateTime(transaction.transaction_date)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Created At
                      </div>
                      <div className="font-medium">
                        {formatDateTime(transaction.created_at)}
                      </div>
                    </div>
                  </div>

                  {!isDispatch && transaction.batch_no && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Batch Number
                      </div>
                      <Badge variant="outline" className="font-mono">
                        {transaction.batch_no}
                      </Badge>
                    </div>
                  )}

                  {transaction.invoice_no && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Invoice Number
                      </div>
                      <Badge variant="outline" className="font-mono">
                        {transaction.invoice_no}
                      </Badge>
                    </div>
                  )}

                  {transaction.customer_name && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Customer
                      </div>
                      <div className="font-medium">{transaction.customer_name}</div>
                    </div>
                  )}

                  {/* Dispatch-specific information in overview */}
                  {isDispatch && transaction.roll_snapshot && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        {transaction.roll_snapshot.dispatch_number && (
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">Dispatch Number</div>
                            <Badge variant="outline" className="font-mono text-base">
                              {transaction.roll_snapshot.dispatch_number}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Scrap-specific information in overview */}
                  {isScrap && transaction.roll_snapshot && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        {transaction.roll_snapshot.scrap_number && (
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">Scrap Number</div>
                            <Badge variant="outline" className="font-mono text-base">
                              {transaction.roll_snapshot.scrap_number}
                            </Badge>
                          </div>
                        )}
                        {transaction.roll_snapshot.reason && (
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">Reason</div>
                            <div className="font-medium text-destructive">{transaction.roll_snapshot.reason}</div>
                          </div>
                        )}
                        {transaction.roll_snapshot.status && (
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">Status</div>
                            <Badge className="bg-rose-100 text-rose-700">{transaction.roll_snapshot.status}</Badge>
                          </div>
                        )}
                        {transaction.roll_snapshot.scrap_notes && (
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">Scrap Notes</div>
                            <div className="text-sm bg-muted p-3 rounded-md">
                              {transaction.roll_snapshot.scrap_notes}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {!isDispatch && transaction.notes && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Notes</div>
                      <div className="text-sm bg-muted p-3 rounded-md">
                        {transaction.notes}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Weight & Quantity Card - hide for dispatches and returns */}
              {!isDispatch && !isReturn && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Weight className="h-5 w-5" />
                    Weight & Quantity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Total Weight</div>
                      <div className="text-lg font-bold">
                        {formatWeight(transaction.total_weight, transaction.unit_abbreviation)}
                      </div>
                    </div>
                    {transaction.weight_per_meter && typeof transaction.weight_per_meter === 'number' && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                          <Weight className="h-4 w-4" />
                          Weight/Meter
                        </div>
                        <div className="text-lg font-bold">
                          {transaction.weight_per_meter.toFixed(3)} kg/m
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Quantity Change</div>
                      <div className="text-lg font-bold">
                        {transaction.quantity_change > 0 ? '+' : ''}
                        {/* Use actual quantity breakdown if available, otherwise use quantity_change */}
                        {transaction.quantity_breakdown && transaction.quantity_breakdown.totalItems > 0
                          ? transaction.quantity_breakdown.totalItems
                          : transaction.quantity_change}
                      </div>
                    </div>
                    {transaction.roll_length_meters && typeof transaction.roll_length_meters === 'number' && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                          <Ruler className="h-4 w-4" />
                          Length
                        </div>
                        <div className="text-lg font-bold">
                          {transaction.roll_length_meters.toFixed(2)} m
                        </div>
                      </div>
                    )}
                    {transaction.roll_snapshot?.total_rolls && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                          <Box className="h-4 w-4" />
                          Total Rolls
                        </div>
                        <div className="text-lg font-bold">
                          {transaction.roll_snapshot.total_rolls}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              )}
            </TabsContent>

            {/* Product Tab */}
            <TabsContent value="product" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Factory className="h-5 w-5" />
                    Product Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isReturn && transaction.roll_snapshot?.item_breakdown && Array.isArray(transaction.roll_snapshot.item_breakdown) && transaction.roll_snapshot.item_breakdown.length > 0 ? (
                    <div>
                      <div className="text-sm font-medium mb-3">Items in This Return</div>
                      <div className="space-y-3">
                        {(() => {
                          // Group items by type, length, and parameters to avoid showing duplicates
                          const grouped = transaction.roll_snapshot.item_breakdown.reduce((acc: any, item: any) => {
                            // Create a unique key based on item characteristics
                            const paramStr = JSON.stringify(item.parameters || {});
                            const key = `${item.item_type}-${item.length_meters || ''}-${item.piece_length || ''}-${item.bundle_size || ''}-${paramStr}`;

                            if (!acc[key]) {
                              acc[key] = { ...item, quantity: 0 };
                            }
                            acc[key].quantity += item.quantity || 0;
                            return acc;
                          }, {});

                          return Object.values(grouped).map((item: any, idx: number) => (
                          <div key={idx} className="border rounded-lg p-4 bg-green-50/50">
                            <div className="flex items-center justify-between mb-3">
                              <Badge variant="outline" className="text-base">{item.item_type?.replace('_', ' ')}</Badge>
                              <span className="font-bold text-lg">Qty: {item.quantity}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="text-muted-foreground">Product:</span>
                                <span className="ml-2 font-medium">{item.product_type}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Brand:</span>
                                <span className="ml-2 font-medium">{item.brand}</span>
                              </div>
                              {item.bundle_size && (
                                <div>
                                  <span className="text-muted-foreground">Bundle Size:</span>
                                  <span className="ml-2 font-medium">{item.bundle_size} pieces</span>
                                </div>
                              )}
                              {item.piece_count && (
                                <div>
                                  <span className="text-muted-foreground">Pieces:</span>
                                  <span className="ml-2 font-medium">{item.piece_count}</span>
                                </div>
                              )}
                              {item.piece_length && (
                                <div>
                                  <span className="text-muted-foreground">Length per piece:</span>
                                  <span className="ml-2 font-medium">{Number(item.piece_length).toFixed(2)}m</span>
                                </div>
                              )}
                              {item.length_meters && item.item_type !== 'SPARE_PIECES' && item.item_type !== 'BUNDLE' && (
                                <div>
                                  <span className="text-muted-foreground">Length:</span>
                                  <span className="ml-2 font-medium">{Number(item.length_meters).toFixed(2)}m</span>
                                </div>
                              )}
                            </div>
                            {item.parameters && Object.keys(item.parameters).length > 0 && (
                              <div className="mt-3">
                                <div className="text-xs text-muted-foreground mb-2">Parameters:</div>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(item.parameters).map(([key, value]) => (
                                    <Badge key={key} variant="secondary">
                                      {key}: {String(value)}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          ));
                        })()}
                      </div>
                    </div>
                  ) : isReturn && transaction.roll_snapshot ? (
                    <div>
                      <div className="text-sm font-medium mb-3">Return Summary</div>
                      <div className="p-4 bg-green-50/50 rounded-lg border">
                        <div className="text-muted-foreground text-sm">
                          This return was created before detailed item tracking was implemented.
                        </div>
                        {typeof transaction.roll_snapshot.item_breakdown === 'string' && (
                          <div className="mt-3">
                            <span className="font-medium">Items: </span>
                            <span className="text-lg">{transaction.roll_snapshot.item_breakdown}</span>
                          </div>
                        )}
                        {transaction.roll_snapshot.full_rolls > 0 && (
                          <div className="mt-2">
                            <span className="font-medium">Full Rolls: </span>
                            <span>{transaction.roll_snapshot.full_rolls}</span>
                          </div>
                        )}
                        {transaction.roll_snapshot.cut_rolls > 0 && (
                          <div className="mt-2">
                            <span className="font-medium">Cut Rolls: </span>
                            <span>{transaction.roll_snapshot.cut_rolls}</span>
                          </div>
                        )}
                        {transaction.roll_snapshot.bundles > 0 && (
                          <div className="mt-2">
                            <span className="font-medium">Bundles: </span>
                            <span>{transaction.roll_snapshot.bundles}</span>
                          </div>
                        )}
                        {transaction.roll_snapshot.spare_pieces > 0 && (
                          <div className="mt-2">
                            <span className="font-medium">Spare Pieces: </span>
                            <span>{transaction.roll_snapshot.spare_pieces}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : isScrap && transaction.roll_snapshot?.item_breakdown && Array.isArray(transaction.roll_snapshot.item_breakdown) && transaction.roll_snapshot.item_breakdown.length > 0 ? (
                    <div>
                      <div className="text-sm font-medium mb-3">Items Scrapped</div>
                      <div className="space-y-3">
                        {transaction.roll_snapshot.item_breakdown.map((item: any, idx: number) => (
                          <div key={idx} className="border rounded-lg p-4 bg-rose-50/50 dark:bg-rose-950/50">
                            <div className="flex items-center justify-between mb-3">
                              <Badge variant="outline" className="text-base bg-rose-100 text-rose-700 border-rose-300">{item.stock_type?.replace('_', ' ')}</Badge>
                              <span className="font-bold text-lg">Qty: {item.quantity}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="text-muted-foreground">Product:</span>
                                <span className="ml-2 font-medium">{item.product_type}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Brand:</span>
                                <span className="ml-2 font-medium">{item.brand}</span>
                              </div>
                              {item.batch_code && (
                                <div>
                                  <span className="text-muted-foreground">Batch:</span>
                                  <span className="ml-2 font-medium font-mono">{item.batch_code}</span>
                                </div>
                              )}
                              {item.length_per_unit && (
                                <div>
                                  <span className="text-muted-foreground">Length per unit:</span>
                                  <span className="ml-2 font-medium">{Number(item.length_per_unit).toFixed(2)}m</span>
                                </div>
                              )}
                              {item.pieces_per_bundle && (
                                <div>
                                  <span className="text-muted-foreground">Bundle size:</span>
                                  <span className="ml-2 font-medium">{item.pieces_per_bundle} pieces</span>
                                </div>
                              )}
                              {item.piece_length_meters && (
                                <div>
                                  <span className="text-muted-foreground">Piece length:</span>
                                  <span className="ml-2 font-medium">{Number(item.piece_length_meters).toFixed(2)}m</span>
                                </div>
                              )}
                              {item.stock_type === 'CUT_ROLL' && !item.length_per_unit && (
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">Cut pieces:</span>
                                  <span className="ml-2 font-medium">{item.quantity} piece{item.quantity !== 1 ? 's' : ''}</span>
                                  {item.pieces && item.pieces.length > 0 && (
                                    <div className="mt-2">
                                      <div className="flex flex-wrap gap-1">
                                        {item.pieces
                                          .filter((p: any) => p.piece_type === 'CUT_PIECE')
                                          .map((piece: any, i: number) => (
                                            <Badge key={i} variant="secondary" className="text-xs">
                                              {piece.length_meters}m
                                            </Badge>
                                          ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {item.estimated_value && (
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">Estimated Value:</span>
                                  <span className="ml-2 font-medium text-rose-600">₹{Number(item.estimated_value).toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                            {item.parameters && Object.keys(item.parameters).length > 0 && (
                              <div className="mt-3">
                                <div className="text-xs text-muted-foreground mb-2">Parameters:</div>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(item.parameters).map(([key, value]) => (
                                    <Badge key={key} variant="secondary">
                                      {key}: {String(value)}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {item.item_notes && (
                              <div className="mt-3 text-sm text-muted-foreground italic">
                                Note: {item.item_notes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : isDispatch && transaction.roll_snapshot?.item_breakdown && transaction.roll_snapshot.item_breakdown.length > 0 ? (
                    <div>
                      <div className="text-sm font-medium mb-3">Items in This Dispatch</div>
                      <div className="space-y-3">
                        {(() => {
                          // Group items by type, length, and parameters to avoid showing duplicates
                          const grouped = transaction.roll_snapshot.item_breakdown.reduce((acc: any, item: any) => {
                            // Create a unique key based on item characteristics
                            const paramStr = JSON.stringify(item.parameters || {});
                            const key = `${item.item_type}-${item.length_meters || ''}-${item.piece_length || ''}-${item.bundle_size || ''}-${paramStr}`;

                            if (!acc[key]) {
                              acc[key] = { ...item, quantity: 0 };
                            }
                            acc[key].quantity += item.quantity || 0;
                            return acc;
                          }, {});

                          return Object.values(grouped).map((item: any, idx: number) => (
                          <div key={idx} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <Badge variant="outline" className="text-base">{item.item_type?.replace('_', ' ')}</Badge>
                              <span className="font-bold text-lg">Qty: {item.quantity}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="text-muted-foreground">Product:</span>
                                <span className="ml-2 font-medium">{item.product_type}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Brand:</span>
                                <span className="ml-2 font-medium">{item.brand}</span>
                              </div>
                              {item.bundle_size && (
                                <div>
                                  <span className="text-muted-foreground">Bundle Size:</span>
                                  <span className="ml-2 font-medium">{item.bundle_size} pieces</span>
                                </div>
                              )}
                              {item.piece_count && (
                                <div>
                                  <span className="text-muted-foreground">Pieces:</span>
                                  <span className="ml-2 font-medium">{item.piece_count}</span>
                                </div>
                              )}
                              {item.piece_length && (
                                <div>
                                  <span className="text-muted-foreground">Length per piece:</span>
                                  <span className="ml-2 font-medium">{Number(item.piece_length).toFixed(2)}m</span>
                                </div>
                              )}
                              {item.length_meters && item.item_type !== 'SPARE_PIECES' && item.item_type !== 'BUNDLE' && (
                                <div>
                                  <span className="text-muted-foreground">Length:</span>
                                  <span className="ml-2 font-medium">{Number(item.length_meters).toFixed(2)}m</span>
                                </div>
                              )}
                            </div>
                            {item.parameters && Object.keys(item.parameters).length > 0 && (
                              <div className="mt-3">
                                <div className="text-xs text-muted-foreground mb-2">Parameters:</div>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(item.parameters).map(([key, value]) => (
                                    <Badge key={key} variant="secondary">
                                      {key}: {String(value)}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          ));
                        })()}
                      </div>
                    </div>
                  ) : !isDispatch && !isReturn ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Product Type</div>
                          <div className="font-medium">{transaction.product_type}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                            <Tag className="h-4 w-4" />
                            Brand
                          </div>
                          <Badge variant="outline">{transaction.brand}</Badge>
                        </div>
                      </div>

                      <Separator />

                      {/* Parameters */}
                      {transaction.parameters && Object.keys(transaction.parameters).length > 0 && (
                        <div>
                          <div className="text-sm text-muted-foreground mb-2">Parameters</div>
                          <ParameterBadges parameters={transaction.parameters} />
                        </div>
                      )}
                    </>
                  ) : null}

                  {!isDispatch && (
                  <>
                  <Separator />

                  {/* Production Details */}
                  {transaction.production_date && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Production Date</div>
                      <div className="font-medium">
                        {formatDateTime(transaction.production_date)}
                      </div>
                    </div>
                  )}

                  {transaction.weight_per_meter && typeof transaction.weight_per_meter === 'number' && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Weight per Meter</div>
                      <div className="font-medium">
                        {transaction.weight_per_meter.toFixed(3)} kg/m
                      </div>
                    </div>
                  )}

                  {/* Production Breakdown */}
                  {/* Production Breakdown from quantity_breakdown */}
                  {transaction.quantity_breakdown &&
                    (transaction.quantity_breakdown.fullRolls > 0 ||
                    transaction.quantity_breakdown.cutRolls > 0 ||
                    transaction.quantity_breakdown.bundles > 0 ||
                    transaction.quantity_breakdown.sparePieces > 0) && (
                    <>
                      <Separator />
                      <div>
                        <div className="text-sm font-medium mb-3">Quantity Breakdown</div>
                        <div className="grid grid-cols-2 gap-3">
                          {transaction.quantity_breakdown.fullRolls > 0 && (
                            <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                              <div className="text-xs text-muted-foreground">Full Rolls</div>
                              <div className="text-lg font-bold">
                                {transaction.quantity_breakdown.fullRolls}
                              </div>
                            </div>
                          )}
                          {transaction.quantity_breakdown.cutRolls > 0 && (
                            <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-md">
                              <div className="text-xs text-muted-foreground">Cut Rolls</div>
                              <div className="text-lg font-bold">
                                {transaction.quantity_breakdown.cutRolls}
                              </div>
                            </div>
                          )}
                          {transaction.quantity_breakdown.bundles > 0 && (
                            <div className="bg-green-50 dark:bg-green-950 p-3 rounded-md">
                              <div className="text-xs text-muted-foreground">Bundles</div>
                              <div className="text-lg font-bold">
                                {transaction.quantity_breakdown.bundles}
                              </div>
                            </div>
                          )}
                          {transaction.quantity_breakdown.sparePieces > 0 && (
                            <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded-md">
                              <div className="text-xs text-muted-foreground">Spare Pieces</div>
                              <div className="text-lg font-bold">
                                {transaction.quantity_breakdown.sparePieces}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Legacy Production Breakdown (fallback) */}
                  {!transaction.quantity_breakdown &&
                    (transaction.standard_rolls_count ||
                    transaction.cut_rolls_count ||
                    transaction.bundles_count ||
                    transaction.spare_pieces_count) && (
                    <>
                      <Separator />
                      <div>
                        <div className="text-sm font-medium mb-3">Production Breakdown</div>
                        <div className="grid grid-cols-2 gap-3">
                          {transaction.standard_rolls_count ? (
                            <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                              <div className="text-xs text-muted-foreground">Standard Rolls</div>
                              <div className="text-lg font-bold">
                                {transaction.standard_rolls_count}
                              </div>
                              {transaction.avg_standard_roll_length && typeof transaction.avg_standard_roll_length === 'number' && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Avg: {transaction.avg_standard_roll_length.toFixed(2)}m
                                </div>
                              )}
                            </div>
                          ) : null}
                          {transaction.cut_rolls_count ? (
                            <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-md">
                              <div className="text-xs text-muted-foreground">Cut Rolls</div>
                              <div className="text-lg font-bold">
                                {transaction.cut_rolls_count}
                              </div>
                            </div>
                          ) : null}
                          {transaction.bundles_count ? (
                            <div className="bg-green-50 dark:bg-green-950 p-3 rounded-md">
                              <div className="text-xs text-muted-foreground">Bundles</div>
                              <div className="text-lg font-bold">
                                {transaction.bundles_count}
                              </div>
                              {transaction.bundle_size && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Size: {transaction.bundle_size} pieces
                                </div>
                              )}
                            </div>
                          ) : null}
                          {transaction.spare_pieces_count ? (
                            <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded-md">
                              <div className="text-xs text-muted-foreground">Spare Pieces</div>
                              <div className="text-lg font-bold">
                                {transaction.spare_pieces_count}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </>
                  )}
                  </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Logistics Tab - for dispatches */}
            {isDispatch && (
            <TabsContent value="logistics" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Logistics Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {transaction.customer_name && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Customer
                        </div>
                        <div className="font-medium text-lg">{transaction.customer_name}</div>
                      </div>
                    )}

                    {transaction.roll_snapshot?.bill_to_name && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Bill To</div>
                        <div className="font-medium text-lg">{transaction.roll_snapshot.bill_to_name}</div>
                      </div>
                    )}

                    {transaction.roll_snapshot?.vehicle_number && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Vehicle Number</div>
                        <div className="font-medium text-lg font-mono">{transaction.roll_snapshot.vehicle_number}</div>
                      </div>
                    )}

                    {transaction.roll_snapshot?.driver_name && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Driver Name</div>
                        <div className="font-medium text-lg">{transaction.roll_snapshot.driver_name}</div>
                      </div>
                    )}

                    {transaction.roll_snapshot?.transport_name && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Transport Company</div>
                        <div className="font-medium text-lg">{transaction.roll_snapshot.transport_name}</div>
                      </div>
                    )}

                    {transaction.invoice_no && (
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Invoice Number</div>
                        <Badge variant="outline" className="font-mono text-base">
                          {transaction.invoice_no}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {transaction.roll_snapshot?.item_types && transaction.roll_snapshot.item_types.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <div className="text-sm text-muted-foreground mb-2">Item Types Dispatched</div>
                        <div className="flex flex-wrap gap-2">
                          {transaction.roll_snapshot.item_types.map((type: string, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-base">
                              {type.replace('_', ' ')}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            )}

            {/* Rolls Tab - hide for dispatches */}
            {!isDispatch && (
            <TabsContent value="rolls" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Box className="h-5 w-5" />
                    {isScrap ? 'Scrapped Items' : 'Stock Details'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {transaction.roll_snapshot?.stock_entries && transaction.roll_snapshot.stock_entries.length > 0 ? (
                    <div className="space-y-2">
                      {transaction.roll_snapshot.stock_entries.map((entry, idx) => (
                        <div
                          key={idx}
                          className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="font-medium text-lg">
                              {entry.stock_type === 'SPARE' || entry.stock_type === 'SPARE_PIECES' ? (
                                // Show actual piece count for spares
                                <>{entry.spare_piece_count || entry.quantity} × {entry.stock_type.replace('_', ' ')}{entry.spare_piece_count && ` (${entry.quantity} group${entry.quantity !== 1 ? 's' : ''})`}</>
                              ) : (
                                <>{entry.quantity} × {entry.stock_type.replace('_', ' ')}</>
                              )}
                            </div>
                            <Badge variant={entry.status === 'IN_STOCK' ? 'default' : 'secondary'}>
                              {entry.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {entry.length_per_unit && (
                              <div>
                                <span className="text-muted-foreground">Length per unit:</span>
                                <span className="ml-2 font-medium">{Number(entry.length_per_unit).toFixed(2)}m</span>
                              </div>
                            )}
                            {entry.pieces_per_bundle && (
                              <div>
                                <span className="text-muted-foreground">Pieces per bundle:</span>
                                <span className="ml-2 font-medium">{entry.pieces_per_bundle}</span>
                              </div>
                            )}
                            {entry.piece_length_meters && (
                              <div>
                                <span className="text-muted-foreground">Piece length:</span>
                                <span className="ml-2 font-medium">{Number(entry.piece_length_meters).toFixed(2)}m</span>
                              </div>
                            )}
                            {entry.cut_piece_lengths && entry.cut_piece_lengths.length > 0 && (
                              <div className="col-span-2">
                                <span className="text-muted-foreground">Cut pieces:</span>
                                <div className="ml-2 mt-1 flex flex-wrap gap-1">
                                  {entry.cut_piece_lengths.map((length, idx) => (
                                    <span key={idx} className="text-xs bg-amber-100 dark:bg-amber-900 px-2 py-1 rounded">
                                      {length.toFixed(2)}m
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Calculate total meters and weight for this entry */}
                          <div className="mt-3 pt-3 border-t space-y-2">
                            <div className="text-sm font-medium">
                              {entry.stock_type === 'FULL_ROLL' ? (
                                <>Total: {(entry.quantity * (entry.length_per_unit || 0)).toFixed(2)}m</>
                              ) : entry.stock_type === 'BUNDLE' ? (
                                <>Total: {(entry.quantity * (entry.pieces_per_bundle || 0) * (entry.piece_length_meters || 0)).toFixed(2)}m ({entry.quantity * (entry.pieces_per_bundle || 0)} pieces)</>
                              ) : (entry.stock_type === 'SPARE_PIECES' || entry.stock_type === 'SPARE') ? (
                                <>Total: {((entry.spare_piece_count || entry.quantity) * (entry.piece_length_meters || 0)).toFixed(2)}m ({entry.spare_piece_count || entry.quantity} piece{(entry.spare_piece_count || entry.quantity) !== 1 ? 's' : ''})</>
                              ) : entry.stock_type === 'CUT_ROLL' && entry.cut_piece_lengths ? (
                                <>Total: {entry.cut_piece_lengths.reduce((sum, len) => sum + len, 0).toFixed(2)}m ({entry.cut_piece_lengths.length} cut piece{entry.cut_piece_lengths.length !== 1 ? 's' : ''})</>
                              ) : null}
                            </div>
                            {transaction.weight_per_meter && typeof transaction.weight_per_meter === 'number' && (
                              <div className="text-sm text-muted-foreground">
                                {entry.stock_type === 'FULL_ROLL' ? (
                                  <>Weight: {(entry.quantity * (entry.length_per_unit || 0) * transaction.weight_per_meter).toFixed(2)} kg
                                    <span className="text-xs ml-1">({entry.quantity} rolls × {(entry.length_per_unit || 0).toFixed(2)}m × {transaction.weight_per_meter.toFixed(3)} kg/m)</span>
                                  </>
                                ) : entry.stock_type === 'BUNDLE' ? (
                                  <>Weight: {(entry.quantity * (entry.pieces_per_bundle || 0) * (entry.piece_length_meters || 0) * transaction.weight_per_meter).toFixed(2)} kg
                                    <span className="text-xs ml-1">({entry.quantity * (entry.pieces_per_bundle || 0)} pieces × {(entry.piece_length_meters || 0).toFixed(2)}m × {transaction.weight_per_meter.toFixed(3)} kg/m)</span>
                                  </>
                                ) : (entry.stock_type === 'SPARE_PIECES' || entry.stock_type === 'SPARE') ? (
                                  <>Weight: {((entry.spare_piece_count || entry.quantity) * (entry.piece_length_meters || 0) * transaction.weight_per_meter).toFixed(2)} kg
                                    <span className="text-xs ml-1">({entry.spare_piece_count || entry.quantity} pieces × {(entry.piece_length_meters || 0).toFixed(2)}m × {transaction.weight_per_meter.toFixed(3)} kg/m)</span>
                                  </>
                                ) : entry.stock_type === 'CUT_ROLL' && entry.cut_piece_lengths ? (
                                  <>Weight: {(entry.cut_piece_lengths.reduce((sum, len) => sum + len, 0) * transaction.weight_per_meter).toFixed(2)} kg
                                    <span className="text-xs ml-1">({entry.cut_piece_lengths.length} cut pieces × {entry.cut_piece_lengths.reduce((sum, len) => sum + len, 0).toFixed(2)}m total × {transaction.weight_per_meter.toFixed(3)} kg/m)</span>
                                  </>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : transaction.roll_snapshot?.rolls && transaction.roll_snapshot.rolls.length > 0 ? (
                    <div className="space-y-2">
                      {transaction.roll_snapshot.rolls.map((roll, idx) => (
                        <div
                          key={idx}
                          className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="font-mono font-medium">{roll.roll_id}</div>
                            <Badge variant={roll.is_cut_roll ? 'destructive' : 'default'}>
                              {roll.roll_type}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Batch:</span>
                              <span className="ml-2">{roll.batch_code}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Qty Dispatched:</span>
                              <span className="ml-2">{roll.quantity_dispatched}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Length:</span>
                              <span className="ml-2">{Number(roll.length_meters).toFixed(2)}m</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Initial Length:</span>
                              <span className="ml-2">
                                {Number(roll.initial_length_meters).toFixed(2)}m
                              </span>
                            </div>
                            {roll.bundle_size && (
                              <div>
                                <span className="text-muted-foreground">Bundle Size:</span>
                                <span className="ml-2">{roll.bundle_size}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-muted-foreground">Status:</span>
                              <Badge variant="outline" className="ml-2">
                                {roll.status}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No stock details available
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            )}

            {/* Metadata Tab */}
            <TabsContent value="metadata" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">System Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Batch Code</div>
                    <div className="font-mono text-sm">{transaction.batch_code}</div>
                  </div>

                  {transaction.dispatch_id && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Dispatch ID</div>
                      <div className="font-mono text-sm">{transaction.dispatch_id}</div>
                    </div>
                  )}

                  {(transaction.created_by_username ||
                    transaction.created_by_email ||
                    transaction.created_by_name) && (
                    <>
                      <Separator />
                      <div>
                        <div className="text-sm font-medium mb-2">Created By</div>
                        <div className="space-y-1 text-sm">
                          {transaction.created_by_name && (
                            <div>
                              <span className="text-muted-foreground">Name:</span>
                              <span className="ml-2">{transaction.created_by_name}</span>
                            </div>
                          )}
                          {transaction.created_by_username && (
                            <div>
                              <span className="text-muted-foreground">Username:</span>
                              <span className="ml-2">{transaction.created_by_username}</span>
                            </div>
                          )}
                          {transaction.created_by_email && (
                            <div>
                              <span className="text-muted-foreground">Email:</span>
                              <span className="ml-2">{transaction.created_by_email}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {transaction.attachment_url && (
                    <>
                      <Separator />
                      <div>
                        <div className="text-sm text-muted-foreground mb-2">Attachment</div>
                        <a
                          href={transaction.attachment_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          View Attachment
                        </a>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
