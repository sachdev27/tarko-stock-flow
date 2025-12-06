import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TransactionRecord } from '@/types/transaction';
import { FileText, User } from 'lucide-react';

interface LogisticsTabProps {
  transaction: TransactionRecord;
}

export function LogisticsTab({ transaction }: LogisticsTabProps) {
  return (
    <div className="space-y-4 mt-4">
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
    </div>
  );
}
