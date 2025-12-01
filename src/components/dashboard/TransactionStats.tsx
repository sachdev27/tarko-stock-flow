import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Factory, ShoppingCart, TrendingDown, Trash2 } from 'lucide-react';

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
      label: 'Total Transactions',
      value: stats?.total_transactions || 0,
      icon: Activity,
      gradient: 'from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30',
      border: 'border-purple-200 dark:border-purple-900',
      textColor: 'text-purple-700 dark:text-purple-400',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'Production',
      value: stats?.production_count || 0,
      icon: Factory,
      gradient: 'from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30',
      border: 'border-green-200 dark:border-green-900',
      textColor: 'text-green-700 dark:text-green-400',
      iconColor: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Dispatches',
      value: stats?.sales_count || 0,
      icon: ShoppingCart,
      gradient: 'from-red-50 to-red-100 dark:from-red-950/30 dark:to-red-900/30',
      border: 'border-red-200 dark:border-red-900',
      textColor: 'text-red-700 dark:text-red-400',
      iconColor: 'text-red-600 dark:text-red-400',
    },
    {
      label: 'Returns',
      value: stats?.return_count || 0,
      icon: TrendingDown,
      gradient: 'from-orange-50 to-orange-100 dark:from-orange-950/30 dark:to-orange-900/30',
      border: 'border-orange-200 dark:border-orange-900',
      textColor: 'text-orange-700 dark:text-orange-400',
      iconColor: 'text-orange-600 dark:text-orange-400',
    },
    {
      label: 'Scrapped',
      value: stats?.scrap_count || 0,
      icon: Trash2,
      gradient: 'from-rose-50 to-rose-100 dark:from-rose-950/30 dark:to-rose-900/30',
      border: 'border-rose-200 dark:border-rose-900',
      textColor: 'text-rose-700 dark:text-rose-400',
      iconColor: 'text-rose-600 dark:text-rose-400',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 7 Days Activity</CardTitle>
        <CardDescription>Transaction breakdown by type</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {statItems.map((item) => (
            <div
              key={item.label}
              className={`p-4 bg-gradient-to-br ${item.gradient} rounded-lg border ${item.border}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                  <p className={`text-3xl font-bold ${item.textColor} mt-1`}>
                    {item.value}
                  </p>
                </div>
                <item.icon className={`h-10 w-10 ${item.iconColor} flex-shrink-0`} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
