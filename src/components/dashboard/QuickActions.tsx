import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Factory, ShoppingCart, Package, TrendingDown, Activity, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const QuickActions = () => {
  const navigate = useNavigate();

  const actions = [
    {
      label: 'Production',
      shortLabel: 'Produce',
      icon: Factory,
      path: '/production',
      gradient: 'from-emerald-500 to-emerald-600',
      shadow: 'shadow-emerald-500/25',
    },
    {
      label: 'Dispatch',
      shortLabel: 'Dispatch',
      icon: ShoppingCart,
      path: '/dispatch',
      gradient: 'from-blue-500 to-blue-600',
      shadow: 'shadow-blue-500/25',
    },
    {
      label: 'Returns',
      shortLabel: 'Returns',
      icon: TrendingDown,
      path: '/returns',
      gradient: 'from-amber-500 to-orange-500',
      shadow: 'shadow-orange-500/25',
    },
    {
      label: 'Inventory',
      shortLabel: 'Stock',
      icon: Package,
      path: '/inventory',
      gradient: 'from-violet-500 to-purple-600',
      shadow: 'shadow-purple-500/25',
    },
    {
      label: 'Transactions',
      shortLabel: 'Activity',
      icon: Activity,
      path: '/transactions',
      gradient: 'from-rose-500 to-pink-600',
      shadow: 'shadow-pink-500/25',
    },
  ];

  return (
    <Card className="backdrop-blur-sm bg-card/80 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          Quick Actions
        </CardTitle>
        <CardDescription>Jump to common tasks</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Mobile: 2-column icon grid */}
        <div className="grid grid-cols-2 gap-2 sm:hidden">
          {actions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className={`
                flex flex-col items-center justify-center gap-2
                p-4 rounded-xl
                bg-gradient-to-br ${action.gradient}
                text-white font-medium
                shadow-lg ${action.shadow}
                active:scale-95
                transition-all duration-200
              `}
            >
              <action.icon className="h-6 w-6" />
              <span className="text-xs">{action.shortLabel}</span>
            </button>
          ))}
        </div>

        {/* Desktop: Full-width buttons */}
        <div className="hidden sm:flex flex-col gap-2">
          {actions.map((action) => (
            <Button
              key={action.path}
              onClick={() => navigate(action.path)}
              className={`
                w-full h-12
                bg-gradient-to-r ${action.gradient}
                hover:opacity-90
                shadow-lg ${action.shadow}
                transition-all duration-200
                font-semibold text-sm
              `}
            >
              <action.icon className="h-5 w-5 mr-2" />
              {action.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
