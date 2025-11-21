// Custom hook for transaction filters
import { useState, useMemo } from 'react';
import { TransactionRecord, TransactionFilters } from '@/types/transaction';
import { applyTransactionFilters } from '@/utils/transactions/filtering';

export const useTransactionFilters = (transactions: TransactionRecord[]) => {
  const [filters, setFilters] = useState<TransactionFilters>({
    searchQuery: '',
    typeFilter: 'all',
    productTypeFilter: 'all',
    brandFilter: 'all',
    parameterFilter: 'all',
    odFilter: 'all',
    pnFilter: 'all',
    peFilter: 'all',
    typeParamFilter: 'all',
    timePreset: 'all',
    startDate: '',
    endDate: '',
  });

  const [showFilters, setShowFilters] = useState(false);

  const filteredTransactions = useMemo(() => {
    return applyTransactionFilters(transactions, filters);
  }, [transactions, filters]);

  const hasActiveFilters = useMemo((): boolean => {
    return !!(filters.searchQuery ||
           filters.typeFilter !== 'all' ||
           filters.productTypeFilter !== 'all' ||
           filters.brandFilter !== 'all' ||
           filters.odFilter !== 'all' ||
           filters.pnFilter !== 'all' ||
           filters.peFilter !== 'all' ||
           filters.typeParamFilter !== 'all' ||
           filters.timePreset !== 'all');
  }, [filters]);

  const updateFilter = <K extends keyof TransactionFilters>(
    key: K,
    value: TransactionFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      searchQuery: '',
      typeFilter: 'all',
      productTypeFilter: 'all',
      brandFilter: 'all',
      parameterFilter: 'all',
      odFilter: 'all',
      pnFilter: 'all',
      peFilter: 'all',
      typeParamFilter: 'all',
      timePreset: 'all',
      startDate: '',
      endDate: '',
    });
  };

  return {
    filters,
    filteredTransactions,
    hasActiveFilters,
    showFilters,
    setShowFilters,
    updateFilter,
    clearFilters,
  };
};
