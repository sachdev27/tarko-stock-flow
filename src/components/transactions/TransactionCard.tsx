import { TransactionRecord } from '@/types/transaction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { TransactionTypeBadge } from './TransactionTypeBadge';
import { ParameterBadges } from './ParameterBadges';
import { formatWeight, formatDateTime, formatDate, getProductName } from '@/utils/transactions/formatters';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

// Helper functions for dispatch calculations
const calculateDispatchQuantity = (transaction: TransactionRecord): number => {
  if (!transaction.roll_snapshot?.item_breakdown || !Array.isArray(transaction.roll_snapshot.item_breakdown)) {
    return 0;
  }
  return transaction.roll_snapshot.item_breakdown.reduce((total: number, item: any) => {
    return total + (item.quantity || 0);
  }, 0);
};

const formatDispatchQuantityShort = (transaction: TransactionRecord): string => {
  if (!transaction.roll_snapshot?.item_breakdown || !Array.isArray(transaction.roll_snapshot.item_breakdown)) {
    return '0';
  }

  const counts: { [key: string]: number } = {};

  transaction.roll_snapshot.item_breakdown.forEach((item: any) => {
    const type = item.item_type;
    const qty = item.quantity || 0;
    counts[type] = (counts[type] || 0) + qty;
  });

  const parts: string[] = [];
  if (counts['FULL_ROLL']) parts.push(`${counts['FULL_ROLL']}R`);
  if (counts['CUT_PIECE']) parts.push(`${counts['CUT_PIECE']}C`);
  if (counts['BUNDLE']) parts.push(`${counts['BUNDLE']}B`);
  if (counts['SPARE_PIECES']) parts.push(`${counts['SPARE_PIECES']}SP`);

  return parts.length > 0 ? parts.join(' + ') : '0';
};

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

interface TransactionCardProps {
  transaction: TransactionRecord;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onClick?: (transaction: TransactionRecord) => void;
  showCheckbox?: boolean;
  isAdmin?: boolean;
}

export function TransactionCard({
  transaction,
  selected = false,
  onSelect,
  onClick,
  showCheckbox = false,
  isAdmin = false,
}: TransactionCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card
      className={`cursor-pointer transition-colors ${
        selected ? 'border-primary' : ''
      } hover:bg-muted/50`}
      onClick={() => onClick?.(transaction)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              {showCheckbox && isAdmin && (
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onSelect?.(transaction.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select transaction ${transaction.id}`}
                />
              )}
              <TransactionTypeBadge transaction={transaction} />
            </div>
            <CardTitle className="text-lg">
              {transaction.product_type === 'Mixed' || transaction.product_type === 'Mixed Products'
                ? 'Mixed'
                : (transaction.product_type && transaction.brand && transaction.product_type !== 'null' && transaction.brand !== 'null')
                ? getProductName(transaction)
                : transaction.transaction_type === 'DISPATCH'
                ? 'No Products'
                : getProductName(transaction)}
            </CardTitle>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            {transaction.transaction_type === 'DISPATCH'
              ? formatDateTime(transaction.created_at)
              : formatDateTime(transaction.transaction_date || transaction.created_at)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Key Info */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Weight:</span>
            <span className="ml-2 font-medium">
              {formatWeight(transaction.total_weight)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Quantity:</span>
            <span className="ml-2 font-medium">
              {transaction.transaction_type === 'DISPATCH'
                ? formatDispatchQuantityShort(transaction)
                : transaction.total_rolls_count || transaction.roll_snapshot?.total_rolls || 0}
            </span>
          </div>
          {((transaction.transaction_type === 'DISPATCH' && calculateDispatchMeters(transaction) > 0) ||
            (transaction.roll_length_meters && typeof transaction.roll_length_meters === 'number')) && (
            <div>
              <span className="text-muted-foreground">Meters:</span>
              <span className="ml-2 font-medium">
                {transaction.transaction_type === 'DISPATCH'
                  ? calculateDispatchMeters(transaction).toFixed(2)
                  : transaction.roll_length_meters!.toFixed(2)}
              </span>
            </div>
          )}
          {transaction.customer_name && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Customer:</span>
              <span className="ml-2 font-medium">{transaction.customer_name}</span>
            </div>
          )}
        </div>

        {/* Parameters */}
        {Object.keys(transaction.parameters).length > 0 && (
          <div>
            <ParameterBadges parameters={transaction.parameters} />
          </div>
        )}

        {/* Batch/Invoice */}
        {(transaction.batch_no || transaction.invoice_no) && (
          <div className="text-sm">
            <span className="text-muted-foreground">
              {transaction.batch_no ? 'Batch:' : 'Invoice:'}
            </span>
            <span className="ml-2">
              {transaction.batch_no || transaction.invoice_no}
            </span>
          </div>
        )}

        {/* Collapsible Details */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <span>More details</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            {transaction.brand && (
              <div className="text-sm">
                <span className="text-muted-foreground">Brand:</span>
                <Badge variant="outline" className="ml-2">
                  {transaction.brand}
                </Badge>
              </div>
            )}
            {transaction.notes && (
              <div className="text-sm">
                <span className="text-muted-foreground">Notes:</span>
                <p className="mt-1 text-foreground">{transaction.notes}</p>
              </div>
            )}
            {transaction.roll_snapshot?.rolls && transaction.roll_snapshot.rolls.length > 0 && (
              <div className="text-sm">
                <span className="text-muted-foreground">Roll Numbers:</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {transaction.roll_snapshot.rolls.map((roll, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {roll.roll_id}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {transaction.created_by_username && (
              <div className="text-sm">
                <span className="text-muted-foreground">Created by:</span>
                <span className="ml-2">{transaction.created_by_username}</span>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
