// Transaction calculation utilities
import { TransactionRecord } from '@/types/transaction';

export const getTotalProductionWeight = (transactions: TransactionRecord[]): number => {
  return transactions
    .filter(t => t.transaction_type === 'PRODUCTION')
    .reduce((sum, t) => {
      const weight = Number(t.total_weight) || 0;
      return sum + weight;
    }, 0);
};

export const getTotalTransactionsByType = (
  transactions: TransactionRecord[],
  type: TransactionRecord['transaction_type']
): number => {
  return transactions.filter(t => t.transaction_type === type).length;
};

export const calculateTotalMeters = (transactions: TransactionRecord[]): number => {
  return transactions.reduce((sum, t) => {
    return sum + Math.abs(t.quantity_change || 0);
  }, 0);
};
