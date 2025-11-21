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
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
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
    const defaultShortcuts = [
      { key: '1', action: 'product_type_0', label: productTypes[0]?.name || 'Product Type 1' },
      { key: '2', action: 'product_type_1', label: productTypes[1]?.name || 'Product Type 2' },
      { key: 'h', action: 'stock_type_FULL_ROLL', label: 'Full Rolls' },
      { key: 'c', action: 'stock_type_CUT_ROLL', label: 'Cut Rolls' },
      { key: 'd', action: 'stock_type_BUNDLE', label: 'Bundles' },
      { key: 's', action: 'stock_type_SPARE', label: 'Spares' },
      { key: 'a', action: 'stock_type_all', label: 'All Stock Types' },
      { key: '/', action: 'clear_filters', label: 'Clear All Filters' },
      { key: 'b', action: 'focus_brand', label: 'Focus Brand Filter' },
      { key: 'o', action: 'focus_parameter_OD', label: 'Focus OD Filter' },
      { key: 'n', action: 'focus_parameter_PN', label: 'Focus PN Filter' },
      { key: 'e', action: 'focus_parameter_PE', label: 'Focus PE Filter' },
      { key: 't', action: 'focus_parameter_Type', label: 'Focus Type Filter' },
    ];

    const savedShortcuts = localStorage.getItem('inventory_keyboard_shortcuts');
    if (savedShortcuts) {
      const saved = JSON.parse(savedShortcuts);
      // Merge defaults with saved shortcuts (defaults take priority if action doesn't exist in saved)
      const savedActions = saved.map((s: KeyboardShortcut) => s.action);
      const merged = [...saved];
      defaultShortcuts.forEach(defaultShortcut => {
        if (!savedActions.includes(defaultShortcut.action)) {
          merged.push(defaultShortcut);
        }
      });
      setShortcuts(merged);
    } else {
      setShortcuts(defaultShortcuts);
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

    // Prevent using certain special keys alone (including modifier keys)
    if (['enter', 'escape', 'tab', 'meta', 'control', 'shift', 'alt'].includes(key)) {
      toast.error('Cannot use this special key');
      return;
    }

    // Allow modifier keys
    const ctrlKey = e.ctrlKey || e.metaKey;
    const shiftKey = e.shiftKey;
    const altKey = e.altKey;

    // Build key combination string for display
    let keyCombo = '';
    if (ctrlKey) keyCombo += 'Ctrl+';
    if (shiftKey) keyCombo += 'Shift+';
    if (altKey) keyCombo += 'Alt+';
    keyCombo += key.toUpperCase();

    // Check if key combination is already in use
    const existingShortcut = shortcuts.find(s => 
      s.key === key && 
      s.ctrlKey === ctrlKey && 
      s.shiftKey === shiftKey && 
      s.altKey === altKey && 
      s.action !== action
    );
    if (existingShortcut) {
      toast.error(`${keyCombo} is already assigned to ${existingShortcut.label}`);
      return;
    }

    // Update shortcut
    const newShortcuts = shortcuts.filter(s => s.action !== action);
    newShortcuts.push({ key, action, label, ctrlKey, shiftKey, altKey });
    saveShortcuts(newShortcuts);

    setEditingKey(null);
    setPendingKey('');
    toast.success(`${keyCombo} assigned to ${label}`);
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

  const getShortcutDisplay = (action: string): string | undefined => {
    const shortcut = shortcuts.find(s => s.action === action);
    if (!shortcut) return undefined;
    
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    
    let combo = '';
    if (shortcut.ctrlKey) combo += isMac ? '⌘+' : 'Ctrl+';
    if (shortcut.shiftKey) combo += isMac ? '⇧+' : 'Shift+';
    if (shortcut.altKey) combo += isMac ? '⌥+' : 'Alt+';
    combo += shortcut.key.toUpperCase();
    return combo;
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
          {/* Quick Reference - Main Navigation Shortcuts */}
          <div className="bg-muted/50 p-4 rounded-lg border">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span>🔥</span>
              <span>Quick Reference - Navigation Shortcuts</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center justify-between gap-2 p-2 bg-background rounded">
                <span className="text-muted-foreground">Clear All Filters</span>
                <Badge variant="outline" className="font-mono text-xs">/</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 p-2 bg-background rounded">
                <span className="text-muted-foreground">Focus Brand Filter</span>
                <Badge variant="outline" className="font-mono text-xs">B</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 p-2 bg-background rounded">
                <span className="text-muted-foreground">Focus OD Filter</span>
                <Badge variant="outline" className="font-mono text-xs">O</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 p-2 bg-background rounded">
                <span className="text-muted-foreground">Focus PN Filter</span>
                <Badge variant="outline" className="font-mono text-xs">N</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 p-2 bg-background rounded">
                <span className="text-muted-foreground">Focus PE Filter</span>
                <Badge variant="outline" className="font-mono text-xs">E</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 p-2 bg-background rounded">
                <span className="text-muted-foreground">Focus Type Filter</span>
                <Badge variant="outline" className="font-mono text-xs">T</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 p-2 bg-background rounded">
                <span className="text-muted-foreground">Open Shortcuts Dialog</span>
                <Badge variant="outline" className="font-mono text-xs">?</Badge>
              </div>
            </div>
          </div>

          {/* System Shortcuts */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">System Shortcuts</h3>
            <div className="space-y-2">
              {shortcuts
                .filter(s => s.action === 'clear_filters' || s.action === 'focus_brand' || s.action.startsWith('focus_parameter'))
                .map((shortcut) => {
                  const isEditing = editingKey === shortcut.action;
                  return (
                    <div key={shortcut.action} className="flex items-center justify-between gap-3 p-2 border rounded-lg">
                      <span className="text-sm flex-1">{shortcut.label}</span>
                      {isEditing ? (
                        <Input
                          autoFocus
                          placeholder="Press any key..."
                          value={pendingKey}
                          className="w-32 h-8 text-center"
                          onKeyDown={(e) => handleKeyCapture(e, shortcut.action, shortcut.label)}
                          onBlur={() => setEditingKey(null)}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="font-mono cursor-pointer hover:bg-secondary/80"
                            onClick={() => setEditingKey(shortcut.action)}
                          >
                            {getShortcutDisplay(shortcut.action)}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => removeShortcut(shortcut.action)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

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
                          {getShortcutDisplay(action)}
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
                          {getShortcutDisplay(action)}
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
                          {getShortcutDisplay(action)}
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
