import { TransactionRecord } from '@/types/transaction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { TransactionTypeBadge } from './TransactionTypeBadge';
import { ParameterBadges } from './ParameterBadges';
import { formatWeight, formatDateTime, getProductName } from '@/utils/transactions/formatters';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

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
              {getProductName(transaction)}
            </CardTitle>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            {formatDateTime(transaction.created_at)}
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
            <span className="text-muted-foreground">Rolls:</span>
            <span className="ml-2 font-medium">
              {transaction.total_rolls_count || transaction.roll_snapshot?.total_rolls || 0}
            </span>
          </div>
          {transaction.roll_length_meters && typeof transaction.roll_length_meters === 'number' && (
            <div>
              <span className="text-muted-foreground">Meters:</span>
              <span className="ml-2 font-medium">
                {transaction.roll_length_meters.toFixed(2)}
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
