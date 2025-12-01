import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface RollbackHistoryTabProps {
  rollbackHistory: any[];
}

export const RollbackHistoryTab = ({ rollbackHistory }: RollbackHistoryTabProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Rollback History
        </CardTitle>
        <CardDescription>
          View history of all rollback operations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rollbackHistory.map((entry) => (
            <div
              key={entry.id}
              className={`p-4 border rounded-lg ${entry.success ? 'bg-green-50 dark:bg-green-950/20' : 'bg-red-50 dark:bg-red-950/20'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{entry.snapshot_name}</h4>
                    <Badge variant={entry.success ? 'default' : 'destructive'}>
                      {entry.success ? 'Success' : 'Failed'}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Rolled back by {entry.rolled_back_by_name || entry.rolled_back_by_username} on {formatDate(entry.rolled_back_at)}
                  </div>
                  {entry.affected_tables && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Affected tables: {entry.affected_tables.join(', ')}
                    </div>
                  )}
                  {entry.error_message && (
                    <div className="text-xs text-red-600 mt-1">
                      Error: {entry.error_message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {rollbackHistory.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No rollback operations performed yet
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
