import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, ExternalLink } from 'lucide-react';
import { formatDateTime } from '@/utils/transactions/formatters';

interface StockEntry {
  stock_id: string;
  stock_type: string;
  quantity: number;
  length_per_unit?: number;
  pieces_per_bundle?: number;
  piece_length_meters?: number;
}

interface ProductionSnapshot {
  stock_entries?: StockEntry[];
  total_stock_entries?: number;
  total_items?: number;
}

interface Batch {
  id: string;
  batch_code: string;
  batch_no: string;
  product_type_name: string;
  brand_name: string;
  parameters: Record<string, string>;
  initial_quantity: number;
  current_quantity: number;
  weight_per_meter?: number;
  total_weight?: number;
  piece_length?: number;
  created_at: string;
  attachment_url?: string;
  production_snapshot?: ProductionSnapshot;
}

interface ProductionHistoryTableProps {
  batches: Batch[];
  onEdit: (batch: Batch) => void;
  canEdit: boolean;
  loading: boolean;
}

export function ProductionHistoryTable({ batches, onEdit, canEdit, loading }: ProductionHistoryTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No production batches found
      </div>
    );
  }

  const formatWeight = (weight: number | string | null | undefined) => {
    if (!weight) return '-';
    const numWeight = typeof weight === 'string' ? parseFloat(weight) : weight;
    if (isNaN(numWeight)) return '-';
    if (numWeight >= 1000) {
      return `${(numWeight / 1000).toFixed(2)} t`;
    }
    return `${numWeight.toFixed(2)} kg`;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Batch Code</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Parameters</TableHead>
            <TableHead className="text-right">Initial Qty</TableHead>
            <TableHead className="text-right">Current Qty</TableHead>
            <TableHead className="text-right">Weight</TableHead>
            <TableHead>Date</TableHead>
            {canEdit && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((batch) => (
            <TableRow key={batch.id}>
              <TableCell className="font-mono font-medium">{batch.batch_code}</TableCell>
              <TableCell>{batch.product_type_name}</TableCell>
              <TableCell>{batch.brand_name}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(batch.parameters || {}).map(([key, value]) => (
                    <Badge key={key} variant="outline" className="text-xs">
                      {key}: {value}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right">{batch.initial_quantity}</TableCell>
              <TableCell className="text-right">
                <span className={batch.current_quantity === 0 ? 'text-muted-foreground' : ''}>
                  {batch.current_quantity}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {batch.total_weight ? formatWeight(batch.total_weight) : '-'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDateTime(batch.created_at)}
              </TableCell>
              {canEdit && (
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {batch.attachment_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(batch.attachment_url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(batch)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
