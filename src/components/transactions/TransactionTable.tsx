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
import { formatWeight, formatDateTime, getProductName } from '@/utils/transactions/formatters';
import { formatQuantityShort } from '@/utils/transactions/quantityFormatters';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
            <TableHead>Batch/Invoice</TableHead>
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
            sortedTransactions.map((transaction) => (
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
                  {formatDateTime(transaction.created_at)}
                </TableCell>
                <TableCell>
                  <TransactionTypeBadge transaction={transaction} />
                </TableCell>
                <TableCell className="font-medium">
                  {getProductName(transaction)}
                </TableCell>
                <TableCell>
                  <ParameterBadges parameters={transaction.parameters} />
                </TableCell>
                <TableCell className="text-sm">
                  {transaction.batch_no || transaction.invoice_no || '-'}
                </TableCell>
                <TableCell className="text-sm">
                  {transaction.quantity_breakdown
                    ? formatQuantityShort(transaction.quantity_breakdown)
                    : transaction.total_rolls_count || transaction.roll_snapshot?.total_rolls || '0'}
                </TableCell>
                <TableCell className="font-medium">
                  {formatWeight(transaction.total_weight)}
                </TableCell>
                <TableCell className="text-sm">
                  {typeof transaction.roll_length_meters === 'number'
                    ? transaction.roll_length_meters.toFixed(2)
                    : '-'}
                </TableCell>
                <TableCell className="text-sm">
                  {transaction.customer_name || '-'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                  {transaction.notes || '-'}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
