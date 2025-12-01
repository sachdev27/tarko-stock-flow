# Transactions Page - Complete Feature Documentation

## Page Overview
**File**: `src/pages/TransactionsNew.tsx`
**Route**: `/transactions`
**Purpose**: View, filter, and manage all inventory transactions (Production, Sale, Cut, Adjustment, Bundling)

---

## 1. DATA STRUCTURES & INTERFACES

### TransactionRecord Interface
```typescript
interface TransactionRecord {
  // Core Transaction Fields
  id: string
  dispatch_id?: string
  transaction_type: 'PRODUCTION' | 'SALE' | 'ADJUSTMENT' | 'CUT'
  quantity_change: number // Total meters/quantity (not roll count)
  transaction_date: string
  invoice_no?: string
  notes?: string
  created_at: string

  // Batch Information
  batch_code: string
  batch_no: string
  initial_quantity: number // Number of rolls in batch
  production_date: string
  attachment_url?: string

  // Product Information
  product_type: string
  product_variant_id: string
  product_type_id: number
  brand_id: number
  brand: string
  parameters?: {
    OD?: string        // Outer Diameter
    PN?: string        // Pressure Nominal
    PE?: string        // Polyethylene Grade (HDPE)
    Type?: string      // Type A/B/C (Sprinkler)
    [key: string]: string | undefined
  }

  // Weight & Unit Information
  weight_per_meter?: number
  total_weight: number
  unit_abbreviation?: string

  // Roll-Specific Information
  roll_length_meters?: number
  roll_initial_length_meters?: number
  roll_is_cut?: boolean
  roll_type?: string
  roll_bundle_size?: number
  roll_weight?: number

  // Production Breakdown Counts
  standard_rolls_count?: number
  cut_rolls_count?: number
  bundles_count?: number
  spare_pieces_count?: number
  bundle_size?: number      // Pieces per bundle from batch
  piece_length?: number     // Length per piece (Sprinkler)

  // Average & Detail Arrays
  avg_standard_roll_length?: number
  cut_rolls_details?: number[]    // Individual cut roll lengths
  spare_pieces_details?: number[] // Individual spare piece counts

  // Customer Information (SALE transactions)
  customer_name?: string

  // User/Creator Information
  created_by_email?: string
  created_by_username?: string
  created_by_name?: string

  // Grouping Metadata (for dispatches)
  _isGrouped?: boolean
  _groupCount?: number
  _groupTransactions?: TransactionRecord[]

  // Roll Snapshot (stores complete roll state at transaction time)
  roll_snapshot?: {
    rolls?: Array<{
      roll_id: string
      batch_id: string
      batch_code?: string
      batch_no?: string
      product_type?: string
      brand?: string
      parameters?: Record<string, string>
      quantity_dispatched: number
      length_meters: number
      initial_length_meters: number
      is_cut_roll: boolean
      roll_type: string        // 'standard', 'spare', 'bundle_X'
      bundle_size?: number
      status: string
    }>
    total_rolls?: number
  }
}
```

---

## 2. STATE MANAGEMENT

### Data States
```typescript
- transactions: TransactionRecord[]           // All transactions from API
- filteredTransactions: TransactionRecord[]   // After applying filters
- isLoading: boolean                          // Loading state
- batchDetailsCache: Record<string, any>      // Cache for batch details
```

### Modal States
```typescript
- detailModalOpen: boolean                    // Transaction detail modal
- modalTransaction: TransactionRecord | null  // Selected transaction for modal
- customerModalOpen: boolean                  // Customer info modal
- selectedCustomer: any | null                // Customer details
```

### Revert/Delete Functionality States
```typescript
- selectedTransactionIds: Set<string>         // Selected for batch revert
- revertDialogOpen: boolean                   // Revert confirmation dialog
- reverting: boolean                          // Revert in progress
```

### Filter States
```typescript
// Basic Filters
- searchQuery: string                         // Search across multiple fields
- typeFilter: string                          // Transaction type filter
- productTypeFilter: string                   // Product type filter
- brandFilter: string                         // Brand filter
- parameterFilter: string                     // Generic parameter search

// Specific Parameter Filters
- odFilter: string                            // Outer Diameter filter
- pnFilter: string                            // Pressure Nominal filter
- peFilter: string                            // PE Grade filter (HDPE)
- typeParamFilter: string                     // Type A/B/C filter (Sprinkler)

// Time Filters
- timePreset: string                          // Preset time ranges
- startDate: string                           // Custom date range start
- endDate: string                             // Custom date range end
- showFilters: boolean                        // Show/hide filter panel
```

### Master Data for Filters
```typescript
- productTypes: Array<{id: number, name: string}>
- brands: Array<{id: number, name: string}>
- odOptions: string[]                         // Extracted from transactions
- pnOptions: string[]                         // Extracted from transactions
- peOptions: string[]                         // Extracted from transactions
- typeOptions: string[]                       // Extracted from transactions
```

### Pagination States
```typescript
- currentPage: number                         // Current page (default: 1)
- itemsPerPage: number                        // Items per page (default: 50)
```

---

## 3. CORE FEATURES

### 3.1 Transaction Display & Table

#### Table Columns (Desktop):
1. **Checkbox** - Multi-select for batch revert (admin only)
2. **Date** - Transaction date (formatted)
3. **Type** - Transaction type badge with color coding:
   - PRODUCTION (blue)
   - BUNDLED (purple) - Combined spare pieces
   - SALE (green)
   - CUT (orange)
   - CUT BUNDLE (amber)
   - ADJUSTMENT (gray)
4. **Product** - Product name with parameters
5. **Batch** - Batch code and number
6. **Quantity** - Amount with unit:
   - Meters for HDPE rolls
   - Pieces for Sprinkler bundles
   - Shows roll type (Standard/Cut/Bundle/Spare)
7. **Weight** - Total weight (kg/tons)
8. **Customer** - Customer name (SALE transactions only) - clickable to view details
9. **Invoice** - Invoice number (SALE transactions)
10. **Created By** - User who created transaction
11. **Actions** - View details button

#### Mobile View:
- Card-based layout
- Shows: Date, Type, Product, Batch, Quantity, Weight
- Collapsible details section
- Touch-optimized actions

#### Row Features:
- Click anywhere on row to open detail modal
- Hover effects
- Color-coded by transaction type
- Grouped dispatches shown with badge

---

### 3.2 Search & Filter System

#### Search Functionality
**Searches across:**
- Batch code
- Batch number
- Product type
- Brand
- Customer name
- Invoice number

**Search input:**
- Real-time filtering
- Case-insensitive
- Icon with search indicator

#### Transaction Type Filter
Options:
- All Types
- PRODUCTION - Regular production
- BUNDLED - Combined spare pieces into bundles
- SALE - Dispatches to customers
- CUT - Cut roll operations
- CUT BUNDLE - Cut bundle operations
- ADJUSTMENT - Inventory adjustments

**Special Handling:**
- BUNDLED: Filters for PRODUCTION + notes containing "Combined" + "spare"
- CUT BUNDLE: Filters for CUT + notes containing "Cut bundle"
- Excludes special types from regular PRODUCTION/CUT filters

#### Product Type Filter
- Dropdown with all product types from master data
- Dynamic - loads from backend
- "All Product Types" option

#### Brand Filter
- Dropdown with all brands from master data
- Dynamic - loads from backend
- "All Brands" option

#### Parameter Filters (Context-Sensitive)
**For HDPE Pipe:**
1. OD (Outer Diameter) - e.g., 16, 20, 25, 32
2. PN (Pressure Nominal) - e.g., 4, 6, 8, 10
3. PE (Polyethylene Grade) - e.g., PE80, PE100

**For Sprinkler Pipe:**
1. Type - e.g., A, B, C, L
2. PN (Pressure Nominal)
3. OD (Outer Diameter)

**Dynamic Behavior:**
- Only shown when specific product type selected
- Options extracted from actual transaction data
- Auto-populated on data load

#### Time Period Filters
**Presets:**
- All Time (default)
- Today
- Yesterday
- Last 7 Days
- Last 30 Days
- This Month
- Last Month
- Custom Range

**Custom Range:**
- Start Date picker
- End Date picker
- End date includes full day (23:59:59)

#### Filter UI Controls
- Show/Hide Filters button
- Active filters indicator
- Clear All Filters button (visible when filters active)
- Responsive grid layout (1-3 columns)
- Labels for each filter
- Select dropdowns with search capability

---

### 3.3 Transaction Detail Modal

#### Modal Header
- Transaction type badge
- Product name with full parameters
- Close button

#### Main Details Section
**Transaction Information:**
- Transaction Type (with special handling for BUNDLED/CUT BUNDLE)
- Transaction Date
- Product Type
- Brand
- Parameters (displayed as badges):
  - OD (blue)
  - PN (green)
  - PE (purple)
  - Type (orange)

**Quantity & Weight Display:**

**For SALE Transactions with roll_snapshot:**
- Grouped by batch if multiple batches
- Shows each batch header with:
  - Batch code badge
  - Product type, brand, parameters
  - Item count
- Per-roll breakdown:
  - Roll type badge (Standard/Cut/Bundle/Spare)
  - Quantity/Length
  - For bundles: piece count per bundle
  - For cut rolls: original length
- Total rolls count
- Total meters (HDPE only, not for Sprinkler)

**For PRODUCTION Transactions:**
- Quantity (meters or pieces)
- Original length (if cut roll)
- Batch total weight (highlighted in green)
- Bundle size (if applicable)
- Length per piece (Sprinkler only, if applicable)

**For CUT Transactions:**
- Original roll length
- Resulting pieces/cuts
- Weight information

#### Batch & Roll Information Section (PRODUCTION only)
**Shows:**
- Batch code (highlighted)
- Batch number
- Production breakdown with roll_snapshot if available:
  - Standard Rolls: Count + average length
  - Cut Rolls: Individual lengths in grid
  - Bundles: Count + pieces per bundle
  - Spare Pieces: Count + total pieces
- Weight per meter
- Production date
- Transaction date
- Attachment link (if available)

**Fallback (without roll_snapshot):**
- Standard rolls count + average length
- Total standard roll length
- Cut rolls details array (grid display)
- Spare pieces details array (grid display)
- Bundles count with calculations

#### Customer Information Section (SALE only)
- Customer name (large, prominent)
- Invoice number
- Clickable customer name opens customer details modal

#### Transaction Metadata Section
- Transaction ID
- Transaction Type badge
- Created By (name/username/email)
- Created At (formatted timestamp)
- Notes (if any)

#### Modal Footer
- Close button

---

### 3.4 Customer Details Modal

**Triggered by:** Clicking customer name in transaction details

**Displays:**
1. **Contact Information:**
   - Customer name (header)
   - Phone number (clickable tel: link)
   - Email (clickable mailto: link)
   - GSTIN (tax ID, monospace font)

2. **Location Details:**
   - City
   - State
   - Pincode (monospace)
   - Full street address

3. **Metadata:**
   - Customer created date

**Features:**
- Responsive grid layout
- Icons for each field type
- Clickable contact links
- Formatted dates
- Separator between sections

---

### 3.5 Batch Revert Functionality

**Purpose:** Revert transactions and restore inventory state

**Access:** Admin users only

#### Selection System
- Checkbox in table header (select/deselect all)
- Checkbox per transaction row
- Visual indication of selected rows
- Selection count in revert dialog

#### Revert Flow
1. **Selection:**
   - Click checkboxes for transactions to revert
   - Toggle select all for current page

2. **Initiate Revert:**
   - "Revert Selected" button appears when items selected
   - Shows count of selected transactions
   - Trash icon indicator

3. **Confirmation Dialog:**
   - Title: "Revert Transactions"
   - Count of transactions to revert
   - Warning box (amber) with:
     - "This will:" header
     - List of consequences:
       * Reverse inventory changes
       * Restore affected rolls and batches
       * Mark transactions as deleted
       * Create audit log entries
     - Warning: "⚠️ This action cannot be undone!"
   - Cancel button
   - Revert button (destructive red style)

4. **Processing:**
   - Disable buttons during revert
   - Show spinner
   - "Reverting..." text

5. **Result:**
   - Success toast with count reverted
   - Failed transactions list (if any)
   - Auto-reload transactions
   - Clear selection
   - Close dialog

#### API Endpoint
```typescript
POST /api/transactions/revert
Body: { transaction_ids: string[] }
Response: {
  reverted_count: number
  total_requested: number
  failed_transactions: Array<{
    id: string
    error: string
  }>
}
```

---

### 3.6 Summary Statistics

#### Total Production Weight Card
- **Location:** Top of page
- **Icon:** Weight/Scale icon
- **Title:** "Total Production Weight"
- **Description:** "Cumulative weight of all production transactions"
- **Display:** Large formatted weight (kg/tons)
- **Calculation:** Sum of total_weight from all PRODUCTION type transactions in current filtered view
- **Format Function:** Intelligent kg/ton conversion

---

### 3.7 Pagination

**Features:**
- 50 items per page (configurable)
- Page number display
- Previous/Next buttons
- First/Last page buttons
- Current page indicator
- Total pages calculation
- Disabled state for boundary pages
- Resets to page 1 when filters change

**Pagination Controls:**
- First page button (<< First)
- Previous page button (< Previous)
- Page indicator (Page X of Y)
- Next page button (Next >)
- Last page button (Last >>)

---

## 4. HELPER FUNCTIONS

### getProductCode(transaction)
- Generates short product code from transaction
- Used for compact display

### getProductName(transaction)
- Builds full product name with parameters
- Format: `Brand - Product Type [Param1: Value1, Param2: Value2]`
- Example: `Supreme - HDPE Pipe [OD: 32, PN: 10, PE: PE100]`

### formatWeight(grams, unitAbbreviation)
- Converts grams to human-readable format
- Returns: "0.00 kg" or "0.00 t" depending on size
- Intelligent unit selection (kg < 1000kg, tons >= 1000kg)
- Handles null/undefined gracefully

### getTotalProductionWeight()
- Sums total_weight from all PRODUCTION transactions
- Filters current filteredTransactions array
- Returns total in grams

### renderTransactionSummaryCards(transaction)
- Generates visual summary cards for transaction types
- Different layouts for PRODUCTION vs SALE vs CUT
- Shows quantities, weights, counts visually
- Color-coded by type

### fetchBatchDetails(batchIds, transaction)
- Fetches batch information for roll_snapshot rolls
- Caches results to avoid duplicate API calls
- Enriches transaction.roll_snapshot.rolls with batch data
- Updates batchDetailsCache state

### openDetailModal(transaction)
- Parses roll_snapshot if string
- Checks if batch details needed
- Fetches missing batch details
- Sets modalTransaction and opens dialog

### openCustomerModal(customerName)
- Fetches customer details from admin API
- Finds customer by name
- Opens customer modal with data

---

## 5. SPECIAL TRANSACTION TYPES

### 5.1 Regular PRODUCTION
- Creating new inventory
- Shows: batch info, roll breakdown, weights
- roll_snapshot contains original production state

### 5.2 BUNDLED (Combined Spares)
- Special PRODUCTION type
- Identified by: notes contains "Combined" + "spare"
- Created when loose spare pieces combined into bundles
- Shows: spare pieces combined, resulting bundles

### 5.3 SALE (Dispatch)
- Inventory leaving to customer
- Shows: customer info, invoice, dispatched rolls
- roll_snapshot contains exactly what was dispatched
- Grouped by batch if multiple batches
- Detail modal shows complete roll breakdown

### 5.4 CUT
- Cutting a roll into smaller pieces
- Shows: original roll, resulting pieces
- roll_snapshot contains cut pieces

### 5.5 CUT BUNDLE
- Special CUT type
- Identified by: notes contains "Cut bundle"
- Cutting bundles into pieces
- Shows: bundle cut details

### 5.6 ADJUSTMENT
- Manual inventory corrections
- Shows: adjustment reason, amount changed

---

## 6. DATA FLOW

### Load Sequence
1. Component mounts
2. `loadTransactions()` - Fetch all transactions
3. `loadMasterData()` - Fetch product types and brands
4. Parse transaction parameters
5. Extract unique parameter values for filters
6. Apply initial filters (none, shows all)

### Filter Flow
1. User changes any filter
2. `useEffect` with filter dependencies triggers
3. `applyFilters()` runs:
   - Clone transactions array
   - Apply search query filter
   - Apply transaction type filter
   - Apply product type filter
   - Apply brand filter
   - Apply parameter filters (OD, PN, PE, Type)
   - Apply time filter (preset or custom range)
4. Update filteredTransactions
5. Reset to page 1
6. Re-render table

### Detail Modal Flow
1. User clicks transaction row
2. `openDetailModal(transaction)` called
3. Parse roll_snapshot if needed
4. Check if batch details missing
5. Fetch batch details if needed
6. Update batchDetailsCache
7. Enrich roll_snapshot.rolls with batch data
8. Set modalTransaction
9. Open modal
10. Modal renders with all data

### Customer Modal Flow
1. User clicks customer name in detail modal
2. `openCustomerModal(customerName)` called
3. Fetch customer from admin API
4. Find customer by name match
5. Set selectedCustomer
6. Open customer modal
7. Modal renders customer details

### Revert Flow
1. Admin selects transactions via checkboxes
2. Clicks "Revert Selected" button
3. Confirmation dialog opens
4. Admin confirms
5. API call to revert endpoint
6. Backend processes:
   - Reverses inventory changes
   - Restores rolls/batches
   - Marks transactions as deleted
   - Creates audit logs
7. Response with results
8. Show success/error messages
9. Reload transactions
10. Clear selection
11. Close dialog

---

## 7. UI/UX FEATURES

### Responsive Design
- Desktop: Full table with all columns
- Mobile: Card-based layout with key info
- Touch-friendly interactions on mobile
- Adaptive grid layouts for filters

### Visual Indicators
- **Color-coded badges** for transaction types
- **Icons** for each section/field
- **Hover effects** on interactive elements
- **Loading states** with spinners
- **Empty states** with messages

### Accessibility
- Semantic HTML structure
- ARIA labels where needed
- Keyboard navigation support
- Focus management in modals
- Screen reader friendly

### Performance
- Pagination to limit rendered items
- Batch details caching
- Efficient filtering (client-side)
- Lazy loading of images/attachments
- Memoized calculations where applicable

---

## 8. API INTEGRATIONS

### Endpoints Used
```typescript
// Transaction APIs
transactionsAPI.getAll()           // Fetch all transactions
transactionsAPI.revert(ids)        // Revert multiple transactions

// Inventory APIs
inventoryAPI.getBatches()          // Fetch batch details

// Admin APIs
admin.getCustomers()               // Fetch customer list
admin.getProductTypes()            // Fetch product types
admin.getBrands()                  // Fetch brands
```

---

## 9. SPECIAL CONSIDERATIONS FOR MODULARIZATION

### Components to Extract
1. **TransactionTable** - Main table component
2. **TransactionRow** - Individual row (desktop)
3. **TransactionCard** - Mobile card view
4. **TransactionFilters** - Complete filter panel
5. **TransactionDetailModal** - Detail modal with all sections
6. **CustomerDetailModal** - Customer info modal
7. **RevertDialog** - Revert confirmation dialog
8. **BatchDetailsDisplay** - Batch info display component
9. **RollBreakdownDisplay** - Roll snapshot display component
10. **TransactionSummaryCards** - Visual summary cards
11. **PaginationControls** - Pagination UI
12. **TransactionTypeBadge** - Type badge component
13. **ParameterBadges** - Parameter display component

### Hooks to Create
1. **useTransactionFilters** - Filter state and logic
2. **useTransactionData** - Data fetching and caching
3. **useTransactionPagination** - Pagination logic
4. **useTransactionSelection** - Multi-select logic
5. **useBatchDetailsCache** - Batch caching logic

### Utilities to Extract
1. **transactionFormatters.ts** - All format functions
2. **transactionCalculations.ts** - Weight/total calculations
3. **transactionGrouping.ts** - Dispatch grouping logic
4. **transactionFiltering.ts** - Filter logic
5. **transactionConstants.ts** - Constants and configs

### State Management
Consider using:
- Context API for shared transaction state
- Zustand/Redux for complex state
- React Query for server state and caching

---

## 10. DEPENDENCIES

### Required npm packages
```json
{
  "date-fns": "format dates",
  "lucide-react": "icons",
  "sonner": "toast notifications",
  "@/components/ui/*": "shadcn components",
  "@/lib/api": "API client",
  "@/contexts/AuthContext": "user auth",
  "@/hooks/use-mobile": "responsive detection"
}
```

---

## 11. PERMISSION CONTROLS

### Admin-Only Features
- Batch revert functionality
- Checkboxes for multi-select
- Revert button
- Revert dialog

### All Users
- View transactions
- Filter transactions
- View details
- View customer info
- Download/view attachments

---

## 12. ERROR HANDLING

### Error Scenarios Handled
1. **API failures** - Show error toast, maintain state
2. **Missing data** - Graceful fallbacks (show '-' or hide section)
3. **Parse errors** - Try/catch on JSON parsing
4. **Network errors** - Retry capability implied by reload
5. **Revert failures** - Show failed transaction list

### User Feedback
- Success toasts for actions
- Error toasts with messages
- Loading spinners
- Disabled states during processing
- Empty state messages

---

## TOTAL LINE COUNT: ~2539 lines

This comprehensive documentation covers ALL features and functionality in the TransactionsNew.tsx page for modularization reference.
