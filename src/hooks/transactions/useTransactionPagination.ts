// Custom hook for transaction pagination
import { useState, useMemo, useEffect, useCallback } from 'react';
import { TransactionRecord } from '@/types/transaction';

export const useTransactionPagination = (transactions: TransactionRecord[], itemsPerPage: number = 50) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(transactions.length / itemsPerPage));

  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return transactions.slice(startIndex, endIndex);
  }, [transactions, currentPage, itemsPerPage]);

  const goToPage = (page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(validPage);
  };

  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToNextPage = () => {
    setCurrentPage(prev => {
      const nextPage = prev + 1;
      return nextPage <= totalPages ? nextPage : prev;
    });
  };
  const goToPrevPage = () => {
    setCurrentPage(prev => {
      const prevPage = prev - 1;
      return prevPage >= 1 ? prevPage : prev;
    });
  };

  const resetPagination = useCallback(() => {
    setCurrentPage(1);
  }, []);

  // Auto-adjust current page if it exceeds total pages
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return {
    currentPage,
    totalPages,
    paginatedTransactions,
    goToPage,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPrevPage,
    resetPagination,
  };
};
