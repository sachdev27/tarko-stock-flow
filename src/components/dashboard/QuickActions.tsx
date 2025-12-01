import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Factory, ShoppingCart, Package, TrendingDown, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const QuickActions = () => {
  const navigate = useNavigate();

  const actions = [
    {
      label: 'Daily Production Entry',
      icon: Factory,
      path: '/production',
      gradient: 'from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600',
    },
    {
      label: 'New Dispatch',
      icon: ShoppingCart,
      path: '/dispatch',
      gradient: 'from-green-600 to-green-500 hover:from-green-700 hover:to-green-600',
    },
    {
      label: 'Process Return',
      icon: TrendingDown,
      path: '/returns',
      gradient: 'from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600',
    },
    {
      label: 'View Inventory',
      icon: Package,
      path: '/inventory',
      gradient: 'from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600',
    },
    {
      label: 'View Activity',
      icon: Activity,
      path: '/transactions',
      gradient: 'from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Common tasks for daily operations</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action) => (
          <Button
            key={action.path}
            onClick={() => navigate(action.path)}
            className={`w-full h-14 bg-gradient-to-r ${action.gradient} transition-all font-semibold text-base shadow-md`}
          >
            <action.icon className="h-5 w-5 mr-2" />
            {action.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
};
