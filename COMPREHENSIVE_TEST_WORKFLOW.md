# Comprehensive Production Test Workflow
## Complete End-to-End Testing Guide for Tarko Inventory System

**Purpose:** This document covers ALL workflows and edge cases that could break your system in production.

**Last Updated:** December 5, 2024

**Recent Fixes Applied:**
- ✅ Product parameters now sort numerically (if all numbers) or alphabetically (if text)
- ✅ CSV export added to Dispatch History, Return History, and Production History pages
- ✅ Removed "Coils" test case (only Standard Rolls and Bundles exist in frontend)
- ✅ Updated Cut Roll test case - frontend uses single cut length input (creates 2 pieces: cut + remaining)
- ✅ Fixed production history - reverted batches no longer show up (WHERE deleted_at IS NULL filter)
- ✅ Fixed spare pieces dispatch revert - now properly restocks inventory (removed conditional, added stock_id filter)
- ✅ Split Bundle Dialog redesigned - now splits entire bundle (no partial split option)
- ✅ Cut Roll Dialog - added negative number prevention and backdrop click prevention
- ✅ Combine Spares Dialog - added integer-only validation (no decimals/negatives) and backdrop click prevention
- ✅ Activity page return details - changed to "Length per piece:" for HDPE rolls (clarity)
- ✅ Cut pieces now grouped by length (matching full rolls display pattern)
- ✅ Workflow sections updated: 3.5 (recuts allowed), 6.1-6.4 (removed condition field, clarified return logic), 7.2 (removed invalid section)

---

## 🚨 Critical Pre-Test Setup

### 1. Create Database Backup
```bash
# On Raspberry Pi
docker exec tarko-postgres pg_dump -U tarko_user tarko_inventory > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Create System Snapshot
1. Navigate to **Admin → Version Control**
2. Click **Create Snapshot**
3. Name: `PRE-COMPREHENSIVE-TEST-$(date)`
4. Description: `Full backup before comprehensive testing`
5. ✅ Verify: Snapshot created with correct size

---

## Test Phase 1: Production (Batch Creation) - Full Matrix

### 1.0: Parameter Sorting Validation
**Execute:**
1. Navigate to Production → New Batch
2. Select Product Type: HDPE Pipe
3. Observe parameter dropdowns (OD, PN, PE)

**P&C:**
- ✅ OD values sorted numerically: 16, 20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500, 560, 630 (not "16, 160, 180, 20, 200...")
- ✅ PN values sorted numerically: 4, 6, 8, 10, 12.5, 16 (not "10, 12.5, 16, 4, 6, 8")
- ✅ PE values sorted numerically: 63, 80, 100 (not "100, 63, 80")
- ✅ For text parameters (Type): sorted alphabetically A-Z
- ✅ Dropdown is readable and values in logical order

### 1.1: HDPE Pipe - Standard Rolls
**Create Batch:**
- Product Type: HDPE Pipe
- Brand: Jindal
- Parameters: PE=80, PN=10, OD=32mm
- Batch: TEST-HDPE-STD-001
- Roll Config: Standard Rolls
- Roll Length: 500m
- Number of Rolls: 5
- Weight per Meter: 0.2 kg/m

**P&C:**
- ✅ 5 FULL_ROLL in inventory_stock
- ✅ Each roll: length_per_unit=500, weight_per_meter=0.2
- ✅ Total weight: 5 × (500 × 0.2) = 500 kg
- ✅ status='IN_STOCK' (uppercase)
- ✅ Parameters saved in JSONB: {"PE":"80","PN":"10","OD":"32mm"}
- ✅ inventory_transactions: type='PRODUCTION'
- ✅ Check batch_code format and uniqueness

### 1.2: HDPE Pipe - Multiple Rolls (Different Lengths)
**Create Batch:**
- Product Type: HDPE Pipe
- Brand: Jindal
- Parameters: PE=80, PN=10, OD=32mm
- Batch: TEST-HDPE-STD-002
- Roll Config: Standard Rolls
- Number of Rolls: 3
- Length per Roll: 300m
- Weight per Meter: 0.2 kg/m

**P&C:**
- ✅ 3 FULL_ROLL in inventory_stock
- ✅ Each roll: length_per_unit=300, weight_per_meter=0.2
- ✅ Total weight: 3 × (300 × 0.2) = 180 kg
- ✅ status='IN_STOCK' (uppercase)
- ✅ Parameters saved in JSONB: {"PE":"80","PN":"10","OD":"32mm"}
- ✅ Different batch code from 1.1

### 1.3: Sprinkler Pipe - Bundles
**Create Batch:**
- Product Type: Sprinkler Pipe
- Parameters: OD=16mm, PN=6, Type=Lateral
- Batch: TEST-SPR-BUNDLE-001
- Roll Config: Bundles
- Number of Bundles: 5
- Bundle Size (Pieces per Bundle): 20 pieces
- Length per Piece: 6m
- Weight per Meter: 0.33 kg/m

**P&C:**
- ✅ 5 BUNDLE in inventory_stock
- ✅ Each bundle: pieces_per_bundle=20, piece_length_meters=6
- ✅ weight_per_meter=0.33, weight_per_piece=1.98 (6×0.33)
- ✅ Total pieces: 5 × 20 = 100 pieces
- ✅ Total weight: 100 × 1.98 = 198 kg
- ✅ status='IN_STOCK'

### 1.4: Edge Case - Zero Quantity
**Try to create:**
- Number of Rolls: 0

**P&C:**
- ✅ Should fail validation
- ✅ Error message: "Quantity must be greater than 0"

### 1.5: Edge Case - Invalid Weight
**Try to create:**
- Weight per Meter: -0.5

**P&C:**
- ✅ Should fail validation
- ✅ Error: "Weight must be positive"

### 1.6: Edge Case - Duplicate Batch Code
**Try to create:**
- Use existing batch code TEST-HDPE-STD-001

**P&C:**
- ✅ Should fail with unique constraint
- ✅ Error: "Batch code already exists"

---

## Test Phase 2: Dispatch Operations - Complete Matrix

### 2.1: Dispatch Full Rolls (HDPE)
**Execute:**
1. Create Dispatch
2. Customer: Test Customer A
3. Add 2 full rolls from TEST-HDPE-STD-001
4. Complete dispatch

**P&C:**
- ✅ 2 rolls in inventory_stock: status='DISPATCHED'
- ✅ 3 rolls remain: status='IN_STOCK'
- ✅ dispatch_items: 2 entries, item_type='FULL_ROLL'
- ✅ Each dispatch_item has:
  - stock_id (references inventory_stock.id)
  - length_meters=500
  - weight_kg=100
- ✅ inventory_transactions: 2 entries, type='DISPATCH'
- ✅ Each transaction links to dispatch_id
- ✅ dispatches.status='DISPATCHED' (uppercase)
- ✅ Check vehicle, driver info saved correctly
- ✅ Dispatch date saved correctly

### 2.2: Dispatch Full Bundles (Sprinkler)
**Execute:**
- Dispatch 2 bundles from TEST-SPR-BUNDLE-001

**P&C:**
- ✅ 2 BUNDLE: status='DISPATCHED'
- ✅ 3 BUNDLE remain: status='IN_STOCK'
- ✅ dispatch_items: item_type='BUNDLE'
- ✅ pieces_per_bundle=20
- ✅ Total dispatched: 40 pieces, 79.2 kg

### 2.3: Dispatch Cut Pieces (HDPE) - See Phase 3 First
**Prerequisites:** Must cut roll first (see 3.1)

**Execute:**
- Dispatch 1 cut piece (100m) from the 2 available pieces
- Leave the 400m remaining piece in stock

**P&C:**
- ✅ 1 piece (100m) in hdpe_cut_pieces: status='DISPATCHED'
- ✅ 1 piece (400m) remains: status='IN_STOCK'
- ✅ dispatch_items: item_type='CUT_ROLL' or 'CUT_PIECE'
- ✅ cut_piece_id references hdpe_cut_pieces.id
- ✅ Dispatched item: length_meters=100, weight_kg=20
- ✅ CUT_ROLL stock quantity updated: 2 → 1 (one piece dispatched)

### 2.4: Dispatch Spare Pieces (Sprinkler) - See Phase 4 First
**Prerequisites:** Must split bundle first (see 4.1)

**Execute:**
- Dispatch 10 spare pieces

**P&C:**
- ✅ 10 entries in sprinkler_spare_pieces: status='DISPATCHED'
- ✅ dispatch_items: item_type='SPARE_PIECES'
- ✅ spare_piece_ids array contains UUIDs
- ✅ Total: 10 pieces × 6m × 0.33 = 19.8 kg

### 2.5: Edge Case - Dispatch Already Dispatched Item
**Execute:**
- Try to dispatch same roll twice

**P&C:**
- ✅ Should fail
- ✅ Error: "Item already dispatched" or not in available list

### 2.6: Edge Case - Dispatch Without Customer
**Execute:**
- Create dispatch without selecting customer

**P&C:**
- ✅ Frontend validation: "Customer required"
- ✅ Backend validation: 400 error

### 2.7: Edge Case - Dispatch Zero Quantity
**Execute:**
- Try to add 0 items to dispatch

**P&C:**
- ✅ Should not allow
- ✅ Error: "Must select at least one item"

### 2.8: Edge Case - Partial Dispatch of Bundle
**Execute:**
- Try to dispatch 15 pieces from 20-piece bundle

**P&C:**
- ✅ System requires full bundle dispatch (not partial)
- ✅ Frontend should only allow dispatching complete bundles
- ✅ Cannot dispatch partial bundles (e.g., 15 out of 20 pieces)
- ✅ To dispatch individual pieces, must first split bundle into spare pieces (see Phase 4.1)
- ✅ Then dispatch spare pieces individually (see Phase 2.4)

---

## Test Phase 3: Cut Roll Operations

### 3.1: Cut HDPE Full Roll
**Execute:**
1. Select 1 FULL_ROLL from TEST-HDPE-STD-001 (500m, IN_STOCK)
2. Click Cut Roll
3. Enter:
   - Cut Length: 100m
4. Confirm

**P&C:**
- ✅ **Original Roll:**
  - status='SOLD_OUT' OR deleted_at set
  - NOT visible in available stock
- ✅ **New Stock Entry:**
  - stock_type='CUT_ROLL'
  - quantity=2 (1 cut piece of 100m + 1 remaining piece of 400m)
  - source_stock_id=original roll id
  - status='IN_STOCK'
- ✅ **hdpe_cut_pieces table:**
  - 2 new records created (100m cut piece + 400m remaining piece)
  - Cut piece: length_meters=100, weight_grams=20000
  - Remaining piece: length_meters=400, weight_grams=80000
  - original_stock_id=original roll id
  - stock_id=new CUT_ROLL stock id
  - created_by_transaction_id=UUID
  - version=1
  - status='IN_STOCK'
- ✅ **inventory_transactions:**
  - type='CUT_ROLL'
  - inventory_stock_id=new CUT_ROLL stock
  - quantity=2
- ✅ **Weight preserved:** 100kg total (20kg + 80kg)
- ✅ **Length preserved:** 500m total (100m + 400m)

**Note:** Frontend allows cutting ONE length at a time. To get 4 equal pieces of 100m each, you would need to cut 100m four times from the original 500m roll.

### 3.2: Cut Already Dispatched Roll
**Execute:**
- Try to cut a DISPATCHED roll

**P&C:**
- ✅ Should fail
- ✅ Error: "Cannot cut dispatched roll"
- ✅ Roll not in selectable list

### 3.3: Edge Case - Cut with Negative Length
**Execute:**
- Enter length per piece: -50m

**P&C:**
- ✅ Validation error: "Length must be positive"

### 3.4: Edge Case - Cut Exceeds Original Length
**Execute:**
- Cut 5 pieces × 150m = 750m from 500m roll

**P&C:**
- ✅ Should fail
- ✅ Error: "Total length (750m) exceeds roll length (500m)"

### 3.5: Cut Already Cut Roll (Recut)
**Execute:**
- Select a CUT_ROLL piece (e.g., 400m remaining piece)
- Click Cut Roll
- Enter cut length: 100m
- Confirm

**P&C:**
- ✅ System allows recutting CUT_ROLL pieces
- ✅ Original 400m piece: status='SOLD_OUT' or deleted_at set
- ✅ New pieces created: 100m (cut) + 300m (remaining)
- ✅ Both pieces added to hdpe_cut_pieces table
- ✅ CUT_ROLL stock quantity updated
- ✅ Cascading cuts tracked through original_stock_id
- ✅ Version numbers increment for each cut operation

---

## Test Phase 4: Split Bundle Operations

### 4.1: Split Sprinkler Bundle
**Execute:**
1. Select 1 BUNDLE from TEST-SPR-BUNDLE-001 (20 pieces)
2. Click Split Bundle
3. Confirm

**P&C:**
- ✅ **Original Bundle:**
  - status='SOLD_OUT' OR deleted_at set
- ✅ **New Stock Entry:**
  - stock_type='SPARE'
  - quantity=20 (piece count)
  - source_stock_id=original bundle id
  - status='IN_STOCK'
- ✅ **sprinkler_spare_pieces table:**
  - 20 new records (ONE per piece)
  - Each:
    - piece_count=1
    - piece_length_meters=6
    - weight_grams=1980 (6×0.33×1000)
    - original_stock_id=bundle id
    - stock_id=new SPARE stock id
    - created_by_transaction_id=UUID
    - version=1
    - status='IN_STOCK'
    - reserved_by_transaction_id=NULL
    - reserved_at=NULL
- ✅ **inventory_transactions:**
  - type='SPLIT_BUNDLE'
  - quantity=20
- ✅ **Weight Check:** 20 × 1.98kg = 39.6kg matches bundle

### 4.2: Split Already Dispatched Bundle
**Execute:**
- Try to split DISPATCHED bundle

**P&C:**
- ✅ Should fail
- ✅ Error: "Cannot split dispatched bundle"

### 4.3: Edge Case - Split Empty Bundle
**Execute:**
- If bundle has 0 pieces

**P&C:**
- ✅ Should fail or not appear in split list

---

## Test Phase 5: Combine Spares Operations

### 5.1: Combine Spare Pieces into Bundle
**Execute:**
1. View SPARE stock from TEST-SPR-BUNDLE-001 (should have 20 pieces after split)
2. Click Combine Spares
3. Enter: 10 pieces
4. Confirm

**P&C:**
- ✅ **sprinkler_spare_pieces table:**
  - 10 pieces: status='SOLD_OUT', deleted_at set
  - deleted_by_transaction_id=COMBINE_SPARES transaction
  - last_modified_by_transaction_id updated
  - version incremented
- ✅ **SPARE Stock:**
  - quantity reduced: 20 → 10
  - OR new stock entry created
- ✅ **New BUNDLE Created:**
  - stock_type='BUNDLE'
  - quantity=1 (one bundle)
  - pieces_per_bundle=10
  - piece_length_meters=6
  - weight_per_meter=0.33
  - weight_per_piece=1.98
  - Total weight: 19.8 kg
  - status='IN_STOCK'
  - parent_stock_id=SPARE stock id
- ✅ **inventory_transactions:**
  - type='COMBINE_SPARES'
  - quantity=10 (pieces combined)

### 5.2: Edge Case - Combine More Than Available
**Execute:**
- Try to combine 25 pieces when only 10 remain

**P&C:**
- ✅ Validation error: "Not enough spare pieces"

### 5.3: Edge Case - Combine Zero Pieces
**Execute:**
- Enter 0 pieces to combine

**P&C:**
- ✅ Error: "Must combine at least 1 piece"

### 5.4: Combine Already Reserved Pieces
**Execute:**
- If pieces are reserved (reserved_by_transaction_id NOT NULL)

**P&C:**
- ✅ Should exclude reserved pieces
- ✅ Or error: "Cannot combine reserved pieces"

---

## Test Phase 6: Return Operations

### 6.1: Full Return
**Execute:**
1. Create Return
2. Select customer from Phase 2.1
3. Select dispatch (2 HDPE rolls)
4. Return Quantity: 2 rolls (full)
5. Complete return

**P&C:**
- ✅ **returns table:**
  - customer_id matches
  - return_date saved
  - status='RECEIVED' or 'RESTOCKED'
- ✅ **return_items table:**
  - 2 entries
  - Each: dispatch_item_id links to dispatch_items
  - quantity_returned=1
- ✅ **return_rolls table (if HDPE):**
  - 2 entries
  - length_meters=500
  - weight_kg=100
- ✅ **inventory_stock:**
  - 2 rolls: status changed 'DISPATCHED' → 'IN_STOCK'
  - OR new stock entries created (depends on design)
- ✅ **inventory_transactions:**
  - type='RETURN'
  - 2 transactions created
- ✅ **Weight restored:** Total +200kg

### 6.2: Edge Case - Return More Than Dispatched
**Execute:**
- Try to return 3 rolls when only 2 dispatched to this customer

**P&C:**
- ✅ System allows returns beyond dispatched quantity (not a fresh company)
- ✅ User can manually add return items even if no matching dispatch exists
- ✅ Useful for correcting historical data or handling pre-system dispatches
- ✅ Return creates new stock entries in inventory

### 6.3: Edge Case - Return from Different Customer
**Execute:**
- Select dispatch from Customer A
- Try to return to Customer B

**P&C:**
- ✅ Should fail
- ✅ Error: "Dispatch does not belong to this customer"

### 6.4: Edge Case - Return Already Returned Items
**Execute:**
- Try to return same dispatch twice

**P&C:**
- ✅ Should fail or show "Already returned"
- ✅ Check return_items already exists for dispatch_item_id

---

## Test Phase 7: Revert Dispatch Operations

### 7.1: Revert Recent Dispatch
**Execute:**
1. Navigate to Dispatch History
2. Find dispatch from Phase 2.1 (if not yet returned)
3. Click Revert Dispatch
4. Enter reason: "Wrong customer"
5. Confirm

**P&C:**
- ✅ **dispatches table:**
  - status='REVERTED' (uppercase)
  - reverted_at=timestamp
  - reverted_by=user UUID
  - revert_reason="Wrong customer"
- ✅ **dispatch_items:**
  - Still exist (soft delete concept)
  - Linked dispatch status=REVERTED
- ✅ **inventory_stock:**
  - Items status: 'DISPATCHED' → 'IN_STOCK'
  - deleted_at reset to NULL if was set
- ✅ **inventory_transactions:**
  - Original DISPATCH transactions visible
  - Each has: reverted_at timestamp, reverted_by UUID
  - Transactions linked via dispatch_id
- ✅ **Stock available:** Items reappear in available stock
- ✅ **Reports:** Dispatch shown as reverted in history

### 7.2: Edge Case - Revert Already Reverted
**Execute:**
- Try to revert same dispatch twice

**P&C:**
- ✅ Should fail
- ✅ Error: "Dispatch already reverted"
- ✅ Revert button disabled for REVERTED dispatches

### 7.4: Revert Cut Pieces Dispatch
**Execute:**
- Revert dispatch containing cut pieces

**P&C:**
- ✅ Cut pieces in hdpe_cut_pieces: status='DISPATCHED' → 'IN_STOCK'
- ✅ CUT_ROLL stock quantity restored
- ✅ Pieces available for re-dispatch

### 7.5: Revert Spare Pieces Dispatch
**Execute:**
- Revert dispatch containing spare pieces

**P&C:**
- ✅ Spare pieces: status='DISPATCHED' → 'IN_STOCK'
- ✅ SPARE stock quantity restored

---

## Test Phase 8: Scrap Operations

### 8.1: Scrap Full Roll - Damaged
**Execute:**
1. Navigate to Scrap
2. Create Scrap
3. Type: Damaged
4. Reason: "Manufacturing defect"
5. Add 1 IN_STOCK roll from TEST-HDPE-STD-001
6. Complete scrap

**P&C:**
- ✅ **scraps table:**
  - scrap_type='Damaged'
  - reason="Manufacturing defect"
  - status='SCRAPPED'
  - scrap_date saved
- ✅ **scrap_items table:**
  - 1 entry
  - inventory_stock_id links to roll
  - stock_type='FULL_ROLL'
  - quantity=1
  - weight_kg=100
  - length_meters=500
- ✅ **inventory_stock:**
  - Roll: status='SCRAPPED' OR deleted_at set
  - Excluded from available stock (WHERE deleted_at IS NULL)
- ✅ **inventory_transactions:**
  - type='DAMAGE' OR 'SCRAP'
  - Negative quantity or marked as scrap
- ✅ **Stock count:** Available rolls reduced

### 8.2: Scrap Cut Pieces
**Execute:**
- Scrap 2 cut pieces

**P&C:**
- ✅ **scrap_pieces table:**
  - 2 entries
  - cut_piece_id references hdpe_cut_pieces.id
- ✅ **hdpe_cut_pieces:**
  - 2 pieces: status='SCRAPPED' or deleted_at set
- ✅ **CUT_ROLL stock:** quantity reduced by 2

### 8.3: Scrap Spare Pieces
**Execute:**
- Scrap 5 spare pieces

**P&C:**
- ✅ **scrap_pieces table:**
  - 5 entries, spare_piece_id set
- ✅ **sprinkler_spare_pieces:**
  - 5 pieces scrapped
- ✅ **SPARE stock:** quantity reduced

### 8.4: Edge Case - Scrap Dispatched Item
**Execute:**
- Try to scrap DISPATCHED item

**P&C:**
- ✅ Should fail
- ✅ Error: "Cannot scrap dispatched items"
- ✅ Not in selectable list

### 8.5: Edge Case - Scrap Already Scrapped
**Execute:**
- Try to scrap same item twice

**P&C:**
- ✅ Should not appear in list
- ✅ Filtered by deleted_at IS NULL

### 8.6: Scrap Returned Damaged Items
**Execute:**
1. Return items as damaged (Phase 6.3)
2. Scrap those damaged items

**P&C:**
- ✅ Should work smoothly
- ✅ Links return → scrap

### 8.7: Revert Scrap
**Execute:**
1. Find scrapped item in scrap history
2. Click Revert Scrap
3. Reason: "Incorrectly scrapped"

**P&C:**
- ✅ **scraps table:** status='REVERTED' or reverted_at set
- ✅ **inventory_stock:** status='SCRAPPED' → 'IN_STOCK'
- ✅ **Item available:** Reappears in stock

---

## Test Phase 9: Complex Multi-Step Workflows

### 9.1: Full Lifecycle - HDPE Roll
**Execute in order:**
1. Create batch: 10 rolls (TEST-LIFECYCLE-001)
2. Dispatch: 5 rolls to Customer A
3. Cut: 2 of remaining 5 rolls (4 pieces each)
4. Dispatch: 4 cut pieces to Customer B
5. Return: Customer A returns 2 rolls (1 good, 1 damaged)
6. Scrap: The 1 damaged roll
7. Revert: Customer B dispatch
8. Re-dispatch: 4 cut pieces to correct Customer C
9. Combine: Can't combine HDPE (N/A)
10. Final check

**P&C After Each Step:**
1. ✅ After Create: 10 FULL_ROLL, 5000m, 1000kg
2. ✅ After Dispatch 1: 5 IN_STOCK, 5 DISPATCHED
3. ✅ After Cut: 3 FULL_ROLL + 2 CUT_ROLL (8 pieces total)
4. ✅ After Dispatch 2: 4 cut pieces DISPATCHED
5. ✅ After Return: 2 rolls back (1 good IN_STOCK, 1 damaged)
6. ✅ After Scrap: 1 roll SCRAPPED
7. ✅ After Revert: 4 cut pieces IN_STOCK again
8. ✅ After Re-dispatch: 4 cut pieces to Customer C
9. ✅ Final State:
   - 3 FULL_ROLL IN_STOCK (1500m, 300kg)
   - 1 FULL_ROLL IN_STOCK (returned good, 500m, 100kg)
   - 4 cut pieces IN_STOCK from 2nd roll (400m, 80kg)
   - 5 FULL_ROLL DISPATCHED to Customer A (2 returned, so 3 net)
   - 4 cut pieces DISPATCHED to Customer C
   - 1 FULL_ROLL SCRAPPED
   - **Total Check:** 10 rolls = 4 IN_STOCK + 3 DISPATCHED + 1 SCRAPPED + 2 CUT (8 pieces: 4 IN_STOCK + 4 DISPATCHED)

### 9.2: Full Lifecycle - Sprinkler Bundles
**Execute in order:**
1. Create: 10 bundles (20 pcs/bundle = 200 pieces)
2. Dispatch: 3 bundles (60 pieces)
3. Split: 2 bundles → 40 spare pieces
4. Dispatch: 20 spare pieces
5. Return: 1 bundle (20 pieces)
6. Combine: 10 spare pieces → 1 bundle
7. Scrap: 1 bundle
8. Final check

**P&C:**
1. ✅ 10 BUNDLE, 200 pieces
2. ✅ 7 BUNDLE IN_STOCK, 3 DISPATCHED
3. ✅ 5 BUNDLE + 40 SPARE pieces
4. ✅ 5 BUNDLE + 20 SPARE (20 DISPATCHED)
5. ✅ 6 BUNDLE + 20 SPARE (1 returned)
6. ✅ 7 BUNDLE + 10 SPARE (10 combined)
7. ✅ 6 BUNDLE + 10 SPARE (1 scrapped)
8. ✅ Final:
   - 6 BUNDLE IN_STOCK = 120 pieces
   - 10 SPARE IN_STOCK = 10 pieces
   - 2 BUNDLE DISPATCHED = 40 pieces (3 - 1 returned)
   - 20 SPARE DISPATCHED = 20 pieces
   - 1 BUNDLE SCRAPPED = 20 pieces
   - **Total:** 200 pieces = 130 IN_STOCK + 60 DISPATCHED + 20 SCRAPPED ✅

---

## Test Phase 10: Database Integrity Checks

### 10.1: Foreign Key Integrity
```sql
-- Check orphaned cut pieces
SELECT COUNT(*) FROM hdpe_cut_pieces hcp
LEFT JOIN inventory_stock ist ON hcp.original_stock_id = ist.id
WHERE hcp.deleted_at IS NULL AND ist.id IS NULL;
-- Expected: 0

-- Check orphaned spare pieces
SELECT COUNT(*) FROM sprinkler_spare_pieces ssp
LEFT JOIN inventory_stock ist ON ssp.original_stock_id = ist.id
WHERE ssp.deleted_at IS NULL AND ist.id IS NULL;
-- Expected: 0

-- Check orphaned dispatch items
SELECT COUNT(*) FROM dispatch_items di
LEFT JOIN inventory_stock ist ON di.stock_id = ist.id
WHERE ist.id IS NULL;
-- Expected: 0 (or acceptable if stock soft-deleted)

-- Check orphaned transactions
SELECT COUNT(*) FROM inventory_transactions it
LEFT JOIN inventory_stock ist ON it.inventory_stock_id = ist.id
WHERE it.inventory_stock_id IS NOT NULL AND ist.id IS NULL;
-- Expected: 0
```

**P&C:**
- ✅ All queries return 0 rows (no orphans)

### 10.2: Status Consistency
```sql
-- Check for invalid statuses
SELECT stock_type, status, COUNT(*)
FROM inventory_stock
WHERE deleted_at IS NULL
GROUP BY stock_type, status;
-- Verify all statuses are from enum: IN_STOCK, DISPATCHED, SCRAPPED, etc.

-- Check dispatched items match dispatch status
SELECT d.status, ist.status, COUNT(*)
FROM dispatches d
JOIN dispatch_items di ON d.id = di.dispatch_id
JOIN inventory_stock ist ON di.stock_id = ist.id
WHERE d.status != 'REVERTED'
GROUP BY d.status, ist.status;
-- Should see: DISPATCHED dispatches have DISPATCHED stock
```

**P&C:**
- ✅ No invalid enum values
- ✅ Dispatch status matches stock status

### 10.3: Quantity Consistency
```sql
-- Check negative quantities
SELECT * FROM inventory_stock
WHERE quantity < 0 OR weight_kg < 0 OR length_per_unit < 0;
-- Expected: 0 rows

-- Check cut pieces quantity vs hdpe_cut_pieces count
SELECT ist.id, ist.quantity, COUNT(hcp.id) as cut_count
FROM inventory_stock ist
LEFT JOIN hdpe_cut_pieces hcp ON ist.id = hcp.stock_id AND hcp.deleted_at IS NULL
WHERE ist.stock_type = 'CUT_ROLL' AND ist.deleted_at IS NULL
GROUP BY ist.id, ist.quantity
HAVING ist.quantity != COUNT(hcp.id);
-- Expected: 0 rows (quantity matches piece count)

-- Check spare pieces quantity vs sprinkler_spare_pieces count
SELECT ist.id, ist.quantity, COUNT(ssp.id) as spare_count
FROM inventory_stock ist
LEFT JOIN sprinkler_spare_pieces ssp ON ist.id = ssp.stock_id AND ssp.deleted_at IS NULL
WHERE ist.stock_type = 'SPARE' AND ist.deleted_at IS NULL
GROUP BY ist.id, ist.quantity
HAVING ist.quantity != COUNT(ssp.id);
-- Expected: 0 rows
```

**P&C:**
- ✅ All quantities ≥ 0
- ✅ Stock quantity matches piece counts

### 10.4: Weight Consistency
```sql
-- Check dispatch weight matches sum of items
SELECT d.id, d.dispatch_number,
  SUM(di.weight_kg) as items_total,
  (SELECT SUM(weight_kg) FROM dispatch_items WHERE dispatch_id = d.id) as check_sum
FROM dispatches d
JOIN dispatch_items di ON d.id = di.dispatch_id
WHERE d.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY d.id, d.dispatch_number
HAVING ABS(SUM(di.weight_kg) - check_sum) > 0.01;
-- Expected: 0 rows (no mismatches)
```

**P&C:**
- ✅ Weights match within floating point tolerance

### 10.5: Transaction Audit
```sql
-- Check transaction types distribution
SELECT transaction_type, COUNT(*), SUM(quantity)
FROM inventory_transactions
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY transaction_type
ORDER BY COUNT(*) DESC;
-- Review all types present

-- Check reverted transactions
SELECT COUNT(*)
FROM inventory_transactions it
JOIN dispatches d ON it.dispatch_id = d.id
WHERE d.reverted_at IS NOT NULL AND it.reverted_at IS NULL;
-- Expected: 0 (all dispatch transactions should have reverted_at when dispatch is reverted)
```

**P&C:**
- ✅ All transaction types valid from ENUM
- ✅ Reverted dispatches have reverted_at on transactions

---

## Test Phase 11: Edge Cases & Error Handling

### 11.1: Concurrent Operations
**Execute (requires 2 users):**
1. User A starts cutting roll X
2. User B tries to dispatch same roll X before A completes
3. Both click save simultaneously

**P&C:**
- ✅ One succeeds, one fails
- ✅ Error: "Item no longer available" or "Status changed"
- ✅ Database constraint prevents double operation

### 11.2: Network Interruption
**Execute:**
1. Start dispatch creation
2. Add items
3. Disconnect network
4. Click save
5. Reconnect

**P&C:**
- ✅ Error message: "Network error"
- ✅ No partial dispatch created
- ✅ Retry mechanism works
- ✅ No duplicate dispatches

### 11.3: Session Timeout
**Execute:**
1. Start creating dispatch
2. Wait for session to expire (leave browser 30+ min)
3. Try to save

**P&C:**
- ✅ 401 Unauthorized error
- ✅ Redirect to login
- ✅ Draft data lost (or saved locally)

### 11.4: Invalid UUIDs
**Execute:**
- Manually craft API request with invalid UUID

**P&C:**
- ✅ 400 Bad Request
- ✅ Error: "Invalid UUID format"

### 11.5: SQL Injection Attempt
**Execute:**
- Enter `'; DROP TABLE inventory_stock; --` in search field

**P&C:**
- ✅ No SQL executed
- ✅ Parameterized queries prevent injection
- ✅ Search returns 0 results or error

### 11.6: Large Batch Operations
**Execute:**
- Create batch with 1000 rolls

**P&C:**
- ✅ Completes successfully (may take time)
- ✅ OR validation limits max quantity
- ✅ No timeout errors
- ✅ All 1000 rolls created correctly

### 11.7: Special Characters
**Execute:**
- Create customer with name: `Test's "Company" & <Partners>`

**P&C:**
- ✅ Saves correctly
- ✅ Displays correctly (no XSS)
- ✅ Quotes escaped properly

---

## Test Phase 12: Performance & Load Testing

### 12.1: Large Dataset Query
**Execute:**
1. Ensure >1000 stock entries exist
2. Navigate to Inventory page
3. Apply no filters
4. Scroll through pages

**P&C:**
- ✅ Page loads < 3 seconds
- ✅ Pagination works smoothly
- ✅ No browser crashes
- ✅ Infinite scroll or proper pagination

### 12.2: Complex Filters
**Execute:**
1. Apply multiple filters: Product Type + Brand + Parameters
2. Search with batch code

**P&C:**
- ✅ Results load < 2 seconds
- ✅ Correct items shown
- ✅ No duplicate results

### 12.3: Report Generation & CSV Export
**Execute:**
1. Generate dispatch report for last 30 days
2. Export Production History to CSV
3. Export Dispatch History to CSV
4. Export Return History to CSV

**P&C:**
- ✅ Report generates < 10 seconds
- ✅ All data included
- ✅ CSV export buttons visible in Production History, Dispatch History, and Return History
- ✅ CSV files download successfully with correct data
- ✅ CSV format: headers, quoted fields, proper escaping
- ✅ Filenames include date: `production_YYYY-MM-DD.csv`, `dispatches_YYYY-MM-DD.csv`, `returns_YYYY-MM-DD.csv`
- ✅ Toast notification shows "Production/Dispatch/Return data exported to CSV"
- ✅ Production CSV includes: Batch #, Code, Date, Product, Brand, Parameters, Quantity, Weight, etc.
- ✅ Dispatch CSV includes: Dispatch #, Date, Customer, Items, Status, etc.
- ✅ Return CSV includes: Return #, Date, Customer, Items, Condition, etc.

---

## Test Phase 13: UI/UX & Accessibility

### 13.1: Keyboard Navigation
**Execute:**
- Use Tab key to navigate dispatch form

**P&C:**
- ✅ Tab order: Customer → Bill To → Transport → Vehicle → Driver Name
- ✅ Enter key submits form
- ✅ Escape closes dialogs
- ✅ Keyboard shortcuts work (Ctrl+H, Ctrl+P, etc.)

### 13.2: Mobile Responsiveness
**Execute:**
- Access system on mobile browser (Chrome/Safari)

**P&C:**
- ✅ Layout adjusts to screen
- ✅ Buttons are tappable (min 44x44px)
- ✅ Forms are usable
- ✅ Tables scroll horizontally if needed

### 13.3: Screen Reader Compatibility
**Execute:**
- Use screen reader (NVDA/JAWS/VoiceOver)

**P&C:**
- ✅ Labels read correctly
- ✅ Form fields announced
- ✅ Error messages audible

### 13.4: Dark Mode
**Execute:**
- Switch to dark mode (if supported)

**P&C:**
- ✅ All text readable
- ✅ Contrast ratio meets WCAG standards
- ✅ No white flashes on navigation

---

## Test Phase 14: Security Testing

### 14.1: Authorization
**Execute (requires multiple user roles):**
1. Login as regular user
2. Try to access admin routes

**P&C:**
- ✅ 403 Forbidden
- ✅ Cannot create product types
- ✅ Cannot manage users

### 14.2: CSRF Protection
**Execute:**
- Create fake form submission from external site

**P&C:**
- ✅ Request rejected
- ✅ CSRF token validated

### 14.3: XSS Prevention
**Execute:**
- Enter `<script>alert('XSS')</script>` in notes field

**P&C:**
- ✅ Displayed as text, not executed
- ✅ HTML entities escaped

### 14.4: Password Policy
**Execute:**
- Try to create user with weak password "123"

**P&C:**
- ✅ Validation error
- ✅ Requires min length, complexity

---

## Final Verification Checklist

### Database
- [ ] All foreign keys valid
- [ ] No negative quantities/weights
- [ ] Status values from valid ENUMs
- [ ] Soft deletes working (deleted_at)
- [ ] Transaction logs complete
- [ ] Version numbers incrementing

### Business Logic
- [ ] Cannot dispatch dispatched items
- [ ] Cannot cut/split dispatched items
- [ ] Returns restore stock correctly
- [ ] Reverts undo dispatches completely
- [ ] Scrap removes from available stock
- [ ] Weight/length calculations accurate

### UI/Frontend
- [ ] All forms validate input
- [ ] Error messages clear and helpful
- [ ] Success toasts appear
- [ ] Loading states shown
- [ ] No console errors
- [ ] Keyboard shortcuts work in production

### Reports
- [ ] Stock report accurate
- [ ] Dispatch report shows all dispatches
- [ ] Returns report correct
- [ ] Scrap report matches database
- [ ] Weight totals match

### Performance
- [ ] Pages load < 3 seconds
- [ ] No memory leaks
- [ ] Database queries optimized (use EXPLAIN ANALYZE)
- [ ] Indexes on foreign keys

---

## Post-Test Cleanup

### Option 1: Rollback to Snapshot
1. Admin → Version Control
2. Select pre-test snapshot
3. Click Rollback
4. ✅ Verify all test data removed

### Option 2: Keep Test Data
1. Create post-test snapshot
2. Document test batch numbers
3. Use as demo data

---

## Known Issues Log

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| Keyboard shortcuts don't work in prod | High | FIXED | Missing input check in useKeyboardShortcuts |
| Tab order wrong in dispatch | Medium | FIXED | Vehicle field now shows Driver - Number |
| | | | |

---

## Production Deployment Checklist

Before deploying to production:

- [ ] All tests passed
- [ ] No P1/P2 bugs open
- [ ] Database migrations tested
- [ ] Backup created
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured
- [ ] Team notified
- [ ] Maintenance window scheduled

---

## Emergency Rollback Procedure

If critical issue found in production:

1. **Immediate:**
   ```bash
   docker compose down
   docker compose up -d --scale backend=0  # Stop backend only
   ```

2. **Database Rollback:**
   ```bash
   psql -U tarko_user -d tarko_inventory < backup_YYYYMMDD_HHMMSS.sql
   ```

3. **Code Rollback:**
   ```bash
   git revert <commit-hash>
   git push origin main
   docker compose up -d --build
   ```

4. **Verify:**
   - Check health endpoint
   - Test critical workflows
   - Review logs

---

## Sign-off

**Tester:** ___________________
**Date:** ___________________
**Environment:** ☐ Dev ☐ Staging ☐ Production
**Result:** ☐ PASS ☐ FAIL

**Test Coverage:**
- Production: ☐
- Dispatch: ☐
- Return: ☐
- Revert: ☐
- Scrap: ☐
- Split: ☐
- Combine: ☐
- Cut: ☐

**Critical Issues Found:** ___ (count)
**Blocker Issues:** ___ (count)
**Production Ready:** ☐ YES ☐ NO

**Notes:**
__________________________________________________
__________________________________________________
