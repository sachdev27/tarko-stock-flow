import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Clock, ShoppingCart, Factory, ArrowUpRight, ArrowDownRight, TrendingDown, Scissors, Package2, Trash2, Activity, Undo2, User, Ruler, MapPin } from 'lucide-react';
import { formatRelativeTime, formatDate } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface ActivityItem {
  id: string;
  transaction_type: string;
  quantity_change: number;
  created_at: string;
  user_name: string;
  batch_code: string;
  product_type: string;
  parameters?: Record<string, string | number | boolean>;
  customer_name?: string;
  total_meters?: number;
}

interface RecentActivityProps {
  activities: ActivityItem[];
}

const transactionConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string; route?: string }> = {
  'SALE': { icon: ShoppingCart, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-950', label: 'Sale' },
  'DISPATCH': { icon: ShoppingCart, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-950', label: 'Dispatch' },
  'PRODUCTION': { icon: Factory, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-950', label: 'Production', route: '/production' },
  'RETURN': { icon: TrendingDown, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-950', label: 'Return', route: '/returns' },
  'CUT_ROLL': { icon: Scissors, color: 'text-violet-500', bg: 'bg-violet-100 dark:bg-violet-950', label: 'Cut Roll', route: '/inventory' },
  'SPLIT_BUNDLE': { icon: Package2, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-950', label: 'Split', route: '/inventory' },
  'COMBINE_BUNDLE': { icon: Package2, color: 'text-indigo-500', bg: 'bg-indigo-100 dark:bg-indigo-950', label: 'Combine', route: '/inventory' },
  'SCRAP': { icon: Trash2, color: 'text-rose-500', bg: 'bg-rose-100 dark:bg-rose-950', label: 'Scrap' },
  'REVERTED': { icon: Undo2, color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-950', label: 'Reverted' },
};

const getConfig = (type: string) => transactionConfig[type] || {
  icon: Activity,
  color: 'text-slate-500',
  bg: 'bg-slate-100 dark:bg-slate-950',
  label: type
};

// Format product specs (OD 32 • PE 80 • PN 8)
const formatSpecs = (params: Record<string, string | number | boolean> | undefined) => {
  if (!params) return null;
  const od = params.OD || params.od;
  const pe = params.PE || params.pe;
  const pn = params.PN || params.pn;
  if (od && pe && pn) return `OD${od} PE${pe} PN${pn}`;
  if (od) return `OD${od}`;
  return null;
};

// Short specs for inline display
const shortSpecs = (params: Record<string, string | number | boolean> | undefined) => {
  if (!params) return null;
  const od = params.OD || params.od;
  if (od) return `OD${od}`;
  return null;
};

export const RecentActivity = ({ activities }: RecentActivityProps) => {
  const navigate = useNavigate();
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);

  const handleClick = (activity: ActivityItem) => {
    const config = getConfig(activity.transaction_type);

    // Show modal for main transaction types
    if (['DISPATCH', 'PRODUCTION', 'RETURN', 'CUT_ROLL', 'SCRAP'].includes(activity.transaction_type)) {
      setSelectedActivity(activity);
      return;
    }

    if (config.route) {
      navigate(config.route);
    }
  };

  const renderModalContent = () => {
    if (!selectedActivity) return null;

    const config = getConfig(selectedActivity.transaction_type);
    const Icon = config.icon;
    const absQty = Math.abs(selectedActivity.quantity_change);
    const specs = formatSpecs(selectedActivity.parameters);
    const isMeters = ['PRODUCTION', 'CUT_ROLL'].includes(selectedActivity.transaction_type);

    return (
      <div className="space-y-4 py-2">
        {/* Header with type badge */}
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${config.bg}`}>
            <Icon className={`h-6 w-6 ${config.color}`} />
          </div>
          <div>
            <Badge variant="outline" className={`${config.color} mb-1`}>
              {config.label}
            </Badge>
            <p className="text-xs text-muted-foreground">
              {formatDate(selectedActivity.created_at)} • {formatRelativeTime(selectedActivity.created_at)}
            </p>
          </div>
        </div>

        {/* Product specs - prominent display */}
        {specs && (
          <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
            <p className="text-xs text-muted-foreground">Pipe Specification</p>
            <p className="text-lg font-bold text-primary">{specs}</p>
          </div>
        )}

        {/* Main stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">Quantity</p>
            <p className={`text-2xl font-bold ${selectedActivity.quantity_change > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {selectedActivity.quantity_change > 0 ? '+' : ''}{selectedActivity.quantity_change}
            </p>
            <p className="text-xs text-muted-foreground">
              {isMeters ? 'meters' : 'rolls'}
            </p>
          </div>

          {selectedActivity.total_meters && selectedActivity.total_meters > 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Ruler className="h-3 w-3" /> Total Length
              </p>
              <p className="text-2xl font-bold">{Math.round(selectedActivity.total_meters)}</p>
              <p className="text-xs text-muted-foreground">meters</p>
            </div>
          )}
        </div>

        {/* Customer (for dispatch/return) */}
        {selectedActivity.customer_name && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Customer
            </p>
            <p className="font-semibold">{selectedActivity.customer_name}</p>
          </div>
        )}

        {/* Reference */}
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground">Reference</p>
          <code className="text-sm font-mono">{selectedActivity.batch_code}</code>
        </div>

        {/* User */}
        {selectedActivity.user_name && selectedActivity.user_name !== 'Unknown' && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">By</span>
            <span className="font-medium">{selectedActivity.user_name}</span>
          </div>
        )}

        {/* Action button */}
        <button
          onClick={() => {
            setSelectedActivity(null);
            const route = config.route || (selectedActivity.transaction_type === 'DISPATCH' ? '/dispatch' : '/transactions');
            navigate(route);
          }}
          className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          View All {config.label}s
        </button>
      </div>
    );
  };

  return (
    <>
      <Card className="backdrop-blur-sm bg-card/80 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Recent Activity
          </CardTitle>
          <CardDescription>All transactions • Click for details</CardDescription>
        </CardHeader>
        <CardContent>
          {activities && activities.length > 0 ? (
            <div className="relative">
              <div className="absolute left-[19px] top-3 bottom-3 w-0.5 bg-border" />

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {activities.map((activity) => {
                  const config = getConfig(activity.transaction_type);
                  const Icon = config.icon;
                  const isPositive = activity.quantity_change > 0;
                  const absQty = Math.abs(activity.quantity_change);
                  const specs = shortSpecs(activity.parameters);

                  const getDescription = () => {
                    const specPrefix = specs ? `${specs} • ` : '';
                    switch (activity.transaction_type) {
                      case 'DISPATCH':
                        const meters = activity.total_meters ? ` (${Math.round(activity.total_meters)}m)` : '';
                        return `${absQty} ${absQty === 1 ? 'roll' : 'rolls'} dispatched${meters}`;
                      case 'PRODUCTION':
                        return `${specPrefix}${absQty}m produced`;
                      case 'RETURN':
                        return `${absQty} ${absQty === 1 ? 'roll' : 'units'} returned`;
                      case 'CUT_ROLL':
                        return `${specPrefix}Cut ${absQty}m`;
                      case 'SCRAP':
                        return `${absQty} scrapped`;
                      default:
                        return `${config.label}: ${absQty}`;
                    }
                  };

                  return (
                    <div
                      key={activity.id}
                      onClick={() => handleClick(activity)}
                      className="relative flex gap-3 group cursor-pointer"
                    >
                      <div className={`
                        relative z-10 flex-shrink-0
                        w-10 h-10 rounded-full ${config.bg}
                        flex items-center justify-center
                        border-2 border-background
                        group-hover:scale-110 transition-transform
                      `}>
                        <Icon className={`h-4 w-4 ${config.color}`} />
                      </div>

                      <div className="flex-1 min-w-0 pb-3 p-2 -m-2 rounded-lg group-hover:bg-muted/50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm group-hover:text-primary transition-colors">
                              {getDescription()}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {activity.customer_name || activity.product_type}
                              {activity.user_name && activity.user_name !== 'Unknown' && (
                                <span> • {activity.user_name}</span>
                              )}
                            </p>
                          </div>

                          <div className="flex-shrink-0 text-right">
                            <div className={`
                              flex items-center justify-end gap-0.5 text-sm font-bold
                              ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
                            `}>
                              {isPositive ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3" />
                              )}
                              {absQty}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatRelativeTime(activity.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">No recent activity</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Details Modal */}
      <Dialog open={!!selectedActivity} onOpenChange={() => setSelectedActivity(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Activity Details</DialogTitle>
            <DialogDescription>
              {selectedActivity?.batch_code}
            </DialogDescription>
          </DialogHeader>
          {renderModalContent()}
        </DialogContent>
      </Dialog>
    </>
  );
};
