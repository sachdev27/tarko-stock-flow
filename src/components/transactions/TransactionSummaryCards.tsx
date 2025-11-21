import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TransactionRecord } from '@/types/transaction';
import { formatWeight } from '@/utils/transactions/formatters';
import { getTotalProductionWeight } from '@/utils/transactions/calculations';
import { Package, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface TransactionSummaryCardsProps {
  transactions: TransactionRecord[];
}

export function TransactionSummaryCards({ transactions }: TransactionSummaryCardsProps) {
  const productionTransactions = transactions.filter(
    (t) => t.transaction_type === 'PRODUCTION'
  );
  const saleTransactions = transactions.filter((t) => t.transaction_type === 'SALE');
  const adjustmentTransactions = transactions.filter((t) => t.transaction_type === 'ADJUSTMENT');

  const totalProductionWeight = getTotalProductionWeight(productionTransactions);
  const totalSaleWeight = saleTransactions.reduce((sum, t) => sum + (t.total_weight || 0), 0);
  const totalAdjustmentWeight = adjustmentTransactions.reduce(
    (sum, t) => sum + (t.total_weight || 0),
    0
  );

  const cards = [
    {
      title: 'Total Production',
      value: formatWeight(totalProductionWeight),
      count: productionTransactions.length,
      icon: Package,
      iconColor: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Total Sales',
      value: formatWeight(totalSaleWeight),
      count: saleTransactions.length,
      icon: TrendingDown,
      iconColor: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-950',
    },
    {
      title: 'Total Adjustments',
      value: formatWeight(totalAdjustmentWeight),
      count: adjustmentTransactions.length,
      icon: TrendingUp,
      iconColor: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
    },
    {
      title: 'All Transactions',
      value: transactions.length.toString(),
      count: transactions.length,
      icon: Activity,
      iconColor: 'text-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-950',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card key={idx}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <Icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              {idx < 3 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {card.count} transaction{card.count !== 1 ? 's' : ''}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
