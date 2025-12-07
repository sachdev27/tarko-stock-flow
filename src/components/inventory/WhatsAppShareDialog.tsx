import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface Batch {
  id: string;
  batch_code: string;
  batch_no: string;
  current_quantity: number;
  production_date: string;
  product_type_name: string;
  brand_name: string;
  parameters: Record<string, unknown>;
  stock_entries: StockEntry[];
}

interface StockEntry {
  stock_id: string;
  piece_ids?: string[];
  stock_type: 'FULL_ROLL' | 'CUT_ROLL' | 'BUNDLE' | 'SPARE';
  quantity: number;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
  piece_count?: number;
  total_available: number;
}

interface WhatsAppShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: Batch[];
}

export const WhatsAppShareDialog = ({ open, onOpenChange, batches }: WhatsAppShareDialogProps) => {
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  // Debug logging
  console.log('[WhatsAppShareDialog] Rendered with:', {
    open,
    batchesCount: batches?.length || 0,
    batches: batches?.slice(0, 2), // Log first 2 batches as sample
    firstBatchStockEntries: batches?.[0]?.stock_entries?.length || 0
  });

  // Group batches by product variant
  const groupedByProduct = batches.reduce((acc, batch) => {
    const key = `${batch.product_type_name}_${batch.brand_name}_${JSON.stringify(batch.parameters)}`;
    if (!acc[key]) {
      acc[key] = {
        product_type: batch.product_type_name,
        brand: batch.brand_name,
        parameters: batch.parameters,
        stock_entries: []
      };
    }
    // Add all stock entries from this batch
    batch.stock_entries.forEach(entry => {
      acc[key].stock_entries.push({
        ...entry,
        batch_code: batch.batch_code,
        batch_no: batch.batch_no
      });
    });
    console.log('[WhatsAppShareDialog] Grouped product:', key, 'entries:', acc[key].stock_entries.length);
    return acc;
  }, {} as Record<string, {
    product_type: string;
    brand: string;
    parameters: Record<string, unknown>;
    stock_entries: (StockEntry & { batch_code: string; batch_no: string })[]
  }>);

  console.log('[WhatsAppShareDialog] Total product groups:', Object.keys(groupedByProduct).length);

  const toggleStockEntry = (stockId: string) => {
    const newSelected = new Set(selectedStockIds);
    if (newSelected.has(stockId)) {
      newSelected.delete(stockId);
    } else {
      newSelected.add(stockId);
    }
    setSelectedStockIds(newSelected);
  };

  const toggleProduct = (productKey: string) => {
    const product = groupedByProduct[productKey];
    const allStockIds = product.stock_entries.map(s => s.stock_id);
    const allSelected = allStockIds.every(id => selectedStockIds.has(id));

    const newSelected = new Set(selectedStockIds);
    allStockIds.forEach(id => {
      if (allSelected) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
    });
    setSelectedStockIds(newSelected);
  };

  const toggleExpandProduct = (productKey: string) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productKey)) {
      newExpanded.delete(productKey);
    } else {
      newExpanded.add(productKey);
    }
    setExpandedProducts(newExpanded);
  };

  const selectAll = () => {
    const allStockIds = new Set<string>();
    Object.values(groupedByProduct).forEach(product => {
      product.stock_entries.forEach(entry => allStockIds.add(entry.stock_id));
    });
    setSelectedStockIds(allStockIds);
  };

  const clearAll = () => {
    setSelectedStockIds(new Set());
  };

  const shareOnWhatsApp = () => {
    if (selectedStockIds.size === 0) {
      toast.error('Please select at least one item to share');
      return;
    }

    // Generate inventory message
    let message = '📦 *INVENTORY STOCK REPORT*\n';
    message += `📅 ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}\n`;
    message += '━━━━━━━━━━━━━━━━━━━━\n\n';

    // Group by product type
    const byProductType: Record<string, typeof groupedByProduct> = {};
    Object.entries(groupedByProduct).forEach(([key, product]) => {
      const selectedEntries = product.stock_entries.filter(e => selectedStockIds.has(e.stock_id));
      if (selectedEntries.length > 0) {
        if (!byProductType[product.product_type]) {
          byProductType[product.product_type] = {};
        }
        byProductType[product.product_type][key] = {
          ...product,
          stock_entries: selectedEntries
        };
      }
    });

    Object.entries(byProductType).forEach(([productType, products]) => {
      message += `*${productType.toUpperCase()}*\n`;

      Object.values(products).forEach(product => {
        const params = product.parameters as Record<string, string>;

        // Build parameter line (sorted: OD, PN, PE, then rest)
        const sortedParams = Object.entries(params)
          .sort(([keyA], [keyB]) => {
            const order = ['OD', 'PN', 'PE'];
            const indexA = order.indexOf(keyA);
            const indexB = order.indexOf(keyB);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return keyA.localeCompare(keyB);
          });

        message += `*${product.brand}*\n`;
        sortedParams.forEach(([key, value]) => {
          message += `${key}: ${value}\n`;
        });

        // Aggregate bundles by (pieces_per_bundle, piece_length_meters)
        const bundleGroups = new Map<string, { qty: number; pcs_per_bundle: number; length: number; totalPieces: number }>();
        const spareGroups = new Map<number, number>(); // piece_length_meters => total_pieces
        const cutRollGroups = new Map<number, { count: number; totalMeters: number }>(); // cutLength => { count, totalMeters }
        let fullRollsTotal = 0;

        product.stock_entries.forEach(entry => {
          if (entry.stock_type === 'FULL_ROLL') {
            fullRollsTotal += entry.quantity;
          } else if (entry.stock_type === 'CUT_ROLL') {
            const cutLength = Number(entry.total_available || 0);
            const existing = cutRollGroups.get(cutLength) || { count: 0, totalMeters: 0 };
            existing.count += 1;
            existing.totalMeters += cutLength;
            cutRollGroups.set(cutLength, existing);
          } else if (entry.stock_type === 'BUNDLE') {
            const normalizedPieces = Number(entry.pieces_per_bundle || 0);
            const normalizedLength = Number(entry.piece_length_meters || 0);
            const key = `${normalizedPieces}-${normalizedLength}`;
            const existing = bundleGroups.get(key) || { qty: 0, pcs_per_bundle: normalizedPieces, length: normalizedLength, totalPieces: 0 };
            existing.qty += entry.quantity;
            existing.totalPieces += entry.piece_count || (entry.quantity * normalizedPieces);
            bundleGroups.set(key, existing);
          } else if (entry.stock_type === 'SPARE') {
            const pieces = entry.piece_count || entry.total_available || 0;
            const normalizedLength = Number(entry.piece_length_meters || 0);
            spareGroups.set(normalizedLength, (spareGroups.get(normalizedLength) || 0) + pieces);
          }
        });

        // Display aggregated stock
        let totalPieces = 0;
        let totalMeters = 0;

        if (fullRollsTotal > 0) {
          message += `\n*${fullRollsTotal} Full Rolls*\n`;
        }

        if (cutRollGroups.size > 0) {
          const totalCutRolls = Array.from(cutRollGroups.values()).reduce((sum, g) => sum + g.count, 0);
          const totalCutMeters = Array.from(cutRollGroups.values()).reduce((sum, g) => sum + g.totalMeters, 0);
          message += `\n*${totalCutRolls} Cut ${totalCutRolls === 1 ? 'Roll' : 'Rolls'}*\n`;

          // Sort by length descending
          const sortedCutRolls = Array.from(cutRollGroups.entries()).sort(([a], [b]) => b - a);
          sortedCutRolls.forEach(([cutLength, group]) => {
            message += `${group.count} ${group.count === 1 ? 'roll' : 'rolls'} × ${cutLength.toFixed(0)}m = ${group.totalMeters.toFixed(0)}m\n`;
          });

          totalMeters += totalCutMeters;
        }

        if (bundleGroups.size > 0) {
          const totalBundles = Array.from(bundleGroups.values()).reduce((sum, g) => sum + g.qty, 0);
          message += `\n*${totalBundles} ${totalBundles === 1 ? 'Bundle' : 'Bundles'}*\n`;

          // Sort by length desc, then by pieces_per_bundle desc
          const sortedBundles = Array.from(bundleGroups.values()).sort((a, b) => {
            if (b.length !== a.length) return b.length - a.length;
            return b.pcs_per_bundle - a.pcs_per_bundle;
          });

          sortedBundles.forEach(({ qty, pcs_per_bundle, length, totalPieces: pcs }) => {
            message += `${qty} ${qty === 1 ? 'Bundle' : 'Bundles'}\n`;
            message += `${pcs_per_bundle} pieces each • ${length}m per piece\n`;
            totalPieces += pcs;
          });
        }

        if (spareGroups.size > 0) {
          const totalSpares = Array.from(spareGroups.values()).reduce((sum, qty) => sum + qty, 0);
          message += `\n*${totalSpares} Spare ${totalSpares === 1 ? 'Piece' : 'Pieces'}*\n`;

          // Sort by length descending
          const sortedSpares = Array.from(spareGroups.entries()).sort((a, b) => b[0] - a[0]);

          sortedSpares.forEach(([length, qty]) => {
            message += `${qty} ${qty === 1 ? 'pc' : 'pcs'} × ${length}m\n`;
          });
          totalPieces += totalSpares;
        }

        // Total summary
        const isSprinkler = product.product_type.toLowerCase().includes('sprinkler');
        if (isSprinkler && totalPieces > 0) {
          message += `\n_Total: ${totalPieces} pieces_\n`;
        } else if (!isSprinkler && totalMeters > 0) {
          message += `\n_Total: ${totalMeters.toFixed(0)}m_\n`;
        }

        message += '\n';
      });
    });

    message += '━━━━━━━━━━━━━━━━━━━━\n';
    message += '✅ Stock as of ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    onOpenChange(false);
    toast.success('Opening WhatsApp...');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Share on WhatsApp
          </DialogTitle>
          <DialogDescription>
            Select individual stock items to include in your WhatsApp inventory message
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {selectedStockIds.size} item{selectedStockIds.size !== 1 ? 's' : ''} selected
            </p>
            <div className="flex gap-2">
              <Button onClick={selectAll} variant="outline" size="sm">
                Select All
              </Button>
              <Button onClick={clearAll} variant="outline" size="sm">
                Clear All
              </Button>
            </div>
          </div>

          <div className="space-y-2 border rounded-lg p-4 max-h-96 overflow-y-auto">
            {Object.entries(groupedByProduct).map(([productKey, product]) => {
              const allStockIds = product.stock_entries.map(s => s.stock_id);
              const allSelected = allStockIds.every(id => selectedStockIds.has(id));
              const someSelected = allStockIds.some(id => selectedStockIds.has(id));
              const isExpanded = expandedProducts.has(productKey);

              // Group stock entries by type for display
              const byType = {
                FULL_ROLL: product.stock_entries.filter(e => e.stock_type === 'FULL_ROLL'),
                CUT_ROLL: product.stock_entries.filter(e => e.stock_type === 'CUT_ROLL'),
                BUNDLE: product.stock_entries.filter(e => e.stock_type === 'BUNDLE'),
                SPARE: product.stock_entries.filter(e => e.stock_type === 'SPARE')
              };

              return (
                <div key={productKey} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => toggleProduct(productKey)}
                        className={someSelected && !allSelected ? 'opacity-50' : ''}
                      />
                      <div className="flex items-center gap-2 flex-wrap flex-1">
                        <Badge variant="secondary" className="text-sm">{product.brand}</Badge>
                        {/* Sort parameters: OD first, then PN, then PE, rest alphabetically */}
                        {Object.entries(product.parameters as Record<string, string>)
                          .sort(([keyA], [keyB]) => {
                            const order = ['OD', 'PN', 'PE'];
                            const indexA = order.indexOf(keyA);
                            const indexB = order.indexOf(keyB);
                            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                            if (indexA !== -1) return -1;
                            if (indexB !== -1) return 1;
                            return keyA.localeCompare(keyB);
                          })
                          .map(([key, value]) => (
                          <Badge key={key} variant="outline" className="text-xs">
                            {key}: {value}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpandProduct(productKey)}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="ml-6 mt-2 space-y-2">
                      {byType.FULL_ROLL.length > 0 && (() => {
                        // Aggregate full rolls by length_per_unit
                        const rollGroups = new Map<number, { entries: typeof byType.FULL_ROLL; totalQty: number; totalMeters: number }>();
                        byType.FULL_ROLL.forEach(entry => {
                          const normalizedLength = Number(entry.length_per_unit || 0);
                          const existing = rollGroups.get(normalizedLength) || { entries: [], totalQty: 0, totalMeters: 0 };
                          existing.entries.push(entry);
                          existing.totalQty += entry.quantity;
                          existing.totalMeters += Number(entry.total_available || 0);
                          rollGroups.set(normalizedLength, existing);
                        });

                        return (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Full Rolls</p>
                            {Array.from(rollGroups.values()).map((group, idx) => {
                              const firstEntry = group.entries[0];
                              const allStockIds = group.entries.map(e => e.stock_id);
                              const allSelected = allStockIds.every(id => selectedStockIds.has(id));

                              return (
                                <div key={idx} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                                  <Checkbox
                                    checked={allSelected}
                                    onCheckedChange={() => {
                                      const newSelected = new Set(selectedStockIds);
                                      allStockIds.forEach(id => {
                                        if (allSelected) {
                                          newSelected.delete(id);
                                        } else {
                                          newSelected.add(id);
                                        }
                                      });
                                      setSelectedStockIds(newSelected);
                                    }}
                                  />
                                  <span className="text-sm">
                                    {group.totalQty} rolls × {Number(firstEntry.length_per_unit || 0).toFixed(0)}m = {group.totalMeters.toFixed(2)}m
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {byType.CUT_ROLL.length > 0 && (() => {
                        // Aggregate cut rolls by the cut piece length (total_available)
                        const cutGroups = new Map<number, { entries: typeof byType.CUT_ROLL; count: number; totalMeters: number }>();
                        byType.CUT_ROLL.forEach(entry => {
                          const cutLength = Number(entry.total_available || 0);
                          const existing = cutGroups.get(cutLength) || { entries: [], count: 0, totalMeters: 0 };
                          existing.entries.push(entry);
                          existing.count += 1;
                          existing.totalMeters += cutLength;
                          cutGroups.set(cutLength, existing);
                        });

                        return (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Cut Rolls</p>
                            {Array.from(cutGroups.entries())
                              .sort(([a], [b]) => b - a) // Sort by length descending
                              .map(([cutLength, group], idx) => {
                                const allStockIds = group.entries.map(e => e.stock_id);
                                const allSelected = allStockIds.every(id => selectedStockIds.has(id));

                                return (
                                  <div key={idx} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                                    <Checkbox
                                      checked={allSelected}
                                      onCheckedChange={() => {
                                        const newSelected = new Set(selectedStockIds);
                                        allStockIds.forEach(id => {
                                          if (allSelected) {
                                            newSelected.delete(id);
                                          } else {
                                            newSelected.add(id);
                                          }
                                        });
                                        setSelectedStockIds(newSelected);
                                      }}
                                    />
                                    <span className="text-sm">
                                      {group.count} {group.count === 1 ? 'roll' : 'rolls'} × {cutLength.toFixed(0)}m = {group.totalMeters.toFixed(0)}m
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        );
                      })()}                      {byType.BUNDLE.length > 0 && (() => {
                        // Aggregate bundles by (pieces_per_bundle, piece_length_meters)
                        // Normalize numbers to avoid "6" vs "6.0" mismatch
                        const bundleGroups = new Map<string, { entries: typeof byType.BUNDLE; totalQty: number; totalPieces: number }>();
                        byType.BUNDLE.forEach(entry => {
                          const normalizedLength = Number(entry.piece_length_meters || 0);
                          const normalizedPieces = Number(entry.pieces_per_bundle || 0);
                          const key = `${normalizedPieces}-${normalizedLength}`;
                          const existing = bundleGroups.get(key) || { entries: [], totalQty: 0, totalPieces: 0 };
                          existing.entries.push(entry);
                          existing.totalQty += entry.quantity;
                          existing.totalPieces += entry.piece_count || (entry.quantity * (entry.pieces_per_bundle || 1));
                          bundleGroups.set(key, existing);
                        });

                        return (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Bundles</p>
                            {Array.from(bundleGroups.values()).map((group, idx) => {
                              const firstEntry = group.entries[0];
                              const allStockIds = group.entries.map(e => e.stock_id);
                              const allSelected = allStockIds.every(id => selectedStockIds.has(id));

                              return (
                                <div key={idx} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                                  <Checkbox
                                    checked={allSelected}
                                    onCheckedChange={() => {
                                      const newSelected = new Set(selectedStockIds);
                                      allStockIds.forEach(id => {
                                        if (allSelected) {
                                          newSelected.delete(id);
                                        } else {
                                          newSelected.add(id);
                                        }
                                      });
                                      setSelectedStockIds(newSelected);
                                    }}
                                  />
                                  <span className="text-sm">
                                    {group.totalQty} bundles × {firstEntry.pieces_per_bundle || 0} pcs ({firstEntry.piece_length_meters || 0}m each) = {group.totalPieces} pcs
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {byType.SPARE.length > 0 && (() => {
                        // Aggregate spare pieces by piece_length_meters (normalize to avoid "6" vs "6.0")
                        const spareGroups = new Map<number, { entries: typeof byType.SPARE; totalPieces: number }>();
                        byType.SPARE.forEach(entry => {
                          const normalizedLength = Number(entry.piece_length_meters || 0);
                          const existing = spareGroups.get(normalizedLength) || { entries: [], totalPieces: 0 };
                          existing.entries.push(entry);
                          existing.totalPieces += entry.piece_count || entry.total_available || 0;
                          spareGroups.set(normalizedLength, existing);
                        });

                        return (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Spare Pieces</p>
                            {Array.from(spareGroups.entries()).map(([length, group]) => {
                              const allStockIds = group.entries.map(e => e.stock_id);
                              const allSelected = allStockIds.every(id => selectedStockIds.has(id));

                              return (
                                <div key={length} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                                  <Checkbox
                                    checked={allSelected}
                                    onCheckedChange={() => {
                                      const newSelected = new Set(selectedStockIds);
                                      allStockIds.forEach(id => {
                                        if (allSelected) {
                                          newSelected.delete(id);
                                        } else {
                                          newSelected.add(id);
                                        }
                                      });
                                      setSelectedStockIds(newSelected);
                                    }}
                                  />
                                  <span className="text-sm">
                                    {group.totalPieces} pcs × {length}m
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={shareOnWhatsApp}
            disabled={selectedStockIds.size === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Share on WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
