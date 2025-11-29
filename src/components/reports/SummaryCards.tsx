import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingCart, Users, Package, Target } from 'lucide-react';

interface SummaryData {
  total_orders?: number | string;
  total_customers?: number | string;
  products_sold_count?: number | string;
  total_quantity_sold?: number | string;
  total_quantity_produced?: number | string;
}

interface SummaryCardsProps {
  data: SummaryData;
}

export const SummaryCards = ({ data }: SummaryCardsProps) => {
  const formatNumber = (num: number | string | undefined) => {
    if (num === undefined || num === null) return '0';
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (typeof value !== 'number' || isNaN(value)) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(2) + 'K';
    return value.toFixed(0);
  };

  const cards = [
    {
      title: 'Total Orders',
      value: data.total_orders || 0,
      icon: ShoppingCart,
      description: 'Completed transactions',
      color: 'text-blue-600',
    },
    {
      title: 'Active Customers',
      value: data.total_customers || 0,
      icon: Users,
      description: 'Unique buyers',
      color: 'text-green-600',
    },
    {
      title: 'Products Sold',
      value: data.products_sold_count || 0,
      icon: Package,
      description: 'Different product types',
      color: 'text-purple-600',
    },
    {
      title: 'Total Quantity',
      value: data.total_quantity_sold || 0,
      icon: Target,
      description: 'Meters sold',
      color: 'text-orange-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatNumber(card.value)}</div>
            <p className="text-xs text-muted-foreground mt-2">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
