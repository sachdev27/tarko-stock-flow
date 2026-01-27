import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Factory, ShoppingCart, TrendingDown, Trash2, BarChart2 } from 'lucide-react';

interface TransactionStatsData {
  total_transactions?: number;
  production_count?: number;
  sales_count?: number;
  return_count?: number;
  scrap_count?: number;
}

interface TransactionStatsProps {
  stats: TransactionStatsData;
}

export const TransactionStats = ({ stats }: TransactionStatsProps) => {
  const statItems = [
    {
      label: 'Total',
      value: stats?.total_transactions || 0,
      icon: Activity,
      gradient: 'from-indigo-500 to-purple-600',
      bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    },
    {
      label: 'Production',
      value: stats?.production_count || 0,
      icon: Factory,
      gradient: 'from-emerald-500 to-green-600',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    },
    {
      label: 'Dispatch',
      value: stats?.sales_count || 0,
      icon: ShoppingCart,
      gradient: 'from-blue-500 to-cyan-600',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
    },
    {
      label: 'Returns',
      value: stats?.return_count || 0,
      icon: TrendingDown,
      gradient: 'from-amber-500 to-orange-600',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
    },
    {
      label: 'Scrapped',
      value: stats?.scrap_count || 0,
      icon: Trash2,
      gradient: 'from-rose-500 to-red-600',
      bg: 'bg-rose-50 dark:bg-rose-950/40',
    },
  ];

  // Calculate max for mini bar chart
  const maxValue = Math.max(...statItems.map(s => s.value), 1);

  return (
    <Card className="backdrop-blur-sm bg-card/80 border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-primary" />
          7-Day Activity
        </CardTitle>
        <CardDescription>Transaction breakdown by type</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Horizontal scroll on mobile */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2 snap-x snap-mandatory scrollbar-hide">
          {statItems.map((item) => {
            const barHeight = (item.value / maxValue) * 100;

            return (
              <div
                key={item.label}
                className={`
                  flex-shrink-0 snap-center
                  w-28 sm:w-auto sm:flex-1
                  p-4 rounded-xl ${item.bg}
                  border border-border/30
                `}
              >
                {/* Icon with gradient */}
                <div className={`
                  w-10 h-10 rounded-lg mb-3
                  bg-gradient-to-br ${item.gradient}
                  flex items-center justify-center
                  shadow-lg
                `}>
                  <item.icon className="h-5 w-5 text-white" />
                </div>

                {/* Value */}
                <p className="text-2xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>

                {/* Mini bar chart */}
                <div className="mt-3 h-1.5 bg-border/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${item.gradient} transition-all duration-700`}
                    style={{ width: `${barHeight}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
