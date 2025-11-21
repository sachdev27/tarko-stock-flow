// Transaction filtering utilities
import { TransactionRecord, TransactionFilters } from '@/types/transaction';

export const applyTransactionFilters = (
  transactions: TransactionRecord[],
  filters: TransactionFilters
): TransactionRecord[] => {
  let filtered = [...transactions];

  // Search filter
  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase();
    filtered = filtered.filter(t =>
      t.batch_code?.toLowerCase().includes(query) ||
      t.batch_no?.toLowerCase().includes(query) ||
      t.product_type?.toLowerCase().includes(query) ||
      t.brand?.toLowerCase().includes(query) ||
      t.customer_name?.toLowerCase().includes(query) ||
      t.invoice_no?.toLowerCase().includes(query)
    );
  }

  // Transaction type filter
  if (filters.typeFilter !== 'all') {
    filtered = filtered.filter(t => {
      if (filters.typeFilter === 'BUNDLED') {
        return t.transaction_type === 'PRODUCTION' &&
               t.notes?.includes('Combined') &&
               t.notes?.includes('spare');
      }
      if (filters.typeFilter === 'CUT BUNDLE') {
        return t.transaction_type === 'CUT' &&
               t.notes?.includes('Cut bundle');
      }
      if (filters.typeFilter === 'PRODUCTION') {
        return t.transaction_type === 'PRODUCTION' &&
               !(t.notes?.includes('Combined') && t.notes?.includes('spare'));
      }
      if (filters.typeFilter === 'CUT') {
        return t.transaction_type === 'CUT' &&
               !t.notes?.includes('Cut bundle');
      }
      return t.transaction_type === filters.typeFilter;
    });
  }

  // Product type filter
  if (filters.productTypeFilter !== 'all') {
    filtered = filtered.filter(t => t.product_type === filters.productTypeFilter);
  }

  // Brand filter
  if (filters.brandFilter !== 'all') {
    filtered = filtered.filter(t => t.brand === filters.brandFilter);
  }

  // Parameter filters
  if (filters.odFilter !== 'all') {
    filtered = filtered.filter(t => t.parameters?.OD === filters.odFilter);
  }
  if (filters.pnFilter !== 'all') {
    filtered = filtered.filter(t => t.parameters?.PN === filters.pnFilter);
  }
  if (filters.peFilter !== 'all') {
    filtered = filtered.filter(t => t.parameters?.PE === filters.peFilter);
  }
  if (filters.typeParamFilter !== 'all') {
    filtered = filtered.filter(t => t.parameters?.Type === filters.typeParamFilter);
  }

  // Time preset filter
  const now = new Date();
  if (filters.timePreset === 'today') {
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    filtered = filtered.filter(t => new Date(t.transaction_date) >= todayStart);
  } else if (filters.timePreset === 'yesterday') {
    const yesterdayStart = new Date(now.setHours(0, 0, 0, 0));
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);
    filtered = filtered.filter(t => new Date(t.transaction_date) >= yesterdayStart && new Date(t.transaction_date) < yesterdayEnd);
  } else if (filters.timePreset === 'last7days') {
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    filtered = filtered.filter(t => new Date(t.transaction_date) >= sevenDaysAgo);
  } else if (filters.timePreset === 'last30days') {
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    filtered = filtered.filter(t => new Date(t.transaction_date) >= thirtyDaysAgo);
  } else if (filters.timePreset === 'thisMonth') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    filtered = filtered.filter(t => new Date(t.transaction_date) >= monthStart);
  } else if (filters.timePreset === 'lastMonth') {
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    filtered = filtered.filter(t => new Date(t.transaction_date) >= lastMonthStart && new Date(t.transaction_date) < lastMonthEnd);
  } else if (filters.timePreset === 'custom') {
    if (filters.startDate) {
      filtered = filtered.filter(t => new Date(t.transaction_date) >= new Date(filters.startDate));
    }
    if (filters.endDate) {
      const endDateTime = new Date(filters.endDate);
      endDateTime.setHours(23, 59, 59, 999);
      filtered = filtered.filter(t => new Date(t.transaction_date) <= endDateTime);
    }
  }

  return filtered;
};

export const extractParameterOptions = (transactions: TransactionRecord[]) => {
  const ods = new Set<string>();
  const pns = new Set<string>();
  const pes = new Set<string>();
  const types = new Set<string>();

  transactions.forEach(t => {
    if (t.parameters) {
      if (t.parameters.OD) ods.add(t.parameters.OD);
      if (t.parameters.PN) pns.add(t.parameters.PN);
      if (t.parameters.PE) pes.add(t.parameters.PE);
      if (t.parameters.Type) types.add(t.parameters.Type);
    }
  });

  return {
    odOptions: Array.from(ods).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      return !isNaN(numA) && !isNaN(numB) ? numA - numB : a.localeCompare(b);
    }),
    pnOptions: Array.from(pns).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      return !isNaN(numA) && !isNaN(numB) ? numA - numB : a.localeCompare(b);
    }),
    peOptions: Array.from(pes).sort(),
    typeOptions: Array.from(types).sort(),
  };
};
