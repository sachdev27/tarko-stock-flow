import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Preference {
  customer_name: string;
  preferred_product: string;
  preferred_brand: string;
  total_quantity: string | number;
  order_frequency: number;
}

interface CustomerPreferencesProps {
  preferences: Preference[];
}

export const CustomerPreferences = ({ preferences }: CustomerPreferencesProps) => {
  const formatNumber = (num: number | string) => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(value)) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(2) + 'K';
    return value.toFixed(0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer Product Preferences</CardTitle>
        <CardDescription>What customers are buying the most</CardDescription>
      </CardHeader>
      <CardContent>
        {preferences.length > 0 ? (
          <div className="space-y-3">
            {preferences.slice(0, 8).map((pref, index) => (
              <div key={index} className="flex items-start justify-between text-sm">
                <div className="space-y-1 flex-1">
                  <div className="font-medium">{pref.customer_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {pref.preferred_product} • {pref.preferred_brand}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatNumber(pref.total_quantity)}</div>
                  <div className="text-xs text-muted-foreground">{pref.order_frequency}× ordered</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No preference data available
          </div>
        )}
      </CardContent>
    </Card>
  );
};
