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
import { scrap } from '@/lib/api-typed';
import { toast } from 'sonner';
import type * as API from '@/types';

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
  // Changed: Store quantity per group, not per individual stock entry
  const [scrapQuantitiesByGroup, setScrapQuantitiesByGroup] = useState<Record<string, number>>({});
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
    const totalRolls = entries.reduce((sum, e) => sum + e.quantity, 0);
    groupedStock.push({
      key: `FULL_ROLL-${length}`,
      stock_type: 'FULL_ROLL',
      label: `Full Rolls (${length}m)`,
      description: `${totalRolls} rolls available • ${length}m each`,
      entries,
      total_quantity: totalRolls,
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

  // Group Spares by piece length - allow selection by PIECE count, not bundle count
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
      label: `Spare Pieces (${length}m each)`,
      description: `${totalPieces} pieces`,
      entries,
      total_quantity: totalPieces, // Use total pieces, not bundles
      icon: <Box className="h-5 w-5 text-amber-600" />
    });
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setScrapQuantitiesByGroup({});
      setReason('');
      setCustomReason('');
      setNotes('');
    }
  }, [open]);

  const updateGroupQuantity = (groupKey: string, quantity: number) => {
    setScrapQuantitiesByGroup(prev => ({
      ...prev,
      [groupKey]: Math.max(0, Math.min(quantity, groupedStock.find(g => g.key === groupKey)?.total_quantity || 0))
    }));
  };

  const getTotalSelectedItems = (): number => {
    return Object.values(scrapQuantitiesByGroup).reduce((sum, qty) => sum + qty, 0);
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

      // Build items array from selected quantities per group
      Object.entries(scrapQuantitiesByGroup).forEach(([groupKey, quantityToScrap]) => {
        if (quantityToScrap <= 0) return;

        const group = groupedStock.find(g => g.key === groupKey);
        if (!group) return;

        // Select entries from this group up to the quantity needed
        let remainingToScrap = quantityToScrap;

        for (const entry of group.entries) {
          if (remainingToScrap <= 0) break;

          // For SPARE type, user selects by pieces, not bundles
          let quantityFromThisEntry: number;
          if (entry.stock_type === 'SPARE') {
            quantityFromThisEntry = Math.min(remainingToScrap, entry.piece_count || 0);
          } else {
            quantityFromThisEntry = Math.min(remainingToScrap, entry.quantity);
          }

          const item: ScrapItem = {
            stock_id: entry.stock_id,
            quantity_to_scrap: quantityFromThisEntry,
          };

          // Add piece_ids for CUT_ROLL and SPARE types
          if (entry.stock_type === 'CUT_ROLL' && entry.piece_ids) {
            item.piece_ids = entry.piece_ids.slice(0, quantityFromThisEntry);
          } else if (entry.stock_type === 'SPARE') {
            // For spare, always send piece_ids (backend requires it)
            // If entry has spare_id, repeat it for the number of pieces being scrapped
            if (entry.spare_id) {
              item.piece_ids = Array(quantityFromThisEntry).fill(entry.spare_id);
            } else if (entry.piece_ids) {
              // If entry has piece_ids array, take the required number
              item.piece_ids = entry.piece_ids.slice(0, quantityFromThisEntry);
            }
          }

          items.push(item);
          remainingToScrap -= quantityFromThisEntry;
        }
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
        className="max-w-3xl"
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
                const selectedForGroup = scrapQuantitiesByGroup[group.key] || 0;

                return (
                  <div key={group.key} className="border rounded-lg p-4 bg-muted/30">
                    {/* Group Header with Simple Input */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1">
                        {group.icon}
                        <div className="flex-1">
                          <div className="font-medium">{group.label}</div>
                          <div className="text-sm text-muted-foreground">{group.description}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-muted-foreground whitespace-nowrap">Quantity:</Label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          max={group.total_quantity}
                          value={selectedForGroup || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const value = e.target.value;
                            // Prevent negative, decimal, and non-integer input
                            if (value.includes('-') || value.includes('.') || value.includes('e')) {
                              return;
                            }
                            const num = parseInt(value) || 0;
                            updateGroupQuantity(group.key, num);
                          }}
                          onKeyDown={(e) => {
                            // Prevent minus, decimal point, and 'e' keys
                            if (e.key === '-' || e.key === '.' || e.key === 'e' || e.key === 'E') {
                              e.preventDefault();
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-24 h-9"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateGroupQuantity(group.key, group.total_quantity);
                          }}
                          className="h-9"
                        >
                          Max
                        </Button>
                      </div>
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
