import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TransactionRecord } from '@/types/transaction';
import { formatWeight } from '@/utils/transactions/formatters';
import { getTotalProductionWeight } from '@/utils/transactions/calculations';
import { Package, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface TransactionSummaryCardsProps {
  transactions: TransactionRecord[];
  onProductionClick?: () => void;
}

export function TransactionSummaryCards({ transactions, onProductionClick }: TransactionSummaryCardsProps) {
  const productionTransactions = transactions.filter(
    (t) => t.transaction_type === 'PRODUCTION'
  );

  const totalProductionWeight = getTotalProductionWeight(productionTransactions);
  const tons = Math.floor(totalProductionWeight / 1000);
  const kg = Math.round(totalProductionWeight % 1000);

  const weightDisplay = tons > 0
    ? `${tons}t ${kg}kg`
    : `${kg}kg`;

  const cards = [
    {
      title: 'Total Production',
      value: weightDisplay,
      subtitle: `${formatWeight(totalProductionWeight)} • ${productionTransactions.length} activities`,
      count: productionTransactions.length,
      icon: Package,
      iconColor: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
    },
  ];

  return (
    <div className="w-full">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card 
            key={idx} 
            className={onProductionClick ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors" : ""}
            onClick={onProductionClick}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <Icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{card.value}</div>
              <p className="text-sm text-muted-foreground mt-2">
                {card.subtitle}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
