import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Package, TrendingUp, AlertTriangle, Activity, ShoppingCart,
  Factory, BarChart3, Clock, ArrowUpRight, ArrowDownRight, CheckCircle
} from 'lucide-react';
import { Layout } from '@/components/Layout';
import { stats } from '@/lib/api';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

const Dashboard = () => {
  const navigate = useNavigate();
  const [statsData, setStatsData] = useState<any>({
    totalBatches: 0,
    activeBatches: 0,
    inventoryByType: [],
    transactionsStats: {},
    lowStockItems: [],
    recentActivity: [],
    productDistribution: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await stats.getDashboard();
      setStatsData(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast.error('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  const mainStatCards = [
    {
      title: 'Total Batches',
      value: statsData.totalBatches,
      icon: Package,
      description: 'All production batches',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      title: 'Active Stock',
      value: statsData.activeBatches,
      icon: TrendingUp,
      description: 'Batches with inventory',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
    },
    {
      title: 'Low Stock Alerts',
      value: statsData.lowStockItems?.length || 0,
      icon: AlertTriangle,
      description: 'Items need attention',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    },
    {
      title: 'Recent Activity',
      value: statsData.transactionsStats?.total_transactions || 0,
      icon: Activity,
      description: 'Last 7 days',
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    },
  ];

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'SALE':
        return <ShoppingCart className="h-4 w-4 text-red-600" />;
      case 'PRODUCTION':
        return <Factory className="h-4 w-4 text-green-600" />;
      case 'DISPATCH':
        return <ShoppingCart className="h-4 w-4 text-red-600" />;
      case 'REVERTED':
        return <Activity className="h-4 w-4 text-gray-500" />;
      case 'RETURN':
        return <Activity className="h-4 w-4 text-emerald-600" />;
      case 'CUT':
        return <Activity className="h-4 w-4 text-blue-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTransactionBadge = (type: string) => {
    const variants: any = {
      'SALE': 'destructive',
      'PRODUCTION': 'default',
      'DISPATCH': 'destructive',
      'REVERTED': 'outline',
      'RETURN': 'default',
      'CUT': 'secondary',
      'BUNDLED': 'outline'
    };
    return variants[type] || 'outline';
  };

  return (
    <Layout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Tarko Inventory Management Overview</p>
          </div>
          <button
            onClick={fetchStats}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Refresh
          </button>
        </div>

        {/* Main Stats */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="h-4 bg-muted animate-pulse rounded"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-muted animate-pulse rounded mb-2"></div>
                  <div className="h-3 bg-muted animate-pulse rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {mainStatCards.map((card) => (
              <Card key={card.title} className="hover:shadow-lg transition-all hover:scale-105">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${card.bgColor}`}>
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    {card.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks for daily operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <button
                onClick={() => navigate('/production')}
                className="w-full h-16 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg hover:from-blue-700 hover:to-blue-600 transition-all font-semibold text-lg flex items-center justify-center gap-2 shadow-md"
              >
                <Factory className="h-5 w-5" />
                Daily Production Entry
              </button>
              <button
                onClick={() => navigate('/dispatch')}
                className="w-full h-16 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg hover:from-green-700 hover:to-green-600 transition-all font-semibold text-lg flex items-center justify-center gap-2 shadow-md"
              >
                <ShoppingCart className="h-5 w-5" />
                New Sale / Dispatch
              </button>
              <button
                onClick={() => navigate('/inventory')}
                className="w-full h-16 bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-lg hover:from-purple-700 hover:to-purple-600 transition-all font-semibold text-lg flex items-center justify-center gap-2 shadow-md"
              >
                <Package className="h-5 w-5" />
                View Inventory
              </button>
            </CardContent>
          </Card>

          {/* Inventory by Product Type */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Inventory by Product Type
              </CardTitle>
              <CardDescription>Current stock levels</CardDescription>
            </CardHeader>
            <CardContent>
              {statsData.inventoryByType?.length > 0 ? (
                <div className="space-y-3">
                  {statsData.inventoryByType.map((item: any) => (
                    <div key={item.product_type} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <div className="font-semibold">{item.product_type}</div>
                        <div className="text-xs text-muted-foreground">{item.batch_count} batches</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-primary">
                          {parseFloat(item.total_quantity).toFixed(0)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.product_type.includes('Sprinkler') ? 'pieces' : 'meters'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No inventory data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Low Stock Alerts */}
          <Card className="border-orange-200 dark:border-orange-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                <AlertTriangle className="h-5 w-5" />
                Low Stock Alerts
              </CardTitle>
              <CardDescription>Items that need attention</CardDescription>
            </CardHeader>
            <CardContent>
              {statsData.lowStockItems?.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {statsData.lowStockItems.map((item: any) => (
                    <div key={item.batch_code} className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-900">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{item.batch_code}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.product_type} • {item.brand}
                          </div>
                        </div>
                        <Badge variant="destructive" className="ml-2">
                          {parseFloat(item.current_quantity).toFixed(0)} {item.product_type.includes('Sprinkler') ? 'pcs' : 'm'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-2" />
                  <p>All stock levels are healthy!</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>Latest transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {statsData.recentActivity?.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {statsData.recentActivity.map((activity: any) => (
                    <div key={activity.id} className="p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2 flex-1">
                          {getTransactionIcon(activity.transaction_type)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={getTransactionBadge(activity.transaction_type)} className="text-xs">
                                {activity.transaction_type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{activity.batch_code}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {activity.product_type} • {activity.user_name}
                            </div>
                          </div>
                        </div>
                        <div className="text-right ml-2">
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
                          <div className="text-xs text-muted-foreground">
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
        </div>

        {/* Transaction Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Last 7 Days Activity</CardTitle>
            <CardDescription>Transaction breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 rounded-lg border border-purple-200 dark:border-purple-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Transactions</p>
                    <p className="text-3xl font-bold text-purple-700 dark:text-purple-400">
                      {statsData.transactionsStats?.total_transactions || 0}
                    </p>
                  </div>
                  <Activity className="h-10 w-10 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30 rounded-lg border border-green-200 dark:border-green-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Production</p>
                    <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                      {statsData.transactionsStats?.production_count || 0}
                    </p>
                  </div>
                  <Factory className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/30 rounded-lg border border-red-200 dark:border-red-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Sales</p>
                    <p className="text-3xl font-bold text-red-700 dark:text-red-400">
                      {statsData.transactionsStats?.sales_count || 0}
                    </p>
                  </div>
                  <ShoppingCart className="h-10 w-10 text-red-600 dark:text-red-400" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;
