# Production Testing Workflow
## Complete Manual Testing Guide for Tarko Inventory System

This document provides a comprehensive step-by-step testing workflow to verify all major inventory operations are working correctly in production.

---

## Pre-Test Setup

### 1. Create Test Snapshot
**Purpose:** Create a backup before testing so you can rollback if needed

1. Navigate to **Admin → Version Control**
2. Click **Create Snapshot**
3. Name it: `Pre-Testing Snapshot - [Date]`
4. Description: `Backup before manual testing workflow`
5. Click **Create**
6. ✅ **Verify:** Snapshot appears in list with correct file count and size

---

## Test Workflow

### Phase 1: Production Entry (Batch Creation)

**Purpose:** Verify new inventory can be created

#### Test Case 1.1: Create HDPE Pipe Roll Batch
1. Navigate to **Production → New Batch**
2. Fill in details:
   - **Product Type:** HDPE Pipe (System Product Type)
   - **Brand:** Select any brand (e.g., Jindal)
   - **Parameters:**
     - PE: 80 or 100
     - PN: 6, 10, or 16
     - OD: 20mm, 25mm, 32mm, etc.
   - **Batch Number:** TEST-HDPE-001
   - **Roll Configuration:** Standard Rolls
   - **Roll Length:** 500m or 300m
   - **Number of Rolls:** 5
   - **Weight per Meter:** 0.2 kg/m
   - **Total Weight:** Auto-calculated based on length × weight/m
3. Click **Create Batch**

**Verify P&C:**
- ✅ Batch created successfully
- ✅ Navigate to **Inventory → Stock**
- ✅ Filter by batch `TEST-HDPE-001`
- ✅ **Count Check:** Exactly 5 rolls visible
- ✅ **Stock Type:** Shows "FULL_ROLL" for each roll
- ✅ **Length Check:** Each roll shows 500m or 300m (length_per_unit)
- ✅ **Weight per Meter Check:** weight_per_meter = 0.2 kg/m
- ✅ **Total Roll Weight:** Calculated as 500m × 0.2 kg/m = 100 kg per roll
- ✅ **Status Check:** All rolls show "IN_STOCK" (uppercase)
#### Test Case 1.2: Create Sprinkler Pipe Bundle Batch
1. Navigate to **Production → New Batch**
2. Fill in details:
   - **Product Type:** Sprinkler Pipe (System Product Type)
   - **Brand:** Select brand
   - **Parameters:**
     - OD: 12mm, 16mm, or 20mm
     - PN: 4, 6, or 10
     - Type: Lateral, Sub-main, or Main line
   - **Batch Number:** TEST-SPR-001
   - **Roll Configuration:** Bundles (quantity-based)
   - **Piece Length:** 6m (piece_length_meters)
   - **Weight per Meter:** 0.33 kg/m
   - **Number of Bundles:** 3
   - **Bundle Size:** 20 pieces per bundle
3. Click **Create Batch**

**Verify P&C:**
- ✅ Batch created successfully
- ✅ Navigate to **Inventory → Stock**
- ✅ Filter by batch `TEST-SPR-001`
- ✅ **Count Check:** Exactly 3 bundles visible
- ✅ **Stock Type:** Shows "BUNDLE" for each bundle
- ✅ **Pieces Check:** Each bundle shows bundle_size (10 or 20 pieces_per_bundle)
- ✅ **Piece Length Check:** piece_length_meters shows 6m
- ✅ **Weight per Meter Check:** weight_per_meter = 0.33 kg/m
- ✅ **Weight per Piece:** Calculated as 6m × 0.33 kg/m = 2 kg
- ✅ **Status Check:** All bundles show "IN_STOCK" (uppercase)
- ✅ **Unit:** Pieces (pcs) - from system unit
- ✅ **Total Pieces:** 3 bundles × bundle_size ( 20 ) (e.g., 3 × 20 = 60 pieces)
- ✅ **Total Weight:** 60 pieces × 2 kg = 120 kg
- ✅ **Parameters Saved:** OD, PN, Type values stored in parameters JSONB column

---

### Phase 2: Dispatch Operations

**Purpose:** Verify inventory can be dispatched to customers

#### Test Case 2.1: Dispatch Full Rolls (HDPE)
1. Navigate to **Dispatch → Create Dispatch**
2. Fill in details:
   - **Customer:** Select test customer
   - **Dispatch Date:** Today
   - **Transport:** Select transport
   - **Vehicle:** Select vehicle
3. Click **Add Items**
4. Add items:
   - Select 2 rolls from batch `TEST-HDPE-001`
   - Quantity: 2 rolls
5. Complete dispatch

**Verify P&C:**
- ✅ Dispatch created with status "DISPATCHED" (uppercase)
- ✅ Navigate to **Inventory → Stock**
- ✅ Filter by batch `TEST-HDPE-001`
- ✅ **Count Check:** Only 3 rolls remain (was 5, dispatched 2)
- ✅ **Status Check:** 2 rolls show "DISPATCHED" status in inventory_stock table
- ✅ **Remaining Stock:** 3 rolls with "IN_STOCK" status
- ✅ **Weight Check:** Remaining weight = 3 × 100 kg = 300 kg
#### Test Case 2.2: Dispatch Full Bundles (Sprinkler)
1. Navigate to **Dispatch → Create Dispatch**
2. Add 1 bundle from batch `TEST-SPR-001`
3. Complete dispatch

**Verify P&C:**
- ✅ Dispatch created successfully
- ✅ **Count Check:** 2 bundles remain (was 3, dispatched 1)
- ✅ **Stock Type:** Dispatched item shows item_type = 'BUNDLE'
- ✅ **Pieces Check:** If bundle_size = 20, then:
  - Dispatched: 1 bundle × 20 pieces = 20 pieces
  - Remaining: 2 bundles × 20 pieces = 40 pieces
- ✅ **Weight Check:** Remaining = 40 pieces × 2 kg = 80 kg
- ✅ Dispatch record shows bundle with correct piece count and weight
- ✅ **Piece Length:** Shows 6m piece_length_meters in dispatch_items
- ✅ Dispatch created successfully
- ✅ **Count Check:** 2 bundles remain (was 3, dispatched 1)
- ✅ **Pieces Check:** Remaining = 2 bundles × 50 pieces = 100 pieces
#### Test Case 3.1: Cut HDPE Pipe Roll
1. Navigate to **Inventory → Stock**
2. Find one of the remaining rolls from `TEST-HDPE-001` (should be 500m full roll)
3. Click **Actions → Cut Roll**
4. Enter cut details:
   - **Number of Cut Pieces:** 4
   - **Length per Piece:** 100 meters
   - System auto-calculates weight: 100m × 0.2 kg/m = 20 kg per piece
5. Click **Confirm Cut**

**Verify P&C:**
- ✅ Cut operation successful
- ✅ **Original Roll:** Status changed or deleted_at set (soft delete)
- ✅ **Original Stock Type:** Was 'FULL_ROLL', now being replaced
- ✅ **New Stock Entry:** Created with stock_type = 'CUT_ROLL'
- ✅ **New Cut Pieces:** 4 pieces created in `hdpe_cut_pieces` table
- ✅ **Each Piece Shows:**
  - length_meters: 100m
  - weight_grams: 20000 (20 kg × 1000)
  - Source batch: `TEST-HDPE-001`
  - status: "IN_STOCK" (uppercase)
  - created_by_transaction_id: Points to CUT_ROLL transaction
  - original_stock_id: References original full roll stock_id
  - version: 1 (for optimistic locking)
  - stock_id: Points to new CUT_ROLL stock entry
- ✅ **Total Length Check:** 4 pieces × 100m = 400m ≤ original roll (500m)
- ✅ **Total Weight Preserved:** 4 pieces × 20 kg = 80 kg (matches 400m × 0.2 kg/m)
- ✅ Navigate to **Inventory → Stock** and filter stock_type = 'CUT_ROLL'
- ✅ **Cut Roll Stock Visible:** Shows quantity = 4 (number of cut pieces)
- ✅ **Transaction Check:** inventory_transactions shows transaction_type = 'CUT_ROLL'
  - Weight: 20 kg (weight_grams = 20000)
#### Test Case 3.2: Dispatch Cut Pieces
1. Navigate to **Dispatch → Create Dispatch**
2. Add cut pieces:
   - Select 2 of the 4 cut pieces created above (100m each)
3. Complete dispatch

**Verify P&C:**
- ✅ Dispatch includes cut pieces
- ✅ **Item Type:** Shows item_type = 'CUT_ROLL' or 'CUT_PIECE'
- ✅ **Remaining Cut Pieces:** 2 pieces (was 4, dispatched 2)
- ✅ **hdpe_cut_pieces table:** 2 pieces have status = 'DISPATCHED'
- ✅ **Length Dispatched:** 2 × 100m = 200m
- ✅ **Weight Dispatched:** 2 × 20 kg = 40 kg
- ✅ **CUT_ROLL Stock:** quantity reduced from 4 to 2
- ✅ Dispatch record shows cut pieces with length_meters and weight
2. Add cut pieces:
   - Select 2 of the 4 cut pieces created above
3. Complete dispatch
#### Test Case 4.1: Split Sprinkler Pipe Bundle
1. Navigate to **Inventory → Stock**
2. Find one bundle from `TEST-SPR-001` (should have bundle_size = 20 pieces)
3. Click **Actions → Split Bundle**
4. Confirm split operation

**Verify P&C:**
- ✅ Split operation successful
- ✅ **Original Bundle:** Status changed or deleted_at set (soft delete)
- ✅ **Original Stock Type:** Was 'BUNDLE', now being replaced
- ✅ **New Stock Entry:** Created with stock_type = 'SPARE'
- ✅ **Individual Pieces Created:** 20 spare pieces in `sprinkler_spare_pieces` table
- ✅ **Each Spare Piece Shows:**
  - piece_count: 1 (one record per piece)
  - piece_length_meters: 6m (from bundle configuration)
  - weight_grams: 2000 (6m × 0.33 kg/m = 2 kg, stored as 2000 grams)
  - Source batch: `TEST-SPR-001`
  - status: "IN_STOCK" (uppercase)
  - created_by_transaction_id: Points to SPLIT_BUNDLE transaction
  - original_stock_id: References original bundle stock_id
  - stock_id: Points to new SPARE stock entry
  - version: 1 (initial version for optimistic locking)
#### Test Case 4.2: Dispatch Spare Pieces
1. Navigate to **Dispatch → Create Dispatch**
2. Add spare pieces:
   - Select 10 spare pieces from the split bundle (out of 20)
3. Complete dispatch

**Verify P&C:**
- ✅ Dispatch successful
- ✅ **Item Type:** Shows item_type = 'SPARE_PIECES'
- ✅ **Remaining Spare Pieces:** 10 pieces (was 20, dispatched 10)
- ✅ **sprinkler_spare_pieces table:** 10 pieces have status = 'DISPATCHED'
- ✅ **SPARE Stock:** quantity reduced from 20 to 10
- ✅ **Weight Dispatched:** 10 pieces × 2 kg = 20 kg
- ✅ **Piece Length:** Shows 6m piece_length_meters in dispatch_items
- ✅ Dispatch shows 10 spare pieces with correct weight and length
  - Status: "IN_STOCK" (uppercase)
  - created_by_transaction_id: Points to SPLIT_BUNDLE transaction
  - original_stock_id: References original bundle
#### Test Case 5.1: Combine Spare Pieces into Bundle
1. Navigate to **Inventory → Stock**
2. Filter by stock_type = 'SPARE' and batch `TEST-SPR-001`
3. Click **Actions → Combine Spares** on the SPARE stock
4. Enter number of pieces to combine (e.g., 10 pieces out of 10 remaining)
5. Confirm combination

**Verify P&C:**
- ✅ Combine operation successful
- ✅ **sprinkler_spare_pieces table:** 10 pieces have:
  - status: 'SOLD_OUT' (indicates combined)
  - deleted_at: timestamp set (soft delete)
  - deleted_by_transaction_id: Points to COMBINE_SPARES transaction
  - last_modified_by_transaction_id: Updated to COMBINE_SPARES transaction
  - version: Incremented
- ✅ **SPARE Stock:** quantity reduced from 10 to 0 (all pieces combined)
- ✅ **New Bundle Created:** 1 bundle in inventory_stock with:
  - stock_type: 'BUNDLE'
  - quantity: 1 (one bundle)
  - pieces_per_bundle: 10 (number of pieces combined)
  - piece_length_meters: 6m (preserved from spare pieces)
  - weight_per_meter: 0.33 kg/m (preserved)
  - weight_per_piece: 2 kg (auto-calculated: 6m × 0.33 kg/m)
  - Total bundle weight: 10 pieces × 2 kg = 20 kg
  - Source batch: `TEST-SPR-001`
  - status: 'IN_STOCK'
  - parent_stock_id: References the original SPARE stock
- ✅ Navigate to **Inventory → Stock**
- ✅ New combined bundle appears with stock_type = 'BUNDLE'
- ✅ **Transaction Check:** inventory_transactions shows transaction_type = 'COMBINE_SPARES'

#### Test Case 5.1: Combine Spare Pieces into Bundle
1. Navigate to **Inventory → Spare Pieces (Sprinkler)**
2. Filter by batch `TEST-SPR-001`
3. Select multiple spare pieces (e.g., 20 pieces)
4. Click **Actions → Combine into Bundle**
5. Confirm combination

**Verify P&C:**
- ✅ Combine operation successful
- ✅ **Spare Pieces Reduced:** 40 - 20 = 20 spare pieces remain
- ✅ **Spare Pieces Soft Deleted:** 20 pieces have deleted_at timestamp set
- ✅ **Spare Pieces Transaction Link:** deleted_by_transaction_id points to COMBINE_SPARES transaction
- ✅ **New Bundle Created:** 1 bundle with 20 pieces in inventory_stock
- ✅ **Bundle Details:**
  - stock_type: 'BUNDLE'
  - quantity: 20 (pieces in bundle)
  - Weight per piece: 2 kg
  - Total bundle weight: 40 kg (weight_kg column)
  - Source batch: `TEST-SPR-001`
  - Status: 'IN_STOCK'
- ✅ Navigate to **Inventory → Stock**
- ✅ New combined bundle appears in stock list
- ✅ **Transaction Check:** inventory_transactions shows transaction_type = 'COMBINE_SPARES'

---

### Phase 6: Return Operations

**Purpose:** Verify dispatched items can be returned

#### Test Case 6.1: Create Return for Dispatched Rolls
1. Navigate to **Returns → Create Return**
2. Fill in details:
   - **Customer:** Select customer from Test Case 2.1
   - **Return Date:** Today
   - **Return Type:** Full Return
3. Add return items:
   - Select the dispatch from Test Case 2.1 (2 HDPE rolls)
   - Return quantity: 2 rolls (full return)
   - **Condition:** Good / Damaged (test both scenarios)
4. Complete return

**Verify P&C (Good Condition Return):**
- ✅ Return created successfully in `returns` table
- ✅ **Return Status:** 'RECEIVED' or 'RESTOCKED' (check status enum)
- ✅ Navigate to **Inventory → Stock**
- ✅ **Count Check:** Stock increases by 2 rolls
- ✅ **Status Check:** Returned rolls back to "IN_STOCK"
- ✅ **Weight Check:** Total weight restored (weight_kg column)
- ✅ Navigate to **Returns → History**
- ✅ Return record shows 2 rolls, 200 kg
- ✅ **Return Items Created:** Check `return_items` table has 2 entries
- ✅ **Return Rolls Created:** Check `return_rolls` table for roll-specific data (length_meters)
- ✅ **Transaction Check:** inventory_transactions shows transaction_type = 'RETURN'

**Verify P&C (Damaged Return):**
- If marked as damaged:
  - ✅ Rolls marked as damaged/defective
  - ✅ May require separate handling (check scrap flow)

#### Test Case 6.2: Partial Return of Sprinkler Pieces
1. Navigate to **Returns → Create Return**
2. Select dispatch from Test Case 2.2 (50 pieces bundle)
3. Return only 25 pieces (partial return)
4. Complete return

**Verify P&C:**
- ✅ Return successful
- ✅ **Returned Pieces:** 25 pieces back in stock
- ✅ **Dispatched Remaining:** 25 pieces still show as dispatched
- ✅ **Weight Calculation:** 25 × 2 kg = 50 kg returned
- ✅ Return record shows partial return correctly

---

### Phase 7: Revert Operations

**Purpose:** Verify dispatches can be reverted (undo dispatch)

#### Test Case 7.1: Revert a Dispatch
1. Navigate to **Dispatch → History**
2. Find a recent dispatch (e.g., cut pieces dispatch from Test Case 3.2)
3. Click **Actions → Revert Dispatch**
4. Confirm revert with reason: "Testing revert functionality"

**Verify P&C:**
- ✅ Revert successful
- ✅ **Dispatch Status:** Changed to "REVERTED" (uppercase in schema)
- ✅ **Dispatch Timestamps:**
  - reverted_at: Set to current timestamp
  - reverted_by: User UUID who performed revert
  - revert_reason: Reason text recorded
- ✅ **Inventory Restored:**
  - Items returned to stock
  - Status changed back to "IN_STOCK"
  - deleted_at reset to NULL (if was soft deleted)
- ✅ **Quantity Check:** Stock count matches pre-dispatch numbers
- ✅ **Weight Check:** Total weight restored correctly
- ✅ **Transaction Log:** Check inventory_transactions table
  - ✅ Original DISPATCH transaction visible
  - ✅ Revert transaction with reverted_at timestamp set
  - ✅ reverted_by column shows user who reverted
  - ✅ Both transactions linked via dispatch_id
- ✅ **Audit Trail:** Check audit_logs table for revert action---

### Phase 8: Scrap Operations

**Purpose:** Verify damaged/waste items can be scrapped

#### Test Case 8.1: Create Scrap Record for Damaged Items
1. Navigate to **Scrap → Create Scrap**
2. Fill in details:
   - **Scrap Type:** Damaged / Waste / Defective
   - **Scrap Date:** Today
   - **Reason:** "Testing - Quality issue"
3. Add items to scrap:
   - Select 1 roll from `TEST-HDPE-001` (one of the remaining in-stock rolls)
   - Add some spare pieces from split bundle
4. Complete scrap

**Verify P&C:**
- ✅ Scrap record created in `scraps` table
- ✅ **Scrap Status:** 'SCRAPPED' (from schema enum: SCRAPPED, DISPOSED, CANCELLED)
- ✅ Navigate to **Inventory → Stock**
- ✅ **Status Check:** Scrapped items show "SCRAPPED" status or deleted_at set
- ✅ **Stock Count:** Reduced by scrapped quantity
- ✅ **Available Stock:** Excludes scrapped items (WHERE deleted_at IS NULL)
- ✅ Navigate to **Scrap → History**
- ✅ **Scrap Record:** Shows all scrapped items with weights
#### Test Case 9.1: End-to-End Workflow (HDPE Pipe)
1. **Create:** New batch of 10 HDPE Pipe rolls, 500m each (TEST-COMPLEX-001)
2. **Dispatch:** 5 full rolls to Customer A
3. **Cut:** 2 of remaining 5 rolls into 4 pieces each (100m per piece)
4. **Dispatch:** 4 cut pieces (from 1 cut roll) to Customer B
5. **Return:** Customer A returns 2 full rolls (damaged)
6. **Scrap:** The 2 damaged returned rolls
7. **Revert:** Customer B dispatch (wrong order)
8. **Re-dispatch:** Cut pieces to correct customer

**Verify P&C After Each Step:**
- ✅ After Create: 10 FULL_ROLL, 500m each = 5000m total, weight = 5000m × 0.2 kg/m = 1000 kg
- ✅ After Dispatch 1: 5 FULL_ROLL in stock, 5 DISPATCHED
- ✅ After Cut: 3 FULL_ROLL + 2 CUT_ROLL stocks (8 pieces total: 4 pieces each roll)
- ✅ After Dispatch 2: 1 CUT_ROLL stock has 4 pieces dispatched, 1 CUT_ROLL has 4 pieces in stock
- ✅ After Return: 2 FULL_ROLL back with status IN_STOCK (if good) or marked for scrap (if damaged)
- ✅ After Scrap: 2 rolls in scraps table with scrap_items records, removed from available stock
- ✅ After Revert: 4 cut pieces back to IN_STOCK status in hdpe_cut_pieces
- ✅ After Re-dispatch: New dispatch created with correct cut pieces
- ✅ **Final Stock Verification:**
  - 3 FULL_ROLL in stock (500m each = 1500m)
  - 1 CUT_ROLL with 4 pieces in stock (400m total)
  - 2 FULL_ROLL scrapped
  - 5 FULL_ROLL dispatched - 2 returned + 2 scrapped = 3 net dispatched
  - 4 cut pieces dispatched to correct customer
  - **Total Accounting:** 10 original rolls = 3 in stock + 3 dispatched + 2 scrapped + 2 cut (8 pieces, 4 in stock + 4 dispatched)os

#### Test Case 9.1: End-to-End Workflow
1. **Create:** New batch of 10 HDPE rolls (TEST-COMPLEX-001)
2. **Dispatch:** 5 rolls to Customer A
3. **Cut:** 2 of remaining 5 rolls into pieces
4. **Dispatch:** Some cut pieces to Customer B
5. **Return:** Customer A returns 2 rolls (damaged)
6. **Scrap:** The 2 damaged returned rolls
7. **Revert:** Customer B dispatch (wrong order)
8. **Re-dispatch:** Cut pieces to correct customer

**Verify P&C After Each Step:**
- ✅ After Create: 10 rolls, 1000 kg total
- ✅ After Dispatch 1: 5 rolls in stock, 5 dispatched
- ✅ After Cut: 3 full rolls + cut pieces from 2 rolls
- ✅ After Dispatch 2: Cut pieces reduced
- ✅ After Return: 2 rolls back (marked damaged)
- ✅ After Scrap: 2 damaged rolls scrapped, removed from available stock
- ✅ After Revert: Cut pieces back in stock
- ✅ After Re-dispatch: Correct quantities with new dispatch
- ✅ **Final Stock Verification:**
  - 3 full rolls in stock
  - Remaining cut pieces (if any)
  - 2 rolls scrapped
  - 5 rolls originally dispatched - 2 returned = 3 still dispatched
  - Total accounting: All pieces accounted for

---

### Phase 10: Reports & Data Integrity

**Purpose:** Verify all reports show correct data

#### Test Case 10.1: Stock Report Verification
1. Navigate to **Reports → Stock Report**
2. Generate report for all test batches

**Verify P&C:**
- ✅ **Current Stock:** Shows only in_stock items
- ✅ **Dispatched Items:** Shows all dispatched (not reverted)
- ✅ **Returned Items:** Shows returns separately
- ✅ **Scrapped Items:** Shows in scrap section
- ✅ **Total Weight Reconciliation:**
  ```
  Created Weight =
    Current Stock +
    Dispatched (not returned/reverted) +
    Scrapped +
    Returned
  ```
- ✅ No missing or duplicate items

#### Test Case 10.2: Dispatch Report
1. Navigate to **Reports → Dispatch Report**
2. Filter by date range covering test period

**Verify P&C:**
- ✅ All dispatches listed (including reverted ones marked as such)
- ✅ Total quantities match
- ✅ Total weights match
- ✅ Customer-wise breakdown correct
- ✅ Reverted dispatches clearly marked

#### Test Case 10.3: Transaction History
1. Navigate to **Inventory → Transactions**
2. Filter by test batches

**Verify P&C:**
- ✅ Every operation recorded with correct transaction_type:
  - 'PRODUCTION' - Batch creation
  - 'DISPATCH' - Dispatch out (check reverted_at for reverts)
  - 'RETURN' - Return in
  - 'CUT_ROLL' - Cut HDPE roll into pieces
  - 'SPLIT_BUNDLE' - Split bundle into spare pieces
  - 'COMBINE_SPARES' - Combine spare pieces into bundle
  - 'DAMAGE' - Scrap/damage items
  - 'ADJUSTMENT' - Manual adjustments
- ✅ Each transaction has:
  - transaction_type (ENUM from schema)
  - inventory_stock_id (if applicable)
  - dispatch_id (for dispatch-related transactions)
  - created_at timestamp
  - description text
- ✅ Running balance correct after each transaction
- ✅ No gaps in transaction IDs (UUID based)
- ✅ Timestamps in correct order (created_at)

---

### Phase 11: Database Integrity Checks

**Purpose:** Verify database constraints and data consistency

#### Test Case 11.1: Check Inventory Transactions
Run these SQL queries (via Admin → Database or backend):

```sql
-- 1. Check for orphaned transactions (referencing non-existent stock)
SELECT it.*
FROM inventory_transactions it
LEFT JOIN inventory_stock ist ON it.inventory_stock_id = ist.id
WHERE it.inventory_stock_id IS NOT NULL
AND ist.id IS NULL;
-- Expected: 0 rows

-- 2. Check for orphaned cut pieces (no valid original_stock_id)
SELECT hcp.*
FROM hdpe_cut_pieces hcp
LEFT JOIN inventory_stock ist ON hcp.original_stock_id = ist.id
WHERE hcp.deleted_at IS NULL
AND ist.id IS NULL;
-- Expected: 0 rows

-- 2b. Check cut pieces have valid created_by_transaction_id
SELECT hcp.id, hcp.created_by_transaction_id
FROM hdpe_cut_pieces hcp
LEFT JOIN inventory_transactions it ON hcp.created_by_transaction_id = it.id
WHERE hcp.created_by_transaction_id IS NOT NULL
AND it.id IS NULL;
-- Expected: 0 rows-- 3. Check weight consistency in dispatched items
SELECT d.id, d.dispatch_number,
  SUM(di.weight_kg) as dispatch_items_weight,
  SUM(di.quantity * COALESCE(di.weight_per_unit, 0)) as calculated_weight
FROM dispatches d
JOIN dispatch_items di ON d.id = di.dispatch_id
WHERE d.created_at >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY d.id, d.dispatch_number
HAVING ABS(SUM(di.weight_kg) - SUM(di.quantity * COALESCE(di.weight_per_unit, 0))) > 0.01;
-- Expected: 0 rows (or minimal floating point differences)

-- 4. Check for negative quantities (should not exist)
SELECT * FROM inventory_stock
WHERE quantity < 0 OR weight_kg < 0;
-- Expected: 0 rows

-- 5. Check reverted dispatches have reverted_by and reverted_at set
SELECT d.id, d.dispatch_number, d.reverted_at, d.reverted_by, d.status
FROM dispatches d
WHERE d.reverted_at IS NOT NULL
AND (d.reverted_by IS NULL OR d.status != 'REVERTED');
-- Expected: 0 rows (all reverted dispatches should have reverted_by and status='REVERTED')

-- 5b. Check inventory_transactions have reverted_at/reverted_by when dispatch is reverted
SELECT it.id, it.dispatch_id, d.dispatch_number
FROM inventory_transactions it
JOIN dispatches d ON it.dispatch_id = d.id
WHERE d.reverted_at IS NOT NULL
AND it.reverted_at IS NULL;
-- Expected: Should show transactions that need revert tracking
```

**Verify P&C:**
- ✅ All queries return expected results (usually 0 rows for error checks)
- ✅ No data inconsistencies found
- ✅ All foreign keys valid
- ✅ No orphaned records

---

### Phase 12: Rollback Test

**Purpose:** Verify snapshot rollback functionality

#### Test Case 12.1: Rollback to Pre-Test State
1. Navigate to **Admin → Version Control**
2. Find the snapshot created in Pre-Test Setup
3. Click **Actions → Rollback**
4. **IMPORTANT:** Read warning carefully
5. Type confirmation and click **Confirm Rollback**

**Verify P&C:**
- ✅ Rollback completes successfully
- ✅ **Test Batches Removed:** All TEST-* batches gone
- ✅ **Stock Restored:** Inventory matches pre-test state
- ✅ **Dispatches Removed:** All test dispatches removed
- ✅ **Returns Removed:** All test returns removed
- ✅ **Scrap Records Removed:** All test scrap records removed
- ✅ Navigate to **Admin → Rollback History**
- ✅ Rollback operation logged with:
  - Snapshot name
  - Rollback timestamp
  - User who performed rollback
  - Tables affected

---

## Final Verification Checklist

After completing all test phases, verify:

### ✅ Functional Verification
- [ ] Can create batches (rolls and bundles)
- [ ] Can dispatch full items and cut/spare pieces
- [ ] Can cut rolls into pieces
- [ ] Can split bundles into spare pieces
- [ ] Can combine spare pieces into bundles
- [ ] Can process returns (full and partial)
- [ ] Can revert dispatches
- [ ] Can create scrap records
- [ ] All operations update stock quantities correctly
- [ ] All weight calculations are accurate

### ✅ Data Integrity
- [ ] No duplicate items in stock (check inventory_stock.id uniqueness)
- [ ] No negative quantities or weights (quantity > 0, weight_kg > 0)
- [ ] Total weight preserved across operations
- [ ] All transactions recorded in inventory_transactions
- [ ] Dispatch items match dispatch totals (sum dispatch_items.weight_kg)
- [ ] Return items match return totals (sum return_items.weight_kg)
- [ ] Scrap items properly excluded from available stock (deleted_at IS NULL filter)
- [ ] Soft deletes working (deleted_at timestamps set, not hard deletes)
- [ ] Version numbers incrementing (check hdpe_cut_pieces.version and sprinkler_spare_pieces.version)
- [ ] Transaction IDs linking correctly (created_by_transaction_id, deleted_by_transaction_id)
- [ ] Stock types valid (FULL_ROLL, CUT_ROLL, BUNDLE, SPARE from schema ENUM)

### ✅ UI/UX Verification
- [ ] All forms validate input correctly
- [ ] Success/error messages display appropriately
- [ ] Stock filters and search work correctly
- [ ] Reports generate without errors
- [ ] Real-time stock updates visible
- [ ] No console errors in browser developer tools

### ✅ Performance
- [ ] Pages load within 2-3 seconds
- [ ] Large stock lists paginate correctly
- [ ] Search/filter responds quickly
- [ ] Reports generate in reasonable time

### ✅ Security
- [ ] Only admin users can access admin functions
- [ ] Users cannot access other users' data (if multi-tenant)
- [ ] Audit logs capture all important operations
- [ ] No sensitive data exposed in API responses

---

## Test Data Cleanup

After testing, you have two options:

### Option 1: Keep Test Data
If you want to keep the test data for reference:
1. Create a snapshot named "Post-Testing State"
2. Document test batch numbers for future reference

### Option 2: Clean Rollback
If you want to remove all test data:
1. Use the rollback function (Phase 12) to restore pre-test snapshot
2. Or manually delete test batches from Admin panel

---

## Troubleshooting Common Issues

### Issue: Stock count doesn't match after operation
**Fix:**
1. Check inventory_transactions table for the item
2. Verify transaction_type is correct
3. Check for duplicate transactions
4. Look for failed transaction with no rollback

### Issue: Dispatch shows items but stock not reduced
**Fix:**
1. Check dispatch status (should be 'dispatched')
2. Verify dispatch_items table has correct inventory_stock_id
3. Check if transaction was created in inventory_transactions
4. Look for errors in backend logs

### Issue: Revert doesn't restore stock
**Fix:**
1. Verify original dispatch has reverted_at timestamp
2. Check inventory_transactions for 'dispatch_revert' entry
3. Ensure revert transaction has correct positive quantity
4. Check backend logs for any constraint violations

### Issue: Weight calculations incorrect
**Fix:**
1. Verify weight_per_unit in product_variants
2. Check if weight_kg is manually entered vs calculated
3. Look for floating point rounding issues
4. Verify unit conversions (kg vs grams)

---

## Sign-off

After completing this workflow:

**Tester:** ___________________
**Date:** ___________________
**Result:** ✅ PASSED / ❌ FAILED
**Notes:**
_________________________________________
_________________________________________

**Issues Found:**
_________________________________________
_________________________________________

**Production Ready:** ✅ YES / ❌ NO (if no, specify blockers)
