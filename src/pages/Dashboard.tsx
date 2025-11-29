import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { stats } from '@/lib/api';
import { toast } from 'sonner';
import {
  StatsCard,
  QuickActions,
  InventoryByType,
  LowStockAlerts,
  RecentActivity,
  TransactionStats
} from '@/components/dashboard';

interface DashboardStats {
  totalBatches: number;
  activeBatches: number;
  inventoryByType: Array<{
    product_type: string;
    total_quantity: number;
    batch_count: number;
  }>;
  transactionsStats: {
    total_transactions?: number;
    production_count?: number;
    sales_count?: number;
    return_count?: number;
    scrap_count?: number;
    inventory_ops_count?: number;
  };
  lowStockItems: Array<{
    batch_code: string;
    current_quantity: number;
    product_type: string;
    brand: string;
    parameters?: Record<string, string | number | boolean>;
  }>;
  recentActivity: Array<{
    id: string;
    transaction_type: string;
    quantity_change: number;
    created_at: string;
    user_name: string;
    batch_code: string;
    product_type: string;
  }>;
  productDistribution: Array<{
    product_type: string;
    batch_count: number;
    total_quantity: number;
  }>;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [statsData, setStatsData] = useState<DashboardStats>({
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
      onClick: () => navigate('/production'),
    },
    {
      title: 'Active Stock',
      value: statsData.activeBatches,
      icon: TrendingUp,
      description: 'Batches with inventory',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950/30',
      onClick: () => navigate('/inventory'),
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
      onClick: () => navigate('/activity'),
    },
  ];

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
            disabled={loading}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Main Stats */}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted animate-pulse rounded-lg"></div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {mainStatCards.map((card) => (
              <StatsCard key={card.title} {...card} />
            ))}
          </div>
        )}

        {/* Quick Actions and Inventory */}
        <div className="grid gap-6 lg:grid-cols-2">
          <QuickActions />
          <InventoryByType data={statsData.inventoryByType} />
        </div>

        {/* Low Stock Alerts and Recent Activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          <LowStockAlerts items={statsData.lowStockItems} />
          <RecentActivity activities={statsData.recentActivity} />
        </div>

        {/* Transaction Stats */}
        <TransactionStats stats={statsData.transactionsStats} />
      </div>
    </Layout>
  );
};

export default Dashboard;
