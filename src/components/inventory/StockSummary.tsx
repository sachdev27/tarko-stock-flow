import { Card, CardContent } from '@/components/ui/card';
import { Box, Scissors, Layers, Package } from 'lucide-react';

interface StockSummaryProps {
  stats: {
    hdpeProducts: number;
    sprinklerProducts: number;
    totalFullRolls: number;
    totalCutRolls: number;
    totalBundles: number;
    totalSpares: number;
  };
}

export const StockSummary = ({ stats }: StockSummaryProps) => {
  const statCards = [
    {
      label: 'HDPE Products',
      value: stats.hdpeProducts,
      icon: Package,
      color: 'text-blue-600'
    },
    {
      label: 'Sprinkler Products',
      value: stats.sprinklerProducts,
      icon: Package,
      color: 'text-indigo-600'
    },
    {
      label: 'Full Rolls',
      value: stats.totalFullRolls,
      icon: Box,
      color: 'text-green-600'
    },
    {
      label: 'Cut Rolls',
      value: stats.totalCutRolls,
      icon: Scissors,
      color: 'text-orange-600'
    },
    {
      label: 'Bundles',
      value: stats.totalBundles,
      icon: Layers,
      color: 'text-purple-600'
    },
    {
      label: 'Spares',
      value: stats.totalSpares,
      icon: Package,
      color: 'text-amber-600'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
              </div>
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
