import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useIsMobile } from '../hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Download, Undo2 } from 'lucide-react';
import {
  // Hooks
  useTransactionData,
  useTransactionFilters,
  useTransactionPagination,
  useTransactionSelection,
  // Components
  TransactionFilters,
  TransactionTable,
  TransactionCard,
  TransactionDetailModal,
  RevertDialog,
  PaginationControls,
  TransactionSummaryCards,
  // Types
  TransactionRecord,
  // Utils (if needed for export)
  formatWeight,
  getTotalProductionWeight,
} from '../components/transactions';

export default function TransactionsNew() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  // Modal states
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [modalTransaction, setModalTransaction] = useState<TransactionRecord | null>(null);

  // Load transaction data with custom hook
  const {
    transactions,
    productTypes,
    brands,
    isLoading,
    parameterOptions,
    reloadTransactions,
  } = useTransactionData();

  // Setup filters with custom hook
  const {
    filters,
    filteredTransactions,
    hasActiveFilters,
    showFilters,
    setShowFilters,
    updateFilter,
    clearFilters,
  } = useTransactionFilters(transactions);

  // Setup pagination with custom hook
  const {
    currentPage,
    totalPages,
    paginatedTransactions,
    goToPage,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPrevPage,
    resetPagination,
  } = useTransactionPagination(filteredTransactions, 50);

  // Setup selection (admin only) with custom hook
  const {
    selectedTransactionIds,
    revertDialogOpen,
    reverting,
    setRevertDialogOpen,
    toggleSelectTransaction,
    toggleSelectAll,
    clearSelection,
    handleRevertTransactions,
  } = useTransactionSelection(async () => {
    console.log('[TransactionsNew] onRevertComplete callback called - reloading transactions');
    await reloadTransactions();
    console.log('[TransactionsNew] Transactions reloaded after revert');
    clearSelection();
  });

  // Reset pagination when filters change
  useEffect(() => {
    resetPagination();
  }, [filteredTransactions.length]);

  // Handle row click to open detail modal
  const handleRowClick = (transaction: TransactionRecord) => {
    setModalTransaction(transaction);
    setDetailModalOpen(true);
  };

  // Export to CSV functionality
  const exportToCSV = () => {
    const headers = [
      'Date',
      'Type',
      'Product',
      'Brand',
      'Batch/Invoice',
      'Rolls',
      'Weight',
      'Meters',
      'Customer',
      'Notes',
    ];

    const rows = filteredTransactions.map((t) => [
      new Date(t.created_at).toLocaleDateString(),
      t.transaction_type,
      t.product_type,
      t.brand,
      t.batch_no || t.invoice_no || '',
      t.roll_snapshot?.total_rolls || 0,
      formatWeight(t.total_weight, t.unit_abbreviation),
      t.roll_length_meters?.toFixed(2) || '',
      t.customer_name || '',
      t.notes || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `activity_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading activity...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4 md:space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
            <p className="text-muted-foreground">
              View and manage all pipe activity
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={exportToCSV}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
            {user?.role === 'admin' && selectedTransactionIds.size > 0 && (
              <Button
                variant="destructive"
                onClick={() => setRevertDialogOpen(true)}
                className="flex items-center gap-2"
              >
                <Undo2 className="h-4 w-4" />
                Revert ({selectedTransactionIds.size})
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <TransactionSummaryCards
          transactions={filteredTransactions}
          onProductionClick={() => {
            updateFilter('typeFilter', 'PRODUCTION');
            setShowFilters(true);
          }}
        />

        {/* Main Content Card */}
        <Card>
          <CardHeader>
            <CardTitle>Activity History</CardTitle>
            <CardDescription>
              {filteredTransactions.length} activit
              {filteredTransactions.length !== 1 ? 'ies' : 'y'} found
              {hasActiveFilters && ' (filtered)'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <TransactionFilters
              filters={filters}
              onFilterChange={updateFilter}
              onClearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
              showFilters={showFilters}
              onToggleFilters={() => setShowFilters(!showFilters)}
              productTypes={productTypes}
              brands={brands}
              parameterOptions={parameterOptions}
            />

            {/* Desktop Table View */}
            {!isMobile ? (
              <TransactionTable
                transactions={paginatedTransactions}
                selectedIds={selectedTransactionIds}
                onSelectTransaction={toggleSelectTransaction}
                onSelectAll={() => toggleSelectAll(paginatedTransactions)}
                onRowClick={handleRowClick}
                showCheckboxes={user?.role === 'admin'}
                isAdmin={user?.role === 'admin'}
              />
            ) : (
              /* Mobile Card View */
              <div className="space-y-3">
                {paginatedTransactions.map((transaction) => (
                  <TransactionCard
                    key={transaction.id}
                    transaction={transaction}
                    selected={selectedTransactionIds.has(transaction.id)}
                    onSelect={toggleSelectTransaction}
                    onClick={handleRowClick}
                    showCheckbox={user?.role === 'admin'}
                    isAdmin={user?.role === 'admin'}
                  />
                ))}
                {paginatedTransactions.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    No transactions found
                  </div>
                )}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                onFirstPage={goToFirstPage}
                onPrevPage={goToPrevPage}
                onNextPage={goToNextPage}
                onLastPage={goToLastPage}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Modal */}
      <TransactionDetailModal
        transaction={modalTransaction}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
      />

      {/* Revert Dialog */}
      {user?.role === 'admin' && (
        <RevertDialog
          open={revertDialogOpen}
          onOpenChange={setRevertDialogOpen}
          onConfirm={handleRevertTransactions}
          selectedCount={selectedTransactionIds.size}
          isReverting={reverting}
        />
      )}
    </Layout>
  );
}
