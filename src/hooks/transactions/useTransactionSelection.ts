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
        // Show each failed transaction with its error
        failed_transactions.forEach((f: { id: string; error: string }) => {
          toast.error(`Failed to revert transaction`, {
            description: f.error,
            duration: 5000,
          });
        });
      }

      clearSelection();
      setRevertDialogOpen(false);

      if (onRevertComplete) {
        onRevertComplete();
      }
    } catch (error: any) {
      console.error('Error reverting transactions:', error);

      // Extract error message from response
      let errorMessage = 'Failed to revert transactions';
      let hasShownSpecificErrors = false;

      if (error.response?.data) {
        if (error.response.data.failed_transactions) {
          // Show failed transactions from error response
          error.response.data.failed_transactions.forEach((f: { id: string; error: string }) => {
            toast.error(`Cannot revert transaction`, {
              description: f.error,
              duration: 5000,
            });
          });
          hasShownSpecificErrors = true;
        } else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      }

      // Only show generic error if we haven't shown specific ones
      if (!hasShownSpecificErrors) {
        toast.error(errorMessage);
      }

      // Close dialog and clear selection even on error
      clearSelection();
      setRevertDialogOpen(false);

      // Still call the reload callback
      if (onRevertComplete) {
        onRevertComplete();
      }
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
