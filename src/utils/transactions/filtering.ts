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
    filtered = filtered.filter(t => t.transaction_type === filters.typeFilter);
  }

  // Product type filter
  if (filters.productTypeFilter !== 'all') {
    filtered = filtered.filter(t => {
      // Direct match for single-product transactions
      if (t.product_variant_id?.toString() === filters.productTypeFilter ||
          t.product_type_id?.toString() === filters.productTypeFilter) {
        return true;
      }

      // For mixed dispatches/returns, check item_breakdown
      if ((t.product_type === 'Mixed' || t.product_type === 'Mixed Products') &&
          t.roll_snapshot?.item_breakdown &&
          Array.isArray(t.roll_snapshot.item_breakdown)) {
        return t.roll_snapshot.item_breakdown.some((item: any) =>
          item.product_variant_id?.toString() === filters.productTypeFilter ||
          item.product_type_id?.toString() === filters.productTypeFilter
        );
      }

      return false;
    });
  }

  // Brand filter
  if (filters.brandFilter !== 'all') {
    filtered = filtered.filter(t => {
      // Direct match for single-product transactions
      if (t.brand_id?.toString() === filters.brandFilter) {
        return true;
      }

      // For mixed dispatches/returns, check item_breakdown
      if ((t.product_type === 'Mixed' || t.product_type === 'Mixed Products') &&
          t.roll_snapshot?.item_breakdown &&
          Array.isArray(t.roll_snapshot.item_breakdown)) {
        return t.roll_snapshot.item_breakdown.some((item: any) =>
          item.brand_id?.toString() === filters.brandFilter
        );
      }

      return false;
    });
  }

  // Parameter filters
  if (filters.odFilter !== 'all') {
    filtered = filtered.filter(t => {
      if (t.parameters?.OD === filters.odFilter) return true;
      if ((t.product_type === 'Mixed' || t.product_type === 'Mixed Products') &&
          t.roll_snapshot?.item_breakdown) {
        return t.roll_snapshot.item_breakdown.some((item: any) =>
          item.parameters?.OD === filters.odFilter
        );
      }
      return false;
    });
  }
  if (filters.pnFilter !== 'all') {
    filtered = filtered.filter(t => {
      if (t.parameters?.PN === filters.pnFilter) return true;
      if ((t.product_type === 'Mixed' || t.product_type === 'Mixed Products') &&
          t.roll_snapshot?.item_breakdown) {
        return t.roll_snapshot.item_breakdown.some((item: any) =>
          item.parameters?.PN === filters.pnFilter
        );
      }
      return false;
    });
  }
  if (filters.peFilter !== 'all') {
    filtered = filtered.filter(t => {
      if (t.parameters?.PE === filters.peFilter) return true;
      if ((t.product_type === 'Mixed' || t.product_type === 'Mixed Products') &&
          t.roll_snapshot?.item_breakdown) {
        return t.roll_snapshot.item_breakdown.some((item: any) =>
          item.parameters?.PE === filters.peFilter
        );
      }
      return false;
    });
  }
  if (filters.typeParamFilter !== 'all') {
    filtered = filtered.filter(t => {
      if (t.parameters?.Type === filters.typeParamFilter) return true;
      if ((t.product_type === 'Mixed' || t.product_type === 'Mixed Products') &&
          t.roll_snapshot?.item_breakdown) {
        return t.roll_snapshot.item_breakdown.some((item: any) =>
          item.parameters?.Type === filters.typeParamFilter
        );
      }
      return false;
    });
  }

  // Time filter - either use preset or custom date range
  if (filters.timePreset && filters.timePreset !== 'all' && filters.timePreset !== '') {
    const now = new Date();
    if (filters.timePreset === 'today') {
      const todayStart = new Date(now.setHours(0, 0, 0, 0));
      filtered = filtered.filter(t => new Date(t.transaction_date) >= todayStart);
    } else if (filters.timePreset === '7days') {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      filtered = filtered.filter(t => new Date(t.transaction_date) >= sevenDaysAgo);
    } else if (filters.timePreset === '30days') {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      filtered = filtered.filter(t => new Date(t.transaction_date) >= thirtyDaysAgo);
    } else if (filters.timePreset === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = filtered.filter(t => new Date(t.transaction_date) >= monthStart);
    } else if (filters.timePreset === 'lastmonth') {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = filtered.filter(t => new Date(t.transaction_date) >= lastMonthStart && new Date(t.transaction_date) < lastMonthEnd);
    }
  } else {
    // Custom date range
    if (filters.startDate) {
      filtered = filtered.filter(t => new Date(t.transaction_date) >= new Date(filters.startDate));
    }
    if (filters.endDate) {
      filtered = filtered.filter(t => new Date(t.transaction_date) <= new Date(filters.endDate));
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
