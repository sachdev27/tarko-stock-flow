# Dispatch Double-Decrement Bug Fix

## Date
November 23, 2025

## Problem
Dispatch was failing with check constraint violation:
```
psycopg2.errors.CheckViolation: new row for relation "inventory_stock" violates check constraint "inventory_stock_quantity_check"
DETAIL: Failing row contains (..., -1, ...)
```

The `inventory_stock.quantity` was becoming negative (-1) during dispatch operations.

## Root Cause
**Double-decrement bug**: The dispatch code was manually updating `inventory_stock.quantity` AND the `auto_update_stock_quantity` trigger was also updating it, causing the quantity to be decremented twice.

### How It Happened
1. Dispatch updates piece status: `UPDATE hdpe_cut_pieces SET status = 'DISPATCHED'`
2. **Trigger fires**: `auto_update_stock_quantity` recalculates quantity = COUNT of IN_STOCK pieces
3. **Manual update**: Dispatch code does `quantity = quantity - 1`
4. **Result**: Quantity decremented TWICE, goes negative

### Example Flow
- Start: `inventory_stock.quantity = 1` (one cut piece IN_STOCK)
- Dispatch piece: `UPDATE hdpe_cut_pieces SET status = 'DISPATCHED'`
- Trigger fires: Sets `inventory_stock.quantity = 0` (COUNT of IN_STOCK pieces)
- Manual update: Sets `inventory_stock.quantity = 0 - 1 = -1` ❌
- Check constraint violation!

## Solution
**Remove manual quantity updates for piece-based stock types.** Let the trigger handle quantity calculations automatically.

### Changes Made

#### 1. CUT_PIECE Dispatch (lines ~1308-1328)
**Before:**
```python
dispatch_item_id = cursor.fetchone()['id']

# Reduce inventory_stock quantity
cursor.execute("""
    UPDATE inventory_stock
    SET quantity = quantity - %s,
        status = CASE
            WHEN quantity - %s <= 0 THEN 'SOLD_OUT'
            ELSE 'IN_STOCK'
        END,
        updated_at = NOW()
    WHERE id = %s
""", (quantity, quantity, stock_id))
```

**After:**
```python
dispatch_item_id = cursor.fetchone()['id']

# NOTE: inventory_stock quantity is automatically updated by auto_update_stock_quantity trigger
# when hdpe_cut_pieces status changes. No manual update needed.

# Update status based on remaining pieces
cursor.execute("""
    SELECT COUNT(*) as remaining
    FROM hdpe_cut_pieces
    WHERE stock_id = %s AND status = 'IN_STOCK' AND deleted_at IS NULL
""", (stock_id,))
remaining = cursor.fetchone()['remaining']

cursor.execute("""
    UPDATE inventory_stock
    SET status = CASE WHEN %s <= 0 THEN 'SOLD_OUT' ELSE 'IN_STOCK' END,
        updated_at = NOW()
    WHERE id = %s
""", (remaining, stock_id))
```

**Key Changes:**
- ❌ Removed: `quantity = quantity - %s`
- ✅ Added: Only update status based on actual remaining pieces
- ✅ Added: Explicit note about trigger handling quantity

#### 2. SPARE_PIECES Dispatch (lines ~1439-1452)
**Before:**
```python
# Update inventory_stock status based on remaining pieces
cursor.execute("""
    UPDATE inventory_stock
    SET status = CASE
            WHEN %s <= 0 THEN 'SOLD_OUT'
            ELSE 'IN_STOCK'
        END,
        updated_at = NOW()
    WHERE id = %s
""", (remaining, stock_id))
```

**After:**
```python
# NOTE: inventory_stock quantity is automatically updated by auto_update_stock_quantity trigger
# when sprinkler_spare_pieces status/piece_count changes. Only update status here.
cursor.execute("""
    UPDATE inventory_stock
    SET status = CASE
            WHEN %s <= 0 THEN 'SOLD_OUT'
            ELSE 'IN_STOCK'
        END,
        updated_at = NOW()
    WHERE id = %s
""", (remaining, stock_id))
```

**Key Changes:**
- ✅ Added: Explicit note that trigger handles quantity
- ✅ Clarified: This code only updates status

#### 3. FULL_ROLL Dispatch (lines ~1542-1575)
**Before:**
```python
dispatch_item_id = cursor.fetchone()['id']

# Reduce inventory_stock quantity
cursor.execute("""
    UPDATE inventory_stock
    SET quantity = quantity - %s,
        status = CASE
            WHEN quantity - %s <= 0 THEN 'SOLD_OUT'
            ELSE 'IN_STOCK'
        END,
        updated_at = NOW()
    WHERE id = %s
""", (quantity, quantity, stock_id))
```

**After:**
```python
dispatch_item_id = cursor.fetchone()['id']

# Update inventory_stock quantity and status
if stock_type == 'CUT_ROLL':
    # NOTE: For CUT_ROLL, quantity is automatically updated by auto_update_stock_quantity trigger
    # when hdpe_cut_pieces status changes. Only update status here.
    cursor.execute("""
        SELECT COUNT(*) as remaining
        FROM hdpe_cut_pieces
        WHERE stock_id = %s AND status = 'IN_STOCK' AND deleted_at IS NULL
    """, (stock_id,))
    remaining = cursor.fetchone()['remaining']

    cursor.execute("""
        UPDATE inventory_stock
        SET status = CASE WHEN %s <= 0 THEN 'SOLD_OUT' ELSE 'IN_STOCK' END,
            updated_at = NOW()
        WHERE id = %s
    """, (remaining, stock_id))
else:
    # For true FULL_ROLL (not from cut pieces), manually update quantity
    cursor.execute("""
        UPDATE inventory_stock
        SET quantity = quantity - %s,
            status = CASE
                WHEN quantity - %s <= 0 THEN 'SOLD_OUT'
                ELSE 'IN_STOCK'
            END,
            updated_at = NOW()
        WHERE id = %s
    """, (quantity, quantity, stock_id))
```

**Key Changes:**
- ✅ Added: Check `stock_type == 'CUT_ROLL'`
- ✅ For CUT_ROLL: Let trigger handle quantity (pieces exist)
- ✅ For true FULL_ROLL: Keep manual update (no pieces table)

## Architecture Principle

### Piece-Based Stock Types (CUT_ROLL, SPARE)
- Quantity is **derived** from piece tables via trigger
- Dispatch code only updates piece status
- Trigger automatically recalculates quantity = COUNT(IN_STOCK pieces)
- **Never manually update quantity**

### Simple Stock Types (BUNDLE, true FULL_ROLL)
- Quantity is **direct/manual**
- No piece tables exist
- Dispatch code must manually decrement quantity
- **Always manually update quantity**

## Testing
After applying this fix:
1. ✅ Create return with cut rolls
2. ✅ Create production batch for same variant
3. ✅ Dispatch cut rolls → Should work without check constraint violation
4. ✅ Verify `inventory_stock.quantity` remains >= 0
5. ✅ Verify quantity matches COUNT of IN_STOCK pieces

## Related Issues
This is the same architectural pattern as the spare pieces one-record-per-piece refactoring completed earlier. The key insight: **When triggers manage derived quantities, application code must not also update them manually.**

## Files Modified
- `/backend/routes/dispatch_routes.py` (lines 1308-1328, 1439-1452, 1542-1575)

## Documentation
- See `ONE_RECORD_PER_PIECE_MIGRATION.md` for related architecture changes
- See `backend/migrations/001_comprehensive_refactoring.sql` (lines 240-290) for trigger implementation
