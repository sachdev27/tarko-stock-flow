import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, TrendingUp, AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { stats } from '@/lib/api-typed';
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

// Get time-based greeting
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

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
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await stats.getDashboard();
      setStatsData(response as any);
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
      description: 'Production batches',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-950/50',
      onClick: () => navigate('/production'),
    },
    {
      title: 'Active Stock',
      value: statsData.activeBatches,
      icon: TrendingUp,
      description: 'With inventory',
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-950/50',
      onClick: () => navigate('/inventory'),
    },
    {
      title: 'Low Stock',
      value: statsData.lowStockItems?.length || 0,
      icon: AlertTriangle,
      description: 'Need attention',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-100 dark:bg-orange-950/50',
    },
    {
      title: 'Transactions',
      value: statsData.transactionsStats?.total_transactions || 0,
      icon: Activity,
      description: 'Last 7 days',
      color: 'text-violet-600 dark:text-violet-400',
      bgColor: 'bg-violet-100 dark:bg-violet-950/50',
      onClick: () => navigate('/transactions'),
    },
  ];

  return (
    <Layout>
      <div className="min-h-screen">
        {/* Header */}
        <div className="sticky top-0 z-10 backdrop-blur-md bg-background/80 border-b border-border/50 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                {getGreeting()} 👋
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Tarko Inventory Overview
              </p>
            </div>
            <button
              onClick={() => {
                setLoading(true);
                fetchStats();
              }}
              disabled={loading}
              className={`
                p-2.5 rounded-xl
                bg-primary/10 hover:bg-primary/20
                text-primary
                transition-all duration-200
                disabled:opacity-50
                ${loading ? 'animate-spin' : ''}
              `}
              title="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-6 sm:px-6 max-w-7xl mx-auto space-y-6">
          {/* Stats Cards */}
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 sm:h-32 bg-muted/50 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {mainStatCards.map((card) => (
                <StatsCard key={card.title} {...card} />
              ))}
            </div>
          )}

          {/* Quick Actions and Inventory */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <QuickActions />
            <InventoryByType data={statsData.inventoryByType} />
          </div>

          {/* Low Stock and Recent Activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <LowStockAlerts items={statsData.lowStockItems} />
            <RecentActivity activities={statsData.recentActivity} />
          </div>

          {/* Transaction Stats */}
          <TransactionStats stats={statsData.transactionsStats} />
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
