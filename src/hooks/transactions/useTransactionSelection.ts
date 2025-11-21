// Custom hook for transaction selection (batch revert)
import { useState } from 'react';
import { TransactionRecord } from '@/types/transaction';
import { transactions as transactionsAPI } from '@/lib/api';
import { toast } from 'sonner';

export const useTransactionSelection = (onRevertComplete?: () => void) => {
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set());
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [reverting, setReverting] = useState(false);

  const toggleSelectTransaction = (id: string) => {
    const newSelected = new Set(selectedTransactionIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTransactionIds(newSelected);
  };

  const toggleSelectAll = (transactions: TransactionRecord[]) => {
    if (selectedTransactionIds.size === transactions.length) {
      setSelectedTransactionIds(new Set());
    } else {
      setSelectedTransactionIds(new Set(transactions.map(t => t.id)));
    }
  };

  const clearSelection = () => {
    setSelectedTransactionIds(new Set());
  };

  const handleRevertTransactions = async () => {
    if (selectedTransactionIds.size === 0) return;

    try {
      setReverting(true);
      const { data } = await transactionsAPI.revert(Array.from(selectedTransactionIds));

      const { reverted_count, total_requested, failed_transactions } = data;

      if (reverted_count > 0) {
        toast.success(`Successfully reverted ${reverted_count} transaction(s)`);
      }

      if (failed_transactions && failed_transactions.length > 0) {
        toast.error(`Failed to revert ${failed_transactions.length} transaction(s)`, {
          description: failed_transactions.map((f: { id: string; error: string }) => `${f.id}: ${f.error}`).join(', ')
        });
      }

      clearSelection();
      setRevertDialogOpen(false);

      if (onRevertComplete) {
        onRevertComplete();
      }
    } catch (error) {
      console.error('Error reverting transactions:', error);
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to revert transactions')
        : 'Failed to revert transactions';
      toast.error(errorMessage);
    } finally {
      setReverting(false);
    }
  };

  return {
    selectedTransactionIds,
    revertDialogOpen,
    reverting,
    setRevertDialogOpen,
    toggleSelectTransaction,
    toggleSelectAll,
    clearSelection,
    handleRevertTransactions,
  };
};
