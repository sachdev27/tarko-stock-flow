# Transactions Page - Modularization Guide

## Overview
The Transactions page has been modularized into reusable components, custom hooks, and utility functions for better maintainability and code reuse.

## Directory Structure

```
src/
├── types/
│   └── transaction.ts              # TypeScript interfaces
├── utils/transactions/
│   ├── formatters.ts               # Formatting utilities
│   ├── calculations.ts             # Calculation utilities
│   └── filtering.ts                # Filter logic
├── hooks/transactions/
│   ├── useTransactionData.ts       # Data fetching & caching
│   ├── useTransactionFilters.ts    # Filter state management
│   ├── useTransactionPagination.ts # Pagination logic
│   └── useTransactionSelection.ts  # Selection & revert logic
└── components/transactions/
    ├── index.ts                    # Barrel export
    ├── TransactionTypeBadge.tsx    # Type badge component
    ├── ParameterBadges.tsx         # Parameter badges
    └── PaginationControls.tsx      # Pagination UI
```

## Components Created

### 1. Type Definitions (`src/types/transaction.ts`)
- `TransactionRecord` - Main transaction interface
- `TransactionFilters` - Filter state interface
- `ProductType`, `Brand`, `Customer` - Supporting types

### 2. Utility Functions

#### `src/utils/transactions/formatters.ts`
- `getProductCode(transaction)` - Get product code
- `getProductName(transaction)` - Build full product name
- `formatWeight(kg, unitAbbreviation)` - Format weight (kg/tons)
- `formatDate(date)` - Format date
- `formatDateTime(date)` - Format date with time

#### `src/utils/transactions/calculations.ts`
- `getTotalProductionWeight(transactions)` - Sum production weights
- `getTotalTransactionsByType(transactions, type)` - Count by type
- `calculateTotalMeters(transactions)` - Calculate total meters

#### `src/utils/transactions/filtering.ts`
- `applyTransactionFilters(transactions, filters)` - Apply all filters
- `extractParameterOptions(transactions)` - Extract unique parameter values

### 3. Custom Hooks

#### `useTransactionData()`
Manages transaction data loading and caching.

**Returns:**
```typescript
{
  transactions: TransactionRecord[]
  productTypes: ProductType[]
  brands: Brand[]
  isLoading: boolean
  parameterOptions: {
    odOptions: string[]
    pnOptions: string[]
    peOptions: string[]
    typeOptions: string[]
  }
  reloadTransactions: () => Promise<void>
}
```

**Usage:**
```typescript
const { transactions, productTypes, brands, isLoading, reloadTransactions } = useTransactionData();
```

#### `useTransactionFilters(transactions)`
Manages filter state and applies filters to transactions.

**Parameters:**
- `transactions` - Array of transactions to filter

**Returns:**
```typescript
{
  filters: TransactionFilters
  filteredTransactions: TransactionRecord[]
  hasActiveFilters: boolean
  showFilters: boolean
  setShowFilters: (show: boolean) => void
  updateFilter: (key, value) => void
  clearFilters: () => void
}
```

**Usage:**
```typescript
const {
  filters,
  filteredTransactions,
  hasActiveFilters,
  updateFilter,
  clearFilters
} = useTransactionFilters(transactions);

// Update a filter
updateFilter('searchQuery', 'HDPE');
updateFilter('typeFilter', 'PRODUCTION');
```

#### `useTransactionPagination(transactions, itemsPerPage)`
Manages pagination logic.

**Parameters:**
- `transactions` - Array to paginate
- `itemsPerPage` - Items per page (default: 50)

**Returns:**
```typescript
{
  currentPage: number
  totalPages: number
  paginatedTransactions: TransactionRecord[]
  goToPage: (page: number) => void
  goToFirstPage: () => void
  goToLastPage: () => void
  goToNextPage: () => void
  goToPrevPage: () => void
  resetPagination: () => void
}
```

**Usage:**
```typescript
const {
  currentPage,
  totalPages,
  paginatedTransactions,
  goToNextPage,
  resetPagination
} = useTransactionPagination(filteredTransactions, 50);
```

#### `useTransactionSelection(onRevertComplete)`
Manages transaction selection for batch revert.

**Parameters:**
- `onRevertComplete` - Optional callback after revert

**Returns:**
```typescript
{
  selectedTransactionIds: Set<string>
  revertDialogOpen: boolean
  reverting: boolean
  setRevertDialogOpen: (open: boolean) => void
  toggleSelectTransaction: (id: string) => void
  toggleSelectAll: (transactions: TransactionRecord[]) => void
  clearSelection: () => void
  handleRevertTransactions: () => Promise<void>
}
```

**Usage:**
```typescript
const {
  selectedTransactionIds,
  toggleSelectTransaction,
  handleRevertTransactions
} = useTransactionSelection(() => {
  reloadTransactions();
});
```

### 4. UI Components

#### `<TransactionTypeBadge transaction={transaction} />`
Displays color-coded badge for transaction type.

**Props:**
- `transaction` - TransactionRecord

**Features:**
- Detects BUNDLED and CUT BUNDLE types
- Color-coded by type (Production=blue, Sale=green, etc.)
- Responsive styling

#### `<ParameterBadges parameters={parameters} />`
Displays parameter badges (OD, PN, PE, Type).

**Props:**
- `parameters` - Record<string, string>

**Features:**
- Shows OD, PN, PE, Type badges
- Color-coded (OD=blue, PN=green, PE=purple, Type=orange)
- Auto-hides if no parameters

#### `<PaginationControls {...props} />`
Pagination navigation UI.

**Props:**
```typescript
{
  currentPage: number
  totalPages: number
  onFirstPage: () => void
  onPrevPage: () => void
  onNextPage: () => void
  onLastPage: () => void
}
```

**Features:**
- First/Previous/Next/Last buttons
- Page indicator
- Disabled states
- Responsive (hides labels on mobile)

## Usage Example

Here's how to use the modularized components in a page:

```typescript
import { Layout } from '@/components/Layout';
import {
  useTransactionData,
  useTransactionFilters,
  useTransactionPagination,
  useTransactionSelection,
  TransactionTypeBadge,
  ParameterBadges,
  PaginationControls,
  formatWeight,
  getTotalProductionWeight,
} from '@/components/transactions';

export default function TransactionsPage() {
  // Load data
  const {
    transactions,
    productTypes,
    brands,
    isLoading,
    reloadTransactions
  } = useTransactionData();

  // Setup filters
  const {
    filters,
    filteredTransactions,
    hasActiveFilters,
    updateFilter,
    clearFilters,
  } = useTransactionFilters(transactions);

  // Setup pagination
  const {
    currentPage,
    totalPages,
    paginatedTransactions,
    goToNextPage,
    goToPrevPage,
    goToFirstPage,
    goToLastPage,
    resetPagination,
  } = useTransactionPagination(filteredTransactions, 50);

  // Setup selection (admin only)
  const {
    selectedTransactionIds,
    toggleSelectTransaction,
    handleRevertTransactions,
  } = useTransactionSelection(reloadTransactions);

  // Reset pagination when filters change
  useEffect(() => {
    resetPagination();
  }, [filteredTransactions.length]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Summary */}
        <div>
          <h2>Total Production Weight</h2>
          <p>{formatWeight(getTotalProductionWeight(filteredTransactions))}</p>
        </div>

        {/* Filters */}
        <div>
          <input
            value={filters.searchQuery}
            onChange={(e) => updateFilter('searchQuery', e.target.value)}
            placeholder="Search..."
          />
          {hasActiveFilters && (
            <button onClick={clearFilters}>Clear Filters</button>
          )}
        </div>

        {/* Table */}
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Product</th>
              <th>Parameters</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTransactions.map(transaction => (
              <tr key={transaction.id}>
                <td>
                  <TransactionTypeBadge transaction={transaction} />
                </td>
                <td>{transaction.product_type}</td>
                <td>
                  <ParameterBadges parameters={transaction.parameters} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          onFirstPage={goToFirstPage}
          onPrevPage={goToPrevPage}
          onNextPage={goToNextPage}
          onLastPage={goToLastPage}
        />
      </div>
    </Layout>
  );
}
```

## Benefits of Modularization

1. **Reusability** - Components and hooks can be used in other pages
2. **Testability** - Each module can be tested independently
3. **Maintainability** - Changes are localized to specific modules
4. **Type Safety** - Full TypeScript support throughout
5. **Performance** - Memoized calculations and efficient filtering
6. **Separation of Concerns** - Business logic separated from UI

## Next Steps

### Remaining Components to Create:
1. **TransactionFiltersPanel** - Complete filter UI panel
2. **TransactionTable** - Full table component with sorting
3. **TransactionDetailModal** - Detail modal with all sections
4. **CustomerDetailModal** - Customer information modal
5. **RevertDialog** - Revert confirmation dialog
6. **TransactionSummaryCard** - Production weight summary
7. **BatchDetailsDisplay** - Batch information display
8. **RollBreakdownDisplay** - Roll snapshot visualization

### Recommended Enhancements:
- Add React Query for better caching and refetching
- Implement virtual scrolling for large datasets
- Add export to CSV/Excel functionality
- Create a TransactionContext for global state
- Add unit tests for utilities and hooks

## Migration Guide

To migrate the existing `TransactionsNew.tsx` to use these modules:

1. Import the required hooks and components
2. Replace state management with custom hooks
3. Replace utility functions with imported ones
4. Replace inline components with modular components
5. Remove duplicated logic
6. Update imports and dependencies

The modularized approach reduces the main page from ~2539 lines to ~200-300 lines!
