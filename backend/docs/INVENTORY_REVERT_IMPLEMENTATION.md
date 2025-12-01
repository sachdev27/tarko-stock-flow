# Inventory Transaction Revert - Implementation Summary

## Overview
Updated the system to mark inventory transactions (CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES) as **REVERTED** instead of creating **RETURN** transactions when they are reverted. This makes the revert behavior consistent with dispatch reverts and provides better audit trail clarity.

## Problem Statement
Previously, when reverting inventory operations:
- The system appended `[REVERTED]` to the notes field
- Sometimes created RETURN transactions (confusing with dispatch returns)
- Inconsistent with how dispatch reverts work
- Made audit trail confusing

After dispatch revert improvements, there was inconsistency:
- Dispatches: Marked as REVERTED, visible in activity feed with REVERTED badge
- Inventory ops: Hidden from feed or shown as RETURN (confusing)

## Solution Implemented

### 1. Database Changes

**Migration: `add_reverted_tracking_to_inventory_transactions.sql`**

Added tracking columns to `inventory_transactions` table:
```sql
ALTER TABLE inventory_transactions
ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reverted
ON inventory_transactions(reverted_at)
WHERE reverted_at IS NOT NULL;
```

### 2. Backend Changes

**File: `backend/routes/transaction_routes.py`**

#### Change 1: Check for Already Reverted (Lines ~845-865)
**Before:**
```python
inv_transaction = cursor.fetchone()

if not inv_transaction:
    failed_transactions.append({'id': transaction_id, 'error': 'Inventory transaction not found or already reverted'})
    continue
```

**After:**
```python
inv_transaction = cursor.fetchone()

if not inv_transaction:
    failed_transactions.append({'id': transaction_id, 'error': 'Inventory transaction not found'})
    continue

# Check if transaction is already reverted
if inv_transaction.get('reverted_at') is not None:
    failed_transactions.append({'id': transaction_id, 'error': f"Transaction {inv_transaction['transaction_type']} is already reverted"})
    continue
```

**Impact:** Prevents re-reverting already reverted transactions

#### Change 2: Mark as Reverted (Lines ~1020-1025)
**Before:**
```python
# Soft delete inventory transaction by marking in notes (no deleted_at column)
cursor.execute("""
    UPDATE inventory_transactions
    SET notes = COALESCE(notes || ' ', '') || '[REVERTED]'
    WHERE id = %s
""", (clean_id,))
```

**After:**
```python
# Mark inventory transaction as reverted using reverted_at/reverted_by columns
cursor.execute("""
    UPDATE inventory_transactions
    SET reverted_at = NOW(), reverted_by = %s
    WHERE id = %s
""", (user_id, clean_id))
```

**Impact:** Uses proper tracking columns instead of appending to notes

#### Change 3: Activity Feed Exclusion (Lines ~345)
**Before:**
```python
WHERE it.transaction_type IN ('CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES', 'RETURN')
AND (it.notes IS NULL OR it.notes NOT LIKE '%%[REVERTED]%%')
```

**After:**
```python
WHERE it.transaction_type IN ('CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES', 'RETURN')
AND it.reverted_at IS NULL
```

**Impact:** Cleaner filtering using proper column instead of string matching

#### Change 4: Add REVERTED Feed (Lines ~605-670)
**Added new UNION clause:**
```python
UNION ALL

-- Reverted inventory transactions (CUT_ROLL, SPLIT_BUNDLE, COMBINE_SPARES)
SELECT
    CONCAT('inv_', it.id) as id,
    NULL as dispatch_id,
    'REVERTED' as transaction_type,
    0 as quantity_change,
    it.created_at as transaction_date,
    NULL as invoice_no,
    CONCAT('[REVERTED] ',
        CASE it.transaction_type
            WHEN 'CUT_ROLL' THEN 'Cut Roll'
            WHEN 'SPLIT_BUNDLE' THEN 'Split Bundle'
            WHEN 'COMBINE_SPARES' THEN 'Combine Spares'
            ELSE it.transaction_type
        END,
        COALESCE(': ' || it.notes, '')) as notes,
    it.created_at,
    -- ... (full snapshot with batch and product details)
FROM inventory_transactions it
WHERE it.transaction_type IN ('CUT_ROLL', 'SPLIT_BUNDLE', 'COMBINE_SPARES')
AND it.reverted_at IS NOT NULL
```

**Impact:** Reverted inventory operations now show in activity feed with REVERTED badge

### 3. Frontend Changes

**No changes needed!** The frontend already handles REVERTED type from previous dispatch work:

- **`src/types/transaction.ts`**: Already includes `'REVERTED'` in transaction type union
- **`src/components/transactions/TransactionTypeBadge.tsx`**: Already renders REVERTED with gray strikethrough styling
- **`src/components/transactions/TransactionTable.tsx`**: Already disables checkboxes for REVERTED transactions
- **`src/components/transactions/TransactionCard.tsx`**: Already disables selection for REVERTED transactions

## Verification

Created two verification scripts in `backend/scripts/`:

### 1. `verify_inventory_revert_changes.py`
Static verification that checks:
- ✓ Database schema has reverted tracking columns
- ✓ Query for reverted inventory transactions
- ✓ Activity feed excludes reverted transactions
- ✓ No unwanted RETURN transactions exist
- ✓ No old [REVERTED] notes in database

### 2. `test_inventory_revert_flow.py`
End-to-end test that:
- Finds a test inventory transaction
- Simulates a revert operation
- Verifies reverted_at/reverted_by are set
- Checks transaction is excluded from normal feed
- Confirms transaction appears in REVERTED feed
- Ensures no RETURN transaction was created

## Benefits

### 1. Consistency
- Both dispatches and inventory operations use the same REVERTED pattern
- Single badge style across all transaction types
- Unified user experience

### 2. Clarity
- No confusion between dispatch RETURN and inventory operation revert
- Clear visual indicator (gray strikethrough badge) for reverted items
- Better audit trail

### 3. Data Integrity
- Proper tracking columns with foreign key to users
- Indexed for performance
- Cannot accidentally revert twice
- Maintains complete transaction history

### 4. Audit Trail
- Track who reverted the transaction (`reverted_by`)
- Track when it was reverted (`reverted_at`)
- Original transaction data preserved
- All operations visible in activity feed with proper context

## User Experience

### Before
- Cut roll → CUT_ROLL (green badge)
- Revert cut roll → Disappears or shows as RETURN (confusing)

### After
- Cut roll → CUT_ROLL (green badge)
- Revert cut roll → REVERTED (gray strikethrough badge)

Same for SPLIT_BUNDLE and COMBINE_SPARES operations.

## Migration Path

For existing systems with old [REVERTED] notes:
1. Run the migration SQL to add columns
2. Optionally migrate old data:
   ```sql
   UPDATE inventory_transactions
   SET reverted_at = updated_at,
       notes = REPLACE(notes, ' [REVERTED]', '')
   WHERE notes LIKE '%[REVERTED]%'
   AND reverted_at IS NULL;
   ```

## Files Changed

1. **Database:**
   - `backend/migrations/add_reverted_tracking_to_inventory_transactions.sql` (new)

2. **Backend:**
   - `backend/routes/transaction_routes.py` (4 changes)

3. **Verification Scripts:**
   - `backend/scripts/verify_inventory_revert_changes.py` (new)
   - `backend/scripts/test_inventory_revert_flow.py` (new)

4. **Frontend:**
   - No changes needed (already compatible)

## Testing

Run verification:
```bash
./backend/venv/bin/python ./backend/scripts/verify_inventory_revert_changes.py
```

Run end-to-end test (requires existing inventory transactions):
```bash
./backend/venv/bin/python ./backend/scripts/test_inventory_revert_flow.py
```

## Conclusion

The inventory transaction revert functionality is now consistent with dispatch reverts, providing a cleaner, more intuitive user experience and better audit trail. All transaction types (dispatches and inventory operations) follow the same REVERTED pattern.
