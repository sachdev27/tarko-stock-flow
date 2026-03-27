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
  onCardClick?: (filterType: 'hdpe' | 'sprinkler' | 'full_roll' | 'cut_roll' | 'bundle' | 'spare') => void;
}

export const StockSummary = ({ stats, onCardClick }: StockSummaryProps) => {
  const statCards = [
    {
      label: 'HDPE Products',
      value: stats.hdpeProducts,
      icon: Package,
      color: 'text-blue-600',
      filterType: 'hdpe' as const
    },
    {
      label: 'Sprinkler Products',
      value: stats.sprinklerProducts,
      icon: Package,
      color: 'text-indigo-600',
      filterType: 'sprinkler' as const
    },
    {
      label: 'Full Rolls',
      value: stats.totalFullRolls,
      icon: Box,
      color: 'text-green-600',
      filterType: 'full_roll' as const
    },
    {
      label: 'Cut Rolls',
      value: stats.totalCutRolls,
      icon: Scissors,
      color: 'text-orange-600',
      filterType: 'cut_roll' as const
    },
    {
      label: 'Bundles',
      value: stats.totalBundles,
      icon: Layers,
      color: 'text-purple-600',
      filterType: 'bundle' as const
    },
    {
      label: 'Spares',
      value: stats.totalSpares,
      icon: Package,
      color: 'text-amber-600',
      filterType: 'spare' as const
    }
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
      {statCards.map((stat) => (
        <Card
          key={stat.label}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onCardClick?.(stat.filterType)}
        >
          <CardContent className="p-2 sm:pt-6">
            <div className="flex items-center justify-between gap-1">
                <div className="flex flex-col">
                  <span className="text-xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                    {stat.value}
                  </span>
                  <span className="text-[11px] sm:text-xs text-muted-foreground font-medium uppercase tracking-tight">
                    {stat.label}
                  </span>
                </div>
              <stat.icon className={`h-4 w-4 sm:h-8 sm:w-8 ${stat.color} shrink-0`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
