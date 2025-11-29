import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, AlertCircle, Box, Scissors, Package } from 'lucide-react';
import { scrap } from '@/lib/api';
import { toast } from 'sonner';

interface StockEntry {
  stock_id: string;
  piece_id?: string;
  piece_ids?: string[];
  spare_id?: string;
  stock_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE';
  quantity: number;
  status: string;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  piece_count?: number;
  total_available: number;
  product_type_name: string;
  batch_id?: string;
  batch_code?: string;
}

interface ScrapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockEntries: StockEntry[];
  onSuccess: () => void;
}

interface GroupedStock {
  key: string;
  stock_type: string;
  label: string;
  description: string;
  entries: StockEntry[];
  total_quantity: number;
  icon: React.ReactNode;
}

interface ScrapQuantities {
  [groupKey: string]: {
    [stockId: string]: number;
  };
}

interface ScrapItem {
  stock_id: string;
  quantity_to_scrap: number;
  piece_ids?: string[];
}

const SCRAP_REASONS = [
  'Damaged in production',
  'Damaged in storage',
  'Quality defect',
  'Expired material',
  'Customer return - defective',
  'Wrong specifications',
  'Physical damage',
  'Other'
];

export const ScrapDialog = ({
  open,
  onOpenChange,
  stockEntries,
  onSuccess,
}: ScrapDialogProps) => {
  const [scrapQuantities, setScrapQuantities] = useState<ScrapQuantities>({});
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Group stock entries
  const groupedStock: GroupedStock[] = [];

  // Group Full Rolls by length
  const fullRollsByLength: Record<number, StockEntry[]> = {};
  stockEntries.filter(e => e.stock_type === 'FULL_ROLL').forEach(entry => {
    const length = Number(entry.length_per_unit || 0);
    if (!fullRollsByLength[length]) fullRollsByLength[length] = [];
    fullRollsByLength[length].push(entry);
  });

  Object.entries(fullRollsByLength).forEach(([length, entries]) => {
    groupedStock.push({
      key: `FULL_ROLL-${length}`,
      stock_type: 'FULL_ROLL',
      label: `Full Rolls (${length}m)`,
      description: `${entries.length} rolls available • ${length}m each`,
      entries,
      total_quantity: entries.length,
      icon: <Box className="h-5 w-5 text-green-600" />
    });
  });

  // Group Cut Rolls by length
  const cutRollsByLength: Record<number, StockEntry[]> = {};
  stockEntries.filter(e => e.stock_type === 'CUT_ROLL').forEach(entry => {
    const length = Number(entry.length_per_unit || 0);
    if (!cutRollsByLength[length]) cutRollsByLength[length] = [];
    cutRollsByLength[length].push(entry);
  });

  Object.entries(cutRollsByLength).forEach(([length, entries]) => {
    const totalPieces = entries.reduce((sum, e) => sum + e.quantity, 0);
    groupedStock.push({
      key: `CUT_ROLL-${length}`,
      stock_type: 'CUT_ROLL',
      label: `Cut Pieces (${length}m)`,
      description: `${totalPieces} pieces available • ${length}m each`,
      entries,
      total_quantity: totalPieces,
      icon: <Scissors className="h-5 w-5 text-orange-600" />
    });
  });

  // Group Bundles by size and piece length
  const bundlesByKey: Record<string, StockEntry[]> = {};
  stockEntries.filter(e => e.stock_type === 'BUNDLE').forEach(entry => {
    const size = entry.pieces_per_bundle || 0;
    const length = Number(entry.piece_length_meters || 0);
    const key = `${size}-${length}`;
    if (!bundlesByKey[key]) bundlesByKey[key] = [];
    bundlesByKey[key].push(entry);
  });

  Object.entries(bundlesByKey).forEach(([key, entries]) => {
    const [size, length] = key.split('-');
    const totalBundles = entries.reduce((sum, e) => sum + e.quantity, 0);
    groupedStock.push({
      key: `BUNDLE-${key}`,
      stock_type: 'BUNDLE',
      label: `Bundles (${size} pcs @ ${length}m)`,
      description: `${totalBundles} bundles available`,
      entries,
      total_quantity: totalBundles,
      icon: <Package className="h-5 w-5 text-purple-600" />
    });
  });

  // Group Spares by piece length
  const sparesByLength: Record<number, StockEntry[]> = {};
  stockEntries.filter(e => e.stock_type === 'SPARE').forEach(entry => {
    const length = Number(entry.piece_length_meters || 0);
    if (!sparesByLength[length]) sparesByLength[length] = [];
    sparesByLength[length].push(entry);
  });

  Object.entries(sparesByLength).forEach(([length, entries]) => {
    const totalBundles = entries.length; // Each entry is one spare bundle
    const totalPieces = entries.reduce((sum, e) => sum + (e.piece_count || 0), 0);
    groupedStock.push({
      key: `SPARE-${length}`,
      stock_type: 'SPARE',
      label: `Spare Bundles (${length}m pieces)`,
      description: `${totalBundles} bundles (${totalPieces} pieces total)`,
      entries,
      total_quantity: totalBundles,
      icon: <Box className="h-5 w-5 text-amber-600" />
    });
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setScrapQuantities({});
      setReason('');
      setCustomReason('');
      setNotes('');
    }
  }, [open]);

  const updateQuantity = (groupKey: string, stockId: string, quantity: number) => {
    setScrapQuantities(prev => ({
      ...prev,
      [groupKey]: {
        ...prev[groupKey],
        [stockId]: Math.max(0, quantity)
      }
    }));
  };

  const selectAll = (group: GroupedStock) => {
    const newQuantities: Record<string, number> = {};
    group.entries.forEach(entry => {
      // For all types including SPARE, quantity field represents the unit count
      // SPARE: quantity = 1 (one bundle), CUT_ROLL: quantity = piece count, etc.
      newQuantities[entry.stock_id] = entry.quantity;
    });
    setScrapQuantities(prev => ({
      ...prev,
      [group.key]: newQuantities
    }));
  };

  const clearGroup = (groupKey: string) => {
    setScrapQuantities(prev => {
      const updated = { ...prev };
      delete updated[groupKey];
      return updated;
    });
  };

  const getTotalSelectedForGroup = (group: GroupedStock): number => {
    const groupQuantities = scrapQuantities[group.key] || {};
    return Object.values(groupQuantities).reduce((sum, qty) => sum + qty, 0);
  };

  const getTotalSelectedItems = (): number => {
    return Object.values(scrapQuantities).reduce((sum, group) => {
      return sum + Object.values(group).reduce((gSum, qty) => gSum + qty, 0);
    }, 0);
  };

  const handleSubmit = async () => {
    const totalSelected = getTotalSelectedItems();

    if (totalSelected === 0) {
      toast.error('Please select at least one item to scrap');
      return;
    }

    if (!reason) {
      toast.error('Please select a reason for scrapping');
      return;
    }

    const finalReason = reason === 'Other' ? customReason : reason;
    if (!finalReason.trim()) {
      toast.error('Please provide a reason for scrapping');
      return;
    }

    setSubmitting(true);

    try {
      const items: ScrapItem[] = [];

      // Build items array from selected quantities
      Object.entries(scrapQuantities).forEach(([groupKey, stockQuantities]) => {
        const group = groupedStock.find(g => g.key === groupKey);
        if (!group) return;

        Object.entries(stockQuantities).forEach(([stockId, quantity]) => {
          if (quantity <= 0) return;

          const entry = group.entries.find(e => e.stock_id === stockId);
          if (!entry) return;

          const item: ScrapItem = {
            stock_id: stockId,
            quantity_to_scrap: quantity,
          };

          // Add piece_ids for CUT_ROLL and SPARE types
          // CRITICAL: Only include the number of pieces being scrapped, not all pieces
          if (entry.stock_type === 'CUT_ROLL' && entry.piece_ids) {
            // For cut rolls, slice to get only the quantity being scrapped
            item.piece_ids = entry.piece_ids.slice(0, quantity);
          } else if (entry.stock_type === 'SPARE' && entry.spare_id) {
            // For spares, if scrapping partial quantity from this spare_id
            // Note: This assumes one spare_id per stock entry
            // If scrapping less than total, backend needs to handle partial scrap
            item.piece_ids = [entry.spare_id];
          }

          items.push(item);
        });
      });

      await scrap.create({
        items,
        reason: finalReason,
        notes: notes.trim() || undefined,
      });

      toast.success('Items scrapped successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('Error scrapping items:', error);
      interface ErrorResponse {
        response?: {
          data?: {
            error?: string;
          };
        };
      }
      const errorMessage = (error as ErrorResponse).response?.data?.error || 'Failed to scrap items';
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const totalSelected = getTotalSelectedItems();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
        onInteractOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Scrap Inventory Items
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Warning */}
          <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Warning: This action cannot be undone</p>
              <p className="text-muted-foreground mt-1">
                Selected items will be permanently marked as scrapped and removed from available inventory.
              </p>
            </div>
          </div>

          {/* Grouped Items with Quantity Selectors */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Select Items to Scrap</Label>

            <div className="space-y-3 max-h-96 overflow-y-auto border rounded-lg p-3">
              {groupedStock.map(group => {
                const selectedForGroup = getTotalSelectedForGroup(group);
                const groupQuantities = scrapQuantities[group.key] || {};

                return (
                  <div key={group.key} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    {/* Group Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {group.icon}
                        <div>
                          <div className="font-medium">{group.label}</div>
                          <div className="text-sm text-muted-foreground">{group.description}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {selectedForGroup} / {group.total_quantity} selected
                        </Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (selectedForGroup === group.total_quantity) {
                              clearGroup(group.key);
                            } else {
                              selectAll(group);
                            }
                          }}
                        >
                          {selectedForGroup === group.total_quantity ? 'Clear' : 'All'}
                        </Button>
                      </div>
                    </div>

                    {/* Individual Stock Entries with Quantity Inputs */}
                    <div className="space-y-2 pl-8">
                      {group.entries.map(entry => {
                        const maxQuantity = entry.quantity; // For SPARE: quantity=1 bundle
                        const currentQuantity = groupQuantities[entry.stock_id] || 0;

                        return (
                          <div key={entry.stock_id} className="flex items-center gap-3 p-2 bg-background rounded">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm">
                                {entry.batch_code && (
                                  <Badge variant="outline" className="font-mono text-xs mr-2">
                                    {entry.batch_code}
                                  </Badge>
                                )}
                                <span className="text-muted-foreground">
                                  Max: {maxQuantity} {group.stock_type === 'SPARE' ? `bundle (${entry.piece_count || 0} pcs)` : 'units'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min="0"
                                max={maxQuantity}
                                value={currentQuantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  updateQuantity(group.key, entry.stock_id, Math.min(val, maxQuantity));
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-20 h-8"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateQuantity(group.key, entry.stock_id, maxQuantity);
                                }}
                                className="h-8 px-2"
                              >
                                Max
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-sm text-muted-foreground">
              Total: {totalSelected} item{totalSelected !== 1 ? 's' : ''} selected
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-base font-semibold">
              Reason for Scrapping <span className="text-destructive">*</span>
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {SCRAP_REASONS.map(r => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Reason */}
          {reason === 'Other' && (
            <div className="space-y-2">
              <Label htmlFor="customReason" className="text-base font-semibold">
                Specify Reason <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customReason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Enter custom reason"
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-base font-semibold">
              Additional Notes
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="Any additional details about why these items are being scrapped..."
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleSubmit}
              disabled={submitting || totalSelected === 0 || !reason}
              className="flex-1 gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {submitting ? 'Scrapping...' : `Scrap ${totalSelected} Item${totalSelected !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
