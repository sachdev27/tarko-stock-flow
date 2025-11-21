import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcut {
  key: string;
  action: string;
  label: string;
}

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productTypes: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  stockTypes: Array<{ value: string; label: string }>;
  availableParameterValues: Record<string, string[]>;
  onProductTypeChange: (value: string) => void;
  onBrandChange: (value: string) => void;
  onStockTypeChange: (value: string) => void;
  onParameterFilterChange: (key: string, value: string) => void;
}

export const KeyboardShortcutsDialog = ({
  open,
  onOpenChange,
  productTypes,
  brands,
  stockTypes,
  availableParameterValues,
  onProductTypeChange,
  onBrandChange,
  onStockTypeChange,
  onParameterFilterChange
}: KeyboardShortcutsDialogProps) => {
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string>('');

  // Load shortcuts from localStorage
  useEffect(() => {
    const savedShortcuts = localStorage.getItem('inventory_keyboard_shortcuts');
    if (savedShortcuts) {
      setShortcuts(JSON.parse(savedShortcuts));
    } else {
      // Default shortcuts
      setShortcuts([
        { key: '1', action: 'product_type_0', label: productTypes[0]?.name || 'Product Type 1' },
        { key: '2', action: 'product_type_1', label: productTypes[1]?.name || 'Product Type 2' },
        { key: 'h', action: 'stock_type_FULL_ROLL', label: 'Full Rolls' },
        { key: 'c', action: 'stock_type_CUT_ROLL', label: 'Cut Rolls' },
        { key: 'b', action: 'stock_type_BUNDLE', label: 'Bundles' },
        { key: 's', action: 'stock_type_SPARE', label: 'Spares' },
        { key: 'a', action: 'stock_type_all', label: 'All Stock Types' },
      ]);
    }
  }, [productTypes]);

  const saveShortcuts = (newShortcuts: KeyboardShortcut[]) => {
    setShortcuts(newShortcuts);
    localStorage.setItem('inventory_keyboard_shortcuts', JSON.stringify(newShortcuts));
  };

  const handleKeyCapture = (e: React.KeyboardEvent, action: string, label: string) => {
    e.preventDefault();
    e.stopPropagation();

    const key = e.key.toLowerCase();

    // Prevent using special keys
    if (['enter', 'escape', 'tab', 'shift', 'control', 'alt', 'meta'].includes(key)) {
      toast.error('Cannot use special keys');
      return;
    }

    // Check if key is already in use
    const existingShortcut = shortcuts.find(s => s.key === key && s.action !== action);
    if (existingShortcut) {
      toast.error(`Key "${key}" is already assigned to ${existingShortcut.label}`);
      return;
    }

    // Update shortcut
    const newShortcuts = shortcuts.filter(s => s.action !== action);
    newShortcuts.push({ key, action, label });
    saveShortcuts(newShortcuts);

    setEditingKey(null);
    setPendingKey('');
    toast.success(`Shortcut "${key}" assigned to ${label}`);
  };

  const removeShortcut = (action: string) => {
    const newShortcuts = shortcuts.filter(s => s.action !== action);
    saveShortcuts(newShortcuts);
    toast.success('Shortcut removed');
  };

  const addShortcut = (type: 'product_type' | 'brand' | 'stock_type' | 'parameter', index?: number, value?: string, label?: string, paramKey?: string) => {
    let action: string;
    if (type === 'parameter' && paramKey && value) {
      action = `parameter_${paramKey}_${value}`;
    } else {
      action = index !== undefined ? `${type}_${index}` : `${type}_${value}`;
    }
    const shortcutLabel = label || `${type} ${index}`;

    setEditingKey(action);
    setPendingKey('');
  };  const getShortcutKey = (action: string): string | undefined => {
    return shortcuts.find(s => s.action === action)?.key;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Assign keyboard shortcuts to quickly filter inventory. Press any key when editing to assign it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Product Types */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Product Types</h3>
            <div className="space-y-2">
              {productTypes.map((pt, index) => {
                const action = `product_type_${index}`;
                const assignedKey = getShortcutKey(action);
                const isEditing = editingKey === action;

                return (
                  <div key={pt.id} className="flex items-center justify-between gap-3 p-2 border rounded-lg">
                    <span className="text-sm flex-1">{pt.name}</span>
                    {isEditing ? (
                      <Input
                        autoFocus
                        placeholder="Press any key..."
                        value={pendingKey}
                        className="w-32 h-8 text-center"
                        onKeyDown={(e) => handleKeyCapture(e, action, pt.name)}
                        onBlur={() => setEditingKey(null)}
                      />
                    ) : assignedKey ? (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="font-mono cursor-pointer hover:bg-secondary/80"
                          onClick={() => setEditingKey(action)}
                        >
                          {assignedKey}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => removeShortcut(action)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => addShortcut('product_type', index, pt.id, pt.name)}
                      >
                        Add Shortcut
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Brands */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Brands</h3>
            <div className="space-y-2">
              {brands.slice(0, 5).map((brand, index) => {
                const action = `brand_${index}`;
                const assignedKey = getShortcutKey(action);
                const isEditing = editingKey === action;

                return (
                  <div key={brand.id} className="flex items-center justify-between gap-3 p-2 border rounded-lg">
                    <span className="text-sm flex-1">{brand.name}</span>
                    {isEditing ? (
                      <Input
                        autoFocus
                        placeholder="Press any key..."
                        value={pendingKey}
                        className="w-32 h-8 text-center"
                        onKeyDown={(e) => handleKeyCapture(e, action, brand.name)}
                        onBlur={() => setEditingKey(null)}
                      />
                    ) : assignedKey ? (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="font-mono cursor-pointer hover:bg-secondary/80"
                          onClick={() => setEditingKey(action)}
                        >
                          {assignedKey}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => removeShortcut(action)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => addShortcut('brand', index, brand.id, brand.name)}
                      >
                        Add Shortcut
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stock Types */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Stock Types</h3>
            <div className="space-y-2">
              {stockTypes.map((st) => {
                const action = `stock_type_${st.value}`;
                const assignedKey = getShortcutKey(action);
                const isEditing = editingKey === action;

                return (
                  <div key={st.value} className="flex items-center justify-between gap-3 p-2 border rounded-lg">
                    <span className="text-sm flex-1">{st.label}</span>
                    {isEditing ? (
                      <Input
                        autoFocus
                        placeholder="Press any key..."
                        value={pendingKey}
                        className="w-32 h-8 text-center"
                        onKeyDown={(e) => handleKeyCapture(e, action, st.label)}
                        onBlur={() => setEditingKey(null)}
                      />
                    ) : assignedKey ? (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="font-mono cursor-pointer hover:bg-secondary/80"
                          onClick={() => setEditingKey(action)}
                        >
                          {assignedKey}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => removeShortcut(action)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => addShortcut('stock_type', undefined, st.value, st.label)}
                      >
                        Add Shortcut
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Parameter Filters */}
          {Object.entries(availableParameterValues).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Parameter Filters</h3>
              <p className="text-xs text-muted-foreground">Assign shortcuts to quickly filter by specific parameter values (e.g., OD=32, PN=10)</p>
              {Object.entries(availableParameterValues).map(([paramKey, values]) => (
                <div key={paramKey} className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground">{paramKey}</h4>
                  <div className="space-y-1 pl-3">
                    {values.slice(0, 8).map((value) => {
                      const action = `parameter_${paramKey}_${value}`;
                      const assignedKey = getShortcutKey(action);
                      const isEditing = editingKey === action;
                      const label = `${paramKey}=${value}`;

                      return (
                        <div key={value} className="flex items-center justify-between gap-3 p-1.5 border rounded text-xs">
                          <span className="flex-1">{label}</span>
                          {isEditing ? (
                            <Input
                              autoFocus
                              placeholder="Press any key..."
                              value={pendingKey}
                              className="w-24 h-7 text-center text-xs"
                              onKeyDown={(e) => handleKeyCapture(e, action, label)}
                              onBlur={() => setEditingKey(null)}
                            />
                          ) : assignedKey ? (
                            <div className="flex items-center gap-1">
                              <Badge
                                variant="secondary"
                                className="font-mono cursor-pointer hover:bg-secondary/80 text-xs h-5"
                                onClick={() => setEditingKey(action)}
                              >
                                {assignedKey}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => removeShortcut(action)}
                              >
                                <X className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => addShortcut('parameter', undefined, value, label, paramKey)}
                            >
                              Add
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    {values.length > 8 && (
                      <p className="text-xs text-muted-foreground italic">+ {values.length - 8} more values available</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              localStorage.removeItem('inventory_keyboard_shortcuts');
              setShortcuts([]);
              toast.success('All shortcuts cleared');
            }}
          >
            Clear All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
