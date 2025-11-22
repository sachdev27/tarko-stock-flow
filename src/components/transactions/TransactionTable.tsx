import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { TransactionRecord } from '@/types/transaction';
import { TransactionTypeBadge } from './TransactionTypeBadge';
import { ParameterBadges } from './ParameterBadges';
import { formatWeight, formatDateTime, formatDate, getProductName } from '@/utils/transactions/formatters';
import { formatQuantityShort } from '@/utils/transactions/quantityFormatters';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Helper function to calculate total quantity from dispatch item_breakdown
const calculateDispatchQuantity = (transaction: TransactionRecord): number => {
  if (!transaction.roll_snapshot?.item_breakdown || !Array.isArray(transaction.roll_snapshot.item_breakdown)) {
    return 0;
  }
  return transaction.roll_snapshot.item_breakdown.reduce((total: number, item: any) => {
    return total + (item.quantity || 0);
  }, 0);
};

// Helper function to format dispatch quantity breakdown in short format (like 10R + 2B)
const formatDispatchQuantityShort = (transaction: TransactionRecord): string => {
  if (!transaction.roll_snapshot?.item_breakdown || !Array.isArray(transaction.roll_snapshot.item_breakdown)) {
    return '0';
  }

  const counts: { [key: string]: number } = {};

  transaction.roll_snapshot.item_breakdown.forEach((item: any) => {
    const type = item.item_type;
    // For spare pieces, use piece_count instead of quantity
    const qty = type === 'SPARE_PIECES' ? (item.piece_count || 0) : (item.quantity || 0);
    counts[type] = (counts[type] || 0) + qty;
  });

  const parts: string[] = [];
  if (counts['FULL_ROLL']) parts.push(`${counts['FULL_ROLL']}R`);
  if (counts['CUT_ROLL']) parts.push(`${counts['CUT_ROLL']}C`);
  if (counts['BUNDLE']) parts.push(`${counts['BUNDLE']}B`);
  if (counts['SPARE_PIECES']) parts.push(`${counts['SPARE_PIECES']}S`);

  return parts.length > 0 ? parts.join(' + ') : '0';
};

// Helper function to calculate total meters from dispatch item_breakdown
const calculateDispatchMeters = (transaction: TransactionRecord): number => {
  if (!transaction.roll_snapshot?.item_breakdown || !Array.isArray(transaction.roll_snapshot.item_breakdown)) {
    return 0;
  }
  return transaction.roll_snapshot.item_breakdown.reduce((total: number, item: any) => {
    let itemMeters = 0;

    // For FULL_ROLL and CUT_PIECE - use length_meters
    if (item.length_meters && typeof item.length_meters === 'number' && item.length_meters > 0) {
      itemMeters = item.length_meters * (item.quantity || 1);
    }
    // For BUNDLE and SPARE_PIECES - use piece_length/piece_length_meters and piece_count
    else if (item.piece_count && (item.piece_length || item.piece_length_meters)) {
      const pieceLength = item.piece_length || item.piece_length_meters;
      if (typeof pieceLength === 'number' && pieceLength > 0) {
        itemMeters = pieceLength * item.piece_count * (item.quantity || 1);
      }
    }
    // Fallback: check for bundle_size and piece_length
    else if (item.bundle_size && item.piece_length && typeof item.piece_length === 'number' && item.piece_length > 0) {
      itemMeters = item.piece_length * item.bundle_size * (item.quantity || 1);
    }

    return total + itemMeters;
  }, 0);
};

type SortField = 'created_at' | 'transaction_type' | 'product' | 'weight' | 'customer';
type SortDirection = 'asc' | 'desc' | null;

interface TransactionTableProps {
  transactions: TransactionRecord[];
  selectedIds: Set<string>;
  onSelectTransaction: (id: string) => void;
  onSelectAll: () => void;
  onRowClick: (transaction: TransactionRecord) => void;
  showCheckboxes?: boolean;
  isAdmin?: boolean;
}

export function TransactionTable({
  transactions,
  selectedIds,
  onSelectTransaction,
  onSelectAll,
  onRowClick,
  showCheckboxes = false,
  isAdmin = false,
}: TransactionTableProps) {
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: desc -> asc -> null
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else if (sortDirection === 'asc') {
        setSortDirection(null);
        setSortField('created_at');
      }
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedTransactions = [...transactions].sort((a, b) => {
    if (!sortDirection) return 0;

    let aValue: string | number = '';
    let bValue: string | number = '';

    switch (sortField) {
      case 'created_at':
        aValue = new Date(a.created_at).getTime();
        bValue = new Date(b.created_at).getTime();
        break;
      case 'transaction_type':
        aValue = a.transaction_type;
        bValue = b.transaction_type;
        break;
      case 'product':
        aValue = getProductName(a);
        bValue = getProductName(b);
        break;
      case 'weight':
        aValue = a.total_weight || 0;
        bValue = b.total_weight || 0;
        break;
      case 'customer':
        aValue = a.customer_name || '';
        bValue = b.customer_name || '';
        break;
    }

    if (sortDirection === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const allSelected = transactions.length > 0 && transactions.every((t) => selectedIds.has(t.id));
  const someSelected = transactions.some((t) => selectedIds.has(t.id)) && !allSelected;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="ml-2 h-4 w-4" />;
    }
    return <ArrowDown className="ml-2 h-4 w-4" />;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showCheckboxes && isAdmin && (
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={onSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
            )}
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('created_at')}
                className="h-auto p-0 hover:bg-transparent"
              >
                Date/Time
                <SortIcon field="created_at" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('transaction_type')}
                className="h-auto p-0 hover:bg-transparent"
              >
                Type
                <SortIcon field="transaction_type" />
              </Button>
            </TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('product')}
                className="h-auto p-0 hover:bg-transparent"
              >
                Product
                <SortIcon field="product" />
              </Button>
            </TableHead>
            <TableHead>Parameters</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('weight')}
                className="h-auto p-0 hover:bg-transparent"
              >
                Weight
                <SortIcon field="weight" />
              </Button>
            </TableHead>
            <TableHead>Weight/Meter</TableHead>
            <TableHead>Meters</TableHead>
            <TableHead>
              <Button
                variant="ghost"
                onClick={() => handleSort('customer')}
                className="h-auto p-0 hover:bg-transparent"
              >
                Customer
                <SortIcon field="customer" />
              </Button>
            </TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTransactions.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={showCheckboxes && isAdmin ? 11 : 10}
                className="h-24 text-center text-muted-foreground"
              >
                No transactions found
              </TableCell>
            </TableRow>
          ) : (
            sortedTransactions.map((transaction) => {
              return (
              <TableRow
                key={transaction.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onRowClick(transaction)}
              >
                {showCheckboxes && isAdmin && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(transaction.id)}
                      onCheckedChange={() => onSelectTransaction(transaction.id)}
                      aria-label={`Select transaction ${transaction.id}`}
                    />
                  </TableCell>
                )}
                <TableCell className="text-sm">
                  {transaction.transaction_type === 'DISPATCH'
                    ? formatDateTime(transaction.created_at)
                    : formatDateTime(transaction.transaction_date || transaction.created_at)}
                </TableCell>
                <TableCell>
                  <TransactionTypeBadge transaction={transaction} />
                </TableCell>
                <TableCell className="font-medium">
                  {transaction.product_type === 'Mixed' || transaction.product_type === 'Mixed Products'
                    ? 'Mixed'
                    : (transaction.product_type && transaction.brand && transaction.product_type !== 'null' && transaction.brand !== 'null')
                    ? getProductName(transaction)
                    : transaction.transaction_type === 'DISPATCH'
                    ? 'No Products'
                    : getProductName(transaction)}
                </TableCell>
                <TableCell>
                  {transaction.product_type === 'Mixed' || transaction.product_type === 'Mixed Products' ? '-' : <ParameterBadges parameters={transaction.parameters} />}
                </TableCell>
                <TableCell className="text-sm">
                  {['DISPATCH', 'RETURN'].includes(transaction.transaction_type)
                    ? formatDispatchQuantityShort(transaction)
                    : transaction.quantity_breakdown
                    ? formatQuantityShort(transaction.quantity_breakdown)
                    : transaction.total_rolls_count || transaction.roll_snapshot?.total_rolls || '0'}
                </TableCell>
                <TableCell className="font-medium">
                  {['CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES', 'DISPATCH', 'RETURN'].includes(transaction.transaction_type)
                    ? '-'
                    : formatWeight(transaction.total_weight)}
                </TableCell>
                <TableCell className="text-sm">
                  {['CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES', 'DISPATCH'].includes(transaction.transaction_type)
                    ? '-'
                    : transaction.weight_per_meter && typeof transaction.weight_per_meter === 'number'
                    ? `${transaction.weight_per_meter.toFixed(3)} kg/m`
                    : '-'}
                </TableCell>
                <TableCell className="text-sm">
                  {['DISPATCH', 'RETURN'].includes(transaction.transaction_type)
                    ? (() => {
                        // For RETURN transactions, use the pre-calculated backend value
                        if (transaction.transaction_type === 'RETURN' && transaction.roll_length_meters) {
                          const meters = typeof transaction.roll_length_meters === 'number'
                            ? transaction.roll_length_meters
                            : parseFloat(transaction.roll_length_meters as string);
                          return !isNaN(meters) && meters > 0 ? meters.toFixed(2) : '-';
                        }
                        // For DISPATCH, calculate from item_breakdown
                        const meters = calculateDispatchMeters(transaction);
                        return meters > 0 ? meters.toFixed(2) : '-';
                      })()
                    : typeof transaction.roll_length_meters === 'number'
                    ? transaction.roll_length_meters.toFixed(2)
                    : '-'}
                </TableCell>
                <TableCell className="text-sm">
                  {transaction.customer_name
                    ? `${transaction.customer_name}${transaction.customer_city ? ` - ${transaction.customer_city}` : ''}`
                    : '-'
                  }
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                  {transaction.notes || '-'}
                </TableCell>
              </TableRow>
            );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
