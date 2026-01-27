import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, CheckCircle, Settings2, Ruler, CircleDot, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface LowStockItem {
  batch_code: string;
  stock_type?: string;
  stock_quantity?: number;
  roll_length?: number;
  current_quantity?: number;
  batch_total_rolls?: number;
  product_type: string;
  brand: string;
  parameters?: Record<string, string | number | boolean>;
}

interface LowStockAlertsProps {
  items: LowStockItem[];
}

// Format product specs from parameters
const formatProductSpecs = (params: Record<string, string | number | boolean> | undefined) => {
  if (!params) return null;

  const od = params.OD || params.od;
  const pe = params.PE || params.pe;
  const pn = params.PN || params.pn;
  if (od && pe && pn) {
    return `OD ${od} • PE ${pe} • PN ${pn}`;
  }

  const entries = Object.entries(params).slice(0, 2);
  return entries.map(([k, v]) => `${k}: ${v}`).join(' • ');
};

// Severity based on quantity relative to threshold
const getSeverity = (qty: number, threshold: number): 'critical' | 'warning' | 'low' => {
  const ratio = qty / threshold;
  if (ratio <= 0.3) return 'critical';
  if (ratio <= 0.6) return 'warning';
  return 'low';
};

export const LowStockAlerts = ({ items }: LowStockAlertsProps) => {
  const [threshold, setThreshold] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [includeCutRolls, setIncludeCutRolls] = useState(false);

  // Filter items by threshold and roll type
  const filteredItems = (items || []).filter(item => {
    const qty = item.stock_quantity ?? item.current_quantity ?? 0;
    const isFullRoll = item.stock_type === 'FULL_ROLL';
    const isCutRoll = item.stock_type === 'CUT_ROLL';

    // Filter by roll type
    if (!includeCutRolls && !isFullRoll) return false;
    if (includeCutRolls && !isFullRoll && !isCutRoll) return false;

    // Filter by threshold
    return qty <= threshold;
  });

  const sortedItems = [...filteredItems].sort((a, b) =>
    (a.stock_quantity ?? a.current_quantity ?? 0) - (b.stock_quantity ?? b.current_quantity ?? 0)
  );

  const fullRollCount = sortedItems.filter(i => i.stock_type === 'FULL_ROLL').length;
  const cutRollCount = sortedItems.filter(i => i.stock_type === 'CUT_ROLL').length;

  return (
    <Card className="backdrop-blur-sm bg-card/80 border-border/50 border-l-4 border-l-orange-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <div className="relative">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              {sortedItems.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
              )}
            </div>
            Low Stock
            {sortedItems.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {sortedItems.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="h-8 w-8 p-0"
          >
            <Settings2 className={`h-4 w-4 transition-transform ${showSettings ? 'rotate-90' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          {includeCutRolls ? 'Full & Cut rolls' : 'Full rolls only'} with ≤ {threshold} in stock
        </CardDescription>

        {/* Settings panel */}
        {showSettings && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-4">
            {/* Threshold slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">Alert Threshold</span>
                <span className="text-xs font-bold">{threshold} rolls</span>
              </div>
              <Slider
                value={[threshold]}
                onValueChange={(v) => setThreshold(v[0])}
                min={1}
                max={20}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">1</span>
                <span className="text-xs text-muted-foreground">20</span>
              </div>
            </div>

            {/* Cut rolls toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="include-cut" className="text-xs font-medium">
                Include Cut Rolls
              </Label>
              <Switch
                id="include-cut"
                checked={includeCutRolls}
                onCheckedChange={setIncludeCutRolls}
              />
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {sortedItems.length > 0 ? (
          <>
            {/* Summary badges */}
            {includeCutRolls && (
              <div className="flex gap-2 mb-3">
                <Badge variant="outline" className="text-xs gap-1">
                  <CircleDot className="h-3 w-3" /> {fullRollCount} Full
                </Badge>
                <Badge variant="secondary" className="text-xs gap-1">
                  <Scissors className="h-3 w-3" /> {cutRollCount} Cut
                </Badge>
              </div>
            )}

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {sortedItems.map((item, index) => {
                const qty = item.stock_quantity ?? item.current_quantity ?? 0;
                const severity = getSeverity(qty, threshold);
                const specs = formatProductSpecs(item.parameters);
                const rollLength = item.roll_length;
                const isFullRoll = item.stock_type === 'FULL_ROLL';
                const isCutRoll = item.stock_type === 'CUT_ROLL';

                return (
                  <div
                    key={`${item.batch_code}-${item.stock_type}-${index}`}
                    className={`
                      relative p-3 rounded-lg border transition-all
                      ${severity === 'critical'
                        ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900'
                        : severity === 'warning'
                          ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900'
                          : 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900'
                      }
                      hover:shadow-md
                    `}
                  >
                    {severity === 'critical' && (
                      <div className="absolute top-2 right-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                        </span>
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Roll type pill - prominent at top */}
                        <div className="mb-1.5">
                          {isFullRoll ? (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-xs gap-1">
                              <CircleDot className="h-3 w-3" /> Full Roll
                            </Badge>
                          ) : isCutRoll ? (
                            <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300 text-xs gap-1">
                              <Scissors className="h-3 w-3" /> Cut Roll
                            </Badge>
                          ) : null}
                        </div>

                        {/* Product specs */}
                        {specs ? (
                          <div className="font-semibold text-sm">{specs}</div>
                        ) : (
                          <div className="font-semibold text-sm truncate">{item.brand}</div>
                        )}

                        {/* Brand and roll length */}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs h-5 font-medium">
                            {item.brand}
                          </Badge>
                          {rollLength ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Ruler className="h-3 w-3" />
                              {isCutRoll ? `${rollLength}m` : `${rollLength}m/roll`}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground/50">
                              <Ruler className="h-3 w-3" />
                              N/A
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div className={`
                          text-2xl font-bold tabular-nums
                          ${severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                            severity === 'warning' ? 'text-orange-600 dark:text-orange-400' :
                              'text-yellow-600 dark:text-yellow-400'}
                        `}>
                          {qty}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          in stock
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-950 mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <p className="font-medium text-green-700 dark:text-green-400">All stock healthy</p>
            <p className="text-sm text-muted-foreground mt-1">No rolls below {threshold}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
