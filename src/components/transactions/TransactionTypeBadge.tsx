// Transaction type badge component
import { Badge } from '@/components/ui/badge';
import { TransactionRecord } from '@/types/transaction';

interface TransactionTypeBadgeProps {
  transaction: TransactionRecord;
}

export const TransactionTypeBadge = ({ transaction }: TransactionTypeBadgeProps) => {
  const getDisplayType = () => {
    // Handle new transaction types
    if (transaction.transaction_type === 'CUT_ROLL') {
      return 'CUT ROLL';
    }
    if (transaction.transaction_type === 'SPLIT_BUNDLE') {
      return 'SPLIT BUNDLE';
    }
    if (transaction.transaction_type === 'COMBINE_SPARES') {
      return 'COMBINE SPARES';
    }

    // Handle legacy notes-based detection
    if (
      transaction.transaction_type === 'PRODUCTION' &&
      transaction.notes?.includes('Combined') &&
      transaction.notes?.includes('spare')
    ) {
      return 'BUNDLED';
    }
    if (
      transaction.transaction_type === 'CUT' &&
      transaction.notes?.includes('Cut bundle')
    ) {
      return 'CUT BUNDLE';
    }
    return transaction.transaction_type;
  };

  const getVariant = () => {
    const type = getDisplayType();
    switch (type) {
      case 'PRODUCTION':
        return 'default' as const;
      case 'BUNDLED':
      case 'COMBINE SPARES':
        return 'secondary' as const;
      case 'SALE':
        return 'default' as const;
      case 'CUT':
      case 'CUT ROLL':
        return 'secondary' as const;
      case 'ADJUSTMENT':
        return 'outline' as const;
      default:
        return 'default' as const;
    }
  };

  const getColorClass = () => {
    const type = getDisplayType();
    switch (type) {
      case 'PRODUCTION':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'BUNDLED':
      case 'COMBINE SPARES':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
      case 'SALE':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'CUT':
      case 'CUT ROLL':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
      case 'SPLIT BUNDLE':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
      case 'ADJUSTMENT':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      default:
        return '';
    }
  };

  return (
    <Badge variant={getVariant()} className={getColorClass()}>
      {getDisplayType()}
    </Badge>
  );
};
