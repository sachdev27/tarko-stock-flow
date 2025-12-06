import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TransactionRecord } from '@/types/transaction';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500/api';

interface MetadataTabProps {
  transaction: TransactionRecord;
}

export function MetadataTab({ transaction }: MetadataTabProps) {
  return (
    <div className="space-y-4 mt-4">
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
                  href={`${API_URL}${transaction.attachment_url}`}
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
    </div>
  );
}
