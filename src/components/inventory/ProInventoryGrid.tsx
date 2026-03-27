import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  ChevronDown, 
  ChevronUp, 
  Box, 
  Scissors, 
  Layers, 
  Package,
  MessageCircle,
  Download
} from 'lucide-react';
import { StockEntryList } from './StockEntryList';
import { cn } from '@/lib/utils';

import { InventoryBatchUI, StockEntry } from '@/types/inventory-ui';

interface ProductVariant {
  productTypeName: string;
  brandName: string;
  parameters: Record<string, unknown>;
  batches: InventoryBatchUI[];
}

interface ProInventoryGridProps {
  groupedByProductVariant: Record<string, ProductVariant>;
  selectedRows: Record<string, boolean>;
  onSelectedRowsChange: (rows: Record<string, boolean>) => void;
  onBulkWhatsApp: () => void;
  onBulkExport: () => void;
  onUpdate: () => void;
  onRefresh: () => void;
}

export const ProInventoryGrid = ({ 
  groupedByProductVariant, 
  selectedRows,
  onSelectedRowsChange,
  onBulkWhatsApp,
  onBulkExport,
  onUpdate, 
  onRefresh 
}: ProInventoryGridProps) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const selectedCount = Object.values(selectedRows).filter(Boolean).length;

  const toggleRow = (key: string) => {
    setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSelection = (key: string) => {
    onSelectedRowsChange({ ...selectedRows, [key]: !selectedRows[key] });
  };

  return (
    <div className="relative">
      <div className="rounded-xl border bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
        {/* Desktop Table View */}
        <Table className="hidden sm:table">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead className="font-semibold text-sm">Product & Brand</TableHead>
              <TableHead className="font-semibold text-center text-sm">OD</TableHead>
              <TableHead className="font-semibold text-center text-sm">PN</TableHead>
              <TableHead className="font-semibold text-center text-sm">PE</TableHead>
              <TableHead className="font-semibold text-right text-sm px-2">
                <div className="flex items-center justify-end gap-1">
                  <span>Full Rolls</span>
                </div>
              </TableHead>
              <TableHead className="font-semibold text-right text-sm px-2">
                <div className="flex items-center justify-end gap-1">
                  <span>Cut Pcs</span>
                </div>
              </TableHead>
              <TableHead className="font-semibold text-right text-sm px-2">
                <div className="flex items-center justify-end gap-1">
                  <span>Bundles</span>
                </div>
              </TableHead>
              <TableHead className="font-semibold text-right text-sm px-2">
                <div className="flex items-center justify-end gap-1">
                  <span>Spares</span>
                </div>
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(groupedByProductVariant).map(([key, variant]) => {
              const isExpanded = !!expandedRows[key];
              const isSelected = !!selectedRows[key];
              const allStockEntries = variant.batches.flatMap(b => b.stock_entries);
              const totals = {
                FULL_ROLL: allStockEntries.filter(e => e.stock_type === 'FULL_ROLL').reduce((s, e) => s + e.quantity, 0),
                CUT_ROLL: allStockEntries.filter(e => e.stock_type === 'CUT_ROLL' || e.stock_type === 'CUT_PIECE').reduce((s, e) => s + e.quantity, 0),
                BUNDLE: allStockEntries.filter(e => e.stock_type === 'BUNDLE').reduce((s, e) => s + e.quantity, 0),
                SPARE: allStockEntries.filter(e => e.stock_type === 'SPARE' || e.stock_type === 'SPARE_PIECES').reduce((s, e) => s + (e.piece_count || e.total_available || 0), 0)
              };

              return (
                <React.Fragment key={key}>
                  <TableRow 
                    className={cn(
                      "group hover:bg-accent/30 transition-all cursor-pointer border-b last:border-0",
                      isSelected && "bg-primary/5",
                      isExpanded && "bg-accent/10"
                    )}
                    onClick={() => toggleRow(key)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()} className="p-4 text-center">
                      <Checkbox 
                        checked={isSelected} 
                        onCheckedChange={() => toggleSelection(key)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground text-sm">{variant.brandName}</span>
                        <span className="text-xs text-muted-foreground">{variant.productTypeName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {String(variant.parameters.OD || '-')}
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {String(variant.parameters.PN || '-')}
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {String(variant.parameters.PE || '-')}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap px-2">
                      {totals.FULL_ROLL > 0 ? (
                        <div className="flex items-center justify-end gap-1 text-green-700">
                          <span className="font-semibold text-sm">{totals.FULL_ROLL}</span>
                          <Box className="h-3.5 w-3.5 opacity-60" />
                        </div>
                      ) : <span className="text-muted-foreground/20">-</span>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap px-2">
                      {totals.CUT_ROLL > 0 ? (
                        <div className="flex items-center justify-end gap-1 text-orange-700">
                          <span className="font-semibold text-sm">{totals.CUT_ROLL}</span>
                          <Scissors className="h-3.5 w-3.5 opacity-60" />
                        </div>
                      ) : <span className="text-muted-foreground/20">-</span>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap px-2">
                      {totals.BUNDLE > 0 ? (
                        <div className="flex items-center justify-end gap-1 text-purple-700">
                          <span className="font-semibold text-sm">{totals.BUNDLE}</span>
                          <Layers className="h-3.5 w-3.5 opacity-60" />
                        </div>
                      ) : <span className="text-muted-foreground/20">-</span>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap px-2">
                      {totals.SPARE > 0 ? (
                        <div className="flex items-center justify-end gap-1 text-amber-700">
                          <span className="font-semibold text-sm">{totals.SPARE}</span>
                          <Package className="h-3.5 w-3.5 opacity-60" />
                        </div>
                      ) : <span className="text-muted-foreground/20">-</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/20 border-b inset-shadow-sm">
                      <TableCell colSpan={10} className="p-0 border-t-0">
                        <div className="px-4 py-4 animate-in fade-in slide-in-from-top-1 duration-200">
                          <StockEntryList
                            batchId=""
                            stockEntries={variant.batches.flatMap(b => b.stock_entries.map(e => ({ ...e, batch_id: b.id, batch_code: b.batch_code || b.batch_no })))}
                            parameters={variant.parameters}
                            onUpdate={onUpdate}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>

        {/* Mobile High-Density Stacked View */}
        <div className="sm:hidden flex flex-col divide-y divide-border">
          {Object.entries(groupedByProductVariant).map(([key, variant]) => {
            const isExpanded = !!expandedRows[key];
            const isSelected = !!selectedRows[key];
            const allStockEntries = variant.batches.flatMap(b => b.stock_entries);
            const totals = {
              FULL_ROLL: allStockEntries.filter(e => e.stock_type === 'FULL_ROLL').reduce((s, e) => s + e.quantity, 0),
              CUT_ROLL: allStockEntries.filter(e => e.stock_type === 'CUT_ROLL' || e.stock_type === 'CUT_PIECE').reduce((s, e) => s + e.quantity, 0),
              BUNDLE: allStockEntries.filter(e => e.stock_type === 'BUNDLE').reduce((s, e) => s + e.quantity, 0),
              SPARE: allStockEntries.filter(e => e.stock_type === 'SPARE' || e.stock_type === 'SPARE_PIECES').reduce((s, e) => s + (e.piece_count || e.total_available || 0), 0)
            };

            return (
              <div 
                key={key}
                className={cn(
                  "p-2 sm:p-4 flex flex-col gap-1.5 active:bg-accent/20 transition-colors",
                  isSelected && "bg-primary/5",
                  isExpanded && "bg-accent/5"
                )}
                onClick={() => toggleRow(key)}
              >
                {/* Line 1: Checkbox + Brand + Product + Expansion */}
                <div className="flex items-center gap-2">
                <div onClick={(e) => e.stopPropagation()} className="pt-0.5">
                  <Checkbox 
                    checked={isSelected} 
                    onCheckedChange={() => toggleSelection(key)}
                    className="scale-75 origin-left"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[#111827] text-sm truncate uppercase tracking-tight">{variant.brandName}</span>
                    <div className="flex items-center gap-1.5 ml-1">
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/50" />}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider leading-none">{variant.productTypeName}</div>
                </div>
              </div>

              {/* Line 2: Parameters OD/PN/PE */}
              <div className="flex items-center gap-3 pl-6 text-[10px] border-t border-dashed border-border/40 pt-1 mt-1 overflow-x-auto no-scrollbar whitespace-nowrap">
                {variant.parameters.OD && (
                  <div className="flex items-center gap-1 border border-border/30 px-1 rounded bg-accent/5">
                    <span className="text-muted-foreground">OD</span>
                    <span className="font-bold text-foreground">{String(variant.parameters.OD)}</span>
                  </div>
                )}
                {variant.parameters.PN && (
                  <div className="flex items-center gap-1 border border-border/30 px-1 rounded bg-accent/5">
                    <span className="text-muted-foreground">PN</span>
                    <span className="font-bold text-foreground">{String(variant.parameters.PN)}</span>
                  </div>
                )}
                {variant.parameters.PE && (
                  <div className="flex items-center gap-1 border border-border/30 px-1 rounded bg-accent/5">
                    <span className="text-muted-foreground">PE</span>
                    <span className="font-bold text-foreground">{String(variant.parameters.PE)}</span>
                  </div>
                )}
              </div>

                <div className="flex items-center gap-4 pl-6 pt-0.5">
                  {(totals.FULL_ROLL > 0) && (
                    <div className="flex items-center gap-1">
                      <Box className="h-3 w-3 text-green-600" />
                      <span className="text-[10px] font-bold text-green-700">{totals.FULL_ROLL}</span>
                    </div>
                  )}
                  {(totals.CUT_ROLL > 0) && (
                    <div className="flex items-center gap-1">
                      <Scissors className="h-3 w-3 text-orange-600" />
                      <span className="text-[10px] font-bold text-orange-700">{totals.CUT_ROLL}</span>
                    </div>
                  )}
                  {(totals.BUNDLE > 0) && (
                    <div className="flex items-center gap-1">
                      <Layers className="h-3 w-3 text-purple-600" />
                      <span className="text-[10px] font-bold text-purple-700">{totals.BUNDLE}</span>
                    </div>
                  )}
                  {(totals.SPARE > 0) && (
                    <div className="flex items-center gap-1">
                      <Package className="h-3 w-3 text-amber-600" />
                      <span className="text-[10px] font-bold text-amber-700">{totals.SPARE}</span>
                    </div>
                  )}
                </div>

                {/* Expansion Content */}
                {isExpanded && (
                  <div className="pl-0 pt-2 border-t mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <StockEntryList
                      batchId=""
                      stockEntries={variant.batches.flatMap(b => b.stock_entries.map(e => ({ ...e, batch_id: b.id, batch_code: b.batch_code || b.batch_no })))}
                      parameters={variant.parameters}
                      onUpdate={onUpdate}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Action Command Bar */}
      {selectedCount > 0 && (
        <div 
          className="fixed bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 sm:gap-4 bg-background/95 backdrop-blur-md border border-primary/20 p-1.5 sm:p-3 px-3 sm:px-6 rounded-full shadow-2xl ring-1 ring-black/5 animate-in slide-in-from-bottom-4 duration-300"
        >
          <div className="flex items-center gap-1 sm:gap-2 pr-1.5 sm:pr-4 border-r">
            <span className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-primary text-[10px] sm:text-[11px] font-bold text-primary-foreground">
              {selectedCount}
            </span>
            <span className="text-[11px] sm:text-sm font-medium whitespace-nowrap hidden xs:inline">Selected</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button 
              size="sm" 
              className="bg-green-600 hover:bg-green-700 text-white border-none h-8 sm:h-10 px-3 sm:px-4"
              onClick={onBulkWhatsApp}
            >
              <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="text-xs sm:text-sm font-semibold">WhatsApp</span>
            </Button>
            
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => onSelectedRowsChange({})}
              className="h-8 sm:h-9 text-muted-foreground px-2"
            >
              <span className="text-xs sm:text-sm">Clear</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
