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
    return acc;
  }, {} as Record<string, {
    product_type: string;
    brand: string;
    parameters: Record<string, unknown>;
    stock_entries: (StockEntry & { batch_code: string; batch_no: string })[]
  }>);

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
    let message = '📦 *INVENTORY REPORT*\n';
    message += `📅 ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n`;
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
      message += `🏷️ *${productType.toUpperCase()}*\n`;
      message += '─────────────────\n';

      Object.values(products).forEach(product => {
        const params = product.parameters as Record<string, string>;
        const paramsLine = Object.entries(params)
          .filter(([k, v]) => v && k !== 'Type' && k !== 'type')
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ');

        message += `\n📌 *${product.brand}*`;
        if (paramsLine) message += ` (${paramsLine})`;
        message += '\n';

        // Aggregate stock by type
        const stockByType: Record<string, { qty: number; details: string[] }> = {
          FULL_ROLL: { qty: 0, details: [] },
          CUT_ROLL: { qty: 0, details: [] },
          BUNDLE: { qty: 0, details: [] },
          SPARE: { qty: 0, details: [] }
        };

        product.stock_entries.forEach(entry => {
          if (entry.stock_type === 'FULL_ROLL') {
            stockByType.FULL_ROLL.qty += entry.total_available || 0;
            if (entry.quantity > 0) {
              stockByType.FULL_ROLL.details.push(
                `${entry.quantity} rolls × ${entry.length_per_unit?.toFixed(0) || 0}m`
              );
            }
          } else if (entry.stock_type === 'CUT_ROLL') {
            stockByType.CUT_ROLL.qty += entry.total_available || 0;
            stockByType.CUT_ROLL.details.push(
              `${entry.total_available?.toFixed(2) || 0}m (cut pieces)`
            );
          } else if (entry.stock_type === 'BUNDLE') {
            const pieces = entry.piece_count || (entry.quantity * (entry.pieces_per_bundle || 1));
            stockByType.BUNDLE.qty += pieces;
            if (entry.quantity > 0) {
              stockByType.BUNDLE.details.push(
                `${entry.quantity} bundles × ${entry.pieces_per_bundle || 0} pcs`
              );
            }
          } else if (entry.stock_type === 'SPARE') {
            const pieces = entry.piece_count || entry.total_available || 0;
            stockByType.SPARE.qty += pieces;
            stockByType.SPARE.details.push(`${pieces} spare pieces`);
          }
        });

        // Display stock with details
        if (stockByType.FULL_ROLL.qty > 0) {
          message += `   🔵 Full Rolls: ${stockByType.FULL_ROLL.details.join(' + ')} = *${stockByType.FULL_ROLL.qty.toFixed(2)}m*\n`;
        }
        if (stockByType.CUT_ROLL.qty > 0) {
          message += `   ✂️  Cut Rolls: ${stockByType.CUT_ROLL.details.join(' + ')} = *${stockByType.CUT_ROLL.qty.toFixed(2)}m*\n`;
        }
        if (stockByType.BUNDLE.qty > 0) {
          message += `   📦 Bundles: ${stockByType.BUNDLE.details.join(' + ')} = *${stockByType.BUNDLE.qty} pcs*\n`;
        }
        if (stockByType.SPARE.qty > 0) {
          message += `   🔸 Spares: ${stockByType.SPARE.details.join(' + ')} = *${stockByType.SPARE.qty} pcs*\n`;
        }

        // Calculate total
        const isSprinkler = product.product_type.toLowerCase().includes('sprinkler');
        const totalQty = isSprinkler
          ? stockByType.BUNDLE.qty + stockByType.SPARE.qty
          : stockByType.FULL_ROLL.qty + stockByType.CUT_ROLL.qty;
        const unit = isSprinkler ? 'pcs' : 'm';
        message += `   ➡️ *Total: ${totalQty.toFixed(2)} ${unit}*\n`;
      });

      message += '\n';
    });

    message += '━━━━━━━━━━━━━━━━━━━━\n';
    message += '✅ _Stock Updated_';

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    onOpenChange(false);
    toast.success('Opening WhatsApp...');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
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
                      {byType.FULL_ROLL.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Full Rolls</p>
                          {byType.FULL_ROLL.map(entry => (
                            <div key={entry.stock_id} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                              <Checkbox
                                checked={selectedStockIds.has(entry.stock_id)}
                                onCheckedChange={() => toggleStockEntry(entry.stock_id)}
                              />
                              <span className="text-sm">
                                {entry.quantity} rolls × {Number(entry.length_per_unit || 0).toFixed(0)}m = {Number(entry.total_available || 0).toFixed(2)}m
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {byType.CUT_ROLL.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Cut Rolls</p>
                          {byType.CUT_ROLL.map(entry => (
                            <div key={entry.stock_id} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                              <Checkbox
                                checked={selectedStockIds.has(entry.stock_id)}
                                onCheckedChange={() => toggleStockEntry(entry.stock_id)}
                              />
                              <span className="text-sm">
                                {Number(entry.total_available || 0).toFixed(2)}m (cut pieces)
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {byType.BUNDLE.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Bundles</p>
                          {byType.BUNDLE.map(entry => (
                            <div key={entry.stock_id} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                              <Checkbox
                                checked={selectedStockIds.has(entry.stock_id)}
                                onCheckedChange={() => toggleStockEntry(entry.stock_id)}
                              />
                              <span className="text-sm">
                                {entry.quantity} bundles × {entry.pieces_per_bundle || 0} pcs = {entry.piece_count || (entry.quantity * (entry.pieces_per_bundle || 1))} pcs
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {byType.SPARE.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Spare Pieces</p>
                          {byType.SPARE.map(entry => (
                            <div key={entry.stock_id} className="flex items-center gap-2 p-2 hover:bg-muted rounded">
                              <Checkbox
                                checked={selectedStockIds.has(entry.stock_id)}
                                onCheckedChange={() => toggleStockEntry(entry.stock_id)}
                              />
                              <span className="text-sm">
                                {entry.piece_count || entry.total_available || 0} spare pieces
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
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
