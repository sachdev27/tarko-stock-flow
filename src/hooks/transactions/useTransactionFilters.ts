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
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };

      // When time preset changes, populate start and end dates
      if (key === 'timePreset' && value !== 'all' && value !== '') {
        const now = new Date();
        const formatDateTime = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${year}-${month}-${day}T${hours}:${minutes}`;
        };

        if (value === 'today') {
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0);
          const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
          newFilters.startDate = formatDateTime(todayStart);
          newFilters.endDate = formatDateTime(todayEnd);
        } else if (value === '7days') {
          const sevenDaysAgo = new Date(now);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          sevenDaysAgo.setHours(0, 0, 0, 0);
          const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
          newFilters.startDate = formatDateTime(sevenDaysAgo);
          newFilters.endDate = formatDateTime(endDate);
        } else if (value === '30days') {
          const thirtyDaysAgo = new Date(now);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          thirtyDaysAgo.setHours(0, 0, 0, 0);
          const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
          newFilters.startDate = formatDateTime(thirtyDaysAgo);
          newFilters.endDate = formatDateTime(endDate);
        } else if (value === 'month') {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0);
          const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
          newFilters.startDate = formatDateTime(monthStart);
          newFilters.endDate = formatDateTime(endDate);
        } else if (value === 'lastmonth') {
          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0);
          const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59);
          newFilters.startDate = formatDateTime(lastMonthStart);
          newFilters.endDate = formatDateTime(lastMonthEnd);
        }
      }

      // When manually changing date range, clear time preset
      if ((key === 'startDate' || key === 'endDate') && prev.timePreset !== 'all') {
        newFilters.timePreset = 'all';
      }

      return newFilters;
    });
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
