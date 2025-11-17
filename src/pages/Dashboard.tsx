import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { stats } from '@/lib/api';
import { toast } from 'sonner';

const Dashboard = () => {
  const navigate = useNavigate();
  const [statsData, setStatsData] = useState({
    totalBatches: 0,
    activeBatches: 0,
    qcPending: 0,
    qcPassed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
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

  const statCards = [
    {
      title: 'Total Batches',
      value: statsData.totalBatches,
      icon: Package,
      description: 'All production batches',
      color: 'text-primary',
    },
    {
      title: 'Active Stock',
      value: statsData.activeBatches,
      icon: TrendingUp,
      description: 'Batches with inventory',
      color: 'text-success',
    },
    {
      title: 'QC Pending',
      value: statsData.qcPending,
      icon: AlertTriangle,
      description: 'Awaiting quality check',
      color: 'text-warning',
    },
    {
      title: 'QC Passed',
      value: statsData.qcPassed,
      icon: CheckCircle,
      description: 'Quality approved',
      color: 'text-success',
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Tarko Inventory Management Overview</p>
        </div>

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
            {statCards.map((card) => (
              <Card key={card.title} className="hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks for daily operations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <button
                onClick={() => navigate('/production')}
                className="h-24 bg-primary text-primary-foreground rounded-lg hover:bg-primary-dark transition-colors font-semibold text-lg"
              >
                Daily Production Entry
              </button>
              <button
                onClick={() => navigate('/transactions')}
                className="h-24 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors font-semibold text-lg"
              >
                New Transaction
              </button>
              <button
                onClick={() => navigate('/inventory')}
                className="h-24 bg-accent text-accent-foreground rounded-lg hover:bg-accent/80 transition-colors font-semibold text-lg"
              >
                View Inventory
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;
