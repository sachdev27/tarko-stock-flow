import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Activity, ShoppingCart, Factory, ArrowUpRight, ArrowDownRight, TrendingDown, Scissors, Package2, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface ActivityItem {
  id: string;
  transaction_type: string;
  quantity_change: number;
  created_at: string;
  user_name: string;
  batch_code: string;
  product_type: string;
}

interface RecentActivityProps {
  activities: ActivityItem[];
}

export const RecentActivity = ({ activities }: RecentActivityProps) => {
  const getTransactionIcon = (type: string) => {
    const iconClass = "h-4 w-4";
    switch (type) {
      case 'SALE':
      case 'DISPATCH':
        return <ShoppingCart className={`${iconClass} text-red-600`} />;
      case 'PRODUCTION':
        return <Factory className={`${iconClass} text-green-600`} />;
      case 'RETURN':
        return <TrendingDown className={`${iconClass} text-emerald-600`} />;
      case 'CUT_ROLL':
        return <Scissors className={`${iconClass} text-blue-600`} />;
      case 'SPLIT_BUNDLE':
      case 'COMBINE_BUNDLE':
        return <Package2 className={`${iconClass} text-purple-600`} />;
      case 'SCRAP':
        return <Trash2 className={`${iconClass} text-rose-600`} />;
      case 'REVERTED':
        return <Activity className={`${iconClass} text-gray-500`} />;
      default:
        return <Activity className={`${iconClass} text-gray-600`} />;
    }
  };

  const getTransactionBadge = (type: string): "default" | "secondary" | "destructive" | "outline" => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      'SALE': 'destructive',
      'PRODUCTION': 'default',
      'DISPATCH': 'destructive',
      'REVERTED': 'outline',
      'RETURN': 'default',
      'CUT_ROLL': 'secondary',
      'SPLIT_BUNDLE': 'secondary',
      'COMBINE_BUNDLE': 'secondary',
      'SCRAP': 'destructive',
    };
    return variants[type] || 'outline';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Recent Activity
        </CardTitle>
        <CardDescription>Latest transactions and operations</CardDescription>
      </CardHeader>
      <CardContent>
        {activities && activities.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {getTransactionIcon(activity.transaction_type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={getTransactionBadge(activity.transaction_type)} className="text-xs">
                          {activity.transaction_type}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono truncate">
                          {activity.batch_code}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {activity.product_type} • {activity.user_name}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`flex items-center gap-1 text-sm font-semibold ${
                      activity.quantity_change > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {activity.quantity_change > 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(activity.quantity_change)}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(activity.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No recent activity
          </div>
        )}
      </CardContent>
    </Card>
  );
};
