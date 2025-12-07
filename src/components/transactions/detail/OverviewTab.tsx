import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TransactionRecord } from '@/types/transaction';
import { formatWeight, formatDateTime, formatDate } from '@/utils/transactions/formatters';
import {
  Calendar,
  Package,
  User,
  FileText,
  Weight,
  Ruler,
  Box,
} from 'lucide-react';

interface OverviewTabProps {
  transaction: TransactionRecord;
  isDispatch: boolean;
  isReturn: boolean;
  isScrap: boolean;
}

export function OverviewTab({ transaction, isDispatch, isReturn, isScrap }: OverviewTabProps) {
  return (
    <div className="space-y-4 mt-4">
      {/* Transaction Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Activity Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Activity Date
              </div>
              <div className="font-medium">
                {formatDateTime(transaction.transaction_date)}
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
    </div>
  );
}
